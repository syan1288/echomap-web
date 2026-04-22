import React, { useRef } from 'react';
import type { ProcessedImage } from '../App';

interface PoiDotMarkerProps {
  img: ProcessedImage;
  map: any;
  isSelected: boolean;
  onInteractionStart: (e: React.MouseEvent<HTMLDivElement>, img: ProcessedImage) => void;
  onHoverChange?: (id: number | null) => void;
}

const BLUE_PALETTE = ['#93c5fd', '#7dd3fc', '#60a5fa', '#38bdf8', '#3b82f6', '#2563eb', '#0ea5e9'];

function hash32(id: number): number {
  return Math.imul(id, 2654435761) >>> 0;
}

/** 远距缩放：蓝系填充、无描边；色/透明度由 id 稳定派生；直径在挂载时随机（不随 id） */
export const PoiDotMarker: React.FC<PoiDotMarkerProps> = ({
  img,
  map,
  isSelected,
  onInteractionStart,
  onHoverChange,
}) => {
  const baseDiameterPxRef = useRef<number | null>(null);
  if (baseDiameterPxRef.current === null) {
    baseDiameterPxRef.current = 10 + Math.floor(Math.random() * 9);
  }
  const screenPoint = map.latLngToContainerPoint([img.lat, img.lng]);
  const zoom = typeof map.getZoom === 'function' ? map.getZoom() : 5;
  const h = hash32(img.id);
  const color = BLUE_PALETTE[h % BLUE_PALETTE.length];
  const fillAlpha = 0.26 + ((h >>> 8) % 52) / 100;
  const baseD = baseDiameterPxRef.current;
  const zBoost = Math.max(0.82, Math.min(1.18, 0.72 + zoom * 0.055));
  let diameter = Math.round(baseD * zBoost);
  let alpha = fillAlpha;
  if (isSelected) {
    diameter = Math.round(diameter * 1.32);
    alpha = Math.min(0.92, fillAlpha + 0.22);
  }

  return (
    <div
      className="absolute z-10 flex items-center justify-center pointer-events-auto rounded-full box-border"
      style={{
        left: screenPoint.x,
        top: screenPoint.y,
        width: diameter,
        height: diameter,
        transform: 'translate(-50%, -50%)',
        backgroundColor: color,
        opacity: alpha,
        border: 'none',
        outline: 'none',
        boxShadow: 'none',
        willChange: 'transform',
        cursor: 'pointer',
      }}
      onMouseDown={(e) => onInteractionStart(e, img)}
      onMouseEnter={() => onHoverChange?.(img.id)}
      onMouseLeave={() => onHoverChange?.(null)}
      aria-hidden
    />
  );
};
