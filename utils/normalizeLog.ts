import type { LogData } from '../types/memory';

export function normalizeLog(raw: Partial<LogData> | undefined | null): LogData {
  return {
    location: raw?.location ?? '',
    buildingName: raw?.buildingName?.trim() || undefined,
    date: raw?.date ?? '',
    partner: raw?.partner ?? '',
    moon: raw?.moon ?? '',
    musings: raw?.musings ?? '',
    avatarVariant: raw?.avatarVariant ?? 0,
    memory_id: raw?.memory_id ?? undefined,
    landmark_id: typeof raw?.landmark_id === 'number' ? raw.landmark_id : undefined,
  };
}
