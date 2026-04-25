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

const STYLE_PROMPTS: Record<BuildingStyleId, string> = {
  flat:
    '针对图中主体建筑，创建一个3D等轴测视角建筑。建筑应被单独分离，无任何背景，无阴影。扁平插画风，svg（300dpi），细节清晰。',
  pixel:
    '针对图中主体建筑，创建一个3D等轴测视角建筑。建筑应被单独分离，无任何背景，无阴影，pixel art，色块32px。',
  ink:
    '针对图中主体建筑，创建一个3D 等距视角建筑。建筑应被单独分离，无任何背景，无阴影，png (8k)，ink wash，baimiao, highly detailed，vibrant but elegant colors。',
  healing:
    '针对图中主体建筑，创建一个3D等轴测视角建筑。建筑应被单独分离，无任何背景，无阴影。治愈绘本插画风，线条随性松散，marker sketch+ charcoal 质感。',
};

const ECHO_OUTPUT_GUARDRAILS = [
  '只保留建筑主体本身，四周留白。',
  '严禁出现任何底座、白色矩形托底、地台、地面切片、平台、路面、阴影或漂浮投影。',
  '输出为纯白背景（#FFFFFF），方便后续自动抠图。',
  'No cast shadows, text, or watermark.',
].join(' ');

/**
 * Vertex `systemInstruction`：基底 + 朝向多样性 + 风格 + 抠图约束。
 */
export function buildEchoImageSystemInstruction(style: BuildingStyleId = DEFAULT_BUILDING_STYLE): string {
  const sid = isBuildingStyleId(style) ? style : DEFAULT_BUILDING_STYLE;
  return [STYLE_PROMPTS[sid], ECHO_OUTPUT_GUARDRAILS].join(' ');
}
