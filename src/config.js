// ============================================================================
// PronoScope — Configuration et constantes partagées
// ============================================================================

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const APP_NAME = 'PronoScope';
export const APP_TAGLINE = "L'observatoire statistique du sport";
export const APP_VERSION = '1.0.0';

// ----------------------------------------------------------------------------
// Sports
// ----------------------------------------------------------------------------
export const SPORTS = {
  football: {
    key: 'football',
    label: 'Football',
    emoji: '⚽',
    icon: 'football',
    accent: '#10b981',
    accent2: '#34d399',
    description: 'Poisson bivarié · Dixon-Coles',
  },
  basketball: {
    key: 'basketball',
    label: 'Basketball',
    emoji: '🏀',
    icon: 'basketball',
    accent: '#f97316',
    accent2: '#fb923c',
    description: 'Loi normale des points',
  },
  tennis: {
    key: 'tennis',
    label: 'Tennis',
    emoji: '🎾',
    icon: 'tennis',
    accent: '#facc15',
    accent2: '#fde047',
    description: 'Service/retour · Monte-Carlo',
  },
};

export const SPORT_KEYS = Object.keys(SPORTS);

// ----------------------------------------------------------------------------
// Compétitions suivies (métadonnées d'affichage)
// ----------------------------------------------------------------------------
export const COMPETITIONS = {
  'en.1': { name: 'Premier League', country: 'Angleterre', code: 'EN', sport: 'football' },
  'en.2': { name: 'Championship', country: 'Angleterre', code: 'EN', sport: 'football' },
  'es.1': { name: 'LaLiga', country: 'Espagne', code: 'ES', sport: 'football' },
  'it.1': { name: 'Serie A', country: 'Italie', code: 'IT', sport: 'football' },
  'de.1': { name: 'Bundesliga', country: 'Allemagne', code: 'DE', sport: 'football' },
  'fr.1': { name: 'Ligue 1', country: 'France', code: 'FR', sport: 'football' },
  'pt.1': { name: 'Primeira Liga', country: 'Portugal', code: 'PT', sport: 'football' },
  'nl.1': { name: 'Eredivisie', country: 'Pays-Bas', code: 'NL', sport: 'football' },
  nba: { name: 'NBA', country: 'États-Unis', code: 'US', sport: 'basketball' },
  atp: { name: 'ATP Tour', country: 'International', code: 'ATP', sport: 'tennis' },
  wta: { name: 'WTA Tour', country: 'International', code: 'WTA', sport: 'tennis' },
};

export function competitionMeta(code) {
  return (
    COMPETITIONS[code] ?? {
      name: code,
      country: '—',
      code: (code || '??').slice(0, 3).toUpperCase(),
      sport: null,
    }
  );
}

// ----------------------------------------------------------------------------
// Étiquettes automatiques (calculées côté serveur à partir des classements)
// ----------------------------------------------------------------------------
export const MATCH_LABELS = {
  Derby: { icon: 'flame', cls: 'label-derby', hint: 'Deux équipes de la même ville ou agglomération (fait établi).' },
  'Choc du haut de tableau': { icon: 'zap', cls: 'label-choc', hint: 'Les deux équipes figurent dans le haut du classement réel.' },
  'Lutte pour le maintien': { icon: 'shield', cls: 'label-maintien', hint: "Au moins une équipe est dans la zone de relégation réelle." },
  'Enjeu européen': { icon: 'star', cls: 'label-europe', hint: 'Au moins une équipe joue une place européenne sur le classement réel.' },
  'Enjeu play-in': { icon: 'zap', cls: 'label-europe', hint: 'Au moins une équipe est en course pour le play-in (NBA).' },
  'Sans enjeu apparent': { icon: 'info', cls: 'label-neutre', hint: "Aucun enjeu particulier identifiable dans le classement actuel." },
  'Affiche du tournoi': { icon: 'star', cls: 'label-choc', hint: 'Les deux joueuses sont classées dans le top 10 réel.' },
};

// ----------------------------------------------------------------------------
// États de match
// ----------------------------------------------------------------------------
export const STATUS_LABELS = {
  scheduled: { label: 'À venir', cls: 'st-scheduled' },
  live: { label: 'En direct', cls: 'st-live' },
  finished: { label: 'Terminé', cls: 'st-finished' },
  cancelled: { label: 'Annulé', cls: 'st-cancelled' },
};

// ----------------------------------------------------------------------------
// Divers
// ----------------------------------------------------------------------------
export const STORAGE_KEYS = {
  theme: 'pronoscope_theme',
  sound: 'pronoscope_sound',
  device: 'pronoscope_device_id',
  easterEgg: 'pronoscope_oracle_count',
};

export const HISTORY_WINDOW_HOURS = 48;

export const DISCLAIMER =
  "PronoScope fournit des analyses statistiques à but informatif. Les probabilités ne sont pas des certitudes : aucune garantie de gain n'existe. Jouez responsable — le jeu comporte des risques : endettement, isolement, dépendance. Pour être aidé, appelez le 09 74 75 13 13 (appel non surtaxé). Interdit aux mineurs.";
