const fs = require('fs');
const path = require('path');

const stylesPath = path.join(__dirname, '../src/styles.css');
const appPath = path.join(__dirname, '../src/App.tsx');

// ====================================================
// 1. Process styles.css
// ====================================================
let styles = fs.readFileSync(stylesPath, 'utf8');

// Replace Root
const rootTarget = `:root {
  color-scheme: light;
  font-family: 'Outfit', 'Inter', system-ui, -apple-system, sans-serif;
  background: #f1f5f9;
  color: #0f172a;
  
  /* Brand Palette (Underground Metro Blue / Cyan Accents) */
  --brand-orange: #2563eb;
  --brand-orange-hover: #1d4ed8;
  --brand-orange-light: rgba(37, 99, 235, 0.08);
  --brand-dark: #090d16;
  --brand-dark-soft: #1e293b;
  --brand-light: #ffffff;
  --accent-green: #10b981;
  --accent-green-soft: #ecfdf5;
  --accent-red: #ef4444;
  --accent-red-soft: #fef2f2;
  --accent-blue: #3b82f6;
  --accent-blue-soft: #eff6ff;
  --border-color: #e2e8f0;
  --text-muted: #64748b;
  --shadow-sm: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 10px 15px -3px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}`;

const rootReplacement = `:root {
  color-scheme: dark;
  font-family: 'Outfit', 'Inter', system-ui, -apple-system, sans-serif;
  background: #090d16;
  color: #f8fafc;
  
  /* Brand Palette (Underground Metro Blue / Cyan Accents) */
  --brand-orange: #3b82f6;
  --brand-orange-hover: #60a5fa;
  --brand-orange-light: rgba(59, 130, 246, 0.15);
  --brand-dark: #090d16;
  --brand-dark-soft: #151f32;
  --brand-light: #1e293b;
  --accent-green: #10b981;
  --accent-green-soft: rgba(16, 185, 129, 0.15);
  --accent-red: #ef4444;
  --accent-red-soft: rgba(239, 68, 68, 0.15);
  --accent-blue: #06b6d4;
  --accent-blue-soft: rgba(6, 182, 212, 0.15);
  --border-color: #334155;
  --text-muted: #94a3b8;
  --shadow-sm: 0 4px 6px -1px rgba(0, 0, 0, 0.35);
  --shadow-md: 0 10px 15px -3px rgba(0, 0, 0, 0.45);
  --shadow-lg: 0 20px 25px -5px rgba(0, 0, 0, 0.55);
}`;

// Re-read clean baseline if we are running again
let baselineStyles = fs.readFileSync(stylesPath, 'utf8');
if (baselineStyles.includes('--brand-light: #1e293b;')) {
  // already run once, but we want to make sure it's clean. Let's discard previous runs if needed by restoring from git if clean. But we can just use replace directly if it has no conflict.
}

styles = styles.replace(rootTarget, rootReplacement);

// Replace body background
styles = styles.replace(
  `background: linear-gradient(180deg, #f8fafc 0%, #cbd5e1 100%);`,
  `background: linear-gradient(180deg, #090d16 0%, #030712 100%);`
);

// Replace topbar text color reference to keep topbar white
styles = styles.replace(
  `color: var(--brand-light);`,
  `color: #ffffff;`
);

// Replace hardcoded slate background containers
styles = styles.split('background: #f1f5f9;').join('background: var(--brand-dark-soft);');
styles = styles.split('background: #f8fafc;').join('background: var(--brand-dark-soft);');

// Clean up Strava orange shadows and borders in styles
styles = styles.split('rgba(252, 82, 0').join('rgba(59, 130, 246');
styles = styles.split('#ff7e40').join('#06b6d4');

// Segmented controls classes and input overrides
const classesToAppend = `
/* Global dark mode input and select styling override */
input[type="text"], input[type="search"], input[type="email"], select, textarea {
  background: rgba(0, 0, 0, 0.25) !important;
  color: #f8fafc !important;
  border: 1px solid var(--border-color) !important;
}

input[type="text"]::placeholder, input[type="search"]::placeholder, textarea::placeholder {
  color: #64748b;
}

/* Premium Segmented Controls (iOS / Duolingo Style) */
.segmented-control {
  display: flex;
  background: rgba(0, 0, 0, 0.25);
  padding: 4px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  margin-bottom: 20px;
  overflow-x: auto;
  gap: 2px;
}

.segmented-control-btn {
  flex: 1;
  padding: 10px 12px;
  background: transparent;
  border: none;
  color: #94a3b8;
  font-weight: bold;
  font-size: 0.8rem;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
}

.segmented-control-btn.active {
  background: var(--brand-orange);
  color: white;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
}

.segmented-control-btn:hover:not(.active) {
  color: white;
  background: rgba(255, 255, 255, 0.05);
}

.segmented-control-mini {
  display: flex;
  background: rgba(0, 0, 0, 0.2);
  padding: 3px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  gap: 2px;
  margin-bottom: 10px;
}

.segmented-control-mini-btn {
  flex: 1;
  padding: 6px;
  font-size: 0.75rem;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #94a3b8;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.segmented-control-mini-btn.active {
  background: var(--brand-orange);
  color: white;
  box-shadow: 0 2px 6px rgba(59, 130, 246, 0.25);
}

.segmented-control-mini-btn:hover:not(.active) {
  color: white;
  background: rgba(255, 255, 255, 0.05);
}
`;

// Only append if it's not already there
if (!styles.includes('.segmented-control {')) {
  styles += classesToAppend;
}

fs.writeFileSync(stylesPath, styles, 'utf8');
console.log('styles.css successfully updated.');


// ====================================================
// 2. Process App.tsx
// ====================================================
// Let's checkout App.tsx to baseline before we apply updates so we don't have partial replacements
try {
  const { execSync } = require('child_process');
  execSync('git checkout -- src/App.tsx', { cwd: path.join(__dirname, '..') });
  console.log('App.tsx restored to clean git state.');
} catch (e) {
  console.log('Git checkout skipped or failed.');
}

let app = fs.readFileSync(appPath, 'utf8');

// Replace translations block
const transStartMarker = 'const translations = {';
const transStartIdx = app.indexOf(transStartMarker);
if (transStartIdx === -1) {
  console.error('Could not find start of translations object in App.tsx');
  process.exit(1);
}

let bracketCount = 0;
let transEndIdx = -1;
for (let i = transStartIdx + transStartMarker.length - 1; i < app.length; i++) {
  if (app[i] === '{') bracketCount++;
  if (app[i] === '}') {
    bracketCount--;
    if (bracketCount === 0) {
      transEndIdx = i;
      break;
    }
  }
}

if (transEndIdx === -1) {
  console.error('Could not find end of translations object in App.tsx');
  process.exit(1);
}

