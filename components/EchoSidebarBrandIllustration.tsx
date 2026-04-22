import React from 'react';

/** 云朵浓度 ×1.25（上限 1） */
const d = (a: number) => Math.min(1, a * 1.25);

/** 基准 ×2.5×0.8 再 ×0.9 */
const SCALE = 2.5 * 0.8 * 0.9;
const MAX_BASE_VH = 22;

/** 大云仅叠在插画区域中部；小云靠边点缀并提高不透明度 */
const FloatingCloudsBackdrop: React.FC = () => (
  <div
    className="pointer-events-none absolute inset-[-10%] z-0 overflow-visible"
    aria-hidden
  >
    {/* —— 大云：仅中部（上带） —— */}
    <svg
      className="echo-cloud-xl absolute left-1/2 top-[6%] h-[38%] w-[98%] -translate-x-1/2 text-white"
      viewBox="0 0 400 150"
      preserveAspectRatio="xMidYMid meet"
    >
      <ellipse cx="200" cy="72" rx="125" ry="36" fill="currentColor" fillOpacity={d(0.43)} />
      <ellipse cx="95" cy="68" rx="72" ry="26" fill="currentColor" fillOpacity={d(0.35)} />
      <ellipse cx="305" cy="66" rx="62" ry="22" fill="currentColor" fillOpacity={d(0.3)} />
    </svg>

    {/* —— 大云：仅中部（下带） —— */}
    <svg
      className="echo-cloud-b absolute left-1/2 top-[44%] h-[30%] w-[92%] -translate-x-1/2 text-[#f7f9ff]"
      viewBox="0 0 400 130"
      preserveAspectRatio="xMidYMid meet"
    >
      <ellipse cx="200" cy="62" rx="110" ry="32" fill="currentColor" fillOpacity={d(0.38)} />
      <ellipse cx="130" cy="60" rx="68" ry="24" fill="currentColor" fillOpacity={d(0.33)} />
      <ellipse cx="268" cy="58" rx="58" ry="20" fill="currentColor" fillOpacity={d(0.29)} />
    </svg>

    {/* —— 小云：边角，高不透明度 —— */}
    <svg
      className="echo-cloud-tiny absolute left-[-4%] top-[2%] h-[9%] w-[34%] text-white"
      viewBox="0 0 140 44"
      preserveAspectRatio="xMidYMid meet"
    >
      <ellipse cx="52" cy="24" rx="44" ry="14" fill="currentColor" fillOpacity={d(0.85)} />
      <ellipse cx="92" cy="22" rx="26" ry="10" fill="currentColor" fillOpacity={d(0.66)} />
    </svg>

    <svg
      className="echo-cloud-tiny absolute right-[-3%] top-[8%] h-[8%] w-[30%] text-white"
      viewBox="0 0 120 40"
      preserveAspectRatio="xMidYMid meet"
    >
      <ellipse cx="62" cy="20" rx="48" ry="14" fill="currentColor" fillOpacity={d(0.8)} />
    </svg>

    <svg
      className="echo-cloud-tiny absolute bottom-[1%] left-[2%] h-[9%] w-[32%] text-[#f2f7ff]"
      viewBox="0 0 130 42"
      preserveAspectRatio="xMidYMid meet"
    >
      <ellipse cx="48" cy="22" rx="40" ry="13" fill="currentColor" fillOpacity={d(0.88)} />
      <ellipse cx="86" cy="20" rx="24" ry="9" fill="currentColor" fillOpacity={d(0.69)} />
    </svg>

    <svg
      className="echo-cloud-tiny absolute bottom-[3%] right-[0%] h-[8%] w-[28%] text-white"
      viewBox="0 0 110 38"
      preserveAspectRatio="xMidYMid meet"
    >
      <ellipse cx="56" cy="19" rx="46" ry="13" fill="currentColor" fillOpacity={d(0.83)} />
    </svg>

    <svg
      className="echo-cloud-tiny absolute left-[-2%] top-[52%] h-[7%] w-[26%] text-[#eaf2ff]"
      viewBox="0 0 100 34"
      preserveAspectRatio="xMidYMid meet"
    >
      <ellipse cx="44" cy="17" rx="38" ry="12" fill="currentColor" fillOpacity={d(0.73)} />
    </svg>

    <svg
      className="echo-cloud-tiny absolute right-[-1%] top-[56%] h-[7%] w-[24%] text-[#eaf2ff]"
      viewBox="0 0 96 32"
      preserveAspectRatio="xMidYMid meet"
    >
      <ellipse cx="48" cy="16" rx="40" ry="11" fill="currentColor" fillOpacity={d(0.75)} />
    </svg>
  </div>
);

export const EchoSidebarBrandIllustration: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`relative w-full overflow-visible ${className ?? ''}`}>
    <div className="relative z-[1] flex w-full justify-center overflow-visible">
      <FloatingCloudsBackdrop />
      <div
        className="relative z-[2] origin-top"
        style={{
          width: '60%',
          maxHeight: `${MAX_BASE_VH}vh`,
          transform: `scale(${SCALE})`,
          transformOrigin: 'top center',
        }}
      >
        <img
          src="/assets/echo-sidebar-brand.svg"
          alt=""
          width={180}
          height={146}
          decoding="async"
          draggable={false}
          className="relative z-[1] mx-auto block h-auto w-full object-contain select-none"
          style={{ maxHeight: `${MAX_BASE_VH}vh` }}
        />
      </div>
    </div>
    <div
      className="w-full shrink-0"
      style={{ height: `calc(${MAX_BASE_VH}vh * (${SCALE} - 1))` }}
      aria-hidden
    />
  </div>
);
