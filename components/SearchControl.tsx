import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocalization } from '../context/LocalizationContext';

const RECENT_KEY = 'echo_map_search_recent';
const MAX_RECENT = 5;

interface SearchControlProps {
  onLocationSelect: (lat: number, lng: number) => void;
}

interface Suggestion {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function writeRecent(q: string) {
  const t = q.trim();
  if (!t) return;
  const prev = readRecent().filter((x) => x.toLowerCase() !== t.toLowerCase());
  const next = [t, ...prev].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export const SearchControl: React.FC<SearchControlProps> = ({ onLocationSelect }) => {
  const { t, language } = useLocalization();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [recent, setRecent] = useState<string[]>(() => readRecent());
  const [isActive, setIsActive] = useState(false);

  const showRecent = isActive && query.length <= 1;

  const fetchSuggestions = useCallback(
    async (searchTerm: string) => {
      if (searchTerm.trim().length < 2) {
        setSuggestions([]);
        return;
      }
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchTerm)}&accept-language=${language}&limit=5`
        );
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data);
        }
      } catch (error) {
        console.error('Failed to fetch location suggestions', error);
      }
    },
    [language]
  );

  useEffect(() => {
    const handler = setTimeout(() => {
      if (!isActive) return;
      if (query.trim().length >= 2) {
        void fetchSuggestions(query);
      } else {
        setSuggestions([]);
        setRecent(readRecent());
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [query, isActive, fetchSuggestions]);

  const listToShow = useMemo(() => {
    if (showRecent) {
      return recent.map((text, i) => ({ type: 'recent' as const, text, key: `r-${i}` }));
    }
    return suggestions.map((s) => ({ type: 'suggest' as const, s, key: String(s.place_id) }));
  }, [showRecent, recent, suggestions]);

  const handleSelect = (suggestion: Suggestion) => {
    const lat = parseFloat(suggestion.lat);
    const lng = parseFloat(suggestion.lon);
    onLocationSelect(lat, lng);
    writeRecent(suggestion.display_name);
    setQuery(suggestion.display_name);
    setSuggestions([]);
    setIsActive(false);
  };

  const handleSelectRecent = (text: string) => {
    setQuery(text);
    setIsActive(true);
    void fetchSuggestions(text);
  };

  const handleSearch = async () => {
    if (suggestions.length > 0) {
      handleSelect(suggestions[0]);
      return;
    }
    if (query.trim().length < 2) return;
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query.trim())}&accept-language=${language}&limit=5`
      );
      if (response.ok) {
        const data: Suggestion[] = await response.json();
        if (data[0]) handleSelect(data[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div
      className="absolute top-[4.25rem] left-1/2 -translate-x-1/2 z-30 px-2"
      style={{ width: 360, maxWidth: 'calc(100% - 16px)' }}
      onBlur={() => setTimeout(() => setIsActive(false), 120)}
    >
      <div className="flex w-full" style={{ height: 44 }}>
        <button
          type="button"
          onClick={handleSearch}
          className="w-11 shrink-0 p-2 text-black bg-white flex items-center justify-center hover:bg-gray-100 border border-black border-r-0 rounded-none"
          style={{ height: 44, width: 44 }}
          aria-label={t('searchButton')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            setIsActive(true);
            setRecent(readRecent());
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSearch();
          }}
          placeholder={t('searchPlaceholder')}
          className="flex-grow min-w-0 box-border px-[14px] border border-black bg-white text-black text-sm placeholder-neutral-600 focus:outline-none rounded-none"
          style={{ height: 44, fontFamily: '"Roboto Mono", ui-monospace, monospace' }}
          aria-label={t('searchPlaceholder')}
          autoComplete="off"
        />
      </div>
      {isActive && listToShow.length > 0 && (
        <ul className="bg-white border border-black border-t-0 max-h-[200px] overflow-y-auto shadow-lg rounded-none">
          {listToShow.map((item) =>
            item.type === 'recent' ? (
              <li
                key={item.key}
                className="px-3 py-2 cursor-pointer hover:bg-gray-100 text-sm"
                style={{ fontFamily: '"Roboto Mono", ui-monospace, monospace' }}
                onMouseDown={() => handleSelectRecent(item.text)}
              >
                {item.text}
              </li>
            ) : (
              <li
                key={item.key}
                className="px-3 py-2 cursor-pointer hover:bg-gray-100 text-sm"
                style={{ fontFamily: '"Roboto Mono", ui-monospace, monospace' }}
                onMouseDown={() => handleSelect(item.s)}
              >
                {item.s.display_name}
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
};