const translationsStr = `const translations = {
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

    // New keys
    cid_challenge_title: "Reto Diario del Cid",
    cid_reward_active: "¡Recompensa Activa!",
    cid_validate_title: "Valida tu billete del día",
    cid_validate_desc: "Haz clic en validar para conseguir XP instantáneos o multiplicadores para tus carreras de hoy.",
    cid_validate_btn: "VALIDAR ➔",
    cid_ticket_title: "Billete Diario de la Suerte",
    cid_ticket_valid: "✓ VALIDADO",
    cid_ticket_pending: "● PENDIENTE",
    perfection_title: "Perfección de Ciudad",
    perfection_platinum: "PLATINO ADQUIRIDO",
    perfection_golds: "Oros",
    perfection_pace_gold: "Ritmo < 4:30",
    perfection_pace_silver: "Ritmo < 5:30",
    perfection_pace_bronze: "Otros ritmos",
    perfection_platinum_desc: "Progreso hacia Trofeo de Platino (Todas Oro)",
    virtual_journeys_title: "Viajes de Metro Virtuales",
    virtual_progress_lbl: "Progreso actual de viaje",
    virtual_select_lbl: "Seleccionar Viaje Virtual Activo:",
    passport_title: "Pasaporte de Ciudades MetroMile",
    passport_lines: "líneas",
    passport_conquered: "¡Ciudad 100% Conquistada!",
    passport_stamps: "Sellos de Pasaporte Adquiridos:",
    prestige_activate_btn: "Iniciar Modo Prestigio",
    prestige_conquered_desc: "Has completado todas las rutas disponibles en esta ciudad. Activa el Modo Prestigio para reiniciar tu progreso local, ganar una medalla permanente ★ y volver a competir con un multiplicador de rango.",
    prestige_confirm_msg: "¿Estás seguro de que deseas reiniciar tu progreso de la ciudad activa y avanzar al siguiente Nivel de Prestigio?",
    prestige_alert_msg: "🏆 ¡Modo Prestigio iniciado! Progreso de ciudad reiniciado y estrella ganada.",
    share_official_athlete: "Atleta Oficial",
    share_free_activity: "ENTRENAMIENTO LIBRE",
    share_route_completed: "TRAYECTO 100% COMPLETADO",
    share_distance: "DISTANCIA",
    share_elevation: "DESNIVEL",
    share_duration: "TIEMPO",
    xp_to_next_level: "Faltan {xp} XP para Nivel {level}",
    no_incidents: "No hay incidencias reportadas hoy.",
    reward_desc_double: "Duplicador de Tránsito (2.0x XP en todas tus carreras hoy)",
    reward_desc_booster: "Super Booster (1.5x XP en todas tus carreras hoy)",
    reward_desc_xp250: "Recompensa Instantánea (+250 XP añadidos de inmediato)",
    reward_desc_xp150: "Recompensa de Metro (+150 XP añadidos de inmediato)",
    reward_toast_gained: "⚡ ¡Ganaste +{xp} XP! (Base: {base} XP, Multiplicador: {mult}x)",
    reward_toast_validated: "🎫 ¡Billete Validado! Recompensa: {desc}",
    virtual_journey_completed: "🎉 ¡Viaje Virtual Completado! Has conquistado la línea {name} ({km} km).",
    filter_all: "Todas",
    filter_completed: "Hechas",
    filter_pending: "Pendientes",
    gpx_upload_title: "Sube tu Actividad (.gpx)",
    gpx_upload_descr: "Importa un archivo GPX grabado por tu reloj. El sistema autodetectará de forma inteligente qué línea de autobús has recorrido (se requiere un 70% de paradas visitadas). Si no coincide con ninguna, se guardará como un rodaje libre.",
    activity_label: "Actividad:",
    running: "🏃‍♂️ Corriendo",
    walking: "🚶‍♂️ Caminando",
    select_gpx: "📁 Seleccionar GPX",
    generate_simulated_gpx: "⚙️ Generar Actividad Simulada",
    activity_approved: "¡Actividad Aprobada!",
    verification_failed: "Verificación Fallida",
    xp_accumulated: "XP Acumulada",
    
    // Additional keys
    medal_gold: "Oro",
    medal_silver: "Plata",
    medal_bronze: "Bronce",
    unlocked: "🏆 Desbloqueado",
    locked: "🔒 Bloqueado",
    image_downloaded: "¡Imagen descargada!",
    achievements_title: "Logros y Medallas Deportivas",
    achievements_desc: "Completa carreras y supera los retos urbanos para ganar medallas únicas.",
    city_label: "Ciudad:",
    country_label: "País:",
    cancel: "Cancelar",
    close: "Cerrar",
    city_request_descr: "Indica el nombre de la ciudad y país que deseas agregar. Extraeremos sus líneas de transporte público en nuestra base de datos."
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

    // New keys
    cid_challenge_title: "Daily Cid Challenge",
    cid_reward_active: "Active Reward!",
    cid_validate_title: "Validate today's ticket",
    cid_validate_desc: "Click validate to get instant XP or multipliers for today's activities.",
    cid_validate_btn: "VALIDATE ➔",
    cid_ticket_title: "Daily Lucky Metro Ticket",
    cid_ticket_valid: "✓ VALIDATED",
    cid_ticket_pending: "● PENDING",
    perfection_title: "City Perfection",
    perfection_platinum: "PLATINUM CONQUERED",
    perfection_golds: "Golds",
    perfection_pace_gold: "Pace < 4:30",
    perfection_pace_silver: "Pace < 5:30",
    perfection_pace_bronze: "Other paces",
    perfection_platinum_desc: "Progress to Platinum Trophy (All Gold)",
    virtual_journeys_title: "Virtual Metro Journeys",
    virtual_progress_lbl: "Current voyage progress",
    virtual_select_lbl: "Select Active Virtual Journey:",
    passport_title: "MetroMile Cities Passport",
    passport_lines: "lines",
    passport_conquered: "City 100% Conquered!",
    passport_stamps: "Earned Passport Stamps:",
    prestige_activate_btn: "Activate Prestige Mode",
    prestige_conquered_desc: "You have completed all available routes in this city. Activate Prestige Mode to reset your local progress, earn a permanent ★ badge, and start competing again with a rank multiplier.",
    prestige_confirm_msg: "Are you sure you want to reset your progress for the active city and advance to the next Prestige Level?",
    prestige_alert_msg: "🏆 Prestige Mode activated! City progress reset and star awarded.",
    share_official_athlete: "Official Athlete",
    share_free_activity: "FREE ACTIVITY",
    share_route_completed: "ROUTE 100% COMPLETED",
    share_distance: "DISTANCE",
    share_elevation: "ELEVATION",
    share_duration: "DURATION",
    xp_to_next_level: "{xp} XP to Level {level}",
    no_incidents: "No active transit incidents today.",
    reward_desc_double: "Transit Doubler (2.0x XP on all runs today)",
    reward_desc_booster: "Super Booster (1.5x XP on all runs today)",
    reward_desc_xp250: "Instant Reward (+250 XP added immediately)",
    reward_desc_xp150: "Metro Reward (+150 XP added immediately)",
    reward_toast_gained: "⚡ Earned +{xp} XP! (Base: {base} XP, Multiplier: {mult}x)",
    reward_toast_validated: "🎫 Ticket Validated! Reward: {desc}",
    virtual_journey_completed: "🎉 Virtual Journey Completed! You've conquered the {name} line ({km} km).",
    filter_all: "All",
    filter_completed: "Completed",
    filter_pending: "Pending",
    gpx_upload_title: "Upload your Activity (.gpx)",
    gpx_upload_descr: "Import a GPX file recorded by your watch. The system will intelligently auto-detect which bus line you ran (70% stops visited required). If it matches none, it saves as a free activity.",
    activity_label: "Activity:",
    running: "🏃‍♂️ Running",
    walking: "🚶‍♂️ Walking",
    select_gpx: "📁 Select GPX",
    generate_simulated_gpx: "⚙️ Generate Simulated Run",
    activity_approved: "Activity Approved!",
    verification_failed: "Verification Failed",
    xp_accumulated: "Accumulated XP",
    
    // Additional keys
    medal_gold: "Gold",
    medal_silver: "Silver",
    medal_bronze: "Bronze",
    unlocked: "🏆 Unlocked",
    locked: "🔒 Locked",
    image_downloaded: "Image downloaded!",
    achievements_title: "Sporting Achievements & Medals",
    achievements_desc: "Complete runs and conquer urban challenges to unlock unique badges.",
    city_label: "City:",
    country_label: "Country:",
    cancel: "Cancel",
    close: "Close",
    city_request_descr: "Enter the city and country you would like us to add. We will extract its transit lines into our global database."
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

    // New keys
    cid_challenge_title: "Défi Quotidien du Cid",
    cid_reward_active: "Récompense Active !",
    cid_validate_title: "Validez votre ticket du jour",
    cid_validate_desc: "Cliquez sur valider pour obtenir des XP instantanés ou des multiplicateurs pour aujourd'hui.",
    cid_validate_btn: "VALIDER ➔",
    cid_ticket_title: "Ticket de Métro Chanceux",
    cid_ticket_valid: "✓ VALIDÉ",
    cid_ticket_pending: "● EN ATTENTE",
    perfection_title: "Perfection de la Ville",
    perfection_platinum: "PLATINE CONQUIS",
    perfection_golds: "Or",
    perfection_pace_gold: "Allure < 4:30",
    perfection_pace_silver: "Allure < 5:30",
    perfection_pace_bronze: "Autres allures",
    perfection_platinum_desc: "Progression vers le Trophée Platine (Tout Or)",
    virtual_journeys_title: "Voyages de Métro Virtuels",
    virtual_progress_lbl: "Progression actuelle",
    virtual_select_lbl: "Sélectionner le Voyage Actif :",
    passport_title: "Passeport de Villes MetroMile",
    passport_lines: "lignes",
    passport_conquered: "Ville 100% Conquise !",
    passport_stamps: "Tampons de Passeport Obtenus :",
    prestige_activate_btn: "Activer le Mode Prestige",
    prestige_conquered_desc: "Vous avez complété toutes les routes de cette ville. Activez le Mode Prestige pour réinitialiser votre progression, gagner une étoile ★ et obtenir un multiplicateur de rang.",
    prestige_confirm_msg: "Êtes-vous sûr de vouloir réinitialiser votre progression pour cette ville et passer au niveau de prestige suivant ?",
    prestige_alert_msg: "🏆 Mode Prestige activé ! Progression réinitialisée et étoile obtenue.",
    share_official_athlete: "Athlète Officiel",
    share_free_activity: "ENTRAÎNEMENT LIBRE",
    share_route_completed: "PARCOURS 100% COMPLÉTÉ",
    share_distance: "DISTANCE",
    share_elevation: "DENIVELÉ",
    share_duration: "DURÉE",
    xp_to_next_level: "{xp} XP restants pour le Niveau {level}",
    no_incidents: "Aucun incident de transport signalé aujourd'hui.",
    reward_desc_double: "Doubleur de transit (2.0x XP sur toutes vos courses aujourd'hui)",
    reward_desc_booster: "Super Booster (1.5x XP sur toutes vos courses aujourd'hui)",
    reward_desc_xp250: "Récompense instantanée (+250 XP ajoutés immédiatement)",
    reward_desc_xp150: "Récompense de métro (+150 XP ajoutés immédiatement)",
    reward_toast_gained: "⚡ +{xp} XP gagnés ! (Base : {base} XP, Multiplicateur : {mult}x)",
    reward_toast_validated: "🎫 Ticket validé ! Récompense : {desc}",
    virtual_journey_completed: "🎉 Voyage virtuel terminé ! Vous avez conquis la ligne {name} ({km} km).",
    filter_all: "Toutes",
    filter_completed: "Complétées",
    filter_pending: "En attente",
    gpx_upload_title: "Importer votre activité (.gpx)",
    gpx_upload_descr: "Importez un fichier GPX enregistré par votre montre. Le système détectera automatiquement la ligne parcourue (70% des arrêts requis). Sinon, elle sera enregistrée comme entraînement libre.",
    activity_label: "Activité :",
    running: "🏃‍♂️ Course",
    walking: "🚶‍♂️ Marche",
    select_gpx: "📁 Sélectionner GPX",
    generate_simulated_gpx: "⚙️ Simuler une activité",
    activity_approved: "Activité approuvée !",
    verification_failed: "Échec de la vérification",
    xp_accumulated: "XP Accumulés",
    
    // Additional keys
    medal_gold: "Or",
    medal_silver: "Argent",
    medal_bronze: "Bronze",
    unlocked: "🏆 Déverrouillé",
    locked: "🔒 Verrouillé",
    image_downloaded: "Image téléchargée !",
    achievements_title: "Succès & Médailles Sportives",
    achievements_desc: "Complétez des courses et surmontez les défis urbains pour gagner des médailles uniques.",
    city_label: "Ville :",
    country_label: "Pays :",
    cancel: "Annuler",
    close: "Fermer",
    city_request_descr: "Entrez la ville et le pays que vous souhaitez ajouter. Nous extrairons ses lignes de transport."
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

    // New keys
    cid_challenge_title: "Tägliche Cid-Herausforderung",
    cid_reward_active: "Belohnung Aktiv!",
    cid_validate_title: "Tageskarte validieren",
    cid_validate_desc: "Klicke auf Validieren, um XP-Booster oder Multiplikatoren für heute zu erhalten.",
    cid_validate_btn: "VALIDIEREN ➔",
    cid_ticket_title: "Tägliches Glücks-Metroticket",
    cid_ticket_valid: "✓ VALIDIERT",
    cid_ticket_pending: "● AUSSTEHEND",
    perfection_title: "Stadt-Perfektion",
    perfection_platinum: "PLATIN ERREICHT",
    perfection_golds: "Gold",
    perfection_pace_gold: "Tempo < 4:30",
    perfection_pace_silver: "Tempo < 5:30",
    perfection_pace_bronze: "Anderes Tempo",
    perfection_platinum_desc: "Fortschritt zum Platin-Pokal (Alles Gold)",
    virtual_journeys_title: "Virtuelle Metro-Reisen",
    virtual_progress_lbl: "Aktueller Reisefortschritt",
    virtual_select_lbl: "Aktive virtuelle Reise auswählen:",
    passport_title: "MetroMile Städte-Reisepass",
    passport_lines: "Linien",
    passport_conquered: "Stadt zu 100% erobert!",
    passport_stamps: "Erhaltene Stempel:",
    prestige_activate_btn: "Prestige-Modus aktivieren",
    prestige_conquered_desc: "Du hast alle verfügbaren Strecken in dieser Stadt abgeschlossen. Aktiviere den Prestige-Modus, um deinen lokalen Fortschritt zurückzusetzen, ein dauerhaftes ★-Abzeichen zu erhalten und mit einem Rang-Multiplikator neu zu starten.",
    prestige_confirm_msg: "Bist du sicher, dass du deinen Fortschritt für die aktive Stadt zurücksetzen und das nächste Prestige-Level aktivieren möchtest?",
    prestige_alert_msg: "🏆 Prestige-Modus aktiviert! Stadtfortschritt zurückgesetzt und Stern verliehen.",
    share_official_athlete: "Offizieller Athlet",
    share_free_activity: "FREIES TRAINING",
    share_route_completed: "STRECKE ZU 100% ABSOLVIERT",
    share_distance: "DISTANZ",
    share_elevation: "HÖHENMETER",
    share_duration: "ZEIT",
    xp_to_next_level: "Noch {xp} XP bis Level {level}",
    no_incidents: "Keine aktuellen Verkehrsstörungen gemeldet.",
    reward_desc_double: "Transit-Verdoppler (2.0x XP für alle Läufe heute)",
    reward_desc_booster: "Super Booster (1.5x XP für alle Läufe heute)",
    reward_desc_xp250: "Sofortige Belohnung (+250 XP sofort gutgeschrieben)",
    reward_desc_xp150: "Metro-Belohnung (+150 XP sofort gutgeschrieben)",
    reward_toast_gained: "⚡ +{xp} XP erhalten! (Basis: {base} XP, Multiplikator: {mult}x)",
    reward_toast_validated: "🎫 Ticket validiert! Belohnung: {desc}",
    virtual_journey_completed: "🎉 Virtuelle Reise abgeschlossen! Du hast die Linie {name} ({km} km) erobert.",
    filter_all: "Alle",
    filter_completed: "Erledigt",
    filter_pending: "Ausstehend",
    gpx_upload_title: "Aktivität hochladen (.gpx)",
    gpx_upload_descr: "Importiere eine mit deiner Uhr aufgezeichnete GPX-Datei. Das System erkennt automatisch die zurückgelegte Linie (70% der Haltestellen erforderlich). Sonst wird sie als freier Lauf gespeichert.",
    activity_label: "Aktivität:",
    running: "🏃‍♂️ Laufen",
    walking: "🚶‍♂️ Gehen",
    select_gpx: "📁 GPX auswählen",
    generate_simulated_gpx: "⚙️ Simulierte Aktivität erstellen",
    activity_approved: "Aktivität genehmigt!",
    verification_failed: "Verifizierung fehlgeschlagen",
    xp_accumulated: "Gesammelte XP",
    
    // Additional keys
    medal_gold: "Gold",
    medal_silver: "Silber",
    medal_bronze: "Bronze",
    unlocked: "🏆 Freigeschaltet",
    locked: "🔒 Gesperrt",
    image_downloaded: "Bild heruntergeladen!",
    achievements_title: "Erfolge & Sportmedaillen",
    achievements_desc: "Absolviere Läufe und überwinde städtische Herausforderungen, um einzigartige Medaillen freizuschalten.",
    city_label: "Stadt:",
    country_label: "Land:",
    cancel: "Abbrechen",
    close: "Schließen",
    city_request_descr: "Geben Sie die Stadt und das Land ein, die Sie hinzufügen möchten. Wir extrahieren die Linien."
  },
  it: {
    app_title: "MetroMile",
    feed: "Feed",
    map: "Mappa",
    search: "Cerca",
    profile: "Profilo",
    settings: "Impostazioni",
    active_city: "Città Attiva",
    transport: "Mezzo di Trasporto",
    unit: "Unità di Misura",
    privacy: "Privacy",
    privacy_public: "Pubblico (Chiunque vede la mia cronologia)",
    privacy_followers: "Solo Seguitori (Solo i seguitori vedono i dettagli)",
    privacy_private: "Privato (Solo io vedo i miei dettagli)",
    km: "Chilometri (km)",
    mi: "Miglia (mi)",
    save_close: "Salva e Chiudi",
    connections: "Collegamenti",
    legal_support: "Legale & Supporto",
    about_us: "Chi Siamo?",
    contact: "Contatto e Supporto",
    terms: "Termini e Licenze",
    download_app: "Scarica MetroMile App",
    free_activity: "Corsa Libera",
    simulated_run: "Simula Corsa",
    sync_strava: "Collega account Strava",
    logout: "Esci da Google",
    google_login: "Accesso con Google",
    active_city_label: "Città Attiva:",
    transport_label: "Mezzo di Trasporto:",
    privacy_label: "Privacy del Profilo:",
    unit_label: "Unità di Misura:",
    notifications_label: "Notifiche Attività:",
    notify_follows: "Avvisa quando un nuovo atleta mi segue",
    notify_comments: "Avvisa sui nuovi commenti",
    notify_likes: "Avvisa sui nuovi Mi Piace",
    bio: "Biografia",
    profile_name: "Nome Profilo",
    avatar: "Foto Profilo (Emoji)",
    close_profile: "Chiudi Profilo",
    chat: "Chat",
    follow: "Segui",
    unfollow: "Smetti di seguire",
    stats: "Statistiche",
    activities_plural: "Attività",
    lines_plural: "Linee",
    rank: "Grado",
    level: "Livello",
    recent_activities: "Attività Recenti",
    no_activities: "Nessuna attività registrata in questa città.",
    comments: "Commenti",
    write_comment: "Scrivi un commento...",
    post: "Pubblica",
    like: "Mi piace",
    liked: "Ti piace",
    share: "Condividi",
    city_not_found: "Non trovi la tua città?",
    request_city: "Richiedi attivazione",
    city_requested: "Città richiesta! Analizzeremo il trasporto per aggiungerla presto.",
    simulating: "Simulazione...",
    verify_gps: "Carica file GPX",
    upload_gpx_descr: "Carica un file GPX della tua corsa per verificare se hai completato la tratta.",
    select_file: "Seleziona file GPX",
    drag_drop: "o trascina e rilascia qui",
    level_up: "Aumento di Grado!",
    share_card_title: "Carta Sportiva",
    share_card_descr: "Genera una grafica della tua corsa da condividere sui social.",
    download_image: "Scarica Immagine",

    // New keys
    cid_challenge_title: "Sfida Giornaliera del Cid",
    cid_reward_active: "Bonus Attivo!",
    cid_validate_title: "Valida il tuo biglietto del giorno",
    cid_validate_desc: "Clicca su valida per ottenere XP istantanei o moltiplicatori per le tue corse di oggi.",
    cid_validate_btn: "VALIDA ➔",
    cid_ticket_title: "Biglietto Giornaliero Fortunato",
    cid_ticket_valid: "✓ VALIDATO",
    cid_ticket_pending: "● IN ATTESA",
    perfection_title: "Perfezione della Città",
    perfection_platinum: "PLATINO CONQUISTATO",
    perfection_golds: "Ori",
    perfection_pace_gold: "Ritmo < 4:30",
    perfection_pace_silver: "Ritmo < 5:30",
    perfection_pace_bronze: "Altri ritmi",
    perfection_platinum_desc: "Progresso verso il Trofeo di Platino (Tutti Ori)",
    virtual_journeys_title: "Viaggi della Metro Virtuali",
    virtual_progress_lbl: "Progresso attuale del viaggio",
    virtual_select_lbl: "Seleziona Viaggio Virtuale Attivo:",
    passport_title: "Passaporto delle Città MetroMile",
    passport_lines: "linee",
    passport_conquered: "Città Conquistata al 100%!",
    passport_stamps: "Timbri del Passaporto Guadagnati:",
    prestige_activate_btn: "Attiva Modalità Prestigio",
    prestige_conquered_desc: "Hai completato tutti i percorsi disponibili in questa città. Attiva la Modalità Prestigio per azzerare il tuo progresso locale, guadagnare una stella ★ permanente e ricominciare a competere con un moltiplicatore di grado.",
    prestige_confirm_msg: "Sei sicuro di voler azzerare il tuo progresso nella città attiva e avanzare al prossimo Livello di Prestigio?",
    prestige_alert_msg: "🏆 Modalità Prestigio attivata! Progresso della città azzerato e stella assegnata.",
    share_official_athlete: "Atleta Ufficiale",
    share_free_activity: "CORSA LIBERA",
    share_route_completed: "PERCORSO COMPLETATO AL 100%",
    share_distance: "DISTANZA",
    share_elevation: "DISLIVELLO",
    share_duration: "TEMPO",
    xp_to_next_level: "Mancano {xp} XP al Livello {level}",
    no_incidents: "Nessun disservizio segnalato oggi.",
    reward_desc_double: "Raddoppiatore di Transito (2.0x XP su tutte le corse di oggi)",
    reward_desc_booster: "Super Booster (1.5x XP su tutte le corse di oggi)",
    reward_desc_xp250: "Bonus Istantaneo (+250 XP aggiunti immediatamente)",
    reward_desc_xp150: "Bonus Metro (+150 XP aggiunti immediatamente)",
    reward_toast_gained: "⚡ Hai ottenuto +{xp} XP! (Base: {base} XP, Moltiplicatore: {mult}x)",
    reward_toast_validated: "🎫 Biglietto Validato! Premio: {desc}",
    virtual_journey_completed: "🎉 Viaggio virtuale completato! Hai conquistato la linea {name} ({km} km).",
    filter_all: "Tutte",
    filter_completed: "Completate",
    filter_pending: "In attesa",
    gpx_upload_title: "Carica la tua attività (.gpx)",
    gpx_upload_descr: "Importa un file GPX registrato dal tuo orologio. Il sistema rileverà automaticamente quale linea hai percorso (richiesto il 70% di fermate). Altrimenti verrà salvata come corsa libera.",
    activity_label: "Attività:",
    running: "🏃‍♂️ Corsa",
    walking: "🚶‍♂️ Camminata",
    select_gpx: "📁 Seleziona GPX",
    generate_simulated_gpx: "⚙️ Genera attività simulata",
    activity_approved: "Attività approvata!",
    verification_failed: "Verifica fallita",
    xp_accumulated: "XP Accumulati",
    
    // Additional keys
    medal_gold: "Oro",
    medal_silver: "Argento",
    medal_bronze: "Bronzo",
    unlocked: "🏆 Sbloccato",
    locked: "🔒 Bloccato",
    image_downloaded: "Immagine scaricata!",
    achievements_title: "Traguardi & Medaglie Sportive",
    achievements_desc: "Completa le corse e supera le sfide urbane per guadagnare medaglie uniche.",
    city_label: "Città:",
    country_label: "Paese:",
    cancel: "Annulla",
    close: "Chiudi",
    city_request_descr: "Inserisci la città e il paese che desideri aggiungere. Estrarremo le linee di trasporto."
  },
  pl: {
    app_title: "MetroMile",
    feed: "Feed",
    map: "Mapa",
    search: "Szukaj",
    profile: "Profil",
    settings: "Ustawienia",
    active_city: "Aktywne Miasto",
    transport: "Środek Transportu",
    unit: "Jednostka Miary",
    privacy: "Prywatność",
    privacy_public: "Publiczny (Każdy widzi moją historię)",
    privacy_followers: "Tylko Obserwujący (Tylko moi obserwujący widzą szczegóły)",
    privacy_private: "Prywatny (Tylko ja widzę swoje szczegóły)",
    km: "Kilometry (km)",
    mi: "Mile (mi)",
    save_close: "Zapisz i Zamknij",
    connections: "Połączenia",
    legal_support: "Prawne & Wsparcie",
    about_us: "O nas",
    contact: "Kontakt i Wsparcie",
    terms: "Warunki i Licencje",
    download_app: "Pobierz MetroMile",
    free_activity: "Darmowy Trening",
    simulated_run: "Symuluj Bieg",
    sync_strava: "Połącz konto Strava",
    logout: "Wyloguj Google",
    google_login: "Logowanie Google",
    active_city_label: "Aktywne miasto:",
    transport_label: "Środek transportu:",
    privacy_label: "Prywatność profilu:",
    unit_label: "Jednostka miary:",
    notifications_label: "Powiadomienia o aktywności:",
    notify_follows: "Powiadom, gdy nowy atleta zacznie mnie obserwować",
    notify_comments: "Powiadom o nowych komentarzach",
    notify_likes: "Powiadom, gdy ktoś polubi mój bieg",
    bio: "Biogram",
    profile_name: "Nazwa Profilu",
    avatar: "Zdjęcie Profilowe (Emoji)",
    close_profile: "Zamknij Profil",
    chat: "Czat",
    follow: "Obserwuj",
    unfollow: "Przestań obserwować",
    stats: "Statystyki",
    activities_plural: "Aktywności",
    lines_plural: "Linie",
    rank: "Ranga",
    level: "Poziom",
    recent_activities: "Ostatnie Aktywności",
    no_activities: "Brak aktywności zarejestrowanych w tym mieście.",
    comments: "Komentarze",
    write_comment: "Napisz komentarz...",
    post: "Opublikuj",
    like: "Lubię to",
    liked: "Polubiono",
    share: "Udostępnij",
    city_not_found: "Nie możesz znaleźć swojego miasta?",
    request_city: "Poproś o aktywację",
    city_requested: "Miasto zgłoszone! Przeanalizujemy trasy, aby dodać je wkrótce.",
    simulating: "Symulowanie...",
    verify_gps: "Prześlij plik GPX",
    upload_gpx_descr: "Prześlij plik GPX swojego biegu, aby sprawdzić, czy ukończyłeś trasę.",
    select_file: "Wybierz plik GPX",
    drag_drop: "lub przeciągnij i upuść tutaj",
    level_up: "Awans rangi!",
    share_card_title: "Karta Sportowa",
    share_card_descr: "Generuj grafikę swojego biegu do udostępnienia w mediach społecznościowych.",
    download_image: "Pobierz Obraz",

    // New keys
    cid_challenge_title: "Codzienne wyzwanie Cida",
    cid_reward_active: "Nagroda Aktywna!",
    cid_validate_title: "Skanuj dzisiejszy bilet",
    cid_validate_desc: "Kliknij skanuj, aby zdobyć natychmiastowe XP lub mnożniki na dzisiejsze biegi.",
    cid_validate_btn: "SKANUJ ➔",
    cid_ticket_title: "Codzienny Szczęśliwy Bilet",
    cid_ticket_valid: "✓ SKASOWANY",
    cid_ticket_pending: "● OCZEKUJĄCY",
    perfection_title: "Perfekcja Miasta",
    perfection_platinum: "PLATYNA ZDOBYTA",
    perfection_golds: "Złote",
    perfection_pace_gold: "Tempo < 4:30",
    perfection_pace_silver: "Tempo < 5:30",
    perfection_pace_bronze: "Inne tempa",
    perfection_platinum_desc: "Postęp do Platynowego Trofeum (Wszystkie Złote)",
    virtual_journeys_title: "Wirtualne Podróże Metrem",
    virtual_progress_lbl: "Aktualny postęp podróży",
    virtual_select_lbl: "Wybierz Aktywną Podróż Wirtualną:",
    passport_title: "Paszport Miast MetroMile",
    passport_lines: "linie",
    passport_conquered: "Miasto 100% Zdobyte!",
    passport_stamps: "Zdobyte Pieczątki w Paszporcie:",
    prestige_activate_btn: "Aktywuj Tryb Prestiżu",
    prestige_conquered_desc: "Ukończyłeś wszystkie dostępne trasy w tym mieście. Aktywuj Tryb Prestiżu, aby zresetować lokalny postęp, zdobyć stałą gwiazdkę ★ i zacząć rywalizację z mnożnikiem rangi.",
    prestige_confirm_msg: "Czy na pewno chcesz zresetować postępy w aktywnym mieście i przejść na kolejny Poziom Prestiżu?",
    prestige_alert_msg: "🏆 Tryb Prestiżu aktywowany! Postęp miasta zresetowany i przyznano gwiazdkę.",
    share_official_athlete: "Oficjalny Atleta",
    share_free_activity: "DARMOWY TRENING",
    share_route_completed: "TRASA UKOŃCZONA W 100%",
    share_distance: "DYSTANS",
    share_elevation: "PRZEWYŻSZENIE",
    share_duration: "CZAS",
    xp_to_next_level: "Pozostało {xp} XP do Poziomu {level}",
    no_incidents: "Brak zgłoszonych utrudnień w transporcie.",
    reward_desc_double: "Mnożnik Tranzytu (2.0x XP na wszystkie dzisiejsze biegi)",
    reward_desc_booster: "Super Booster (1.5x XP na wszystkie dzisiejsze biegi)",
    reward_desc_xp250: "Natychmiastowa Nagroda (+250 XP dodane od razu)",
    reward_desc_xp150: "Nagroda Metra (+150 XP dodane od razu)",
    reward_toast_gained: "⚡ Zdobyto +{xp} XP! (Baza: {base} XP, Mnożnik: {mult}x)",
    reward_toast_validated: "🎫 Bilet Skasowany! Nagroda: {desc}",
    virtual_journey_completed: "🎉 Wirtualna podróż ukończona! Zdobyłeś linię {name} ({km} km).",
    filter_all: "Wszystkie",
    filter_completed: "Ukończone",
    filter_pending: "Oczekujące",
    gpx_upload_title: "Prześlij swoją aktywność (.gpx)",
    gpx_upload_descr: "Importuj plik GPX nagrany przez Twój zegarek. System automatycznie wykryje, którą linię pokonałeś (wymagane 70% przystanków). W przeciwnym razie zostanie zapisany jako wolny trening.",
    activity_label: "Aktywność:",
    running: "🏃‍♂️ Bieganie",
    walking: "🚶‍♂️ Chodzenie",
    select_gpx: "📁 Wybierz GPX",
    generate_simulated_gpx: "⚙️ Generuj symulowaną aktywność",
    activity_approved: "Aktywność zatwierdzona!",
    verification_failed: "Weryfikacja nieudana",
    xp_accumulated: "Skumulowane XP",
    
    // Additional keys
    medal_gold: "Złoto",
    medal_silver: "Srebro",
    medal_bronze: "Brąz",
    unlocked: "🏆 Odblokowano",
    locked: "🔒 Zablokowano",
    image_downloaded: "Obraz pobrany!",
    achievements_title: "Osiągnięcia i Medale",
    achievements_desc: "Ukończ biegi i pokonaj wyzwania miejskie, aby zdobyć unikalne medale.",
    city_label: "Miasto:",
    country_label: "Kraj:",
    cancel: "Anuluj",
    close: "Zamknij",
    city_request_descr: "Wpisz miasto i kraj, które chcesz dodać. Pobierzemy linie komunikacji miejskiej."
  },
  cs: {
    app_title: "MetroMile",
    feed: "Feed",
    map: "Mapa",
    search: "Hledat",
    profile: "Profil",
    settings: "Nastavení",
    active_city: "Aktivní Město",
    transport: "Dopravní Prostředek",
    unit: "Měrná Jednotka",
    privacy: "Soukromí",
    privacy_public: "Veřejné (Každý vidí moji historii)",
    privacy_followers: "Pouze Sledující (Podrobnosti vidí pouze sledující)",
    privacy_private: "Soukromé (Podrobnosti vidím pouze já)",
    km: "Kilometry (km)",
    mi: "Míle (mi)",
    save_close: "Uložit a Zavřít",
    connections: "Spojení",
    legal_support: "Právní Informace & Podpora",
    about_us: "O Nás",
    contact: "Kontakt a Podpora",
    terms: "Podmínky a Licence",
    download_app: "Stáhnout MetroMile",
    free_activity: "Volný Trénink",
    simulated_run: "Simulovat Běh",
    sync_strava: "Propojit účet Strava",
    logout: "Odhlásit Google",
    google_login: "Přihlášení přes Google",
    active_city_label: "Aktivní město:",
    transport_label: "Dopravní prostředek:",
    privacy_label: "Soukromí profilu:",
    unit_label: "Měrná jednotka:",
    notifications_label: "Upozornění na aktivitu:",
    notify_follows: "Upozornit, když mě začne sledovat nový sportovec",
    notify_comments: "Upozornit na nové komentáře",
    notify_likes: "Upozornit, když se někomu líbí můj běh",
    bio: "Životopis",
    profile_name: "Název Profilu",
    avatar: "Profilová Fotka (Emoji)",
    close_profile: "Zavřít Profil",
    chat: "Chat",
    follow: "Sledovat",
    unfollow: "Zrušit sledování",
    stats: "Statistiky",
    activities_plural: "Aktivity",
    lines_plural: "Linky",
    rank: "Hodnost",
    level: "Úroveň",
    recent_activities: "Nedávné Aktivity",
    no_activities: "V tomto městě nejsou registrovány žádné aktivity.",
    comments: "Komentáře",
    write_comment: "Napsat komentář...",
    post: "Publikovat",
    like: "To se mi líbí",
    liked: "Líbí se",
    share: "Sdílet",
    city_not_found: "Nemůžete najít své město?",
    request_city: "Požádat o aktivaci",
    city_requested: "Město vyžádáno! Brzy zanalyzujeme dopravní trasy a přidáme ho.",
    simulating: "Simulování...",
    verify_gps: "Nahrát soubor GPX",
    upload_gpx_descr: "Nahrajte GPX soubor svého běhu, abyste ověřili, zda jste trasu dokončili.",
    select_file: "Vybrat soubor GPX",
    drag_drop: "nebo přetáhněte sem",
    level_up: "Zvýšení hodnosti!",
    share_card_title: "Sportovní Karta",
    share_card_descr: "Vygenerujte grafickou kartu svého běhu pro sdílení na sociálních sítích.",
    download_image: "Stáhnout Obrázek",

    // New keys
    cid_challenge_title: "Denní Cidova Výzva",
    cid_reward_active: "Aktivní Odměna!",
    cid_validate_title: "Označte dnešní jízdenku",
    cid_validate_desc: "Klikněte na označit pro získání okamžitých XP nebo násobitelů pro dnešní běhy.",
    cid_validate_btn: "OZNAČIT ➔",
    cid_ticket_title: "Denní Šťastná Jízdenka",
    cid_ticket_valid: "✓ OZNAČENO",
    cid_ticket_pending: "● ČEKÁ",
    perfection_title: "Perfekce Města",
    perfection_platinum: "PLATINA ZÍSKÁNA",
    perfection_golds: "Zlaté",
    perfection_pace_gold: "Tempo < 4:30",
    perfection_pace_silver: "Tempo < 5:30",
    perfection_pace_bronze: "Jiná tempa",
    perfection_platinum_desc: "Pokrok k Platinové Trofeji (Vše Zlaté)",
    virtual_journeys_title: "Virtuální Cesty Metrem",
    virtual_progress_lbl: "Aktuální pokrok cesty",
    virtual_select_lbl: "Vyberte Aktivní Virtuální Cestu:",
    passport_title: "Pas Měst MetroMile",
    passport_lines: "linky",
    passport_conquered: "Město 100% Dobyto!",
    passport_stamps: "Získaná Razítka v Pasu:",
    prestige_activate_btn: "Aktivovat Prestižní Mód",
    prestige_conquered_desc: "Dokončili jste všechny dostupné trasy v tomto městě. Aktivujte Prestižní Mód pro resetování lokálního pokroku, získání permanentní ★ a zahájení nového soutěžení s násobitelem hodnosti.",
    prestige_confirm_msg: "Jste si jisti, že chcete resetovat svůj pokrok v aktivním městě a postoupit na další Prestižní Úroveň?",
    prestige_alert_msg: "🏆 Prestižní Mód aktivován! Místní pokrok byl resetován a byla udělena hvězda.",
    share_official_athlete: "Oficiální Sportovec",
    share_free_activity: "VOLNÝ TRÉNINK",
    share_route_completed: "TRASA DOKONČENA NA 100%",
    share_distance: "VZDÁLENOST",
    share_elevation: "PŘEVÝŠENÍ",
    share_duration: "ČAS",
    xp_to_next_level: "Chybí {xp} XP do Úrovně {level}",
    no_incidents: "Dnes nejsou hlášeny žádné mimořádnosti v dopravě.",
    reward_desc_double: "Transitní Dvojnásobek (2.0x XP na všechny dnešní běhy)",
    reward_desc_booster: "Super Booster (1.5x XP na všechny dnešní běhy)",
    reward_desc_xp250: "Okamžitá Odměna (+250 XP okamžitě přidáno)",
    reward_desc_xp150: "Metro Odměna (+150 XP okamžitě přidáno)",
    reward_toast_gained: "⚡ Získáno +{xp} XP! (Základ: {base} XP, Násobitel: {mult}x)",
    reward_toast_validated: "🎫 Jízdenka Označena! Odměna: {desc}",
    virtual_journey_completed: "🎉 Virtuální cesta dokončena! Dobyl jsi linku {name} ({km} km).",
    filter_all: "Všechny",
    filter_completed: "Dokončené",
    filter_pending: "Nevyřízené",
    gpx_upload_title: "Nahrát vaši aktivitu (.gpx)",
    gpx_upload_descr: "Importujte GPX soubor nahraný vašimi hodinkami. Systém automaticky detekuje, kterou linku jste projeli (vyžadováno 70 % zastávek). Jinak se uloží jako volný trénink.",
    activity_label: "Aktivita:",
    running: "🏃‍♂️ Běh",
    walking: "🚶‍♂️ Chůze",
    select_gpx: "📁 Vybrat GPX",
    generate_simulated_gpx: "⚙️ Generovat simulovanou aktivitu",
    activity_approved: "Aktivita schválena!",
    verification_failed: "Ověření selhalo",
    xp_accumulated: "Nasbírané XP",
    
    // Additional keys
    medal_gold: "Zlato",
    medal_silver: "Stříbro",
    medal_bronze: "Bronz",
    unlocked: "🏆 Odemčeno",
    locked: "🔒 Uzamčeno",
    image_downloaded: "Obrázek stažen!",
    achievements_title: "Sportovní úspěchy a medaile",
    achievements_desc: "Dokončete běhy a překonávejte městské výzvy, abyste získali jedinečné medaile.",
    city_label: "Město:",
    country_label: "Země:",
    cancel: "Zrušit",
    close: "Zavřít",
    city_request_descr: "Zadejte město a zemi, kterou chcete přidat. Získáme trasy veřejné dopravy."
  }
};`;

