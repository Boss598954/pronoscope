// ============================================================================
// PronoScope — Logo + EASTER EGG (5 clics rapides = « Mode Oracle »)
// ============================================================================
import { useRef } from 'react';
import { Icon } from './icons';
import { sound } from '../lib/sound';
import { STORAGE_KEYS, APP_NAME } from '../config';
import { toast } from './ui/toast';

const ORACLE_QUOTES = [
  "🧙 L'Oracle a ouvert son troisième œil. Les probabilités tremblent.",
  '🔮 « La variance est cruelle, mais les données ne mentent jamais. » — L’Oracle',
  '⚡ Mode Oracle activé : confiance +100, humilité +100.',
  '🌌 « Un modèle n’est jamais en retard ni en avance : il est simplement probable. »',
  '🎲 « Je ne prédits pas le hasard, je le mesure. » — L’Oracle, probablement',
];

let lastQuote = -1;

/** Déclenche l'easter egg : confettis + citation + arpège mystique. */
function triggerOracleMode(logoEl) {
  // Confettis
  const emojis = ['⚽', '🏀', '🎾', '✨', '🔮', '⚡'];
  const colors = ['#8b5cf6', '#3b82f6', '#22d3ee', '#34d399', '#facc15'];
  for (let i = 0; i < 46; i++) {
    const p = document.createElement('span');
    const isEmoji = Math.random() < 0.4;
    if (isEmoji) {
      p.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      p.style.fontSize = `${13 + Math.random() * 12}px`;
    } else {
      p.style.width = `${6 + Math.random() * 6}px`;
      p.style.height = `${6 + Math.random() * 10}px`;
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
    }
    p.className = 'confetti-piece';
    const rect = logoEl.getBoundingClientRect();
    p.style.left = `${rect.left + rect.width / 2}px`;
    p.style.top = `${rect.top + rect.height / 2}px`;
    p.style.setProperty('--dx', `${(Math.random() - 0.5) * 460}px`);
    p.style.setProperty('--dy', `${-120 - Math.random() * 340}px`);
    p.style.setProperty('--rot', `${(Math.random() - 0.5) * 900}deg`);
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 2100);
  }

  // Citation aléatoire (jamais deux fois la même d'affilée)
  let idx;
  do {
    idx = Math.floor(Math.random() * ORACLE_QUOTES.length);
  } while (idx === lastQuote);
  lastQuote = idx;
  toast.info(ORACLE_QUOTES[idx]);

  // Halo arc-en-ciel temporaire sur le logo
  logoEl.classList.add('logo-oracle');
  setTimeout(() => logoEl.classList.remove('logo-oracle'), 9000);

  sound.oracle();

  // Compteur persistant (petit secret supplémentaire au bout de 5 activations)
  try {
    const n = Number(window.localStorage.getItem(STORAGE_KEYS.easterEgg) || 0) + 1;
    window.localStorage.setItem(STORAGE_KEYS.easterEgg, String(n));
    if (n === 5) {
      setTimeout(() => toast.warn("🏅 Série accomplie : vous avez dérangé l'Oracle 5 fois. Il vous observe désormais avec respect."), 2400);
    }
  } catch { /* ignore */ }
}

export function Logo({ compact = false }) {
  const clicks = useRef([]);
  const logoRef = useRef(null);

  const onClick = () => {
    const now = Date.now();
    clicks.current = clicks.current.filter((t) => now - t < 2400);
    clicks.current.push(now);
    if (clicks.current.length >= 5 && logoRef.current) {
      clicks.current = [];
      triggerOracleMode(logoRef.current);
    } else if (clicks.current.length >= 3) {
      sound.tap();
    }
  };

  return (
    <button type="button" className="logo" onClick={onClick} ref={logoRef} aria-label={`${APP_NAME} — accueil (et peut-être plus…)`}>
      <span className="logo-badge">
        <Icon name="oracle" size={22} />
      </span>
      {!compact ? (
        <span className="logo-name">
          Prono<span className="grad-text">Scope</span>
        </span>
      ) : null}
    </button>
  );
}
