import React, { useCallback, useState } from 'react';
import { useLocalization } from '../context/LocalizationContext';
import { assertFileSizeOk } from '../constants/uploadLimits';
import {
  BUILDING_STYLE_OPTIONS,
  DEFAULT_BUILDING_STYLE,
  type BuildingStyleId,
} from '../prompts/buildingStyle';

const STYLE_I18N_KEY: Record<BuildingStyleId, string> = {
  flat: 'buildingStyle_flat',
  pixel: 'buildingStyle_pixel',
  ink: 'buildingStyle_ink',
  healing: 'buildingStyle_healing',
};

export interface AddBuildingModalProps {
  open: boolean;
  onClose: () => void;
  /** buildingName：无 EXIF 时用于 /api/geocode 推断落点；buildingStyle 写入 Vertex systemInstruction */
  onSave: (file: File, buildingName: string, buildingStyle: BuildingStyleId) => void;
}

export const AddBuildingModal: React.FC<AddBuildingModalProps> = ({ open, onClose, onSave }) => {
  const { t } = useLocalization();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [buildingName, setBuildingName] = useState('');
  const [buildingStyle, setBuildingStyle] = useState<BuildingStyleId>(DEFAULT_BUILDING_STYLE);
  const [sizeError, setSizeError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setFile(null);
    setBuildingName('');
    setBuildingStyle(DEFAULT_BUILDING_STYLE);
    setSizeError(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const onPickFile = (f: File | null) => {
    setSizeError(null);
    if (f) {
      const chk = assertFileSizeOk(f);
      if (!chk.ok) {
        setSizeError(t('toastFileTooLarge'));
        setPreviewUrl((prevUrl) => {
          if (prevUrl) URL.revokeObjectURL(prevUrl);
          setFile(null);
          return null;
        });
        return;
      }
    }
    setPreviewUrl((prevUrl) => {
      if (prevUrl) URL.revokeObjectURL(prevUrl);
      if (!f || !f.type.startsWith('image/')) {
        setFile(null);
        return null;
      }
      setFile(f);
      return URL.createObjectURL(f);
    });
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="m01-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="bg-white w-full max-w-[720px] border border-black shadow-xl flex flex-col gap-6 p-6 rounded-none"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ fontFamily: '"Roboto Mono", ui-monospace, monospace' }}
      >
        <button
          type="button"
          className="self-start text-sm text-[#756F6C] bg-transparent border-0 cursor-pointer transition-colors duration-200"
          style={{ fontWeight: 600 }}
          onClick={handleClose}
        >
          &lt; Back to map
        </button>

        <h2 id="m01-title" className="sr-only">
          Add building
        </h2>

        <div className="flex flex-wrap gap-3 justify-center">
          <button
            type="button"
            className="px-4 py-2 border border-black bg-white text-sm hover:bg-neutral-100 rounded-none"
            style={{ fontWeight: 600 }}
            onClick={() => document.getElementById('m01-local-file')?.click()}
          >
            From Local
          </button>
          <a
            href="https://drive.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 border border-black bg-white text-sm hover:bg-neutral-100 rounded-none no-underline text-black"
            style={{ fontWeight: 600 }}
          >
            Google Drive
          </a>
        </div>

        {sizeError && <p className="text-xs text-red-600 m-0">{sizeError}</p>}

        <label className="block">
          <div
            className="relative flex items-center justify-center border border-dashed border-black/35 bg-[#fafafa] min-h-[420px] cursor-pointer overflow-hidden rounded-none"
            style={{ minHeight: 420 }}
          >
            <input
              id="m01-local-file"
              type="file"
              accept="image/*"
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
            {previewUrl ? (
              <img src={previewUrl} alt="" className="max-h-[420px] w-auto object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-[#756F6C] text-sm">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="8.5" cy="10.5" r="1.5" />
                  <path d="M21 17l-5-5-4 4-3-3-4 4" />
                </svg>
                <span>Drop or click to upload a travel photo</span>
              </div>
            )}
          </div>
        </label>

        <div>
          <label className="block text-sm font-semibold text-[#332115] mb-1" htmlFor="m01-building-name" style={{ fontWeight: 600 }}>
            Building name...
          </label>
          <input
            id="m01-building-name"
            className="w-full h-11 px-3 border border-black bg-white text-[#332115] text-sm outline-none rounded-none focus:ring-2 focus:ring-[#0053D4]/35"
            value={buildingName}
            placeholder="Building name..."
            onChange={(e) => setBuildingName(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#332115] mb-1" htmlFor="m01-building-style" style={{ fontWeight: 600 }}>
            {t('buildingStyleLabel')}
          </label>
          <div className="relative">
            <select
              id="m01-building-style"
              className="w-full h-11 pl-3 pr-10 border border-black bg-white text-[#332115] text-sm outline-none rounded-none focus:ring-2 focus:ring-[#0053D4]/35 appearance-none cursor-pointer"
              value={buildingStyle}
              onChange={(e) => setBuildingStyle(e.target.value as BuildingStyleId)}
              aria-label={t('buildingStyleLabel')}
            >
              {BUILDING_STYLE_OPTIONS.map(({ id }) => (
                <option key={id} value={id}>
                  {t(STYLE_I18N_KEY[id])}
                </option>
              ))}
            </select>
            <span
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#756F6C] text-xs"
              aria-hidden
            >
              ▼
            </span>
          </div>
        </div>

        <p className="text-[11px] text-neutral-500 m-0 leading-snug">{t('addBuildingAiNote')}</p>

        <div className="flex justify-end gap-3 pt-2 border-t border-black/10">
          <button
            type="button"
            className="px-5 py-2 border border-black bg-white text-black text-sm hover:bg-neutral-100 rounded-none disabled:opacity-40"
            style={{ fontWeight: 600 }}
            disabled={!file}
            onClick={() => {
              if (!file) return;
              onSave(file, buildingName.trim(), buildingStyle);
              reset();
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
