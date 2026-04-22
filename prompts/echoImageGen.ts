/**
 * Echo Map 建筑图生图：user 侧文案；system 侧见 `buildingStyle.ts` 的 buildEchoImageSystemInstruction。
 */

export { buildEchoImageSystemInstruction, DEFAULT_BUILDING_STYLE, type BuildingStyleId } from './buildingStyle.js';

export function buildInitialUserPrompt(buildingName?: string): string {
  const trimmed = buildingName?.trim();
  const context = trimmed
    ? `The traveler labeled this building or place as: "${trimmed}". ` +
      'If this clearly refers to a famous landmark, use public-domain architectural knowledge to refine proportions, roofline, and materials while matching the uploaded photo as the primary reference. ' +
      'If the label is ambiguous or not a landmark, rely on the photo only.'
    : 'Use only the uploaded photograph as reference for the structure; do not invent unrelated buildings.';

  return [
    'Task: From the provided travel photo, create one depiction of the main building or object only, following the system style (isometric / flat / pixel / ink / healing as specified there).',
    context,
    'Preserve the subject identity from the photo; do not add unrelated scenery, roads, or ground geometry.',
    'The only “floor” is pure white: do not draw asphalt, stripes, curbs, or grey bases beneath the model.',
  ].join(' ');
}

/** 编辑 / 重生成：用户已有一句自然语言修改指令 */
export function buildEditUserPrompt(editInstruction: string, buildingName?: string): string {
  const base = `${editInstruction.trim()}`;
  const extra = buildingName?.trim()
    ? ` Context label (optional): "${buildingName.trim()}".`
    : '';
  return `${base}${extra} Keep the Echo Map style rules from your system instructions.`;
}
