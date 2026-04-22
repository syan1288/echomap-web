import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoonFaceAvatar } from './MoonFaceAvatar';

/** 与插画顶缘间距：锚点已贴在图片盒子上，此处仅留极小缝 */
const POPOVER_GAP_PX = 0;
const AVATAR_BASE = 48;
/** 相对原 0.4× 基准再 ×1.1（emoji / Facehash 视觉） */
const AVATAR_DISPLAY = Math.round(AVATAR_BASE * 0.4 * 1.1);

/** Fixed-position popover：展示当前建筑绑定的 Moon Face Hash 预览 */
export const GalleryMoonPopover: React.FC<{
  moon: string;
  avatarVariant: number;
  anchorEl: HTMLElement | null;
}> = ({ moon, avatarVariant, anchorEl }) => {
  const [pos, setPos] = useState({ left: 0, top: 0 });

  const visible =
    Boolean(anchorEl) &&
    moon.trim().length >= 1 &&
    moon.trim().length <= 64;

  useEffect(() => {
    if (!anchorEl || !visible) return;
    const update = () => {
      const r = anchorEl.getBoundingClientRect();
      setPos({ left: r.left + r.width / 2, top: r.top });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [anchorEl, visible, moon, avatarVariant]);

  if (!visible) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed z-[300] flex flex-col items-center"
      style={{
        left: pos.left,
        top: pos.top,
        transform: `translate(-50%, calc(-100% - ${POPOVER_GAP_PX}px))`,
      }}
      role="tooltip"
    >
      <div className="border border-black bg-white p-px shadow-[1px_1px_0_rgba(0,0,0,0.06)]">
        <div
          className="flex items-center justify-center overflow-hidden"
          style={{
            width: AVATAR_DISPLAY + 2,
            height: AVATAR_DISPLAY + 2,
          }}
        >
          <MoonFaceAvatar moon={moon} avatarVariant={avatarVariant} size={AVATAR_DISPLAY} interactive={false} />
        </div>
      </div>
      <div
        className="h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-black"
        aria-hidden
      />
    </div>,
    document.body
  );
};
