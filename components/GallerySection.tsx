import React, { useMemo, useState, useEffect } from 'react';
import type { ProcessedImage } from '../App';
import { filterBuildings, suggestLabels, type GalleryDim } from '../utils/galleryFilter';
import { galleryBuildingTitle } from '../utils/buildingLabel';
import { normalizeAvatarVariant } from '../utils/moonFacehash';
import { GalleryMoonPopover } from './GalleryMoonPopover';
import { TravelHeatmapCalendar } from './TravelHeatmapCalendar';

const LABEL_OLIVE = '#4A5A3C';
/** 分页指示器：描边与选中填充同色（灰） */
const CAROUSEL_DOT = '#756F6C';
/** 每页建筑格数（2×3）；圆点数为 totalPages + 1 */
const GALLERY_ITEMS_PER_PAGE = 6;
/** 统一方格视口（尽量占满栅格列宽），立绘 object-contain */
const THUMB_FRAME =
  'relative mx-auto flex aspect-square w-full max-w-[min(100%,200px)] shrink-0 items-center justify-center overflow-hidden sm:max-w-[min(100%,220px)] md:max-w-[min(100%,240px)]';
const thumbBoxClass =
  'flex w-full shrink-0 items-center justify-center overflow-hidden py-1 min-h-0';

function mapAlignedBuildingSrc(b: ProcessedImage): string | null {
  return (
    b.processedImage?.src ??
    (!b.isGenerating && b.photos[0]?.url ? b.photos[0].url : null) ??
    null
  );
}

const FILTER_RECENT_KEY = 'echo_gallery_filter_recent';

