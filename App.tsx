
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as Tone from 'tone';
import { generateImageWithPrompt } from './services/geminiService';
import { assertFileSizeOk } from './constants/uploadLimits';
import { ImageMarker } from './components/ImageMarker';
import { PoiDotMarker } from './components/PoiDotMarker';
import { Toolbar } from './components/Toolbar';
import { ResetConfirmModal } from './components/ResetConfirmModal';
import { ImportConfirmModal } from './components/ImportConfirmModal';
import { MemoryCards } from './components/MemoryCards';
import { PhotoPreviewModal } from './components/PhotoPreviewModal';
import { TravelLogModal } from './components/TravelLogModal';
import { HelpModal } from './components/HelpModal';
import { useLocalization } from './context/LocalizationContext';
import { SearchControl } from './components/SearchControl';
import { ClusterBubble, Cluster } from './components/ClusterBubble';
import { EchoSidebar } from './components/EchoSidebar';
import Shuffle from './components/Shuffle';
import { AddBuildingModal } from './components/AddBuildingModal';
import { GallerySection } from './components/GallerySection';
import { continentKeyFromLatLng } from './utils/geoStats';
import { buildGeocodeQueries, hasGeographicHint } from './utils/geoFromBuildingName';
import { GalleryDetailModals } from './components/GalleryDetailModals';
import { AuthPanel } from './components/AuthPanel';
import { resolveSessionAnchor, formatCityCountry } from './services/sessionGeo';
import { normalizeLog } from './utils/normalizeLog';
import { DEFAULT_BUILDING_STYLE, isBuildingStyleId, type BuildingStyleId } from './prompts/buildingStyle';
import type { LogData, PhotoData, ProcessedImage } from './types/memory';
import { useAuth } from './context/AuthContext';
import {
  loadAllCloudBuildings,
  saveBuildingToCloud,
  deleteBuildingFromCloud,
  isSupabaseConfigured,
} from './services/cloudBuildings';
import { apiUrl } from './lib/apiBase';

export type { LogData, PhotoData, ProcessedImage } from './types/memory';

/** 侧栏地理文案：Roboto 作为 Google Sans 的可加载替代 */
const FONT_GOOGLE_SANS = '"Roboto", "Google Sans", system-ui, sans-serif';

// --- TYPE DECLARATIONS for global libraries ---
declare const L: any;
declare const EXIF: any;

// --- SOUND DEFINITIONS ---
const synth = new Tone.Synth({
  oscillator: { type: 'sine' },
  envelope: {
    attack: 0.01,
    decay: 0.2,
    sustain: 0,
    release: 0.2,
  },
}).toDestination();


const ensureAudioContext = async () => {
    if (Tone.context.state !== 'running') {
        await Tone.start();
    }
};


// --- PROMPT DEFINITIONS ---
const PROMPT_STYLE_GUIDANCE = "The style must be 3D isometric pixel art. The object must be isolated on a plain white background with no shadows. Do not include any explanatory text in the response; output only the final image.";
const EDIT_PROMPT_TEMPLATE = (input: string) => `${input}. ${PROMPT_STYLE_GUIDANCE}`;


const IMAGE_WIDTH = 120; 

const COLOR_DISTANCE_THRESHOLD = 20;
const MOVE_AMOUNT = 0.001; // Lat/Lng move amount for keyboard
const CLUSTER_ZOOM_THRESHOLD = 6;
const CLUSTER_RADIUS_PX = 90;
/** 小于等于该 zoom 时地图仅显示黑色 POI 圆点，不显示建筑立绘 */
const POI_DOT_ZOOM_THRESHOLD = 5;

/** Demo landmarks (locked). Set to false to start with an empty map. */
const ECHO_SEED_DEMO_BUILDINGS = true;

/** 空状态文案在可被滚轮/拖拽/地图点击等「被动」清除前，最短展示时长（ms） */
const EMPTY_HINT_PASSIVE_MS = 18_000;

export type MapDisplayItem = ProcessedImage | Cluster;

interface ImageProcessingResult {
    transparentImage: HTMLImageElement;
    contentBounds: { x: number; y: number; width: number; height: number; };
}

interface PhotoPreviewState {
    photos: PhotoData[];
    currentIndex: number;
}

// --- HELPER FUNCTIONS ---

const getExifData = (file: File): Promise<{ lat: number; lng: number; date: string } | null> => {
    return new Promise((resolve) => {
        EXIF.getData(file, function(this: any) {
            try {
                const lat = EXIF.getTag(this, "GPSLatitude");
                const lng = EXIF.getTag(this, "GPSLongitude");
                const latRef = EXIF.getTag(this, "GPSLatitudeRef");
                const lngRef = EXIF.getTag(this, "GPSLongitudeRef");

                let dateStr: string | null = EXIF.getTag(this, "DateTimeOriginal");
                if (dateStr) {
                    const parts = dateStr.split(' ')[0].split(':');
                    dateStr = `${parts[0]}-${parts[1]}-${parts[2]}`;
                } else {
                    dateStr = new Date().toISOString().split('T')[0];
                }

                if (!lat || !lng || !latRef || !lngRef) {
                    resolve(null);
                    return;
                }

                const dmsToDd = (dms: number[], ref: 'N' | 'S' | 'E' | 'W'): number => {
                    const dd = dms[0] + dms[1] / 60 + dms[2] / 3600;
                    return (ref === 'S' || ref === 'W') ? -dd : dd;
                };

                const latitude = dmsToDd(lat, latRef);
                const longitude = dmsToDd(lng, lngRef);
                
                resolve({ lat: latitude, lng: longitude, date: dateStr });

            } catch(e) {
                console.error("Error reading EXIF data", e);
                resolve(null);
            }
        });
    });
};

