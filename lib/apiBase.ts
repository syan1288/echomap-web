/**
 * 生产环境：把 AI / geocode 部署到独立域名时设置 VITE_API_BASE_URL（无尾斜杠），
 * 例如 https://echo-api.example.com → 请求 https://echo-api.example.com/api/generate
 * 本地开发留空，继续使用 Vite 插件同源 /api/*
 */
export function apiUrl(path: '/api/generate' | '/api/geocode' | '/api/echo-health'): string {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? '';
  const base = raw.replace(/\/+$/, '');
  if (!path.startsWith('/')) throw new Error('apiUrl: path must start with /');
  return base ? `${base}${path}` : path;
}
