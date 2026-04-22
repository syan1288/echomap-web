/** 由经纬度粗分六大洲 + 南极，用于 Gallery 侧栏统计（与地图上建筑一一对应） */
export function continentKeyFromLatLng(lat: number, lng: number): string {
  const L = ((lng + 180) % 360) - 180;
  const φ = lat;
  if (φ < -60) return 'Antarctica';
  if (L >= -170 && L < -30 && φ > 12 && φ < 85) return 'North America';
  if (L >= -90 && L < -35 && φ <= 12 && φ > -56) return 'South America';
  if (L >= -25 && L < 40 && φ > 35 && φ < 72) return 'Europe';
  if (L >= -25 && L < 55 && φ > -38 && φ <= 35) return 'Africa';
  if (L >= 25 && L < 180 && φ > -12 && φ < 55) {
    if (L > 95 && φ < -10) return 'Oceania';
    return 'Asia';
  }
  if (L < -50 && φ > -60 && φ < 20) return 'South America';
  if (L < -110 && φ > 15) return 'North America';
  if (L >= 110 && φ < -10) return 'Oceania';
  return 'Asia';
}
