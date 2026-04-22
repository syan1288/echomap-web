import type { Intensity3D } from 'facehash';

/** Three display modes per moon string; toggle cycles 0 → 1 → 2. */
export const MOON_FACE_MODE_COUNT = 3;

/** Moon 头像统一白底（facehash 两个 color slot 均白色） */
const MOON_FACE_WHITE: [string, string] = ['#ffffff', '#ffffff'];

/** 保留：若将来需要彩色可恢复 stringHash 调色 */
export function moonFaceColors(_moon: string): [string, string] {
  return [...MOON_FACE_WHITE];
}

/**
 * Stable name for Facehash: same moon + mode → deterministic face.
 * Mode suffix keeps the three toggles visually distinct for one moon string.
 */
export function moonFaceName(moon: string, modeIndex: number): string {
  const base = moon.trim();
  if (base.length < 1 || base.length > 64) return ' ';
  return `${base}#m${modeIndex % MOON_FACE_MODE_COUNT}`;
}

export type MoonFaceMode = 'threeD' | 'flat' | 'noLetter';

export function moonFaceModeFromIndex(i: number): MoonFaceMode {
  const m = i % MOON_FACE_MODE_COUNT;
  if (m === 1) return 'flat';
  if (m === 2) return 'noLetter';
  return 'threeD';
}

export function facehashPropsForMoonMode(
  moon: string,
  modeIndex: number
): {
  name: string;
  colors: [string, string];
  variant: 'gradient' | 'solid';
  intensity3d: Intensity3D;
  showInitial: boolean;
} {
  const mode = moonFaceModeFromIndex(modeIndex);
  const colors = moonFaceColors(moon);
  const name = moonFaceName(moon, modeIndex);

  if (mode === 'threeD') {
    return {
      name,
      colors,
      variant: 'gradient',
      intensity3d: 'dramatic',
      showInitial: true,
    };
  }
  if (mode === 'flat') {
    return {
      name,
      colors,
      variant: 'solid',
      intensity3d: 'none',
      showInitial: true,
    };
  }
  return {
    name,
    colors,
    variant: 'gradient',
    intensity3d: 'medium',
    showInitial: false,
  };
}

/** Normalize persisted variant from older saves that used 0–7. */
export function normalizeAvatarVariant(v: number | undefined): number {
  return (v ?? 0) % MOON_FACE_MODE_COUNT;
}
