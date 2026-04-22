import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ProcessedImage } from '../App';
import {
  aggregateUploadsByDay,
  buildYearHeatmapCells,
  weekColumnForMonthStart,
} from '../utils/travelHeatmapData';

const GALLERY_ARCH_BG = '#F9F1E2';
const FONT_GOOGLE_SANS = '"Roboto", "Google Sans", system-ui, sans-serif';
const TEXT_GRAY = '#756F6C';
const CELL_OUTLINE = '#c4bfb5';
/** 相对原 1px 描边的缩放（×0.8） */
const CELL_BORDER_PX = 0.8;

/** 等级 0–5 填充：低对比橄榄绿阶，0 与展区背景一致 */
const LEVEL_FILL: Record<0 | 1 | 2 | 3 | 4 | 5, string> = {
  0: GALLERY_ARCH_BG,
  1: '#e6eadc',
  2: '#d0d8c4',
  3: '#b4bf9e',
  4: '#8f9b6e',
  5: '#5F6D3B',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** 月/周/图例文案 */
const TRACK_FONT_PX = '10px';

export interface TravelHeatmapCalendarProps {
  buildings: ProcessedImage[];
  /** 展示的自然年，默认当前年 */
  year?: number;
}

type LayoutMetrics = {
  W: number;
  H: number;
  padT: number;
  padB: number;
  padX: number;
  gapMonthToGrid: number;
  gapWeekdayToGrid: number;
  gridW: number;
  gridH: number;
  cell: number;
  numWeeks: number;
  legendSwatch: number;
  legendLabelGap: number;
  weekdayColW: number;
};

export const TravelHeatmapCalendar: React.FC<TravelHeatmapCalendarProps> = ({
  buildings,
  year = new Date().getFullYear(),
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [m, setM] = useState<LayoutMetrics | null>(null);

  const counts = useMemo(() => aggregateUploadsByDay(buildings, year), [buildings, year]);
  const { cells, numWeeks } = useMemo(() => buildYearHeatmapCells(year, counts), [year, counts]);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const measure = () => {
      const r = el.getBoundingClientRect();
      const W = r.width;
      const H = r.height;
      if (W < 32 || H < 32) return;

      const padT = H * 0.1;
      const padB = H * 0.12;
      const padX = W * 0.08;
      const gapMonthToGrid = H * 0.04;
      /** 纵轴星期标签与方格间距（×0.6） */
      const gapWeekdayToGrid = W * 0.0175 * 0.6;

      const weekdayColW = 34;
      /** 与渲染一致：左右 pad 内，再减星期列与缝，得到周列总宽 */
      const heatmapGridAvailW = Math.max(32, W - 2 * padX - weekdayColW - gapWeekdayToGrid);
      const maxCellW = heatmapGridAvailW / numWeeks;
      /**
       * 与渲染一致：内高减去标题区 + 月条(14) + 月条下间距（图例 absolute 不占 flex 高度）
       * h2：一行高约 16×1.45 + marginBottom 16（与 JSX 一致）
       */
      const chromeAboveHeatmapPx = Math.round(16 * 1.45 + 16) + 14 + gapMonthToGrid;
      const gridAvailH = Math.max(32, H - padT - padB - chromeAboveHeatmapPx);
      const maxCellH = gridAvailH / 7;

      const gridW = heatmapGridAvailW;
      const gridH = gridAvailH;

      const specCell = W * 0.019;
      const baseCell = Math.min(maxCellW, maxCellH, specCell);
      /** ×2 ×1.2 ×1.5 ×1.6 ×1.25×1.25，且不超过网格可容纳最大值；图例色块同 cell */
      const cell = Math.min(baseCell * 2 * 1.2 * 1.5 * 1.6 * 1.25 * 1.25, maxCellW, maxCellH);

      /** 图例色块与热力图方格同尺寸 */
      const legendSwatch = cell;
      /** Less/More 与色块组左右间距 = 原 2px 参考 ×2 */
      const legendLabelGap = 4;

      setM({
        W,
        H,
        padT,
        padB,
        padX,
        gapMonthToGrid,
        gapWeekdayToGrid,
        gridW,
        gridH,
        cell,
        numWeeks,
        legendSwatch,
        legendLabelGap,
        weekdayColW,
      });
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [numWeeks]);

  const monthLabelPositions = useMemo(() => {
    return MONTHS.map((_, mi) => ({
      label: MONTHS[mi],
      col: weekColumnForMonthStart(year, mi, numWeeks),
    }));
  }, [year, numWeeks]);

  if (!m) {
    return (
      <div
        ref={rootRef}
        className="w-full shrink-0 overflow-hidden border-t border-[#e8e2d6]"
        style={{
          background: GALLERY_ARCH_BG,
          height: 'clamp(220px, 28dvh, 320px)',
          boxSizing: 'border-box',
        }}
        aria-hidden
      />
    );
  }

  const gridInnerW = m.numWeeks * m.cell;
  const gridInnerH = 7 * m.cell;

  return (
    <div
      ref={rootRef}
      className="w-full shrink-0 overflow-hidden border-t border-[#e8e2d6]"
      style={{
        background: GALLERY_ARCH_BG,
        height: 'clamp(220px, 28dvh, 320px)',
        boxSizing: 'border-box',
        position: 'relative',
        containerType: 'size',
      }}
      role="region"
      aria-label={`Travel heatmap calendar for ${year}`}
    >
      <div
        style={{
          position: 'absolute',
          left: m.padX,
          right: m.padX,
          top: m.padT,
          bottom: m.padB,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
        }}
      >
        <div
          className="flex w-full flex-row items-center gap-2"
          style={{ marginBottom: 16, minHeight: 28 }}
        >
          <div className="min-w-0 flex-1" aria-hidden />
          <h2
            className="m-0 min-w-0 max-w-[min(100%,20rem)] shrink text-center text-base md:text-lg text-[#756F6C]"
            style={{
              fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
              fontWeight: 400,
              lineHeight: 1.45,
              letterSpacing: '0.04em',
            }}
          >
            Track your travel activities
          </h2>
          <div
            className="flex min-w-0 flex-1 flex-row flex-wrap items-center justify-end gap-0"
            style={{
              fontFamily: FONT_GOOGLE_SANS,
              fontWeight: 400,
              fontSize: TRACK_FONT_PX,
              color: TEXT_GRAY,
            }}
            aria-label="Activity level legend"
          >
            <span style={{ marginRight: m.legendLabelGap }}>Less</span>
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 0 }}>
              {([1, 2, 3, 4, 5] as const).map((lv) => (
                <span
                  key={lv}
                  style={{
                    width: m.legendSwatch,
                    height: m.legendSwatch,
                    boxSizing: 'border-box',
                    background: LEVEL_FILL[lv],
                    border: `${CELL_BORDER_PX}px solid ${CELL_OUTLINE}`,
                    borderRadius: 0,
                  }}
                  aria-hidden
                />
              ))}
            </div>
            <span style={{ marginLeft: m.legendLabelGap }}>More</span>
          </div>
        </div>

        {/* Month label zone */}
        <div
          style={{
            position: 'relative',
            height: 14,
            marginBottom: m.gapMonthToGrid,
            marginLeft: m.weekdayColW + m.gapWeekdayToGrid,
            width: gridInnerW,
            maxWidth: '100%',
          }}
        >
          {monthLabelPositions.map(({ label, col }) => (
            <span
              key={label}
              style={{
                position: 'absolute',
                left: col * m.cell,
                top: 0,
                fontFamily: FONT_GOOGLE_SANS,
                fontWeight: 400,
                fontSize: TRACK_FONT_PX,
                color: TEXT_GRAY,
                lineHeight: 1.1,
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </span>
          ))}
        </div>

        {/* Weekday + grid */}
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: m.gapWeekdayToGrid }}>
          <div
            style={{
              width: m.weekdayColW,
              height: gridInnerH,
              position: 'relative',
              flexShrink: 0,
            }}
          >
            {[
              { row: 1, text: 'Mon' },
              { row: 3, text: 'Wed' },
              { row: 5, text: 'Fri' },
            ].map(({ row, text }) => (
              <span
                key={text}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: row * m.cell + m.cell / 2 - 5,
                  fontFamily: FONT_GOOGLE_SANS,
                  fontWeight: 400,
                  fontSize: TRACK_FONT_PX,
                  color: TEXT_GRAY,
                  lineHeight: 1,
                }}
              >
                {text}
              </span>
            ))}
          </div>

          <div
            style={{
              width: gridInnerW,
              height: gridInnerH,
              maxWidth: `calc(100% - ${m.weekdayColW + m.gapWeekdayToGrid}px)`,
              display: 'grid',
              gridTemplateColumns: `repeat(${m.numWeeks}, ${m.cell}px)`,
              gridTemplateRows: `repeat(7, ${m.cell}px)`,
              gap: 0,
              flexShrink: 0,
            }}
          >
            {cells.map((c, i) => {
              const row = Math.floor(i / m.numWeeks);
              const col = i % m.numWeeks;
              const lastCol = m.numWeeks - 1;
              const lastRow = 6;
              const line = `${CELL_BORDER_PX}px solid ${CELL_OUTLINE}`;
              return (
              <div
                key={`${c.date.getTime()}-${i}`}
                title={
                  c.inYear
                    ? `${c.date.getFullYear()}-${String(c.date.getMonth() + 1).padStart(2, '0')}-${String(c.date.getDate()).padStart(2, '0')}: ${c.count} photo(s)`
                    : undefined
                }
                style={{
                  width: m.cell,
                  height: m.cell,
                  boxSizing: 'border-box',
                  background: LEVEL_FILL[c.level],
                  /* 仅内部格线，最外一圈无轮廓 */
                  borderRight: col < lastCol ? line : 'none',
                  borderBottom: row < lastRow ? line : 'none',
                  borderLeft: 'none',
                  borderTop: 'none',
                  borderRadius: 0,
                  margin: 0,
                }}
              />
            );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
