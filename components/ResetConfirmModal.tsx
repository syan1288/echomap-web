
import React from 'react';
import { useLocalization } from '../context/LocalizationContext';

interface ResetConfirmModalProps {
    onConfirm: () => void;
    onCancel: () => void;
}

export const ResetConfirmModal: React.FC<ResetConfirmModalProps> = ({ onConfirm, onCancel }) => {
    const { t } = useLocalization();

    return (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-8 border border-black shadow-lg flex flex-col items-center gap-4">
                <p className="text-lg font-mono text-black">{t('resetConfirmTitle')}</p>
                <div className="flex gap-4">
                    <button onClick={onConfirm} className="px-4 py-2 border border-black bg-black text-white font-mono text-sm hover:bg-neutral-800 transition-colors">{t('confirm')}</button>
                    <button onClick={onCancel} className="px-4 py-2 border border-black bg-white text-black font-mono text-sm transition-colors">{t('cancel')}</button>
                </div>
            </div>
        </div>
    );
};
