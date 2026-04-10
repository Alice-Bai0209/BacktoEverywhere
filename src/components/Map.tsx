import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useStore } from '../store';

// Fix Leaflet default icon issue in Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const customIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const riskIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const checkpointIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const avatarHtml = `
  <div class="avatar-container">
    <div class="avatar-body">
      <svg viewBox="0 0 100 100" width="50" height="50">
        <path d="M10,50 Q50,10 90,50 L80,70 Q50,90 20,70 Z" fill="#00f3ff" stroke="#151619" stroke-width="4"/>
        <rect x="30" y="40" width="40" height="15" rx="7.5" fill="#151619"/>
        <circle cx="40" cy="47.5" r="3" fill="#00f3ff" class="eye-blink"/>
        <circle cx="60" cy="47.5" r="3" fill="#00f3ff" class="eye-blink"/>
        <line x1="50" y1="30" x2="50" y2="10" stroke="#151619" stroke-width="4"/>
        <circle cx="50" cy="10" r="6" fill="#ff003c" class="antenna-pulse"/>
      </svg>
    </div>
    <div class="avatar-shadow"></div>
  </div>
`;

const avatarIcon = new L.DivIcon({
  html: avatarHtml,
  className: 'custom-avatar-icon',
  iconSize: [60, 70],
  iconAnchor: [30, 50],
});

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (center[0] !== 0 && center[1] !== 0) {
      map.panTo(center, { animate: true, duration: 0.5 });
    }
  }, [center, map]);
  return null;
}

export default function Map({ currentLocation }: { currentLocation: [number, number] | null }) {
  const { currentTrip, status, returnMode, targetPointIndex, checkpoints, focusedLocation, setFocusedLocation } = useStore();

  const points = currentTrip?.points || [];
  const pathPositions: [number, number][] = points.map(p => [p.lat, p.lng]);
  
  // If returning and shortcut mode, we might just draw a line from current to start
  const shortcutPositions: [number, number][] = points.length > 0 && currentLocation 
    ? [currentLocation, [points[0].lat, points[0].lng]] 
    : [];

  const defaultCenter: [number, number] = focusedLocation || currentLocation || (pathPositions.length > 0 ? pathPositions[pathPositions.length - 1] : [39.9042, 116.4074]);

  // Reset focused location after panning
  useEffect(() => {
    if (focusedLocation) {
      const timer = setTimeout(() => setFocusedLocation(null), 1000);
      return () => clearTimeout(timer);
    }
  }, [focusedLocation, setFocusedLocation]);

  return (
    <MapContainer 
      center={defaultCenter} 
      zoom={16} 
      className="w-full h-full z-0"
      zoomControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        className="cartoon-map-tiles"
      />
      
      {(focusedLocation || currentLocation) && <MapUpdater center={focusedLocation || currentLocation!} />}

      {/* Outbound Path */}
      {pathPositions.length > 1 && (
        <Polyline positions={pathPositions} color="#00f3ff" weight={4} opacity={status === 'returning' ? 0.3 : 0.8} />
      )}

      {/* Return Path (Highlight remaining path) */}
      {status === 'returning' && returnMode === 'original' && targetPointIndex >= 0 && (
        <Polyline 
          positions={pathPositions.slice(0, targetPointIndex + 1)} 
          color="#00ff88" 
          weight={5} 
          dashArray="10, 10"
        />
      )}

      {/* Shortcut Path */}
      {status === 'returning' && returnMode === 'shortcut' && shortcutPositions.length > 1 && (
        <Polyline 
          positions={shortcutPositions} 
          color="#ff003c" 
          weight={5} 
          dashArray="10, 10"
        />
      )}

      {/* Risk Markers */}
      {points.filter(p => p.risk).map((p, i) => (
        <Marker key={i} position={[p.lat, p.lng]} icon={riskIcon}>
          <Popup>{p.risk}</Popup>
        </Marker>
      ))}

      {/* Current Location Marker */}
      {currentLocation && (
        <Marker position={currentLocation} icon={avatarIcon} zIndexOffset={1000}>
          <Popup className="font-mono font-bold">You are here</Popup>
        </Marker>
      )}
      
      {/* Start Point Marker */}
      {pathPositions.length > 0 && (
        <Marker position={pathPositions[0]}>
          <Popup>Start Point</Popup>
        </Marker>
      )}

      {/* Checkpoints */}
      {checkpoints.map((cp) => (
        <Marker key={cp.id} position={[cp.lat, cp.lng]} icon={checkpointIcon}>
          <Popup className="font-mono font-bold">{cp.name}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
