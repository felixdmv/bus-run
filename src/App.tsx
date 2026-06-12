import { useEffect, useMemo, useState, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from './supabaseClient';

interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  role: string;
}

interface LineRoute {
  id: string;
  name: string;
  ref: string;
  description: string;
  distanceKm: number;
  elevationGain: number;
  elevationLoss: number;
  estWalkingSeconds: number;
  estRunningSeconds: number;
  stopsCount: number;
  coords: [number, number, number][]; // [lat, lon, ele]
  stops: Stop[];
}

interface UserActivity {
  id: string;
  userId?: string;
  userName: string;
  userAvatar: string;
  lineId: string;
  lineRef: string;
  lineName: string;
  distanceKm: number;
  elevationGain: number;
  timeSeconds: number;
  date: string;
  matchPercent: number;
  type: 'running' | 'walking';
  likes: number;
  comments: { id: string; userName: string; text: string }[];
  likedByMe?: boolean;
  cityId: string;
  coords?: [number, number][]; // Track athlete's GPX path
}

interface BurgosRank {
  id: string;
  name: string;
  title: string;
  minPercentage: number;
  description: string;
  icon: string;
}

// Client-side JWT Decoder for Google Identity Services
const parseJwt = (token: string) => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Error decoding JWT token', e);
    return null;
  }
};

const STORAGE_PROGRESS_KEY = 'busrun-completed-lines-v5'; // Incremented key to avoid cache clashes
const STORAGE_FEED_KEY = 'busrun-feed-activities-v5';
const STORAGE_USER_KEY = 'busrun-user-profile-v5';


// Leaflet DivIcons
const stopIcon = L.divIcon({
  className: 'custom-stop-icon',
  html: '<div class="stop-dot"></div>',
  iconSize: [10, 10],
  iconAnchor: [5, 5]
});

