import React, { useState, useEffect, useCallback } from 'react';
import type { LogData } from '../App';
import { MoonFaceAvatar } from './MoonFaceAvatar';
import { MOON_FACE_MODE_COUNT, normalizeAvatarVariant } from '../utils/moonFacehash';

const FONT_TITLE = '"Roboto Mono", ui-monospace, monospace';
const FONT_BODY = '"Roboto Mono", ui-monospace, monospace';

interface TravelLogModalProps {
  log: LogData;
  onSave: (updatedLog: LogData) => void;
  onClose: () => void;
}

const MOON_PLACEHOLDER = 'Type your moon……';

export const TravelLogModal: React.FC<TravelLogModalProps> = ({ log, onSave, onClose }) => {
  const [currentLog, setCurrentLog] = useState<LogData>(() => ({
    ...log,
    partner: log.partner ?? '',
    moon: log.moon ?? '',
    avatarVariant: log.avatarVariant ?? 0,
  }));

  useEffect(() => {
    setCurrentLog({
      ...log,
      partner: log.partner ?? '',
      moon: log.moon ?? '',
      avatarVariant: log.avatarVariant ?? 0,
    });
  }, [log]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'moon') {
      if (value.length > 64) return;
      setCurrentLog((prev) => ({ ...prev, moon: value }));
      return;
    }
    setCurrentLog((prev) => ({ ...prev, [name]: value }));
  };

  const handleNextVariant = useCallback(() => {
    setCurrentLog((prev) => ({
      ...prev,
      avatarVariant: ((prev.avatarVariant ?? 0) + 1) % MOON_FACE_MODE_COUNT,
    }));
  }, []);

  const handleSave = () => {
    const moon = currentLog.moon.trim();
    if (moon.length > 64) return;
    onSave({
      ...currentLog,
      moon,
      musings: currentLog.musings,
      avatarVariant: normalizeAvatarVariant(currentLog.avatarVariant),
    });
  };

  const moonOk = currentLog.moon.trim().length >= 1 && currentLog.moon.trim().length <= 64;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white p-6 border border-black shadow-lg text-black w-full max-w-md flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: FONT_BODY, fontWeight: 400 }}
      >
        <button
          type="button"
          className="self-start text-sm text-neutral-600 bg-transparent border-0 cursor-pointer mb-1"
          style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}
          onClick={onClose}
        >
          &lt; Back to map
        </button>

        <div className="flex flex-col gap-1">
          <label htmlFor="m02-date" className="text-sm" style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}>
            Date
          </label>
          <div className="relative">
            <input
              type="text"
              id="m02-date"
              name="date"
              value={currentLog.date}
              onChange={handleChange}
              className="w-full h-10 box-border px-3 py-2 pr-10 border border-black bg-white text-black text-sm rounded-none"
              placeholder="YYYY/MM/DD"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="5" width="18" height="16" rx="1" />
                <path d="M8 3v4M16 3v4M3 11h18" />
              </svg>
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="m02-partner" className="text-sm" style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}>
            Partner
          </label>
          <input
            type="text"
            id="m02-partner"
            name="partner"
            value={currentLog.partner}
            onChange={handleChange}
            className="w-full h-10 box-border px-3 py-2 border border-black bg-white text-black text-sm rounded-none"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="m02-moon" className="text-sm" style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}>
            Moon
          </label>
          <div className="flex items-stretch gap-2">
            <input
              type="text"
              id="m02-moon"
              name="moon"
              value={currentLog.moon}
              onChange={handleChange}
              maxLength={64}
              className="min-w-0 h-10 flex-1 box-border px-3 py-2 border border-black bg-white text-black text-sm rounded-none placeholder:text-neutral-400"
              placeholder={MOON_PLACEHOLDER}
            />
            <div className="shrink-0 overflow-hidden border border-black bg-white">
              {moonOk ? (
                <MoonFaceAvatar
                  moon={currentLog.moon}
                  avatarVariant={currentLog.avatarVariant}
                  size={40}
                  interactive={false}
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center bg-neutral-100 text-[10px] text-neutral-400">
                  {' '}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleNextVariant}
              className="flex h-10 w-10 shrink-0 items-center justify-center border border-black bg-white hover:bg-neutral-100 rounded-none"
              aria-label="Switch moon avatar style"
              disabled={!moonOk}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 21h5v-5" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="m02-musings" className="text-sm" style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}>
            Just writing
          </label>
          <textarea
            id="m02-musings"
            name="musings"
            value={currentLog.musings}
            onChange={handleChange}
            rows={6}
            className="w-full box-border px-3 py-2 border border-black bg-white text-black text-sm rounded-none placeholder-neutral-600"
          />
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-black bg-white text-black text-sm hover:bg-gray-100 rounded-none"
            style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 border border-black bg-white text-black text-sm hover:bg-gray-100 rounded-none"
            style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
