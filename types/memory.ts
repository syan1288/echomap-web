import type { BuildingStyleId } from '../prompts/buildingStyle';

export interface LogData {
  location: string;
  /** 添加建筑时用户输入的名称（与 geocode 后的城市/地址 location 分开存） */
  buildingName?: string;
  date: string;
  partner: string;
  moon: string;
  musings: string;
  avatarVariant?: number;
  memory_id?: string;
  /** 与 ProcessedImage.id 一致，随笔与建筑绑定 */
  landmark_id?: number;
}

export interface PhotoData {
  url: string;
  file: File;
  photo_id?: string;
}

export interface ProcessedImage {
  id: number;
  /** Supabase public.buildings.id（uuid），有则更新云端，无则首次插入 */
  cloudId?: string;
  sourceFile?: File;
  sourceText?: string;
  processedImage: HTMLImageElement | null;
  showOriginal?: boolean;
  lat: number;
  lng: number;
  width: number;
  height: number;
  isGenerating: boolean;
  contentBounds: { x: number; y: number; width: number; height: number };
  flippedHorizontally?: boolean;
  isLocked?: boolean;
  photos: PhotoData[];
  log: LogData;
  /** 生成时使用的建筑风格，用于再生成时沿用 */
  buildingStyle?: BuildingStyleId;
}
