import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import type { ProcessedImage, PhotoData, LogData } from '../types/memory';
import { normalizeLog } from '../utils/normalizeLog';
import { DEFAULT_BUILDING_STYLE, isBuildingStyleId, type BuildingStyleId } from '../prompts/buildingStyle';

export { isSupabaseConfigured };

export type BuildingRow = {
  id: string;
  user_id: string;
  lat: number;
  lng: number;
  width: number;
  height: number;
  flipped_horizontally: boolean;
  is_locked: boolean;
  building_style: string | null;
  content_bounds: { x: number; y: number; width: number; height: number };
  log: Record<string, unknown>;
  processed_image_path: string | null;
  photos: Array<{ path: string; name?: string; photo_id?: string }>;
};

const BUCKET = 'buildings';

/**
 * 从 Blob 得到可展示的 HTMLImageElement。
 * 注意：不能在上屏前 revokeObjectURL——Image 的 src 仍指向该 blob 时 revoke 会导致裂图/空白。
 */
async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  if (!blob.size) throw new Error('empty image blob');
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
  if (typeof img.decode === 'function') {
    try {
      await img.decode();
    } catch {
      /* decode 失败时仍保留 onload 后的像素，部分浏览器可忽略 */
    }
  }
  if (img.naturalWidth === 0 || img.naturalHeight === 0) {
    URL.revokeObjectURL(url);
    throw new Error('image has zero dimensions');
  }
  return img;
}

async function imageElementToPngBlob(el: HTMLImageElement): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = el.naturalWidth;
  canvas.height = el.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(el, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('toBlob failed');
  return blob;
}

/** 列出云端建筑并还原为 ProcessedImage（由调用方分配本地递增 id） */
export async function loadAllCloudBuildings(nextLocalId: () => number): Promise<ProcessedImage[]> {
  if (!supabase) return [];

  const { data: rows, error } = await supabase
    .from('buildings')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  if (!rows?.length) return [];

  const out: ProcessedImage[] = [];
  for (const raw of rows as BuildingRow[]) {
    const localId = nextLocalId();
    let processedImage: HTMLImageElement | null = null;
    if (raw.processed_image_path) {
      const { data: blob, error: dl } = await supabase.storage.from(BUCKET).download(raw.processed_image_path);
      if (dl) {
        console.warn('[cloud] processed download', raw.processed_image_path, dl.message);
      } else if (blob) {
        try {
          processedImage = await blobToImage(blob);
        } catch (e) {
          console.warn('[cloud] processed decode', raw.processed_image_path, e);
          processedImage = null;
        }
      }
    }

    const photos: PhotoData[] = [];
    for (let i = 0; i < (raw.photos?.length ?? 0); i++) {
      const meta = raw.photos[i];
      if (!meta?.path) continue;
      const { data: pb, error: pe } = await supabase.storage.from(BUCKET).download(meta.path);
      if (pe || !pb) {
        console.warn('[cloud] photo download', meta.path, pe?.message);
        continue;
      }
      if (!pb.size) continue;
      const file = new File([pb], meta.name || `photo-${i}.jpg`, { type: pb.type || 'image/jpeg' });
      const url = URL.createObjectURL(file);
      photos.push({
        file,
        url,
        photo_id:
          meta.photo_id ??
          (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `p-${localId}-${i}`),
      });
    }

    /** 抠图加载失败时，用第一张照片顶一张占位图，避免地图上裂图 */
    if (!processedImage && photos[0]) {
      try {
        processedImage = await blobToImage(photos[0].file);
      } catch {
        processedImage = null;
      }
    }

    const style: BuildingStyleId | undefined =
      raw.building_style && isBuildingStyleId(raw.building_style) ? raw.building_style : undefined;

    const log = normalizeLog({
      ...(raw.log as LogData),
      landmark_id: localId,
    });

    out.push({
      id: localId,
      cloudId: raw.id,
      processedImage,
      lat: raw.lat,
      lng: raw.lng,
      width: raw.width,
      height: raw.height,
      isGenerating: false,
      contentBounds: raw.content_bounds,
      flippedHorizontally: raw.flipped_horizontally,
      isLocked: raw.is_locked,
      buildingStyle: style ?? DEFAULT_BUILDING_STYLE,
      photos,
      log,
      sourceFile: photos[0]?.file,
    });
  }
  return out;
}

/** 生成完成后的建筑写入 Storage + buildings 表；返回 cloudId（uuid） */
export async function saveBuildingToCloud(img: ProcessedImage, userId: string): Promise<string> {
  if (!supabase) throw new Error('Supabase not configured');
  if (!img.processedImage || img.isGenerating) throw new Error('nothing to save');

  const cloudId = img.cloudId ?? crypto.randomUUID();
  const base = `${userId}/${cloudId}`;

  const procPath = `${base}/processed.png`;
  const procBlob = await imageElementToPngBlob(img.processedImage);
  const { error: upProc } = await supabase.storage.from(BUCKET).upload(procPath, procBlob, {
    upsert: true,
    contentType: 'image/png',
  });
  if (upProc) throw upProc;

  const photoMeta: Array<{ path: string; name?: string; photo_id?: string }> = [];
  for (let i = 0; i < img.photos.length; i++) {
    const p = img.photos[i];
    const ext = (p.file.name.split('.').pop() || 'jpg').slice(0, 8);
    const path = `${base}/photo_${i}.${ext}`;
    const { error: upPh } = await supabase.storage.from(BUCKET).upload(path, p.file, { upsert: true, contentType: p.file.type || 'image/jpeg' });
    if (upPh) throw upPh;
    photoMeta.push({ path, name: p.file.name, photo_id: p.photo_id });
  }

  const row = {
    id: cloudId,
    user_id: userId,
    lat: img.lat,
    lng: img.lng,
    width: img.width,
    height: img.height,
    flipped_horizontally: Boolean(img.flippedHorizontally),
    is_locked: Boolean(img.isLocked),
    building_style: img.buildingStyle ?? DEFAULT_BUILDING_STYLE,
    content_bounds: img.contentBounds,
    log: { ...img.log, landmark_id: img.id } as unknown as Record<string, unknown>,
    processed_image_path: procPath,
    photos: photoMeta,
  };

  const { error: dbErr } = await supabase.from('buildings').upsert(row, { onConflict: 'id' });
  if (dbErr) throw dbErr;

  return cloudId;
}

export async function deleteBuildingFromCloud(cloudId: string, userId: string): Promise<void> {
  if (!supabase) return;
  const prefix = `${userId}/${cloudId}`;
  const { data: list } = await supabase.storage.from(BUCKET).list(prefix);
  if (list?.length) {
    const paths = list.map((o) => `${prefix}/${o.name}`);
    await supabase.storage.from(BUCKET).remove(paths);
  }
  await supabase.from('buildings').delete().eq('id', cloudId).eq('user_id', userId);
}
