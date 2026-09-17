// ============================================================================
// PronoScope — Appel des Edge Functions Supabase (backend)
// ============================================================================
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigured } from '../config';
import { getDeviceId } from './supabase';

export class ApiError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.extra = extra;
  }
}

const DEFAULT_TIMEOUT = 30000;

/**
 * Appelle une Edge Function Supabase en POST JSON.
 * L'identifiant d'appareil est transmis dans le corps ET l'en-tête.
 */
async function callEdge(functionName, body = {}, timeoutMs = DEFAULT_TIMEOUT) {
  if (!supabaseConfigured) {
    throw new ApiError(
      'NO_CONFIG',
      "Le site n'est pas encore relié à une base Supabase : définissez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY (voir le guide de déploiement).",
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
        'x-device-id': getDeviceId(),
      },
      body: JSON.stringify({ deviceId: getDeviceId(), ...body }),
      signal: controller.signal,
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      throw new ApiError('BAD_RESPONSE', `Réponse illisible du serveur (HTTP ${res.status}).`);
    }
    if (!res.ok || json?.ok === false) {
      throw new ApiError(
        json?.error?.code ?? `HTTP_${res.status}`,
        json?.error?.message ?? 'Erreur inattendue du serveur.',
        json?.error?.suggestions ? { suggestions: json.error.suggestions } : {},
      );
    }
    return json;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ApiError('TIMEOUT', 'Délai dépassé : le serveur n\u2019a pas répondu à temps. Réessayez.');
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError('NETWORK', 'Connexion impossible au serveur. Vérifiez votre réseau.');
  } finally {
    clearTimeout(timer);
  }
}

/** Lecture directe (anon, RLS lecture publique) des compteurs du tableau de bord. */
export async function fetchCounters() {
  if (!supabaseConfigured) return null;
  const { SUPABASE_URL: url, SUPABASE_ANON_KEY: key } = await import('../config');
  try {
    const res = await fetch(`${url}/rest/v1/app_stats?key=${encodeURIComponent(key)}&select=key,value&key=eq.counters`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows?.[0]?.value ?? null;
  } catch {
    return null;
  }
}

export const api = {
  /** Analyse d'un match (par id) ou d'une confrontation libre. */
  analyze: (params) => callEdge('analyze-match', { action: 'analyze', ...params }),

  /** Mes analyses (48 h, par appareil). */
  history: () => callEdge('analyze-match', { action: 'history' }),

  /** Supprime une analyse de « Mes analyses ». */
  historyRemove: (cacheKey) => callEdge('analyze-match', { action: 'history-remove', cacheKey }),

  /** Vide « Mes analyses ». */
  historyClear: () => callEdge('analyze-match', { action: 'history-clear' }),

  /** Historique de fiabilité (par appareil + communauté). */
  reliability: () => callEdge('analyze-match', { action: 'reliability' }),

  /** Autocomplétion d'équipes ou de joueuses. */
  autocomplete: (sport, q) => callEdge('analyze-match', { action: 'autocomplete', sport, q }),

  /** Synchronisation manuelle des données (première utilisation). */
  refreshData: (force = false, timeoutMs = 150000) =>
    callEdge('daily-refresh', { trigger: 'ui', force }, timeoutMs),
};