const originalTransSlice = app.substring(transStartIdx, transEndIdx + 1);
app = app.replace(originalTransSlice, translationsStr);
console.log('App.tsx translations successfully updated.');

// ====================================================
// 3. Process Code Replacements in App.tsx (Multi-language & Theme usability)
// ====================================================

// Update translator function type cast to support the new languages
app = app.replace(
  `lang as 'es' | 'en' | 'fr' | 'de'`,
  `lang as 'es' | 'en' | 'fr' | 'de' | 'it' | 'pl' | 'cs'`
);

// Settings active tab dropdown options in App.tsx (lines 6491-6500)
const selectOptionsOriginal = `<option value="es">Español (ES)</option>
                    <option value="en">English (EN)</option>
                    <option value="fr">Français (FR)</option>
                    <option value="de">Deutsch (DE)</option>`;

const selectOptionsReplacement = `<option value="es">Español (ES)</option>
                    <option value="en">English (EN)</option>
                    <option value="fr">Français (FR)</option>
                    <option value="de">Deutsch (DE)</option>
                    <option value="it">Italiano (IT)</option>
                    <option value="pl">Polski (PL)</option>
                    <option value="cs">Čeština (CS)</option>`;

app = app.replace(selectOptionsOriginal, selectOptionsReplacement);

