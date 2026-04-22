import React from 'react';
import { EchoSidebarBrandIllustration } from './EchoSidebarBrandIllustration';
import { SidebarNoiseCanvas } from './SidebarNoiseCanvas';

/** 2.1.1 品牌蓝（echo-map-unified-description.md） */
const BRAND_BLUE = '#0053D4';
const PANEL_BG = '#c6ddff';
/** 仅自上而下渐变，无左右方向；保持蓝色系 */
const PANEL_STACK = `
  linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(210,228,255,0.75) 38%, rgba(180,205,245,0.98) 100%),
  ${PANEL_BG}
`;

export interface EchoSidebarProps {
  activeTab: 'home' | 'gallery';
  onNavigate: (tab: 'home' | 'gallery') => void;
  statsFade?: number;
  homeStatusSlot: React.ReactNode;
  galleryStatsSlot: React.ReactNode;
  /** 侧栏底部固定区（如云端登录） */
  footerSlot?: React.ReactNode;
}

export const EchoSidebar: React.FC<EchoSidebarProps> = ({
  activeTab,
  onNavigate,
  statsFade = 1,
  homeStatusSlot,
  galleryStatsSlot,
  footerSlot,
}) => {
  const navInactive = '#5C6670';
  const navActive = '#111111';

  return (
    <aside
      className="relative flex h-[100dvh] max-h-[100dvh] min-h-0 w-full shrink-0 flex-col items-center overflow-hidden overscroll-none text-center px-5 pt-[2.5vh] pb-[2.5vh] md:sticky md:top-0 md:z-30 md:min-h-[100dvh] md:min-w-[280px] md:max-w-[440px] md:basis-[30%] md:shrink-0 md:grow-0 md:self-start"
      style={{
        background: PANEL_STACK,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        color: '#332115',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
      }}
    >
      <SidebarNoiseCanvas />
      <nav
        className="relative z-[1] mb-[9vh] flex w-[52%] max-w-[220px] shrink-0 items-stretch rounded-full border border-black/25 bg-white/75 p-[4px] shadow-[0_1px_0_rgba(0,0,0,0.06)] backdrop-blur-md"
        style={{ minHeight: '4.8vh' }}
        aria-label="Primary"
      >
        <div
          className="pointer-events-none absolute top-[4px] bottom-[4px] w-[calc(50%-6px)] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-[left] duration-500 ease-out"
          style={{ left: activeTab === 'home' ? 4 : 'calc(50% + 2px)' }}
        />
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className={`relative z-[1] flex-1 min-w-0 rounded-full border-0 cursor-pointer px-2 py-2 text-[14px] transition-[background,color] duration-200 ease-out ${
            activeTab === 'home' ? '' : 'hover:bg-black/[0.06]'
          }`}
          style={{
            fontFamily: '"Plus Jakarta Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
            fontWeight: activeTab === 'home' ? 700 : 500,
            color: activeTab === 'home' ? navActive : navInactive,
          }}
        >
          Home
        </button>
        <button
          type="button"
          onClick={() => onNavigate('gallery')}
          className={`relative z-[1] flex-1 min-w-0 rounded-full border-0 cursor-pointer px-2 py-2 text-[14px] transition-[background,color] duration-200 ease-out ${
            activeTab === 'gallery' ? '' : 'hover:bg-black/[0.06]'
          }`}
          style={{
            fontFamily: '"Plus Jakarta Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
            fontWeight: activeTab === 'gallery' ? 700 : 500,
            color: activeTab === 'gallery' ? navActive : navInactive,
          }}
        >
          Gallery
        </button>
      </nav>

      <div className="relative z-[1] flex min-h-0 w-full min-w-0 flex-1 flex-col items-center justify-start overflow-hidden">
        <h1
          className="m-0 mb-[4vh] shrink-0 w-[84%] max-w-none text-center text-[clamp(2.35rem,4.2vw,3.85rem)]"
          style={{
            color: BRAND_BLUE,
            fontFamily: '"Gasoek One", sans-serif',
            fontWeight: 400,
            lineHeight: 1,
            letterSpacing: '0.01px',
          }}
        >
          Echo Map
        </h1>

        <div className="mb-[4vh] w-full shrink-0 flex justify-center px-1">
          <EchoSidebarBrandIllustration />
        </div>

        <p
          className="m-0 w-[68%] max-w-[300px] shrink-0 text-center text-[15px] leading-[1.25] px-1"
          style={{
            color: BRAND_BLUE,
            fontFamily: '"Plus Jakarta Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
            fontWeight: 400,
          }}
        >
          Stories and photos of long walks,
          <br />
          wrong turns,
          <br />
          and everyday discoveries
        </p>

        <div className="mt-[4vh] flex w-full max-w-[320px] flex-1 min-h-0 flex-col items-stretch">
          {activeTab === 'home' && <div className="w-full">{homeStatusSlot}</div>}
          {activeTab === 'gallery' && (
            <div className="w-full transition-opacity duration-500 ease-out" style={{ opacity: statsFade }}>
              {galleryStatsSlot}
            </div>
          )}
          {footerSlot ? (
            <div className="mt-auto w-full shrink-0 border-t border-black/10 pt-3">{footerSlot}</div>
          ) : null}
        </div>
      </div>
    </aside>
  );
};
