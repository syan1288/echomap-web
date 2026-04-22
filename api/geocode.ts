import type { VercelRequest, VercelResponse } from '@vercel/node';

function applyCors(req: VercelRequest, res: VercelResponse): void {
  const allow = process.env.ALLOW_ORIGIN?.trim() || '*';
  res.setHeader('Access-Control-Allow-Origin', allow);
  if (allow !== '*') res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function handleOptions(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method !== 'OPTIONS') return false;
  applyCors(req, res);
  res.statusCode = 204;
  res.end();
  return true;
}

function getJsonInput(req: VercelRequest): string | Record<string, unknown> | null {
  const b = req.body;
  if (b == null) return null;
  if (typeof b === 'string') return b;
  if (Buffer.isBuffer(b)) return b.toString('utf8');
  if (typeof b === 'object') return b as Record<string, unknown>;
  return null;
}

function pickBestNominatimHit(
  data: Array<{
    lat: string;
    lon: string;
    display_name: string;
    importance?: number;
    class?: string;
    type?: string;
    boundingbox?: [string, string, string, string];
  }>,
  rawQuery: string
): (typeof data)[0] | null {
  if (!data.length) return null;
  const q = rawQuery.toLowerCase();
  const tokens = q.split(/[\s,，、]+/).filter((t) => t.length >= 2);
  const scored = data.map((hit, idx) => {
    const imp = typeof hit.importance === 'number' && Number.isFinite(hit.importance) ? hit.importance : 0;
    const dn = (hit.display_name || '').toLowerCase();
    let bonus = 0;
    for (const t of tokens) {
      if (dn.includes(t)) bonus += 0.12;
    }
    if (hit.class === 'boundary' && hit.type === 'administrative') bonus += 0.04;
    if (hit.type === 'administrative' || hit.type === 'city' || hit.type === 'town') bonus += 0.02;
    return { hit, score: imp + bonus, idx };
  });
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return scored[0]?.hit ?? null;
}

async function geocodeOpenMeteo(q: string): Promise<{ lat: number; lng: number; display_name: string } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=zh&format=json`;
  const r = await fetch(url, { headers: { 'User-Agent': 'EchoMap/1.0' } });
  if (!r.ok) return null;
  const j = (await r.json()) as {
    results?: Array<{
      name?: string;
      admin1?: string;
      country?: string;
      latitude?: number;
      longitude?: number;
      population?: number;
    }>;
  };
  const list = j.results;
  if (!list?.length) return null;
  const qLow = q.toLowerCase();
  const hit =
    [...list].sort((a, b) => {
      const popA = typeof a.population === 'number' ? a.population : 0;
      const popB = typeof b.population === 'number' ? b.population : 0;
      const nameA = [a.name, a.admin1, a.country].filter(Boolean).join(', ').toLowerCase();
      const nameB = [b.name, b.admin1, b.country].filter(Boolean).join(', ').toLowerCase();
      const ma = nameA.includes(qLow) || qLow.split(/[\s,，]+/).some((t) => t.length > 1 && nameA.includes(t));
      const mb = nameB.includes(qLow) || qLow.split(/[\s,，]+/).some((t) => t.length > 1 && nameB.includes(t));
      if (ma !== mb) return ma ? -1 : 1;
      return popB - popA;
    })[0] ?? list[0];
  if (!hit || typeof hit.latitude !== 'number' || typeof hit.longitude !== 'number') return null;
  return {
    lat: hit.latitude,
    lng: hit.longitude,
    display_name: [hit.name, hit.admin1, hit.country].filter(Boolean).join(', ') || q,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleOptions(req, res)) return;
  applyCors(req, res);

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'method not allowed' }));
    return;
  }

  const input = getJsonInput(req);
  if (input === null) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'expected JSON body' }));
    return;
  }

  let body: { query?: string; centerFromBbox?: boolean };
  try {
    body = (typeof input === 'object' ? input : JSON.parse(input)) as typeof body;
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'invalid JSON' }));
    return;
  }

  const q = String(body.query || '').trim();
  const centerFromBbox = body.centerFromBbox !== false;
  if (!q) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'query required' }));
    return;
  }

  try {
    let lat: number | undefined;
    let lng: number | undefined;
    let display_name: string | undefined;

    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&limit=10`;
    const r = await fetch(url, { headers: { 'User-Agent': 'EchoMap/1.0 (vercel)' } });
    if (r.ok) {
      const data = (await r.json()) as Array<{
        lat: string;
        lon: string;
        display_name: string;
        importance?: number;
        class?: string;
        type?: string;
        boundingbox?: [string, string, string, string];
      }>;
      const hit = pickBestNominatimHit(Array.isArray(data) ? data : [], q);
      if (hit) {
        let la = parseFloat(hit.lat);
        let ln = parseFloat(hit.lon);
        if (centerFromBbox && hit.boundingbox?.length >= 4) {
          const south = parseFloat(hit.boundingbox[0]);
          const north = parseFloat(hit.boundingbox[1]);
          const west = parseFloat(hit.boundingbox[2]);
          const east = parseFloat(hit.boundingbox[3]);
          if ([south, north, west, east].every((n) => Number.isFinite(n))) {
            la = (south + north) / 2;
            ln = (west + east) / 2;
          }
        }
        lat = la;
        lng = ln;
        display_name = hit.display_name;
      }
    }

    if (lat == null || lng == null) {
      const fallback = await geocodeOpenMeteo(q);
      if (fallback) {
        lat = fallback.lat;
        lng = fallback.lng;
        display_name = fallback.display_name;
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      JSON.stringify(
        lat == null || lng == null
          ? { found: false, lat: null, lng: null, display_name: q }
          : { found: true, lat, lng, display_name: display_name || q }
      )
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: msg }));
  }
}