const reverseGeocode = async (lat: number, lng: number, lang: 'en' | 'zh'): Promise<string> => {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=${lang}&zoom=18`);
        if (!response.ok) return "An interesting place";

        const data = await response.json();
        const { address } = data;

        if (!address) {
            return data.display_name || "A wonderful location";
        }

        const poi = address.tourism || address.amenity || address.shop || address.historic || address.public_building || data.name;
        const city = address.city || address.town || address.village;
        const country = address.country;
        
        if (poi && city) {
            return `${poi}, ${city}`;
        }
        
        if (city && country) {
            return `${city}, ${country}`;
        }
        
        return data.display_name || "A wonderful location";

    } catch (error) {
        console.error("Reverse geocoding failed", error);
        return "A wonderful location";
    }
};


const processImageForTransparency = (imageUrl: string): Promise<ImageProcessingResult> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return reject(new Error('Could not get 2d context'));
      
      ctx.drawImage(img, 0, 0);
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        const corners = [
          [0, 0],
          [canvas.width - 1, 0],
          [0, canvas.height - 1],
          [canvas.width - 1, canvas.height - 1],
        ] as const;
        const cornerColors = corners.map(([x, y]) => {
          const idx = (y * canvas.width + x) * 4;
          return [data[idx], data[idx + 1], data[idx + 2]] as const;
        });
        const bgR = Math.round(cornerColors.reduce((sum, [r]) => sum + r, 0) / cornerColors.length);
        const bgG = Math.round(cornerColors.reduce((sum, [, g]) => sum + g, 0) / cornerColors.length);
        const bgB = Math.round(cornerColors.reduce((sum, [, , b]) => sum + b, 0) / cornerColors.length);
        const thresholdSquared = COLOR_DISTANCE_THRESHOLD * COLOR_DISTANCE_THRESHOLD;
        const visited = new Uint8Array(canvas.width * canvas.height);
        const queue: number[] = [];

        const nearWhite = (r: number, g: number, b: number) => r >= 238 && g >= 238 && b >= 238;
        const nearBackground = (r: number, g: number, b: number) =>
          (r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2 < thresholdSquared || nearWhite(r, g, b);

        const pushIfMatch = (x: number, y: number) => {
          if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
          const pos = y * canvas.width + x;
          if (visited[pos]) return;
          const idx = pos * 4;
          if (!nearBackground(data[idx], data[idx + 1], data[idx + 2])) return;
          visited[pos] = 1;
          queue.push(pos);
        };

        let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;

        for (let x = 0; x < canvas.width; x++) {
          pushIfMatch(x, 0);
          pushIfMatch(x, canvas.height - 1);
        }
        for (let y = 0; y < canvas.height; y++) {
          pushIfMatch(0, y);
          pushIfMatch(canvas.width - 1, y);
        }

        while (queue.length) {
          const pos = queue.shift()!;
          const idx = pos * 4;
          data[idx + 3] = 0;
          const x = pos % canvas.width;
          const y = Math.floor(pos / canvas.width);
          pushIfMatch(x - 1, y);
          pushIfMatch(x + 1, y);
          pushIfMatch(x, y - 1);
          pushIfMatch(x, y + 1);
        }

        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] === 0) continue;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          if (nearWhite(r, g, b)) {
            data[i + 3] = 0;
          }
        }
        
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                if (data[(y * canvas.width + x) * 4 + 3] > 0) {
                    if (x < minX) minX = x; if (x > maxX) maxX = x;
                    if (y < minY) minY = y; if (y > maxY) maxY = y;
                }
            }
        }

        ctx.putImageData(imageData, 0, 0);
        
        const transparentImage = new Image();
        transparentImage.src = canvas.toDataURL();
        transparentImage.onload = () => {
            const contentBounds = (maxX >= minX && maxY >= minY) 
                ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
                : { x: 0, y: 0, width: canvas.width, height: canvas.height };
            resolve({ transparentImage, contentBounds });
        };
        transparentImage.onerror = (err) => reject(err);
      } catch (error) {
         console.error("Error processing image for transparency:", error);
         resolve({ transparentImage: img, contentBounds: { x: 0, y: 0, width: img.width, height: img.height }});
      }
    };
    img.onerror = (err) => reject(err);
    img.src = imageUrl;
  });
};

export const imageElementToFile = async (imageElement: HTMLImageElement, fileName: string): Promise<File> => {
    const canvas = document.createElement('canvas');
    canvas.width = imageElement.naturalWidth;
    canvas.height = imageElement.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not get 2d context for image conversion");
    ctx.drawImage(imageElement, 0, 0);
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) resolve(new File([blob], fileName, { type: 'image/png' }));
            else reject(new Error("Canvas to Blob conversion failed"));
        }, 'image/png');
    });
};

// --- DATA CONVERSION HELPERS for EXPORT/IMPORT ---
const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

const imageElementToBase64 = (imageElement: HTMLImageElement): string => {
    const canvas = document.createElement('canvas');
    canvas.width = imageElement.naturalWidth;
    canvas.height = imageElement.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not get 2d context for image conversion");
    ctx.drawImage(imageElement, 0, 0);
    return canvas.toDataURL('image/png');
};

const base64ToImageElement = (base64: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(err);
        img.src = base64;
    });
};

const base64ToFile = async (base64: string, filename: string): Promise<File> => {
    const res = await fetch(base64);
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type });
};


const App: React.FC = () => {
  const { t, language, toggleLanguage } = useLocalization();
  const { user } = useAuth();
  const [images, setImages] = useState<ProcessedImage[]>([]);
  const [cloudBusy, setCloudBusy] = useState(false);
  const prevCloudSnapRef = useRef<ProcessedImage[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [draggingImage, setDraggingImage] = useState<{ id: number; startX: number; startY: number; startLat: number; startLng: number } | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null);
  const nextId = useRef(0);
  const previewImageCache = useRef<Record<number, HTMLImageElement>>({});
  const prevImagesRef = useRef<ProcessedImage[]>([]);
  const [animationTick, setAnimationTick] = useState(0);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importFileContent, setImportFileContent] = useState<string | null>(null);
  const [placementInfo, setPlacementInfo] = useState<{
    file: File;
    buildingName?: string;
    buildingStyle?: BuildingStyleId;
  } | null>(null);
  const [mapExplored, setMapExplored] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [photoPreviewState, setPhotoPreviewState] = useState<PhotoPreviewState | null>(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const memoryToAddPhotoTo = useRef<number | null>(null);
  const [isLoading, setIsLoading] = useState<{ active: boolean; message: string } | null>(null);

  const [echoTab, setEchoTab] = useState<'home' | 'gallery'>('home');
  const [showAddBuildingModal, setShowAddBuildingModal] = useState(false);
  const [hoveredImageId, setHoveredImageId] = useState<number | null>(null);
  const [galleryDetailId, setGalleryDetailId] = useState<number | null>(null);
  const [galleryOpenM03, setGalleryOpenM03] = useState(false);
  const [galleryOpenM04, setGalleryOpenM04] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const memoryCaptureInputRef = useRef<HTMLInputElement>(null);
  const sessionAnchorRef = useRef<{ lat: number; lng: number } | null>(null);
  const seedDoneRef = useRef(false);
  /** 空状态文案展示期间，与 EMPTY_HINT_PASSIVE_MS 对齐的解锁时间戳 */
  const emptyHintVisibleRef = useRef(false);
  const passiveDismissUnlockAtRef = useRef(0);

  const mapRef = useRef<any | null>(null);
  const tileLayerRef = useRef<any | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const [statsFade, setStatsFade] = useState(0.48);
  const [mapState, setMapState] = useState({ isReady: false });
  /** 仅开发：检测 Vite 中间件 /api 是否可达与生成凭证 */
  const [devEchoApiHint, setDevEchoApiHint] = useState<string | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(apiUrl('/api/echo-health'));
        if (cancelled) return;
        if (!r.ok) {
          setDevEchoApiHint(
            'DEV: 无法访问本地 API（/api/* 404）。请在 echomap-web 目录运行 npm run dev 或 npm run preview，并用终端打印的 http://localhost 地址打开，勿直接打开 dist/index.html。'
          );
          return;
        }
        const j = (await r.json()) as { generateConfigured?: boolean };
        if (!j.generateConfigured) {
          setDevEchoApiHint(
            'DEV: 未配置 GEMINI_API_KEY 或 Vertex（.env）。地名搜索仍可用；3D 生成会失败直至配置密钥。'
          );
        }
      } catch {
        if (!cancelled) {
          setDevEchoApiHint('DEV: 无法连接本地 API。请在 echomap-web 下运行 npm run dev。');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedImage = useMemo(() =>
    selectedImageId !== null ? images.find(img => img.id === selectedImageId) : null,
    [images, selectedImageId]
  );

  const itemsToDisplay = useMemo((): MapDisplayItem[] => {
    if (!mapRef.current || !mapState.isReady) {
        return images;
    }

    const zoom = mapRef.current.getZoom();
    if (zoom <= POI_DOT_ZOOM_THRESHOLD) {
      return images;
    }
    if (zoom > CLUSTER_ZOOM_THRESHOLD) {
      return images;
    }

    const clusters: Cluster[] = [];
    const clusteredImageIds = new Set<number>();

    const imagesToProcess = [...images].sort((a, b) => b.id - a.id);

    for (const image of imagesToProcess) {
      if (clusteredImageIds.has(image.id)) {
        continue;
      }

      const currentClusterMembers: ProcessedImage[] = [image];
      const screenPoint1 = mapRef.current.latLngToContainerPoint([image.lat, image.lng]);

      for (const otherImage of imagesToProcess) {
        if (otherImage.id === image.id || clusteredImageIds.has(otherImage.id)) {
          continue;
        }

        const screenPoint2 = mapRef.current.latLngToContainerPoint([otherImage.lat, otherImage.lng]);
        const distance = Math.sqrt(
          Math.pow(screenPoint1.x - screenPoint2.x, 2) +
          Math.pow(screenPoint1.y - screenPoint2.y, 2)
        );

        if (distance < CLUSTER_RADIUS_PX) {
          currentClusterMembers.push(otherImage);
        }
      }

      if (currentClusterMembers.length > 1) {
        currentClusterMembers.forEach(member => clusteredImageIds.add(member.id));
        
        const latitudes = currentClusterMembers.map(img => img.lat);
        const longitudes = currentClusterMembers.map(img => img.lng);

        clusters.push({
          id: `cluster-${image.id}`,
          images: currentClusterMembers,
          lat: latitudes.reduce((a, b) => a + b, 0) / latitudes.length,
          lng: longitudes.reduce((a, b) => a + b, 0) / longitudes.length,
          count: currentClusterMembers.length,
          representativeImage: image,
        });
      }
    }
    
    const unclusteredImages = images.filter(img => !clusteredImageIds.has(img.id));

    return [...clusters, ...unclusteredImages];
  }, [images, mapState]);
  
  // --- MAP INITIALIZATION ---
  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [15, 0],
        zoom: 2,
        minZoom: 1,
        maxZoom: 18,
        worldCopyJump: true,
        zoomControl: false,
      });
      
      const updateMapState = () => setMapState(prev => ({...prev}));
      map.on('move', updateMapState);
      map.on('zoom', updateMapState);
      
      mapRef.current = map;
      map.whenReady(() => {
        const kick = () => map.invalidateSize({ animate: false });
        kick();
        requestAnimationFrame(kick);
        window.setTimeout(kick, 120);
        window.setTimeout(kick, 450);
        window.setTimeout(kick, 900);
      });
      setMapState({ isReady: true });
    }
  }, []);
  
  // Set tile layer
  useEffect(() => {
      if (!mapState.isReady || !mapRef.current) return;

      const map = mapRef.current;

      if (tileLayerRef.current) {
          map.removeLayer(tileLayerRef.current);
      }

      const tileUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
      const tileOptions = {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: 'abcd',
          maxZoom: 20,
          maxNativeZoom: 19,
          keepBuffer: 6,
          updateWhenIdle: false,
          crossOrigin: true,
      };
      
      const newTileLayer = L.tileLayer(tileUrl, tileOptions);
      newTileLayer.addTo(map);
      tileLayerRef.current = newTileLayer;
      const onTilesReady = () => {
        map.invalidateSize({ animate: false });
      };
      newTileLayer.on('load', onTilesReady);
      map.once('moveend', onTilesReady);

  }, [mapState.isReady]);

  useEffect(() => {
    if (!mapState.isReady || !mapRef.current) return;
    let cancelled = false;
    void (async () => {
      const anchor = await resolveSessionAnchor();
      if (cancelled || !mapRef.current) return;
      sessionAnchorRef.current = anchor;
      const m = mapRef.current;
      m.setView([anchor.lat, anchor.lng], 5, { animate: true, duration: 1, easeLinearity: 0.35 });
      requestAnimationFrame(() => {
        m.invalidateSize({ animate: false });
        window.setTimeout(() => m.invalidateSize({ animate: false }), 180);
        window.setTimeout(() => m.invalidateSize({ animate: false }), 520);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [mapState.isReady]);

  /** 首次进入 / 侧栏切换后容器尺寸变化时补全瓦片 */
  useEffect(() => {
    const map = mapRef.current;
    const el = mapContainerRef.current;
    if (!mapState.isReady || !map || !el) return;
    const fix = () => {
      map.invalidateSize({ animate: false });
    };
    fix();
    const t1 = window.setTimeout(fix, 50);
    const t2 = window.setTimeout(fix, 280);
    const t3 = window.setTimeout(fix, 750);
    const ro = new ResizeObserver(() => fix());
    ro.observe(el);
    window.addEventListener('resize', fix);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      ro.disconnect();
      window.removeEventListener('resize', fix);
    };
  }, [mapState.isReady, echoTab]);

  useEffect(() => {
    const visible = !mapExplored && images.length === 0 && !placementInfo && !isLoading;
    emptyHintVisibleRef.current = visible;
    if (visible) {
      passiveDismissUnlockAtRef.current = Date.now() + EMPTY_HINT_PASSIVE_MS;
    } else {
      passiveDismissUnlockAtRef.current = 0;
    }
  }, [mapExplored, images.length, placementInfo, isLoading]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapState.isReady || !map) return;
    const el = map.getContainer();
    /** 拖图 / 滚轮 / 触控缩放：空状态期内延后清除（与 wheel、zoomstart 同一套时间窗） */
    const tryPassiveDismiss = () => {
      if (!emptyHintVisibleRef.current) {
        setMapExplored(true);
        return;
      }
      if (Date.now() < passiveDismissUnlockAtRef.current) return;
      setMapExplored(true);
    };
    const onZoomStart = (e: { originalEvent?: Event }) => {
      if (e?.originalEvent) tryPassiveDismiss();
    };
    map.on('dragstart', tryPassiveDismiss);
    map.on('zoomstart', onZoomStart);
    el.addEventListener('wheel', tryPassiveDismiss, { passive: true });
    return () => {
      map.off('dragstart', tryPassiveDismiss);
      map.off('zoomstart', onZoomStart);
      el.removeEventListener('wheel', tryPassiveDismiss);
    };
  }, [mapState.isReady]);

  // --- Demo buildings (locked / idle by default); white keyed out via processImageForTransparency ---
  /** 延后注入，避免一加载就有建筑导致空状态文案瞬间被 images.length 顶掉 */
  useEffect(() => {
    if (!mapState.isReady || !ECHO_SEED_DEMO_BUILDINGS || seedDoneRef.current) return;

    let cancelled = false;
    const specs = [
      { lat: -33.86, lng: 151.21, src: '/assets/map-building-opera.png', place: 'Sydney, Australia' },
      { lat: 31.23, lng: 121.47, src: '/assets/map-building-stone-wall.png', place: 'Shanghai, China' },
    ];

    const tid = window.setTimeout(() => {
      if (cancelled || seedDoneRef.current) return;
      seedDoneRef.current = true;
      void (async () => {
        for (const s of specs) {
          try {
            const url = new URL(s.src, window.location.origin).href;
            const { transparentImage, contentBounds } = await processImageForTransparency(url);
            if (cancelled) return;
            const im = transparentImage;
            const id = nextId.current++;
            const aspectRatio = im.width / im.height;
            const newWidth = IMAGE_WIDTH;
            const newHeight = IMAGE_WIDTH / aspectRatio;
            const demo: ProcessedImage = {
              id,
              processedImage: im,
              lat: s.lat,
              lng: s.lng,
              width: newWidth,
              height: newHeight,
              isGenerating: false,
              contentBounds,
              flippedHorizontally: false,
              isLocked: true,
              photos: [],
              log: {
                location: s.place,
                buildingName: s.src.includes('opera') ? 'Sydney Opera House' : 'Stone Wall',
                date: '2018-06-01',
                partner: 'BuBu',
                moon: '🌙',
                musings: 'xxxx what a nice day!',
                avatarVariant: 0,
              },
            };
            setImages((prev) => [...prev, demo]);
          } catch (e) {
            console.error('Seed building failed', e);
          }
        }
      })();
    }, EMPTY_HINT_PASSIVE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(tid);
    };
  }, [mapState.isReady]);

  // --- IMAGE GENERATION & PLACEMENT ---
  const generateFromImage = useCallback(async (
    file: File,
    id: number,
    options?: { buildingName?: string; userPrompt?: string; buildingStyle?: BuildingStyleId }
  ) => {
    try {
      const { imageUrl } = await generateImageWithPrompt(file, {
        buildingName: options?.buildingName,
        userPrompt: options?.userPrompt,
        buildingStyle: options?.buildingStyle,
      });
      if (!imageUrl) throw new Error("Generation failed, no image returned.");
      
      const { transparentImage, contentBounds } = await processImageForTransparency(imageUrl);
      const aspectRatio = transparentImage.width / transparentImage.height;

      setImages(prev => prev.map(img => {
        if (img.id !== id) return img;
        const newWidth = IMAGE_WIDTH;
        const newHeight = IMAGE_WIDTH / aspectRatio;
        return {
          ...img,
          processedImage: transparentImage,
          showOriginal: false,
          contentBounds,
          width: newWidth,
          height: newHeight,
          isGenerating: false,
          buildingStyle: options?.buildingStyle ?? img.buildingStyle ?? DEFAULT_BUILDING_STYLE,
        }
      }));
    } catch (e) {
      console.error(e);
      const detail = e instanceof Error ? e.message : String(e);
      const short = detail.length > 220 ? `${detail.slice(0, 217)}…` : detail;
      setToastMessage(`${t('toastGenerationFailed')} ${short}`);
      setImages((prev) =>
        prev.map((img) =>
          img.id === id ? { ...img, isGenerating: false, showOriginal: true } : img
        )
      );
    }
  }, [t]);

  const addImageAtLatLng = useCallback((
    file: File,
    latlng: { lat: number; lng: number },
    logInfo: { location: string; date: string; buildingNameHint?: string; buildingStyle?: BuildingStyleId }
  ) => {
    (async () => {
        await ensureAudioContext();
        synth.triggerAttackRelease('C4', '8n');
    })();
    
    const id = nextId.current++;
    const sourcePreviewUrl = URL.createObjectURL(file);
    previewImageCache.current[id] = new Image();
    previewImageCache.current[id].src = sourcePreviewUrl;
    
    const PLACEHOLDER_WIDTH = 120;
    const style = logInfo.buildingStyle ?? DEFAULT_BUILDING_STYLE;
    const newImage: ProcessedImage = {
        id, sourceFile: file, processedImage: null,
        lat: latlng.lat, lng: latlng.lng,
        width: PLACEHOLDER_WIDTH, height: PLACEHOLDER_WIDTH,
        isGenerating: true,
        contentBounds: { x: 0, y: 0, width: PLACEHOLDER_WIDTH, height: PLACEHOLDER_WIDTH },
        flippedHorizontally: false, isLocked: false,
        buildingStyle: style,
        photos: [
          {
            file,
            url: sourcePreviewUrl,
            photo_id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `photo-${id}-0`,
          },
        ],
        log: {
            location: logInfo.location,
            buildingName: logInfo.buildingNameHint?.trim() || undefined,
            date: logInfo.date,
            partner: '',
            moon: '',
            musings: '',
            avatarVariant: 0,
            landmark_id: id,
        }
    };
    setImages(prev => [...prev, newImage]);
    generateFromImage(file, id, { buildingName: logInfo.buildingNameHint, buildingStyle: style });
    return id;
  }, [generateFromImage]);
  
  const startImagePlacement = useCallback(
    async (file: File, opts?: { buildingName?: string; buildingStyle?: BuildingStyleId }) => {
      if (!mapState.isReady || !mapRef.current) {
        setToastMessage(t('toastMapNotReady'));
        return;
      }
      const sizeCheck = assertFileSizeOk(file);
      if (!sizeCheck.ok) {
        setToastMessage(t('toastFileTooLarge'));
        return;
      }
      setMapExplored(true);
      const exifData = await getExifData(file);
      if (exifData) {
        const langTag = language === 'zh' ? 'zh-CN' : 'en';
        let locationName = await formatCityCountry(exifData.lat, exifData.lng, langTag);
        if (!locationName) locationName = await reverseGeocode(exifData.lat, exifData.lng, language);
        setToastMessage(`${t('toastLocationFound')} ${locationName}.`);
        mapRef.current.setView([exifData.lat, exifData.lng], 16, { animate: true, duration: 1, easeLinearity: 0.35 });
        requestAnimationFrame(() => {
          mapRef.current?.invalidateSize({ animate: false });
          window.setTimeout(() => mapRef.current?.invalidateSize({ animate: false }), 200);
        });
        addImageAtLatLng(file, exifData, {
          location: locationName,
          date: exifData.date,
          buildingNameHint: opts?.buildingName?.trim(),
          buildingStyle: opts?.buildingStyle ?? DEFAULT_BUILDING_STYLE,
        });
        return;
      }

      const name = opts?.buildingName?.trim();
      if (!name) {
        setPlacementInfo({ file, buildingStyle: opts?.buildingStyle ?? DEFAULT_BUILDING_STYLE });
        return;
      }

      if (!hasGeographicHint(name)) {
        setPlacementInfo({ file, buildingName: name, buildingStyle: opts?.buildingStyle ?? DEFAULT_BUILDING_STYLE });
        setToastMessage(t('toastPlacementNoGeoHint'));
        return;
      }

      const queries = buildGeocodeQueries(name);
      for (const query of queries) {
        try {
          const geoRes = await fetch(apiUrl('/api/geocode'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, centerFromBbox: false }),
          });
          const geo = (await geoRes.json()) as {
            found?: boolean;
            lat?: number;
            lng?: number;
            display_name?: string;
          };
          if (geo.found && typeof geo.lat === 'number' && typeof geo.lng === 'number' && mapRef.current) {
            const langTag = language === 'zh' ? 'zh-CN' : 'en';
            let locationName = await formatCityCountry(geo.lat, geo.lng, langTag);
            if (!locationName) locationName = geo.display_name || name;
            setToastMessage(`${t('toastLocationFound')} ${locationName}.`);
            mapRef.current.setView([geo.lat, geo.lng], 16, { animate: true, duration: 1, easeLinearity: 0.35 });
            requestAnimationFrame(() => {
              mapRef.current?.invalidateSize({ animate: false });
              window.setTimeout(() => mapRef.current?.invalidateSize({ animate: false }), 200);
            });
            const date = new Date().toISOString().split('T')[0];
            addImageAtLatLng(file, { lat: geo.lat, lng: geo.lng }, {
              location: locationName,
              date,
              buildingNameHint: name,
              buildingStyle: opts?.buildingStyle ?? DEFAULT_BUILDING_STYLE,
            });
            return;
          }
        } catch (e) {
          console.error('Geocode building name failed', e);
        }
      }

      setPlacementInfo({ file, buildingName: name, buildingStyle: opts?.buildingStyle ?? DEFAULT_BUILDING_STYLE });
      setToastMessage(t('toastGeocodeFailedManual'));
    },
    [addImageAtLatLng, language, mapState.isReady, t]
  );

  // Map click handler to deal with placement and selection
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = (e: any) => {
      if (placementInfo) {
        setMapExplored(true);
        const file = placementInfo.file;
        const latlng = e.latlng;
        const date = new Date().toISOString().split('T')[0];

        // UI Update first
        setPlacementInfo(null);
        const newImageId = addImageAtLatLng(file, latlng, {
          date,
          location: t('loadingLocation'),
          buildingNameHint: placementInfo.buildingName,
          buildingStyle: placementInfo.buildingStyle ?? DEFAULT_BUILDING_STYLE,
        });

        // Geocode and update name later
        (async () => {
          const langTag = language === 'zh' ? 'zh-CN' : 'en';
          let locationName = await formatCityCountry(latlng.lat, latlng.lng, langTag);
          if (!locationName) locationName = await reverseGeocode(latlng.lat, latlng.lng, language);
          setImages(prev => prev.map(img =>
            img.id === newImageId
              ? { ...img, log: { ...img.log, location: locationName } }
              : img
          ));
        })();
        return;
      }

      /** 蒙层 pointer-events-none，点击会落到地图上；在时间窗内不应立刻关掉空状态 */
      if (emptyHintVisibleRef.current && Date.now() < passiveDismissUnlockAtRef.current) {
        setSelectedImageId(null);
        return;
      }
      setMapExplored(true);
      setSelectedImageId(null);
    };

    map.on('click', handleClick);

    return () => {
      map.off('click', handleClick);
    };
  }, [placementInfo, language, addImageAtLatLng, t]);


  // --- EVENT HANDLERS ---
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setMapExplored(true);
    setPlacementInfo(null);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/') && mapRef.current) {
        const sizeCheck = assertFileSizeOk(file);
        if (!sizeCheck.ok) {
          setToastMessage(t('toastFileTooLarge'));
          return;
        }
        (async () => {
          const exifData = await getExifData(file);
          if (exifData) {
              const langTag = language === 'zh' ? 'zh-CN' : 'en';
              let locationName = await formatCityCountry(exifData.lat, exifData.lng, langTag);
              if (!locationName) locationName = await reverseGeocode(exifData.lat, exifData.lng, language);
              setToastMessage(`${t('toastLocationFound')} ${locationName}.`);
              mapRef.current.setView([exifData.lat, exifData.lng], 16, { animate: true, duration: 1, easeLinearity: 0.35 });
              addImageAtLatLng(file, exifData, {location: locationName, date: exifData.date});
          } else {
              setToastMessage(t('toastNoLocationFound'));
              const point = L.point(e.clientX, e.clientY);
              const latlng = mapRef.current.containerPointToLatLng(point);
              const date = new Date().toISOString().split('T')[0];
              
              const newImageId = addImageAtLatLng(file, latlng, {location: t('loadingLocation'), date});

              const langTag = language === 'zh' ? 'zh-CN' : 'en';
              let locationName = await formatCityCountry(latlng.lat, latlng.lng, langTag);
              if (!locationName) locationName = await reverseGeocode(latlng.lat, latlng.lng, language);
              setImages(prev => prev.map(img => 
                img.id === newImageId 
                  ? { ...img, log: { ...img.log, location: locationName } } 
                  : img
              ));
          }
        })();
      }
    }
  }, [addImageAtLatLng, language, t]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (memoryToAddPhotoTo.current !== null) {
      if (!file) {
        setToastMessage('Capture cancelled or permission denied.');
        memoryToAddPhotoTo.current = null;
        e.target.value = '';
        return;
      }
      if (file.type.startsWith('image/')) {
        handleAddPhotoToMemory(memoryToAddPhotoTo.current, file);
        memoryToAddPhotoTo.current = null;
      } else {
        setToastMessage('Could not add this file to the building.');
        memoryToAddPhotoTo.current = null;
      }
      e.target.value = '';
      return;
    }
    if (file && file.type.startsWith('image/')) {
      const sizeCheck = assertFileSizeOk(file);
      if (!sizeCheck.ok) {
        setToastMessage(t('toastFileTooLarge'));
        e.target.value = '';
        return;
      }
      startImagePlacement(file);
      e.target.value = '';
    }
  };

  const handleAddPhotoToMemory = useCallback(async (memoryId: number, file: File) => {
    const sizeCheck = assertFileSizeOk(file);
    if (!sizeCheck.ok) {
      setToastMessage(t('toastFileTooLarge'));
      return;
    }
    if (file.type.startsWith('image/')) {
        await ensureAudioContext();
        synth.triggerAttackRelease('G5', '8n');
        const url = URL.createObjectURL(file);
        const photoId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `photo-${memoryId}-${Date.now()}`;
        const newPhoto: PhotoData = { file, url, photo_id: photoId };
        setImages(prev => prev.map(img => img.id === memoryId
            ? { ...img, photos: [...img.photos, newPhoto] }
            : img
        ));
    }
  }, [t]);

  const handleDeletePhotoFromMemory = useCallback(
    async (memoryId: number, photoIndex: number) => {
      await ensureAudioContext();
      synth.triggerAttackRelease('A3', '8n');

      const snapshot = images.find((img) => img.id === memoryId);
      const willRemoveBuilding = snapshot && snapshot.photos.length === 1;
      const cloudId = snapshot?.cloudId;
      const uid = user?.id;
      if (willRemoveBuilding && cloudId && uid && isSupabaseConfigured) {
        try {
          await deleteBuildingFromCloud(cloudId, uid);
        } catch (e) {
          console.error('cloud delete', e);
        }
      }

      setImages((prev) => {
        const memory = prev.find((img) => img.id === memoryId);
        if (!memory) return prev;

        if (memory.photos.length === 1) {
          if (selectedImageId === memoryId) {
            setSelectedImageId(null);
          }
          return prev.filter((img) => img.id !== memoryId);
        }

        const updatedPhotos = memory.photos.filter((_, idx) => idx !== photoIndex);
        return prev.map((img) => (img.id === memoryId ? { ...img, photos: updatedPhotos } : img));
      });
    },
    [selectedImageId, images, user?.id]
  );

  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            setMapExplored(true);
            startImagePlacement(file);
            event.preventDefault(); return;
          }
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [startImagePlacement]);

  const handleInteractionStart = (e: React.MouseEvent<HTMLDivElement>, targetImage: ProcessedImage) => {
    e.stopPropagation();

    if (selectedImageId !== targetImage.id) {
        setSelectedImageId(targetImage.id);
    }
    
    if (targetImage.isLocked) return;

    setDraggingImage({ 
        id: targetImage.id, 
        startX: e.clientX,
        startY: e.clientY,
        startLat: targetImage.lat,
        startLng: targetImage.lng
    });

    setImages(prev => [...prev.filter(img => img.id !== targetImage.id), targetImage]);
  };

  const handleInteractionMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingImage && mapRef.current) {
        const startPoint = mapRef.current.latLngToContainerPoint(L.latLng(draggingImage.startLat, draggingImage.startLng));
        const newPoint = L.point(startPoint.x + (e.clientX - draggingImage.startX), startPoint.y + (e.clientY - draggingImage.startY));
        const newLatLng = mapRef.current.containerPointToLatLng(newPoint);
        
        setImages(prev => prev.map(img => img.id === draggingImage.id ? {
            ...img,
            lat: newLatLng.lat,
            lng: newLatLng.lng,
        } : img));
    }
  };

  const handleInteractionEnd = useCallback(async () => {
    if (draggingImage) {
      const imageId = draggingImage.id;
      const finalImageState = images.find(img => img.id === imageId);

      setDraggingImage(null);

      if (finalImageState) {
        const langTag = language === 'zh' ? 'zh-CN' : 'en';
        let newLocationName = await formatCityCountry(finalImageState.lat, finalImageState.lng, langTag);
        if (!newLocationName) newLocationName = await reverseGeocode(finalImageState.lat, finalImageState.lng, language);
        setImages(prev => prev.map(img =>
          img.id === imageId
            ? { ...img, log: { ...img.log, location: newLocationName } }
            : img
        ));
      }
    }
  }, [draggingImage, images, language]);

  const handleClusterClick = useCallback((cluster: Cluster) => {
    if (!mapRef.current) return;
    const bounds = L.latLngBounds(cluster.images.map(img => [img.lat, img.lng]));
    mapRef.current.fitBounds(bounds.pad(0.5), { animate: true, duration: 0.85, easeLinearity: 0.35 });
  }, []);

  // --- LIFECYCLE & CLEANUP ---
  useEffect(() => {
    const isGenerating = images.some(img => img.isGenerating);
    let intervalId: number | undefined;
    if (isGenerating) {
        intervalId = window.setInterval(() => setAnimationTick(tick => tick + 1), 200);
    }
    return () => clearInterval(intervalId);
  }, [images]);

  useEffect(() => {
    const currentUrls = new Set(images.flatMap(i => i.photos.map(p => p.url)));
    const prevUrls = new Set(prevImagesRef.current.flatMap(i => i.photos.map(p => p.url)));
    
    prevUrls.forEach(url => {
        if (url.startsWith('blob:') && !currentUrls.has(url)) {
            URL.revokeObjectURL(url);
            const entry = Object.entries(previewImageCache.current).find(([, img]) => img.src === url);
            if(entry) delete previewImageCache.current[parseInt(entry[0], 10)];
        }
    });

    prevImagesRef.current = images;
  }, [images]);

  useEffect(() => {
    const prevImagesMap = new Map(prevImagesRef.current.map(img => [img.id, img]));
    images.forEach(img => {
        const prevImg = prevImagesMap.get(img.id);
        if (prevImg && prevImg.isGenerating && !img.isGenerating) {
            (async () => {
                await ensureAudioContext();
                synth.triggerAttackRelease('C5', '8n');
            })();
        }
    });
  }, [images]);

  /** 登录且配置 Supabase：生成完成时自动上传该建筑 */
  useEffect(() => {
    const prev = prevCloudSnapRef.current;
    prevCloudSnapRef.current = images;
    const uid = user?.id;
    if (!uid || !isSupabaseConfigured) return;
    if (!prev) return;
    for (const img of images) {
      const p = prev.find((x) => x.id === img.id);
      if (!p) continue;
      if (p.isGenerating && !img.isGenerating && img.processedImage) {
        void (async () => {
          try {
            const cloudId = await saveBuildingToCloud(img, uid);
            setImages((curr) => curr.map((x) => (x.id === img.id ? { ...x, cloudId } : x)));
          } catch (e) {
            console.error('cloud save', e);
            setToastMessage(t('cloudSaveFailed'));
          }
        })();
      }
    }
  }, [images, user?.id, t]);
  
  useEffect(() => {
      if (toastMessage) {
          const timer = setTimeout(() => {
              setToastMessage(null);
          }, 5000);
          return () => clearTimeout(timer);
      }
  }, [toastMessage]);

  useEffect(() => {
      if (selectedImageId) {
          const isClustered = itemsToDisplay
              .filter((item): item is Cluster => 'count' in item && 'images' in item)
              .some(cluster => cluster.images.some(img => img.id === selectedImageId));
          
          if (isClustered) {
              setSelectedImageId(null);
          }
      }
  }, [itemsToDisplay, selectedImageId]);

  // --- ACTIONS ---
  const handleDeleteSelected = async () => {
    if (!selectedImage) return;
    await ensureAudioContext();
    synth.triggerAttackRelease('A4', '8n');
    const cloudId = selectedImage.cloudId;
    const uid = user?.id;
    if (cloudId && uid && isSupabaseConfigured) {
      try {
        await deleteBuildingFromCloud(cloudId, uid);
      } catch (e) {
        console.error('cloud delete', e);
      }
    }
    setImages(prev => prev.filter(img => img.id !== selectedImageId));
    setSelectedImageId(null);
  };

  const handleRegenerateSelected = () => {
      if (!selectedImage) return;
      setImages(prev => prev.map(img => img.id === selectedImageId ? {...img, isGenerating: true } : img));
      if (selectedImage.sourceFile) {
          const buildingName =
            selectedImage.log.buildingName?.trim() ||
            selectedImage.log.location?.split(',')[0]?.trim();
          generateFromImage(selectedImage.sourceFile, selectedImage.id, {
            buildingName,
            buildingStyle: selectedImage.buildingStyle ?? DEFAULT_BUILDING_STYLE,
          });
      }
  };

  const handleEditSelected = async (prompt: string) => {
    if (!selectedImage || !selectedImage.processedImage) return;
    await ensureAudioContext(); synth.triggerAttackRelease('E4', '8n');
    const imageFile = await imageElementToFile(selectedImage.processedImage, `edit_source_${selectedImage.id}.png`);
    setImages(prev => prev.map(img => img.id === selectedImageId ? { ...img, isGenerating: true, sourceFile: imageFile } : img));
    const finalPrompt = EDIT_PROMPT_TEMPLATE(prompt);
    const buildingName =
      selectedImage.log.buildingName?.trim() ||
      selectedImage.log.location?.split(',')[0]?.trim();
    generateFromImage(imageFile, selectedImage.id, {
      userPrompt: finalPrompt,
      buildingName,
      buildingStyle: selectedImage.buildingStyle ?? DEFAULT_BUILDING_STYLE,
    });
  };

  const handleFlipSelected = async () => {
    if (!selectedImage) return;
    await ensureAudioContext(); synth.triggerAttackRelease('G5', '8n');
    setImages(prev => prev.map(img => img.id === selectedImageId ? { ...img, flippedHorizontally: !img.flippedHorizontally } : img));
  };
  
  const handleDuplicateSelected = async () => {
    if (!selectedImage || !mapRef.current) return;

    await ensureAudioContext(); synth.triggerAttackRelease('C4', '8n');
    const screenPoint = mapRef.current.latLngToContainerPoint(L.latLng(selectedImage.lat, selectedImage.lng));
    const newScreenPoint = L.point(screenPoint.x + 40, screenPoint.y + 20);
    const newLatLng = mapRef.current.containerPointToLatLng(newScreenPoint);
    const newId = nextId.current++;
    const duplicatedImage: ProcessedImage = {
        ...selectedImage,
        id: newId,
        lat: newLatLng.lat,
        lng: newLatLng.lng,
        cloudId: undefined,
    };
    if (previewImageCache.current[selectedImage.id]) {
        previewImageCache.current[newId] = previewImageCache.current[selectedImage.id];
    }
    setImages(prev => [...prev, duplicatedImage]);
    setSelectedImageId(newId);
  };

  const handleScaleSelected = (factor: number) => {
    if (!selectedImage) return;
    setImages(prev => prev.map(img => {
        if (img.id !== selectedImageId) return img;
        return { ...img, width: img.width * factor, height: img.height * factor };
    }));
  };
  
  const handleLockSelected = async () => {
    if (!selectedImage) return;
    await ensureAudioContext();
    synth.triggerAttackRelease('E5', '8n');
    setImages(prev => prev.map(img => img.id === selectedImageId ? { ...img, isLocked: true } : img));
  };

  const handleUnlockSelected = async () => {
    if (!selectedImage) return;
    await ensureAudioContext();
    synth.triggerAttackRelease('C5', '8n');
    setImages(prev => prev.map(img => img.id === selectedImageId ? { ...img, isLocked: false } : img));
  };
  
  const handleViewPhoto = (photoIndex: number) => {
      if (selectedImage) {
        setPhotoPreviewState({ photos: selectedImage.photos, currentIndex: photoIndex });
      }
  };

  const handlePhotoPreviewNext = () => {
    setPhotoPreviewState(prev => {
        if (!prev) return null;
        const nextIndex = (prev.currentIndex + 1) % prev.photos.length;
        return { ...prev, currentIndex: nextIndex };
    });
  };

  const handlePhotoPreviewPrevious = () => {
    setPhotoPreviewState(prev => {
        if (!prev) return null;
        const prevIndex = (prev.currentIndex - 1 + prev.photos.length) % prev.photos.length;
        return { ...prev, currentIndex: prevIndex };
    });
  };
  
  const handleEditLog = () => setShowLogModal(true);
  
  const handleSaveLog = (updatedLog: LogData) => {
      if (selectedImageId === null) return;
      setImages(prev => prev.map(img => {
          if (img.id !== selectedImageId) return img;
          const memId =
            updatedLog.memory_id ??
            img.log.memory_id ??
            (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `mem-${img.id}`);
          return {
            ...img,
            log: {
              ...updatedLog,
              memory_id: memId,
              landmark_id: img.id,
            },
          };
      }));
      setShowLogModal(false);
  };

  const handleAddPhotoClick = () => {
      memoryToAddPhotoTo.current = selectedImageId;
      fileInputRef.current?.click();
  };

  const handleLocationSelect = useCallback((lat: number, lng: number) => {
    setMapExplored(true);
    if (mapRef.current) {
        const z = Math.max(mapRef.current.getZoom(), 4);
        mapRef.current.setView([lat, lng], z, { animate: true, duration: 0.9, easeLinearity: 0.35 });
    }
  }, []);


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        
        const currentImage = selectedImageId !== null ? images.find(img => img.id === selectedImageId) : null;

        if (e.key === 'o' && currentImage) {
            if (currentImage && currentImage.sourceFile) {
              e.preventDefault();
              setImages(prev => prev.map(img => img.id === selectedImageId ? { ...img, showOriginal: !img.showOriginal } : img));
            }
            return;
        }

        if (!currentImage || currentImage.isGenerating || currentImage.isLocked) return;

        const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        if (arrowKeys.includes(e.key)) {
            e.preventDefault();
            (async () => { await ensureAudioContext(); synth.triggerAttackRelease('G4', '8n'); })();
            let newLat = currentImage.lat, newLng = currentImage.lng;
            const zoomFactor = 1 / (mapRef.current.getZoom() ** 2);
            switch (e.key) {
                case 'ArrowUp':    newLat += MOVE_AMOUNT * zoomFactor; break;
                case 'ArrowDown':  newLat -= MOVE_AMOUNT * zoomFactor; break;
                case 'ArrowLeft':  newLng -= MOVE_AMOUNT * zoomFactor; break;
                case 'ArrowRight': newLng += MOVE_AMOUNT * zoomFactor; break;
            }
            setImages(prev => prev.map(img => img.id === selectedImageId ? { ...img, lat: newLat, lng: newLng } : img));
            return;
        }
        switch (e.key) {
            case 'Delete': case 'Backspace': handleDeleteSelected(); break; case 'r': handleRegenerateSelected(); break;
            case 'f': handleFlipSelected(); break; case 'd': handleDuplicateSelected(); break;
            case '=': case '+': handleScaleSelected(1.1); break; case '-': handleScaleSelected(1 / 1.1); break;
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImageId, images, handleScaleSelected]);

  const handleResetCanvas = () => {
    setImages([]); setShowResetConfirm(false); mapRef.current?.setView([20,0], 2);
  };
  
  // --- EXPORT / IMPORT ---
  const handleExport = async () => {
    if (images.length === 0) return;
    setIsLoading({ active: true, message: t('loadingExport') });
    await ensureAudioContext(); synth.triggerAttackRelease('C5', '8n');

    try {
        const serializableImages = await Promise.all(images.map(async (img) => {
            const processedImageBase64 = img.processedImage ? imageElementToBase64(img.processedImage) : null;
            
            const photosData = await Promise.all(img.photos.map(async (photo) => ({
                base64: await fileToBase64(photo.file),
                name: photo.file.name,
                photo_id: photo.photo_id,
            })));

            const { processedImage, photos, sourceFile, cloudId: _omitCloud, ...rest } = img;
            return {
                ...rest,
                landmark_id: img.id,
                processedImageBase64,
                photos: photosData,
                log: normalizeLog(img.log),
            };
        }));

        const exportData = {
            version: "1.0.0",
            memories: serializableImages,
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'pixel-travel-map.pixmap';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Export failed:", error);
        setToastMessage("Export failed.");
    } finally {
        setIsLoading(null);
    }
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.pixmap')) {
        setToastMessage(t('errorInvalidFile'));
        if (importInputRef.current) importInputRef.current.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const content = event.target?.result as string;
        setImportFileContent(content);
        setShowImportConfirm(true);
    };
    reader.readAsText(file);
    if (importInputRef.current) importInputRef.current.value = '';
  };
  
  const confirmImport = async () => {
    if (!importFileContent) return;
    
    setShowImportConfirm(false);
    setIsLoading({ active: true, message: t('loadingImport') });
    await ensureAudioContext(); synth.triggerAttackRelease('G5', '8n');
    
    try {
        const data = JSON.parse(importFileContent);
        if (data.version !== "1.0.0" || !Array.isArray(data.memories)) {
            throw new Error("Invalid or unsupported file format.");
        }

        const reconstructedImages: ProcessedImage[] = await Promise.all(
            data.memories.map(async (mem: any): Promise<ProcessedImage> => {
                const newId = nextId.current++;

                const processedImage = mem.processedImageBase64
                    ? await base64ToImageElement(mem.processedImageBase64)
                    : null;
                
                const photos: PhotoData[] = await Promise.all(
                    mem.photos.map(async (photoData: any): Promise<PhotoData> => {
                        const file = await base64ToFile(photoData.base64, photoData.name);
                        const url = URL.createObjectURL(file);
                        const photo_id =
                          photoData.photo_id ??
                          (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : undefined);
                        return { file, url, photo_id };
                    })
                );
                
                if (photos[0]?.file) {
                    previewImageCache.current[newId] = new Image();
                    previewImageCache.current[newId].src = photos[0].url;
                }

                return {
                    ...mem,
                    id: newId,
                    cloudId: undefined,
                    processedImage,
                    photos,
                    sourceFile: photos[0]?.file,
                    buildingStyle: isBuildingStyleId(mem.buildingStyle)
                      ? mem.buildingStyle
                      : DEFAULT_BUILDING_STYLE,
                    log: mem.log
                      ? normalizeLog(mem.log)
                      : normalizeLog({
                          location: '',
                          buildingName: undefined,
                          date: '',
                          partner: '',
                          moon: '',
                          musings: '',
                          avatarVariant: 0,
                          landmark_id: undefined,
                        }),
                };
            })
        );
        
        setImages(reconstructedImages);
        mapRef.current?.setView([20,0], 2);
        setToastMessage(t('importSuccess'));

    } catch (error) {
        console.error("Import failed:", error);
        setToastMessage("Import failed. Invalid file.");
    } finally {
        setIsLoading(null);
        setImportFileContent(null);
    }
  };

  const handlePullFromCloud = useCallback(async () => {
    const uid = user?.id;
    if (!uid || !isSupabaseConfigured) return;
    if (images.length > 0 && !window.confirm(t('cloudPullConfirm'))) return;
    setCloudBusy(true);
    try {
      const loaded = await loadAllCloudBuildings(() => nextId.current++);
      loaded.forEach((img) => {
        if (img.photos[0]?.url) {
          previewImageCache.current[img.id] = new Image();
          previewImageCache.current[img.id].src = img.photos[0].url;
        }
      });
      const maxId = loaded.reduce((m, i) => Math.max(m, i.id), 0);
      nextId.current = Math.max(nextId.current, maxId + 1);
      setImages(loaded);
      setSelectedImageId(null);
      setToastMessage(t('cloudPullOk'));
    } catch (e) {
      console.error(e);
      setToastMessage(t('cloudPullFailed'));
    } finally {
      setCloudBusy(false);
    }
  }, [user?.id, images.length, t]);

  const handlePushAllToCloud = useCallback(async () => {
    const uid = user?.id;
    if (!uid || !isSupabaseConfigured) return;
    setCloudBusy(true);
    try {
      const ids: Record<number, string> = {};
      for (const img of images) {
        if (!img.processedImage || img.isGenerating) continue;
        const cloudId = await saveBuildingToCloud(img, uid);
        ids[img.id] = cloudId;
      }
      setImages((curr) => curr.map((x) => (ids[x.id] ? { ...x, cloudId: ids[x.id] } : x)));
      setToastMessage(t('cloudPushOk', { count: String(Object.keys(ids).length) }));
    } catch (e) {
      console.error(e);
      setToastMessage(t('cloudPushFailed'));
    } finally {
      setCloudBusy(false);
    }
  }, [images, user?.id, t]);


  // --- RENDER ---
  const sortedItems = useMemo(() => 
    [...itemsToDisplay].sort((a, b) => b.lat - a.lat), 
    [itemsToDisplay]
  );

  /** Gallery / 热力图：仅展示已在地图上点击 Lock 的建筑；且需有图或照片可展示 */
  const lockedGalleryBuildings = useMemo(
    () =>
      images.filter((i) => {
        if (!i.isLocked) return false;
        if (i.isGenerating) return false;
        if (i.processedImage) return true;
        return Boolean(i.photos?.some((p) => p.url));
      }),
    [images]
  );

  const homeStatusSlot = useMemo(() => {
    const target =
      hoveredImageId !== null
        ? images.find((i) => i.id === hoveredImageId)
        : selectedImage && selectedImage.isLocked
          ? selectedImage
          : null;
    if (!target) return null;
    const ns = target.lat >= 0 ? 'N' : 'S';
    const ew = target.lng >= 0 ? 'E' : 'W';
    const lat = Math.abs(target.lat).toFixed(4);
    const lng = Math.abs(target.lng).toFixed(4);
    const city = target.log.location.split(',')[0]?.trim() || target.log.location;

    const IconCoord = (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 opacity-90" aria-hidden>
        <circle cx="12" cy="12" r="2.5" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
      </svg>
    );
    const IconPin = (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 opacity-90" aria-hidden>
        <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z" />
      </svg>
    );

    return (
      <div className="flex flex-wrap justify-center gap-3 text-[13px] leading-snug" style={{ color: '#1A56DB' }}>
        <span className="inline-flex items-center gap-1.5">
          {IconCoord}
          <span style={{ fontFamily: FONT_GOOGLE_SANS, fontWeight: 500 }}>{lat}&nbsp;{ns}°</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          {IconCoord}
          <span style={{ fontFamily: FONT_GOOGLE_SANS, fontWeight: 500 }}>{lng}&nbsp;{ew}°</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          {IconPin}
          <span style={{ fontFamily: FONT_GOOGLE_SANS, fontWeight: 500 }}>In {city}</span>
        </span>
      </div>
    );
  }, [hoveredImageId, selectedImage, images]);

  const galleryStatsSlot = useMemo(() => {
    const list = lockedGalleryBuildings;
    const cityN = (() => {
      const s = new Set<string>();
      list.forEach((i) => {
        const raw = (i.log?.location || '').trim();
        const first = raw.split(',')[0]?.trim();
        if (first) s.add(first);
      });
      return s.size;
    })();
    const countryN = (() => {
      const s = new Set<string>();
      list.forEach((i) => {
        const parts = (i.log?.location || '').split(',').map((x) => x.trim()).filter(Boolean);
        const c = parts.length >= 2 ? parts[parts.length - 1] : '';
        if (c) s.add(c);
      });
      return s.size;
    })();
    const continentN = (() => {
      const s = new Set<string>();
      list.forEach((i) => s.add(continentKeyFromLatLng(i.lat, i.lng)));
      return s.size;
    })();

    const cell = (label: string, n: number) => (
      <div key={label} className="flex flex-col items-center gap-1.5 min-w-[76px]">
        <span
          className="text-[clamp(1.85rem,3.4vw,2.5rem)] leading-none tabular-nums"
          style={{ color: '#0047FF', fontFamily: '"Cormorant Garamond", Georgia, serif', fontWeight: 500 }}
        >
          {n}
        </span>
        <span
          className="text-[11px] leading-tight tracking-wide uppercase not-italic"
          style={{
            color: '#1A56DB',
            fontFamily: FONT_GOOGLE_SANS,
            fontWeight: 500,
          }}
        >
          {label}
        </span>
      </div>
    );

    return (
      <div className="flex flex-wrap justify-center gap-6 w-full" style={{ rowGap: 12 }}>
        {cell('CITY', cityN)}
        {cell('COUNTRY', countryN)}
        {cell('CONTINENT', continentN)}
      </div>
    );
  }, [lockedGalleryBuildings]);

  const handleEchoNavigate = useCallback((tab: 'home' | 'gallery') => {
    const id = tab === 'home' ? 'echo-section-home' : 'echo-section-gallery';
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    const run = () => {
      const st = el.scrollTop;
      const o = 0.4 + 0.6 * Math.min(1, st / 120);
      setStatsFade(o);
    };
    run();
    el.addEventListener('scroll', run, { passive: true });
    return () => el.removeEventListener('scroll', run);
  }, []);

  useEffect(() => {
    const root = mainScrollRef.current;
    const home = document.getElementById('echo-section-home');
    const gallery = document.getElementById('echo-section-gallery');
    if (!root || !home || !gallery) return;

    const pickTab = () => {
      const hr = home.getBoundingClientRect();
      const gr = gallery.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const hVis = Math.max(0, Math.min(hr.bottom, vh) - Math.max(hr.top, 0));
      const gVis = Math.max(0, Math.min(gr.bottom, vh) - Math.max(gr.top, 0));
      setEchoTab(hVis >= gVis ? 'home' : 'gallery');
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (best) {
          setEchoTab(best.target.id === 'echo-section-home' ? 'home' : 'gallery');
        } else {
          pickTab();
        }
      },
      { root, rootMargin: '0px', threshold: [0, 0.05, 0.25, 0.5, 0.75, 1] }
    );

    observer.observe(home);
    observer.observe(gallery);
    root.addEventListener('scroll', pickTab, { passive: true });
    pickTab();

    return () => {
      observer.disconnect();
      root.removeEventListener('scroll', pickTab);
    };
  }, [mapState.isReady]);

  useEffect(() => {
    if (echoTab !== 'home' || !mapRef.current) return;
    const t = window.setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 120);
    return () => window.clearTimeout(t);
  }, [echoTab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showResetConfirm || showImportConfirm) return;
      setShowHelpModal(false);
      setShowAddBuildingModal(false);
      setPhotoPreviewState(null);
      setShowLogModal(false);
      setGalleryOpenM03(false);
      setGalleryOpenM04(false);
      setGalleryDetailId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showResetConfirm, showImportConfirm]);

  const handleAddBuildingSave = useCallback(
    (file: File, buildingName: string, buildingStyle: BuildingStyleId) => {
      void startImagePlacement(file, { buildingName, buildingStyle });
    },
    [startImagePlacement]
  );

  const galleryBuilding = galleryDetailId !== null ? images.find((i) => i.id === galleryDetailId) : null;

  return (
    <div className="min-h-screen bg-[#F9F1E2] text-[#332115]">
      <div className="flex flex-col md:flex-row w-full min-h-[100dvh]">
        <EchoSidebar
          activeTab={echoTab}
          onNavigate={handleEchoNavigate}
          statsFade={statsFade}
          homeStatusSlot={homeStatusSlot}
          galleryStatsSlot={galleryStatsSlot}
          footerSlot={
            echoTab === 'home' ? (
              <AuthPanel
                cloudBusy={cloudBusy}
                onPullFromCloud={handlePullFromCloud}
                onPushAllToCloud={handlePushAllToCloud}
              />
            ) : null
          }
        />

        <div
          ref={mainScrollRef}
          className="scrollbar-hide flex-1 min-w-0 w-full overflow-y-auto overflow-x-hidden overscroll-y-contain scroll-smooth bg-white snap-y snap-mandatory md:flex-1 md:min-w-0 h-dvh"
        >
        <section
          id="echo-section-home"
          className="flex h-[100dvh] min-h-[100dvh] w-full shrink-0 snap-start flex-col overflow-hidden bg-white"
          aria-label="Map"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onMouseMove={handleInteractionMove}
          onMouseUp={handleInteractionEnd}
          onMouseLeave={handleInteractionEnd}
        >
        <div className="relative flex min-h-0 w-full flex-1 overflow-hidden">
        <div className="absolute top-4 right-4 z-[60] flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={() => {
              const a = sessionAnchorRef.current;
              if (!a || !mapRef.current) {
                setToastMessage('Location anchor not ready yet.');
                return;
              }
              mapRef.current.setView([a.lat, a.lng], Math.max(6, mapRef.current.getZoom()), {
                animate: true,
                duration: 1,
                easeLinearity: 0.35,
              });
            }}
            className="w-7 h-7 flex items-center justify-center border border-black rounded-full text-black bg-white hover:bg-neutral-50"
            aria-label="Back to my location"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          </button>
          <button
            type="button"
            onClick={toggleLanguage}
            className="w-7 h-7 flex items-center justify-center border border-black rounded-full text-black bg-white hover:bg-neutral-50 text-[11px] font-semibold leading-none"
            aria-label={t('toggleLanguage')}
          >
            {language === 'en' ? '中' : 'EN'}
          </button>
          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            className="w-7 h-7 flex items-center justify-center border border-black rounded-full text-black bg-white hover:bg-neutral-50"
            aria-label={t('showHelp')}
          >
            ?
          </button>
        </div>

        <div ref={mapContainerRef} id="map" className="absolute inset-0 z-0 h-full w-full min-h-[40vh]" />

        {echoTab === 'home' && mapState.isReady && mapRef.current && (
          <div className="absolute top-4 left-4 z-30 flex flex-col gap-1 pointer-events-auto">
            <button
              type="button"
              className="w-9 h-9 border border-black bg-white flex items-center justify-center text-lg leading-none hover:bg-neutral-100"
              aria-label="Zoom in"
              onClick={() => {
                setMapExplored(true);
                mapRef.current?.zoomIn();
              }}
            >
              +
            </button>
            <button
              type="button"
              className="w-9 h-9 border border-black bg-white flex items-center justify-center text-lg leading-none hover:bg-neutral-100"
              aria-label="Zoom out"
              onClick={() => {
                setMapExplored(true);
                mapRef.current?.zoomOut();
              }}
            >
              −
            </button>
          </div>
        )}

        {echoTab === 'home' && mapState.isReady && (
            <SearchControl onLocationSelect={handleLocationSelect} />
        )}
        
        {echoTab === 'home' && mapState.isReady && mapRef.current && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
                {(() => {
                  const mapZoom = mapRef.current!.getZoom();
                  const showPoiDots = mapZoom <= POI_DOT_ZOOM_THRESHOLD;
                  const markerZoomScale = Math.max(0.36, Math.min(1.14, 0.2 + mapZoom * 0.052));
                  return sortedItems.map((item) => {
                    if ('count' in item && 'images' in item) {
                      return (
                        <ClusterBubble
                          key={item.id}
                          cluster={item}
                          map={mapRef.current!}
                          onClick={handleClusterClick}
                        />
                      );
                    }
                    const img = item as ProcessedImage;
                    if (showPoiDots) {
                      return (
                        <PoiDotMarker
                          key={img.id}
                          img={img}
                          map={mapRef.current!}
                          isSelected={selectedImageId === img.id}
                          onInteractionStart={handleInteractionStart}
                          onHoverChange={setHoveredImageId}
                        />
                      );
                    }
                    return (
                      <ImageMarker
                        key={img.id}
                        img={img}
                        map={mapRef.current!}
                        isSelected={selectedImageId === img.id}
                        isDragging={draggingImage?.id === img.id}
                        animationTick={animationTick}
                        previewImageCache={previewImageCache}
                        onInteractionStart={handleInteractionStart}
                        onAddPhotoToMemory={handleAddPhotoToMemory}
                        onHoverChange={setHoveredImageId}
                        zoomScale={markerZoomScale}
                      />
                    );
                  });
                })()}
            </div>
        )}

        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*"/>
        <input ref={memoryCaptureInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />
        <input type="file" ref={importInputRef} onChange={handleImportFileChange} className="hidden" accept=".pixmap" />

        {!mapExplored && images.length === 0 && !placementInfo && !isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none p-6 z-20 max-w-lg mx-auto w-full gap-3">
            <Shuffle
              tag="p"
              text="Build your echo map"
              className="m-0 text-[clamp(1rem,2.8vw,1.25rem)] md:text-xl font-semibold tracking-wide text-neutral-600"
              style={{ fontFamily: '"Roboto Mono", ui-monospace, monospace', fontWeight: 600 }}
              textAlign="center"
              shuffleDirection="right"
              duration={(0.35 / 0.64) / 0.75}
              animationMode="random"
              maxDelay={0}
              shuffleTimes={1}
              ease="power3.out"
              stagger={0.0375 / 0.75}
              threshold={0.1}
              triggerOnce={true}
              triggerOnHover={false}
              respectReducedMotion={true}
            />
            <Shuffle
              tag="p"
              text="Drag & drop, paste, or use the upload button."
              className="m-0 text-xs md:text-sm text-neutral-500 leading-relaxed"
              style={{ fontFamily: '"Roboto Mono", ui-monospace, monospace', fontWeight: 500 }}
              textAlign="center"
              shuffleDirection="right"
              duration={(0.35 / 0.64) / 0.75}
              animationMode="random"
              maxDelay={0}
              shuffleTimes={1}
              ease="power3.out"
              stagger={0.0375 / 0.75}
              threshold={0.1}
              triggerOnce={true}
              triggerOnHover={false}
              respectReducedMotion={true}
            />
          </div>
        )}
        
        {placementInfo && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[200px] bg-white p-4 border border-black shadow-lg z-40 max-w-md">
                <p>
                  {placementInfo.buildingName?.trim()
                    ? t('placementPromptWithBuilding', { name: placementInfo.buildingName.trim() })
                    : t('placementPrompt')}
                </p>
                <button onClick={() => setPlacementInfo(null)} className="absolute top-1 right-1 text-xl leading-none px-2">&times;</button>
            </div>
        )}

        {selectedImage && mapRef.current && !selectedImage.isLocked && (
             <Toolbar
                selectedImage={selectedImage}
                map={mapRef.current}
                onRegenerate={handleRegenerateSelected}
                onFlip={handleFlipSelected}
                onDuplicate={handleDuplicateSelected}
                onScale={handleScaleSelected}
                onDelete={handleDeleteSelected}
                onEdit={handleEditSelected}
                onLock={handleLockSelected}
             />
        )}

        {selectedImage && mapRef.current && selectedImage.isLocked && (
            <MemoryCards
                selectedImage={selectedImage}
                map={mapRef.current}
                onUnlock={handleUnlockSelected}
                onViewPhoto={handleViewPhoto}
                onAddPhoto={handleAddPhotoClick}
                onLiveCapture={() => {
                  memoryToAddPhotoTo.current = selectedImageId;
                  memoryCaptureInputRef.current?.click();
                }}
                onEditLog={handleEditLog}
                onDeletePhoto={handleDeletePhotoFromMemory}
            />
        )}
       
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-20 pointer-events-none">
            <div className="flex items-center justify-center gap-3 pointer-events-auto flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setMapExplored(true);
                    setShowAddBuildingModal(true);
                  }}
                  className="w-11 h-11 rounded-full border border-black bg-white flex items-center justify-center shadow-sm hover:bg-neutral-50 transition-colors"
                  aria-label={t('hammerAddBuilding')}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m15 12-8.5 8.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0-.83-.83-.83-2.17 0-3L12 9"/><path d="m17.64 6.36-1.28-1.28a1.21 1.21 0 0 0-1.72 0L4.36 16.36a1.21 1.21 0 0 0 0 1.72l1.28 1.28c.47.47 1.23.47 1.7 0l10.28-10.28a1.21 1.21 0 0 0 0-1.72Z"/><path d="m22 2-5 5"/></svg>
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-11 h-11 rounded-full border border-black bg-white flex items-center justify-center shadow-sm hover:bg-neutral-50 transition-colors"
                  aria-label={t('cameraCapture')}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport()}
                  className="w-11 h-11 rounded-full border border-black bg-white flex items-center justify-center shadow-sm hover:bg-neutral-50 transition-colors"
                  aria-label={t('exportMap')}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                </button>
            </div>
        </div>

        {showResetConfirm && (
            <ResetConfirmModal
                onConfirm={handleResetCanvas}
                onCancel={() => setShowResetConfirm(false)}
            />
        )}
        {showImportConfirm && (
            <ImportConfirmModal
                onConfirm={confirmImport}
                onCancel={() => setShowImportConfirm(false)}
            />
        )}
        </div>

        <div
          className="relative flex h-[25dvh] shrink-0 flex-col items-center justify-center bg-[#F9F1E2] px-6 py-3 z-[25]"
          style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}
        >
          <button
            type="button"
            className="flex flex-col items-center bg-transparent border-0 cursor-pointer text-[#756F6C] transition-all duration-200 ease-in-out hover:-translate-y-0.5 text-base md:text-lg m-0 p-0"
            style={{
              fontWeight: 400,
              lineHeight: 1.45,
              letterSpacing: '0.04em',
            }}
            onClick={() =>
              document.getElementById('echo-section-gallery')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          >
            <span>Scroll for more</span>
            <svg
              className="mt-1.5 block shrink-0"
              width={22}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden
            >
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        </section>

        <section
          id="echo-section-gallery"
          className="flex h-[100dvh] min-h-[100dvh] w-full shrink-0 snap-start flex-col overflow-hidden bg-[#F9F1E2]"
          aria-label="Gallery"
        >
            <GallerySection
              buildings={lockedGalleryBuildings}
              onOpenBuilding={(id) => {
                setGalleryDetailId(id);
                setGalleryOpenM03(true);
                setGalleryOpenM04(false);
              }}
            />
        </section>
        </div>
      </div>

      {import.meta.env.DEV && devEchoApiHint && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 max-w-[min(640px,calc(100vw-2rem))] bg-amber-950 text-amber-50 text-xs px-4 py-3 rounded-md shadow-lg z-[199] border border-amber-700/80 leading-snug"
          role="status"
        >
          {devEchoApiHint}
        </div>
      )}

      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-black text-white px-4 py-2 rounded-md shadow-lg z-[200] animate-toast flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          {toastMessage}
        </div>
      )}

      {isLoading && (
        <div className="fixed inset-0 bg-white/80 flex items-center justify-center z-[200]">
          <div className="flex flex-col items-center gap-4">
            <svg className="animate-spin h-8 w-8 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <p className="text-black">{isLoading.message}</p>
          </div>
        </div>
      )}

      {photoPreviewState && (
        <PhotoPreviewModal
          photos={photoPreviewState.photos}
          currentIndex={photoPreviewState.currentIndex}
          onClose={() => setPhotoPreviewState(null)}
          onNext={handlePhotoPreviewNext}
          onPrevious={handlePhotoPreviewPrevious}
        />
      )}

      {showLogModal && selectedImage && (
        <TravelLogModal log={selectedImage.log} onSave={handleSaveLog} onClose={() => setShowLogModal(false)} />
      )}

      <AddBuildingModal
        open={showAddBuildingModal}
        onClose={() => setShowAddBuildingModal(false)}
        onSave={(file, buildingName, buildingStyle) => {
          handleAddBuildingSave(file, buildingName, buildingStyle);
        }}
      />

      {showHelpModal && <HelpModal onClose={() => setShowHelpModal(false)} />}

      <GalleryDetailModals
        key={galleryDetailId === null ? 'gallery-detail-closed' : `gallery-detail-${galleryDetailId}`}
        openM03={galleryOpenM03}
        openM04={galleryOpenM04}
        photos={galleryBuilding?.photos ?? []}
        log={
          galleryBuilding?.log ??
          normalizeLog({
            location: '',
            buildingName: undefined,
            date: '',
            partner: '',
            moon: '',
            musings: '',
            avatarVariant: 0,
            landmark_id: undefined,
          })
        }
        onGoToMemories={() => {
          setGalleryOpenM04(true);
          setGalleryOpenM03(false);
        }}
        onBackToGalleryFromM03={() => {
          setGalleryOpenM03(false);
          setGalleryDetailId(null);
        }}
        onBackToDiary={() => {
          setGalleryOpenM04(false);
          setGalleryOpenM03(true);
        }}
        onBackToGalleryFromM04={() => {
          setGalleryOpenM04(false);
          setGalleryOpenM03(false);
          setGalleryDetailId(null);
        }}
      />
    </div>
  );
};

export default App;