// Replace bottom nav labels (Feed, Mapa, Buscador, Perfil) with translation calls
app = app.replace('<span>Feed</span>', '<span>{t(\'feed\')}</span>');
app = app.replace('<span>Mapa</span>', '<span>{t(\'map\')}</span>');
app = app.replace('<span>Buscador</span>', '<span>{t(\'search\')}</span>');
app = app.replace('<span>Perfil</span>', '<span>{t(\'profile\')}</span>');

// Replace settings active tabs style with segmented control classes and translate them
const settingsTabsOriginal = `<div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '16px', overflowX: 'auto', gap: '4px', whiteSpace: 'nowrap', paddingBottom: '4px' }}>
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
            </div>`;

const settingsTabsReplacement = `<div className="segmented-control">
              <button 
                onClick={() => setSettingsActiveTab('profile')}
                className={\`segmented-control-btn \${settingsActiveTab === 'profile' ? 'active' : ''}\`}
              >
                <Icons.Profile style={{ width: '14px', height: '14px' }} /> {t('profile')}
              </button>
              <button 
                onClick={() => setSettingsActiveTab('preferences')}
                className={\`segmented-control-btn \${settingsActiveTab === 'preferences' ? 'active' : ''}\`}
              >
                <Icons.Gear style={{ width: '14px', height: '14px' }} /> {t('settings')}
              </button>
              <button 
                onClick={() => setSettingsActiveTab('devices')}
                className={\`segmented-control-btn \${settingsActiveTab === 'devices' ? 'active' : ''}\`}
              >
                <Icons.Link style={{ width: '14px', height: '14px' }} /> {t('connections')}
              </button>
              <button 
                onClick={() => setSettingsActiveTab('info')}
                className={\`segmented-control-btn \${settingsActiveTab === 'info' ? 'active' : ''}\`}
              >
                <Icons.Info style={{ width: '14px', height: '14px' }} /> {t('legal_support')}
              </button>
            </div>`;

