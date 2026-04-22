
import React from 'react';
import { useLocalization } from '../context/LocalizationContext';

interface ImportConfirmModalProps {
    onConfirm: () => void;
    onCancel: () => void;
}

export const ImportConfirmModal: React.FC<ImportConfirmModalProps> = ({ onConfirm, onCancel }) => {
    const { t } = useLocalization();

    return (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-8 border border-black shadow-lg flex flex-col items-center gap-6 max-w-sm text-center">
                <p className="text-lg font-mono text-black">{t('importConfirmTitle')}</p>
                <p className="text-sm font-mono text-neutral-600">{t('importConfirmMessage')}</p>
                <div className="flex gap-4">
                    <button onClick={onConfirm} className="px-4 py-2 border border-black bg-black text-white font-mono text-sm hover:bg-neutral-800 transition-colors">{t('confirm')}</button>
                    <button onClick={onCancel} className="px-4 py-2 border border-black bg-white text-black font-mono text-sm hover:bg-gray-100 transition-colors">{t('cancel')}</button>
                </div>
            </div>
        </div>
    );
};
