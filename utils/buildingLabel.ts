import type { LogData } from '../App';

/** 添加建筑时用户输入的名称（非 reverse geocode 的城市串）。 */
export function galleryBuildingTitle(log: LogData | undefined): string {
  const name = log?.buildingName?.trim();
  if (name) return name;
  return '';
}
