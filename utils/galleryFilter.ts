import type { ProcessedImage } from '../App';
import { continentKeyFromLatLng } from './geoStats';

export type GalleryDim = 'all' | 'city' | 'country' | 'continent';

const CJK = /[\u4e00-\u9fff]/;

function parts(loc: string) {
  const segs = loc.split(',').map((s) => s.trim()).filter(Boolean);
  return { city: segs[0] || '', country: segs.length >= 2 ? segs[segs.length - 1] : '' };
}

export function fieldForDim(b: ProcessedImage, dim: GalleryDim): string {
  const loc = b.log?.location || '';
  const { city, country } = parts(loc);
  switch (dim) {
    case 'city':
      return city;
    case 'country':
      return country;
    case 'continent':
      return continentKeyFromLatLng(b.lat, b.lng);
    default:
      return loc;
  }
}

/** 返回排序分（越小越优先）；不匹配为 null。优先级：中文地名 > 英文地名 > 别名(moon/partner)。 */
export function rankMatch(building: ProcessedImage, q: string, dim: GalleryDim): number | null {
  const query = q.trim().toLowerCase();
  if (!query) return 0;

  const rawLoc = building.log?.location || '';
  const { city, country } = parts(rawLoc);
  const moon = (building.log?.moon || '').toLowerCase();
  const partner = (building.log?.partner || '').toLowerCase();
  const buildingName = (building.log?.buildingName || '').toLowerCase();
  const loc = rawLoc.toLowerCase();
  const continent = continentKeyFromLatLng(building.lat, building.lng).toLowerCase();

  if (dim === 'continent') {
    if (continent === query || continent.includes(query) || (query.length >= 3 && query.includes(continent))) {
      const idx = continent.indexOf(query);
      return 300 + (idx >= 0 ? idx : 0);
    }
    return null;
  }
  if (dim === 'city') {
    const c = city.toLowerCase();
    if (!c.includes(query)) return null;
    return (CJK.test(city) ? 0 : 100) + c.indexOf(query);
  }
  if (dim === 'country') {
    const c = country.toLowerCase();
    if (!c.includes(query)) return null;
    return (CJK.test(country) ? 0 : 100) + c.indexOf(query);
  }

  const candidates: { score: number }[] = [];
  if (dim === 'all') {
    if (continent.includes(query) || (query.length >= 3 && query.includes(continent))) {
      const idx = continent.indexOf(query);
      candidates.push({ score: 36 + (idx >= 0 ? idx : 0) });
    }
  }
  if (city && city.toLowerCase().includes(query)) {
    const c = city.toLowerCase();
    candidates.push({ score: (CJK.test(city) ? 0 : 50) + c.indexOf(query) });
  }
  if (country && country.toLowerCase().includes(query)) {
    const c = country.toLowerCase();
    candidates.push({ score: (CJK.test(country) ? 10 : 60) + c.indexOf(query) });
  }
  if (moon.includes(query)) {
    candidates.push({ score: 200 + moon.indexOf(query) });
  }
  if (partner.includes(query)) {
    candidates.push({ score: 210 + partner.indexOf(query) });
  }
  if (buildingName.includes(query)) {
    candidates.push({ score: 15 + buildingName.indexOf(query) });
  }
  if (loc.includes(query)) {
    candidates.push({ score: 120 + loc.indexOf(query) });
  }
  if (candidates.length === 0) return null;
  return Math.min(...candidates.map((c) => c.score));
}

export function filterBuildings(buildings: ProcessedImage[], q: string, dim: GalleryDim): ProcessedImage[] {
  const query = q.trim().toLowerCase();
  if (!query) return buildings;

  const scored = buildings
    .map((b) => ({ b, r: rankMatch(b, q, dim) }))
    .filter((x): x is { b: ProcessedImage; r: number } => x.r !== null);

  scored.sort((a, b) => a.r - b.r);
  return scored.map((x) => x.b);
}

export function suggestLabels(buildings: ProcessedImage[], q: string, dim: GalleryDim, limit = 5): string[] {
  const query = q.trim().toLowerCase();
  if (query.length < 2) return [];

  const out: string[] = [];
  const seen = new Set<string>();

  if (dim === 'all') {
    const seenCont = new Set<string>();
    for (const b of buildings) {
      if (out.length >= limit) break;
      const ck = continentKeyFromLatLng(b.lat, b.lng);
      if (seenCont.has(ck)) continue;
      seenCont.add(ck);
      const ckLow = ck.toLowerCase();
      if (!ckLow.includes(query) && !(query.length >= 3 && query.includes(ckLow))) continue;
      seen.add(ck);
      out.push(ck);
    }
  }

  const effectiveDim: GalleryDim = dim === 'all' ? 'city' : dim;
  for (const b of buildings) {
    if (out.length >= limit) break;
    const label = fieldForDim(b, effectiveDim).trim();
    if (!label) continue;
    if (!label.toLowerCase().includes(query)) continue;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }

  return out;
}
