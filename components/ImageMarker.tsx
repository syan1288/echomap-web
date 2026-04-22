import React, { useState, type CSSProperties } from 'react';
import type { ProcessedImage } from '../App';

interface ImageMarkerProps {
    img: ProcessedImage;
    map: any;
    isSelected: boolean;
    isDragging: boolean;
    animationTick: number;
    previewImageCache: React.MutableRefObject<Record<number, HTMLImageElement>>;
    onInteractionStart: (e: React.MouseEvent<HTMLDivElement>, img: ProcessedImage) => void;
    onAddPhotoToMemory: (memoryId: number, file: File) => void;
    onHoverChange?: (id: number | null) => void;
    /** 随地图 zoom 缩放占位尺寸（约 0.35–1.15） */
    zoomScale?: number;
}

const ImageMarkerComponent: React.FC<ImageMarkerProps> = ({
    img,
    map,
    isSelected,
    isDragging,
    animationTick,
    previewImageCache,
    onInteractionStart,
    onAddPhotoToMemory,
    onHoverChange,
    zoomScale = 1,
}) => {
    const screenPoint = map.latLngToContainerPoint([img.lat, img.lng]);
    const [isDragOver, setIsDragOver] = useState(false);
    
    let imageToDraw: HTMLImageElement | null = img.processedImage;
    if (img.showOriginal && img.sourceFile && img.photos[0]) {
        const cachedOriginal = Object.values(previewImageCache.current).find(cacheImg => cacheImg.src === img.photos[0].url);
        if (cachedOriginal) {
            imageToDraw = cachedOriginal;
        }
    }

    const displaySrc =
        imageToDraw?.src ?? (!img.isGenerating && img.photos[0]?.url ? img.photos[0].url : null);

    const ellipses = ['.', '..', '...'][animationTick % 3];

    const w = Math.max(24, img.width * zoomScale);
    const h = Math.max(24, img.height * zoomScale);

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        if (img.isLocked && e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setIsDragOver(true);
        }
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        if (img.isLocked) {
            e.preventDefault();
            e.stopPropagation(); 
            setIsDragOver(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                onAddPhotoToMemory(img.id, e.dataTransfer.files[0]);
            }
        }
    };

    const ringStyle = (): CSSProperties | null => {
        if (!isSelected) return null;
        const size = img.isLocked ? Math.max(280, Math.max(w, h) + 20) : Math.max(w, h) + 20;
        const base: CSSProperties = {
            width: size,
            height: size,
            borderWidth: 2,
            borderRadius: 9999,
        };
        if (img.isLocked) {
            if (isDragOver) {
                return { ...base, borderStyle: 'solid', borderColor: 'rgba(34, 197, 94, 0.85)' };
            }
            return { ...base, borderStyle: 'dashed', borderColor: 'rgba(0, 0, 0, 0.78)' };
        }
        return { ...base, borderStyle: 'dashed', borderColor: 'rgba(0, 0, 0, 0.85)' };
    };

    const rs = ringStyle();

    return (
        <div
            id={`image-${img.id}`}
            className={`absolute flex items-center justify-center pointer-events-auto ${isDragging ? 'z-20' : 'z-10'}`}
            style={{
                left: 0,
                top: 0,
                width: w,
                height: h,
                transform: `translate(${screenPoint.x - w / 2}px, ${screenPoint.y - h / 2}px)`,
                willChange: 'transform',
                cursor: img.isLocked ? 'pointer' : 'grab'
            }}
            onMouseDown={(e) => onInteractionStart(e, img)}
            onMouseEnter={() => onHoverChange?.(img.id)}
            onMouseLeave={() => onHoverChange?.(null)}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {displaySrc && !img.isGenerating && (
                <img 
                    src={displaySrc} 
                    className="max-w-none"
                    style={{
                        width: '100%', height: '100%',
                        transform: img.flippedHorizontally ? 'scaleX(-1)' : 'none',
                    }}
                    draggable="false"
                />
            )}
            {img.isGenerating && (
                 <div className="absolute inset-0">
                    {img.photos[0]?.url && (
                        <img
                            src={img.photos[0].url}
                            className="w-full h-full object-cover"
                            style={{ filter: 'blur(4px)', opacity: 0.6 }}
                            draggable="false"
                        />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center text-3xl font-mono text-white" style={{ textShadow: '0 0 5px black' }}>
                        {ellipses}
                    </div>
                </div>
            )}
            {isSelected && rs && (
                <div className="absolute rounded-full pointer-events-none" style={rs} />
            )}
        </div>
    );
};

export const ImageMarker = React.memo(ImageMarkerComponent);