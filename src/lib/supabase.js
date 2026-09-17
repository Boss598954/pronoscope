// ============================================================================
// PronoScope — Client Supabase + identifiant d'appareil anonyme
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigured, STORAGE_KEYS } from '../config';

/** Client Supabase (null si les variables d'environnement ne sont pas définies ;
 *  l'application affiche alors une bannière de configuration). */
export const supabase = supabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  : null;

/**
 * Identifiant d'appareil anonyme : généré et stocké dans le navigateur
 * (localStorage). Aucune donnée personnelle n'est collectée. Il est transmis
 * à chaque requête pour « Mes analyses » (48 h) et la fiabilité, sans compte
 * utilisateur.
 */
const DEVICE_RE = /^[a-zA-Z0-9-]{8,64}$/;

function newDeviceId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `dev-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function getDeviceId() {
  try {
    let id = window.localStorage.getItem(STORAGE_KEYS.device);
    if (!id || !DEVICE_RE.test(id)) {
      id = newDeviceId();
      window.localStorage.setItem(STORAGE_KEYS.device, id);
    }
    return id;
  } catch {
    return 'anonymous-device';
  }
}

/** Petit utilitaire : pause. */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
