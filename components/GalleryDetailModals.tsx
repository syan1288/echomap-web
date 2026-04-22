import React, { useState, useEffect } from 'react';
import type { LogData, PhotoData } from '../App';
import { MoonFaceAvatar } from './MoonFaceAvatar';

const FONT_TITLE = '"Roboto Mono", ui-monospace, monospace';
const FONT_BODY = '"Roboto Mono", ui-monospace, monospace';

export interface GalleryDetailModalsProps {
  openM03: boolean;
  openM04: boolean;
  log: LogData;
  photos: PhotoData[];
  onGoToMemories: () => void;
  onBackToGalleryFromM03: () => void;
  onBackToDiary: () => void;
  onBackToGalleryFromM04: () => void;
}

export const GalleryDetailModals: React.FC<GalleryDetailModalsProps> = ({
  openM03,
  openM04,
  log,
  photos,
  onGoToMemories,
  onBackToGalleryFromM03,
  onBackToDiary,
  onBackToGalleryFromM04,
}) => {
  const [page, setPage] = useState(1);
  const perPage = 9;
  const totalPages = Math.max(1, Math.ceil(photos.length / perPage));
  const slice = photos.slice((page - 1) * perPage, page * perPage);

  useEffect(() => {
    const tp = Math.max(1, Math.ceil(photos.length / perPage));
    setPage((p) => Math.min(Math.max(1, p), tp));
  }, [photos.length, perPage, openM04]);

  if (!openM03 && !openM04) return null;

  const shell = (body: React.ReactNode) => (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          if (openM04) onBackToGalleryFromM04();
          else onBackToGalleryFromM03();
        }
      }}
    >
      <div
        className="bg-white w-full max-w-[720px] border border-black shadow-xl p-6 rounded-none"
        style={{ fontFamily: FONT_BODY, fontWeight: 400 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {body}
      </div>
    </div>
  );

  if (openM03) {
    return shell(
      <>
        <button
          type="button"
          className="text-sm text-[#756F6C] bg-transparent border-0 cursor-pointer mb-6"
          style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}
          onClick={onBackToGalleryFromM03}
        >
          &lt; Back to gallery
        </button>
        <div className="space-y-4 text-[#332115]">
          <div>
            <p className="text-sm m-0 mb-1" style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}>
              Date
            </p>
            <div className="border border-black px-3 py-2 text-sm bg-white rounded-none">{log.date || '—'}</div>
          </div>
          <div>
            <p className="text-sm m-0 mb-1" style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}>
              Partner
            </p>
            <div className="border border-black px-3 py-2 text-sm bg-white rounded-none">{log.partner || '—'}</div>
          </div>
          <div>
            <p className="text-sm m-0 mb-1" style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}>
              Moon
            </p>
            <div className="flex items-stretch justify-end gap-2">
              <div className="min-h-[40px] min-w-0 flex-1 border border-black bg-white px-3 py-2 text-sm text-neutral-500 rounded-none">
                {log.moon || 'Type your moon……'}
              </div>
              <div className="shrink-0 border border-black bg-white">
                <MoonFaceAvatar moon={log.moon} avatarVariant={log.avatarVariant} size={40} interactive={false} />
              </div>
            </div>
          </div>
          <div>
            <p className="text-sm m-0 mb-1" style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}>
              Just writing
            </p>
            <div className="border border-black px-3 py-2 text-sm bg-white min-h-[96px] whitespace-pre-wrap rounded-none">
              {log.musings || '—'}
            </div>
          </div>
        </div>
        <div className="flex justify-end mt-8">
          <button
            type="button"
            className="text-sm text-[#0053D4] underline-offset-2 hover:underline bg-transparent border-0 cursor-pointer"
            style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}
            onClick={onGoToMemories}
          >
            &gt; Go to memories
          </button>
        </div>
      </>
    );
  }

  return shell(
    <>
      <div className="flex justify-between items-center gap-4 mb-6">
        <button
          type="button"
          className="text-sm text-[#756F6C] bg-transparent border-0 cursor-pointer"
          style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}
          onClick={onBackToDiary}
        >
          &lt; Back to diary
        </button>
        <button
          type="button"
          className="text-sm text-[#756F6C] bg-transparent border-0 cursor-pointer"
          style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}
          onClick={onBackToGalleryFromM04}
        >
          &gt; Back to gallery
        </button>
      </div>
      <h3 className="text-lg mb-4 text-[#332115]" style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}>
        Photos
      </h3>
      <div className="grid grid-cols-3 gap-3">
        {slice.map((p, i) => (
          <div
            key={p.photo_id ?? `${(page - 1) * perPage + i}`}
            className="aspect-square border border-black bg-[#fafafa] overflow-hidden"
          >
            <img src={p.url} alt="" className="w-full h-full object-cover" />
          </div>
        ))}
        {slice.length === 0 && (
          <div className="col-span-3 text-sm text-neutral-500 py-6 text-center">No photos yet.</div>
        )}
      </div>
      {totalPages > 1 && (
        <div className="flex justify-center gap-10 mt-8 text-sm" style={{ fontFamily: FONT_BODY }}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className={`border-0 bg-transparent cursor-pointer ${page === n ? 'font-bold text-[#332115]' : 'text-[#756F6C]'}`}
              onClick={() => setPage(n)}
            >
              {n}
            </button>
          ))}
        </div>
      )}
    </>
  );
};
