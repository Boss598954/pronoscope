// ============================================================================
// PronoScope — Jauge circulaire animée (confiance, taux de réussite)
// ============================================================================
import { useEffect, useId, useState } from 'react';
import { useCountUp } from '../../hooks/useCountUp';

/**
 * Jauge circulaire sur 270° avec dégradé et remplissage animé.
 * Le « gap » du dasharray est volontairement supérieur à la circonférence
 * pour empêcher le motif de reboucler (sinon un segment parasite apparaît).
 * @param {{ value: number, size?: number, label?: string, sub?: string, thickness?: number }} props
 */
export function Gauge({ value, size = 132, label = '', sub = '', thickness = 10 }) {
  const v = useCountUp(value, { duration: 1500, decimals: 0 });
  const gradId = useId();
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const arc = (c * 3) / 4; // longueur visible de l'arc (270°)
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  const offset = mounted ? arc * (1 - Math.min(1, Math.max(0, v / 100))) : arc;

  return (
    <div className="gauge-wrap" style={{ width: size, height: size }} role="img" aria-label={label ? `${label} : ${Math.round(value)} sur 100` : `Jauge : ${Math.round(value)} sur 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="55%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        {/* arc de fond (270°, rotation pour ouvrir en bas) */}
        <circle
          className="gauge-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={thickness}
          strokeDasharray={`${arc} ${c}`}
          transform={`rotate(135 ${size / 2} ${size / 2})`}
          strokeLinecap="round"
        />
        {/* arc de valeur : gap > circonférence => aucun rebouclement */}
        <circle
          className="gauge-value"
          style={{ stroke: `url(#${gradId})` }}
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={thickness}
          strokeDasharray={`${arc} ${c}`}
          strokeDashoffset={offset}
          transform={`rotate(135 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="gauge-center">
        <div>
          <div className="gauge-num" style={{ fontSize: size / 5.2 }}>
            {Math.round(v)}
          </div>
          {sub ? <div className="gauge-level">{sub}</div> : null}
        </div>
      </div>
    </div>
  );
}
