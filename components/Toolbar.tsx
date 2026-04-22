
import React, { useState, useLayoutEffect, useRef } from 'react';
import type { ProcessedImage } from '../App';
import { useLocalization } from '../context/LocalizationContext';

interface ToolbarProps {
    selectedImage: ProcessedImage;
    map: any;
    onRegenerate: () => void;
    onFlip: () => void;
    onDuplicate: () => void;
    onScale: (factor: number) => void;
    onDelete: () => void;
    onEdit: (prompt: string) => void;
    onLock: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
    selectedImage,
    map,
    onRegenerate,
    onFlip,
    onDuplicate,
    onScale,
    onDelete,
    onEdit,
    onLock
}) => {
    const { t } = useLocalization();
    const [editText, setEditText] = useState('');
    const toolbarRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 0, transform: 'translateX(-50%)' });
    
    const isActionDisabled = selectedImage.isGenerating;

    useLayoutEffect(() => {
        const screenPoint = map.latLngToContainerPoint([selectedImage.lat, selectedImage.lng]);
        const toolbarHeight = toolbarRef.current?.offsetHeight || 200; // Estimate height
        const viewportHeight = window.innerHeight;

        const spaceBelow = viewportHeight - (screenPoint.y + selectedImage.height / 2);
        
        let top: number;
        if (spaceBelow < toolbarHeight) {
            // Not enough space below, position above
            top = screenPoint.y - selectedImage.height / 2 - toolbarHeight - 15;
        } else {
            // Position below
            top = screenPoint.y + selectedImage.height / 2 + 15;
        }
        
        setPosition({
            top,
            left: screenPoint.x,
            transform: 'translateX(-50%)'
        });

    }, [selectedImage.lat, selectedImage.lng, selectedImage.height, map, editText]); // Rerun when position or content changes

    const handleEdit = () => {
        const trimmed = editText.trim();
        if (trimmed) {
            onEdit(trimmed);
            setEditText('');
        }
    };
    
    return (
        <div 
            ref={toolbarRef}
            className="absolute flex flex-col items-center gap-2" 
            style={{ 
                top: `${position.top}px`, 
                left: `${position.left}px`, 
                transform: position.transform, 
                zIndex: 30,
                willChange: 'transform, top, left'
            }}
        >
            <div className="flex flex-nowrap bg-white border border-black">
                <button onClick={onRegenerate} disabled={isActionDisabled} className="h-12 w-12 p-2 text-black disabled:opacity-30 flex items-center justify-center hover:bg-gray-100 border-r border-black" aria-label={t('toolbarRotate')}><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v6h6"/><path d="M21 12A9 9 0 0 0 6 5.3L3 8"/><path d="M21 22v-6h-6"/><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"/></svg></button>
                <button onClick={onFlip} disabled={isActionDisabled} className="h-12 w-12 p-2 text-black disabled:opacity-30 flex items-center justify-center hover:bg-gray-100 border-r border-black" aria-label={t('toolbarMirror')}><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 7 5 5-5 5V7"/><path d="m21 7-5 5 5 5V7"/><path d="M12 20v-2M12 16v-2M12 12V3"/></svg></button>
                <button onClick={onDuplicate} disabled={isActionDisabled} className="h-12 w-12 p-2 text-black disabled:opacity-30 flex items-center justify-center hover:bg-gray-100 border-r border-black" aria-label={t('toolbarDuplicate')}><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
                <button onClick={onDelete} disabled={isActionDisabled} className="h-12 w-12 p-2 text-black disabled:opacity-30 flex items-center justify-center hover:bg-gray-100 border-r border-black" aria-label={t('toolbarDelete')}><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
                <button onClick={() => onScale(1.1)} disabled={isActionDisabled} className="h-12 w-12 p-2 text-black disabled:opacity-30 flex items-center justify-center hover:bg-gray-100 border-r border-black" aria-label={t('toolbarScaleUp')}><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
                <button onClick={() => onScale(1/1.1)} disabled={isActionDisabled} className="h-12 w-12 p-2 text-black disabled:opacity-30 flex items-center justify-center hover:bg-gray-100 border-r border-black" aria-label={t('toolbarScaleDown')}><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
                <button onClick={onLock} disabled={isActionDisabled} className="h-12 w-12 p-2 text-black disabled:opacity-30 flex items-center justify-center hover:bg-gray-100" aria-label={t('toolbarLock')}><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></button>
            </div>
            {!selectedImage.isGenerating && (
                <div className="flex w-full mt-2">
                    <input type="text" value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleEdit(); }} placeholder={t('toolbarEditPlaceholder')} className="flex-grow h-11 box-border px-3 py-2 border border-black bg-white text-black text-sm placeholder-neutral-600 focus:outline-none" disabled={isActionDisabled}/>
                    <button onClick={handleEdit} disabled={isActionDisabled || !editText.trim()} className="h-11 w-12 p-2 text-black bg-white disabled:opacity-30 flex items-center justify-center hover:bg-gray-100 border-t border-b border-r border-black" aria-label={t('toolbarApplyEdit')}><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.21 1.21 0 0 0 1.72 0L21.64 5.36a1.21 1.21 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 18h-4"/><path d="M11 3H9"/></svg></button>
                </div>
            )}
        </div>
    );
};
