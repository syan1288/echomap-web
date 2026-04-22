import React from 'react';
import { extractMoonEmojiSymbols } from '../utils/moonEmoji';

/** Map / Gallery 随笔：Moon emoji 展示统一为白底、黑框（与 Facehash 解耦） */
export const MoonEmojiBox: React.FC<{ moon: string; className?: string }> = ({
  moon,
  className = '',
}) => {
  const sym = extractMoonEmojiSymbols(moon);
  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center border border-black bg-white text-lg leading-none ${className}`}
      aria-hidden={!sym}
    >
      {sym || <span className="text-[10px] text-neutral-300">&nbsp;</span>}
    </div>
  );
};