app = app.replace(settingsTabsOriginal, settingsTabsReplacement);

// Replace line filters (Todas, Hechas, Pendientes) on Map with segmented-control-mini and translate
const mapFiltersOriginal = `<div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
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
                  </div>`;

const mapFiltersReplacement = `<div className="segmented-control-mini">
                    <button 
                      onClick={() => setFilterType('all')}
                      className={\`segmented-control-mini-btn \${filterType === 'all' ? 'active' : ''}\`}
                    >
                      {t('filter_all')}
                    </button>
                    <button 
                      onClick={() => setFilterType('completed')}
                      className={\`segmented-control-mini-btn \${filterType === 'completed' ? 'active' : ''}\`}
                    >
                      {t('filter_completed')}
                    </button>
                    <button 
                      onClick={() => setFilterType('pending')}
                      className={\`segmented-control-mini-btn \${filterType === 'pending' ? 'active' : ''}\`}
                    >
                      {t('filter_pending')}
                    </button>
                  </div>`;

app = app.replace(mapFiltersOriginal, mapFiltersReplacement);

// Replace remaining hardcoded bilingual variables in App.tsx
// 1. Virtual Progress completion toast
app = app.replace(
  `userSettings.lang === 'es' \n              ? \`🎉 ¡Viaje Virtual Completado! Has conquistado la línea \${journey.nameEs} (\${journey.totalKm} km).\` \n              : \`🎉 Virtual Journey Completed! You've conquered the \${journey.nameEn} line (\${journey.totalKm} km).\``,
  `t('virtual_journey_completed').replace('{name}', userSettings.lang === 'es' ? journey.nameEs : journey.nameEn).replace('{km}', String(journey.totalKm))`
);
app = app.replace(
  `userSettings.lang === 'es' \r\n              ? \`🎉 ¡Viaje Virtual Completado! Has conquistado la línea \${journey.nameEs} (\${journey.totalKm} km).\` \r\n              : \`🎉 Virtual Journey Completed! You've conquered the \${journey.nameEn} line (\${journey.totalKm} km).\``,
  `t('virtual_journey_completed').replace('{name}', userSettings.lang === 'es' ? journey.nameEs : journey.nameEn).replace('{km}', String(journey.totalKm))`
);

