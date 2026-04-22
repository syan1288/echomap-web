
import React from 'react';
import { useLocalization } from '../context/LocalizationContext';

interface HelpModalProps {
    onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
    const { t } = useLocalization();

    return (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-white p-6 border border-black shadow-lg font-mono text-black text-sm flex flex-col gap-4 max-w-sm" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg text-center font-bold">{t('helpTitle')}</h3>
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                    <span className="font-bold text-right">{t('helpDragMapKey')}:</span><span>{t('helpDragMapValue')}</span>
                    <span className="font-bold text-right">{t('helpMouseWheelKey')}:</span><span>{t('helpMouseWheelValue')}</span>
                    <span className="font-bold text-right">R:</span><span>{t('helpRegenerate')}</span>
                    <span className="font-bold text-right">F:</span><span>{t('helpFlip')}</span>
                    <span className="font-bold text-right">D:</span><span>{t('helpDuplicate')}</span>
                    <span className="font-bold text-right">O:</span><span>{t('helpShowOriginal')}</span>
                    <span className="font-bold text-right">+/-:</span><span>{t('helpScale')}</span>
                    <span className="font-bold text-right">{t('helpDeleteKey')}:</span><span>{t('helpDelete')}</span>
                    <span className="font-bold text-right">{t('helpArrowKeysKey')}:</span><span>{t('helpArrowKeysValue')}</span>
                </div>
                <div className="pt-4 border-t border-gray-200 space-y-2">
                  <p className="text-xs font-bold m-0">{t('helpAiTitle')}</p>
                  <p className="text-xs text-gray-600 m-0 leading-snug">{t('helpAiBody')}</p>
                </div>
                <div className="text-xs text-gray-500 text-center pt-2 border-t border-gray-200">{t('helpFooter')}</div>
            </div>
        </div>
    );
};
