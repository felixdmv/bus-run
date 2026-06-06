import { useEffect, useMemo, useState, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
const STORAGE_DEVICES_KEY = 'busrun-sync-devices-v5';

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

// Haversine distance in km
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

// Mini Leaflet Map for Feed Cards
function MiniFeedMap({ activityId, coords, color = "#fc5200" }: { activityId: string; coords: [number, number][]; color?: string }) {
  if (!coords || coords.length === 0) return null;
  const center = coords[Math.floor(coords.length / 2)];
  
  return (
    <div 
      className="activity-mini-map-wrapper"
      style={{ 
        height: '180px', 
        borderRadius: '12px', 
        overflow: 'hidden', 
        marginTop: '12px',
        border: '1px solid rgba(0,0,0,0.1)',
        position: 'relative',
        zIndex: 1
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
const BURGOS_RANKS: BurgosRank[] = [
  { id: 'dominguero', name: 'Dominguero', title: 'Explorador Dominguero', minPercentage: 0, description: 'Acabas de empezar (0%+). Trotas los domingos a ritmo suave por tu barrio.', icon: '👒' },
  { id: 'turista', name: 'Turista', title: 'Turista del Arlanzón', minPercentage: 10, description: 'Iniciando exploración (10%+). Ya te conocen por el Espolón y la Catedral.', icon: '📸' },
  { id: 'peregrino', name: 'Peregrino', title: 'Peregrino del Camino', minPercentage: 20, description: 'Progreso constante (20%+). Sigues las flechas del Camino de Santiago.', icon: '🐚' },
  { id: 'explorador', name: 'Explorador', title: 'Explorador Burgalés', minPercentage: 30, description: 'Explorando barrios (30%+). Dominas distancias medias en Gamonal y Fuentecillas.', icon: '🧭' },
  { id: 'centinela', name: 'Centinela', title: 'Centinela del Castillo', minPercentage: 40, description: 'Retos de altura (40%+). Controlas las subidas empinadas del cerro del Castillo.', icon: '🏰' },
  { id: 'comunero', name: 'Comunero', title: 'Líder Comunero', minPercentage: 50, description: 'La mitad conquistada (50%+). Lideras el asfalto en más de la mitad del mapa.', icon: '🛡️' },
  { id: 'condestable', name: 'Condestable', title: 'Condestable de Castilla', minPercentage: 60, description: 'Gobernador urbano (60%+). Tienes un control amplio de la red urbana.', icon: '📜' },
  { id: 'alcalde', name: 'Alcalde', title: 'Alcalde de la Red', minPercentage: 80, description: 'Conocimiento experto (80%+). Conoces cada parada de bus mejor que la alcaldía.', icon: '🏛️' },
  { id: 'caballero', name: 'Caballero', title: 'Caballero del Asfalto', minPercentage: 90, description: 'Cerca de la gloria (90%+). Eres admirado por todos los conductores de Burgos.', icon: '🐎' },
  { id: 'cid', name: 'Cid Campeador', title: 'Cid Campeador Legendario', minPercentage: 100, description: 'Leyenda máxima (100%). Has completado absolutamente todas las líneas de la ciudad.', icon: '⚔️' }
];

const mockAthletesList = [
  { id: 'carlos-gomez', name: 'Carlos Gómez', avatar: '🏃‍♂️', rankName: 'Explorador Burgalés', pct: 33, lines: 8, km: 58, privacy: 'public', bio: 'Me encanta explorar las rutas de Burgos a ritmo de carrera. ¡El Cid me vigila!', completedRefs: ['L01', 'L05', 'L08'] },
  { id: 'sofia-martinez', name: 'Sofía Martínez', avatar: '⚡', rankName: 'Centinela del Castillo', pct: 45, lines: 11, km: 82, privacy: 'followers', bio: 'Corredora habitual por las mañanas. La subida al castillo es mi entrenamiento preferido.', completedRefs: ['L02', 'L06', 'L11', 'L18'] },
  { id: 'marta-corredora', name: 'Marta Corredora', avatar: '🏃‍♀️', rankName: 'Caballero del Asfalto', pct: 92, lines: 23, km: 164, privacy: 'public', bio: 'Buscando el 100% de Burgos para subir a Cid Campeador. ¡Sígueme para ver mis rutas urbanas!', completedRefs: ['L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08', 'L09', 'L10', 'L12', 'L13', 'L14', 'L15'] },
  { id: 'diego-cid', name: 'Diego Cid', avatar: '⚔️', rankName: 'Cid Campeador Legendario', pct: 100, lines: 25, km: 210, privacy: 'private', bio: 'El primer Cid Campeador de la red. Completados todos los recorridos urbanos. Leyenda burgalesa.', completedRefs: ['L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08', 'L09', 'L10', 'L11', 'L12', 'L13', 'L14', 'L15', 'L16', 'L17', 'L18', 'L20', 'L21', 'L22', 'L24', 'L25', 'L28', 'L80'] }
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
  loggedIn: boolean;
  name: string;
  email: string;
  avatar: string;
  location: string;
  bio: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'feed' | 'routes' | 'map' | 'profile' | 'search'>('feed');
  const [loadedBusLines, setLoadedBusLines] = useState<LineRoute[]>([]);
  const burgosBusLines = loadedBusLines; // Keep reference to avoid breaking old variables
  const [selectedLineId, setSelectedLineId] = useState<string>('');
  
  // Completed is stored as: Record of "city_lineRef" (e.g. "burgos_L01") -> completion details
  const [completed, setCompleted] = useState<Record<string, { date: string; timeSeconds: number; type: 'running' | 'walking'; matchPercent: number }>>({});
  
  const [feedActivities, setFeedActivities] = useState<UserActivity[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'completed' | 'pending'>('all');
  const [distanceFilter, setDistanceFilter] = useState<'all' | 'short' | 'medium' | 'long'>('all');
  
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [isSimulatedLocation, setIsSimulatedLocation] = useState(false);
  const [nearbyStops, setNearbyStops] = useState<{ stop: Stop; distanceKm: number; lineRefs: string[] }[]>([]);

  // Simulation states
  const [activeCity, setActiveCity] = useState('burgos');
  const [activeTransport, setActiveTransport] = useState('bus');
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  // Google Auth Settings & Modal
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [googleClientId, setGoogleClientId] = useState(() => {
    const saved = localStorage.getItem('busrun-google-client-id');
    const legacy = '1054045580649-4l05aevhfl83k7u048e718ndg27d3h75.apps.googleusercontent.com';
    if (saved === legacy) {
      localStorage.removeItem('busrun-google-client-id');
      return '966706651177-i57a7m33pv9kck76uhe1vdc7io8hlm6v.apps.googleusercontent.com';
    }
    return saved || '966706651177-i57a7m33pv9kck76uhe1vdc7io8hlm6v.apps.googleusercontent.com';
  });
  const [userProfile, setUserProfile] = useState<UserProfile>({
    loggedIn: false,
    name: 'Atleta Anónimo',
    email: '',
    avatar: '🏃‍♂️',
    location: 'Burgos, España',
    bio: 'Atleta de transporte urbano. Conecta tus dispositivos y empieza a correr.'
  });

  // Watch Sync integration states (including Samsung and Polar)
  const [devices, setDevices] = useState<Record<string, ConnectedDevice>>({
    garmin: { connected: false },
    coros: { connected: false },
    suunto: { connected: false },
    polar: { connected: false },
    samsung: { connected: false },
    huawei: { connected: false }
  });
  const [activeOauthBrand, setActiveOauthBrand] = useState<string | null>(null);
  const [oauthStep, setOauthStep] = useState<number>(1);
  const [oauthUsername, setOauthUsername] = useState('');
  const [notifications, setNotifications] = useState<{ id: string; brand: string; msg: string; type: 'info' | 'success' }[]>([]);

  const [gpxResult, setGpxResult] = useState<{ success: boolean; msg: string; matchPercent?: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadActivityType, setUploadActivityType] = useState<'running' | 'walking'>('running');

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
    unit: 'km'
  });
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsActiveTab, setSettingsActiveTab] = useState<'profile' | 'devices' | 'preferences'>('profile');

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

    const savedDevices = localStorage.getItem(STORAGE_DEVICES_KEY);
    if (savedDevices) {
      try {
        setDevices(JSON.parse(savedDevices));
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
      try { setUserSettings(JSON.parse(settings)); } catch(e) {}
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

  // Dynamic City Route Loader with Stop Name Sanitizer
  useEffect(() => {
    const loadCityData = async () => {
      try {
        const response = await fetch(`/data/${activeCity}.json`);
        if (!response.ok) {
          throw new Error('City file not found');
        }
        const data = await response.json() as LineRoute[];
        
        // Clean stops to make sure they all have names!
        const cleaned = data.map(line => {
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
                loggedIn: true,
                name: payload.name || payload.given_name || 'Usuario Google',
                email: payload.email || '',
                avatar: payload.picture || '👤',
                location: 'Burgos, España',
                bio: 'Conectado a BusRun con Google. ¡Listo para devorar las calles!'
              };
              saveProfile(newProfile);
              addNotification('Google', `¡Sesión iniciada con éxito! Bienvenido/a, ${newProfile.name}.`, 'success');
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
  }, [showSettingsModal, showLoginModal, googleClientId]);

  const saveProgress = (newCompleted: typeof completed) => {
    setCompleted(newCompleted);
    localStorage.setItem(STORAGE_PROGRESS_KEY, JSON.stringify(newCompleted));
  };

  const saveProfile = (newProfile: UserProfile) => {
    setUserProfile(newProfile);
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(newProfile));
  };

  const handleProfileChange = (key: keyof UserProfile, val: any) => {
    const updated = { ...userProfile, [key]: val };
    saveProfile(updated);
  };

  const saveDevices = (newDevices: typeof devices) => {
    setDevices(newDevices);
    localStorage.setItem(STORAGE_DEVICES_KEY, JSON.stringify(newDevices));
  };

  const saveFeed = (newFeed: UserActivity[]) => {
    setFeedActivities(newFeed);
    localStorage.setItem(STORAGE_FEED_KEY, JSON.stringify(newFeed));
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

  const stopAndSaveRecording = () => {
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

    for (const line of burgosBusLines) {
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
        [`burgos_${detectedLine.ref}`]: {
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
        cityId: 'burgos',
        coords: recordingCoords
      };

      saveFeed([newActivity, ...feedActivities]);
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
        cityId: 'burgos',
        coords: recordingCoords
      };

      saveFeed([newActivity, ...feedActivities]);
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
            [`burgos_${targetLine.ref}`]: {
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
            cityId: 'burgos',
            coords: finalCoords
          };

          saveFeed([newActivity, ...feedActivities]);
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

  const handleGoogleLogin = () => {
    setShowLoginModal(true);
  };

  const handleFinishGoogleLogin = (mockName: string, mockEmail: string, mockAvatar: string) => {
    const newProfile: UserProfile = {
      loggedIn: true,
      name: mockName,
      email: mockEmail,
      avatar: mockAvatar,
      location: 'Burgos, España',
      bio: 'Corredor burgalés conectado por Google. ¡Listo para conquistar el Bulevar!'
    };
    saveProfile(newProfile);
    setShowLoginModal(false);
    addNotification('Google', `¡Sesión iniciada como ${mockName}! Tu perfil se ha sincronizado.`, 'success');
  };

  const handleLogout = () => {
    const newProfile: UserProfile = {
      loggedIn: false,
      name: 'Atleta Anónimo',
      email: '',
      avatar: '🏃‍♂️',
      location: 'Burgos, España',
      bio: 'Atleta de transporte urbano. Conecta tus dispositivos y empieza a correr.'
    };
    saveProfile(newProfile);
    addNotification('Google', 'Sesión cerrada correctamente.', 'info');
  };

  const handleConnectDevice = (brand: string) => {
    setActiveOauthBrand(brand);
    setOauthStep(1);
    setOauthUsername('');
  };

  const handleFinishDeviceConnection = () => {
    if (!activeOauthBrand) return;
    const newDevices = {
      ...devices,
      [activeOauthBrand]: {
        connected: true,
        lastSync: 'Sincronizado ahora',
        userName: oauthUsername || 'runner_burgos'
      }
    };
    saveDevices(newDevices);
    addNotification(activeOauthBrand.toUpperCase(), `¡Dispositivo conectado con éxito! Tus trayectos se sincronizarán solos.`, 'success');
    setActiveOauthBrand(null);
  };

  const handleDisconnectDevice = (brand: string) => {
    const newDevices = { ...devices, [brand]: { connected: false } };
    saveDevices(newDevices);
    addNotification(brand.toUpperCase(), `Se ha desconectado la sincronización automática.`, 'info');
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

  const uniqueLineRefs = useMemo(() => {
    return Array.from(new Set(burgosBusLines.map(l => l.ref))).sort();
  }, [burgosBusLines]);

  const burgosCompletedUniqueCount = useMemo(() => {
    return uniqueLineRefs.filter(ref => !!completed[`burgos_${ref}`]).length;
  }, [completed, uniqueLineRefs]);

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
      if (city === 'burgos') {
        const line = burgosBusLines.find(l => l.ref === ref);
        return sum + (line ? line.distanceKm : 0);
      }
      return sum + 6.8; 
    }, 0);
  }, [completedKeys, burgosBusLines]);

  const totalElevationGainCompleted = useMemo(() => {
    return completedKeys.reduce((sum, key) => {
      const [city, ref] = key.split('_');
      if (city === 'burgos') {
        const line = burgosBusLines.find(l => l.ref === ref);
        return sum + (line ? line.elevationGain : 0);
      }
      return sum + 40;
    }, 0);
  }, [completedKeys, burgosBusLines]);

  const totalTimeSeconds = useMemo(() => {
    return Object.values(completed).reduce((sum, item) => sum + item.timeSeconds, 0);
  }, [completed]);

  const currentRank = useMemo(() => {
    let activeRank = BURGOS_RANKS[0];
    for (let i = BURGOS_RANKS.length - 1; i >= 0; i--) {
      if (globalCompletionPercentage >= BURGOS_RANKS[i].minPercentage) {
        activeRank = BURGOS_RANKS[i];
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

      const isCompleted = !!completed[`burgos_${line.ref}`];
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
    const athleteIdMap: Record<string, string> = {
      'Carlos Gómez': 'carlos-gomez',
      'Sofía Martínez': 'sofia-martinez',
      'Marta Corredora': 'marta-corredora',
      'Diego Cid': 'diego-cid'
    };
    return feedActivities.filter(act => {
      if (act.userName === userProfile.name) return true;
      const aid = athleteIdMap[act.userName];
      if (aid && followedAthletes[aid]) return true;
      return false;
    });
  }, [feedActivities, userProfile.name, followedAthletes]);

  const recommendedAthletes = useMemo(() => {
    const followedIds = Object.keys(followedAthletes).filter(id => followedAthletes[id]);
    const friendsOfFriends = new Set<string>();

    followedIds.forEach(fId => {
      const targets = mockFollowRelations[fId] || [];
      targets.forEach(tId => {
        if (!followedAthletes[tId] && tId !== 'me' && tId !== 'carlos-gomez') {
          friendsOfFriends.add(tId);
        }
      });
    });

    return mockAthletesList.filter(ath => friendsOfFriends.has(ath.id) && !followedAthletes[ath.id]);
  }, [followedAthletes]);

  const aiRecommendation = useMemo(() => {
    if (burgosBusLines.length === 0) {
      return { line: null, text: 'IA Coach: Cargando datos de transporte de la ciudad...', actionable: false };
    }

    if (!userLocation) {
      const recommended = aggregatedLines.find(line => !completed[`burgos_${line.ref}`]);
      if (recommended) {
        return {
          line: recommended,
          text: `IA Coach: Activa tu GPS o simula tu posición en el mapa para recomendarte la línea más cercana. Mientras tanto, te sugerimos completar la Línea ${recommended.ref} (${recommended.name.split(': ')[1] || recommended.name}).`,
          actionable: true
        };
      }
      return {
        line: null,
        text: "IA Coach: ¡Enhorabuena! Has completado el 100% de la red de Burgos. ¡Eres el Cid Campeador del asfalto!",
        actionable: false
      };
    }

    // Find all pending aggregated lines
    const pendingLines = aggregatedLines.filter(line => !completed[`burgos_${line.ref}`]);
    if (pendingLines.length === 0) {
      return {
        line: null,
        text: "IA Coach: ¡Leyenda completada! Tienes el 100% de Burgos. Cambia de ciudad para seguir acumulando porcentaje global.",
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

  const handleLikeActivity = (actId: string) => {
    const updated = feedActivities.map(act => {
      if (act.id === actId) {
        const liked = !act.likedByMe;
        return { ...act, likedByMe: liked, likes: liked ? act.likes + 1 : act.likes - 1 };
      }
      return act;
    });
    saveFeed(updated);
  };

  const handlePostComment = (actId: string) => {
    const text = commentInputs[actId];
    if (!text || !text.trim()) return;

    const updated = feedActivities.map(act => {
      if (act.id === actId) {
        return {
          ...act,
          comments: [
            ...act.comments,
            { id: `comm-${Date.now()}`, userName: userProfile.name, text: text.trim() }
          ]
        };
      }
      return act;
    });
    saveFeed(updated);
    setCommentInputs({ ...commentInputs, [actId]: '' });
  };

  const handleDeleteCompleted = (cityLineRefKey: string) => {
    const copy = { ...completed };
    delete copy[cityLineRefKey];
    saveProgress(copy);

    const ref = cityLineRefKey.split('_')[1];
    // Also clean up from social feed if it's the current user's activity
    const cleanFeed = feedActivities.filter(act => act.lineRef !== ref || act.userName !== userProfile.name);
    saveFeed(cleanFeed);

    addNotification('BusRun', `Se ha eliminado la Línea ${ref} de tus actividades.`, 'info');
  };

  const triggerGpxDownload = (route: LineRoute) => {
    const gpxSegments = route.coords
      .map(([lat, lon, ele]) => `      <trkpt lat="${lat}" lon="${lon}"><ele>${ele}</ele></trkpt>`)
      .join('\n');

    const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="BusRun">
  <trk>
    <name>${route.name}</name>
    <trkseg>
${gpxSegments}
    </trkseg>
  </trk>
</gpx>`;

    const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${route.name.replace(/\s+/g, '_')}.gpx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Watch Auto-Sync Simulation
  const triggerSimulatedWatchSync = () => {
    const connectedBrands = Object.entries(devices)
      .filter(([_, dev]) => dev.connected)
      .map(([brand]) => brand);

    if (connectedBrands.length === 0) {
      alert("Por favor, conecta al menos un dispositivo deportivo (Garmin, Coros, Suunto, Polar, Samsung o Huawei) en la pestaña 'Mi Perfil' para simular la sincronización automática.");
      return;
    }

    const randomBrand = connectedBrands[Math.floor(Math.random() * connectedBrands.length)];
    
    // Pick first uncompleted route
    const uncompletedLine = aggregatedLines.find(line => !completed[`burgos_${line.ref}`]) || aggregatedLines[0];
    if (!uncompletedLine) {
      alert("No hay líneas disponibles para simular.");
      return;
    }

    addNotification(randomBrand.toUpperCase(), `Sincronizando entrenamiento detectado en tu reloj...`, 'info');

    setTimeout(() => {
      const simulatedAccuracy = parseFloat((85 + Math.random() * 13).toFixed(1));
      const timeEst = uncompletedLine.subRoutes[0]?.estRunningSeconds || 1200;

      // Completion registers by Line Reference (burgos_LXX)
      const newCompleted = {
        ...completed,
        [`burgos_${uncompletedLine.ref}`]: {
          date: new Date().toLocaleDateString(),
          timeSeconds: timeEst,
          type: 'running' as const,
          matchPercent: simulatedAccuracy
        }
      };
      saveProgress(newCompleted);

      // Generate simulated track for the feed
      const coords = uncompletedLine.subRoutes[0]?.coords.map(([lat, lon]) => [lat, lon] as [number, number]) || [];

      // Post workout card to the feed
      const newAct: UserActivity = {
        id: `auto-act-${Date.now()}`,
        userName: userProfile.name,
        userAvatar: userProfile.avatar,
        lineId: uncompletedLine.id,
        lineRef: uncompletedLine.ref,
        lineName: uncompletedLine.name,
        distanceKm: uncompletedLine.distanceKm,
        elevationGain: uncompletedLine.subRoutes[0]?.elevationGain || 35,
        timeSeconds: timeEst,
        date: 'Sincronizado vía ' + randomBrand.toUpperCase(),
        matchPercent: simulatedAccuracy,
        type: 'running',
        likes: 0,
        comments: [],
        cityId: 'burgos',
        coords: coords
      };
      saveFeed([newAct, ...feedActivities]);

      const updatedDevices = {
        ...devices,
        [randomBrand]: {
          ...devices[randomBrand],
          lastSync: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      };
      saveDevices(updatedDevices);

      addNotification(randomBrand.toUpperCase(), `¡Trayecto completado! La Línea ${uncompletedLine.ref} se ha validado y guardado. ¡Válido en cualquier sentido!`, 'success');
    }, 2500);
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

  const verifyUploadedGpx = (gpxText: string) => {
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

    // Automatically match against all routes in Burgos
    let bestMatchLine: LineRoute | null = null;
    let bestMatchPercent = 0;
    let bestVisitedStops = 0;

    for (const line of burgosBusLines) {
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
        [`burgos_${detectedLine.ref}`]: {
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
        cityId: 'burgos',
        coords: gpxCoords
      };
      
      const newFeed = [newActivity, ...feedActivities];
      saveFeed(newFeed);

      setGpxResult({
        success: true,
        msg: `¡Verificación con éxito! Detectada la Línea ${detectedLine.ref} automáticamente. Has visitado ${bestVisitedStops} de las ${detectedLine.stops.length} paradas (${bestMatchPercent}% coincidencia). ¡Trayecto guardado!`,
        matchPercent: bestMatchPercent
      });
      addNotification('BusRun', `¡Línea ${detectedLine.ref} detectada y completada!`, 'success');
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
        cityId: 'burgos',
        coords: gpxCoords
      };

      const newFeed = [newActivity, ...feedActivities];
      saveFeed(newFeed);

      setGpxResult({
        success: true,
        msg: `Actividad subida con éxito como 'Entrenamiento Libre'. No coincide con ninguna línea de autobús registrada (Coincidencia máxima: ${bestMatchPercent}%).`,
        matchPercent: bestMatchPercent
      });
      addNotification('BusRun', `¡Entrenamiento Libre subido con éxito!`, 'info');
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
  const selectedAthlete = mockAthletesList.find(a => a.id === selectedAthleteId);

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
            <h1 style={{ fontSize: '1.6rem', fontWeight: '900', letterSpacing: '-0.02em', margin: 0, color: 'white' }}>BusRun</h1>
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
            style={{ flex: 1 }}
          >
            💬 Feed Social
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'map' ? 'active' : ''}`}
            onClick={() => setActiveTab('map')}
            style={{ flex: 1 }}
          >
            🗺️ Mapa y Líneas
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
            style={{ flex: 1 }}
          >
            🔍 Atletas
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
            style={{ flex: 1 }}
          >
            👤 Mi Perfil
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
              <strong style={{ display: 'block', fontSize: '0.95rem' }}>Descargar BusRun App</strong>
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

      {/* Google Login popup */}
      {showLoginModal && (
        <div className="login-modal-overlay">
          <div className="login-modal-card">
            <h3>Iniciar sesión con Google</h3>
            <p className="login-subtitle">Inicia sesión de forma real con tu cuenta de Google:</p>
            
            {/* Real Google Button Container */}
            <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0' }}>
              <div id="google-signin-btn-real"></div>
            </div>

            <div className="client-id-config">
              <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#cbd5e1' }}>
                Google OAuth Client ID:
              </label>
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
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(0,0,0,0.3)',
                  color: 'white',
                  fontSize: '0.75rem',
                  marginTop: '4px'
                }}
              />
              <p style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '4px', lineHeight: '1.3' }}>
                * Por defecto usa un Client ID válido en localhost. Si publicas la app en Vercel/Netlify, crea uno en Google Cloud Console para tu dominio.
              </p>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '16px 0' }} />

            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '8px' }}>
              O usa una cuenta simulada para probar rápido sin iniciar sesión real:
            </p>
            <div className="mock-accounts-list">
              <button onClick={() => handleFinishGoogleLogin('Félix García', 'felix.garcia@gmail.com', '⚡')}>
                <span className="acc-avatar">⚡</span>
                <div className="acc-details">
                  <strong>Félix García</strong>
                  <span>felix.garcia@gmail.com</span>
                </div>
              </button>
              <button onClick={() => handleFinishGoogleLogin('Marta Corredora', 'marta.runner@gmail.com', '🏃‍♀️')}>
                <span className="acc-avatar">🏃‍♀️</span>
                <div className="acc-details">
                  <strong>Marta Corredora</strong>
                  <span>marta.runner@gmail.com</span>
                </div>
              </button>
            </div>
            <button className="btn-close-modal" onClick={() => setShowLoginModal(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Watch OAuth Connection */}
      {activeOauthBrand && (
        <div className="login-modal-overlay">
          <div className="login-modal-card oauth-card">
            <span className="brand-logo-large">🔌 {activeOauthBrand.toUpperCase()} CONNECT</span>
            <div className="oauth-step-content">
              <h3>Vincular tu reloj {activeOauthBrand.toUpperCase()}</h3>
              
              {['garmin', 'coros', 'suunto', 'polar'].includes(activeOauthBrand) ? (
                <div className="oauth-instructions" style={{ textAlign: 'left', fontSize: '0.85rem', lineHeight: '1.5', display: 'flex', flexDirection: 'column', gap: '8px', margin: '12px 0' }}>
                  <p><strong>Pasos para sincronizar automáticamente:</strong></p>
                  <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', color: '#e2e8f0' }}>
                    <li>Abre la aplicación oficial de <strong>{activeOauthBrand.toUpperCase()}</strong> en tu móvil.</li>
                    <li>Ve a <strong>Ajustes &gt; Aplicaciones de Terceros / Cuentas Vinculadas</strong>.</li>
                    <li>Selecciona "BusRun" e inicia sesión con el usuario de abajo.</li>
                    <li>¡Listo! Cada vez que guardes una actividad en tu reloj se subirá sola y se verificará contra el mapa de Burgos.</li>
                  </ol>
                  <div className="input-group-oauth" style={{ marginTop: '10px' }}>
                    <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '4px', color: '#cbd5e1' }}>Usuario de {activeOauthBrand.toUpperCase()}</label>
                    <input 
                      type="text" 
                      placeholder="Ej. runner_burgos" 
                      value={oauthUsername}
                      onChange={(e) => setOauthUsername(e.target.value)}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #555', background: '#333', color: 'white' }}
                    />
                  </div>
                  <button 
                    className="btn-oauth-authorize" 
                    disabled={!oauthUsername.trim()} 
                    onClick={handleFinishDeviceConnection}
                    style={{ marginTop: '12px', background: 'var(--brand-orange)', color: 'white', padding: '10px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', width: '100%' }}
                  >
                    Autorizar y Vincular Reloj
                  </button>
                </div>
              ) : (
                <div className="oauth-instructions" style={{ textAlign: 'left', fontSize: '0.85rem', lineHeight: '1.5', display: 'flex', flexDirection: 'column', gap: '8px', margin: '12px 0' }}>
                  <p className="warning-text" style={{ color: '#f59e0b', fontWeight: 'bold' }}>⚠️ Restricciones del Fabricante:</p>
                  <p style={{ color: '#cbd5e1' }}>
                    <strong>Samsung Health</strong> y <strong>Huawei Health</strong> restringen la exportación directa de trayectos GPS a plataformas externas.
                  </p>
                  <p><strong>Soluciones recomendadas para BusRun:</strong></p>
                  <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', color: '#e2e8f0' }}>
                    <li><strong>Opción A:</strong> Vincula tu reloj Samsung/Huawei a la app **Strava** o usa la app **Health Sync** (Android) o **RunGap** (iOS) para reenviar tus actividades a Strava, y conecta Strava.</li>
                    <li><strong>Opción B:</strong> Exporta tu carrera como archivo <strong>.gpx</strong> desde la app oficial de Samsung/Huawei y súbela abajo en la sección de GPX en la pestaña Perfil.</li>
                  </ul>
                  <button 
                    className="btn-oauth-authorize" 
                    onClick={() => {
                      setOauthUsername('sync_wearable');
                      handleFinishDeviceConnection();
                    }}
                    style={{ marginTop: '12px', background: 'var(--brand-orange)', color: 'white', padding: '10px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', width: '100%' }}
                  >
                    Entendido, Activar Enlace Alternativo
                  </button>
                </div>
              )}
            </div>
            <button className="btn-close-modal" onClick={() => setActiveOauthBrand(null)} style={{ marginTop: '12px', background: 'transparent', border: '1px solid #777', color: '#ccc', width: '100%', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Private Chat Messenger Popup */}
      {showChatModal && (
        <div className="login-modal-overlay">
          <div className="chat-modal-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0 }}>Mensajes con Marta Corredora</h3>
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
                    const myMsg = chatInput.trim();
                    setChatMessages(prev => [...prev, { sender: 'me', text: myMsg, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
                    setChatInput('');
                    setTimeout(() => {
                      setChatMessages(prev => [...prev, { sender: 'other', text: '¡Totalmente de acuerdo! La clave es tomárselo con calma al principio. ¡A seguir sumando!', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
                    }, 1200);
                  }
                }}
              />
              <button onClick={() => {
                if (chatInput.trim()) {
                  const myMsg = chatInput.trim();
                  setChatMessages(prev => [...prev, { sender: 'me', text: myMsg, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
                  setChatInput('');
                  setTimeout(() => {
                    setChatMessages(prev => [...prev, { sender: 'other', text: '¡Totalmente de acuerdo! La clave es tomárselo con calma al principio. ¡A seguir sumando!', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
                  }, 1200);
                }
              }}>Enviar</button>
            </div>
            <button className="btn-close-modal" onClick={() => setShowChatModal(false)} style={{ background: 'transparent', border: '1px solid #777', color: '#ccc', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}>Cerrar Chat</button>
          </div>
        </div>
      )}

      {activeCity !== 'burgos' || activeTransport !== 'bus' ? (
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
                  <div className="avatar-preview">{userProfile.avatar}</div>
                  <div className="info-preview">
                    <h3>{userProfile.name}</h3>
                    <p className="city-label">Progreso Global: {globalCompletionPercentage.toFixed(0)}%</p>
                  </div>
                  
                  {/* Rank progression display */}
                  <div className="rank-progress-indicator">
                    <span className="progress-label">Rango: {currentRank.title} {currentRank.icon}</span>
                    {globalCompletionPercentage < 100 ? (
                      <span className="next-rank-lbl">
                        Siguiente rango: <strong>{BURGOS_RANKS.find(r => r.minPercentage > globalCompletionPercentage)?.name}</strong> 
                        (requiere alcanzar el {BURGOS_RANKS.find(r => r.minPercentage > globalCompletionPercentage)!.minPercentage}%)
                      </span>
                    ) : (
                      <span className="next-rank-lbl text-gold">¡Héroe del Arlanzón: 100% completado! ⚔️</span>
                    )}
                  </div>

                  <div className="stats-mini-grid">
                    <div>
                      <span className="num">{burgosCompletionPercentage.toFixed(0)}%</span>
                      <span className="lbl">Burgos</span>
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

                {/* Watch sync card */}
                <div className="sidebar-card watch-sync-card card-glow">
                  <div className="coach-header">
                    <span className="watch-badge">AUTO-SYNC RELOJ</span>
                    <h4>Sincronizador Directo</h4>
                  </div>
                  <p className="watch-desc-text">
                    ¿Has terminado tu carrera? Si has conectado tu Garmin, Coros, Polar o Suunto, pulsa para simular la sincronización automática del GPS.
                  </p>
                  <button className="btn-force-sync" onClick={triggerSimulatedWatchSync}>
                    🔄 Sincronizar Reloj Deportivo
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
                </div>
              </aside>

              <section className="feed-list">
                {/* Live GPS Recording HUD and Starter */}
                <div className="feed-header-flex-mobile" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
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
                          <div className="act-avatar">{act.userAvatar}</div>
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
                            <span className="act-date">{act.date}</span>
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

                        {/* Read-only Mini Map of the route */}
                        <MiniFeedMap activityId={act.id} coords={getCoordsForActivity(act, loadedBusLines)} color={act.lineRef === 'LIBRE' ? '#0284c7' : '#fc5200'} />
                      </div>

                      <div className="activity-footer">
                        <div className="actions-bar">
                          <button 
                            className={`btn-like ${act.likedByMe ? 'liked' : ''}`}
                            onClick={() => handleLikeActivity(act.id)}
                          >
                            👍 Me Gusta ({act.likes})
                          </button>
                          <button 
                            className="btn-details"
                            style={{ background: 'transparent', border: '1px solid #fc5200', color: '#fc5200', padding: '6px 12px', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer' }}
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
                          >
                            🗺️ Explorar Mapa
                          </button>
                          <span className="comments-count">💬 {act.comments.length} Comentarios</span>
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
                      {selectedLine && !!completed[`burgos_${selectedLine.ref}`] ? (
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
                      const isLineDone = !!completed[`burgos_${selectedLine.ref}`];
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
                  <div className="profile-avatar-large">{userProfile.avatar}</div>
                  <div className="profile-main-meta">
                    <div className="profile-name-badge">
                      <h2>{userProfile.name}</h2>
                      <span className="profile-rank-badge">{currentRank.title} {currentRank.icon}</span>
                    </div>
                    <p className="city-label">Burgos, Castilla y León</p>
                    <p className="bio">{userProfile.bio}</p>
                  </div>
                </div>

                <div className="profile-stats-grid">
                  <div className="profile-stat-box">
                    <span className="lbl">Líneas en Burgos</span>
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
                    <span>% Ciudad de Burgos Completada</span>
                    <strong>{burgosCompletionPercentage.toFixed(0)}%</strong>
                  </div>
                  <div className="bar-bg">
                    <div className="bar-fill" style={{ width: `${burgosCompletionPercentage}%` }}></div>
                  </div>
                </div>
              </section>

              {/* Wearable syncing and profile configurations moved to settings modal */}

              {/* Ranks */}
              <section className="profile-medals-section">
                <h3 className="section-title">Hitos de Rango (Acumulable Globalmente)</h3>
                <p className="section-subtitle">
                  Progresa de forma acumulativa sumando el porcentaje de completado de tu red urbana de transportes.
                </p>
                
                <div className="medals-grid">
                  {BURGOS_RANKS.map((rank) => {
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
                          return (
                            <div key={key} className="history-item">
                              <div className="left-side">
                                <span className="badge-ref">{line.ref}</span>
                                <div className="name-box">
                                  <strong>Línea {line.ref} (Burgos)</strong>
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
                        return (
                          <div key={key} className="history-item">
                            <div className="left-side">
                              <span className="badge-ref">M06</span>
                              <div className="name-box">
                                <strong>Línea 6 Circular (Metro Madrid)</strong>
                                <span>Madrid · Completado el {item.date}</span>
                              </div>
                            </div>
                            <div className="right-side" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                              <div>
                                <span className="l">Distancia</span>
                                <span className="v">23.4 km</span>
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
                      <p className="no-history">Completa tu primera línea trotando o sincronizando tu reloj.</p>
                    )}
                  </div>
                </section>
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
                          <span className="athlete-avatar">{ath.avatar}</span>
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
                              setFollowedAthletes(prev => ({ ...prev, [ath.id]: !prev[ath.id] }));
                              addNotification('Social', followedAthletes[ath.id] ? `Has dejado de seguir a ${ath.name}.` : `¡Ahora sigues a ${ath.name}!`, 'info');
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
                {mockAthletesList.filter(ath => ath.name.toLowerCase().includes(athleteSearchQuery.toLowerCase()) || ath.rankName.toLowerCase().includes(athleteSearchQuery.toLowerCase())).map((ath) => {
                  const isFav = !!favoriteAthletes[ath.id];
                  return (
                    <div key={ath.id} className="athlete-card" style={{ cursor: 'pointer' }} onClick={() => setSelectedAthleteId(ath.id)}>
                      <span className="athlete-avatar">{ath.avatar}</span>
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
                          setFollowedAthletes(prev => ({ ...prev, [ath.id]: !prev[ath.id] }));
                          addNotification('Social', followedAthletes[ath.id] ? `Has dejado de seguir a ${ath.name}.` : `¡Ahora sigues a ${ath.name}!`, 'info');
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
            <div style={{ height: '220px', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', position: 'relative', zIndex: 1, marginBottom: '16px' }}>
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
                <h3>¡Bienvenido/a a BusRun!</h3>
                <p style={{ margin: '12px 0 20px 0', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.5' }}>
                  BusRun es la red social deportiva de corredores urbanos. Tu misión es <strong>completar las líneas de transporte urbano</strong> corriendo o caminando por su trazado de paradas.
                </p>
              </div>
            )}

            {tutorialStep === 2 && (
              <div>
                <div style={{ fontSize: '3rem', margin: '16px 0' }}>🏆</div>
                <h3>Progresión y Rango Burgalés</h3>
                <p style={{ margin: '12px 0 20px 0', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.5' }}>
                  Cada línea completada suma porcentaje a tu progresión. Pasa de ser un simple <strong>Dominguero (0%)</strong> hasta el legendario <strong>Cid Campeador (100%)</strong> a través de 10 niveles acumulables.
                </p>
              </div>
            )}

            {tutorialStep === 3 && (
              <div>
                <div style={{ fontSize: '3rem', margin: '16px 0' }}>⌚</div>
                <h3>Vincular Relojes Deportivos</h3>
                <p style={{ margin: '12px 0 20px 0', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.5' }}>
                  Conecta tus cuentas de <strong>Garmin, Coros, Polar, Suunto, Samsung o Huawei</strong> desde tu perfil. Tus rodajes se sincronizarán solos y la app detectará automáticamente qué línea has recorrido.
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
          <div className="login-modal-card" style={{ width: '100%', maxWidth: '460px', padding: '24px' }}>
            <h3>Configuración y Preferencias ⚙️</h3>
            
            {/* Tabs inside settings modal */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '16px' }}>
              <button 
                onClick={() => setSettingsActiveTab('profile')}
                style={{
                  flex: 1,
                  padding: '10px 4px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: settingsActiveTab === 'profile' ? '2px solid var(--brand-orange)' : 'none',
                  color: settingsActiveTab === 'profile' ? 'var(--brand-orange)' : '#ccc',
                  fontWeight: 'bold',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Mi Perfil
              </button>
              <button 
                onClick={() => setSettingsActiveTab('devices')}
                style={{
                  flex: 1,
                  padding: '10px 4px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: settingsActiveTab === 'devices' ? '2px solid var(--brand-orange)' : 'none',
                  color: settingsActiveTab === 'devices' ? 'var(--brand-orange)' : '#ccc',
                  fontWeight: 'bold',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Dispositivos
              </button>
              <button 
                onClick={() => setSettingsActiveTab('preferences')}
                style={{
                  flex: 1,
                  padding: '10px 4px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: settingsActiveTab === 'preferences' ? '2px solid var(--brand-orange)' : 'none',
                  color: settingsActiveTab === 'preferences' ? 'var(--brand-orange)' : '#ccc',
                  fontWeight: 'bold',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Ajustes App
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
                        onClick={() => {
                          const cleared: UserProfile = {
                            loggedIn: false,
                            name: 'Atleta Anónimo',
                            email: '',
                            avatar: '🏃‍♂️',
                            location: 'Burgos, España',
                            bio: 'Atleta de transporte urbano. Conecta tus dispositivos y empieza a correr.'
                          };
                          saveProfile(cleared);
                          addNotification('Google', 'Sesión cerrada.', 'info');
                        }}
                        style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '6px', border: '1px solid #ff4d4d', color: '#ff4d4d', background: 'transparent', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        Cerrar Sesión Google
                      </button>
                    </div>
                  ) : (
                    <>
                      <div id="google-signin-btn-real" style={{ margin: '6px 0' }}></div>
                      <p style={{ fontSize: '0.7rem', color: '#94a3b8', textAlign: 'center', margin: 0 }}>O usa una cuenta de pruebas simulada:</p>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <button 
                          onClick={() => {
                            const newProfile: UserProfile = {
                              loggedIn: true,
                              name: 'Félix García',
                              email: 'felix.garcia@gmail.com',
                              avatar: '⚡',
                              location: 'Burgos, España',
                              bio: 'Corredor aficionado de Burgos. ¡A por todas las líneas!'
                            };
                            saveProfile(newProfile);
                            addNotification('Google', '¡Sesión de Félix García simulada!', 'success');
                          }}
                          style={{ padding: '6px 10px', fontSize: '0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: '#222', color: 'white', cursor: 'pointer' }}
                        >
                          ⚡ Félix García
                        </button>
                        <button 
                          onClick={() => {
                            const newProfile: UserProfile = {
                              loggedIn: true,
                              name: 'Marta Corredora',
                              email: 'marta.runner@gmail.com',
                              avatar: '🏃‍♀️',
                              location: 'Burgos, España',
                              bio: 'Buscando el 100% de la ciudad.'
                            };
                            saveProfile(newProfile);
                            addNotification('Google', '¡Sesión de Marta Corredora simulada!', 'success');
                          }}
                          style={{ padding: '6px 10px', fontSize: '0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: '#222', color: 'white', cursor: 'pointer' }}
                        >
                          🏃‍♀️ Marta C.
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Tab 2: Devices Synchronization */}
            {settingsActiveTab === 'devices' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left', marginBottom: '20px' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                  Vincula tus relojes deportivos oficiales para sincronizar automáticamente tus actividades GPS.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '280px', overflowY: 'auto', paddingRight: '4px' }}>
                  {/* Garmin */}
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1, marginRight: '8px' }}>
                      <strong style={{ color: 'white', fontSize: '0.85rem' }}>Garmin Connect 🔹</strong>
                      <p style={{ margin: '2px 0 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>
                        {devices.garmin.connected ? `Conectado como @${devices.garmin.userName}` : 'Sincronizar Forerunner y Fenix'}
                      </p>
                    </div>
                    <button 
                      onClick={() => devices.garmin.connected ? handleDisconnectDevice('garmin') : handleConnectDevice('garmin')}
                      style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '6px', border: 'none', background: devices.garmin.connected ? '#ef4444' : 'var(--brand-orange)', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      {devices.garmin.connected ? 'Desvincular' : 'Conectar'}
                    </button>
                  </div>
                  
                  {/* Coros */}
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1, marginRight: '8px' }}>
                      <strong style={{ color: 'white', fontSize: '0.85rem' }}>Coros Health 🔸</strong>
                      <p style={{ margin: '2px 0 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>
                        {devices.coros.connected ? `Conectado como @${devices.coros.userName}` : 'Sincronizar Pace y Apex'}
                      </p>
                    </div>
                    <button 
                      onClick={() => devices.coros.connected ? handleDisconnectDevice('coros') : handleConnectDevice('coros')}
                      style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '6px', border: 'none', background: devices.coros.connected ? '#ef4444' : 'var(--brand-orange)', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      {devices.coros.connected ? 'Desvincular' : 'Conectar'}
                    </button>
                  </div>

                  {/* Suunto */}
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1, marginRight: '8px' }}>
                      <strong style={{ color: 'white', fontSize: '0.85rem' }}>Suunto App 🔺</strong>
                      <p style={{ margin: '2px 0 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>
                        {devices.suunto.connected ? `Conectado como @${devices.suunto.userName}` : 'Sincronizar Suunto 9 y Peak'}
                      </p>
                    </div>
                    <button 
                      onClick={() => devices.suunto.connected ? handleDisconnectDevice('suunto') : handleConnectDevice('suunto')}
                      style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '6px', border: 'none', background: devices.suunto.connected ? '#ef4444' : 'var(--brand-orange)', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      {devices.suunto.connected ? 'Desvincular' : 'Conectar'}
                    </button>
                  </div>

                  {/* Polar */}
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1, marginRight: '8px' }}>
                      <strong style={{ color: 'white', fontSize: '0.85rem' }}>Polar Flow 🍎</strong>
                      <p style={{ margin: '2px 0 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>
                        {devices.polar.connected ? `Conectado como @${devices.polar.userName}` : 'Sincronizar Vantage y Grit'}
                      </p>
                    </div>
                    <button 
                      onClick={() => devices.polar.connected ? handleDisconnectDevice('polar') : handleConnectDevice('polar')}
                      style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '6px', border: 'none', background: devices.polar.connected ? '#ef4444' : 'var(--brand-orange)', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      {devices.polar.connected ? 'Desvincular' : 'Conectar'}
                    </button>
                  </div>

                  {/* Samsung */}
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1, marginRight: '8px' }}>
                      <strong style={{ color: 'white', fontSize: '0.85rem' }}>Samsung Health 🌀</strong>
                      <p style={{ margin: '2px 0 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>
                        {devices.samsung.connected ? 'Conectado vía Samsung' : 'Vincular Galaxy Watch'}
                      </p>
                    </div>
                    <button 
                      onClick={() => devices.samsung.connected ? handleDisconnectDevice('samsung') : handleConnectDevice('samsung')}
                      style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '6px', border: 'none', background: devices.samsung.connected ? '#ef4444' : 'var(--brand-orange)', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      {devices.samsung.connected ? 'Desvincular' : 'Conectar'}
                    </button>
                  </div>

                  {/* Huawei */}
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1, marginRight: '8px' }}>
                      <strong style={{ color: 'white', fontSize: '0.85rem' }}>Huawei Health 🔴</strong>
                      <p style={{ margin: '2px 0 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>
                        {devices.huawei.connected ? `Conectado como @${devices.huawei.userName}` : 'Sincronizar Huawei GT'}
                      </p>
                    </div>
                    <button 
                      onClick={() => devices.huawei.connected ? handleDisconnectDevice('huawei') : handleConnectDevice('huawei')}
                      style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '6px', border: 'none', background: devices.huawei.connected ? '#ef4444' : 'var(--brand-orange)', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      {devices.huawei.connected ? 'Desvincular' : 'Conectar'}
                    </button>
                  </div>
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
                    onChange={(e) => setActiveCity(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', background: '#333', color: 'white', border: '1px solid #555', fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    <option value="burgos">Burgos</option>
                    <option value="madrid">Madrid</option>
                    <option value="barcelona">Barcelona</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '4px', color: '#cbd5e1' }}>Medio de Transporte:</label>
                  <select 
                    value={activeTransport}
                    onChange={(e) => setActiveTransport(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', background: '#333', color: 'white', border: '1px solid #555', fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    <option value="bus">Autobús Urbano</option>
                    <option value="metro">Metro</option>
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
                      Estás ejecutando BusRun en modo aplicación a pantalla completa. ¡Excelente!
                    </p>
                  ) : (
                    <>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                        Instala BusRun en tu teléfono para correr a pantalla completa, sin la barra de direcciones del navegador y con GPS optimizado.
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
                        {selectedAthlete.completedRefs.map(ref => (
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
                  setFollowedAthletes(prev => ({ ...prev, [selectedAthlete.id]: !prev[selectedAthlete.id] }));
                  addNotification('Social', followedAthletes[selectedAthlete.id] ? `Has dejado de seguir a ${selectedAthlete.name}.` : `¡Ahora sigues a ${selectedAthlete.name}!`, 'info');
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
                <button 
                  onClick={() => {
                    const newFavs = { ...favoriteAthletes, [selectedAthlete.id]: !favoriteAthletes[selectedAthlete.id] };
                    saveFavorites(newFavs);
                  }}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #fc5200',
                    background: 'transparent',
                    color: '#fc5200',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  {favoriteAthletes[selectedAthlete.id] ? '★ Quitar Fav' : '⭐ Fav'}
                </button>
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
          <span className="bottom-nav-icon">🏠</span>
          <span>Feed</span>
        </button>
        <button 
          className={`bottom-nav-item ${activeTab === 'map' ? 'active' : ''}`}
          onClick={() => setActiveTab('map')}
        >
          <span className="bottom-nav-icon">📍</span>
          <span>Mapa</span>
        </button>
        <button 
          className={`bottom-nav-item ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          <span className="bottom-nav-icon">🔍</span>
          <span>Buscador</span>
        </button>
        <button 
          className={`bottom-nav-item ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          <span className="bottom-nav-icon">👤</span>
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
    </div>
  );
}