// 2. Gained XP notification
app = app.replace(
  `userSettings.lang === 'es' \n          ? \`⚡ ¡Ganaste +\${finalXp} XP! (Base: \${baseXp} XP, Multiplicador: \${multiplier}x)\` \n          : \`⚡ Earned +\${finalXp} XP! (Base: \${baseXp} XP, Multiplier: \${multiplier}x)\``,
  `t('reward_toast_gained').replace('{xp}', String(finalXp)).replace('{base}', String(baseXp)).replace('{mult}', String(multiplier))`
);
app = app.replace(
  `userSettings.lang === 'es' \r\n          ? \`⚡ ¡Ganaste +\${finalXp} XP! (Base: \${baseXp} XP, Multiplicador: \${multiplier}x)\` \r\n          : \`⚡ Earned +\${finalXp} XP! (Base: \${baseXp} XP, Multiplier: \${multiplier}x)\``,
  `t('reward_toast_gained').replace('{xp}', String(finalXp)).replace('{base}', String(baseXp)).replace('{mult}', String(multiplier))`
);

// 3. Ticket validation rewards list
app = app.replace(
  `const rewards = [
      { type: 'multiplier', value: 2.0, desc: userSettings.lang === 'es' ? 'Duplicador de Tránsito (2.0x XP en todas tus carreras hoy)' : 'Transit Doubler (2.0x XP on all runs today)', icon: '⚡' },
      { type: 'multiplier', value: 1.5, desc: userSettings.lang === 'es' ? 'Super Booster (1.5x XP en todas tus carreras hoy)' : 'Super Booster (1.5x XP on all runs today)', icon: '🔥' },
      { type: 'xp', value: 250, desc: userSettings.lang === 'es' ? 'Recompensa Instantánea (+250 XP añadidos de inmediato)' : 'Instant Reward (+250 XP added immediately)', icon: '🎁' },
      { type: 'xp', value: 150, desc: userSettings.lang === 'es' ? 'Recompensa de Metro (+150 XP añadidos de inmediato)' : 'Metro Reward (+150 XP added immediately)', icon: '🎫' }
    ];`,
  `const rewards = [
      { type: 'multiplier', value: 2.0, desc: t('reward_desc_double'), icon: '⚡' },
      { type: 'multiplier', value: 1.5, desc: t('reward_desc_booster'), icon: '🔥' },
      { type: 'xp', value: 250, desc: t('reward_desc_xp250'), icon: '🎁' },
      { type: 'xp', value: 150, desc: t('reward_desc_xp150'), icon: '🎫' }
    ];`
);

