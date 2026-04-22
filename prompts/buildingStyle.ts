/**
 * 建筑生成风格：与 AddBuildingModal、Vertex systemInstruction 对齐。
 */

export const BUILDING_STYLE_IDS = ['flat', 'pixel', 'ink', 'healing'] as const;
export type BuildingStyleId = (typeof BUILDING_STYLE_IDS)[number];

export const DEFAULT_BUILDING_STYLE: BuildingStyleId = 'flat';

export const BUILDING_STYLE_OPTIONS: { id: BuildingStyleId; label: string }[] = [
  { id: 'flat', label: 'Flat illustration art' },
  { id: 'pixel', label: 'Pixel art' },
  { id: 'ink', label: 'Ink painting art' },
  { id: 'healing', label: 'Healing illustration art' },
];

export function isBuildingStyleId(s: string | undefined | null): s is BuildingStyleId {
  return s != null && (BUILDING_STYLE_IDS as readonly string[]).includes(s);
}

/** 通用 system 基底（中文） */
const ECHO_SYSTEM_BASE_CN =
  '针对图中主体建筑，创建一个3D等轴测视角建筑。建筑应被单独分离，无任何背景，无阴影。';

/** 等轴测朝向可略作变化以增加地图多样性 */
const ECHO_ANGLE_VARIETY_CN =
  '可在保持单主体清晰可读前提下，轻微变化等轴测观察朝向（例如略偏左前与略偏右前交替），使地图上多个建筑不会完全同一视角。';

/** 各风格在基底上的补充说明（用户给定文案整理） */
const STYLE_FRAGMENT_CN: Record<BuildingStyleId, string> = {
  flat: '风格：扁平插画风；svg（300dpi）的视觉等价效果；细节清晰。',
  pixel: '风格：pixel art；色块约 32px 量级感。',
  ink: '风格：png (8k) 观感；ink wash；baimiao；细节丰富；色彩鲜明且雅致。',
  healing: '风格：png (300px) 观感；治愈绘本插画风；线条随性松散；marker sketch + charcoal。',
};

/** 与客户端抠白底流程兼容的技术约束（输出仍为栅格图） */
const ECHO_MATTING_AND_OUTPUT_EN = [
  'Output one square raster image (PNG-style), not actual SVG file data.',
  'Non-subject pixels must be uniform pure white (#FFFFFF) for background removal: no grey card, pedestal, road slab, or soft vignette.',
  'No cast shadows, text, or watermark.',
].join(' ');

/**
 * Vertex `systemInstruction`：基底 + 朝向多样性 + 风格 + 抠图约束。
 */
export function buildEchoImageSystemInstruction(style: BuildingStyleId = DEFAULT_BUILDING_STYLE): string {
  const sid = isBuildingStyleId(style) ? style : DEFAULT_BUILDING_STYLE;
  return [
    ECHO_SYSTEM_BASE_CN,
    ECHO_ANGLE_VARIETY_CN,
    STYLE_FRAGMENT_CN[sid],
    ECHO_MATTING_AND_OUTPUT_EN,
  ].join(' ');
}
