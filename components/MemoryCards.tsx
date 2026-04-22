
import React, { useLayoutEffect, useRef, useState } from 'react';
import type { PhotoData, ProcessedImage } from '../App';
import { useLocalization } from '../context/LocalizationContext';

interface MemoryCardsProps {
    selectedImage: ProcessedImage;
    map: any;
    onUnlock: () => void;
    onViewPhoto: (photoIndex: number) => void;
    onAddPhoto: () => void;
    onLiveCapture: () => void;
    onEditLog: () => void;
    onDeletePhoto: (memoryId: number, photoIndex: number) => void;
}

const Card: React.FC<{
    children: React.ReactNode;
    onClick: () => void;
    rotation: number;
    ariaLabel: string;
}> = ({ children, onClick, rotation, ariaLabel }) => {
    return (
        <button
            onClick={onClick}
            className="w-14 h-14 bg-white border border-black shadow-md flex items-center justify-center transition-all duration-300 ease-in-out origin-bottom hover:!scale-110 hover:!z-20 hover:-translate-y-2"
            style={{ transform: `rotate(${rotation}deg) scale(1)`}}
            aria-label={ariaLabel}
        >
            {children}
        </button>
    );
};

const PhotoCard: React.FC<{
    photo: PhotoData;
    onClick: () => void;
    onDelete: () => void;
    rotation: number;
}> = ({ photo, onClick, onDelete, rotation }) => {
    const { t } = useLocalization();
    
    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onDelete();
    };

    return (
        <button
            onClick={onClick}
            className="group w-14 h-14 bg-white border border-black shadow-md overflow-hidden transition-all duration-300 ease-in-out origin-bottom hover:!scale-110 hover:!z-20 hover:-translate-y-2 relative"
            style={{ transform: `rotate(${rotation}deg) scale(1)`}}
            aria-label={t('cardsViewPhoto')}
        >
            <img src={photo.url} alt={t('cardsPhotoThumbnailAlt')} className="w-full h-full object-cover" />
             <div 
                onClick={handleDeleteClick}
                className="absolute top-0 right-0 w-5 h-5 bg-black/60 text-white flex items-center justify-center text-sm opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:bg-red-500"
                aria-label={t('cardsDeletePhoto')}
            >
                &times;
            </div>
        </button>
    );
};


export const MemoryCards: React.FC<MemoryCardsProps> = ({
    selectedImage,
    map,
    onUnlock,
    onViewPhoto,
    onAddPhoto,
    onLiveCapture,
    onEditLog,
    onDeletePhoto,
}) => {
    const { t } = useLocalization();
    const cardsRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });

    useLayoutEffect(() => {
        const screenPoint = map.latLngToContainerPoint([selectedImage.lat, selectedImage.lng]);
        const cardsHeight = 80; // Estimated height of the fan
        
        let top = screenPoint.y - selectedImage.height / 2 - cardsHeight;
        
        if (top < 10) { 
            top = screenPoint.y + selectedImage.height / 2 + 15;
        }
        
        setPosition({
            top,
            left: screenPoint.x,
        });

    }, [selectedImage.lat, selectedImage.lng, selectedImage.height, map]);

    const allPhotos = selectedImage.photos || [];
    /** 超过 2 张时只展示最近上传的 2 张缩略图（数组末尾为最新） */
    const maxPhotoSlots = 2;
    const photoStart =
      allPhotos.length > maxPhotoSlots ? allPhotos.length - maxPhotoSlots : 0;
    const photoCards = allPhotos.slice(photoStart);
    const totalCards = 1 + 1 + photoCards.length + 1; // Log, Live capture, Photos, Add
    const angleSpread = Math.min(totalCards * 12, 90);
    const angleStep = totalCards > 1 ? angleSpread / (totalCards - 1) : 0;
    const startAngle = -angleSpread / 2;

    const cards = [
        <Card key="log" onClick={onEditLog} rotation={startAngle} ariaLabel={t('cardsEditLog')}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
        </Card>,
        <Card key="live" onClick={onLiveCapture} rotation={startAngle + angleStep} ariaLabel="Live capture">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
            </svg>
        </Card>,
        ...photoCards.map((photo, slotIdx) => {
          const indexInFull = photoStart + slotIdx;
          return (
            <PhotoCard
              key={photo.photo_id ?? `photo-${indexInFull}`}
              photo={photo}
              onClick={() => onViewPhoto(indexInFull)}
              onDelete={() => onDeletePhoto(selectedImage.id, indexInFull)}
              rotation={startAngle + angleStep * (slotIdx + 2)}
            />
          );
        }),
        <Card key="add" onClick={onAddPhoto} rotation={startAngle + angleStep * (photoCards.length + 2)} ariaLabel={t('cardsAddPhoto')}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </Card>
    ];

    return (
        <div 
            ref={cardsRef}
            className="absolute"
            style={{
                top: `${position.top}px`,
                left: `${position.left}px`,
                transform: 'translateX(-50%)',
                zIndex: 30,
            }}
        >
            <div className="flex items-end justify-center h-24 -space-x-4">
                 {cards}
            </div>
            <button 
                onClick={onUnlock} 
                className="absolute left-1/2 -translate-x-1/2 top-full mt-2 h-10 w-10 p-2 bg-white text-black flex items-center justify-center hover:bg-gray-100 border border-black shadow-lg rounded-full" 
                aria-label={t('cardsUnlock')}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>
            </button>
        </div>
    );
};