// 4. Ticket validated toast
app = app.replace(
  `userSettings.lang === 'es' \n        ? \`🎫 ¡Billete Validado! Recompensa: \${reward.desc}\` \n        : \`🎫 Ticket Validated! Reward: \${reward.desc}\``,
  `t('reward_toast_validated').replace('{desc}', reward.desc)`
);
app = app.replace(
  `userSettings.lang === 'es' \r\n        ? \`🎫 ¡Billete Validado! Recompensa: \${reward.desc}\` \r\n        : \`🎫 Ticket Validated! Reward: \${reward.desc}\``,
  `t('reward_toast_validated').replace('{desc}', reward.desc)`
);

// 5. Prestige reset notification
app = app.replace(
  `addNotification('MetroMile', userSettings.lang === 'es' ? '🏆 ¡Modo Prestigio iniciado! Progreso de ciudad reiniciado y estrella ganada.' : '🏆 Prestige Mode activated! City progress reset and star awarded.', 'success');`,
  `addNotification('MetroMile', t('prestige_alert_msg'), 'success');`
);

// 6. Canvas Card text translations
app = app.replace(
  `ctx.fillText(userSettings.lang === 'es' ? 'Atleta Oficial' : 'Official Athlete', 75, 142);`,
  `ctx.fillText(t('share_official_athlete'), 75, 142);`
);
app = app.replace(
  `const completionText = selectedShareActivity.lineRef === 'LIBRE' \n      ? (userSettings.lang === 'es' ? 'ENTRENAMIENTO LIBRE' : 'FREE ACTIVITY')\n      : (userSettings.lang === 'es' ? 'TRAYECTO 100% COMPLETADO' : 'ROUTE 100% COMPLETED');`,
  `const completionText = selectedShareActivity.lineRef === 'LIBRE' \n      ? t('share_free_activity')\n      : t('share_route_completed');`
);
app = app.replace(
  `const completionText = selectedShareActivity.lineRef === 'LIBRE' \r\n      ? (userSettings.lang === 'es' ? 'ENTRENAMIENTO LIBRE' : 'FREE ACTIVITY')\r\n      : (userSettings.lang === 'es' ? 'TRAYECTO 100% COMPLETADO' : 'ROUTE 100% COMPLETED');`,
  `const completionText = selectedShareActivity.lineRef === 'LIBRE' \r\n      ? t('share_free_activity')\r\n      : t('share_route_completed');`
);
app = app.replace(
  `ctx.fillText(userSettings.lang === 'es' ? 'DISTANCIA' : 'DISTANCE', 40, 310);`,
  `ctx.fillText(t('share_distance'), 40, 310);`
);
app = app.replace(
  `ctx.fillText(userSettings.lang === 'es' ? 'DESNIVEL' : 'ELEVATION', 170, 310);`,
  `ctx.fillText(t('share_elevation'), 170, 310);`
);
app = app.replace(
  `ctx.fillText(userSettings.lang === 'es' ? 'TIEMPO' : 'DURATION', 290, 310);`,
  `ctx.fillText(t('share_duration'), 290, 310);`
);

// 7. XP Gauge remaining text
app = app.replace(
  `{userSettings.lang === 'es' ? \`Faltan \${1000 - (xp % 1000)} XP para Nivel \${currentLevel + 1}\` : \`\${1000 - (xp % 1000)} XP to Level \${currentLevel + 1}\`}`,
  `{t('xp_to_next_level').replace('{xp}', String(1000 - (xp % 1000))).replace('{level}', String(currentLevel + 1))}`
);

// 8. Incidents fallback text
app = app.replace(
  `{userSettings.lang === 'es' ? 'No hay incidencias reportadas hoy.' : 'No active transit incidents today.'}`,
  `{t('no_incidents')}`
);

// 9. Daily Ticket Validation texts in UI
app = app.replace(
  `🎫 {userSettings.lang === 'es' ? 'Billete Diario de la Suerte' : 'Daily Lucky Metro Ticket'}`,
  `🎫 {t('cid_ticket_title')}`
);
app = app.replace(
  `{ticketCheckedDate === new Date().toDateString() ? (userSettings.lang === 'es' ? '✓ VALIDADO' : '✓ VALIDATED') : (userSettings.lang === 'es' ? '● PENDIENTE' : '● PENDING')}`,
  `{ticketCheckedDate === new Date().toDateString() ? t('cid_ticket_valid') : t('cid_ticket_pending')}`
);
app = app.replace(
  `? (userSettings.lang === 'es' ? '¡Recompensa Activa!' : 'Active Reward!') \n                            : (userSettings.lang === 'es' ? 'Valida tu billete del día' : 'Validate today\\'s ticket')`,
  `? t('cid_reward_active') : t('cid_validate_title')`
);
app = app.replace(
  `? (userSettings.lang === 'es' ? '¡Recompensa Activa!' : 'Active Reward!') \r\n                            : (userSettings.lang === 'es' ? 'Valida tu billete del día' : 'Validate today\\'s ticket')`,
  `? t('cid_reward_active') : t('cid_validate_title')`
);
app = app.replace(
  `: (userSettings.lang === 'es' ? 'Haz clic en validar para conseguir XP instantáneos o multiplicadores para tus carreras de hoy.' : 'Click validate to get instant XP or multipliers for today\\'s activities.')`,
  `: t('cid_validate_desc')`
);
app = app.replace(
  `{userSettings.lang === 'es' ? 'VALIDAR ➔' : 'VALIDATE ➔'}`,
  `{t('cid_validate_btn')}`
);

// 10. City Perfection widget in Profile tab
app = app.replace(
  `🏆 {userSettings.lang === 'es' ? 'Perfección de Ciudad' : 'City Perfection'}`,
  `🏆 {t('perfection_title')}`
);
app = app.replace(
  `💍 {userSettings.lang === 'es' ? 'PLATINO ADQUIRIDO' : 'PLATINUM CONQUERED'}`,
  `💍 {t('perfection_platinum')}`
);
app = app.replace(
  `{activeCityMedals.gold} / {totalBurgosLinesCount} {userSettings.lang === 'es' ? 'Oros' : 'Golds'}`,
  `{activeCityMedals.gold} / {totalBurgosLinesCount} {t('perfection_golds')}`
);
app = app.replace(
  `{userSettings.lang === 'es' ? 'Ritmo < 4:30' : 'Pace < 4:30'}`,
  `{t('perfection_pace_gold')}`
);
app = app.replace(
  `{userSettings.lang === 'es' ? 'Ritmo < 5:30' : 'Pace < 5:30'}`,
  `{t('perfection_pace_silver')}`
);
app = app.replace(
  `{userSettings.lang === 'es' ? 'Otros ritmos' : 'Other paces'}`,
  `{t('perfection_pace_bronze')}`
);
app = app.replace(
  `{userSettings.lang === 'es' ? 'Progreso hacia Trofeo de Platino (Todas Oro)' : 'Progress to Platinum Trophy (All Gold)'}`,
  `{t('perfection_platinum_desc')}`
);

// 11. Virtual Journeys UI
app = app.replace(
  `🚇 {userSettings.lang === 'es' ? 'Viajes de Metro Virtuales' : 'Virtual Metro Journeys'}`,
  `🚇 {t('virtual_journeys_title')}`
);
app = app.replace(
  `{userSettings.lang === 'es' ? 'Progreso actual de viaje' : 'Current voyage progress'}`,
  `{t('virtual_progress_lbl')}`
);
app = app.replace(
  `{userSettings.lang === 'es' ? 'Seleccionar Viaje Virtual Activo:' : 'Select Active Virtual Journey:'}`,
  `{t('virtual_select_lbl')}`
);

