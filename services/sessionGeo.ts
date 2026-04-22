export type SessionAnchor = { lat: number; lng: number };

/** 浏览器定位失败时用 IP 兜底（无自建后端，标准化 JSON） */
export async function resolveSessionAnchor(): Promise<SessionAnchor> {
  return new Promise((resolve) => {
    const fallbackIp = async () => {
      try {
        const r = await fetch('https://ipapi.co/json/');
        const j = await r.json();
        if (typeof j.latitude === 'number' && typeof j.longitude === 'number') {
          resolve({ lat: j.latitude, lng: j.longitude });
          return;
        }
      } catch {
        /* empty */
      }
      resolve({ lat: 20, lng: 0 });
    };

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      void fallbackIp();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        void fallbackIp();
      },
      { maximumAge: 120_000, timeout: 12_000, enableHighAccuracy: false }
    );
  });
}

/** 展示用：City, Country */
export async function formatCityCountry(lat: number, lng: number, lang: string): Promise<string> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=${lang}&zoom=10`
    );
    if (!r.ok) return '';
    const data = await r.json();
    const a = data.address;
    if (!a) return data.display_name || '';
    const city = a.city || a.town || a.village || a.municipality || a.state || '';
    const country = a.country || '';
    if (city && country) return `${city}, ${country}`;
    return data.display_name || '';
  } catch {
    return '';
  }
}
