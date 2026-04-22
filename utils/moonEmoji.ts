/**
 * Moon 字段中仅保留 emoji（用于 Gallery hover 气泡），不含文字与标点。
 * 使用 grapheme 分段以支持 ZWJ 组合 emoji。
 */
export function extractMoonEmojiSymbols(text: string): string {
  const s = text.trim();
  if (!s) return '';
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const out: string[] = [];
    for (const { segment } of seg.segment(s)) {
      if (/\p{Extended_Pictographic}/u.test(segment)) {
        out.push(segment);
      }
    }
    return out.join('').trim();
  } catch {
    return (s.match(/\p{Extended_Pictographic}/gu) ?? []).join('');
  }
}