// 12. Passport & Prestige reset in UI
app = app.replace(
  `🛂 {userSettings.lang === 'es' ? 'Pasaporte de Ciudades MetroMile' : 'MetroMile Cities Passport'}`,
  `🛂 {t('passport_title')}`
);
app = app.replace(
  `{city.completedCount} / {city.totalCount} {userSettings.lang === 'es' ? 'líneas' : 'lines'}`,
  `{city.completedCount} / {city.totalCount} {t('passport_lines')}`
);
app = app.replace(
  `{userSettings.lang === 'es' ? '¡Ciudad 100% Conquistada!' : 'City 100% Conquered!'}`,
  `{t('passport_conquered')}`
);
app = app.replace(
  `{userSettings.lang === 'es' \n                        ? 'Has completado todas las rutas disponibles en esta ciudad. Activa el Modo Prestigio para reiniciar tu progreso local, ganar una medalla permanente ★ y volver a competir con un multiplicador de rango.'\n                        : 'You have completed all available routes in this city. Activate Prestige Mode to reset your local progress, earn a permanent ★ badge, and start competing again with a rank multiplier.'}`,
  `{t('prestige_conquered_desc')}`
);
app = app.replace(
  `{userSettings.lang === 'es' \r\n                        ? 'Has completado todas las rutas disponibles en esta ciudad. Activa el Modo Prestigio para reiniciar tu progreso local, ganar una medalla permanente ★ y volver a competir con un multiplicador de rango.'\r\n                        : 'You have completed all available routes in this city. Activate Prestige Mode to reset your local progress, earn a permanent ★ badge, and start competing again with a rank multiplier.'}`,
  `{t('prestige_conquered_desc')}`
);
app = app.replace(
  `confirm(userSettings.lang === 'es' \n                          ? '¿Estás seguro de que deseas reiniciar tu progreso de la ciudad activa y avanzar al siguiente Nivel de Prestigio?' \n                          : 'Are you sure you want to reset your progress for the active city and advance to the next Prestige Level?')`,
  `confirm(t('prestige_confirm_msg'))`
);
app = app.replace(
  `confirm(userSettings.lang === 'es' \r\n                          ? '¿Estás seguro de que deseas reiniciar tu progreso de la ciudad activa y avanzar al siguiente Nivel de Prestigio?' \r\n                          : 'Are you sure you want to reset your progress for the active city and advance to the next Prestige Level?')`,
  `confirm(t('prestige_confirm_msg'))`
);
app = app.replace(
  `★ {userSettings.lang === 'es' ? 'Iniciar Modo Prestigio' : 'Activate Prestige Mode'}`,
  `★ {t('prestige_activate_btn')}`
);
app = app.replace(
  `🎒 {userSettings.lang === 'es' ? 'Sellos de Pasaporte Adquiridos:' : 'Earned Passport Stamps:'}`,
  `🎒 {t('passport_stamps')}`
);

// 13. GPX Sandbox Uploader in App.tsx (lines 5644-5700)
app = app.replace(
  `<h3>Sube tu Actividad (.gpx)</h3>`,
  `<h3>{t('gpx_upload_title')}</h3>`
);
app = app.replace(
  `<p className="gpx-help">\n                    Importa un archivo GPX grabado por tu reloj. El sistema autodetectará de forma inteligente qué línea de autobús has recorrido (se requiere un 70% de paradas visitadas). Si no coincide con ninguna, se guardará como un rodaje libre.\n                  </p>`,
  `<p className="gpx-help">{t('gpx_upload_descr')}</p>`
);
app = app.replace(
  `<p className="gpx-help">\r\n                    Importa un archivo GPX grabado por tu reloj. El sistema autodetectará de forma inteligente qué línea de autobús has recorrido (se requiere un 70% de paradas visitadas). Si no coincide con ninguna, se guardará como un rodaje libre.\r\n                  </p>`,
  `<p className="gpx-help">{t('gpx_upload_descr')}</p>`
);
app = app.replace(
  `<label>Actividad: </label>`,
  `<label>{t('activity_label')} </label>`
);
app = app.replace(
  `🏃‍♂️ Corriendo`,
  `{t('running')}`
);
app = app.replace(
  `🚶‍♂️ Caminando`,
  `{t('walking')}`
);
app = app.replace(
  `📁 Seleccionar GPX`,
  `{t('select_gpx')}`
);
app = app.replace(
  `⚙️ Generar Actividad Simulada`,
  `{t('generate_simulated_gpx')}`
);
app = app.replace(
  `<h4>{gpxResult.success ? '¡Actividad Aprobada!' : 'Verificación Fallida'}</h4>`,
  `<h4>{gpxResult.success ? t('activity_approved') : t('verification_failed')}</h4>`
);

// 14. XP Accumulated label
app = app.replace(
  `<span>XP Acumulada</span>`,
  `<span>{t('xp_accumulated')}</span>`
);

// 15. Athlete profiles completed lines shadow colors
app = app.replace(
  `background: 'rgba(252, 82, 0, 0.15)', color: 'var(--brand-orange)', padding: '3px 8px', borderRadius: '4px', border: '1px solid rgba(252, 82, 0, 0.25)'`,
  `background: 'var(--brand-orange-light)', color: 'var(--brand-orange)', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border-color)'`
);

// 16. Dynamic Leaflet polyline colors based on selected transit line
app = app.replace(
  `<Polyline \n                        positions={selectedLine.coords.map(([lat, lon]) => [lat, lon])} \n                        color="#fc5200" \n                        weight={6} \n                        opacity={0.88} \n                      />`,
  `<Polyline \n                        positions={selectedLine.coords.map(([lat, lon]) => [lat, lon])} \n                        color={selectedLine.color || '#3b82f6'} \n                        weight={6} \n                        opacity={0.88} \n                      />`
);
app = app.replace(
  `<Polyline \r\n                        positions={selectedLine.coords.map(([lat, lon]) => [lat, lon])} \r\n                        color="#fc5200" \r\n                        weight={6} \r\n                        opacity={0.88} \r\n                      />`,
  `<Polyline \n                        positions={selectedLine.coords.map(([lat, lon]) => [lat, lon])} \n                        color={selectedLine.color || '#3b82f6'} \n                        weight={6} \n                        opacity={0.88} \n                      />`
);
app = app.replace(
  `color="#fc5200" \n                  weight={6} \n                  opacity={0.9} \n                  positions={recordingCoords}`,
  `color="#3b82f6" \n                  weight={6} \n                  opacity={0.9} \n                  positions={recordingCoords}`
);
app = app.replace(
  `color="#fc5200" \r\n                  weight={6} \r\n                  opacity={0.9} \r\n                  positions={recordingCoords}`,
  `color="#3b82f6" \n                  weight={6} \n                  opacity={0.9} \n                  positions={recordingCoords}`
);
app = app.replace(
  `positions={recordingCoords} color="#fc5200" weight={6} opacity={0.9}`,
  `positions={recordingCoords} color="#3b82f6" weight={6} opacity={0.9}`
);


// ====================================================
// NEW REPLACEMENTS: Modals, achievements, image toast, gold/silver/bronze
// ====================================================

// 17. Achievements title and subtitle
app = app.replace(
  `<h3 className="section-title">{userSettings.lang === 'es' ? 'Logros y Medallas Deportivas' : 'Sporting Achievements & Medals'}</h3>`,
  `<h3 className="section-title">{t('achievements_title')}</h3>`
);
app = app.replace(
  `{userSettings.lang === 'es' ? 'Completa carreras y supera los retos urbanos para ganar medallas únicas.' : 'Complete runs and conquer urban challenges to unlock unique badges.'}`,
  `t('achievements_desc')`
);
app = app.replace(
  `{isUnlocked ? (userSettings.lang === 'es' ? '🏆 Desbloqueado' : '🏆 Unlocked') : (userSettings.lang === 'es' ? 'Bloqueado' : 'Locked')}`,
  `isUnlocked ? t('unlocked') : t('locked')`
);

// 18. Medal labels in Profile tab (Gold/Silver/Bronze)
app = app.replaceAll(
  `? { icon: '🥇', label: userSettings.lang === 'es' ? 'Oro' : 'Gold' }`,
  `? { icon: '🥇', label: t('medal_gold') }`
);
app = app.replaceAll(
  `? { icon: '🥈', label: userSettings.lang === 'es' ? 'Plata' : 'Silver' }`,
  `? { icon: '🥈', label: t('medal_silver') }`
);
app = app.replaceAll(
  `: { icon: '🥉', label: userSettings.lang === 'es' ? 'Bronce' : 'Bronze' }`,
  `: { icon: '🥉', label: t('medal_bronze') }`
);

// 19. Image downloaded toast notification
app = app.replace(
  `addNotification('MetroMile', userSettings.lang === 'es' ? '¡Imagen descargada!' : 'Image downloaded!', 'success');`,
  `addNotification('MetroMile', t('image_downloaded'), 'success');`
);

// 20. City Request Modal labels and Cancel/Close buttons
app = app.replace(
  `{userSettings.lang === 'es' ? 'Cerrar' : 'Close'}`,
  `{t('close')}`
);
app = app.replace(
  `{userSettings.lang === 'es' \n                ? 'Indica el nombre de la ciudad y país que deseas agregar. Extraeremos sus líneas de transporte público en nuestra base de datos.'\n                : 'Enter the city and country you would like us to add. We will extract its transit lines into our global database.'}`,
  `t('city_request_descr')`
);
app = app.replace(
  `{userSettings.lang === 'es' \r\n                ? 'Indica el nombre de la ciudad y país que deseas agregar. Extraeremos sus líneas de transporte público en nuestra base de datos.'\r\n                : 'Enter the city and country you would like us to add. We will extract its transit lines into our global database.'}`,
  `t('city_request_descr')`
);
app = app.replace(
  `{userSettings.lang === 'es' ? 'Ciudad:' : 'City:'}`,
  `{t('city_label')}`
);
app = app.replace(
  `{userSettings.lang === 'es' ? 'País:' : 'Country:'}`,
  `{t('country_label')}`
);
app = app.replace(
  `{userSettings.lang === 'es' ? 'Cancelar' : 'Cancel'}`,
  `{t('cancel')}`
);

fs.writeFileSync(appPath, app, 'utf8');
console.log('App.tsx successfully fully updated with all remaining translations.');