const startIcon = L.divIcon({
  className: 'custom-start-icon',
  html: '<div class="start-dot"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

const endIcon = L.divIcon({
  className: 'custom-end-icon',
  html: '<div class="end-dot"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

const userIcon = L.divIcon({
  className: 'custom-user-icon',
  html: '<div class="user-pulse-dot"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

// Helper component to center map on coordinates
function MapViewController({ center, zoom = 14 }: { center: [number, number]; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, {
      duration: 1.2,
      easeLinearity: 0.25
    });
  }, [center, zoom, map]);
  return null;
}

function SponsorAdSenseBanner() {
  return (
    <div 
      className="sponsor-ad-banner"
      style={{
        background: 'var(--brand-dark-soft)',
        borderRadius: '12px',
        padding: '16px',
        textAlign: 'center',
        border: '1px solid rgba(252, 82, 0, 0.15)',
        boxShadow: 'var(--shadow-sm)',
        marginTop: '16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px'
      }}
    >
      <span style={{ fontSize: '0.65rem', fontWeight: '800', color: 'var(--brand-orange)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        PATROCINADO / ANUNCIO
      </span>
      {/* Mock Banner */}
      <div 
        style={{
          width: '100%',
          maxWidth: '728px',
          height: '90px',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px dashed rgba(255,255,255,0.1)',
          cursor: 'pointer'
        }}
        onClick={() => window.open('https://google.com/adsense/start/', '_blank')}
      >
        <strong style={{ fontSize: '0.9rem', color: '#f8fafc' }}>Nike Run Club Challenge</strong>
        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Completa la Línea Metro 1 de Nueva York y gana 15% de descuento en equipación</span>
      </div>
      <p style={{ fontSize: '0.65rem', color: '#64748b', margin: 0 }}>
        Anuncio de Google AdSense. Elimina anuncios y obtén descargas GPX ilimitadas con <span style={{ color: 'var(--brand-orange)', fontWeight: 'bold' }}>MetroMile Premium</span>.
      </p>
    </div>
  );
}


function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const Icons = {
  Feed: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  Map: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  ),
  Search: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Profile: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Pencil: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" />
    </svg>
  ),
  Bus: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="6" y1="21" x2="6" y2="17" />
      <line x1="18" y1="21" x2="18" y2="17" />
      <line x1="2" y1="11" x2="22" y2="11" />
    </svg>
  ),
  Metro: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="3" width="16" height="14" rx="2" />
      <path d="M4 11h16" />
      <path d="M12 3v8" />
      <path d="M8 21l2-4" />
      <path d="M16 21l-2-4" />
    </svg>
  ),
  Tram: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M7 20h10" />
      <path d="M5 4v13" />
      <path d="M19 4v13" />
      <path d="M9 10h6" />
      <path d="M12 2v2" />
    </svg>
  ),
  Gear: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  Link: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  Shield: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Info: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  Mail: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  Phone: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
};

function isErroneousStopName(name: string, stopId: string): boolean {
  const clean = (name || '').trim().toLowerCase();
  if (!clean || clean === 'null' || clean === 'undefined' || clean.includes('bus stop') || clean === stopId.toLowerCase()) {
    return true;
  }
  if (/^parada\s*#?\d+/i.test(clean)) return true;
  if (/^stop\s*#?\d+/i.test(clean)) return true;
  if (/^[0-9.-]+$/.test(clean)) return true;
  return false;
}

// Map helper for feed activities
function getCoordsForActivity(act: UserActivity, busLines: LineRoute[]): [number, number][] {
  if (act.coords && act.coords.length > 0) {
    return act.coords;
  }
  const matched = busLines.find(l => l.ref === act.lineRef || l.id === act.lineId);
  if (matched && matched.coords && matched.coords.length > 0) {
    return matched.coords.map(([lat, lon]) => [lat, lon] as [number, number]);
  }
  return [];
}

function MiniFeedMap({ activityId, coords, color = "#fc5200", onClick }: { activityId: string; coords: [number, number][]; color?: string; onClick?: () => void }) {
  if (!coords || coords.length === 0) return null;
  const center = coords[Math.floor(coords.length / 2)];
  
  return (
    <div 
      className="activity-mini-map-wrapper"
      onClick={onClick}
      style={{ 
        height: '180px', 
        borderRadius: '12px', 
        overflow: 'hidden', 
        marginTop: '12px',
        border: '1px solid rgba(0,0,0,0.1)',
        position: 'relative',
        zIndex: 1,
        cursor: onClick ? 'pointer' : 'default'
      }}
    >
      <MapContainer 
        center={center} 
        zoom={13} 
        style={{ height: '100%', width: '100%' }} 
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={coords} color={color} weight={5} opacity={0.85} />
      </MapContainer>
      {onClick && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1000,
          background: 'transparent'
        }} />
      )}
    </div>
  );
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s} min`;
}

// 10 Levels based on city completed percentage (from 0% to 100%)
interface GlobalRank {
  id: string;
  name: string;
  title: string;
  minPercentage: number;
  description: string;
  icon: string;
}

const GLOBAL_RANKS: GlobalRank[] = [
  { id: 'passerby', name: 'Transeúnte', title: 'Explorador Urbano Inicial', minPercentage: 0, description: 'Acabas de empezar (0%+). Conoces tu barrio a ritmo muy suave.', icon: '👒' },
  { id: 'sightseer', name: 'Turista', title: 'Explorador de Líneas', minPercentage: 10, description: 'Has completado un 10%+ de las líneas urbanas locales.', icon: '📸' },
  { id: 'commuter', name: 'Conmutador', title: 'Corredor de Tránsito', minPercentage: 25, description: 'Dominas la red (25%+). Corres a ritmo de hora punta.', icon: '🎫' },
  { id: 'explorer', name: 'Explorador', title: 'Navegador Metropolitano', minPercentage: 50, description: 'La mitad de la ciudad conquistada (50%+). Las paradas son tu pista.', icon: '🧭' },
  { id: 'expert', name: 'Experto', title: 'Experto en Rutas', minPercentage: 75, description: 'Dominio absoluto (75%+). Conoces las conexiones mejor que los mapas.', icon: '🏛️' },
  { id: 'legend', name: 'Leyenda del Tránsito', title: 'Leyenda Urbana Absoluta', minPercentage: 100, description: '¡100%! Has conquistado y corrido absolutamente todas las líneas de la ciudad.', icon: '⚔️' }
];

interface VirtualJourney {
  id: string;
  nameEs: string;
  nameEn: string;
  city: string;
  totalKm: number;
  badgeIcon: string;
  color: string;
}

const VIRTUAL_JOURNEYS: VirtualJourney[] = [
  { id: 'london_central', nameEs: 'Londres - Central Line', nameEn: 'London - Central Line', city: 'London', totalKm: 74.0, badgeIcon: '🇬🇧', color: '#e11d48' },
  { id: 'ny_broadway', nameEs: 'Nueva York - Broadway Express (Línea 2)', nameEn: 'New York - Broadway Express (Line 2)', city: 'New York', totalKm: 40.0, badgeIcon: '🇺🇸', color: '#2563eb' },
  { id: 'tokyo_yamanote', nameEs: 'Tokio - Yamanote Loop Line', nameEn: 'Tokyo - Yamanote Loop Line', city: 'Tokyo', totalKm: 34.5, badgeIcon: '🇯🇵', color: '#16a34a' },
  { id: 'paris_line1', nameEs: 'París - Métro Ligne 1', nameEn: 'Paris - Métro Ligne 1', city: 'Paris', totalKm: 16.6, badgeIcon: '🇫🇷', color: '#eab308' },
  { id: 'madrid_line6', nameEs: 'Madrid - Circular Línea 6', nameEn: 'Madrid - Circular Line 6', city: 'Madrid', totalKm: 23.5, badgeIcon: '🇪🇸', color: '#a855f7' }
];

interface Achievement {
  id: string;
  titleEs: string;
  titleEn: string;
  descEs: string;
  descEn: string;
  icon: string;
  check: (stats: { globalLines: number; totalKm: number; totalElev: number; completedKeys: string[] }) => boolean;
}

const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_run',
    titleEs: 'Primer Viaje',
    titleEn: 'First Journey',
    descEs: 'Completa tu primera línea de transporte.',
    descEn: 'Complete your first transit line.',
    icon: '🎫',
    check: (stats) => stats.globalLines >= 1
  },
  {
    id: 'transit_enthusiast',
    titleEs: 'Entusiasta del Tránsito',
    titleEn: 'Transit Enthusiast',
    descEs: 'Completa 5 líneas de transporte diferentes.',
    descEn: 'Complete 5 different transit lines.',
    icon: '🚇',
    check: (stats) => stats.globalLines >= 5
  },
  {
    id: 'half_century',
    titleEs: 'Cincuenta Mil Metros',
    titleEn: 'Fifty Kms',
    descEs: 'Recorre un total de 50 kilómetros en tus validaciones.',
    descEn: 'Cover a total of 50 kilometers in your validations.',
    icon: '🏃‍♂️',
    check: (stats) => stats.totalKm >= 50
  },
  {
    id: 'mountain_climber',
    titleEs: 'Escalador del Subsuelo',
    titleEn: 'Subway Climber',
    descEs: 'Acumula más de 500 metros de desnivel positivo.',
    descEn: 'Accumulate more than 500 meters of positive elevation.',
    icon: '⛰️',
    check: (stats) => stats.totalElev >= 500
  },
  {
    id: 'city_traveler',
    titleEs: 'Viajero Frecuente',
    titleEn: 'Frequent Traveler',
    descEs: 'Completa líneas en al menos 2 ciudades diferentes.',
    descEn: 'Complete lines in at least 2 different cities.',
    icon: '✈️',
    check: (stats) => {
      const cities = new Set(stats.completedKeys.map(k => k.split('_')[0]));
      return cities.size >= 2;
    }
  },
  {
    id: 'metro_legend',
    titleEs: 'Leyenda del Metro',
    titleEn: 'Metro Legend',
    descEs: 'Alcanza el rango Leyenda del Tránsito (100% completado).',
    descEn: 'Reach Transit Legend rank (100% completed).',
    icon: '👑',
    check: (stats) => stats.globalLines >= 15
  }
];

const translations = {
  es: {
    app_title: "MetroMile",
    feed: "Feed",
    map: "Mapa",
    search: "Buscador",
    profile: "Perfil",
    settings: "Configuración",
    active_city: "Ciudad Activa",
    transport: "Medio de Transporte",
    unit: "Unidad de Medida",
    privacy: "Privacidad",
    privacy_public: "Público (Cualquiera ve mi historial)",
    privacy_followers: "Solo Seguidores (Solo mis seguidores ven detalles)",
    privacy_private: "Privado (Solo yo veo mis detalles)",
    km: "Kilómetros (km)",
    mi: "Millas (mi)",
    save_close: "Guardar y Cerrar",
    connections: "Enlaces",
    legal_support: "Legal & Soporte",
    about_us: "¿Quiénes Somos?",
    contact: "Contacto y Soporte",
    terms: "Términos y Licencias",
    download_app: "Descargar MetroMile App",
    free_activity: "Entrenamiento Libre",
    simulated_run: "Simular Carrera",
    sync_strava: "Vincular cuenta de Strava",
    logout: "Cerrar Sesión Google",
    google_login: "Conexión con Google",
    active_city_label: "Ciudad Activa:",
    transport_label: "Medio de Transporte:",
    privacy_label: "Privacidad del Perfil:",
    unit_label: "Unidad de Medida:",
    notifications_label: "Notificaciones de Actividad:",
    notify_follows: "Avisar cuando me siga un atleta nuevo",
    notify_comments: "Avisar sobre nuevos comentarios",
    notify_likes: "Avisar cuando le den Me Gusta",
    bio: "Biografía",
    profile_name: "Nombre de Perfil",
    avatar: "Foto de Perfil (Emoji)",
    close_profile: "Cerrar Perfil",
    chat: "Chat",
    follow: "Seguir",
    unfollow: "Dejar de seguir",
    stats: "Estadísticas",
    activities_plural: "Actividades",
    lines_plural: "Líneas",
    rank: "Rango",
    level: "Nivel",
    recent_activities: "Actividades Recientes",
    no_activities: "No hay actividades registradas en esta ciudad.",
    comments: "Comentarios",
    write_comment: "Escribe un comentario...",
    post: "Publicar",
    like: "Me gusta",
    liked: "Te gusta",
    share: "Compartir",
    city_not_found: "¿No encuentras tu ciudad?",
    request_city: "Solicitar activación",
    city_requested: "¡Ciudad solicitada! Analizaremos el transporte para añadirla pronto.",
    simulating: "Simulando...",
    verify_gps: "Subir archivo GPX",
    upload_gpx_descr: "Sube un archivo GPX de tu carrera para validar si completaste el recorrido.",
    select_file: "Seleccionar Archivo GPX",
    drag_drop: "o arrastra y suelta aquí",
    level_up: "¡Subida de Rango!",
    share_card_title: "Tarjeta Deportiva",
    share_card_descr: "Genera una tarjeta visual de tu carrera para redes sociales.",
    download_image: "Descargar Imagen",
  },
  en: {
    app_title: "MetroMile",
    feed: "Feed",
    map: "Map",
    search: "Search",
    profile: "Profile",
    settings: "Settings",
    active_city: "Active City",
    transport: "Transit Mode",
    unit: "Unit of Measurement",
    privacy: "Privacy",
    privacy_public: "Public (Anyone can see my history)",
    privacy_followers: "Followers Only (Only my followers see details)",
    privacy_private: "Private (Only I can see my details)",
    km: "Kilometers (km)",
    mi: "Miles (mi)",
    save_close: "Save and Close",
    connections: "Connections",
    legal_support: "Legal & Support",
    about_us: "About Us",
    contact: "Contact & Support",
    terms: "Terms & Licenses",
    download_app: "Download MetroMile App",
    free_activity: "Free Run",
    simulated_run: "Simulate Run",
    sync_strava: "Link Strava Account",
    logout: "Log Out Google",
    google_login: "Google Connection",
    active_city_label: "Active City:",
    transport_label: "Transit Mode:",
    privacy_label: "Profile Privacy:",
    unit_label: "Measurement Unit:",
    notifications_label: "Activity Notifications:",
    notify_follows: "Notify when a new athlete follows me",
    notify_comments: "Notify on new comments",
    notify_likes: "Notify when someone likes my runs",
    bio: "Biography",
    profile_name: "Profile Name",
    avatar: "Profile Photo (Emoji)",
    close_profile: "Close Profile",
    chat: "Chat",
    follow: "Follow",
    unfollow: "Unfollow",
    stats: "Statistics",
    activities_plural: "Activities",
    lines_plural: "Lines",
    rank: "Rank",
    level: "Level",
    recent_activities: "Recent Activities",
    no_activities: "No activities registered in this city yet.",
    comments: "Comments",
    write_comment: "Write a comment...",
    post: "Post",
    like: "Like",
    liked: "Liked",
    share: "Share",
    city_not_found: "Can't find your city?",
    request_city: "Request Activation",
    city_requested: "City requested! We will analyze transit routes to add it soon.",
    simulating: "Simulating...",
    verify_gps: "Upload GPX File",
    upload_gpx_descr: "Upload a GPX file of your run to validate if you completed the route.",
    select_file: "Select GPX File",
    drag_drop: "or drag and drop here",
    level_up: "Rank Leveled Up!",
    share_card_title: "Sports Card",
    share_card_descr: "Generate a visual graphic of your run for social sharing.",
    download_image: "Download Image",
  },
  fr: {
    app_title: "MetroMile",
    feed: "Flux",
    map: "Carte",
    search: "Recherche",
    profile: "Profil",
    settings: "Paramètres",
    active_city: "Ville Active",
    transport: "Mode de Transport",
    unit: "Unité de Mesure",
    privacy: "Confidentialité",
    privacy_public: "Public (Tout le monde peut voir)",
    privacy_followers: "Abonnés (Seuls mes abonnés voient)",
    privacy_private: "Privé (Seul moi peut voir)",
    km: "Kilomètres (km)",
    mi: "Milles (mi)",
    save_close: "Enregistrer & Fermer",
    connections: "Connexions",
    legal_support: "Légal & Support",
    about_us: "Qui sommes-nous ?",
    contact: "Contact & Support",
    terms: "Conditions & Licences",
    download_app: "Télécharger MetroMile App",
    free_activity: "Entraînement Libre",
    simulated_run: "Simuler course",
    sync_strava: "Associer compte Strava",
    logout: "Se déconnecter",
    google_login: "Connexion Google",
    active_city_label: "Ville Active :",
    transport_label: "Mode de Transport :",
    privacy_label: "Confidentialité :",
    unit_label: "Unité de Mesure :",
    notifications_label: "Notifications :",
    notify_follows: "Nouveau follower",
    notify_comments: "Nouveaux commentaires",
    notify_likes: "Nouveaux Likes",
    bio: "Biographie",
    profile_name: "Nom du Profil",
    avatar: "Avatar (Émoji)",
    close_profile: "Fermer le Profil",
    chat: "Chat",
    follow: "Suivre",
    unfollow: "Ne plus suivre",
    stats: "Statistiques",
    activities_plural: "Activités",
    lines_plural: "Lignes",
    rank: "Rang",
    level: "Niveau",
    recent_activities: "Activités Récentes",
    no_activities: "Aucune activité enregistrée ici.",
    comments: "Commentaires",
    write_comment: "Écrire un commentaire...",
    post: "Publier",
    like: "J'aime",
    liked: "Aimé",
    share: "Partager",
    city_not_found: "Votre ville n'est pas répertoriée ?",
    request_city: "Demander l'activation",
    city_requested: "Ville demandée avec succès !",
    simulating: "Simulation...",
    verify_gps: "Importer fichier GPX",
    upload_gpx_descr: "Importer un fichier GPX pour valider le parcours.",
    select_file: "Sélectionner GPX",
    drag_drop: "ou glisser-déposer ici",
    level_up: "Niveau Supérieur !",
    share_card_title: "Carte Sportive",
    share_card_descr: "Générez un visuel de votre course.",
    download_image: "Télécharger",
  },
  de: {
    app_title: "MetroMile",
    feed: "Feed",
    map: "Karte",
    search: "Suche",
    profile: "Profil",
    settings: "Einstellungen",
    active_city: "Aktive Stadt",
    transport: "Verkehrsmittel",
    unit: "Maßeinheit",
    privacy: "Privatsphäre",
    privacy_public: "Öffentlich (Jeder kann sehen)",
    privacy_followers: "Nur Follower",
    privacy_private: "Privat (Nur ich kann sehen)",
    km: "Kilometer (km)",
    mi: "Meilen (mi)",
    save_close: "Speichern & Schließen",
    connections: "Verbindungen",
    legal_support: "Rechtliches & Support",
    about_us: "Über uns",
    contact: "Kontakt & Support",
    terms: "Bedingungen & Lizenzen",
    download_app: "MetroMile App herunterladen",
    free_activity: "Freies Training",
    simulated_run: "Lauf simulieren",
    sync_strava: "Strava verbinden",
    logout: "Google Logout",
    google_login: "Google Verbindung",
    active_city_label: "Aktive Stadt:",
    transport_label: "Verkehrsmittel:",
    privacy_label: "Profil-Privatsphäre:",
    unit_label: "Maßeinheit:",
    notifications_label: "Benachrichtigungen:",
    notify_follows: "Neuer Follower",
    notify_comments: "Neue Kommentare",
    notify_likes: "Neue Likes",
    bio: "Biografie",
    profile_name: "Profilname",
    avatar: "Avatar (Emoji)",
    close_profile: "Profil schließen",
    chat: "Chat",
    follow: "Folgen",
    unfollow: "Entfolgen",
    stats: "Statistiken",
    activities_plural: "Aktivitäten",
    lines_plural: "Linien",
    rank: "Rang",
    level: "Stufe",
    recent_activities: "Neueste Aktivitäten",
    no_activities: "Keine Aktivitäten in dieser Stadt.",
    comments: "Kommentare",
    write_comment: "Schreibe einen Kommentar...",
    post: "Posten",
    like: "Gefällt mir",
    liked: "Gefällt mir",
    share: "Teilen",
    city_not_found: "Deine Stadt nicht gefunden?",
    request_city: "Aktivierung anfordern",
    city_requested: "Stadt erfolgreich angefordert!",
    simulating: "Simuliere...",
    verify_gps: "GPX-Datei hochladen",
    upload_gpx_descr: "Lade eine GPX-Datei deines Laufs hoch.",
    select_file: "GPX-Datei auswählen",
    drag_drop: "oder hierher ziehen",
    level_up: "Stufenaufstieg!",
    share_card_title: "Sportkarte",
    share_card_descr: "Erstelle ein visuelles Bild deines Laufs.",
    download_image: "Herunterladen",
  }
};

const mockAthletesList = [
  { id: 'carlos-gomez', name: 'Carlos Gómez', avatar: '🏃‍♂️', rankName: 'Explorador de Líneas', pct: 33, lines: 8, km: 58, privacy: 'public', bio: 'Me encanta explorar las rutas a ritmo de carrera.', completedRefs: ['L01', 'L05', 'L08'] },
  { id: 'sofia-martinez', name: 'Sofía Martínez', avatar: '⚡', rankName: 'Navegador Metropolitano', pct: 50, lines: 11, km: 82, privacy: 'followers', bio: 'Corredora habitual por las mañanas. El transporte urbano es mi entrenamiento preferido.', completedRefs: ['L02', 'L06', 'L11', 'L18'] },
  { id: 'marta-corredora', name: 'Marta Corredora', avatar: '🏃‍♀️', rankName: 'Experto en Rutas', pct: 92, lines: 23, km: 164, privacy: 'public', bio: 'Buscando el 100% de mi ciudad para subir a Leyenda del Tránsito.', completedRefs: ['L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08', 'L09', 'L10', 'L12', 'L13', 'L14', 'L15'] },
  { id: 'diego-cid', name: 'Diego Cid', avatar: '⚔️', rankName: 'Leyenda Urbana Absoluta', pct: 100, lines: 25, km: 210, privacy: 'private', bio: 'El primer Cid de la red. Completados todos los recorridos urbanos. Leyenda de la ciudad.', completedRefs: ['L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08', 'L09', 'L10', 'L11', 'L12', 'L13', 'L14', 'L15', 'L16', 'L17', 'L18', 'L20', 'L21', 'L22', 'L24', 'L25', 'L28', 'L80'] }
];

const mockFollowRelations: Record<string, string[]> = {
  'carlos-gomez': ['sofia-martinez', 'diego-cid'],
  'sofia-martinez': ['marta-corredora'],
  'marta-corredora': ['carlos-gomez', 'diego-cid'],
  'diego-cid': ['carlos-gomez', 'sofia-martinez']
};

interface ConnectedDevice {
  connected: boolean;
  lastSync?: string;
  userName?: string;
}

interface UserProfile {
  id: string;
  loggedIn: boolean;
  name: string;
  email: string;
  avatar: string;
  location: string;
  bio: string;
  isTestingMode?: boolean;
}

const renderAvatar = (avatarString: string, className?: string, onClick?: () => void, tooltip?: string) => {
  const avatar = avatarString || '🏃‍♂️';
  const isUrl = avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('data:image/');
  
  if (isUrl) {
    return (
      <img 
        src={avatar} 
        alt="Avatar" 
        className={className} 
        onClick={onClick} 
        title={tooltip}
        style={{ 
          width: '100%', 
          height: '100%', 
          borderRadius: '50%', 
          objectFit: 'cover', 
          cursor: onClick ? 'pointer' : 'default',
          border: '2px solid rgba(255, 255, 255, 0.2)' 
        }} 
      />
    );
  }
  
  return (
    <div 
      className={className} 
      onClick={onClick}
      title={tooltip}
      style={{ 
        cursor: onClick ? 'pointer' : 'default', 
        fontSize: className?.includes('large') ? '2.5rem' : '1.3rem',
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        width: '100%', 
        height: '100%',
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.05)',
        border: '2px solid rgba(255, 255, 255, 0.1)'
      }}
    >
      {avatar}
    </div>
  );
};

const getStravaProxyUrl = (path: string, queryParams: Record<string, string | number> = {}) => {
  const base = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'https://bus-run.vercel.app'
    : '';
  const params = new URLSearchParams();
  params.set('path', path);
  Object.entries(queryParams).forEach(([key, val]) => {
    params.set(key, String(val));
  });
  return `${base}/api/strava-proxy?${params.toString()}`;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'feed' | 'routes' | 'map' | 'profile' | 'search'>('feed');
  const [loadedBusLines, setLoadedBusLines] = useState<LineRoute[]>([]);
  const burgosBusLines = loadedBusLines; // Keep reference to avoid breaking old variables
  const uniqueLineRefs = useMemo(() => {
    return Array.from(new Set(burgosBusLines.map(l => l.ref))).sort();
  }, [burgosBusLines]);
  const [selectedLineId, setSelectedLineId] = useState<string>('');
  
  // Completed is stored as: Record of "city_lineRef" (e.g. "burgos_L01") -> completion details
  const [completed, setCompleted] = useState<Record<string, { date: string; timeSeconds: number; type: 'running' | 'walking'; matchPercent: number }>>({});
  
  const [feedActivities, setFeedActivities] = useState<UserActivity[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'completed' | 'pending'>('all');
  const [distanceFilter, setDistanceFilter] = useState<'all' | 'short' | 'medium' | 'long'>('all');
  
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [isSimulatedLocation, setIsSimulatedLocation] = useState(false);

  // Rebranding, multi-language & sharing states
  const [selectedShareActivity, setSelectedShareActivity] = useState<UserActivity | null>(null);
  const [cityRequestModal, setCityRequestModal] = useState(false);
  const [requestCityName, setRequestCityName] = useState('');
  const [requestCountryName, setRequestCountryName] = useState('');
  const [offlineActivitiesQueue, setOfflineActivitiesQueue] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('metromile-offline-activities');
      return saved ? JSON.parse(saved) : [];
    } catch(e) {
      return [];
    }
  });

  const t = (key: keyof typeof translations['es']) => {
    const lang = userSettings.lang || 'es';
    return translations[lang as 'es' | 'en' | 'fr' | 'de']?.[key] || translations['es']?.[key] || key;
  };

  const [prestigeCount, setPrestigeCount] = useState(() => Number(localStorage.getItem('metromile-prestige') || '0'));

  const [activeVirtualJourney, setActiveVirtualJourney] = useState(() => localStorage.getItem('metromile-active-journey') || 'london_central');
  const [virtualProgress, setVirtualProgress] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('metromile-virtual-progress');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const addDistanceToActiveVirtualJourney = (km: number) => {
    if (km <= 0) return;
    setVirtualProgress(prev => {
      const current = prev[activeVirtualJourney] || 0;
      const nextVal = parseFloat((current + km).toFixed(2));
      const updated = {
        ...prev,
        [activeVirtualJourney]: nextVal
      };
      localStorage.setItem('metromile-virtual-progress', JSON.stringify(updated));
      
      const journey = VIRTUAL_JOURNEYS.find(j => j.id === activeVirtualJourney);
      if (journey && current < journey.totalKm && nextVal >= journey.totalKm) {
        setTimeout(() => {
          addNotification(
            'MetroMile', 
            userSettings.lang === 'es' 
              ? `🎉 ¡Viaje Virtual Completado! Has conquistado la línea ${journey.nameEs} (${journey.totalKm} km).` 
              : `🎉 Virtual Journey Completed! You've conquered the ${journey.nameEn} line (${journey.totalKm} km).`, 
            'success'
          );
        }, 100);
      }
      return updated;
    });
  };

  const [xp, setXp] = useState(() => Number(localStorage.getItem('metromile-xp') || '350'));
  const [ticketCheckedDate, setTicketCheckedDate] = useState(() => localStorage.getItem('metromile-ticket-checked-date') || '');
  const [ticketReward, setTicketReward] = useState<{ type: string; value: number; desc: string; icon: string } | null>(() => {
    try {
      const saved = localStorage.getItem('metromile-ticket-reward');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const currentLevel = Math.floor(xp / 1000) + 1;
  const currentLevelXP = (currentLevel - 1) * 1000;
  const levelProgressPct = Math.min(100, Math.max(0, ((xp - currentLevelXP) / 1000) * 100));

  const transitAlerts = useMemo(() => {
    if (uniqueLineRefs.length === 0) return [];
    const d = new Date();
    const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    const lcg = (s: number) => (s * 1664525 + 1013904223) % 4294967296;
    
    let r1 = lcg(seed);
    let r2 = lcg(r1);
    
    const idx1 = r1 % uniqueLineRefs.length;
    let idx2 = r2 % uniqueLineRefs.length;
    if (idx1 === idx2 && uniqueLineRefs.length > 1) {
      idx2 = (idx2 + 1) % uniqueLineRefs.length;
    }
    
    const lineRef1 = uniqueLineRefs[idx1];
    const lineRef2 = uniqueLineRefs[idx2];
    
    return [
      {
        lineRef: lineRef1,
        type: 'strike',
        multiplier: 2.0,
        titleEs: '🚨 HUELGA GENERAL: Servicio Paralizado',
        titleEn: '🚨 GENERAL STRIKE: Service Halted',
        descEs: `La línea ${lineRef1} está en huelga hoy. ¡Corre el trayecto a pie para rescatar a los pasajeros y gana duplicador 2.0x XP!`,
        descEn: `Line ${lineRef1} is on strike today. Run the route on foot to help stranded commuters and earn a 2.0x XP multiplier!`,
        color: '#ef4444',
        icon: '🚨'
      },
      {
        lineRef: lineRef2,
        type: 'delay',
        multiplier: 1.5,
        titleEs: '⚠️ CATENARIA ROTA: Retrasos Graves',
        titleEn: '⚠️ DOWNED WIRE: Severe Delays',
        descEs: `Avería técnica en la línea ${lineRef2}. Corre a pie para 'adelantar' al metro y gana un multiplicador de 1.5x XP.`,
        descEn: `Technical failure on line ${lineRef2}. Run the route to outrun the trains and earn a 1.5x XP multiplier.`,
        color: '#f59e0b',
        icon: '⚠️'
      }
    ];
  }, [uniqueLineRefs]);

  const awardXpForCompletedActivity = (distanceKm: number, lineRef?: string) => {
    let baseXp = Math.round(distanceKm * 100);
    if (baseXp <= 0) baseXp = 50;
    
    let multiplier = 1.0;
    const today = new Date().toDateString();
    if (ticketCheckedDate === today && ticketReward && ticketReward.type === 'multiplier') {
      multiplier = Math.max(multiplier, ticketReward.value);
    }
    
    if (lineRef) {
      const activeAlert = transitAlerts.find(a => a.lineRef === lineRef);
      if (activeAlert) {
        multiplier = Math.max(multiplier, activeAlert.multiplier);
      }
    }
    
    const finalXp = Math.round(baseXp * multiplier);
    
    setXp(prev => {
      const next = prev + finalXp;
      localStorage.setItem('metromile-xp', String(next));
      return next;
    });

    setTimeout(() => {
      addNotification(
        'MetroMile', 
        userSettings.lang === 'es' 
          ? `⚡ ¡Ganaste +${finalXp} XP! (Base: ${baseXp} XP, Multiplicador: ${multiplier}x)` 
          : `⚡ Earned +${finalXp} XP! (Base: ${baseXp} XP, Multiplier: ${multiplier}x)`, 
        'success'
      );
    }, 200);
  };

  const handleValidateTicket = () => {
    const today = new Date().toDateString();
    if (ticketCheckedDate === today) return;
    
    const rewards = [
      { type: 'multiplier', value: 2.0, desc: userSettings.lang === 'es' ? 'Duplicador de Tránsito (2.0x XP en todas tus carreras hoy)' : 'Transit Doubler (2.0x XP on all runs today)', icon: '⚡' },
      { type: 'multiplier', value: 1.5, desc: userSettings.lang === 'es' ? 'Super Booster (1.5x XP en todas tus carreras hoy)' : 'Super Booster (1.5x XP on all runs today)', icon: '🔥' },
      { type: 'xp', value: 250, desc: userSettings.lang === 'es' ? 'Recompensa Instantánea (+250 XP añadidos de inmediato)' : 'Instant Reward (+250 XP added immediately)', icon: '🎁' },
      { type: 'xp', value: 150, desc: userSettings.lang === 'es' ? 'Recompensa de Metro (+150 XP añadidos de inmediato)' : 'Metro Reward (+150 XP added immediately)', icon: '🎫' }
    ];
    
    const reward = rewards[Math.floor(Math.random() * rewards.length)];
    
    setTicketCheckedDate(today);
    setTicketReward(reward);
    localStorage.setItem('metromile-ticket-checked-date', today);
    localStorage.setItem('metromile-ticket-reward', JSON.stringify(reward));
    
    if (reward.type === 'xp') {
      setXp(prev => {
        const next = prev + reward.value;
        localStorage.setItem('metromile-xp', String(next));
        return next;
      });
    }
    
    addNotification(
      'MetroMile',
      userSettings.lang === 'es' 
        ? `🎫 ¡Billete Validado! Recompensa: ${reward.desc}` 
        : `🎫 Ticket Validated! Reward: ${reward.desc}`,
      'success'
    );
  };

  useEffect(() => {
    const today = new Date().toDateString();
    const checkedDate = localStorage.getItem('metromile-ticket-checked-date') || '';
    if (checkedDate && checkedDate !== today) {
      setTicketCheckedDate('');
      setTicketReward(null);
      localStorage.removeItem('metromile-ticket-checked-date');
      localStorage.removeItem('metromile-ticket-reward');
    }
  }, []);

  const handlePrestigeReset = () => {
    const nextCount = prestigeCount + 1;
    setPrestigeCount(nextCount);
    localStorage.setItem('metromile-prestige', String(nextCount));
    
    // Clear completion progress for the active city
    const updated = { ...completed };
    Object.keys(updated).forEach(key => {
      if (key.startsWith(`${activeCity}_`)) {
        delete updated[key];
      }
    });
    setCompleted(updated);
    localStorage.setItem(STORAGE_PROGRESS_KEY, JSON.stringify(updated));
    
    if (supabase && userProfile.loggedIn && userProfile.id !== 'anonymous') {
      supabase.from('profiles').update({ prestige_count: nextCount }).eq('id', userProfile.id);
    }
    
    addNotification('MetroMile', userSettings.lang === 'es' ? '🏆 ¡Modo Prestigio iniciado! Progreso de ciudad reiniciado y estrella ganada.' : '🏆 Prestige Mode activated! City progress reset and star awarded.', 'success');
  };

  const [nearbyStops, setNearbyStops] = useState<{ stop: Stop; distanceKm: number; lineRefs: string[] }[]>([]);

  // Simulation states
  const [activeCity, setActiveCity] = useState('burgos');
  const [citiesList, setCitiesList] = useState<{ id: string; name: string; country: string; center: [number, number]; zoom: number; transports: string[] }[]>([]);
  const [activeTransport, setActiveTransport] = useState('bus');
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  // Google Auth Settings & Modal
  const [googleClientId, setGoogleClientId] = useState(() => {
    const saved = localStorage.getItem('busrun-google-client-id');
    const legacy = '1054045580649-4l05aevhfl83k7u048e718ndg27d3h75.apps.googleusercontent.com';
    if (saved === legacy) {
      localStorage.removeItem('busrun-google-client-id');
      return '966706651177-i57a7m33pv9kck76uhe1vdc7io8hlm6v.apps.googleusercontent.com';
    }
    return saved || '966706651177-i57a7m33pv9kck76uhe1vdc7io8hlm6v.apps.googleusercontent.com';
  });
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_USER_KEY);
      return saved ? JSON.parse(saved) : {
        id: 'anonymous',
        loggedIn: false,
        name: 'Atleta Anónimo',
        email: '',
        avatar: '🏃‍♂️',
        location: 'Burgos, España',
        bio: 'Atleta de transporte urbano. Conecta tus dispositivos y empieza a correr.',
        isTestingMode: false
      };
    } catch(e) {
      return {
        id: 'anonymous',
        loggedIn: false,
        name: 'Atleta Anónimo',
        email: '',
        avatar: '🏃‍♂️',
        location: 'Burgos, España',
        bio: 'Atleta de transporte urbano. Conecta tus dispositivos y empieza a correr.',
        isTestingMode: false
      };
    }
  });

  // Strava integration state
  const [stravaConfig, setStravaConfig] = useState(() => {
    const envClientId = import.meta.env.VITE_STRAVA_CLIENT_ID || '';
    try {
      const saved = localStorage.getItem('busrun-strava-config');
      const parsed = saved ? JSON.parse(saved) : {
        clientId: envClientId,
        clientSecret: '',
        connected: false,
        athleteName: '',
        athleteId: '',
        accessToken: '',
        refreshToken: '',
        expiresAt: 0
      };
      if (!parsed.clientId && envClientId) {
        parsed.clientId = envClientId;
      }
      return parsed;
    } catch(e) {
      return {
        clientId: envClientId,
        clientSecret: '',
        connected: false,
        athleteName: '',
        athleteId: '',
        accessToken: '',
        refreshToken: '',
        expiresAt: 0
      };
    }
  });
  const [notifications, setNotifications] = useState<{ id: string; brand: string; msg: string; type: 'info' | 'success' }[]>([]);

  const [gpxResult, setGpxResult] = useState<{ success: boolean; msg: string; matchPercent?: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadActivityType, setUploadActivityType] = useState<'running' | 'walking'>('running');

  const triggerAvatarChange = () => {
    if (avatarFileInputRef.current) {
      avatarFileInputRef.current.click();
    }
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("La imagen es demasiado grande. Por favor, selecciona una foto menor a 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Url = reader.result as string;
      handleProfileChange('avatar', base64Url);
      addNotification('Perfil', '¡Foto de perfil actualizada con éxito!', 'success');
    };
    reader.readAsDataURL(file);
  };

  // Interactive custom track map viewing (e.g. view other athlete's tracks)
  const [activeMapActivity, setActiveMapActivity] = useState<{
    name: string;
    userName: string;
    coords: [number, number][];
    isFreeRun: boolean;
  } | null>(null);

  // Private Messages simulation
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'me' | 'other'; text: string; time: string }>>([
    { sender: 'other', text: '¡Buenas! He visto en el feed que has completado la L01. ¿Qué tal el ritmo en la zona del Bulevar?', time: '10:14' },
    { sender: 'me', text: '¡Hola! Muy bien, el terreno es bastante llano por allí y se corre muy cómodo por la acera.', time: '10:16' },
    { sender: 'other', text: 'Genial. Yo hoy saldré a intentar completar la L05. A ver si subo de rango burgalés. 💪', time: '10:20' }
  ]);

  // Social athletes follow list & Athlete search
  const [followedAthletes, setFollowedAthletes] = useState<Record<string, boolean>>({
    'carlos-gomez': true,
    'sofia-martinez': false,
    'marta-corredora': false,
    'diego-cid': false
  });
  const [athleteSearchQuery, setAthleteSearchQuery] = useState('');

  // Favorite athletes state
  const [favoriteAthletes, setFavoriteAthletes] = useState<Record<string, boolean>>({
    'marta-corredora': true
  });

  // User Settings state
  const [userSettings, setUserSettings] = useState({
    privacy: 'public', // public | followers | private
    notifyFollows: true,
    notifyComments: true,
    notifyLikes: true,
    notifyChallenges: true,
    unit: 'km',
    lang: 'es'
  });
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsActiveTab, setSettingsActiveTab] = useState<'profile' | 'devices' | 'preferences' | 'info'>('profile');

  // PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPwaBanner, setShowPwaBanner] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);

  // Notifications state
  const [unreadNotifications, setUnreadNotifications] = useState<Array<{ id: string; title: string; body: string; time: string; read: boolean; type: string }>>([
    { id: 'n-1', title: 'Nueva Seguidora', body: 'Sofía Martínez ha empezado a seguirte.', time: 'Hace 10 min', read: false, type: 'follow' },
    { id: 'n-2', title: 'Comentario en Actividad', body: 'Marta Corredora comentó: "¡Buen entreno en la L01!"', time: 'Hace 1 hora', read: false, type: 'comment' },
    { id: 'n-3', title: 'Logro Desbloqueado', body: '¡Has alcanzado el rango Peregrino del Camino!', time: 'Ayer', read: true, type: 'achievement' }
  ]);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);

  // Live GPS Tracking state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingDistance, setRecordingDistance] = useState(0);
  const [recordingCoords, setRecordingCoords] = useState<[number, number][]>([]);
  const [recordingType, setRecordingType] = useState<'running' | 'walking'>('running');
  const [isPaused, setIsPaused] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<any>(null);

  // Onboarding Tutorial state
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(() => {
    return localStorage.getItem('busrun-onboarding-completed') === 'true';
  });
  
  const [chatRecipient, setChatRecipient] = useState<{ id: string; name: string } | null>(null);
  const [registeredAthletes, setRegisteredAthletes] = useState<any[]>([]);

  const activeAthletesList = useMemo(() => {
    if (supabase) {
      return registeredAthletes.filter(ath => ath.id !== userProfile.id);
    }
    return [];
  }, [registeredAthletes, userProfile.id]);

  // Selected Athlete for profile popup
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);

  // Daily Challenge state
  const [dailyChallenge, setDailyChallenge] = useState({
    ref: 'L03',
    name: 'Línea L03: Plaza España → Bda. Yagüe',
    rewardXP: 100,
    completed: false
  });

  // Load local storage
  useEffect(() => {
    const savedProgress = localStorage.getItem(STORAGE_PROGRESS_KEY);
    if (savedProgress) {
      try {
        setCompleted(JSON.parse(savedProgress));
      } catch (e) {
        console.error(e);
      }
    } else {
      // Prepopulate L01 completed
      const initialProgress = {
        'burgos_L01': {
          date: new Date(Date.now() - 2 * 24 * 3600 * 1000).toLocaleDateString(),
          timeSeconds: 1143,
          type: 'running' as const,
          matchPercent: 94.5
        }
      };
      setCompleted(initialProgress);
      localStorage.setItem(STORAGE_PROGRESS_KEY, JSON.stringify(initialProgress));
    }

    const savedUser = localStorage.getItem(STORAGE_USER_KEY);
    if (savedUser) {
      try {
        setUserProfile(JSON.parse(savedUser));
      } catch (e) {
        console.error(e);
      }
    }



    const favs = localStorage.getItem('busrun-favorite-athletes-v5');
    if (favs) {
      try { setFavoriteAthletes(JSON.parse(favs)); } catch(e) {}
    }

    const settings = localStorage.getItem('busrun-user-settings-v5');
    if (settings) {
      try { 
        const parsed = JSON.parse(settings);
        setUserSettings(prev => ({ ...prev, ...parsed }));
      } catch(e) {}
    }

    const notifs = localStorage.getItem('busrun-user-notifications-v5');
    if (notifs) {
      try { setUnreadNotifications(JSON.parse(notifs)); } catch(e) {}
    }

    const tutorialSeen = localStorage.getItem('busrun-tutorial-seen');
    if (!tutorialSeen) {
      setTutorialStep(1);
    }

    const savedFeed = localStorage.getItem(STORAGE_FEED_KEY);
    if (savedFeed) {
      try {
        setFeedActivities(JSON.parse(savedFeed));
      } catch (e) {
        console.error(e);
      }
    } else {
      const defaultFeed: UserActivity[] = [
        {
          id: 'act-1',
          userName: 'Carlos Gómez',
          userAvatar: '🏃‍♂️',
          lineId: '2099651',
          lineRef: 'L01',
          lineName: 'L01: Avda. Arlanzón → Gamonal',
          distanceKm: 3.37,
          elevationGain: 58.0,
          timeSeconds: 1045,
          date: 'Ayer a las 18:34',
          matchPercent: 88.0,
          type: 'running',
          likes: 12,
          comments: [
            { id: 'c-1', userName: 'Lucía Sanz', text: '¡Vaya tiempazo en la subida a Gamonal! 💪' }
          ],
          cityId: 'burgos'
        },
        {
          id: 'act-2',
          userName: 'Sofía Martínez',
          userAvatar: '⚡',
          lineId: '2101005',
          lineRef: 'L06',
          lineName: 'L06: Ismael García Rámila → Plaza España',
          distanceKm: 3.56,
          elevationGain: 23.2,
          timeSeconds: 2710,
          date: 'Hace 2 días',
          matchPercent: 95.0,
          type: 'walking',
          likes: 8,
          comments: [],
          cityId: 'burgos'
        }
      ];
      setFeedActivities(defaultFeed);
      localStorage.setItem(STORAGE_FEED_KEY, JSON.stringify(defaultFeed));
    }
  }, []);

  // Lock body scroll when a modal is open
  useEffect(() => {
    const isModalOpen = showSettingsModal || !!selectedAthleteId || showChatModal;
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showSettingsModal, selectedAthleteId, showChatModal]);

  // PWA Install Event Handler
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      
      const runningStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
      const dismissed = localStorage.getItem('busrun-pwa-dismissed') === 'true';
      if (!runningStandalone && !dismissed) {
        setShowPwaBanner(true);
      }
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS Check
    const userAgent = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(ios);

    const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
    const runningStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    setIsStandalone(!!runningStandalone);

    const dismissed = localStorage.getItem('busrun-pwa-dismissed') === 'true';
    if (isMobile && !runningStandalone && !dismissed) {
      setShowPwaBanner(true);
    }

    // Listen for PWA updates
    const handleUpdate = () => setShowUpdateBanner(true);
    window.addEventListener('pwa-update-available', handleUpdate);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('pwa-update-available', handleUpdate);
    };
  }, []);

  const handleInstallPwa = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPwaBanner(false);
      }
      setDeferredPrompt(null);
    } else if (isIos) {
      alert("Para instalar en iPhone/iPad:\n\n1. Pulsa el botón de Compartir 📤 en la barra inferior de Safari.\n2. Selecciona 'Añadir a la pantalla de inicio' ➕ en la lista.\n3. Confirma pulsando 'Añadir' arriba a la derecha.");
    } else {
      alert("Para instalar esta app en tu móvil:\n\n1. Abre tu navegador y pulsa el botón de Opciones (tres puntos).\n2. Selecciona 'Instalar aplicación' o 'Añadir a pantalla de inicio'.");
    }
  };

  // Load list of supported cities
  useEffect(() => {
    const loadCities = async () => {
      try {
        const response = await fetch('/data/cities.json');
        if (response.ok) {
          const data = await response.json();
          setCitiesList(data);
        } else {
          // Default fallback cities in case cities.json doesn't exist yet
          setCitiesList([
            { id: 'burgos', name: 'Burgos', country: 'España', center: [42.3448, -3.6812], zoom: 13, transports: ['bus'] },
            { id: 'madrid', name: 'Madrid', country: 'España', center: [40.4167, -3.7037], zoom: 12, transports: ['metro'] },
            { id: 'barcelona', name: 'Barcelona', country: 'España', center: [41.3851, 2.1734], zoom: 12, transports: ['metro'] },
            { id: 'bilbao', name: 'Bilbao', country: 'España', center: [43.2630, -2.9350], zoom: 12, transports: ['metro'] }
          ]);
        }
      } catch (e) {
        console.error("Error loading cities list:", e);
      }
    };
    loadCities();
  }, []);

  const ensureRouteDetailsLoaded = async (lines: LineRoute[]) => {
    const promises = lines.map(async (line) => {
      if (line.coords && line.coords.length > 0 && line.stops && line.stops.length > 0) {
        return line;
      }
      try {
        const res = await fetch(`/data/cities/${activeCity}/routes/${line.id}.json`);
        if (res.ok) {
          const detail = await res.json();
          return { ...line, coords: detail.coords, stops: detail.stops };
        }
      } catch (e) {
        console.error('Failed to load route detail for', line.id, e);
      }
      return line;
    });
    const loaded = await Promise.all(promises);
    setLoadedBusLines(loaded);
    return loaded;
  };

  // Dynamic City Route Loader with Stop Name Sanitizer & Legacy Fallback
  useEffect(() => {
    const loadCityData = async () => {
      try {
        let data: LineRoute[] = [];
        
        // Try the new split format index first
        const response = await fetch(`/data/cities/${activeCity}/metadata.json`);
        if (response.ok) {
          const meta = await response.json();
          data = meta.map((m: any) => ({
            id: m.id,
            name: m.name,
            ref: m.ref,
            description: m.description,
            distanceKm: m.distanceKm,
            elevationGain: m.elevationGain,
            elevationLoss: m.elevationLoss,
            estWalkingSeconds: m.estWalkingSeconds,
            estRunningSeconds: m.estRunningSeconds,
            stopsCount: m.stopsCount,
            coords: [],
            stops: []
          }));
        } else {
          // Fallback to legacy single JSON file
          const legacyResponse = await fetch(`/data/${activeCity}.json`);
          if (!legacyResponse.ok) {
            throw new Error('City file not found');
          }
          data = await legacyResponse.json() as LineRoute[];
        }
        
        // Clean stops to make sure they all have names!
        const cleaned = data.map(line => {
          if (!line.stops || line.stops.length === 0) return line;
          
          const cleanedStops = line.stops.map((stop, idx) => {
            let name = stop.name ? stop.name.trim() : '';
            if (isErroneousStopName(name, stop.id)) {
              const namedStops = line.stops.filter(s => s.name && !isErroneousStopName(s.name, s.id));
              if (namedStops.length > 0) {
                let closest = namedStops[0];
                let minDist = haversineDistance(stop.lat, stop.lon, closest.lat, closest.lon);
                for (let s of namedStops) {
                  const d = haversineDistance(stop.lat, stop.lon, s.lat, s.lon);
                  if (d < minDist) {
                    minDist = d;
                    closest = s;
                  }
                }
                const distM = Math.round(minDist * 1000);
                name = `Cerca de ${closest.name} (${distM}m)`;
              } else {
                if (idx === 0) name = `Origen Línea ${line.ref}`;
                else if (idx === line.stops.length - 1) name = `Término Línea ${line.ref}`;
                else name = `Parada Calle Proximidad ${idx} (${line.ref})`;
              }
            }
            return { ...stop, name };
          });
          return { ...line, stops: cleanedStops };
        });

        setLoadedBusLines(cleaned);
        if (cleaned.length > 0) {
          setSelectedLineId(cleaned[0].id);
        }
      } catch (err) {
        console.error('Error loading city data dynamically:', err);
      }
    };
    loadCityData();
  }, [activeCity]);

  // Load selected line details (coordinates and stops) on demand
  useEffect(() => {
    if (!selectedLineId) return;
    
    const line = loadedBusLines.find(l => l.id === selectedLineId);
    if (line && (!line.coords || line.coords.length === 0 || !line.stops || line.stops.length === 0)) {
      const fetchRouteDetails = async () => {
        try {
          const res = await fetch(`/data/cities/${activeCity}/routes/${selectedLineId}.json`);
          if (res.ok) {
            const detail = await res.json();
            setLoadedBusLines(prev => prev.map(l => {
              if (l.id === selectedLineId) {
                return { ...l, coords: detail.coords, stops: detail.stops };
              }
              return l;
            }));
          }
        } catch (e) {
          console.error("Error fetching route details:", e);
        }
      };
      fetchRouteDetails();
    }
  }, [selectedLineId, activeCity, loadedBusLines]);

  // Google Identity Services (GIS) Real Authentication Hook
  useEffect(() => {
    const initGoogle = () => {
      const google = (window as any).google;
      const btnEl = document.getElementById('google-signin-btn-real');
      if (google && btnEl) {
        google.accounts.id.initialize({
          client_id: googleClientId,
          callback: (response: any) => {
            const payload = parseJwt(response.credential);
            if (payload) {
              const newProfile: UserProfile = {
                id: payload.sub,
                loggedIn: true,
                name: payload.name || payload.given_name || 'Usuario Google',
                email: payload.email || '',
                avatar: payload.picture || '👤',
                location: 'Burgos, España',
                bio: 'Conectado a MetroMile con Google. ¡Listo para devorar las calles!',
                isTestingMode: false
              };
              saveProfile(newProfile);
              saveProgress({}); // Clear mock progress for real users
              addNotification('Google', `¡Sesión iniciada con éxito! Bienvenido/a, ${newProfile.name}.`, 'success');
              
              if (supabase) {
                supabase.from('profiles').upsert({
                  id: newProfile.id,
                  email: newProfile.email,
                  name: newProfile.name,
                  avatar: newProfile.avatar,
                  bio: newProfile.bio,
                  location: newProfile.location
                }).then(({ error }) => {
                  if (error) console.error('Error in profiles upsert:', error);
                });
              }
            }
          }
        });
        
        google.accounts.id.renderButton(
          btnEl,
          { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', width: '280' }
        );
      }
    };

    const timer = setTimeout(initGoogle, 300);
    return () => clearTimeout(timer);
  }, [showSettingsModal, googleClientId, userProfile.loggedIn, onboardingCompleted]);

  // Handle Strava OAuth redirect code on startup
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      const exchangeCode = async () => {
        try {
          let currentConfig = {
            clientId: '',
            clientSecret: '',
            connected: false,
            athleteName: '',
            athleteId: '',
            accessToken: '',
            refreshToken: '',
            expiresAt: 0
          };
          try {
            const saved = localStorage.getItem('busrun-strava-config');
            if (saved) currentConfig = JSON.parse(saved);
          } catch(e){}

          const clientIdToUse = currentConfig.clientId || import.meta.env.VITE_STRAVA_CLIENT_ID;
          if (!clientIdToUse) {
            const mockConfig = {
              ...currentConfig,
              connected: true,
              athleteName: 'Félix (Strava Runner)',
              athleteId: '98765432',
              accessToken: 'mock-token',
              refreshToken: 'mock-refresh',
              expiresAt: Math.floor(Date.now() / 1000) + 36000
            };
            saveStravaConfig(mockConfig);
            addNotification('Strava', '¡Cuenta de Strava (Simulada) vinculada con éxito!', 'success');
          } else {
            const response = await fetch(getStravaProxyUrl('oauth/token'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                client_id: clientIdToUse,
                client_secret: currentConfig.clientSecret || '',
                code: code,
                grant_type: 'authorization_code'
              })
            });

            if (!response.ok) {
              throw new Error('Error al intercambiar el token de Strava');
            }

            const data = await response.json();
            const newConfig = {
              clientId: clientIdToUse,
              clientSecret: currentConfig.clientSecret || '',
              connected: true,
              athleteName: `${data.athlete.firstname} ${data.athlete.lastname}`,
              athleteId: String(data.athlete.id),
              accessToken: data.access_token,
              refreshToken: data.refresh_token,
              expiresAt: data.expires_at
            };
            saveStravaConfig(newConfig);
            addNotification('Strava', `¡Cuenta de Strava conectada: ${newConfig.athleteName}!`, 'success');
          }
        } catch(err: any) {
          console.error(err);
          addNotification('Strava', 'Error al conectar Strava: ' + err.message, 'info');
        } finally {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      };
      exchangeCode();
    }
  }, []);

  const saveProgress = (newCompleted: typeof completed) => {
    setCompleted(newCompleted);
    localStorage.setItem(STORAGE_PROGRESS_KEY, JSON.stringify(newCompleted));
  };

  const saveProfile = (newProfile: UserProfile) => {
    setUserProfile(newProfile);
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(newProfile));
  };

  const handleProfileChange = async (key: keyof UserProfile, val: any) => {
    const updated = { ...userProfile, [key]: val };
    saveProfile(updated);

    if (supabase && updated.loggedIn && updated.id !== 'anonymous') {
      const { error } = await supabase.from('profiles').upsert({
        id: updated.id,
        email: updated.email,
        name: updated.name,
        avatar: updated.avatar,
        bio: updated.bio,
        location: updated.location
      });
      if (error) {
        console.error('Error updating profile in Supabase:', error);
      }
    }
  };

  const saveStravaConfig = (newConfig: typeof stravaConfig) => {
    setStravaConfig(newConfig);
    localStorage.setItem('busrun-strava-config', JSON.stringify(newConfig));
  };

  const saveFeed = (newFeed: UserActivity[]) => {
    const currentIds = new Set(feedActivities.map(a => a.id));
    const newActivities = newFeed.filter(a => !currentIds.has(a.id));
    
    let addedKm = 0;
    newActivities.forEach(act => {
      if (act.distanceKm > 0) {
        addedKm += act.distanceKm;
        // Award XP for this run!
        awardXpForCompletedActivity(act.distanceKm, act.lineRef);
      }
    });
    if (addedKm > 0) {
      addDistanceToActiveVirtualJourney(addedKm);
    }

    const updatedFeed = newFeed.map(act => {
      if (act.cityId === 'burgos' && activeCity !== 'burgos') {
        return { ...act, cityId: activeCity };
      }
      return act;
    });

    setFeedActivities(updatedFeed);
    localStorage.setItem(STORAGE_FEED_KEY, JSON.stringify(updatedFeed));
  };

  const saveFavorites = (newFavs: Record<string, boolean>) => {
    setFavoriteAthletes(newFavs);
    localStorage.setItem('busrun-favorite-athletes-v5', JSON.stringify(newFavs));
  };

  const saveSettings = (newSettings: typeof userSettings) => {
    setUserSettings(newSettings);
    localStorage.setItem('busrun-user-settings-v5', JSON.stringify(newSettings));
  };

  const saveNotifications = (newNotifs: typeof unreadNotifications) => {
    setUnreadNotifications(newNotifs);
    localStorage.setItem('busrun-user-notifications-v5', JSON.stringify(newNotifs));
  };

  const addNotification = (brand: string, msg: string, type: 'info' | 'success' = 'info') => {
    const id = `notif-${Date.now()}`;
    setNotifications(prev => [...prev, { id, brand, msg, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 6000);
  };

  const startRecording = (type: 'running' | 'walking') => {
    if (isRecording) return;
    setIsRecording(true);
    setIsPaused(false);
    setRecordingStartTime(Date.now());
    setRecordingSeconds(0);
    setRecordingDistance(0);
    setRecordingCoords([]);
    setRecordingType(type);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const firstCoord: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setRecordingCoords([firstCoord]);
          setUserLocation(firstCoord);
          
          watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
              if (isPaused) return;
              const lat = position.coords.latitude;
              const lon = position.coords.longitude;
              const newCoord: [number, number] = [lat, lon];
              
              setRecordingCoords(prev => {
                if (prev.length === 0) return [newCoord];
                const last = prev[prev.length - 1];
                const dist = haversineDistance(last[0], last[1], lat, lon);
                if (dist > 0.003) { // 3 meters
                  setRecordingDistance(d => d + dist);
                  return [...prev, newCoord];
                }
                return prev;
              });
              setUserLocation(newCoord);
            },
            (err) => console.error(err),
            { enableHighAccuracy: true }
          );
        },
        (err) => {
          console.warn("GPS error, starting with default coords", err);
        }
      );
    }

    recordingTimerRef.current = setInterval(() => {
      setRecordingSeconds(s => s + 1);
    }, 1000);

    addNotification('GPS', 'Grabación de actividad iniciada. ¡A entrenar!', 'success');
  };

  const pauseRecording = () => {
    setIsPaused(p => !p);
  };

  const stopAndSaveRecording = async () => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    setIsRecording(false);

    if (recordingCoords.length < 3) {
      alert("La actividad es demasiado corta para guardarse.");
      return;
    }

    // Verify coordinates against bus routes
    let bestMatchLine: LineRoute | null = null;
    let bestMatchPercent = 0;
    let bestVisitedStops = 0;

    const fullyLoadedLines = await ensureRouteDetailsLoaded(loadedBusLines);

    for (const line of fullyLoadedLines) {
      let visitedStopsCount = 0;
      for (const stop of line.stops) {
        const isClose = recordingCoords.some(([glat, glon]) => {
          return haversineDistance(stop.lat, stop.lon, glat, glon) <= 0.12; // 120m
        });
        if (isClose) {
          visitedStopsCount++;
        }
      }

      const pct = parseFloat(((visitedStopsCount / line.stops.length) * 100).toFixed(1));
      if (pct > bestMatchPercent) {
        bestMatchPercent = pct;
        bestMatchLine = line;
        bestVisitedStops = visitedStopsCount;
      }
    }

    const passed = bestMatchPercent >= 70.0;
    const distanceKm = recordingDistance > 0 ? recordingDistance : parseFloat((recordingCoords.length * 0.05).toFixed(2));
    const finalSeconds = recordingSeconds;

    if (passed && bestMatchLine) {
      const detectedLine = bestMatchLine as LineRoute;
      const newCompleted = {
        ...completed,
        [`${activeCity}_${detectedLine.ref}`]: {
          date: new Date().toLocaleDateString(),
          timeSeconds: finalSeconds,
          type: recordingType,
          matchPercent: bestMatchPercent
        }
      };
      saveProgress(newCompleted);

      // Check if this completes the daily challenge
      let challengeBonusMsg = "";
      if (detectedLine.ref === dailyChallenge.ref && !dailyChallenge.completed) {
        setDailyChallenge(prev => ({ ...prev, completed: true }));
        challengeBonusMsg = ` ¡Reto Diario Completado! (+${dailyChallenge.rewardXP} XP)`;
        
        saveNotifications([
          {
            id: `notif-${Date.now()}`,
            title: 'Reto Completado',
            body: `Has completado el Reto Diario corriendo la Línea ${detectedLine.ref}.`,
            time: 'Ahora',
            read: false,
            type: 'achievement'
          },
          ...unreadNotifications
        ]);
      }

      const newActivity: UserActivity = {
        id: `live-act-${Date.now()}`,
        userName: userProfile.name,
        userAvatar: userProfile.avatar,
        lineId: detectedLine.id,
        lineRef: detectedLine.ref,
        lineName: detectedLine.name,
        distanceKm: distanceKm,
        elevationGain: detectedLine.elevationGain,
        timeSeconds: finalSeconds,
        date: 'Hoy a las ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        matchPercent: bestMatchPercent,
        type: recordingType,
        likes: 0,
        comments: [],
        cityId: activeCity,
        coords: recordingCoords
      };

      saveFeed([newActivity, ...feedActivities]);
      saveNewActivityToDatabase(newActivity);
      addNotification('GPS', `¡Línea ${detectedLine.ref} completada!${challengeBonusMsg}`, 'success');
      alert(`¡Actividad Guardada!\n\nLínea Detectada: ${detectedLine.ref} (${detectedLine.name.split(': ')[1] || detectedLine.name})\nDistancia: ${distanceKm.toFixed(2)} km\nTiempo: ${formatDuration(finalSeconds)}\nCoincidencia: ${bestMatchPercent}%`);
    } else {
      const newActivity: UserActivity = {
        id: `live-free-act-${Date.now()}`,
        userName: userProfile.name,
        userAvatar: userProfile.avatar,
        lineId: 'free',
        lineRef: 'LIBRE',
        lineName: 'Entrenamiento Libre',
        distanceKm: distanceKm,
        elevationGain: Math.round(distanceKm * 10),
        timeSeconds: finalSeconds,
        date: 'Hoy a las ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        matchPercent: bestMatchPercent,
        type: recordingType,
        likes: 0,
        comments: [],
        cityId: activeCity,
        coords: recordingCoords
      };

      saveFeed([newActivity, ...feedActivities]);
      saveNewActivityToDatabase(newActivity);
      addNotification('GPS', `Entrenamiento Libre guardado con éxito.`, 'info');
      alert(`¡Actividad Guardada!\n\nNo coincide con ninguna línea (Máxima coincidencia: ${bestMatchPercent}%).\nGuardado como 'Entrenamiento Libre'\nDistancia: ${distanceKm.toFixed(2)} km\nTiempo: ${formatDuration(finalSeconds)}`);
    }
  };

  const cancelRecording = () => {
    if (confirm("¿Seguro que deseas descartar la actividad actual?")) {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setIsRecording(false);
      addNotification('GPS', 'Actividad descartada.', 'info');
    }
  };

  const startSimulatedRecording = () => {
    if (isRecording) return;
    const targetLine = selectedLine || burgosBusLines[0];
    if (!targetLine || targetLine.coords.length === 0) {
      alert("No hay ruta seleccionada para simular.");
      return;
    }

    setIsRecording(true);
    setIsPaused(false);
    setRecordingStartTime(Date.now());
    setRecordingSeconds(0);
    setRecordingDistance(0);
    setRecordingCoords([]);
    setRecordingType('running');

    addNotification('GPS Sim', `Simulando recorrido en vivo en la Línea ${targetLine.ref}...`, 'info');

    let idx = 0;
    const pathCoords = targetLine.coords;
    const step = Math.max(1, Math.floor(pathCoords.length / 20));
    
    recordingTimerRef.current = setInterval(() => {
      if (idx >= pathCoords.length) {
        clearInterval(recordingTimerRef.current);
        setIsRecording(false);
        
        setRecordingCoords(prev => {
          const finalCoords = prev.length > 0 ? prev : pathCoords.map(([lat, lon]) => [lat, lon] as [number, number]);
          const distanceKm = targetLine.distanceKm;
          const finalSeconds = Math.round(distanceKm * 300);

          const newCompleted = {
            ...completed,
            [`${activeCity}_${targetLine.ref}`]: {
              date: new Date().toLocaleDateString(),
              timeSeconds: finalSeconds,
              type: 'running' as const,
              matchPercent: 100
            }
          };
          saveProgress(newCompleted);

          let challengeBonusMsg = "";
          if (targetLine.ref === dailyChallenge.ref && !dailyChallenge.completed) {
            setDailyChallenge(prev => ({ ...prev, completed: true }));
            challengeBonusMsg = ` ¡Reto Diario Completado! (+${dailyChallenge.rewardXP} XP)`;
            
            saveNotifications([
              {
                id: `notif-${Date.now()}`,
                title: 'Reto Completado',
                body: `Has completado el Reto Diario simulando la Línea ${targetLine.ref}.`,
                time: 'Ahora',
                read: false,
                type: 'achievement'
              },
              ...unreadNotifications
            ]);
          }

          const newActivity: UserActivity = {
            id: `sim-act-${Date.now()}`,
            userName: userProfile.name,
            userAvatar: userProfile.avatar,
            lineId: targetLine.id,
            lineRef: targetLine.ref,
            lineName: targetLine.name,
            distanceKm: distanceKm,
            elevationGain: targetLine.elevationGain,
            timeSeconds: finalSeconds,
            date: 'Hoy a las ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' (Simulado)',
            matchPercent: 100,
            type: 'running',
            likes: 0,
            comments: [],
            cityId: activeCity,
            coords: finalCoords
          };

          saveFeed([newActivity, ...feedActivities]);
          saveNewActivityToDatabase(newActivity);
          addNotification('GPS Sim', `¡Línea ${targetLine.ref} completada con simulación!${challengeBonusMsg}`, 'success');
          return [];
        });

        return;
      }

      const [lat, lon] = pathCoords[idx];
      const latOffset = (Math.random() - 0.5) * 0.0001;
      const lonOffset = (Math.random() - 0.5) * 0.0001;
      const newCoord: [number, number] = [lat + latOffset, lon + lonOffset];

      setRecordingCoords(prev => {
        if (prev.length === 0) return [newCoord];
        const last = prev[prev.length - 1];
        const dist = haversineDistance(last[0], last[1], newCoord[0], newCoord[1]);
        setRecordingDistance(d => d + dist);
        return [...prev, newCoord];
      });

      setUserLocation(newCoord);
      setRecordingSeconds(s => s + 45);
      idx += step;
      if (idx >= pathCoords.length && idx - step < pathCoords.length) {
        idx = pathCoords.length;
      }
    }, 500);
  };



  const handleLogout = () => {
    const newProfile: UserProfile = {
      id: 'anonymous',
      loggedIn: false,
      name: 'Atleta Anónimo',
      email: '',
      avatar: '🏃‍♂️',
      location: 'Burgos, España',
      bio: 'Atleta de transporte urbano. Conecta tus dispositivos y empieza a correr.',
      isTestingMode: false
    };
    saveProfile(newProfile);
    localStorage.removeItem('busrun-onboarding-completed');
    localStorage.removeItem('busrun-tutorial-seen');
    localStorage.removeItem('busrun-strava-skipped');
    saveStravaConfig({
      clientId: '',
      clientSecret: '',
      connected: false,
      athleteName: '',
      athleteId: '',
      accessToken: '',
      refreshToken: '',
      expiresAt: 0
    });
    setOnboardingCompleted(false);
    addNotification('Google', 'Sesión cerrada correctamente.', 'info');
  };

  const handleConnectStrava = () => {
    const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID || stravaConfig.clientId;
    if (!clientId) {
      alert("No se ha configurado el Client ID de Strava en las variables de entorno.");
      return;
    }
    const redirectUri = window.location.origin;
    const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=activity:read_all&approval_prompt=auto`;
    window.location.href = url;
  };

  const handleDisconnectStrava = () => {
    saveStravaConfig({
      clientId: stravaConfig.clientId,
      clientSecret: stravaConfig.clientSecret,
      connected: false,
      athleteName: '',
      athleteId: '',
      accessToken: '',
      refreshToken: '',
      expiresAt: 0
    });
    addNotification('Strava', 'Cuenta de Strava desvinculada con éxito.', 'info');
  };

  const refreshStravaToken = async (config: typeof stravaConfig) => {
    if (Date.now() / 1000 < config.expiresAt - 60) {
      return config.accessToken;
    }
    try {
      const clientIdToUse = config.clientId || import.meta.env.VITE_STRAVA_CLIENT_ID || '';
      const response = await fetch(getStravaProxyUrl('oauth/token'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientIdToUse,
          client_secret: '',
          grant_type: 'refresh_token',
          refresh_token: config.refreshToken
        })
      });
      if (!response.ok) throw new Error('Refrescar token falló');
      const data = await response.json();
      const updated = {
        ...config,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_at
      };
      saveStravaConfig(updated);
      return data.access_token;
    } catch(e) {
      console.error('Error al refrescar token de Strava:', e);
      return null;
    }
  };

  const aggregatedLines = useMemo(() => {
    const grouped: Record<string, LineRoute[]> = {};
    burgosBusLines.forEach(line => {
      if (!grouped[line.ref]) grouped[line.ref] = [];
      grouped[line.ref].push(line);
    });

    return Object.entries(grouped).map(([ref, routes]) => {
      const primary = routes[0];
      const avgDistance = routes.reduce((sum, r) => sum + r.distanceKm, 0) / routes.length;
      const avgStops = Math.round(routes.reduce((sum, r) => sum + r.stopsCount, 0) / routes.length);

      let mergedName = primary.name;
      if (routes.length > 1) {
        const name1 = routes[0].name.split(': ')[1] || routes[0].name;
        const name2 = routes[1].name.split(': ')[1] || routes[1].name;
        const start = name1.split(' → ')[0] || name1;
        const end = name1.split(' → ')[1] || name2.split(' → ')[0] || '';
        mergedName = `${ref}: ${start} ⇄ ${end}`;
      } else {
        mergedName = primary.name.replace(' → ', ' ⇄ ');
      }

      return {
        id: primary.id,
        ref: ref,
        name: mergedName,
        description: `Línea ${ref} de Burgos. Sincroniza actividades para completarla.`,
        distanceKm: avgDistance,
        stopsCount: avgStops,
        elevationGain: primary.elevationGain, // Keep for feed, but hide in listing
        coords: primary.coords,
        stops: primary.stops,
        subRoutes: routes
      };
    });
  }, [burgosBusLines]);

  const [selectedDirection, setSelectedDirection] = useState<number>(0);

  const selectedLine = useMemo(() => {
    const agg = aggregatedLines.find(l => l.id === selectedLineId || l.ref === selectedLineId);
    if (!agg) return burgosBusLines[0] || null;

    const routes = agg.subRoutes;
    if (routes && routes.length > 0) {
      return routes[selectedDirection] || routes[0];
    }
    return agg as unknown as LineRoute;
  }, [selectedLineId, aggregatedLines, selectedDirection, burgosBusLines]);

  const mapCenter = useMemo<[number, number]>(() => {
    if (activeMapActivity && activeMapActivity.coords.length > 0) {
      return activeMapActivity.coords[0];
    }
    if (userLocation) {
      return userLocation;
    }
    if (selectedLine && selectedLine.coords.length > 0) {
      return [selectedLine.coords[0][0], selectedLine.coords[0][1]];
    }
    return [42.3431, -3.7009];
  }, [selectedLine, userLocation, activeMapActivity]);



  const burgosCompletedUniqueCount = useMemo(() => {
    return uniqueLineRefs.filter(ref => !!completed[`${activeCity}_${ref}`]).length;
  }, [completed, uniqueLineRefs, activeCity]);

  const totalBurgosLinesCount = uniqueLineRefs.length;
  const burgosCompletionPercentage = totalBurgosLinesCount > 0 
    ? parseFloat(((burgosCompletedUniqueCount / totalBurgosLinesCount) * 100).toFixed(1))
    : 0;

  const completedKeys = Object.keys(completed);
  const globalCompletedCount = completedKeys.length;

  const globalCompletionPercentage = useMemo(() => {
    let totalAvailableUniqueLinesCount = 25;
    const activeCities = new Set(completedKeys.map(k => k.split('_')[0]));
    
    if (activeCities.has('madrid')) totalAvailableUniqueLinesCount += 30;
    if (activeCities.has('barcelona')) totalAvailableUniqueLinesCount += 25;
    
    const totalCompletedCount = completedKeys.length;
    const pct = (totalCompletedCount / totalAvailableUniqueLinesCount) * 100;
    return Math.min(100, Math.max(0, parseFloat(pct.toFixed(1))));
  }, [completedKeys]);

  const totalKmCompleted = useMemo(() => {
    return completedKeys.reduce((sum, key) => {
      const [city, ref] = key.split('_');
      if (city === activeCity) {
        const line = burgosBusLines.find(l => l.ref === ref);
        return sum + (line ? line.distanceKm : 0);
      }
      return sum + 6.8; 
    }, 0);
  }, [completedKeys, activeCity, burgosBusLines]);

  const totalElevationGainCompleted = useMemo(() => {
    return completedKeys.reduce((sum, key) => {
      const [city, ref] = key.split('_');
      if (city === activeCity) {
        const line = burgosBusLines.find(l => l.ref === ref);
        return sum + (line ? line.elevationGain : 0);
      }
      return sum + 40;
    }, 0);
  }, [completedKeys, activeCity, burgosBusLines]);

  const totalTimeSeconds = useMemo(() => {
    return Object.values(completed).reduce((sum, item) => sum + item.timeSeconds, 0);
  }, [completed]);

  const activeCityMedals = useMemo(() => {
    let gold = 0;
    let silver = 0;
    let bronze = 0;
    uniqueLineRefs.forEach(ref => {
      const comp = completed[`${activeCity}_${ref}`];
      if (comp) {
        const line = burgosBusLines.find(l => l.ref === ref);
        if (line) {
          const paceMin = (comp.timeSeconds / 60) / line.distanceKm;
          if (paceMin < 4.5) gold++;
          else if (paceMin < 5.5) silver++;
          else bronze++;
        } else {
          const mockPaceMin = (comp.timeSeconds / 60) / 6.8;
          if (mockPaceMin < 4.5) gold++;
          else if (mockPaceMin < 5.5) silver++;
          else bronze++;
        }
      }
    });
    return { gold, silver, bronze };
  }, [completed, uniqueLineRefs, activeCity, burgosBusLines]);

  const goldCompletionPercentage = totalBurgosLinesCount > 0 
    ? (activeCityMedals.gold / totalBurgosLinesCount) * 100 
    : 0;

  const passportCities = useMemo(() => {
    const keys = Object.keys(completed);
    const completedCities = new Set(keys.map(k => k.split('_')[0]));
    completedCities.add(activeCity);
    
    return Array.from(completedCities).map(cityId => {
      const cityInfo = citiesList.find(c => c.id === cityId) || { name: cityId.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()), country: '' };
      
      let totalLines = 0;
      let completedLines = 0;
      if (cityId === activeCity) {
        totalLines = uniqueLineRefs.length;
        completedLines = uniqueLineRefs.filter(ref => !!completed[`${cityId}_${ref}`]).length;
      } else {
        totalLines = cityId === 'burgos' ? 12 : cityId === 'madrid' ? 30 : cityId === 'barcelona' ? 25 : 20;
        completedLines = keys.filter(k => k.startsWith(`${cityId}_`)).length;
      }
      
      const percent = totalLines > 0 ? Math.min(100, (completedLines / totalLines) * 100) : 0;
      
      return {
        id: cityId,
        name: cityInfo.name,
        country: cityInfo.country || 'España',
        completionPercent: percent,
        completedCount: completedLines,
        totalCount: totalLines
      };
    });
  }, [completed, activeCity, citiesList, uniqueLineRefs]);

  const currentRank = useMemo(() => {
    let activeRank = GLOBAL_RANKS[0];
    for (let i = GLOBAL_RANKS.length - 1; i >= 0; i--) {
      if (globalCompletionPercentage >= GLOBAL_RANKS[i].minPercentage) {
        activeRank = GLOBAL_RANKS[i];
        break;
      }
    }
    return activeRank;
  }, [globalCompletionPercentage]);

  const filteredLines = useMemo(() => {
    return aggregatedLines.filter((line) => {
      const nameMatch = line.name.toLowerCase().includes(searchQuery.toLowerCase());
      const refMatch = line.ref.toLowerCase().includes(searchQuery.toLowerCase());
      const stopsMatch = line.stops.some(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesSearch = nameMatch || refMatch || stopsMatch;

      const isCompleted = !!completed[`${activeCity}_${line.ref}`];
      const matchesStatus = 
        filterType === 'all' || 
        (filterType === 'completed' && isCompleted) || 
        (filterType === 'pending' && !isCompleted);

      let matchesDistance = true;
      if (distanceFilter === 'short') matchesDistance = line.distanceKm < 5.0;
      else if (distanceFilter === 'medium') matchesDistance = line.distanceKm >= 5.0 && line.distanceKm <= 10.0;
      else if (distanceFilter === 'long') matchesDistance = line.distanceKm > 10.0;

      return matchesSearch && matchesStatus && matchesDistance;
    });
  }, [searchQuery, filterType, distanceFilter, completed, aggregatedLines]);

  const visibleFeedActivities = useMemo(() => {
    return feedActivities.filter(act => {
      if (act.userId === userProfile.id || act.userName === userProfile.name) return true;
      if (act.userId && followedAthletes[act.userId]) return true;
      return false;
    });
  }, [feedActivities, userProfile.id, userProfile.name, followedAthletes]);

  const recommendedAthletes = useMemo(() => {
    return registeredAthletes
      .filter(ath => ath.id !== userProfile.id && !followedAthletes[ath.id])
      .slice(0, 4);
  }, [registeredAthletes, userProfile.id, followedAthletes]);

  const fetchFeedFromSupabase = async () => {
    if (!supabase) return;
    try {
      const { data: acts, error } = await supabase
        .from('activities')
        .select('*, profiles:user_id(name, avatar)')
        .order('created_at', { ascending: false });

      if (acts) {
        const { data: allComments } = await supabase.from('comments').select('*, profiles:user_id(name)');
        const { data: allLikes } = await supabase.from('likes').select('*');

        const formattedFeed: UserActivity[] = acts.map(act => {
          const actComments = allComments
            ? allComments
                .filter((c: any) => c.activity_id === act.id)
                .map((c: any) => ({
                  id: c.id,
                  userName: c.profiles?.name || 'Usuario',
                  text: c.text
                }))
            : [];

          const actLikes = allLikes ? allLikes.filter((l: any) => l.activity_id === act.id) : [];
          const likedByMe = actLikes.some((l: any) => l.user_id === userProfile.id);

          return {
            id: act.id,
            userId: act.user_id,
            userName: act.profiles?.name || 'Atleta',
            userAvatar: act.profiles?.avatar || '🏃‍♂️',
            lineId: act.line_id || undefined,
            lineRef: act.line_ref,
            lineName: act.line_name,
            distanceKm: act.distance_km,
            elevationGain: act.elevation_gain,
            timeSeconds: act.time_seconds,
            date: act.date,
            matchPercent: act.match_percent,
            type: act.type as 'running' | 'walking',
            likes: actLikes.length,
            likedByMe: likedByMe,
            comments: actComments,
            cityId: act.city_id
          };
        });

        setFeedActivities(formattedFeed);
        localStorage.setItem(STORAGE_FEED_KEY, JSON.stringify(formattedFeed));
      }
    } catch(e) {
      console.error('Error fetching feed from Supabase:', e);
    }
  };

  const saveNewActivityToDatabase = async (newActivity: UserActivity) => {
    if (supabase && userProfile.loggedIn) {
      const { error } = await supabase.from('activities').insert({
        id: newActivity.id,
        user_id: userProfile.id,
        line_id: newActivity.lineId || null,
        line_ref: newActivity.lineRef,
        line_name: newActivity.lineName,
        distance_km: newActivity.distanceKm,
        elevation_gain: newActivity.elevationGain,
        time_seconds: newActivity.timeSeconds,
        date: newActivity.date,
        match_percent: newActivity.matchPercent,
        type: newActivity.type,
        city_id: newActivity.cityId || 'burgos'
      });
      if (error) console.error('Error inserting activity in Supabase:', error);
      else {
        fetchFeedFromSupabase();
      }
    }
  };

  const handleToggleFollow = async (athId: string, athName: string) => {
    const isCurrentlyFollowing = !!followedAthletes[athId];
    setFollowedAthletes(prev => ({ ...prev, [athId]: !isCurrentlyFollowing }));
    addNotification('Social', isCurrentlyFollowing ? `Has dejado de seguir a ${athName}.` : `¡Ahora sigues a ${athName}!`, 'info');
    
    if (supabase && userProfile.loggedIn) {
      if (isCurrentlyFollowing) {
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', userProfile.id)
          .eq('following_id', athId);
      } else {
        await supabase
          .from('follows')
          .insert({
            follower_id: userProfile.id,
            following_id: athId
          });
      }
    }
  };

  const handleSendMessage = async (textStr: string) => {
    if (!textStr.trim()) return;
    const recipient = chatRecipient;
    if (!recipient) return;

    setChatInput('');

    if (supabase && userProfile.loggedIn) {
      const { error } = await supabase.from('messages').insert({
        sender_id: userProfile.id,
        receiver_id: recipient.id,
        text: textStr.trim()
      });
      if (error) {
        console.error('Error sending message:', error);
      }
    }
  };

  useEffect(() => {
    const client = supabase;
    if (client && userProfile.loggedIn) {
      fetchFeedFromSupabase();
      
      const fetchProfiles = async () => {
        const { data } = await client.from('profiles').select('*');
        if (data) {
          const mapped = data.map(p => ({
            id: p.id,
            name: p.name,
            avatar: p.avatar || '🏃‍♂️',
            email: p.email,
            bio: p.bio || 'Atleta de MetroMile.',
            rankName: 'Explorador',
            pct: 0,
            km: 0,
            privacy: 'public',
            completedRefs: [] as string[]
          }));
          setRegisteredAthletes(mapped);
        }
      };
      fetchProfiles();

      const loadFollows = async () => {
        const { data } = await client
          .from('follows')
          .select('following_id')
          .eq('follower_id', userProfile.id);
        if (data) {
          const followsObj: Record<string, boolean> = {};
          data.forEach((row: any) => {
            followsObj[row.following_id] = true;
          });
          setFollowedAthletes(followsObj);
        }
      };
      loadFollows();
    }
  }, [userProfile.loggedIn, userProfile.id]);

  useEffect(() => {
    const client = supabase;
    if (!client || !showChatModal || !chatRecipient) return;
    const recipient = chatRecipient;

    const fetchMessages = async () => {
      const { data } = await client
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${userProfile.id},receiver_id.eq.${recipient.id}),and(sender_id.eq.${recipient.id},receiver_id.eq.${userProfile.id})`)
        .order('created_at', { ascending: true });
      if (data) {
        setChatMessages(data.map((m: any) => ({
          sender: m.sender_id === userProfile.id ? 'me' : 'other',
          text: m.text,
          time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        })));
      }
    };
    fetchMessages();

    const channel = client
      .channel('chat_room')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload: any) => {
          const newMsg = payload.new;
          if (
            (newMsg.sender_id === userProfile.id && newMsg.receiver_id === recipient.id) ||
            (newMsg.sender_id === recipient.id && newMsg.receiver_id === userProfile.id)
          ) {
            setChatMessages(prev => [
              ...prev,
              {
                sender: newMsg.sender_id === userProfile.id ? 'me' : 'other',
                text: newMsg.text,
                time: new Date(newMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }
            ]);
          }
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [showChatModal, chatRecipient, userProfile.id]);

  // Render shareable sports card on canvas
  useEffect(() => {
    if (!selectedShareActivity) return;
    const canvas = document.getElementById('share-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Draw Background
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#090d16'); // Deep Night Blue
    grad.addColorStop(1, '#0f172a'); // Slate 900
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Draw Decorative Glowing Lines (Metro lines simulation)
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.2)'; // Metro Blue
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-50, 80);
    ctx.lineTo(canvas.width + 50, 150);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(16, 185, 129, 0.15)'; // Cyan/Green Line
    ctx.beginPath();
    ctx.moveTo(80, -50);
    ctx.lineTo(250, canvas.height + 50);
    ctx.stroke();

    // 3. Draw MetroMile Brand Header
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillStyle = '#2563eb'; // Metro Blue
    ctx.fillText('Metro', 30, 45);
    ctx.fillStyle = '#10b981'; // Neon Cyan
    ctx.fillText('Mile', 96, 45);

    ctx.font = '900 12px system-ui, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('URBAN RUNNING CLUB', 30, 65);

    // 4. Draw Athlete info
    ctx.font = '28px system-ui, sans-serif';
    ctx.fillText(selectedShareActivity.userAvatar || '🏃‍♂️', 30, 130);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(selectedShareActivity.userName, 75, 125);
    
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(userSettings.lang === 'es' ? 'Atleta Oficial' : 'Official Athlete', 75, 142);

    // 5. Draw Activity Details Box
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    if (ctx.roundRect) {
      ctx.roundRect(25, 170, canvas.width - 50, 95, 12);
    } else {
      ctx.rect(25, 170, canvas.width - 50, 95);
    }
    ctx.fill();
    ctx.stroke();

    // Line Name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(selectedShareActivity.lineName, 45, 205);

    ctx.fillStyle = selectedShareActivity.lineRef === 'LIBRE' ? '#60a5fa' : '#34d399';
    ctx.font = 'bold 11px system-ui, sans-serif';
    const completionText = selectedShareActivity.lineRef === 'LIBRE' 
      ? (userSettings.lang === 'es' ? 'ENTRENAMIENTO LIBRE' : 'FREE ACTIVITY')
      : (userSettings.lang === 'es' ? 'TRAYECTO 100% COMPLETADO' : 'ROUTE 100% COMPLETED');
    ctx.fillText(completionText, 45, 225);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`ID: ${selectedShareActivity.lineRef}`, 45, 245);

    // 6. Draw Stats Grid
    // Distance
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(userSettings.lang === 'es' ? 'DISTANCIA' : 'DISTANCE', 40, 310);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px system-ui, sans-serif';
    const distText = selectedShareActivity.distanceKm.toFixed(2);
    ctx.fillText(`${distText} km`, 40, 338);

    // Altimetry
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(userSettings.lang === 'es' ? 'DESNIVEL' : 'ELEVATION', 170, 310);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText(`+${selectedShareActivity.elevationGain || 0} m`, 170, 338);

    // Pace or duration
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(userSettings.lang === 'es' ? 'TIEMPO' : 'DURATION', 290, 310);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px system-ui, sans-serif';
    const durationMin = Math.round((selectedShareActivity.timeSeconds || 2700) / 60);
    ctx.fillText(`${durationMin} min`, 290, 338);

    // 7. Draw Stylized Route Track Line if coordinates are available
    if (selectedShareActivity.coords && selectedShareActivity.coords.length > 1) {
      // Find bounding box
      let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
      selectedShareActivity.coords.forEach(([lat, lon]) => {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
      });

      const latSpan = maxLat - minLat || 0.0001;
      const lonSpan = maxLon - minLon || 0.0001;

      // Draw inside a box: x from 40 to canvas.width - 40, y from 370 to 480
      const trackX = 40;
      const trackY = 370;
      const trackW = canvas.width - 80;
      const trackH = 100;

      ctx.strokeStyle = '#10b981'; // Neon green track
      ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(16, 185, 129, 0.4)';
      ctx.shadowBlur = 8;
      ctx.beginPath();

      selectedShareActivity.coords.forEach(([lat, lon], idx) => {
        // Map to box coordinates
        const x = trackX + ((lon - minLon) / lonSpan) * trackW;
        const y = trackY + trackH - ((lat - minLat) / latSpan) * trackH; // Invert y because lat increases upwards
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Reset shadow
      ctx.shadowBlur = 0;

      // Start/End points
      const startPt = selectedShareActivity.coords[0];
      const endPt = selectedShareActivity.coords[selectedShareActivity.coords.length - 1];
      const startX = trackX + ((startPt[1] - minLon) / lonSpan) * trackW;
      const startY = trackY + trackH - ((startPt[0] - minLat) / latSpan) * trackH;
      const endX = trackX + ((endPt[1] - minLon) / lonSpan) * trackW;
      const endY = trackY + trackH - ((endPt[0] - minLat) / latSpan) * trackH;

      ctx.fillStyle = '#3b82f6'; // Start blue dot
      ctx.beginPath(); ctx.arc(startX, startY, 5, 0, 2*Math.PI); ctx.fill();
      ctx.fillStyle = '#ef4444'; // End red dot
      ctx.beginPath(); ctx.arc(endX, endY, 5, 0, 2*Math.PI); ctx.fill();
    } else {
      // Draw a fallback clean grid layout line
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(30, 420);
      ctx.lineTo(canvas.width - 30, 420);
      ctx.stroke();
    }
  }, [selectedShareActivity, userSettings.lang]);

  // Synchronize offline activities queue when online
  useEffect(() => {
    const syncOfflineQueue = async () => {
      if (!navigator.onLine || offlineActivitiesQueue.length === 0 || !supabase || !userProfile.loggedIn) return;
      
      addNotification('MetroMile', `Sincronizando ${offlineActivitiesQueue.length} actividades guardadas offline...`, 'info');
      
      const successfulIds: string[] = [];
      for (const act of offlineActivitiesQueue) {
        try {
          const { error } = await supabase.from('activities').insert({
            id: act.id,
            user_id: userProfile.id,
            line_id: act.lineId || null,
            line_ref: act.lineRef,
            line_name: act.lineName,
            distance_km: act.distanceKm,
            elevation_gain: act.elevationGain,
            time_seconds: act.timeSeconds,
            date: act.date,
            match_percent: act.matchPercent,
            type: act.type,
            city_id: act.cityId || 'burgos'
          });
          if (!error) {
            successfulIds.push(act.id);
          }
        } catch(e) {
          console.error("Error syncing activity", e);
        }
      }

      if (successfulIds.length > 0) {
        const remaining = offlineActivitiesQueue.filter(a => !successfulIds.includes(a.id));
        setOfflineActivitiesQueue(remaining);
        localStorage.setItem('metromile-offline-activities', JSON.stringify(remaining));
        addNotification('MetroMile', `¡Sincronización offline completada con éxito!`, 'success');
        fetchFeedFromSupabase();
      }
    };

    window.addEventListener('online', syncOfflineQueue);
    syncOfflineQueue();

    return () => {
      window.removeEventListener('online', syncOfflineQueue);
    };
  }, [offlineActivitiesQueue, userProfile.loggedIn, userProfile.id]);

  const aiRecommendation = useMemo(() => {
    if (burgosBusLines.length === 0) {
      return { line: null, text: 'IA Coach: Cargando datos de transporte de la ciudad...', actionable: false };
    }

    const activeCityName = citiesList.find(c => c.id === activeCity)?.name || 'Activa';

    if (!userLocation) {
      const recommended = aggregatedLines.find(line => !completed[`${activeCity}_${line.ref}`]);
      if (recommended) {
        return {
          line: recommended,
          text: `IA Coach: Activa tu GPS o simula tu posición en el mapa para recomendarte la línea más cercana. Mientras tanto, te sugerimos completar la Línea ${recommended.ref} (${recommended.name.split(': ')[1] || recommended.name}).`,
          actionable: true
        };
      }
      return {
        line: null,
        text: `IA Coach: ¡Enhorabuena! Has completado el 100% de la red de ${activeCityName}. ¡Eres una auténtica leyenda del asfalto!`,
        actionable: false
      };
    }

    // Find all pending aggregated lines
    const pendingLines = aggregatedLines.filter(line => !completed[`${activeCity}_${line.ref}`]);
    if (pendingLines.length === 0) {
      return {
        line: null,
        text: `IA Coach: ¡Leyenda completada! Tienes el 100% de ${activeCityName}. Cambia de ciudad en la configuración para seguir explorando y acumulando porcentaje global.`,
        actionable: false
      };
    }

    // Find closest stop of a pending line to the user
    let bestLine: any = null;
    let minDistance = Infinity;
    let closestStopName = '';

    pendingLines.forEach(line => {
      line.subRoutes.forEach((route: LineRoute) => {
        route.stops.forEach(stop => {
          const dist = haversineDistance(userLocation[0], userLocation[1], stop.lat, stop.lon);
          if (dist < minDistance) {
            minDistance = dist;
            bestLine = line;
            closestStopName = stop.name;
          }
        });
      });
    });

    if (bestLine) {
      const distMeters = Math.round(minDistance * 1000);
      const text = `IA Coach: Estás a ${distMeters}m de la parada "${closestStopName}" de la Línea ${bestLine.ref}. ¡Está sin completar! Corre en cualquiera de sus dos sentidos de marcha para registrarla.`;
      return {
        line: bestLine,
        text: text,
        actionable: true
      };
    }

    return {
      line: null,
      text: "IA Coach: Sigue trotando para descubrir nuevas líneas de autobús.",
      actionable: false
    };
  }, [completed, aggregatedLines, userLocation, burgosBusLines]);

  const detectNearbyLines = () => {
    if (!navigator.geolocation) {
      alert("La geolocalización no está soportada.");
      simulatePlazaEspana();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        // Accept real location coordinates globally without restriction
        setUserLocation([lat, lon]);
        setIsSimulatedLocation(false);
        calculateNearbyStops(lat, lon);
      },
      (error) => {
        console.warn(error);
        simulatePlazaEspana();
      }
    );
  };

  const simulatePlazaEspana = () => {
    const lat = 42.3431;
    const lon = -3.7009;
    setUserLocation([lat, lon]);
    setIsSimulatedLocation(true);
    calculateNearbyStops(lat, lon);
  };

  const calculateNearbyStops = (myLat: number, myLon: number) => {
    const stopsWithDistance: Record<string, { stop: Stop; distanceKm: number; lineRefs: Set<string> }> = {};
    burgosBusLines.forEach(line => {
      line.stops.forEach(stop => {
        const distance = haversineDistance(myLat, myLon, stop.lat, stop.lon);
        if (distance <= 0.6) {
          if (!stopsWithDistance[stop.name]) {
            stopsWithDistance[stop.name] = {
              stop,
              distanceKm: distance,
              lineRefs: new Set([line.ref])
            };
          } else {
            stopsWithDistance[stop.name].lineRefs.add(line.ref);
            if (distance < stopsWithDistance[stop.name].distanceKm) {
              stopsWithDistance[stop.name].distanceKm = distance;
            }
          }
        }
      });
    });

    const sortedNearby = Object.values(stopsWithDistance)
      .map(item => ({
        stop: item.stop,
        distanceKm: item.distanceKm,
        lineRefs: Array.from(item.lineRefs).sort()
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    setNearbyStops(sortedNearby.slice(0, 5));
  };

  const handleLikeActivity = async (actId: string) => {
    let liked = false;
    const updated = feedActivities.map(act => {
      if (act.id === actId) {
        liked = !act.likedByMe;
        return { ...act, likedByMe: liked, likes: liked ? act.likes + 1 : act.likes - 1 };
      }
      return act;
    });
    saveFeed(updated);

    if (supabase && userProfile.loggedIn) {
      if (liked) {
        await supabase.from('likes').insert({
          user_id: userProfile.id,
          activity_id: actId
        });
      } else {
        await supabase.from('likes').delete().eq('user_id', userProfile.id).eq('activity_id', actId);
      }
    }
  };

  const handlePostComment = async (actId: string) => {
    const text = commentInputs[actId];
    if (!text || !text.trim()) return;

    const newCommentId = `comm-${Date.now()}`;
    const updated = feedActivities.map(act => {
      if (act.id === actId) {
        return {
          ...act,
          comments: [
            ...act.comments,
            { id: newCommentId, userName: userProfile.name, text: text.trim() }
          ]
        };
      }
      return act;
    });
    saveFeed(updated);
    setCommentInputs(prev => ({ ...prev, [actId]: '' }));

    if (supabase && userProfile.loggedIn) {
      await supabase.from('comments').insert({
        id: newCommentId,
        user_id: userProfile.id,
        activity_id: actId,
        text: text.trim()
      });
    }
  };

  const handleDeleteCompleted = (cityLineRefKey: string) => {
    const copy = { ...completed };
    delete copy[cityLineRefKey];
    saveProgress(copy);

    const ref = cityLineRefKey.split('_')[1];
    // Also clean up from social feed if it's the current user's activity
    const cleanFeed = feedActivities.filter(act => act.lineRef !== ref || act.userName !== userProfile.name);
    saveFeed(cleanFeed);

    addNotification('MetroMile', `Se ha eliminado la Línea ${ref} de tus actividades.`, 'info');
  };

  const triggerGpxDownload = (route: LineRoute) => {
    const gpxSegments = route.coords
      .map(([lat, lon, ele]) => `      <trkpt lat="${lat}" lon="${lon}"><ele>${ele}</ele></trkpt>`)
      .join('\n');

    // Clean name from special characters and escape HTML/XML characters
    const cleanGpxName = route.name
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/[→←]/g, '-');

    const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="BusRun">
  <trk>
    <name>${cleanGpxName}</name>
    <trkseg>
${gpxSegments}
    </trkseg>
  </trk>
</gpx>`;

    const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Clean filename to be fully compatible with watches/phone systems (FAT32 compatible)
    const cleanFilename = route.name
      .replace(/[→←]/g, '-')
      .replace(/[^a-zA-Z0-9_\-\s]/g, '')
      .trim()
      .replace(/\s+/g, '_');
      
    link.download = `${cleanFilename}.gpx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const decodePolyline = (encoded: string): [number, number][] => {
    const points: [number, number][] = [];
    let index = 0, len = encoded.length;
    let lat = 0, lng = 0;

    while (index < len) {
      let b, shift = 0, result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lng += dlng;

      points.push([lat / 1e5, lng / 1e5]);
    }
    return points;
  };

  const handleSyncStrava = async () => {
    if (!stravaConfig.connected) {
      alert("Por favor, vincula tu cuenta de Strava primero en la sección de configuración.");
      return;
    }

    addNotification('Strava', 'Buscando actividades nuevas en Strava...', 'info');

    // MOCK SYNC FLOW
    if (stravaConfig.accessToken === 'mock-token') {
      setTimeout(() => {
        const uncompletedLine = aggregatedLines.find(line => !completed[`${activeCity}_${line.ref}`]) || aggregatedLines[0];
        if (!uncompletedLine) {
          addNotification('Strava', 'Sincronización completa. No hay entrenamientos nuevos para importar.', 'info');
          return;
        }

        const simulatedAccuracy = parseFloat((87 + Math.random() * 11).toFixed(1));
        const timeEst = uncompletedLine.subRoutes[0]?.estRunningSeconds || 1200;

        const newCompleted = {
          ...completed,
          [`${activeCity}_${uncompletedLine.ref}`]: {
            date: new Date().toLocaleDateString(),
            timeSeconds: timeEst,
            type: 'running' as const,
            matchPercent: simulatedAccuracy
          }
        };
        saveProgress(newCompleted);

        const coords = uncompletedLine.subRoutes[0]?.coords.map(([lat, lon]) => [lat, lon] as [number, number]) || [];

        const newAct: UserActivity = {
          id: `strava-act-${Date.now()}`,
          userName: userProfile.name,
          userAvatar: userProfile.avatar,
          lineId: uncompletedLine.id,
          lineRef: uncompletedLine.ref,
          lineName: uncompletedLine.name,
          distanceKm: uncompletedLine.distanceKm,
          elevationGain: uncompletedLine.subRoutes[0]?.elevationGain || 35,
          timeSeconds: timeEst,
          date: 'Sincronizado vía Strava',
          matchPercent: simulatedAccuracy,
          type: 'running',
          likes: 0,
          comments: [],
          cityId: activeCity,
          coords: coords
        };
        saveFeed([newAct, ...feedActivities]);
        addNotification('Strava', `¡Nueva carrera 'Morning Run' importada de Strava! Has completado la Línea ${uncompletedLine.ref} (${simulatedAccuracy}% precisión).`, 'success');
      }, 2000);
      return;
    }

    // REAL SYNC FLOW
    try {
      const token = await refreshStravaToken(stravaConfig);
      if (!token) {
        addNotification('Strava', 'Error al refrescar token de Strava. Por favor, vuelve a vincular tu cuenta.', 'info');
        return;
      }

      const response = await fetch(getStravaProxyUrl('api/v3/athlete/activities', { per_page: 10 }), {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('No se pudieron obtener las actividades de Strava.');
      }

      const activities = await response.json();
      const runs = activities.filter((act: any) => act.type === 'Run' || act.sport_type === 'Run');

      if (runs.length === 0) {
        addNotification('Strava', 'Sincronizado. No tienes carreras recientes registradas en tu cuenta de Strava.', 'info');
        return;
      }

      let importedIds: string[] = [];
      try {
        const saved = localStorage.getItem('busrun-imported-strava-ids');
        if (saved) importedIds = JSON.parse(saved);
      } catch(e){}

      let newImportsCount = 0;
      let updatedCompleted = { ...completed };
      const newActs: UserActivity[] = [];

      const fullyLoadedLines = await ensureRouteDetailsLoaded(loadedBusLines);

      for (const run of runs) {
        const runId = String(run.id);
        if (importedIds.includes(runId)) continue;

        importedIds.push(runId);
        newImportsCount++;

        let runCoords: [number, number][] = [];
        if (run.map && run.map.summary_polyline) {
          try {
            runCoords = decodePolyline(run.map.summary_polyline);
          } catch(e) {
            console.error('Error decoding polyline', e);
          }
        }

        let bestMatchLine: any = null;
        let bestMatchScore = 0;

        if (runCoords.length > 5) {
          for (const line of fullyLoadedLines) {
            let visitedStopsCount = 0;
            for (const stop of line.stops) {
              const isClose = runCoords.some(([glat, glon]) => {
                return haversineDistance(stop.lat, stop.lon, glat, glon) <= 0.12;
              });
              if (isClose) {
                visitedStopsCount++;
              }
            }

            const pct = parseFloat(((visitedStopsCount / line.stops.length) * 100).toFixed(1));
            if (pct > bestMatchScore) {
              bestMatchScore = pct;
              bestMatchLine = line;
            }
          }
        }

        const distanceKm = run.distance ? parseFloat((run.distance / 1000).toFixed(2)) : parseFloat((runCoords.length * 0.05).toFixed(2));
        const duration = run.moving_time || run.elapsed_time || 1500;
        const elevation = run.total_elevation_gain || 0;

        if (bestMatchScore >= 70 && bestMatchLine) {
          updatedCompleted[`${activeCity}_${bestMatchLine.ref}`] = {
            date: new Date(run.start_date || Date.now()).toLocaleDateString(),
            timeSeconds: duration,
            type: 'running' as const,
            matchPercent: bestMatchScore
          };

          newActs.push({
            id: `strava-${runId}`,
            userName: userProfile.name,
            userAvatar: userProfile.avatar,
            lineId: bestMatchLine.id,
            lineRef: bestMatchLine.ref,
            lineName: bestMatchLine.name,
            distanceKm: distanceKm,
            elevationGain: elevation,
            timeSeconds: duration,
            date: 'Sincronizado vía Strava',
            matchPercent: bestMatchScore,
            type: 'running',
            likes: 0,
            comments: [],
            cityId: activeCity,
            coords: runCoords
          });
        } else {
          // Free Run
          newActs.push({
            id: `strava-${runId}`,
            userName: userProfile.name,
            userAvatar: userProfile.avatar,
            lineId: 'free-run',
            lineRef: 'FREE',
            lineName: run.name || 'Carrera Libre Strava',
            distanceKm: distanceKm,
            elevationGain: elevation,
            timeSeconds: duration,
            date: 'Sincronizado vía Strava',
            matchPercent: 0,
            type: 'running',
            likes: 0,
            comments: [],
            cityId: activeCity,
            coords: runCoords
          });
        }
      }

      if (newImportsCount > 0) {
        localStorage.setItem('busrun-imported-strava-ids', JSON.stringify(importedIds));
        saveProgress(updatedCompleted);
        saveFeed([...newActs, ...feedActivities]);
        newActs.forEach(act => saveNewActivityToDatabase(act));
        addNotification('Strava', `¡Sincronización con éxito! Se importaron ${newImportsCount} carreras nuevas desde tu Strava.`, 'success');
      } else {
        addNotification('Strava', 'Sincronizado. No hay nuevas actividades para importar en Strava.', 'info');
      }

    } catch (err: any) {
      console.error(err);
      addNotification('Strava', 'Error al sincronizar con Strava: ' + err.message, 'info');
    }
  };

  const handleGpxUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      verifyUploadedGpx(text);
    };
    reader.readAsText(file);
  };

  const verifyUploadedGpx = async (gpxText: string) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, 'text/xml');
    const trkpts = xmlDoc.getElementsByTagName('trkpt');
    
    if (trkpts.length < 5) {
      setGpxResult({
        success: false,
        msg: 'El archivo GPX no contiene suficientes coordenadas de track (<trkpt>).'
      });
      return;
    }

    const gpxCoords: [number, number][] = [];
    for (let i = 0; i < trkpts.length; i++) {
      const lat = parseFloat(trkpts[i].getAttribute('lat') || '0');
      const lon = parseFloat(trkpts[i].getAttribute('lon') || '0');
      if (lat !== 0 && lon !== 0) {
        gpxCoords.push([lat, lon]);
      }
    }

    // Automatically match against all routes in active city
    let bestMatchLine: LineRoute | null = null;
    let bestMatchPercent = 0;
    let bestVisitedStops = 0;

    const fullyLoadedLines = await ensureRouteDetailsLoaded(loadedBusLines);

    for (const line of fullyLoadedLines) {
      let visitedStopsCount = 0;
      for (const stop of line.stops) {
        const isClose = gpxCoords.some(([glat, glon]) => {
          return haversineDistance(stop.lat, stop.lon, glat, glon) <= 0.12;
        });
        if (isClose) {
          visitedStopsCount++;
        }
      }

      const pct = parseFloat(((visitedStopsCount / line.stops.length) * 100).toFixed(1));
      if (pct > bestMatchPercent) {
        bestMatchPercent = pct;
        bestMatchLine = line;
        bestVisitedStops = visitedStopsCount;
      }
    }

    const passed = bestMatchPercent >= 70.0;
    const elevationGain = bestMatchLine ? (bestMatchLine as LineRoute).elevationGain : 35;
    const distanceKm = bestMatchLine ? (bestMatchLine as LineRoute).distanceKm : parseFloat((gpxCoords.length * 0.05).toFixed(2));
    const timeSeconds = bestMatchLine ? (bestMatchLine as LineRoute).estRunningSeconds : 1500;

    if (passed && bestMatchLine) {
      const detectedLine = bestMatchLine as LineRoute;
      const newCompleted = {
        ...completed,
        [`${activeCity}_${detectedLine.ref}`]: {
          date: new Date().toLocaleDateString(),
          timeSeconds: timeSeconds,
          type: uploadActivityType,
          matchPercent: bestMatchPercent
        }
      };
      saveProgress(newCompleted);

      const newActivity: UserActivity = {
        id: `user-act-${Date.now()}`,
        userName: userProfile.name,
        userAvatar: userProfile.avatar,
        lineId: detectedLine.id,
        lineRef: detectedLine.ref,
        lineName: detectedLine.name,
        distanceKm: distanceKm,
        elevationGain: elevationGain,
        timeSeconds: timeSeconds,
        date: 'Hoy a las ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        matchPercent: bestMatchPercent,
        type: uploadActivityType,
        likes: 0,
        comments: [],
        cityId: activeCity,
        coords: gpxCoords
      };
      
      const newFeed = [newActivity, ...feedActivities];
      saveFeed(newFeed);
      saveNewActivityToDatabase(newActivity);

      setGpxResult({
        success: true,
        msg: `¡Verificación con éxito! Detectada la Línea ${detectedLine.ref} automáticamente. Has visitado ${bestVisitedStops} de las ${detectedLine.stops.length} paradas (${bestMatchPercent}% coincidencia). ¡Trayecto guardado!`,
        matchPercent: bestMatchPercent
      });
      addNotification('MetroMile', `¡Línea ${detectedLine.ref} detectada y completada!`, 'success');
    } else {
      // Post as a Free Activity (Entrenamiento Libre) since it doesn't match any bus line
      const newActivity: UserActivity = {
        id: `free-act-${Date.now()}`,
        userName: userProfile.name,
        userAvatar: userProfile.avatar,
        lineId: 'free',
        lineRef: 'LIBRE',
        lineName: 'Entrenamiento Libre',
        distanceKm: distanceKm,
        elevationGain: elevationGain,
        timeSeconds: timeSeconds,
        date: 'Hoy a las ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        matchPercent: bestMatchPercent,
        type: uploadActivityType,
        likes: 0,
        comments: [],
        cityId: activeCity,
        coords: gpxCoords
      };

      const newFeed = [newActivity, ...feedActivities];
      saveFeed(newFeed);
      saveNewActivityToDatabase(newActivity);

      setGpxResult({
        success: true,
        msg: `Actividad subida con éxito como 'Entrenamiento Libre'. No coincide con ninguna línea de autobús registrada (Coincidencia máxima: ${bestMatchPercent}%).`,
        matchPercent: bestMatchPercent
      });
      addNotification('MetroMile', `¡Entrenamiento Libre subido con éxito!`, 'info');
    }
  };

  const generateSimulatedGpxRun = () => {
    const targetLine = selectedLine || burgosBusLines[0];
    if (!targetLine || targetLine.coords.length === 0) return;
    
    const segments: string[] = [];
    const step = Math.max(1, Math.floor(targetLine.coords.length / 50));
    
    for (let i = 0; i < targetLine.coords.length; i += step) {
      const [lat, lon, ele] = targetLine.coords[i];
      const latOffset = (Math.random() - 0.5) * 0.00025;
      const lonOffset = (Math.random() - 0.5) * 0.00035;
      segments.push(`      <trkpt lat="${(lat + latOffset).toFixed(6)}" lon="${(lon + lonOffset).toFixed(6)}"><ele>${ele}</ele></trkpt>`);
    }

    const firstCoord = targetLine.coords[0];
    const lastCoord = targetLine.coords[targetLine.coords.length - 1];
    segments.unshift(`      <trkpt lat="${firstCoord[0].toFixed(6)}" lon="${firstCoord[1].toFixed(6)}"><ele>${firstCoord[2]}</ele></trkpt>`);
    segments.push(`      <trkpt lat="${lastCoord[0].toFixed(6)}" lon="${lastCoord[1].toFixed(6)}"><ele>${lastCoord[2]}</ele></trkpt>`);

    const gpxString = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="BusRun Simulated Tracker">
  <trk>
    <name>Simulated Run: ${targetLine.name}</name>
    <trkseg>
${segments.join('\n')}
    </trkseg>
  </trk>
</gpx>`;

    verifyUploadedGpx(gpxString);
  };

  // mockAthletesList is defined globally
  const selectedAthlete = activeAthletesList.find(a => a.id === selectedAthleteId);

  if (!onboardingCompleted) {
    return (
      <div className="onboarding-gateway-container" style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        color: 'white',
        padding: '24px',
        fontFamily: "'Outfit', 'Inter', sans-serif"
      }}>
        {/* Toast Notifications */}
        <div className="toasts-container" style={{ zIndex: 99999 }}>
          {notifications.map(n => (
            <div key={n.id} className={`toast-card ${n.type}`}>
              <span className="toast-brand">🔔 {n.brand}</span>
              <p>{n.msg}</p>
            </div>
          ))}
        </div>

        <div className="onboarding-card" style={{
          background: 'rgba(30, 41, 59, 0.7)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: '24px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '40px 32px',
          maxWidth: '480px',
          width: '100%',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
          textAlign: 'center',
          animation: 'modalScale 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '24px' }}>
            <span style={{ fontSize: '2.4rem', background: 'linear-gradient(135deg, #ff7e40, #fc5200)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>⚡</span>
            <h1 style={{ fontSize: '2.2rem', fontWeight: '900', letterSpacing: '-0.02em', margin: 0 }}>MetroMile</h1>
          </div>

          {!userProfile.loggedIn ? (
            /* STEP 1: LOGIN */
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: '800', marginBottom: '12px' }}>Paso 1: Iniciar Sesión 👤</h2>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: '1.6', marginBottom: '24px' }}>
                Para comenzar a registrar tus carreras y competir en el ranking de tu ciudad, inicia sesión de forma segura.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', width: '100%' }}>
                {/* Official Google Button */}
                <div id="google-signin-btn-real" style={{ width: '100%', display: 'flex', justifyContent: 'center' }}></div>
              </div>
            </div>
          ) : !stravaConfig.connected && localStorage.getItem('busrun-strava-skipped') !== 'true' ? (
            /* STEP 2: LINK STRAVA */
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: '800', marginBottom: '12px' }}>Paso 2: Conectar Strava 🧡</h2>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: '1.6', marginBottom: '20px' }}>
                MetroMile sincroniza tus recorridos de Strava. Conecta tu cuenta de Strava para empezar a registrar tus actividades reales.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', marginBottom: '16px' }}>
                <button
                  onClick={handleConnectStrava}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #fc5200, #ff7e40)',
                    color: 'white',
                    border: 'none',
                    padding: '12px',
                    borderRadius: '10px',
                    fontWeight: 'bold',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(252, 82, 0, 0.25)'
                  }}
                >
                  🚀 Vincular Strava Real
                </button>

                <button
                  onClick={() => {
                    localStorage.setItem('busrun-strava-skipped', 'true');
                    // Force refresh by setting state
                    setStravaConfig({ ...stravaConfig });
                  }}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: '1px solid #475569',
                    color: '#94a3b8',
                    padding: '8px',
                    borderRadius: '10px',
                    fontWeight: '500',
                    fontSize: '0.75rem',
                    cursor: 'pointer'
                  }}
                >
                  Omitir por ahora
                </button>
                
                <button
                  onClick={handleLogout}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#ef4444',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    marginTop: '8px',
                    textDecoration: 'underline'
                  }}
                >
                  ← Cerrar sesión
                </button>
              </div>
            </div>
          ) : (
            /* STEP 3: TUTORIAL */
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--brand-orange)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Paso 3: Tutorial de Bienvenida ({tutorialStep || 1}/5)
              </span>

              {(!tutorialStep || tutorialStep === 1) && (
                <div>
                  <div style={{ fontSize: '3.5rem', margin: '20px 0' }}>⚡</div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '800', marginBottom: '8px' }}>¡Bienvenido/a a MetroMile!</h3>
                  <p style={{ margin: '12px 0 24px 0', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.6' }}>
                    MetroMile es la red social deportiva de corredores urbanos. Tu misión es <strong>completar las líneas de transporte urbano</strong> corriendo o caminando por su trazado de paradas.
                  </p>
                </div>
              )}

              {tutorialStep === 2 && (
                <div>
                  <div style={{ fontSize: '3.5rem', margin: '20px 0' }}>🏆</div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '800', marginBottom: '8px' }}>Progresión y Rango Global</h3>
                  <p style={{ margin: '12px 0 24px 0', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.6' }}>
                    Cada línea completada suma porcentaje a tu progresión. Pasa de ser un simple <strong>Transeúnte (0%)</strong> hasta el legendario <strong>Leyenda del Tránsito (100%)</strong>.
                  </p>
                </div>
              )}

              {tutorialStep === 3 && (
                <div>
                  <div style={{ fontSize: '3.5rem', margin: '20px 0' }}>🧡</div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '800', marginBottom: '8px' }}>Sincronizar con Strava</h3>
                  <p style={{ margin: '12px 0 24px 0', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.6' }}>
                    Sincroniza tus actividades desde tu perfil o panel de control. Cualquier carrera que grabes con tu reloj deportivo o móvil se validará automáticamente contra la base de datos de paradas de autobús.
                  </p>
                </div>
              )}

              {tutorialStep === 4 && (
                <div>
                  <div style={{ fontSize: '3.5rem', margin: '20px 0' }}>📡</div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '800', marginBottom: '8px' }}>GPS en Vivo y Simulador</h3>
                  <p style={{ margin: '12px 0 24px 0', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.6' }}>
                    ¿No tienes reloj? ¡Graba tu actividad en tiempo real con el GPS del móvil en el feed, o usa el <strong>simulador en vivo</strong> para probar cómo funciona desde casa!
                  </p>
                </div>
              )}

              {tutorialStep === 5 && (
                <div>
                  <div style={{ fontSize: '3.5rem', margin: '20px 0' }}>🗺️</div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '800', marginBottom: '8px' }}>Mapa e Hitos Unificados</h3>
                  <p style={{ margin: '12px 0 24px 0', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.6' }}>
                    En la pestaña Mapa puedes seleccionar cualquier línea, cambiar de sentido y ver la checklist de paradas completadas en tiempo real. ¡Disfruta de la experiencia urbana!
                  </p>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '20px' }}>
                {(tutorialStep || 1) > 1 ? (
                  <button 
                    onClick={() => setTutorialStep(s => s ? s - 1 : 1)}
                    style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #475569', background: 'transparent', color: '#cbd5e1', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    Atrás
                  </button>
                ) : (
                  <button 
                    onClick={() => {
                      localStorage.setItem('busrun-tutorial-seen', 'true');
                      localStorage.setItem('busrun-onboarding-completed', 'true');
                      setOnboardingCompleted(true);
                      addNotification('Social', '¡Registro completo! Todo listo para empezar.', 'success');
                    }}
                    style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: 'transparent', color: '#94a3b8', fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    Omitir Tutorial
                  </button>
                )}

                {(tutorialStep || 1) < 5 ? (
                  <button 
                    onClick={() => setTutorialStep(s => s ? s + 1 : 5)}
                    style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: 'var(--brand-orange)', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    Siguiente
                  </button>
                ) : (
                  <button 
                    onClick={() => {
                      localStorage.setItem('busrun-tutorial-seen', 'true');
                      localStorage.setItem('busrun-onboarding-completed', 'true');
                      setOnboardingCompleted(true);
                      addNotification('Social', '¡Registro y tutorial completado! Bienvenido a MetroMile.', 'success');
                    }}
                    style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: 'var(--accent-green)', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    ¡Comenzar! 🏁
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const isCityTransportSupported = useMemo(() => {
    const city = citiesList.find(c => c.id === activeCity);
    return city ? city.transports.includes(activeTransport) : false;
  }, [citiesList, activeCity, activeTransport]);

  return (
    <div className="app-shell">
      {/* Toast Notifications */}
      <div className="toasts-container">
        {notifications.map(n => (
          <div key={n.id} className={`toast-card ${n.type}`}>
            <span className="toast-brand">🔔 {n.brand}</span>
            <p>{n.msg}</p>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="topbar" style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--brand-dark)' }}>
        <div className="header-content" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '16px' }}>
          <div className="logo-flex" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setActiveTab('feed')}>
            <span className="logo-icon" style={{ fontSize: '1.8rem', background: 'linear-gradient(135deg, #ff7e40, var(--brand-orange))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>⚡</span>
            <h1 style={{ fontSize: '1.6rem', fontWeight: '900', letterSpacing: '-0.02em', margin: 0, color: 'white' }}>MetroMile</h1>
          </div>
          
          <div className="right-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Private Chat Messenger Trigger */}
            <button 
              onClick={() => setShowChatModal(true)}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '1.4rem',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Mensajes Privados"
            >
              💬
            </button>
 
            {/* Notification Bell */}
            <div className="notifications-bell-container" style={{ position: 'relative' }}>
              <button 
                className="btn-bell"
                onClick={() => setShowNotificationsDropdown(!showNotificationsDropdown)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.4rem',
                  cursor: 'pointer',
                  position: 'relative',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                🔔
                {unreadNotifications.filter(n => !n.read).length > 0 && (
                  <span 
                    className="bell-badge"
                    style={{
                      position: 'absolute',
                      top: '2px',
                      right: '2px',
                      background: 'var(--brand-orange)',
                      color: 'white',
                      fontSize: '0.65rem',
                      fontWeight: 'bold',
                      borderRadius: '50%',
                      width: '18px',
                      height: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                    }}
                  >
                    {unreadNotifications.filter(n => !n.read).length}
                  </span>
                )}
              </button>
              
              {showNotificationsDropdown && (
                <div 
                  className="notifications-dropdown-menu card-glow"
                  style={{
                    position: 'absolute',
                    top: '40px',
                    right: '0',
                    width: 'calc(100vw - 40px)',
                    maxWidth: '320px',
                    background: 'var(--brand-dark)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '16px',
                    padding: '16px',
                    zIndex: 99999,
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>
                    <h4 style={{ margin: 0, color: 'white', fontSize: '0.9rem' }}>Notificaciones</h4>
                    <button 
                      onClick={() => {
                        const readAll = unreadNotifications.map(n => ({ ...n, read: true }));
                        saveNotifications(readAll);
                      }}
                      style={{ background: 'transparent', border: 'none', color: 'var(--brand-orange)', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      Marcar todo leído
                    </button>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
                    {unreadNotifications.length > 0 ? (
                      unreadNotifications.map(n => (
                        <div 
                          key={n.id} 
                          style={{
                            padding: '8px',
                            borderRadius: '8px',
                            background: n.read ? 'transparent' : 'rgba(252, 82, 0, 0.12)',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            fontSize: '0.8rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                            textAlign: 'left'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong style={{ color: 'white' }}>{n.title}</strong>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{n.time}</span>
                          </div>
                          <span style={{ color: '#cbd5e1' }}>{n.body}</span>
                        </div>
                      ))
                    ) : (
                      <p style={{ margin: 0, padding: '16px 0', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>No tienes notificaciones</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
 
        {/* Navigation Tabs (Simplified to 4 options since lines tab is unified inside map) */}
        <nav className="header-nav" style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button 
            className={`nav-tab-btn ${activeTab === 'feed' ? 'active' : ''}`}
            onClick={() => setActiveTab('feed')}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <Icons.Feed /> Feed Social
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'map' ? 'active' : ''}`}
            onClick={() => setActiveTab('map')}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <Icons.Map /> Mapa y Líneas
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <Icons.Search /> Atletas
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <Icons.Profile /> Mi Perfil
          </button>
        </nav>
      </header>

      {/* PWA Floating Installation Banner */}
      {showPwaBanner && (
        <div 
          className="pwa-install-banner card-glow"
          style={{
            margin: '12px 20px 0 20px',
            background: 'linear-gradient(135deg, #ff7e40, var(--brand-orange))',
            color: 'white',
            borderRadius: '16px',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            boxShadow: '0 8px 30px rgba(252, 82, 0, 0.3)',
            animation: 'slideIn 0.5s ease-out',
            zIndex: 999
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left' }}>
            <span style={{ fontSize: '2rem' }}>📱</span>
            <div>
              <strong style={{ display: 'block', fontSize: '0.95rem' }}>Descargar MetroMile App</strong>
              <span style={{ fontSize: '0.8rem', opacity: 0.9, display: 'block', marginTop: '2px' }}>
                {isIos 
                  ? 'Instala la app en tu iPhone para correr a pantalla completa con GPS y mapas.'
                  : 'Instala la aplicación en tu móvil para correr a pantalla completa y sin barra del navegador.'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={handleInstallPwa}
              style={{
                background: 'white',
                color: 'var(--brand-orange)',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                fontWeight: 'bold',
                fontSize: '0.8rem',
                cursor: 'pointer',
                boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
                whiteSpace: 'nowrap'
              }}
            >
              Instalar App
            </button>
            <button
              onClick={() => {
                setShowPwaBanner(false);
                localStorage.setItem('busrun-pwa-dismissed', 'true');
              }}
              style={{
                background: 'transparent',
                color: 'white',
                border: 'none',
                fontSize: '1.2rem',
                cursor: 'pointer',
                opacity: 0.8,
                padding: '4px 8px'
              }}
              title="Omitir"
            >
              ✕
            </button>
          </div>
        </div>
      )}





      {/* Private Chat Messenger Popup */}
      {showChatModal && (
        <div className="login-modal-overlay">
          <div className="chat-modal-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0 }}>Mensajes con {chatRecipient?.name || 'Marta Corredora'}</h3>
              <span style={{ fontSize: '0.8rem', color: '#10b981' }}>● En línea</span>
            </div>
            <div className="chat-messages-container">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`chat-message-bubble ${msg.sender === 'me' ? 'outgoing' : 'incoming'}`}>
                  <p style={{ margin: 0 }}>{msg.text}</p>
                  <span style={{ fontSize: '0.6rem', color: '#94a3b8', display: 'block', textAlign: 'right', marginTop: '2px' }}>{msg.time}</span>
                </div>
              ))}
            </div>
            <div className="chat-input-row">
              <input 
                type="text" 
                placeholder="Escribe tu mensaje..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && chatInput.trim()) {
                    handleSendMessage(chatInput);
                  }
                }}
              />
              <button onClick={() => handleSendMessage(chatInput)}>Enviar</button>
            </div>
            <button className="btn-close-modal" onClick={() => { setShowChatModal(false); setChatRecipient(null); }} style={{ background: 'transparent', border: '1px solid #777', color: '#ccc', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}>Cerrar Chat</button>
          </div>
        </div>
      )}

      {!isCityTransportSupported ? (
        <section className="preview-city-section card-glow">
          <div className="preview-icon">🚧</div>
          <h2>Conectando Red de Transportes...</h2>
          <p>
            Estamos cosiendo las rutas reales de <strong>{activeCity.toUpperCase()} ({activeTransport.toUpperCase()})</strong> desde OpenStreetMap y resolviendo altitudes topográficas.
          </p>
          <div className="city-mock-preview">
            <div className="mock-badge">VISTA PREVIA</div>
            <h3>Línea 6 Circular - Metro de Madrid</h3>
            <p>Distancia estimada: 23.47 km | Altitud máxima: 712m | Desnivel +: +142m | 28 Estaciones</p>
            <button className="btn-gpx" style={{ width: 'auto', alignSelf: 'center', marginTop: '16px' }} onClick={() => { setActiveCity('burgos'); setActiveTransport('bus'); }}>
              Volver a Burgos Activo
            </button>
          </div>
        </section>
      ) : (
        <main className="app-main-content">
          {/* Social Feed Tab */}
          {activeTab === 'feed' && (
            <div className="feed-grid">
              <aside className="feed-sidebar">
                {/* Profile overview card */}
                <div className="sidebar-card profile-preview-card">
                  <div className="avatar-preview">
                    {renderAvatar(userProfile.avatar, 'avatar-preview', triggerAvatarChange, 'Haz clic para cambiar tu foto de perfil')}
                  </div>
                  <div className="info-preview">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      {userProfile.name}
                      {prestigeCount > 0 && <span style={{ color: '#f59e0b', fontSize: '0.7rem' }}>★{prestigeCount}</span>}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(37, 99, 235, 0.15)', padding: '2px 8px', borderRadius: '12px', width: 'fit-content', marginTop: '4px' }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: '#60a5fa' }}>NIVEL {currentLevel}</span>
                    </div>
                  </div>
                  
                  {/* XP progress bar */}
                  <div style={{ padding: '0 16px', marginTop: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#cbd5e1', marginBottom: '2px' }}>
                      <span>XP Acumulada</span>
                      <span>{xp} XP</span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--brand-dark-soft)', borderRadius: '10px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${levelProgressPct}%`, background: 'linear-gradient(90deg, #3b82f6, #60a5fa)', borderRadius: '10px' }}></div>
                    </div>
                    <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px', textAlign: 'right' }}>
                      {userSettings.lang === 'es' ? `Faltan ${1000 - (xp % 1000)} XP para Nivel ${currentLevel + 1}` : `${1000 - (xp % 1000)} XP to Level ${currentLevel + 1}`}
                    </span>
                  </div>
                  
                  {/* Rank progression display */}
                  <div className="rank-progress-indicator" style={{ borderTop: '1px solid var(--border-color)', marginTop: '12px', paddingTop: '12px' }}>
                    <span className="progress-label">Rango: {currentRank.title} {currentRank.icon}</span>
                    {globalCompletionPercentage < 100 ? (
                      <span className="next-rank-lbl">
                        Siguiente rango: <strong>{GLOBAL_RANKS.find(r => r.minPercentage > globalCompletionPercentage)?.name}</strong> 
                        (requiere {GLOBAL_RANKS.find(r => r.minPercentage > globalCompletionPercentage)!.minPercentage}%)
                      </span>
                    ) : (
                      <span className="next-rank-lbl text-gold">¡Héroe del Tránsito: 100% completado! ⚔️</span>
                    )}
                  </div>

                  <div className="stats-mini-grid">
                    <div>
                      <span className="num">{burgosCompletionPercentage.toFixed(0)}%</span>
                      <span className="lbl">{citiesList.find(c => c.id === activeCity)?.name || 'Activa'}</span>
                    </div>
                    <div>
                      <span className="num">{burgosCompletedUniqueCount}</span>
                      <span className="lbl">Líneas</span>
                    </div>
                    <div>
                      <span className="num">{totalKmCompleted.toFixed(0)}k</span>
                      <span className="lbl">Total Km</span>
                    </div>
                  </div>
                </div>

                {/* Strava sync card */}
                <div className="sidebar-card watch-sync-card card-glow" style={{ borderLeft: '3px solid #fc5200' }}>
                  <div className="coach-header">
                    <span className="watch-badge" style={{ background: '#fc5200' }}>STRAVA SYNC</span>
                    <h4>Sincronizar Actividades</h4>
                  </div>
                  <p className="watch-desc-text">
                    {stravaConfig.connected 
                      ? `Conectado como @${stravaConfig.athleteName}. Sincroniza tus rodajes de Strava de forma instantánea.` 
                      : 'Vincula tu cuenta de Strava en Ajustes para importar tus entrenamientos automáticamente.'}
                  </p>
                  <button 
                    className="btn-force-sync" 
                    onClick={handleSyncStrava}
                    style={{ background: stravaConfig.connected ? 'var(--brand-orange)' : '#444' }}
                  >
                    🔄 Sincronizar con Strava
                  </button>
                </div>

                {/* AI coach recommendation */}
                <div className="sidebar-card coach-recommendation-card">
                  <div className="coach-header">
                    <span className="coach-badge">IA COACH</span>
                    <h4>Entrenamiento de Hoy</h4>
                  </div>
                  <p>{aiRecommendation.text}</p>
                  {aiRecommendation.actionable && aiRecommendation.line && (
                    <button 
                      className="btn-coach-action"
                      onClick={() => {
                        setSelectedLineId(aiRecommendation.line.id || aiRecommendation.line.ref);
                        setActiveTab('map');
                      }}
                    >
                      Ver la Línea {aiRecommendation.line.ref} en el Mapa ➔
                    </button>
                  )}
                  <SponsorAdSenseBanner />
                </div>

                {/* Live Transit Alerts Board */}
                <div className="sidebar-card card-glow" style={{
                  background: 'var(--brand-dark-soft)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '16px',
                  padding: '16px',
                  marginTop: '16px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ background: '#ef4444', color: 'white', fontSize: '0.65rem', padding: '3px 6px', borderRadius: '4px', fontWeight: 'bold' }}>📡 INCIDENCIAS EN VIVO</span>
                    <h4 style={{ margin: 0, fontSize: '0.85rem', color: 'white', fontWeight: 'bold' }}>Boletín de Tránsito</h4>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {transitAlerts.length > 0 ? transitAlerts.map((alertItem, idx) => (
                      <div key={idx} style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: `1px solid ${alertItem.color}25` }}>
                        <strong style={{ fontSize: '0.75rem', color: alertItem.color, display: 'block', marginBottom: '2px' }}>
                          {userSettings.lang === 'es' ? alertItem.titleEs : alertItem.titleEn}
                        </strong>
                        <p style={{ margin: 0, fontSize: '0.65rem', color: '#cbd5e1', lineHeight: '1.3' }}>
                          {userSettings.lang === 'es' ? alertItem.descEs : alertItem.descEn}
                        </p>
                      </div>
                    )) : (
                      <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {userSettings.lang === 'es' ? 'No hay incidencias reportadas hoy.' : 'No active transit incidents today.'}
                      </p>
                    )}
                  </div>
                </div>
              </aside>

              <section className="feed-list">
                {/* Live GPS Recording HUD and Starter */}
                <div className="feed-header-flex-mobile" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                  {/* Quick Access Connection Center */}
                  {!stravaConfig.connected && (
                    <div className="quick-connect-center card-glow" style={{
                      background: 'var(--brand-dark-soft)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '16px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      marginBottom: '16px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🔗 Conectividad Rápida</span>
                        <span style={{ fontSize: '1.2rem' }}>⚡</span>
                      </div>

                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {/* Google Connection Button */}
                        <div style={{
                          flex: 1,
                          minWidth: '140px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          color: '#10b981',
                          fontWeight: '500',
                          justifyContent: 'center'
                        }}>
                          👤 {userProfile.name} (Conectado)
                        </div>

                        {/* Strava Connection Button */}
                        <button
                          onClick={handleConnectStrava}
                          style={{
                            flex: 1,
                            minWidth: '140px',
                            background: 'linear-gradient(135deg, #fc5200, #ff7e40)',
                            color: 'white',
                            border: 'none',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            fontWeight: 'bold',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 12px rgba(252, 82, 0, 0.25)'
                          }}
                        >
                          🧡 Vincular Strava
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Daily Lucky Metro Ticket Scratch/Validation Card */}
                  <div 
                    className="lucky-ticket-card card-glow" 
                    style={{ 
                      background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.12) 0%, rgba(15, 23, 42, 0.95) 100%)', 
                      border: '1px solid rgba(37,99,235,0.3)', 
                      borderRadius: '16px', 
                      padding: '16px',
                      display: 'flex', 
                      flexDirection: 'column',
                      gap: '12px',
                      position: 'relative',
                      overflow: 'hidden',
                      marginBottom: '16px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        🎫 {userSettings.lang === 'es' ? 'Billete Diario de la Suerte' : 'Daily Lucky Metro Ticket'}
                      </span>
                      <span style={{ fontSize: '0.65rem', background: ticketCheckedDate === new Date().toDateString() ? 'rgba(52, 211, 153, 0.12)' : 'rgba(239, 68, 68, 0.12)', color: ticketCheckedDate === new Date().toDateString() ? '#34d399' : '#f87171', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                        {ticketCheckedDate === new Date().toDateString() ? (userSettings.lang === 'es' ? '✓ VALIDADO' : '✓ VALIDATED') : (userSettings.lang === 'es' ? '● PENDIENTE' : '● PENDING')}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                      <div 
                        style={{ 
                          width: '90px', 
                          height: '56px', 
                          background: 'linear-gradient(135deg, #1e293b, #0f172a)', 
                          border: `2px solid ${ticketCheckedDate === new Date().toDateString() ? '#10b981' : '#3b82f6'}`,
                          borderRadius: '8px', 
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.8rem',
                          boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                          flexShrink: 0
                        }}
                      >
                        {ticketCheckedDate === new Date().toDateString() && ticketReward ? ticketReward.icon : '🎫'}
                        <div style={{ position: 'absolute', top: '50%', left: '-5px', transform: 'translateY(-50%)', width: '10px', height: '10px', background: 'var(--brand-dark)', borderRadius: '50%' }}></div>
                        <div style={{ position: 'absolute', top: '50%', right: '-5px', transform: 'translateY(-50%)', width: '10px', height: '10px', background: 'var(--brand-dark)', borderRadius: '50%' }}></div>
                      </div>

                      <div style={{ flex: 1 }}>
                        <h5 style={{ margin: 0, fontSize: '0.85rem', color: 'white', fontWeight: 'bold' }}>
                          {ticketCheckedDate === new Date().toDateString() && ticketReward 
                            ? (userSettings.lang === 'es' ? '¡Recompensa Activa!' : 'Active Reward!') 
                            : (userSettings.lang === 'es' ? 'Valida tu billete del día' : 'Validate today\'s ticket')}
                        </h5>
                        <p style={{ margin: '2px 0 0 0', fontSize: '0.7rem', color: '#cbd5e1', lineHeight: '1.3' }}>
                          {ticketCheckedDate === new Date().toDateString() && ticketReward 
                            ? ticketReward.desc 
                            : (userSettings.lang === 'es' ? 'Haz clic en validar para conseguir XP instantáneos o multiplicadores para tus carreras de hoy.' : 'Click validate to get instant XP or multipliers for today\'s activities.')}
                        </p>
                      </div>

                      {ticketCheckedDate !== new Date().toDateString() ? (
                        <button
                          onClick={handleValidateTicket}
                          style={{
                            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                            color: 'white',
                            border: 'none',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            fontWeight: 'bold',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                            flexShrink: 0
                          }}
                        >
                          {userSettings.lang === 'es' ? 'VALIDAR ➔' : 'VALIDATE ➔'}
                        </button>
                      ) : (
                        <div style={{ fontSize: '1.2rem', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          ✅
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Daily Challenge Card */}
                  <div className="daily-challenge-card card-glow" style={{ background: 'linear-gradient(135deg, rgba(252, 82, 0, 0.1) 0%, rgba(15, 23, 42, 0.95) 100%)', border: '1px solid rgba(252,82,0,0.3)', borderRadius: '16px', padding: '16px', display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <div style={{ fontSize: '2.5rem' }}>⚔️</div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--brand-orange)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reto Diario del Cid</span>
                      <h4 style={{ margin: '4px 0', fontSize: '1rem', color: 'white' }}>{dailyChallenge.name}</h4>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#cbd5e1' }}>
                        {dailyChallenge.completed 
                          ? '🎉 ¡Completado! Has conseguido +100 XP extras de motivación hoy.'
                          : 'Completa esta línea hoy corriendo o caminando para ganar +100 XP extras.'}
                      </p>
                    </div>
                    {!dailyChallenge.completed ? (
                      <button 
                        onClick={() => {
                          const matchedLine = loadedBusLines.find(l => l.ref === dailyChallenge.ref);
                          if (matchedLine) {
                            setSelectedLineId(matchedLine.id);
                            setActiveMapActivity(null);
                            setActiveTab('map');
                          } else {
                            setActiveTab('map');
                          }
                        }}
                        style={{ background: 'var(--brand-orange)', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer' }}
                      >
                        Ver Ruta ➔
                      </button>
                    ) : (
                      <span style={{ fontSize: '1.5rem', color: 'var(--accent-green)' }}>🏆</span>
                    )}
                  </div>

                  {/* GPS Tracking Starter Card */}
                  <div className="live-tracker-start-card card-glow" style={{ background: 'var(--brand-dark-soft)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '16px' }}>
                    <div className="coach-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="watch-badge" style={{ background: 'var(--brand-orange)', color: 'white', fontSize: '0.7rem', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold' }}>📡 GPS EN VIVO</span>
                      <h4 style={{ margin: 0, color: 'white' }}>Registrar Actividad</h4>
                    </div>
                    <p className="watch-desc-text" style={{ color: '#cbd5e1', fontSize: '0.8rem', margin: '4px 0 12px 0' }}>
                      Graba tu trayecto directamente con el GPS del móvil en tiempo real o simula un rodaje en vivo sobre la línea activa del mapa.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      <button 
                        className="btn-live-record" 
                        style={{ flex: 1, minWidth: '120px', background: 'var(--brand-orange)', color: 'white', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        onClick={() => startRecording('running')}
                      >
                        🏃 Grabar Carrera
                      </button>
                      <button 
                        className="btn-live-record" 
                        style={{ flex: 1, minWidth: '120px', background: 'var(--brand-orange)', color: 'white', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        onClick={() => startRecording('walking')}
                      >
                        🚶 Grabar Paseo
                      </button>
                      <button 
                        className="btn-sim-record" 
                        style={{ flex: 1, minWidth: '200px', background: 'transparent', color: '#fc5200', border: '1px solid #fc5200', padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
                        onClick={startSimulatedRecording}
                      >
                        ⚙️ Simular en Vivo (Línea {selectedLine ? selectedLine.ref : 'L01'})
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                  <h2 className="section-title" style={{ margin: 0 }}>Actividad de la Comunidad</h2>
                  <button 
                    onClick={() => setShowChatModal(true)}
                    style={{
                      background: 'rgba(252, 82, 0, 0.1)',
                      border: '1px solid var(--brand-orange)',
                      color: 'var(--brand-orange)',
                      padding: '8px 16px',
                      borderRadius: '20px',
                      fontWeight: 'bold',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      transition: 'background 0.2s'
                    }}
                    className="btn-chat-feed"
                  >
                    💬 Chat Privado
                  </button>
                </div>

                {visibleFeedActivities.map((act) => {
                  const athleteIdMap: Record<string, string> = {
                    'Carlos Gómez': 'carlos-gomez',
                    'Sofía Martínez': 'sofia-martinez',
                    'Marta Corredora': 'marta-corredora',
                    'Diego Cid': 'diego-cid'
                  };
                  const aid = athleteIdMap[act.userName] || '';
                  const isFav = aid ? !!favoriteAthletes[aid] : false;

                  return (
                    <article key={act.id} className="activity-card">
                      <div className="activity-header">
                        <div className="act-user">
                          <div className="act-avatar">{renderAvatar(act.userAvatar, 'act-avatar')}</div>
                          <div>
                            <h4 
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                              onClick={() => {
                                if (aid) setSelectedAthleteId(aid);
                              }}
                            >
                              {act.userName}
                              {aid && (
                                <button 
                                  onClick={() => {
                                    const newFavs = { ...favoriteAthletes, [aid]: !favoriteAthletes[aid] };
                                    saveFavorites(newFavs);
                                    addNotification('Social', newFavs[aid] ? `¡${act.userName} marcado/a como favorito/a! 🌟` : `Quitado/a ${act.userName} de favoritos.`, 'info');
                                  }}
                                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: 0 }}
                                  title={isFav ? "Quitar de favoritos" : "Marcar como favorito"}
                                >
                                  {isFav ? '⭐' : '☆'}
                                </button>
                              )}
                            </h4>
                            <span className="act-date">
                              {act.date} • 📍 {act.cityId ? (citiesList.find(c => c.id === act.cityId)?.name || act.cityId.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())) : 'Burgos'}
                            </span>
                          </div>
                        </div>
                        <div className="act-ref-badge" onClick={() => { setSelectedLineId(act.lineId); setActiveTab('map'); }}>
                          <span className="ref-lbl">{act.lineRef}</span>
                          <span className="name-lbl">{act.lineName.split(': ')[1] || act.lineName}</span>
                        </div>
                      </div>

                      <div className="activity-body">
                        <div className="activity-stats">
                          <div className="act-stat-box">
                            <span className="l">Distancia</span>
                            <span className="v">{act.distanceKm.toFixed(2)} km</span>
                          </div>
                          <div className="act-stat-box">
                            <span className="l">Tiempo</span>
                            <span className="v">{formatDuration(act.timeSeconds)}</span>
                          </div>
                          <div className="act-stat-box">
                            <span className="l">Ritmo Medio</span>
                            <span className="v">
                              {formatDuration(act.timeSeconds / act.distanceKm)}/km
                            </span>
                          </div>
                          <div className="act-stat-box">
                            <span className="l">Desnivel +</span>
                            <span className="v">+{act.elevationGain}m</span>
                          </div>
                        </div>

                        <div className="activity-match-pill">
                          Verificación GPX: <strong>{act.matchPercent}% coincidencia</strong>
                        </div>

                        {/* Read-only Mini Map of the route (Clickable to explore) */}
                        <MiniFeedMap 
                          activityId={act.id} 
                          coords={getCoordsForActivity(act, loadedBusLines)} 
                          color={act.lineRef === 'LIBRE' ? '#0284c7' : '#fc5200'} 
                          onClick={() => {
                            if (act.coords && act.coords.length > 0) {
                              setActiveMapActivity({
                                name: act.lineName,
                                userName: act.userName,
                                coords: act.coords,
                                isFreeRun: act.lineRef === 'LIBRE'
                              });
                              setActiveTab('map');
                            } else {
                              const l = loadedBusLines.find(x => x.ref === act.lineRef);
                              if (l) {
                                setSelectedLineId(l.id);
                                setActiveMapActivity(null);
                                setActiveTab('map');
                              } else {
                                alert("No hay track GPS guardado para esta actividad antigua.");
                              }
                            }
                          }}
                        />
                      </div>

                      <div className="activity-footer">
                        <div className="actions-bar" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <button 
                            className={`btn-like ${act.likedByMe ? 'liked' : ''}`}
                            onClick={() => handleLikeActivity(act.id)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            👍 {act.likedByMe ? t('liked') : t('like')} ({act.likes})
                          </button>
                          <span className="comments-count" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#94a3b8' }}>
                            💬 {act.comments.length} {t('comments')}
                          </span>
                          <button 
                            className="btn-share"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#60a5fa',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.8rem',
                              fontWeight: '600',
                              padding: '6px 10px',
                              borderRadius: '6px',
                              marginLeft: 'auto',
                              transition: 'background 0.2s'
                            }}
                            onClick={() => {
                              setSelectedShareActivity(act);
                            }}
                          >
                            📤 {t('share')}
                          </button>
                        </div>

                        {act.comments.length > 0 && (
                          <div className="feed-comments">
                            {act.comments.map((comment) => (
                              <div key={comment.id} className="comment-item">
                                <strong>{comment.userName}: </strong>
                                <span>{comment.text}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="comment-input-box">
                          <input 
                            type="text" 
                            placeholder="Escribe un comentario deportivo..."
                            value={commentInputs[act.id] || ''}
                            onChange={(e) => setCommentInputs({ ...commentInputs, [act.id]: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handlePostComment(act.id);
                            }}
                          />
                          <button onClick={() => handlePostComment(act.id)}>Enviar</button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </section>
            </div>
          )}

          {/* Map and Stops Tab */}
          {activeTab === 'map' && (
            <div className="map-tab-layout">
              <aside className="map-sidebar">
                {/* Filters Group for Map and Lines */}
                <div className="map-filters-card" style={{ marginBottom: '16px', background: 'var(--brand-light)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Filtrar Líneas 🔍
                  </label>
                  
                  <div style={{ marginBottom: '10px' }}>
                    <input 
                      type="text" 
                      placeholder="Buscar por nombre o parada..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        background: 'white',
                        color: 'var(--brand-dark)',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                    <button 
                      onClick={() => setFilterType('all')}
                      style={{
                        flex: 1,
                        padding: '8px',
                        fontSize: '0.75rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: filterType === 'all' ? 'var(--brand-orange)' : 'rgba(0,0,0,0.05)',
                        color: filterType === 'all' ? 'white' : 'var(--brand-dark)',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      Todas
                    </button>
                    <button 
                      onClick={() => setFilterType('completed')}
                      style={{
                        flex: 1,
                        padding: '8px',
                        fontSize: '0.75rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: filterType === 'completed' ? 'var(--brand-orange)' : 'rgba(0,0,0,0.05)',
                        color: filterType === 'completed' ? 'white' : 'var(--brand-dark)',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      Hechas
                    </button>
                    <button 
                      onClick={() => setFilterType('pending')}
                      style={{
                        flex: 1,
                        padding: '8px',
                        fontSize: '0.75rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: filterType === 'pending' ? 'var(--brand-orange)' : 'rgba(0,0,0,0.05)',
                        color: filterType === 'pending' ? 'white' : 'var(--brand-dark)',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      Pendientes
                    </button>
                  </div>

                  <div>
                    <select 
                      value={distanceFilter} 
                      onChange={(e) => setDistanceFilter(e.target.value as any)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        background: 'white',
                        color: 'var(--brand-dark)',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        outline: 'none'
                      }}
                    >
                      <option value="all">Cualquier distancia</option>
                      <option value="short">Cortas (&lt; 5 km)</option>
                      <option value="medium">Medias (5 - 10 km)</option>
                      <option value="long">Largas (&gt; 10 km)</option>
                    </select>
                  </div>
                </div>

                {/* Unified Line Selector Dropdown */}
                <div className="line-selector-card" style={{ marginBottom: '16px', background: 'var(--brand-light)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Seleccionar Línea
                  </label>
                  <select 
                    value={filteredLines.some(l => l.id === selectedLineId) ? selectedLineId : (filteredLines[0]?.id || '')} 
                    onChange={(e) => {
                      setSelectedLineId(e.target.value);
                      setActiveMapActivity(null); // Clear custom track if line changes
                      setSelectedDirection(0);
                    }}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '10px',
                      border: '1px solid var(--border-color)',
                      background: 'white',
                      fontSize: '0.9rem',
                      fontWeight: 'bold',
                      color: 'var(--brand-dark)',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    {filteredLines.length > 0 ? (
                      filteredLines.map(line => (
                        <option key={line.id} value={line.id}>
                          Línea {line.ref}: {line.name.split(': ')[1] || line.name}
                        </option>
                      ))
                    ) : (
                      <option value="">No hay líneas con estos filtros</option>
                    )}
                  </select>
                </div>

                {/* Route Header Info */}
                <div className="sidebar-header-flex" style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--brand-light)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="route-badge-large">{selectedLine ? selectedLine.ref : ''}</span>
                    <div>
                      {selectedLine && !!completed[`${activeCity}_${selectedLine.ref}`] ? (
                        <span style={{ background: '#ecfdf5', color: '#10b981', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>✓ Completado</span>
                      ) : (
                        <span style={{ background: '#fef2f2', color: '#ef4444', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>⏱ Pendiente</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <h3 style={{ margin: '4px 0 0 0', fontSize: '1.1rem' }}>{selectedLine ? (selectedLine.name.split(': ')[1] || selectedLine.name) : ''}</h3>
                    <span className="operator-name" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Línea Oficial SMyT Burgos</span>
                  </div>

                  {selectedLine && transitAlerts.find(a => a.lineRef === selectedLine.ref) && (() => {
                    const alertItem = transitAlerts.find(a => a.lineRef === selectedLine.ref)!;
                    return (
                      <div style={{
                        background: alertItem.type === 'strike' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                        border: `1px dashed ${alertItem.color}`,
                        borderRadius: '8px',
                        padding: '10px',
                        marginTop: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px'
                      }}>
                        <strong style={{ fontSize: '0.75rem', color: alertItem.color, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {alertItem.icon || '🚨'} {userSettings.lang === 'es' ? alertItem.titleEs : alertItem.titleEn}
                        </strong>
                        <p style={{ margin: 0, fontSize: '0.65rem', color: '#cbd5e1', lineHeight: '1.3' }}>
                          {userSettings.lang === 'es' ? alertItem.descEs : alertItem.descEn}
                        </p>
                      </div>
                    );
                  })()}

                  {/* Route metrics inside Map tab */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '10px', marginTop: '4px' }}>
                    <div>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Distancia</span>
                      <strong style={{ fontSize: '0.95rem' }}>{selectedLine ? selectedLine.distanceKm.toFixed(2) : 0} km</strong>
                    </div>
                    <div>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Paradas</span>
                      <strong style={{ fontSize: '0.95rem' }}>{selectedLine ? selectedLine.stops.length : 0}</strong>
                    </div>
                  </div>
                </div>

                {/* Custom User Track Active Alert */}
                {activeMapActivity && (
                  <div className="activity-map-alert">
                    <span>📍 Recorrido GPS de <strong>{activeMapActivity.userName}</strong></span>
                    <button className="btn-clear-track" onClick={() => setActiveMapActivity(null)}>
                      Volver a Oficial
                    </button>
                  </div>
                )}

                {/* Direction Filter Bar (Ida vs Vuelta) */}
                {selectedLine && selectedLine.coords.length > 0 && ((aggregatedLines.find(l => l.id === selectedLineId || l.ref === selectedLineId)?.subRoutes?.length ?? 0) > 1) && (
                  <div className="map-filter-bar" style={{ marginTop: '0', marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>SENTIDO DE MARCHA:</label>
                    <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                      <button 
                        className={`map-filter-btn ${selectedDirection === 0 ? 'active' : ''}`}
                        onClick={() => setSelectedDirection(0)}
                        style={{ flex: 1 }}
                      >
                        Ida ➔
                      </button>
                      <button 
                        className={`map-filter-btn ${selectedDirection === 1 ? 'active' : ''}`}
                        onClick={() => setSelectedDirection(1)}
                        style={{ flex: 1 }}
                      >
                        🔁 Vuelta
                      </button>
                    </div>
                  </div>
                )}

                <div className="action-buttons-group" style={{ marginBottom: '16px' }}>
                  <button 
                    className="btn-download-gpx-large"
                    onClick={() => selectedLine && triggerGpxDownload(selectedLine)}
                    style={{ width: '100%' }}
                  >
                    📥 Descargar Track GPX Real
                  </button>
                </div>

                {/* Nearby Lines Detection Box */}
                <div className="nearby-detection-box" style={{ marginBottom: '16px' }}>
                  <div className="section-title-box">
                    <h4>📍 Paradas Cercanas a Ti</h4>
                    <button className="btn-detect" onClick={detectNearbyLines}>Detectar</button>
                  </div>
                  {userLocation ? (
                    <div className="nearby-list">
                      <p className="simulated-label">
                        {isSimulatedLocation 
                          ? "Simulado en Plaza de España" 
                          : "Ubicación real por GPS"}
                      </p>
                      {nearbyStops.length > 0 ? (
                        nearbyStops.map((item, idx) => (
                          <div key={idx} className="nearby-stop-item">
                            <div className="stop-info">
                              <strong>{item.stop.name}</strong>
                              <span>a {(item.distanceKm * 1000).toFixed(0)}m</span>
                            </div>
                            <div className="stop-lines">
                              {item.lineRefs.map(ref => (
                                <span 
                                  key={ref} 
                                  className="line-tag-small"
                                  onClick={() => {
                                    const l = burgosBusLines.find(x => x.ref === ref);
                                    if (l) setSelectedLineId(l.id);
                                  }}
                                >
                                  {ref}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="no-stops">No hay paradas en un radio de 600 metros.</p>
                      )}
                    </div>
                  ) : (
                    <p className="gps-help-text">
                      Activa los permisos de ubicación para buscar paradas de autobús urbano a tu alrededor y ver qué líneas pasan cerca.
                    </p>
                  )}
                </div>

                {/* Unified Sequence List with Checklist boxes */}
                <div className="map-stops-sequence">
                  <h4 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Secuencia de Paradas ({selectedLine ? selectedLine.stops.length : 0})</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Est. Completado</span>
                  </h4>
                  <div className="stops-sequence-list" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                    {selectedLine ? selectedLine.stops.map((stop, idx) => {
                      const isLineDone = !!completed[`${activeCity}_${selectedLine.ref}`];
                      return (
                        <div key={stop.id} className="sequence-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span className="index" style={{ width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', borderRadius: '50%', fontSize: '0.75rem', fontWeight: 'bold' }}>{idx + 1}</span>
                            <div className="info" style={{ display: 'flex', flexDirection: 'column' }}>
                              <span className="name" style={{ fontSize: '0.85rem', fontWeight: '600' }}>{stop.name}</span>
                              <span className="coords-lbl" style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{stop.lat.toFixed(4)}, {stop.lon.toFixed(4)}</span>
                            </div>
                          </div>
                          <div>
                            <input 
                              type="checkbox" 
                              checked={isLineDone} 
                              readOnly 
                              style={{
                                width: '18px',
                                height: '18px',
                                accentColor: 'var(--accent-green)',
                                cursor: 'default'
                              }}
                            />
                          </div>
                        </div>
                      );
                    }) : null}
                  </div>
                </div>
              </aside>

              <div className="map-canvas-container">
                <MapContainer center={mapCenter} zoom={14} className="main-leaflet-map" scrollWheelZoom={true}>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  
                  {activeMapActivity ? (
                    <>
                      <Polyline 
                        positions={activeMapActivity.coords} 
                        color="#0284c7" 
                        weight={7} 
                        opacity={0.9} 
                      />
                      {activeMapActivity.coords.length > 0 && (
                        <>
                          <Marker position={activeMapActivity.coords[0]} icon={startIcon}>
                            <Popup>
                              <strong>Inicio del rodaje: {activeMapActivity.userName}</strong>
                            </Popup>
                          </Marker>
                          <Marker position={activeMapActivity.coords[activeMapActivity.coords.length - 1]} icon={endIcon}>
                            <Popup>
                              <strong>Fin del rodaje</strong>
                            </Popup>
                          </Marker>
                        </>
                      )}
                    </>
                  ) : (
                    selectedLine && (
                      <Polyline 
                        positions={selectedLine.coords.map(([lat, lon]) => [lat, lon])} 
                        color="#fc5200" 
                        weight={6} 
                        opacity={0.88} 
                      />
                    )
                  )}
                  
                  <MapViewController center={mapCenter} />
 
                  {/* Start Marker */}
                  {!activeMapActivity && selectedLine && selectedLine.coords.length > 0 && (
                    <Marker position={[selectedLine.coords[0][0], selectedLine.coords[0][1]]} icon={startIcon}>
                      <Popup>
                        <div className="map-popup">
                          <strong>Punto de Inicio</strong>
                          <p>{selectedLine.stops[0]?.name || 'Inicio'}</p>
                        </div>
                      </Popup>
                    </Marker>
                  )}
 
                  {/* End Marker */}
                  {!activeMapActivity && selectedLine && selectedLine.coords.length > 0 && (
                    <Marker position={[selectedLine.coords[selectedLine.coords.length - 1][0], selectedLine.coords[selectedLine.coords.length - 1][1]]} icon={endIcon}>
                      <Popup>
                        <div className="map-popup">
                          <strong>Punto Final</strong>
                          <p>{selectedLine.stops[selectedLine.stops.length - 1]?.name || 'Fin'}</p>
                        </div>
                      </Popup>
                    </Marker>
                  )}
 
                  {/* Stops Markers */}
                  {!activeMapActivity && selectedLine && selectedLine.stops.slice(1, -1).map((stop) => (
                    <Marker key={stop.id} position={[stop.lat, stop.lon]} icon={stopIcon}>
                      <Popup>
                        <div className="map-popup">
                          <strong>Parada</strong>
                          <p>{stop.name}</p>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
 
                  {/* User GPS location dot */}
                  {userLocation && (
                    <Marker position={userLocation} icon={userIcon}>
                      <Popup>
                        <strong>Tu ubicación</strong>
                        <p>{isSimulatedLocation ? "Plaza de España (Simulada)" : "Localizado por GPS"}</p>
                      </Popup>
                    </Marker>
                  )}
                </MapContainer>
              </div>
              <SponsorAdSenseBanner />
            </div>
          )}

          {/* Profile, Watch Connections and Historical Ranks Tab */}
          {activeTab === 'profile' && (
            <div className="profile-tab-layout">
              <section className="profile-hero-card" style={{ position: 'relative' }}>
                {/* Settings Gear Button */}
                <button 
                  onClick={() => setShowSettingsModal(true)}
                  style={{
                    position: 'absolute',
                    top: '16px',
                    right: '16px',
                    background: 'rgba(255,255,255,0.1)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: '1.2rem',
                    color: 'white',
                    transition: 'background 0.2s',
                    zIndex: 10
                  }}
                  title="Configuración de Usuario"
                >
                  ⚙️
                </button>

                {/* Tutorial Help Button */}
                <button 
                  onClick={() => setTutorialStep(1)}
                  style={{
                    position: 'absolute',
                    top: '16px',
                    right: '60px',
                    background: 'rgba(255,255,255,0.1)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: '1.2rem',
                    color: 'white',
                    transition: 'background 0.2s',
                    zIndex: 10
                  }}
                  title="Ver Tutorial de Bienvenida"
                >
                  ❓
                </button>

                <div className="profile-primary-row">
                  <div className="profile-avatar-large">
                    {renderAvatar(userProfile.avatar, 'profile-avatar-large', triggerAvatarChange, 'Haz clic para cambiar tu foto de perfil')}
                  </div>
                  <div className="profile-main-meta">
                    <div className="profile-name-badge">
                      <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {userProfile.name}
                        {prestigeCount > 0 && (
                          <span 
                            style={{ 
                              color: '#f59e0b', 
                              fontSize: '0.85rem', 
                              letterSpacing: '1px', 
                              background: 'rgba(245, 158, 11, 0.12)', 
                              padding: '2px 8px', 
                              borderRadius: '20px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              fontWeight: 'bold',
                              border: '1px solid rgba(245, 158, 11, 0.25)'
                            }}
                            title={`Prestigio Nivel ${prestigeCount}`}
                          >
                            ★ {prestigeCount}
                          </span>
                        )}
                        <button 
                          onClick={() => { setSettingsActiveTab('profile'); setShowSettingsModal(true); }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--brand-orange)',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            opacity: 0.8,
                            transition: 'opacity 0.2s'
                          }}
                          className="btn-edit-pencil"
                          title="Editar Perfil"
                        >
                          <Icons.Pencil />
                        </button>
                      </h2>
                      <span className="profile-rank-badge">{currentRank.title} {currentRank.icon}</span>
                      <span 
                        style={{
                          background: 'rgba(37, 99, 235, 0.15)',
                          color: '#60a5fa',
                          border: '1px solid rgba(37, 99, 235, 0.3)',
                          padding: '2px 8px',
                          borderRadius: '8px',
                          fontSize: '0.7rem',
                          fontWeight: 'bold',
                          display: 'inline-flex',
                          alignItems: 'center',
                          marginLeft: '8px'
                        }}
                      >
                        ⚡ NIVEL {currentLevel} ({xp} XP)
                      </span>
                    </div>
                    <p className="city-label" style={{ color: '#cbd5e1' }}>📍 {userProfile.location || 'Burgos, España'}</p>
                    <p className="bio" style={{ fontStyle: 'italic', margin: '4px 0 0 0', fontSize: '0.85rem' }}>{userProfile.bio || 'Sin biografía añadida.'}</p>
                  </div>
                </div>

                <div className="profile-stats-grid">
                  <div className="profile-stat-box">
                    <span className="lbl">Líneas en {citiesList.find(c => c.id === activeCity)?.name || 'Activa'}</span>
                    <span className="val">{burgosCompletedUniqueCount} <span className="sub">de {totalBurgosLinesCount}</span></span>
                  </div>
                  <div className="profile-stat-box">
                    <span className="lbl">Total Global</span>
                    <span className="val">{globalCompletedCount} <span className="sub">líneas</span></span>
                  </div>
                  <div className="profile-stat-box">
                    <span className="lbl">Kilómetros Corridos</span>
                    <span className="val">{totalKmCompleted.toFixed(1)} <span className="sub">km</span></span>
                  </div>
                  <div className="profile-stat-box">
                    <span className="lbl">Desnivel Acumulado</span>
                    <span className="val">+{totalElevationGainCompleted.toFixed(0)} <span className="sub">m</span></span>
                  </div>
                </div>

                <div className="profile-bar-completion">
                  <div className="header-bar">
                    <span>% Ciudad de {citiesList.find(c => c.id === activeCity)?.name || 'Activa'} Completada</span>
                    <strong>{burgosCompletionPercentage.toFixed(0)}%</strong>
                  </div>
                  <div className="bar-bg">
                    <div className="bar-fill" style={{ width: `${burgosCompletionPercentage}%` }}></div>
                  </div>
                </div>

                {/* Medals Breakdown & City Platinum Trophy Progress */}
                <div className="city-perfection-card card-glow" style={{
                  background: 'var(--brand-light)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '16px',
                  padding: '16px',
                  marginTop: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🏆 {userSettings.lang === 'es' ? 'Perfección de Ciudad' : 'City Perfection'}
                    </h4>
                    {activeCityMedals.gold === totalBurgosLinesCount && totalBurgosLinesCount > 0 ? (
                      <span className="badge-glow" style={{
                        background: 'linear-gradient(135deg, #e2e8f0, #94a3b8)',
                        color: '#1e293b',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.7rem',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        boxShadow: '0 0 10px rgba(255,255,255,0.2)'
                      }}>
                        💍 {userSettings.lang === 'es' ? 'PLATINO ADQUIRIDO' : 'PLATINUM CONQUERED'}
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {activeCityMedals.gold} / {totalBurgosLinesCount} {userSettings.lang === 'es' ? 'Oros' : 'Golds'}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', textAlign: 'center' }}>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ fontSize: '1.2rem' }}>🥇</span>
                      <div style={{ fontSize: '0.9rem', fontWeight: 'bold', margin: '2px 0' }}>{activeCityMedals.gold}</div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{userSettings.lang === 'es' ? 'Ritmo < 4:30' : 'Pace < 4:30'}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ fontSize: '1.2rem' }}>🥈</span>
                      <div style={{ fontSize: '0.9rem', fontWeight: 'bold', margin: '2px 0' }}>{activeCityMedals.silver}</div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{userSettings.lang === 'es' ? 'Ritmo < 5:30' : 'Pace < 5:30'}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ fontSize: '1.2rem' }}>🥉</span>
                      <div style={{ fontSize: '0.9rem', fontWeight: 'bold', margin: '2px 0' }}>{activeCityMedals.bronze}</div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{userSettings.lang === 'es' ? 'Otros ritmos' : 'Other paces'}</div>
                    </div>
                  </div>

                  <div className="gold-progress-bar" style={{ marginTop: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      <span>{userSettings.lang === 'es' ? 'Progreso hacia Trofeo de Platino (Todas Oro)' : 'Progress to Platinum Trophy (All Gold)'}</span>
                      <span>{goldCompletionPercentage.toFixed(0)}%</span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--brand-dark-soft)', borderRadius: '10px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${goldCompletionPercentage}%`,
                        background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
                        borderRadius: '10px'
                      }}></div>
                    </div>
                  </div>
                </div>

                {/* Virtual Metro Journeys Card */}
                <div className="virtual-journeys-card card-glow" style={{
                  background: 'var(--brand-light)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '16px',
                  padding: '16px',
                  marginTop: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🚇 {userSettings.lang === 'es' ? 'Viajes de Metro Virtuales' : 'Virtual Metro Journeys'}
                    </h4>
                    <p style={{ margin: '2px 0 0 0', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                      {userSettings.lang === 'es' 
                        ? 'Acumula kilómetros corriendo en cualquier lugar y completa líneas icónicas mundiales.' 
                        : 'Accumulate kilometers running anywhere and conquer iconic transit loops.'}
                    </p>
                  </div>

                  {/* Active Journey Progress */}
                  {(() => {
                    const journey = VIRTUAL_JOURNEYS.find(j => j.id === activeVirtualJourney) || VIRTUAL_JOURNEYS[0];
                    const progressKm = virtualProgress[journey.id] || 0;
                    const percent = Math.min(100, (progressKm / journey.totalKm) * 100);
                    const isDone = progressKm >= journey.totalKm;
                    
                    return (
                      <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '1.2rem' }}>{journey.badgeIcon}</span> {userSettings.lang === 'es' ? journey.nameEs : journey.nameEn}
                          </span>
                          <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: isDone ? '#10b981' : 'var(--text-muted)' }}>
                            {isDone ? '🎉 ¡COMPLETADO!' : `${progressKm.toFixed(1)} / ${journey.totalKm} km`}
                          </span>
                        </div>
                        
                        <div style={{ height: '8px', background: 'var(--brand-dark-soft)', borderRadius: '10px', overflow: 'hidden', position: 'relative', marginBottom: '6px' }}>
                          <div style={{
                            height: '100%',
                            width: `${percent}%`,
                            background: journey.color,
                            borderRadius: '10px',
                            transition: 'width 0.5s ease'
                          }}></div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>
                            {userSettings.lang === 'es' ? 'Progreso actual de viaje' : 'Current voyage progress'}
                          </span>
                          <span style={{ fontWeight: 'bold', color: 'white' }}>{percent.toFixed(0)}%</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Selector to change active journey */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                      {userSettings.lang === 'es' ? 'Seleccionar Viaje Virtual Activo:' : 'Select Active Virtual Journey:'}
                    </label>
                    <select
                      value={activeVirtualJourney}
                      onChange={(e) => {
                        setActiveVirtualJourney(e.target.value);
                        localStorage.setItem('metromile-active-journey', e.target.value);
                      }}
                      style={{
                        background: 'var(--brand-dark-soft)',
                        border: '1px solid var(--border-color)',
                        color: 'white',
                        padding: '8px',
                        borderRadius: '8px',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        width: '100%'
                      }}
                    >
                      {VIRTUAL_JOURNEYS.map(j => {
                        const prog = virtualProgress[j.id] || 0;
                        const isDone = prog >= j.totalKm;
                        return (
                          <option key={j.id} value={j.id}>
                            {j.badgeIcon} {userSettings.lang === 'es' ? j.nameEs : j.nameEn} ({j.totalKm} km) {isDone ? '✓' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Stamp Collection / Unlocked Badges */}
                  <div style={{ marginTop: '4px' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>
                      🎒 {userSettings.lang === 'es' ? 'Sellos de Pasaporte Adquiridos:' : 'Earned Passport Stamps:'}
                    </span>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {VIRTUAL_JOURNEYS.map(j => {
                        const prog = virtualProgress[j.id] || 0;
                        const isDone = prog >= j.totalKm;
                        return (
                          <div
                            key={j.id}
                            title={`${userSettings.lang === 'es' ? j.nameEs : j.nameEn} (${isDone ? 'Conquistado' : 'Pendiente'})`}
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '50%',
                              background: isDone ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.2)',
                              border: isDone ? `2px solid ${j.color}` : '2px dashed rgba(255,255,255,0.1)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '1.4rem',
                              opacity: isDone ? 1 : 0.25,
                              filter: isDone ? 'none' : 'grayscale(100%)',
                              transition: 'all 0.3s ease',
                              cursor: 'help'
                            }}
                          >
                            {j.badgeIcon}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Passport: Multi-City Progression */}
                <div className="passport-card card-glow" style={{
                  background: 'var(--brand-light)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '16px',
                  padding: '16px',
                  marginTop: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🛂 {userSettings.lang === 'es' ? 'Pasaporte de Ciudades MetroMile' : 'MetroMile Cities Passport'}
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                    {userSettings.lang === 'es'
                      ? 'Cambia tu ciudad activa en la configuración para empezar a explorar y conquistar nuevas redes de metro y autobús en todo el mundo.'
                      : 'Change your active city in settings to explore and conquer new subway and bus networks globally.'}
                  </p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                    {passportCities.map(city => {
                      const isActive = city.id === activeCity;
                      return (
                        <div 
                          key={city.id} 
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'between',
                            background: isActive ? 'rgba(37, 99, 235, 0.05)' : 'rgba(255, 255, 255, 0.01)',
                            border: isActive ? '1px solid rgba(37, 99, 235, 0.25)' : '1px solid rgba(255, 255, 255, 0.03)',
                            padding: '10px 12px',
                            borderRadius: '10px',
                            gap: '12px'
                          }}
                        >
                          <span style={{ fontSize: '1.4rem' }}>{isActive ? '📍' : '✈️'}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'white' }}>
                                {city.name} <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>({city.country})</span>
                              </span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                {city.completedCount} / {city.totalCount} {userSettings.lang === 'es' ? 'líneas' : 'lines'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                              <div style={{ flex: 1, height: '4px', background: 'var(--brand-dark-soft)', borderRadius: '10px', overflow: 'hidden' }}>
                                <div style={{
                                  height: '100%',
                                  width: `${city.completionPercent}%`,
                                  background: city.completionPercent >= 100 ? '#10b981' : 'var(--brand-orange)',
                                  borderRadius: '10px'
                                }}></div>
                              </div>
                              <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: city.completionPercent >= 100 ? '#10b981' : '#cbd5e1' }}>
                                {city.completionPercent.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {burgosCompletionPercentage >= 100 && (
                  <div 
                    className="card-glow" 
                    style={{
                      background: 'rgba(245, 158, 11, 0.05)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      borderRadius: '16px',
                      padding: '16px',
                      marginTop: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '10px',
                      textAlign: 'center'
                    }}
                  >
                    <span style={{ fontSize: '2rem' }}>👑</span>
                    <strong style={{ fontSize: '0.95rem', color: '#ffd700' }}>
                      {userSettings.lang === 'es' ? '¡Ciudad 100% Conquistada!' : 'City 100% Conquered!'}
                    </strong>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#cbd5e1', lineHeight: '1.4', maxWidth: '380px' }}>
                      {userSettings.lang === 'es' 
                        ? 'Has completado todas las rutas disponibles en esta ciudad. Activa el Modo Prestigio para reiniciar tu progreso local, ganar una medalla permanente ★ y volver a competir con un multiplicador de rango.'
                        : 'You have completed all available routes in this city. Activate Prestige Mode to reset your local progress, earn a permanent ★ badge, and start competing again with a rank multiplier.'}
                    </p>
                    <button
                      onClick={() => {
                        if (confirm(userSettings.lang === 'es' 
                          ? '¿Estás seguro de que deseas reiniciar tu progreso de la ciudad activa y avanzar al siguiente Nivel de Prestigio?' 
                          : 'Are you sure you want to reset your progress for the active city and advance to the next Prestige Level?')) {
                          handlePrestigeReset();
                        }
                      }}
                      style={{
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        color: 'white',
                        border: 'none',
                        padding: '10px 18px',
                        borderRadius: '8px',
                        fontWeight: 'bold',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 12px rgba(245, 158, 11, 0.25)'
                      }}
                    >
                      ★ {userSettings.lang === 'es' ? 'Iniciar Modo Prestigio' : 'Activate Prestige Mode'}
                    </button>
                  </div>
                )}
              </section>

              {/* Quick Connection center inside the Profile tab */}
              {!stravaConfig.connected && (
                <div className="quick-connect-center card-glow" style={{
                  background: 'var(--brand-dark-soft)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '16px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  marginBottom: '20px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🔗 Conectividad Rápida</span>
                    <span style={{ fontSize: '1.2rem' }}>⚙️</span>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {/* Google Connection Button */}
                    <div style={{
                      flex: 1,
                      minWidth: '140px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: '#10b981',
                      fontWeight: '500',
                      justifyContent: 'center'
                    }}>
                      👤 {userProfile.name} (Conectado)
                    </div>

                    {/* Strava Connection Button */}
                    <button
                      onClick={handleConnectStrava}
                      style={{
                        flex: 1,
                        minWidth: '140px',
                        background: 'linear-gradient(135deg, #fc5200, #ff7e40)',
                        color: 'white',
                        border: 'none',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        fontWeight: 'bold',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 12px rgba(252, 82, 0, 0.25)'
                      }}
                    >
                      🧡 Vincular Strava
                    </button>
                  </div>
                </div>
              )}

              {/* Ranks */}
              <section className="profile-medals-section">
                <h3 className="section-title">Hitos de Rango (Acumulable Globalmente)</h3>
                <p className="section-subtitle">
                  Progresa de forma acumulativa sumando el porcentaje de completado de tu red urbana de transportes.
                </p>
                
                <div className="medals-grid">
                  {GLOBAL_RANKS.map((rank) => {
                    const isUnlocked = globalCompletionPercentage >= rank.minPercentage;
                    return (
                      <div key={rank.id} className={`medal-card rank-card ${isUnlocked ? 'unlocked' : 'locked'} ${currentRank.id === rank.id ? 'current-active-rank' : ''}`}>
                        {currentRank.id === rank.id && (
                          <span className="active-rank-badge">RANGO ACTUAL</span>
                        )}
                        <span className="medal-icon">{rank.icon}</span>
                        <h4>{rank.title}</h4>
                        <p>{rank.description}</p>
                        <span className="condition-badge">Desbloquea al {rank.minPercentage}%</span>
                        <div className="unlocked-indicator">
                          {isUnlocked ? '🔓 Alcanzado' : '🔒 Bloqueado'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Achievements & Medals */}
              <section className="profile-medals-section" style={{ marginTop: '30px' }}>
                <h3 className="section-title">{userSettings.lang === 'es' ? 'Logros y Medallas Deportivas' : 'Sporting Achievements & Medals'}</h3>
                <p className="section-subtitle">
                  {userSettings.lang === 'es' ? 'Completa carreras y supera los retos urbanos para ganar medallas únicas.' : 'Complete runs and conquer urban challenges to unlock unique badges.'}
                </p>
                <div className="medals-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginTop: '14px' }}>
                  {ACHIEVEMENTS.map(ach => {
                    const isUnlocked = ach.check({
                      globalLines: globalCompletedCount,
                      totalKm: totalKmCompleted,
                      totalElev: totalElevationGainCompleted,
                      completedKeys: completedKeys
                    });
                    return (
                      <div 
                        key={ach.id} 
                        style={{
                          background: isUnlocked ? 'rgba(37, 99, 235, 0.08)' : 'rgba(255,255,255,0.02)',
                          border: isUnlocked ? '1px solid rgba(37, 99, 235, 0.3)' : '1px solid rgba(255,255,255,0.05)',
                          borderRadius: '12px',
                          padding: '16px 12px',
                          textAlign: 'center',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '6px',
                          opacity: isUnlocked ? 1 : 0.45,
                          transition: 'all 0.3s ease'
                        }}
                      >
                        <span style={{ fontSize: '2.2rem', marginBottom: '4px' }}>{isUnlocked ? ach.icon : '🔒'}</span>
                        <h4 style={{ margin: 0, fontSize: '0.8rem', color: isUnlocked ? 'white' : '#94a3b8', fontWeight: 'bold' }}>
                          {userSettings.lang === 'es' ? ach.titleEs : ach.titleEn}
                        </h4>
                        <p style={{ margin: 0, fontSize: '0.65rem', color: '#cbd5e1', lineHeight: '1.3' }}>
                          {userSettings.lang === 'es' ? ach.descEs : ach.descEn}
                        </p>
                        <span style={{ 
                          fontSize: '0.6rem', 
                          fontWeight: 'bold', 
                          color: isUnlocked ? '#34d399' : '#94a3b8',
                          background: isUnlocked ? 'rgba(52, 211, 153, 0.1)' : 'rgba(255,255,255,0.05)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          marginTop: '4px'
                        }}>
                          {isUnlocked ? (userSettings.lang === 'es' ? '🏆 Desbloqueado' : '🏆 Unlocked') : (userSettings.lang === 'es' ? 'Bloqueado' : 'Locked')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* GPX Verification Sandbox */}
              <div className="gpx-sandbox-layout">
                <section className="gpx-uploader-section">
                  <h3>Sube tu Actividad (.gpx)</h3>
                  <p className="gpx-help">
                    Importa un archivo GPX grabado por tu reloj. El sistema autodetectará de forma inteligente qué línea de autobús has recorrido (se requiere un 70% de paradas visitadas). Si no coincide con ninguna, se guardará como un rodaje libre.
                  </p>

                  <div className="uploader-controls">
                    <div className="type-toggle-uploader">
                      <label>Actividad: </label>
                      <button 
                        className={uploadActivityType === 'running' ? 'active' : ''} 
                        onClick={() => setUploadActivityType('running')}
                      >
                        🏃‍♂️ Corriendo
                      </button>
                      <button 
                        className={uploadActivityType === 'walking' ? 'active' : ''} 
                        onClick={() => setUploadActivityType('walking')}
                      >
                        🚶‍♂️ Caminando
                      </button>
                    </div>

                    <div className="uploader-buttons">
                      <input 
                        type="file" 
                        accept=".gpx" 
                        ref={fileInputRef} 
                        style={{ display: 'none' }}
                        onChange={handleGpxUpload}
                      />
                      <button 
                        className="btn-select-file"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        📁 Seleccionar GPX
                      </button>

                      <button 
                        className="btn-sim-gpx card-glow"
                        onClick={generateSimulatedGpxRun}
                      >
                        ⚙️ Generar Actividad Simulada
                      </button>
                    </div>
                  </div>

                  {gpxResult && (
                    <div className={`gpx-result-banner ${gpxResult.success ? 'success' : 'fail'}`}>
                      <div className="icon">{gpxResult.success ? '✅' : '❌'}</div>
                      <div className="text">
                        <h4>{gpxResult.success ? '¡Actividad Aprobada!' : 'Verificación Fallida'}</h4>
                        <p>{gpxResult.msg}</p>
                      </div>
                    </div>
                  )}
                </section>

                <section className="profile-history-section">
                  <h3>Historial de Trayectos Completados</h3>
                  <div className="history-list">
                    {completedKeys.length > 0 ? (
                      completedKeys.map((key) => {
                        const [city, ref] = key.split('_');
                        const item = completed[key];
                        if (city === 'burgos') {
                          const line = burgosBusLines.find(l => l.ref === ref);
                          if (!line) return null;
                          const paceMin = (item.timeSeconds / line.distanceKm) / 60;
                          const medal = paceMin < 4.5 
                            ? { icon: '🥇', label: userSettings.lang === 'es' ? 'Oro' : 'Gold' }
                            : paceMin < 5.5
                            ? { icon: '🥈', label: userSettings.lang === 'es' ? 'Plata' : 'Silver' }
                            : { icon: '🥉', label: userSettings.lang === 'es' ? 'Bronce' : 'Bronze' };
                          return (
                            <div key={key} className="history-item">
                              <div className="left-side">
                                <span className="badge-ref">{line.ref}</span>
                                <div className="name-box">
                                  <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                    Línea {line.ref} (Burgos)
                                    <span title={`Medalla de ${medal.label} (Ritmo: ${formatDuration(item.timeSeconds / line.distanceKm)}/km)`} style={{ cursor: 'help' }}>
                                      {medal.icon}
                                    </span>
                                  </strong>
                                  <span>Cualquier sentido · Completado el {item.date}</span>
                                </div>
                              </div>
                              <div className="right-side" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div>
                                  <span className="l">Distancia</span>
                                  <span className="v">{line.distanceKm.toFixed(2)} km</span>
                                </div>
                                <div>
                                  <span className="l">Ritmo</span>
                                  <span className="v">{formatDuration(item.timeSeconds / line.distanceKm)}/km</span>
                                </div>
                                <div>
                                  <span className="l">Precisión</span>
                                  <span className="v">{item.matchPercent.toFixed(0)}%</span>
                                </div>
                                <button 
                                  onClick={() => handleDeleteCompleted(key)}
                                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '4px' }}
                                  title="Eliminar de mi historial"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                          );
                        }
                        const mockDist = 6.8;
                        const mockPaceMin = (item.timeSeconds / mockDist) / 60;
                        const mockMedal = mockPaceMin < 4.5 
                          ? { icon: '🥇', label: userSettings.lang === 'es' ? 'Oro' : 'Gold' }
                          : mockPaceMin < 5.5
                          ? { icon: '🥈', label: userSettings.lang === 'es' ? 'Plata' : 'Silver' }
                          : { icon: '🥉', label: userSettings.lang === 'es' ? 'Bronce' : 'Bronze' };
                        return (
                          <div key={key} className="history-item">
                            <div className="left-side">
                              <span className="badge-ref">M06</span>
                              <div className="name-box">
                                <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                  Línea 6 Circular (Metro Madrid)
                                  <span title={`Medalla de ${mockMedal.label} (Ritmo: ${formatDuration(item.timeSeconds / mockDist)}/km)`} style={{ cursor: 'help' }}>
                                    {mockMedal.icon}
                                  </span>
                                </strong>
                                <span>Madrid · Completado el {item.date}</span>
                              </div>
                            </div>
                            <div className="right-side" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                              <div>
                                <span className="l">Distancia</span>
                                <span className="v">{mockDist} km</span>
                              </div>
                              <div>
                                <span className="l">Ritmo</span>
                                <span className="v">{formatDuration(item.timeSeconds / mockDist)}/km</span>
                              </div>
                              <div>
                                <span className="l">Precisión</span>
                                <span className="v">100%</span>
                              </div>
                              <button 
                                onClick={() => handleDeleteCompleted(key)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '4px' }}
                                title="Eliminar de mi historial"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="no-history">Completa tu primera línea trotando o sincronizando tu cuenta de Strava.</p>
                    )}
                  </div>
                </section>
              </div>

              {/* Buy Me A Coffee Contribution Banner */}
              <div style={{
                background: 'rgba(252, 82, 0, 0.08)',
                border: '1px solid rgba(252, 82, 0, 0.25)',
                borderRadius: '16px',
                padding: '20px',
                textAlign: 'center',
                marginTop: '24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '20px'
              }}>
                <div style={{ fontSize: '2rem' }}>☕</div>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', color: 'white' }}>¿Te gusta MetroMile?</h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#cbd5e1', lineHeight: '1.4', maxWidth: '380px' }}>
                    Este es un proyecto open-source de carrera urbana. Si quieres apoyar el coste de servidores y el desarrollo, ¡invítame a un café!
                  </p>
                </div>
                <a 
                  href="https://buymeacoffee.com/felixmetromile" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: '#FFDD00',
                    color: '#000000',
                    padding: '10px 18px',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    fontSize: '0.85rem',
                    textDecoration: 'none',
                    boxShadow: '0 4px 12px rgba(255, 221, 0, 0.2)',
                    cursor: 'pointer'
                  }}
                >
                  🟡 Invítame a un café
                </a>
              </div>
            </div>
          )}

          {/* Search Tab (Lupa icon) */}
          {activeTab === 'search' && (
            <div className="search-tab-layout">
              <div className="search-bar-header">
                <h3>Buscar Atletas de la Comunidad</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '12px' }}>
                  Encuentra y sigue a otros corredores urbanos de tu ciudad para ver su progreso y actividades.
                </p>
                <div className="search-input-box">
                  <input 
                    type="text" 
                    placeholder="Buscar atleta por nombre o rango..."
                    value={athleteSearchQuery}
                    onChange={(e) => setAthleteSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* Recommendations Section */}
              {recommendedAthletes.length > 0 && !athleteSearchQuery && (
                <div className="recommended-athletes-section" style={{ marginBottom: '24px' }}>
                  <h4 style={{ color: 'var(--brand-orange)', marginBottom: '12px', fontSize: '0.95rem', fontWeight: 'bold' }}>✨ Recomendados por tus seguidos:</h4>
                  <div className="athletes-results-grid" style={{ marginBottom: '24px' }}>
                    {recommendedAthletes.map((ath) => {
                      const isFav = !!favoriteAthletes[ath.id];
                      return (
                        <div key={ath.id} className="athlete-card recommended-card" style={{ cursor: 'pointer', border: '1px dashed rgba(252, 82, 0, 0.4)', background: 'rgba(252, 82, 0, 0.05)' }} onClick={() => setSelectedAthleteId(ath.id)}>
                          {renderAvatar(ath.avatar, 'athlete-avatar')}
                          <div className="athlete-meta">
                            <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {ath.name}
                              {isFav && <span style={{ fontSize: '0.8rem' }}>⭐</span>}
                            </strong>
                            <span className="rank">{ath.rankName} ({ath.pct}%)</span>
                            <span className="stats">{ath.lines} líneas completadas · {ath.km} km</span>
                            <span style={{ fontSize: '0.65rem', color: '#ff8a50', marginTop: '4px', fontStyle: 'italic' }}>Seguido por tus seguidos</span>
                          </div>
                          <button 
                            className={`btn-follow-athlete ${followedAthletes[ath.id] ? 'following' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleFollow(ath.id, ath.name);
                            }}
                          >
                            {followedAthletes[ath.id] ? 'Siguiendo' : 'Seguir'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <h4 style={{ marginBottom: '12px', fontSize: '0.95rem', fontWeight: 'bold', color: 'white' }}>Todos los Atletas:</h4>
              <div className="athletes-results-grid">
                {activeAthletesList.filter(ath => ath.name.toLowerCase().includes(athleteSearchQuery.toLowerCase()) || ath.rankName.toLowerCase().includes(athleteSearchQuery.toLowerCase())).map((ath) => {
                  const isFav = !!favoriteAthletes[ath.id];
                  return (
                    <div key={ath.id} className="athlete-card" style={{ cursor: 'pointer' }} onClick={() => setSelectedAthleteId(ath.id)}>
                      {renderAvatar(ath.avatar, 'athlete-avatar')}
                      <div className="athlete-meta">
                        <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {ath.name}
                          {isFav && <span style={{ fontSize: '0.8rem' }}>⭐</span>}
                        </strong>
                        <span className="rank">{ath.rankName} ({ath.pct}%)</span>
                        <span className="stats">{ath.lines} líneas completadas · {ath.km} km</span>
                      </div>
                      <button 
                        className={`btn-follow-athlete ${followedAthletes[ath.id] ? 'following' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleFollow(ath.id, ath.name);
                        }}
                      >
                        {followedAthletes[ath.id] ? 'Siguiendo' : 'Seguir'}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div 
                style={{ 
                  marginTop: '30px', 
                  padding: '16px', 
                  borderRadius: '12px', 
                  background: 'rgba(255,255,255,0.02)', 
                  border: '1px solid rgba(255,255,255,0.05)', 
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>🗺️</span>
                <strong style={{ fontSize: '0.9rem', color: 'white' }}>{t('city_not_found')}</strong>
                <button
                  onClick={() => setCityRequestModal(true)}
                  style={{
                    background: 'var(--brand-orange)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontWeight: 'bold',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    transition: 'transform 0.2s'
                  }}
                >
                  ➕ {t('request_city')}
                </button>
              </div>
            </div>
          )}
        </main>
      )}

      {/* Live GPS Tracking HUD Overlay */}
      {isRecording && (
        <div className="login-modal-overlay" style={{ zIndex: 999999 }}>
          <div className="login-modal-card" style={{ width: '100%', maxWidth: '450px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--brand-orange)', animation: 'pulse 1.5s infinite' }}>
                🔴 GRABANDO EN VIVO {isPaused && "(PAUSADO)"}
              </span>
              <span className="watch-badge" style={{ background: 'rgba(255,255,255,0.1)', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px' }}>
                {recordingType === 'running' ? '🏃 Carrera' : '🚶 Paseo'}
              </span>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', textAlign: 'center', margin: '16px 0', background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '12px' }}>
              <div>
                <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)' }}>Tiempo</span>
                <strong style={{ fontSize: '1.2rem', color: 'white' }}>{formatDuration(recordingSeconds)}</strong>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)' }}>Distancia</span>
                <strong style={{ fontSize: '1.2rem', color: 'white' }}>{recordingDistance.toFixed(2)} km</strong>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)' }}>Ritmo</span>
                <strong style={{ fontSize: '1.2rem', color: 'white' }}>
                  {recordingDistance > 0 
                    ? `${formatDuration(Math.round(recordingSeconds / recordingDistance))}/km`
                    : '0:00/km'}
                </strong>
              </div>
            </div>

            {/* GPS Tracker Live Map */}
            <div style={{ height: '220px', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', position: 'relative', zIndex: 1, marginBottom: '16px', cursor: 'pointer' }} onClick={() => setActiveTab('map')}>
              <MapContainer 
                center={userLocation || [42.3431, -3.7009]} 
                zoom={15} 
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
              >
                <TileLayer
                  attribution='&copy; OpenStreetMap'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {recordingCoords.length > 0 && (
                  <Polyline positions={recordingCoords} color="#fc5200" weight={6} opacity={0.9} />
                )}
                {userLocation && (
                  <Marker position={userLocation} icon={userIcon} />
                )}
                {userLocation && <MapViewController center={userLocation} zoom={15} />}
              </MapContainer>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={pauseRecording} 
                style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', fontWeight: 'bold', background: isPaused ? 'var(--accent-green)' : '#f59e0b', color: 'white', cursor: 'pointer' }}
              >
                {isPaused ? '▶️ Reanudar' : '⏸️ Pausar'}
              </button>
              <button 
                onClick={stopAndSaveRecording} 
                style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', fontWeight: 'bold', background: 'var(--brand-orange)', color: 'white', cursor: 'pointer' }}
              >
                💾 Guardar
              </button>
              <button 
                onClick={cancelRecording} 
                style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #777', fontWeight: 'bold', background: 'transparent', color: '#ccc', cursor: 'pointer' }}
              >
                ❌ Descartar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Tutorial Modal */}
      {tutorialStep !== null && (
        <div className="login-modal-overlay" style={{ zIndex: 9999999 }}>
          <div className="login-modal-card" style={{ width: '100%', maxWidth: '420px', padding: '24px', textAlign: 'center', position: 'relative' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--brand-orange)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Tutorial de Bienvenida ({tutorialStep}/5)
            </span>
            
            {tutorialStep === 1 && (
              <div>
                <div style={{ fontSize: '3rem', margin: '16px 0' }}>⚡</div>
                <h3>¡Bienvenido/a a MetroMile!</h3>
                <p style={{ margin: '12px 0 20px 0', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.5' }}>
                  MetroMile es la red social deportiva de corredores urbanos. Tu misión es <strong>completar las líneas de transporte urbano</strong> corriendo o caminando por su trazado de paradas.
                </p>
              </div>
            )}

            {tutorialStep === 2 && (
              <div>
                <div style={{ fontSize: '3rem', margin: '16px 0' }}>🏆</div>
                <h3>Progresión y Rango Global</h3>
                <p style={{ margin: '12px 0 20px 0', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.5' }}>
                  Cada línea completada suma porcentaje a tu progresión. Pasa de ser un simple <strong>Transeúnte (0%)</strong> hasta el legendario <strong>Leyenda del Tránsito (100%)</strong>.
                </p>
              </div>
            )}

            {tutorialStep === 3 && (
              <div>
                <div style={{ fontSize: '3rem', margin: '16px 0' }}>🧡</div>
                <h3>Sincronizar con Strava</h3>
                <p style={{ margin: '12px 0 20px 0', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.5' }}>
                  Vincula tu cuenta de <strong>Strava</strong> desde tu perfil. Cualquier actividad que grabes con tu reloj Garmin, Apple Watch, Polar, Suunto o móvil se sincronizarán automáticamente y validarán tu recorrido.
                </p>
              </div>
            )}

            {tutorialStep === 4 && (
              <div>
                <div style={{ fontSize: '3rem', margin: '16px 0' }}>📡</div>
                <h3>GPS en Vivo y Simulador</h3>
                <p style={{ margin: '12px 0 20px 0', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.5' }}>
                  ¿No tienes reloj? ¡Graba tu actividad en tiempo real con el GPS del móvil en el feed, o usa el <strong>simulador en vivo</strong> para probar cómo funciona desde casa!
                </p>
              </div>
            )}

            {tutorialStep === 5 && (
              <div>
                <div style={{ fontSize: '3rem', margin: '16px 0' }}>🗺️</div>
                <h3>Mapa e Hitos Unificados</h3>
                <p style={{ margin: '12px 0 20px 0', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.5' }}>
                  En la pestaña Mapa puedes seleccionar cualquier línea, cambiar de sentido y ver la checklist de paradas completadas en tiempo real. ¡Disfruta de la experiencia urbana!
                </p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '20px' }}>
              {tutorialStep > 1 ? (
                <button 
                  onClick={() => setTutorialStep(s => s ? s - 1 : 1)}
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #777', background: 'transparent', color: '#ccc', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Atrás
                </button>
              ) : (
                <button 
                  onClick={() => {
                    localStorage.setItem('busrun-tutorial-seen', 'true');
                    setTutorialStep(null);
                  }}
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: 'transparent', color: '#94a3b8', fontSize: '0.8rem', cursor: 'pointer' }}
                >
                  Omitir
                </button>
              )}

              {tutorialStep < 5 ? (
                <button 
                  onClick={() => setTutorialStep(s => s ? s + 1 : 5)}
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: 'var(--brand-orange)', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Siguiente
                </button>
              ) : (
                <button 
                  onClick={() => {
                    localStorage.setItem('busrun-tutorial-seen', 'true');
                    setTutorialStep(null);
                    addNotification('Social', '¡Tutorial visto! Todo listo para empezar.', 'success');
                  }}
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: 'var(--accent-green)', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  ¡Entendido! ⚔️
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* User Configurations Settings Modal */}
      {showSettingsModal && (
        <div className="login-modal-overlay" style={{ zIndex: 999999 }}>
          <div className="login-modal-card" style={{ width: '100%', maxWidth: '500px', padding: '24px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 16px 0', fontSize: '1.25rem' }}>
              <Icons.Gear style={{ width: '22px', height: '22px', color: 'var(--brand-orange)' }} />
              Configuración y Preferencias
            </h3>
            
            {/* Tabs inside settings modal */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '16px', overflowX: 'auto', gap: '4px', whiteSpace: 'nowrap', paddingBottom: '4px' }}>
              <button 
                onClick={() => setSettingsActiveTab('profile')}
                style={{
                  flex: 1,
                  padding: '10px 6px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: settingsActiveTab === 'profile' ? '2px solid var(--brand-orange)' : 'none',
                  color: settingsActiveTab === 'profile' ? 'var(--brand-orange)' : '#ccc',
                  fontWeight: 'bold',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Icons.Profile style={{ width: '14px', height: '14px' }} /> Perfil
              </button>
              <button 
                onClick={() => setSettingsActiveTab('preferences')}
                style={{
                  flex: 1,
                  padding: '10px 6px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: settingsActiveTab === 'preferences' ? '2px solid var(--brand-orange)' : 'none',
                  color: settingsActiveTab === 'preferences' ? 'var(--brand-orange)' : '#ccc',
                  fontWeight: 'bold',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Icons.Gear style={{ width: '14px', height: '14px' }} /> Ajustes
              </button>
              <button 
                onClick={() => setSettingsActiveTab('devices')}
                style={{
                  flex: 1,
                  padding: '10px 6px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: settingsActiveTab === 'devices' ? '2px solid var(--brand-orange)' : 'none',
                  color: settingsActiveTab === 'devices' ? 'var(--brand-orange)' : '#ccc',
                  fontWeight: 'bold',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Icons.Link style={{ width: '14px', height: '14px' }} /> Enlaces
              </button>
              <button 
                onClick={() => setSettingsActiveTab('info')}
                style={{
                  flex: 1,
                  padding: '10px 6px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: settingsActiveTab === 'info' ? '2px solid var(--brand-orange)' : 'none',
                  color: settingsActiveTab === 'info' ? 'var(--brand-orange)' : '#ccc',
                  fontWeight: 'bold',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Icons.Info style={{ width: '14px', height: '14px' }} /> Legal & Soporte
              </button>
            </div>

            {/* Tab 1: Profile Edit & Google Authenticate */}
            {settingsActiveTab === 'profile' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '4px', color: '#cbd5e1' }}>Nombre de Perfil:</label>
                  <input 
                    type="text" 
                    value={userProfile.name} 
                    onChange={(e) => handleProfileChange('name', e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: '#222', color: 'white', fontSize: '0.9rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '4px', color: '#cbd5e1' }}>Biografía:</label>
                  <textarea 
                    value={userProfile.bio} 
                    onChange={(e) => handleProfileChange('bio', e.target.value)}
                    rows={3}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: '#222', color: 'white', fontSize: '0.85rem', resize: 'vertical' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '4px', color: '#cbd5e1' }}>Foto de Perfil (Emoji):</label>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
                    {['🏃‍♂️', '🏃‍♀️', '🚶‍♂️', '🚶‍♀️', '⚡', '👑', '👤', '🚴‍♂️', '🥇', '🌟'].map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => handleProfileChange('avatar', emoji)}
                        style={{
                          fontSize: '1.2rem',
                          background: userProfile.avatar === emoji ? 'var(--brand-orange)' : 'rgba(255,255,255,0.1)',
                          border: 'none',
                          borderRadius: '8px',
                          width: '36px',
                          height: '36px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'background 0.2s'
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '8px 0' }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#cbd5e1' }}>Conexión con Google</span>
                  
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                    <label style={{ fontSize: '0.7rem', color: '#cbd5e1', fontWeight: 'bold' }}>Google OAuth Client ID:</label>
                    <input 
                      type="text" 
                      value={googleClientId} 
                      onChange={(e) => {
                        setGoogleClientId(e.target.value);
                        localStorage.setItem('busrun-google-client-id', e.target.value);
                      }}
                      placeholder="Pega tu Google Client ID aquí"
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.15)',
                        background: '#222',
                        color: 'white',
                        fontSize: '0.75rem'
                      }}
                    />
                  </div>

                  {userProfile.loggedIn ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.8rem', color: '#10b981' }}>✓ Conectado como <strong>{userProfile.email}</strong></span>
                      <button 
                        onClick={handleLogout}
                        style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '6px', border: '1px solid #ff4d4d', color: '#ff4d4d', background: 'transparent', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        Cerrar Sesión Google
                      </button>
                    </div>
                  ) : (
                    <div id="google-signin-btn-real" style={{ margin: '6px 0', display: 'flex', justifyContent: 'center' }}></div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 2: Strava Integration */}
            {settingsActiveTab === 'devices' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left', marginBottom: '20px' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                  Vincula tu cuenta de Strava para sincronizar automáticamente tus carreras GPS (compatible con Garmin, Polar, Suunto, Coros y más).
                </p>
                
                <div style={{ background: 'rgba(252, 82, 0, 0.05)', border: '1px solid rgba(252, 82, 0, 0.15)', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🧡 Strava Sync
                  </span>
                  
                  {stravaConfig.connected ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 'bold' }}>
                        ✓ Conectado como @{stravaConfig.athleteName} (ID: {stravaConfig.athleteId})
                      </span>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <button
                          onClick={handleSyncStrava}
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            background: 'var(--brand-orange)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 'bold',
                            fontSize: '0.75rem',
                            cursor: 'pointer'
                          }}
                        >
                          🔄 Sincronizar Actividades
                        </button>
                        <button
                          onClick={handleDisconnectStrava}
                          style={{
                            padding: '8px 12px',
                            background: 'transparent',
                            color: '#ef4444',
                            border: '1px solid #ef4444',
                            borderRadius: '8px',
                            fontWeight: 'bold',
                            fontSize: '0.75rem',
                            cursor: 'pointer'
                          }}
                        >
                          Desvincular
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                        Vincula tu cuenta de Strava para sincronizar de manera automática tus rodajes en Burgos.
                      </p>

                      <button
                        onClick={handleConnectStrava}
                        style={{
                          background: 'linear-gradient(135deg, #fc5200, #ff7e40)',
                          color: 'white',
                          border: 'none',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          fontWeight: 'bold',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          marginTop: '4px'
                        }}
                      >
                        🧡 Vincular cuenta de Strava
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 3: App Preferences & Privacy */}
            {settingsActiveTab === 'preferences' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '4px', color: '#cbd5e1' }}>Ciudad Activa:</label>
                  <select 
                    value={activeCity}
                    onChange={(e) => {
                      const selectedVal = e.target.value;
                      setActiveCity(selectedVal);
                      const city = citiesList.find(c => c.id === selectedVal);
                      if (city && city.transports && city.transports.length > 0) {
                        setActiveTransport(city.transports[0]);
                      }
                    }}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', background: '#333', color: 'white', border: '1px solid #555', fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    {citiesList.map(city => (
                      <option key={city.id} value={city.id}>{city.name} ({city.country})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '4px', color: '#cbd5e1' }}>Medio de Transporte:</label>
                  <select 
                    value={activeTransport}
                    onChange={(e) => setActiveTransport(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', background: '#333', color: 'white', border: '1px solid #555', fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    {citiesList.find(c => c.id === activeCity)?.transports.map(t => (
                      <option key={t} value={t}>
                        {t === 'bus' ? 'Autobús Urbano' : t === 'metro' ? 'Metro' : t === 'tram' ? 'Tranvía' : t === 'light_rail' ? 'Metro Ligero' : t.toUpperCase()}
                      </option>
                    )) || (
                      <option value="bus">Autobús Urbano</option>
                    )}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '4px', color: '#cbd5e1' }}>Privacidad del Perfil:</label>
                  <select 
                    value={userSettings.privacy}
                    onChange={(e) => saveSettings({ ...userSettings, privacy: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', background: '#333', color: 'white', border: '1px solid #555', fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    <option value="public">Público (Cualquiera ve mi historial)</option>
                    <option value="followers">Solo Seguidores (Solo mis seguidores ven detalles)</option>
                    <option value="private">Privado (Solo yo veo mis detalles)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '4px', color: '#cbd5e1' }}>Unidad de Medida:</label>
                  <select 
                    value={userSettings.unit}
                    onChange={(e) => saveSettings({ ...userSettings, unit: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', background: '#333', color: 'white', border: '1px solid #555', fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    <option value="km">Kilómetros (km)</option>
                    <option value="mi">Millas (mi)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '4px', color: '#cbd5e1' }}>Idioma (Language):</label>
                  <select 
                    value={userSettings.lang || 'es'}
                    onChange={(e) => saveSettings({ ...userSettings, lang: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', background: '#333', color: 'white', border: '1px solid #555', fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    <option value="es">Español (ES)</option>
                    <option value="en">English (EN)</option>
                    <option value="fr">Français (FR)</option>
                    <option value="de">Deutsch (DE)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '4px', color: '#cbd5e1' }}>Notificaciones de Actividad:</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={userSettings.notifyFollows} 
                        onChange={(e) => saveSettings({ ...userSettings, notifyFollows: e.target.checked })} 
                      />
                      Avisar cuando me siga un atleta nuevo
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={userSettings.notifyComments} 
                        onChange={(e) => saveSettings({ ...userSettings, notifyComments: e.target.checked })} 
                      />
                      Avisar sobre nuevos comentarios
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={userSettings.notifyLikes} 
                        onChange={(e) => saveSettings({ ...userSettings, notifyLikes: e.target.checked })} 
                      />
                      Avisar cuando le den Me Gusta
                    </label>
                  </div>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '12px 0' }} />
                
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📱 {isStandalone ? '✓ Aplicación Instalada' : 'Descargar / Instalar App'}
                  </span>
                  {isStandalone ? (
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#10b981', lineHeight: '1.4' }}>
                      Estás ejecutando MetroMile en modo aplicación a pantalla completa. ¡Excelente!
                    </p>
                  ) : (
                    <>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                        Instala MetroMile en tu teléfono para correr a pantalla completa, sin la barra de direcciones del navegador y con GPS optimizado.
                      </p>
                      <button
                        onClick={handleInstallPwa}
                        style={{
                          background: 'linear-gradient(135deg, #ff7e40, var(--brand-orange))',
                          color: 'white',
                          border: 'none',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          fontWeight: 'bold',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          transition: 'transform 0.2s',
                          marginTop: '4px'
                        }}
                      >
                        📥 Instalar Aplicación
                      </button>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px', marginTop: '4px' }}>
                        <div style={{ marginBottom: '4px' }}><strong>iOS (Safari):</strong> Pulsa Compartir 📤 y luego <strong>"Añadir a la pantalla de inicio"</strong> ➕.</div>
                        <div><strong>Android (Chrome):</strong> Pulsa "Instalar" arriba o el menú ⫶ y <strong>"Instalar aplicación"</strong>.</div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Tab 4: Legal, Soporte, Licencias, Quienes somos */}
            {settingsActiveTab === 'info' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left', marginBottom: '20px', maxHeight: '350px', overflowY: 'auto', paddingRight: '6px' }}>
                
                {/* Quienes Somos */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '14px' }}>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '0.9rem', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Icons.Profile style={{ width: '16px', height: '16px' }} /> ¿Quiénes Somos?
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                    <strong>MetroMile</strong> es un proyecto nacido de la pasión por el running urbano y la movilidad sostenible. Conectamos a deportistas de todo el mundo para retar a las líneas de transporte público locales: metros, autobuses y tranvías. ¡Conviértete en la leyenda del transporte subterráneo y terrestre de tu ciudad!
                  </p>
                </div>

                {/* Soporte y Contacto */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '14px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Icons.Phone style={{ width: '14px', height: '14px' }} /> Contacto y Soporte
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.75rem', color: '#cbd5e1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icons.Mail style={{ color: '#10b981', width: '16px', height: '16px' }} />
                      <span>Email: <a href="mailto:support@metromile.app" style={{ color: '#34d399', textDecoration: 'none' }}>support@metromile.app</a></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icons.Phone style={{ color: '#10b981', width: '16px', height: '16px' }} />
                      <span>Teléfono: <a href="tel:+34900123456" style={{ color: '#34d399', textDecoration: 'none' }}>+34 900 123 456</a> (L-V 9:00 - 18:00 CET)</span>
                    </div>
                  </div>
                </div>

                {/* Privacidad */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '14px' }}>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '0.9rem', color: '#fb7185', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Icons.Shield style={{ width: '16px', height: '16px' }} /> Privacidad
                  </h4>
                  <p style={{ margin: '0 0 6px 0', fontSize: '0.75rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                    Cumplimos estrictamente con el <strong>RGPD</strong> de la UE y la <strong>CCPA</strong> de California. Tus datos de geolocalización solo se procesan localmente en tu dispositivo para validar las rutas de transporte en las que corres y no son comercializados con terceros.
                  </p>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                    • Tienes derecho a exportar tus actividades en formato GPX/FIT.<br />
                    • Puedes eliminar tu cuenta de forma permanente desde tu perfil en cualquier momento.
                  </div>
                </div>

                {/* Términos Legales y Licencias */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '14px' }}>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '0.9rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Icons.Info style={{ width: '16px', height: '16px' }} /> Términos y Licencias
                  </h4>
                  <p style={{ margin: '0 0 8px 0', fontSize: '0.75rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                    Al utilizar MetroMile aceptas que no somos responsables de incidentes ocurridos durante tus carreras. Corre siempre por zonas habilitadas para peatones y respeta las normas de tráfico.
                  </p>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '6px' }}>
                    <strong>Licencias de Código Abierto:</strong><br />
                    • Licencia MIT (c) 2026 MetroMile Team.<br />
                    • React, TypeScript, Vite, Leaflet Maps (BSD 2-Clause), Supabase SDK.
                  </div>
                </div>

              </div>
            )}

            <button 
              className="btn-close-modal" 
              onClick={() => {
                setShowSettingsModal(false);
                addNotification('Ajustes', 'Configuración guardada correctamente.', 'success');
              }}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'var(--brand-orange)', color: 'white', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
            >
              Guardar y Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Canvas Share Card Modal */}
      {selectedShareActivity && (
        <div className="login-modal-overlay" style={{ zIndex: 9999999 }}>
          <div className="login-modal-card" style={{ width: '100%', maxWidth: '440px', padding: '20px', textAlign: 'center' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', margin: '0 0 8px 0' }}>
              <Icons.Info style={{ width: '20px', height: '20px', color: '#10b981' }} />
              {t('share_card_title')}
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: '#cbd5e1' }}>
              {t('share_card_descr')}
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', background: '#05070b', padding: '10px', borderRadius: '12px', marginBottom: '16px' }}>
              <canvas 
                id="share-canvas" 
                width="400" 
                height="500" 
                style={{ maxWidth: '100%', height: 'auto', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={() => {
                  const canvas = document.getElementById('share-canvas') as HTMLCanvasElement;
                  if (canvas) {
                    const link = document.createElement('a');
                    link.download = `MetroMile-${selectedShareActivity.lineRef}-${Date.now()}.png`;
                    link.href = canvas.toDataURL();
                    link.click();
                    addNotification('MetroMile', userSettings.lang === 'es' ? '¡Imagen descargada!' : 'Image downloaded!', 'success');
                  }
                }}
                style={{
                  flex: 2,
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'var(--brand-orange)',
                  color: 'white',
                  fontWeight: 'bold',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                📥 {t('download_image')}
              </button>
              <button 
                onClick={() => setSelectedShareActivity(null)}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid #555',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                {userSettings.lang === 'es' ? 'Cerrar' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* City Request Modal */}
      {cityRequestModal && (
        <div className="login-modal-overlay" style={{ zIndex: 999999 }}>
          <div className="login-modal-card" style={{ width: '100%', maxWidth: '380px', padding: '24px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 10px 0', fontSize: '1.1rem' }}>
              <Icons.Map style={{ width: '18px', height: '18px', color: 'var(--brand-orange)' }} />
              {t('city_not_found')}
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.75rem', color: '#cbd5e1', lineHeight: '1.4' }}>
              {userSettings.lang === 'es' 
                ? 'Indica el nombre de la ciudad y país que deseas agregar. Extraeremos sus líneas de transporte público en nuestra base de datos.'
                : 'Enter the city and country you would like us to add. We will extract its transit lines into our global database.'}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '4px', color: '#cbd5e1' }}>
                  {userSettings.lang === 'es' ? 'Ciudad:' : 'City:'}
                </label>
                <input 
                  type="text" 
                  value={requestCityName} 
                  onChange={(e) => setRequestCityName(e.target.value)}
                  placeholder="ej. Barcelona, San Francisco..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: '#222', color: 'white', fontSize: '0.85rem' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '4px', color: '#cbd5e1' }}>
                  {userSettings.lang === 'es' ? 'País:' : 'Country:'}
                </label>
                <input 
                  type="text" 
                  value={requestCountryName} 
                  onChange={(e) => setRequestCountryName(e.target.value)}
                  placeholder="ej. España, USA..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: '#222', color: 'white', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={async () => {
                  if (!requestCityName || !requestCountryName) return;
                  
                  if (supabase && userProfile.loggedIn) {
                    try {
                      await supabase.from('city_requests').insert({
                        user_id: userProfile.id,
                        city_name: requestCityName,
                        country: requestCountryName,
                        created_at: new Date().toISOString()
                      });
                    } catch(e) {}
                  }
                  
                  addNotification('MetroMile', t('city_requested'), 'success');
                  setCityRequestModal(false);
                  setRequestCityName('');
                  setRequestCountryName('');
                }}
                style={{
                  flex: 2,
                  padding: '10px',
                  borderRadius: '8px',
                  background: 'var(--brand-orange)',
                  color: 'white',
                  fontWeight: 'bold',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
              >
                {t('request_city')}
              </button>
              <button 
                onClick={() => {
                  setCityRequestModal(false);
                  setRequestCityName('');
                  setRequestCountryName('');
                }}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  background: 'transparent',
                  color: '#cbd5e1',
                  border: '1px solid #555',
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
              >
                {userSettings.lang === 'es' ? 'Cancelar' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Athlete Detail Profile Popup Modal */}
      {selectedAthleteId && selectedAthlete && (
        <div className="login-modal-overlay" style={{ zIndex: 999999 }}>
          <div className="login-modal-card" style={{ width: '100%', maxWidth: '420px', padding: '24px', textAlign: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <span style={{ fontSize: '3rem', width: '70px', height: '70px', borderRadius: '50%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{selectedAthlete.avatar}</span>
              <div>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  {selectedAthlete.name}
                  {favoriteAthletes[selectedAthlete.id] && <span style={{ fontSize: '1.1rem' }}>⭐</span>}
                </h3>
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--brand-orange)' }}>
                  {selectedAthlete.rankName} ({selectedAthlete.pct}%)
                </span>
              </div>
            </div>

            <p style={{ fontSize: '0.85rem', fontStyle: 'italic', color: '#cbd5e1', marginBottom: '16px', background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px' }}>
              "{selectedAthlete.bio}"
            </p>

            {/* Check privacy rule */}
            {(() => {
              const followed = !!followedAthletes[selectedAthlete.id];
              const isPublic = selectedAthlete.privacy === 'public';
              const canView = isPublic || (selectedAthlete.privacy === 'followers' && followed);

              if (canView) {
                return (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', textAlign: 'center', marginBottom: '16px' }}>
                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '8px' }}>
                        <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)' }}>Líneas</span>
                        <strong style={{ fontSize: '1.1rem' }}>{selectedAthlete.lines}</strong>
                      </div>
                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '8px' }}>
                        <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)' }}>Distancia</span>
                        <strong style={{ fontSize: '1.1rem' }}>{selectedAthlete.km} km</strong>
                      </div>
                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '8px' }}>
                        <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)' }}>Rango</span>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--brand-orange)' }}>🛡️ Burgalés</strong>
                      </div>
                    </div>
                    
                    <div style={{ textAlign: 'left', marginBottom: '20px' }}>
                      <h4 style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#cbd5e1', marginBottom: '6px' }}>Líneas Completadas:</h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '100px', overflowY: 'auto' }}>
                        {selectedAthlete.completedRefs.map((ref: string) => (
                          <span key={ref} style={{ fontSize: '0.7rem', fontWeight: 'bold', background: 'rgba(252, 82, 0, 0.15)', color: 'var(--brand-orange)', padding: '3px 8px', borderRadius: '4px', border: '1px solid rgba(252, 82, 0, 0.25)' }}>
                            {ref}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div style={{ padding: '24px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', marginBottom: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '2rem' }}>🔒</span>
                    <strong style={{ fontSize: '0.9rem', color: 'white' }}>Perfil Privado</strong>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                      {selectedAthlete.privacy === 'followers' 
                        ? 'Sigue a este atleta para ver sus estadísticas y líneas completadas.'
                        : 'Este perfil es completamente privado.'}
                    </p>
                  </div>
                );
              }
            })()}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={() => {
                  handleToggleFollow(selectedAthlete.id, selectedAthlete.name);
                }}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: 'none',
                  fontWeight: 'bold',
                  background: followedAthletes[selectedAthlete.id] ? '#cbd5e1' : 'var(--brand-orange)',
                  color: followedAthletes[selectedAthlete.id] ? 'var(--brand-dark)' : 'white',
                  cursor: 'pointer'
                }}
              >
                {followedAthletes[selectedAthlete.id] ? 'Dejar de seguir' : 'Seguir Atleta'}
              </button>
              
              {followedAthletes[selectedAthlete.id] && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={() => {
                      const newFavs = { ...favoriteAthletes, [selectedAthlete.id]: !favoriteAthletes[selectedAthlete.id] };
                      saveFavorites(newFavs);
                    }}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #fc5200',
                      background: 'transparent',
                      color: '#fc5200',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    {favoriteAthletes[selectedAthlete.id] ? '★ Quitar Fav' : '⭐ Fav'}
                  </button>
                  <button 
                    onClick={() => {
                      setChatRecipient({ id: selectedAthlete.id, name: selectedAthlete.name });
                      setSelectedAthleteId(null);
                      setShowChatModal(true);
                    }}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #10b981',
                      background: 'transparent',
                      color: '#10b981',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    💬 Chat
                  </button>
                </div>
              )}
            </div>

            <button 
              className="btn-close-modal" 
              onClick={() => setSelectedAthleteId(null)}
              style={{ width: '100%', marginTop: '10px', background: 'transparent', border: '1px solid #555', color: '#ccc', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}
            >
              Cerrar Perfil
            </button>
          </div>
        </div>
      )}

      {/* Floating Bottom Dock Navigation */}
      <nav className="bottom-nav-bar">
        <button 
          className={`bottom-nav-item ${activeTab === 'feed' ? 'active' : ''}`}
          onClick={() => setActiveTab('feed')}
        >
          <span className="bottom-nav-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icons.Feed />
          </span>
          <span>Feed</span>
        </button>
        <button 
          className={`bottom-nav-item ${activeTab === 'map' ? 'active' : ''}`}
          onClick={() => setActiveTab('map')}
        >
          <span className="bottom-nav-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icons.Map />
          </span>
          <span>Mapa</span>
        </button>
        <button 
          className={`bottom-nav-item ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          <span className="bottom-nav-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icons.Search />
          </span>
          <span>Buscador</span>
        </button>
        <button 
          className={`bottom-nav-item ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          <span className="bottom-nav-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icons.Profile />
          </span>
          <span>Perfil</span>
        </button>
      </nav>

      {/* Floating PWA Update Available Toast */}
      {showUpdateBanner && (
        <div 
          onClick={() => window.location.reload()}
          style={{
            position: 'fixed',
            bottom: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: 'white',
            padding: '12px 20px',
            borderRadius: '30px',
            boxShadow: '0 8px 25px rgba(16, 185, 129, 0.4)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '0.85rem',
            animation: 'pulse 2s infinite',
            whiteSpace: 'nowrap'
          }}
        >
          🚀 ¡Nueva versión disponible! Toca para actualizar
        </div>
      )}

      {/* Hidden input for custom profile picture uploading */}
      <input 
        type="file" 
        ref={avatarFileInputRef} 
        onChange={handleAvatarFileChange} 
        accept="image/*" 
        style={{ display: 'none' }} 
      />
    </div>
  );
}
