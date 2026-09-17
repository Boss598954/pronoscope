// ============================================================================
// PronoScope — Formatage français (dates, nombres, pourcentages)
// ============================================================================
const TZ = 'Europe/Paris';

const dateFmtLong = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeZone: TZ });
const dateFmtShort = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });
const dateFmtNum = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ });

export const fmtDateLong = (iso) => (iso ? dateFmtLong.format(new Date(iso)) : '—');
export const fmtDateShort = (iso) => (iso ? dateFmtShort.format(new Date(iso)) : '—');
export const fmtDateNum = (iso) => (iso ? dateFmtNum.format(new Date(iso)) : '—');
export const fmtTime = (iso) => (iso ? timeFmt.format(new Date(iso)) : '—');
export const fmtDateTime = (iso) => (iso ? dateTimeFmt.format(new Date(iso)) : '—');

/** Clé de jour locale (Paris) : « 2026-09-17 ». */
export function dayKey(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}

/** « aujourd'hui » / « demain » / « hier » / date longue. */
export function humanDay(key) {
  const today = dayKey(new Date().toISOString());
  const tomorrow = dayKey(new Date(Date.now() + 86400000).toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86400000).toISOString());
  if (key === today) return "Aujourd'hui";
  if (key === tomorrow) return 'Demain';
  if (key === yesterday) return 'Hier';
  return fmtDateLong(`${key}T12:00:00Z`);
}

/** Pourcentage : 0.623 -> « 62,3 % ». */
export function fmtPct(v, decimals = 1) {
  if (v == null || Number.isNaN(v)) return '—';
  return (v * 100).toFixed(decimals).replace('.', ',') + ' %';
}

/** Nombre : 2.5 -> « 2,5 ». */
export function fmtNum(v, decimals = 2) {
  if (v == null || Number.isNaN(v)) return '—';
  return Number(v).toFixed(decimals).replace('.', ',');
}

/** Cote juste : 1/0.62 -> « 1,61 ». */
export function fmtOdds(v) {
  if (v == null || Number.isNaN(v) || v <= 1) return '—';
  return v.toFixed(2).replace('.', ',');
}

/** « il y a 3 h », « il y a 2 j »… */
export function timeAgo(iso) {
  if (!iso) return '—';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'à l\u2019instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

/** Compte à rebours : « dans 2 h 15 min » / « dans 45 min » / « en cours ». */
export function countdown(iso) {
  if (!iso) return '—';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'en cours ou terminé';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `dans ${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h < 24) return `dans ${h} h${rest ? ` ${rest} min` : ''}`;
  const d = Math.floor(h / 24);
  return `dans ${d} j`;
}

/** Couleur déterministe (teinte) à partir d'un nom — pour les monogrammes. */
export function hashHue(str) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Initiales d'une équipe pour le monogramme (max 3 lettres). */
export function monogram(name) {
  const stop = new Set(['fc', 'cf', 'ac', 'as', 'sc', 'afc', 'cfc', 'ssc', 'cd', 'rcd', 'ud', 'sd', 'ca', 'sl', 'the']);
  const words = (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[\s-]+/)
    .filter((w) => w && !stop.has(w.toLowerCase()));
  const letters = words.map((w) => w[0].toUpperCase()).join('');
  return (letters || (name || '?').slice(0, 2)).slice(0, 3);
}
