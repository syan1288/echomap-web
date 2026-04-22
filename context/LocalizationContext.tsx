
import React, { createContext, useState, useContext, useCallback, ReactNode } from 'react';
import { translations, Language } from '../localization/translations';

interface LocalizationContextType {
    language: Language;
    toggleLanguage: () => void;
    t: (key: string, options?: { [key: string]: string | number }) => string;
}

const LocalizationContext = createContext<LocalizationContextType | undefined>(undefined);

export const LocalizationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [language, setLanguage] = useState<Language>('en');

    const toggleLanguage = useCallback(() => {
        setLanguage(prevLang => (prevLang === 'en' ? 'zh' : 'en'));
    }, []);

    const t = useCallback((key: string, options?: { [key: string]: string | number }): string => {
        const keyParts = key.split('.');
        let translationNode: any = translations;
        
        for (const part of keyParts) {
            if (translationNode && typeof translationNode === 'object' && part in translationNode) {
                translationNode = translationNode[part];
            } else {
                translationNode = undefined;
                break;
            }
        }
        
        let text = translationNode?.[language] || key;

        if (options) {
            Object.entries(options).forEach(([k, v]) => {
                text = text.replace(`{{${k}}}`, String(v));
            });
        }
        
        return text;
    }, [language]);

    return (
        <LocalizationContext.Provider value={{ language, toggleLanguage, t }}>
            {children}
        </LocalizationContext.Provider>
    );
};

export const useLocalization = (): LocalizationContextType => {
    const context = useContext(LocalizationContext);
    if (context === undefined) {
        throw new Error('useLocalization must be used within a LocalizationProvider');
    }
    return context;
};