function readFilterRecent(): string[] {
  try {
    const raw = localStorage.getItem(FILTER_RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
}

function writeFilterRecent(q: string) {
  const t = q.trim();
  if (!t) return;
  const prev = readFilterRecent().filter((x) => x.toLowerCase() !== t.toLowerCase());
  const next = [t, ...prev].slice(0, 5);
  localStorage.setItem(FILTER_RECENT_KEY, JSON.stringify(next));
}

export interface GallerySectionProps {
  buildings: ProcessedImage[];
  onOpenBuilding: (id: number) => void;
}

const DIM_LABELS: { id: GalleryDim; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'city', label: 'City' },
  { id: 'country', label: 'Country' },
  { id: 'continent', label: 'Continent' },
];

export const GallerySection: React.FC<GallerySectionProps> = ({ buildings, onOpenBuilding }) => {
  const [query, setQuery] = useState('');
  const [dim, setDim] = useState<GalleryDim>('all');
  const [openDim, setOpenDim] = useState(false);
  const [activeInput, setActiveInput] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => readFilterRecent());
  const [carouselPage, setCarouselPage] = useState(0);
  const [moonHover, setMoonHover] = useState<{
    el: HTMLElement | null;
    moon: string;
    avatarVariant: number;
  }>({ el: null, moon: '', avatarVariant: 0 });

  useEffect(() => {
    if (activeInput && query.length <= 1) setRecent(readFilterRecent());
  }, [activeInput, query]);

  const suggestions = useMemo(() => {
    if (query.trim().length < 2) return [];
    return suggestLabels(buildings, query, dim, 5);
  }, [buildings, query, dim]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (q.length >= 2) return filterBuildings(buildings, q, dim);
    return buildings;
  }, [buildings, query, dim]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / GALLERY_ITEMS_PER_PAGE) || 1);
  const dotCount = totalPages + 1;

  useEffect(() => {
    setCarouselPage((p) => Math.min(p, Math.max(0, totalPages - 1)));
  }, [filtered.length, totalPages]);

  const pageSlice = useMemo(() => {
    const start = carouselPage * GALLERY_ITEMS_PER_PAGE;
    return filtered.slice(start, start + GALLERY_ITEMS_PER_PAGE);
  }, [filtered, carouselPage]);

  const dropdownRows =
    activeInput && query.length <= 1
      ? recent.map((text, i) => ({ type: 'recent' as const, text, key: `r-${i}` }))
      : suggestions.map((text, i) => ({ type: 'suggest' as const, text, key: `s-${i}` }));

  return (
    <section id="gallery" className="relative flex flex-1 flex-col min-h-0 h-full w-full overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col bg-[#F9F1E2]">
        <div className="flex w-full flex-1 min-h-0 flex-col px-2 pt-5 pb-3 sm:px-3 md:px-4">
          <div className="flex justify-center shrink-0 mb-6 w-full px-1">
            <div className="relative w-full max-w-[400px]">
              <div className="relative flex flex-1 min-w-0">
                <div className="relative shrink-0">
                  <button
                    type="button"
                    className="border border-black bg-white flex items-center justify-center text-xs shrink-0 rounded-none border-r-0"
                    style={{ color: '#332115', width: 44, height: 44, fontFamily: '"Roboto Mono", ui-monospace, monospace' }}
                    aria-haspopup="listbox"
                    aria-expanded={openDim}
                    onClick={() => setOpenDim((v) => !v)}
                  >
                    ▼
                  </button>
                  {openDim && (
                    <ul
                      className="scrollbar-hide absolute left-0 mt-0 w-44 bg-white border border-black z-30 text-left text-sm shadow-none max-h-[200px] overflow-y-auto rounded-none"
                      role="listbox"
                      style={{ color: '#332115', fontFamily: '"Roboto Mono", ui-monospace, monospace' }}
                    >
                      {DIM_LABELS.map((d) => (
                        <li key={d.id}>
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-black/[0.04] border-0 bg-white cursor-pointer"
                            onMouseDown={() => {
                              setDim(d.id);
                              setOpenDim(false);
                            }}
                          >
                            {d.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <input
                  className="flex-1 min-w-0 px-[14px] border border-black bg-white text-sm outline-none rounded-none"
                  style={{
                    color: '#332115',
                    height: 44,
                    fontFamily: '"Roboto Mono", ui-monospace, monospace',
                  }}
                  placeholder="Filter…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setActiveInput(true)}
                  onBlur={() => setTimeout(() => setActiveInput(false), 150)}
                  aria-label="Filter gallery"
                  autoComplete="off"
                />
              </div>
              {activeInput && dropdownRows.length > 0 && (
                <ul
                  className="scrollbar-hide absolute left-0 right-0 top-full mt-0 bg-white border border-black border-t-0 z-20 max-h-[200px] overflow-y-auto rounded-none"
                  style={{ fontFamily: '"Roboto Mono", ui-monospace, monospace' }}
                >
                  {dropdownRows.map((row) => (
                    <li
                      key={row.key}
                      className="px-3 py-2 cursor-pointer hover:bg-gray-100 text-sm"
                      onMouseDown={() => {
                        setQuery(row.text);
                        writeFilterRecent(row.text);
                        setActiveInput(false);
                      }}
                    >
                      {row.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="scrollbar-hide grid grid-cols-2 md:grid-cols-3 gap-x-2 gap-y-4 md:gap-x-3 md:gap-y-5 flex-1 content-start min-h-0 overflow-y-auto overscroll-contain scroll-pt-2 pt-3 sm:pt-4 [grid-auto-rows:minmax(0,auto)] justify-items-center">
            {pageSlice.map((b) => {
              const title = galleryBuildingTitle(b.log);
              const displaySrc = mapAlignedBuildingSrc(b);
              const moon = (b.log.moon ?? '').trim();
              const moonOk = moon.length >= 1 && moon.length <= 64;
              const av = normalizeAvatarVariant(b.log.avatarVariant);
              return (
                <div
                  key={b.id}
                  className="flex min-h-0 w-full min-w-0 max-w-[min(100%,280px)] flex-col items-center gap-0 justify-self-center"
                >
                  <div className="relative flex w-full min-h-0 justify-center overflow-hidden">
                    <button
                      type="button"
                      className="group flex w-full cursor-pointer flex-col items-center overflow-hidden rounded-none border-0 bg-transparent px-0.5 pb-0 pt-0.5 shadow-none transition-transform duration-200 ease-out hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5F6D3B]/35"
                      onClick={() => onOpenBuilding(b.id)}
                    >
                      <div className={thumbBoxClass}>
                        <div
                          className={`${THUMB_FRAME} transition-[filter] duration-200 ease-out group-hover:drop-shadow-[0_0_22px_rgba(255,255,255,0.98)] group-hover:brightness-[1.04]`}
                          onMouseEnter={(e) => {
                            if (moonOk) {
                              setMoonHover({
                                el: e.currentTarget,
                                moon: b.log.moon ?? '',
                                avatarVariant: av,
                              });
                            }
                          }}
                          onMouseLeave={() => setMoonHover({ el: null, moon: '', avatarVariant: 0 })}
                        >
                          {displaySrc ? (
                            <img
                              src={displaySrc}
                              alt=""
                              draggable={false}
                              className="h-full w-full select-none object-contain object-center"
                            />
                          ) : (
                            <span className="text-xs text-[#332115]/70">Generating…</span>
                          )}
                        </div>
                      </div>
                    </button>
                  </div>
                  <p
                    className="m-0 mt-2 line-clamp-2 min-h-[2.75rem] w-full shrink-0 break-words px-1 pt-0.5 text-center text-[14px] leading-snug"
                    style={{
                      color: LABEL_OLIVE,
                      fontFamily: '"Roboto Mono", ui-monospace, monospace',
                      fontWeight: 400,
                    }}
                    title={title || undefined}
                  >
                    {title || '—'}
                  </p>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div
                className="col-span-full text-center text-sm py-12"
                style={{ color: '#756F6C', fontFamily: '"Helvetica Neue", sans-serif' }}
              >
                No matching buildings.
              </div>
            )}
          </div>

          <GalleryMoonPopover
            anchorEl={moonHover.el}
            moon={moonHover.moon}
            avatarVariant={moonHover.avatarVariant}
          />

          <div
            className="flex shrink-0 items-center justify-center gap-4 pt-3 pb-1"
            style={{ fontFamily: '"Roboto Mono", ui-monospace, monospace' }}
          >
              <button
                type="button"
                className="border-0 bg-transparent p-1 text-[#332115] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                aria-label="Previous page"
                disabled={carouselPage <= 0}
                onClick={() => setCarouselPage((p) => Math.max(0, p - 1))}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <div className="flex items-center gap-4">
                {Array.from({ length: dotCount }, (_, i) => {
                  const isPageDot = i < totalPages;
                  const isActivePage = isPageDot && carouselPage === i;
                  return (
                    <button
                      key={`dot-${i}`}
                      type="button"
                      aria-label={
                        isPageDot
                          ? `Page ${i + 1}`
                          : carouselPage >= totalPages - 1
                            ? 'First page'
                            : 'Last page'
                      }
                      aria-current={isActivePage ? 'true' : undefined}
                      onClick={() => {
                        if (isPageDot) setCarouselPage(i);
                        else {
                          setCarouselPage((p) => (p >= totalPages - 1 ? 0 : totalPages - 1));
                        }
                      }}
                      className="h-2.5 w-2.5 shrink-0 rounded-full border transition-colors cursor-pointer"
                      style={{
                        borderColor: CAROUSEL_DOT,
                        backgroundColor: isActivePage ? CAROUSEL_DOT : 'transparent',
                      }}
                    />
                  );
                })}
              </div>
              <button
                type="button"
                className="border-0 bg-transparent p-1 text-[#332115] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                aria-label="Next page"
                disabled={carouselPage >= totalPages - 1}
                onClick={() => setCarouselPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
          </div>
        </div>
      </div>

      <TravelHeatmapCalendar buildings={buildings} />
    </section>
  );
};
