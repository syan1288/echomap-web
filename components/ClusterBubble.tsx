import React from 'react';
import type { ProcessedImage } from '../App';

export interface Cluster {
  id: string;
  images: ProcessedImage[];
  lat: number;
  lng: number;
  count: number;
  representativeImage: ProcessedImage;
}

interface ClusterBubbleProps {
  cluster: Cluster;
  map: any;
  onClick: (cluster: Cluster) => void;
}

export const ClusterBubble: React.FC<ClusterBubbleProps> = ({ cluster, map, onClick }) => {
  const screenPoint = map.latLngToContainerPoint([cluster.lat, cluster.lng]);
  const representativeImage = cluster.representativeImage.processedImage;
  const SIZE = 80;

  const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick(cluster);
  }

  return (
      <div
          className="absolute flex items-center justify-center pointer-events-auto cursor-pointer group transition-transform duration-200 hover:scale-110"
          style={{
              left: 0,
              top: 0,
              width: `${SIZE}px`,
              height: `${SIZE}px`,
              transform: `translate(${screenPoint.x - SIZE / 2}px, ${screenPoint.y - SIZE / 2}px)`,
              willChange: 'transform',
          }}
          onClick={handleClick}
      >
          <div className="w-full h-full bg-stone-100 border-2 border-black rounded-2xl shadow-lg group-hover:shadow-xl transition-shadow flex items-center justify-center p-2">
              {representativeImage ? (
                   <img 
                      src={representativeImage.src} 
                      className="max-w-full max-h-full object-contain"
                      style={{ transform: cluster.representativeImage.flippedHorizontally ? 'scaleX(-1)' : 'none' }}
                      draggable="false"
                      alt="Cluster representative"
                  />
              ) : (
                  <div className="w-full h-full bg-gray-200 animate-pulse rounded-lg"></div>
              )}
          </div>
          <div className="absolute -top-1 -right-1 w-7 h-7 bg-black text-white text-sm font-bold rounded-full flex items-center justify-center border-2 border-white">
              {cluster.count}
          </div>
      </div>
  );
}
