/**
 * Echo Map 建筑图生图：user 侧文案；system 侧见 `buildingStyle.ts` 的 buildEchoImageSystemInstruction。
 */

export { buildEchoImageSystemInstruction, DEFAULT_BUILDING_STYLE, type BuildingStyleId } from './buildingStyle.js';

function buildUserStyleReminder(style: BuildingStyleId): string {
  switch (style) {
    case 'pixel':
      return 'Style reminder: produce unmistakable pixel art with visible blocky 32px-style color cells. Avoid realistic rendering, soft gradients, photographic lighting, and smooth bridge render aesthetics.';
    case 'ink':
      return 'Style reminder: produce clear ink wash / baimiao illustration aesthetics. Avoid photorealism, architectural rendering, camera-like skies, realistic water surfaces, and soft 3D shading.';
    case 'healing':
      return 'Style reminder: produce a healing storybook illustration with loose hand-drawn lines, marker sketch, and charcoal texture. Avoid realistic rendering and avoid hard-edged CAD-like structure rendering.';
    case 'flat':
    default:
      return 'Style reminder: produce flat illustration art with clean simplified shapes and graphic detail. Avoid photorealism, realistic materials, realistic skies, and architectural rendering style.';
  }
}

export function buildInitialUserPrompt(buildingName?: string, style: BuildingStyleId = DEFAULT_BUILDING_STYLE): string {
  const trimmed = buildingName?.trim();
  const context = trimmed
    ? `The traveler labeled this building or place as: "${trimmed}". ` +
      'If this clearly refers to a famous landmark, use public-domain architectural knowledge to refine proportions, roofline, and materials while matching the uploaded photo as the primary reference. ' +
      'If the label is ambiguous or not a landmark, rely on the photo only.'
    : 'Use only the uploaded photograph as reference for the structure; do not invent unrelated buildings.';

  return [
    'Task: From the provided travel photo, create one depiction of the main building or object only, following the system style (isometric / flat / pixel / ink / healing as specified there).',
    context,
    buildUserStyleReminder(style),
    'Preserve the subject identity from the photo; do not add unrelated scenery, roads, or ground geometry.',
    'The only “floor” is pure white: do not draw asphalt, stripes, curbs, or grey bases beneath the model.',
  ].join(' ');
}

/** 编辑 / 重生成：用户已有一句自然语言修改指令 */
export function buildEditUserPrompt(
  editInstruction: string,
  buildingName?: string,
  style: BuildingStyleId = DEFAULT_BUILDING_STYLE
): string {
  const base = `${editInstruction.trim()}`;
  const extra = buildingName?.trim()
    ? ` Context label (optional): "${buildingName.trim()}".`
    : '';
  return `${base}${extra} ${buildUserStyleReminder(style)} Keep the Echo Map style rules from your system instructions.`;
}
