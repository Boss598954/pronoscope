// ============================================================================
// PronoScope — Effets sonores discrets (WebAudio, synthèse pure, zéro fichier)
// Désactivés par défaut ; préférence mémorisée côté navigateur.
// ============================================================================
import { STORAGE_KEYS } from '../config';

let ctx = null;
let enabled = false;

try {
  enabled = window.localStorage.getItem(STORAGE_KEYS.sound) === 'on';
} catch { /* ignore */ }

function ac() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Joue un bip synthétique doux. */
function blip(freq = 620, duration = 0.09, type = 'sine', gain = 0.045, delay = 0) {
  if (!enabled) return;
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

export const sound = {
  get enabled() {
    return enabled;
  },
  toggle() {
    enabled = !enabled;
    try {
      window.localStorage.setItem(STORAGE_KEYS.sound, enabled ? 'on' : 'off');
    } catch { /* ignore */ }
    if (enabled) blip(740, 0.08);
    return enabled;
  },
  tap: () => blip(520, 0.06, 'triangle', 0.03),
  nav: () => blip(660, 0.07, 'sine', 0.035),
  success: () => {
    blip(587, 0.1, 'sine', 0.05);
    blip(880, 0.14, 'sine', 0.05, 0.1);
  },
  error: () => {
    blip(300, 0.12, 'sawtooth', 0.03);
    blip(220, 0.16, 'sawtooth', 0.03, 0.11);
  },
  oracle: () => {
    // Arpège mystique de l'easter egg
    [523, 659, 784, 1047, 1319].forEach((f, i) => blip(f, 0.16, 'sine', 0.05, i * 0.09));
  },
};
