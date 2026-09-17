// ============================================================================
// PronoScope — Compteur animé (count-up) avec easing
// ============================================================================
import { useEffect, useRef, useState } from 'react';

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/**
 * Anime une valeur de 0 vers `target`.
 * @param {number} target valeur finale
 * @param {{duration?: number, decimals?: number, active?: boolean}} opts
 */
export function useCountUp(target, { duration = 1400, decimals = 0, active = true } = {}) {
  const [value, setValue] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!active) return undefined;
    const start = performance.now();
    const from = 0;
    const to = Number.isFinite(target) ? target : 0;
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(from + (to - from) * easeOutCubic(t));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, active]);

  return decimals > 0 ? Number(value.toFixed(decimals)) : Math.round(value);
}

/** Variante pour les pourcentages : anime 0 -> 62,3. */
export function useCountUpPct(target, { duration = 1400, active = true } = {}) {
  const v = useCountUp(target, { duration, decimals: 1, active });
  return v;
}
