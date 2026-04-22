const MS_DAY = 86400000;

/** 与 Gallery 建筑条目兼容，避免从 App 循环依赖类型 */
export type BuildingForHeatmap = {
  photos: { file?: File; url?: string }[];
  log: { date?: string };
  processedImage: unknown;
  isGenerating: boolean;
};

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function toIsoKey(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** 解析 log.date 常见格式 YYYY-MM-DD */
export function parseLogDate(s: string | undefined | null): { y: number; m: number; d: number } | null {
  if (!s || typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

/**
 * 按自然日聚合「旅行照片」上传次数：
 * - 有 `file` 的照片：用 `lastModified` 所在本地日历日（在 year 内则计入）；
 * - 无 file 仅有 url：用建筑 `log.date` 所在日计 1；
 * - 无照片但有已生成抠图：用 `log.date` 计 1。
 */
export function aggregateUploadsByDay(images: BuildingForHeatmap[], year: number): Map<string, number> {
  const map = new Map<string, number>();

  const bump = (y: number, m: number, d: number, n: number) => {
    if (y !== year) return;
    const k = toIsoKey(y, m, d);
    map.set(k, (map.get(k) ?? 0) + n);
  };

  for (const img of images) {
    const trip = parseLogDate(img.log?.date);

    for (const p of img.photos) {
      if (p.file && typeof p.file.lastModified === 'number') {
        const dt = new Date(p.file.lastModified);
        bump(dt.getFullYear(), dt.getMonth() + 1, dt.getDate(), 1);
      } else if (trip && p.url) {
        bump(trip.y, trip.m, trip.d, 1);
      }
    }

    if (img.photos.length === 0 && img.processedImage && !img.isGenerating && trip) {
      bump(trip.y, trip.m, trip.d, 1);
    }
  }

  return map;
}

/** 贡献图网格：周日为第一行（与 GitHub 一致），列为周 */
export function getYearGridBounds(year: number): { gridStart: Date; gridEnd: Date; numWeeks: number } {
  const jan1 = new Date(year, 0, 1);
  const gridStart = new Date(jan1);
  gridStart.setDate(jan1.getDate() - jan1.getDay());

  const dec31 = new Date(year, 11, 31);
  const addSat = (6 - dec31.getDay() + 7) % 7;
  const gridEnd = new Date(dec31);
  gridEnd.setDate(dec31.getDate() + addSat);

  const days = Math.round((gridEnd.getTime() - gridStart.getTime()) / MS_DAY) + 1;
  const numWeeks = Math.ceil(days / 7);
  return { gridStart, gridEnd, numWeeks };
}

export type HeatmapCellModel = {
  date: Date;
  inYear: boolean;
  count: number;
  level: 0 | 1 | 2 | 3 | 4 | 5;
};

export function levelForCount(count: number, maxCount: number): HeatmapCellModel['level'] {
  if (count <= 0 || maxCount <= 0) return 0;
  const v = Math.ceil((5 * count) / maxCount);
  return Math.min(5, Math.max(1, v)) as HeatmapCellModel['level'];
}

export function buildYearHeatmapCells(
  year: number,
  counts: Map<string, number>
): { cells: HeatmapCellModel[]; numWeeks: number; maxCount: number } {
  const { gridStart, numWeeks } = getYearGridBounds(year);
  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);
  jan1.setHours(0, 0, 0, 0);
  dec31.setHours(23, 59, 59, 999);

  let maxCount = 0;
  for (const [, c] of counts) {
    if (c > maxCount) maxCount = c;
  }

  const cells: HeatmapCellModel[] = [];
  /** CSS 行优先：每行一周日…周六跨列；列为周（与 GitHub 一致） */
  for (let dow = 0; dow < 7; dow++) {
    for (let w = 0; w < numWeeks; w++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + w * 7 + dow);
      d.setHours(12, 0, 0, 0);
      const inYear = d >= jan1 && d <= dec31;
      const y = d.getFullYear();
      const mo = d.getMonth() + 1;
      const day = d.getDate();
      const count = inYear ? counts.get(toIsoKey(y, mo, day)) ?? 0 : 0;
      const level: HeatmapCellModel['level'] = inYear ? levelForCount(count, maxCount) : 0;
      cells.push({ date: d, inYear, count, level });
    }
  }

  return { cells, numWeeks, maxCount };
}

/** 某月 1 日在网格中的列索引（0-based） */
export function weekColumnForMonthStart(year: number, monthIndex: number, numWeeks: number): number {
  const { gridStart } = getYearGridBounds(year);
  const first = new Date(year, monthIndex, 1);
  first.setHours(12, 0, 0, 0);
  const diffDays = Math.round((first.getTime() - gridStart.getTime()) / MS_DAY);
  const col = Math.floor(diffDays / 7);
  return Math.max(0, Math.min(numWeeks - 1, col));
}
