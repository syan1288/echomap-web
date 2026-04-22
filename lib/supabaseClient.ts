import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** trim：避免复制粘贴首尾空格；URL 只能是项目根，不要带 /rest/v1 等路径 */
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

/** 两项均在 .env 中配置时，启用云端登录与（后续）建筑同步 */
export const isSupabaseConfigured = Boolean(
  url && anonKey && url.startsWith('http') && anonKey.length > 20
);

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
