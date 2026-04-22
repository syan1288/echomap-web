
import React, { useEffect } from 'react';
import type { PhotoData } from '../App';
import { useLocalization } from '../context/LocalizationContext';

interface PhotoPreviewModalProps {
    photos: PhotoData[];
    currentIndex: number;
    onClose: () => void;
    onNext: () => void;
    onPrevious: () => void;
}

export const PhotoPreviewModal: React.FC<PhotoPreviewModalProps> = ({ photos, currentIndex, onClose, onNext, onPrevious }) => {
    const { t } = useLocalization();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') {
                onNext();
            } else if (e.key === 'ArrowLeft') {
                onPrevious();
            } else if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [onNext, onPrevious, onClose]);

    if (!photos || photos.length === 0) return null;

    const imageUrl = photos[currentIndex].url;

    return (
        <div 
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" 
            onClick={onClose}
        >
            <img 
                src={imageUrl} 
                alt={t('previewAltText', { current: currentIndex + 1, total: photos.length })}
                className="max-w-full max-h-full object-contain"
                onClick={(e) => e.stopPropagation()} 
            />
            
            <button 
                onClick={onClose} 
                className="absolute top-4 right-4 text-white text-4xl leading-none hover:opacity-80"
                aria-label={t('previewClose')}
            >
                &times;
            </button>

            {photos.length > 1 && (
                <>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onPrevious(); }}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-4xl bg-black/30 rounded-full w-12 h-12 flex items-center justify-center hover:bg-black/60"
                        aria-label={t('previewPrevious')}
                    >
                        &#8249;
                    </button>
                     <button 
                        onClick={(e) => { e.stopPropagation(); onNext(); }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-4xl bg-black/30 rounded-full w-12 h-12 flex items-center justify-center hover:bg-black/60"
                        aria-label={t('previewNext')}
                    >
                        &#8250;
                    </button>
                </>
            )}
        </div>
    );
};
