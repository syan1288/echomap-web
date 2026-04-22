import React from 'react';

const LOGO_SRC = '/assets/echo-lighthouse-logo.png';

/**
 * 侧栏品牌区：SVG 画板 + 矢量云朵动画 + 内嵌灯塔插画；hover 动效与 Gallery 建筑卡片一致。
 */
export const EchoBrandLogo: React.FC = () => {
  return (
    <div
      className="echo-brand-logo group relative mx-auto mt-2 mb-5 w-[min(230px,72vw)] max-w-[260px] cursor-default select-none transition-all duration-200 ease-out hover:scale-[1.06] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(51,33,21,0.1)]"
      style={{ filter: 'drop-shadow(0 4px 14px rgba(51,33,21,0.06))' }}
    >
      <svg
        className="w-full h-auto overflow-visible block"
        viewBox="0 0 320 200"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <clipPath id="echoLogoClip">
            <rect x="0" y="0" width="320" height="200" />
          </clipPath>
        </defs>

        <g clipPath="url(#echoLogoClip)">
          {/* 云朵在主体后方，自左向右循环 */}
          <g className="echo-cloud echo-cloud-a" opacity={1}>
            <ellipse cx="48" cy="72" rx="52" ry="20" fill="#ffffff" />
            <ellipse cx="78" cy="68" rx="36" ry="16" fill="#ffffff" />
          </g>
          <g className="echo-cloud echo-cloud-b" opacity={1}>
            <ellipse cx="200" cy="42" rx="44" ry="17" fill="#ffffff" />
            <ellipse cx="228" cy="38" rx="28" ry="14" fill="#ffffff" />
          </g>
          <g className="echo-cloud echo-cloud-c" opacity={0.86}>
            <ellipse cx="-30" cy="118" rx="48" ry="18" fill="#eaf3ff" />
            <ellipse cx="0" cy="114" rx="32" ry="15" fill="#eaf3ff" />
          </g>

          {/* 建筑主体：PNG 嵌入 SVG；mix-blend 弱化灰底/棋盘格感 */}
          <image
            href={LOGO_SRC}
            x="48"
            y="12"
            width="224"
            height="176"
            preserveAspectRatio="xMidYMid meet"
            className="echo-logo-raster"
            style={{ mixBlendMode: 'multiply' }}
          />
        </g>
      </svg>
    </div>
  );
};
