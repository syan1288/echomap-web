import React from 'react';

/** 彩铅感：双层描边模拟蜡笔肌理；透明底仅线条 */
const STROKE = '#1A56DB';

export const BrandTrainSvg: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 320 180"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    <defs>
      <filter id="brandPencil" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="0.6" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
    <g filter="url(#brandPencil)" opacity={0.92}>
      <path
        d="M40 120c20-8 38-18 58-24 12-3 24-2 36 2 18 6 34 18 52 24 10 4 22 5 32 1 14-6 26-16 40-22 8-3 18-4 26-1 10 4 18 12 24 20 6 8 10 18 8 28-2 12-12 20-22 24-12 4-26 2-38-2-16-6-30-16-46-22-12-4-26-4-38 0-18 6-34 18-52 24-10 4-22 4-32 0-14-6-24-18-30-30-4-8-6-18-2-26 4-10 14-16 24-18"
        stroke={STROKE}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.35}
      />
      <path
        d="M40 120c20-8 38-18 58-24 12-3 24-2 36 2 18 6 34 18 52 24 10 4 22 5 32 1 14-6 26-16 40-22 8-3 18-4 26-1 10 4 18 12 24 20 6 8 10 18 8 28-2 12-12 20-22 24-12 4-26 2-38-2-16-6-30-16-46-22-12-4-26-4-38 0-18 6-34 18-52 24-10 4-22 4-32 0-14-6-24-18-30-30-4-8-6-18-2-26 4-10 14-16 24-18"
        stroke={STROKE}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M70 95h56c8 0 14 6 14 14v18c0 8-6 14-14 14H70c-8 0-14-6-14-14v-18c0-8 6-14 14-14zM150 88h64c10 0 18 8 18 18v22c0 10-8 18-18 18h-64c-10 0-18-8-18-18v-22c0-10 8-18 18-18z"
        stroke={STROKE}
        strokeWidth="2.4"
      />
      <path d="M88 118h20M168 118h28" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
      <path
        d="M200 48c-6 12-10 26-8 40M220 40c4 14 6 30 2 44M236 52c2 10 2 22-2 32"
        stroke={STROKE}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M24 132h272"
        stroke={STROKE}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="6 10"
      />
    </g>
  </svg>
);
