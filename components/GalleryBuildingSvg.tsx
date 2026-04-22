import React, { useEffect, useState } from 'react';

/** 用 SVG image 呈现建筑位图，透明 PNG 不额外产生矩形盒感。 */
export const GalleryBuildingSvg: React.FC<{ src: string }> = ({ src }) => {
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 1, h: 1 });

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = Math.max(1, img.naturalWidth);
      const h = Math.max(1, img.naturalHeight);
      setDims({ w, h });
    };
    img.onerror = () => setDims({ w: 1, h: 1 });
    img.src = src;
  }, [src]);

  return (
    <svg
      className="gallery-building-svg max-w-[min(92%,220px)] max-h-[min(92%,200px)] w-auto h-auto overflow-visible"
      viewBox={`0 0 ${dims.w} ${dims.h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label=""
    >
      <image href={src} width={dims.w} height={dims.h} preserveAspectRatio="xMidYMid meet" />
    </svg>
  );
};
