// ============================================================================
// PronoScope — Visualisations SVG pures : heatmap des scores, courbe normale,
// scores en sets, radar, courbe de fiabilité
// ============================================================================
import { useMemo, useState, useEffect } from 'react';
import { Icon } from '../icons';
import { fmtPct, fmtNum } from '../../lib/format';

/* ---------- Football : heatmap de la matrice des scores exacts ---------- */
export function ScoreMatrix({ analysis }) {
  const matrix = analysis?.model?.matrix;
  const top = analysis?.model?.topScores ?? [];
  if (!matrix || !matrix.length) return null;
  const N = 7; // affichage 0-6 x 0-6
  const max = Math.max(...matrix.flat());

  const cellStyle = (p) => {
    const t = Math.min(1, p / max);
    // du plus froid (verre) au plus chaud (violet -> cyan)
    const alpha = 0.06 + t * 0.82;
    const hue = 265 - t * 65; // violet vers cyan
    return `hsla(${hue}, 85%, ${28 + t * 26}%, ${alpha})`;
  };

  return (
    <section className="glass card matrix-wrap">
      <h3 className="title-3" style={{ justifySelf: 'start' }}>Matrice des scores exacts</h3>
      <p className="faint xsmall" style={{ justifySelf: 'start', marginBottom: 6 }}>
        Probabilité de chaque score final (modèle Dixon-Coles). Survolez une case.
      </p>
      <div
        className="score-matrix"
        style={{ gridTemplateColumns: `repeat(${N + 1}, minmax(30px, 38px))` }}
        role="table"
        aria-label="Matrice des scores exacts"
      >
        <div />
        {Array.from({ length: N }, (_, j) => (
          <div key={`h${j}`} className="faint xsmall mono" style={{ textAlign: 'center' }}>{j}</div>
        ))}
        {Array.from({ length: N }, (_, i) => (
          <div key={`r${i}`} style={{ display: 'contents' }}>
            <div className="faint xsmall mono" style={{ display: 'grid', placeItems: 'center' }}>{i}</div>
            {Array.from({ length: N }, (_, j) => {
              const p = matrix[i]?.[j] ?? 0;
              const isTop = top[0]?.score === `${i}-${j}`;
              return (
                <div
                  key={`${i}-${j}`}
                  className="matrix-cell"
                  title={`${i}-${j} : ${(p * 100).toFixed(1).replace('.', ',')} %`}
                  style={{
                    height: 'min(6vw, 38px)',
                    borderRadius: 8,
                    background: cellStyle(p),
                    outline: isTop ? '2px solid #fff' : 'none',
                    outlineOffset: -2,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '0.62rem',
                    color: p > max * 0.45 ? '#fff' : 'transparent',
                    cursor: 'default',
                  }}
                >
                  {(p * 100).toFixed(0)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="row-wrap" style={{ gap: 8, justifySelf: 'start' }}>
        {top.slice(0, 5).map((s) => (
          <span key={s.score} className="chip mono">
            {s.score} · {fmtPct(s.p)}
          </span>
        ))}
      </div>
    </section>
  );
}

/* ---------- Basketball : courbe normale du total de points ---------- */
export function NormalCurve({ analysis }) {
  const d = analysis?.model?.distribution;
  if (!d || !Number.isFinite(d.muTotal) || !Number.isFinite(d.sigmaTotal) || d.sigmaTotal <= 0) return null;
  const { muTotal, sigmaTotal, line, pOver } = d;

  const W = 560;
  const H = 240;
  const pad = { l: 16, r: 16, t: 18, b: 34 };
  const xMin = muTotal - 3.4 * sigmaTotal;
  const xMax = muTotal + 3.4 * sigmaTotal;
  const x = (v) => pad.l + ((v - xMin) / (xMax - xMin)) * (W - pad.l - pad.r);
  const peak = 1 / (sigmaTotal * Math.sqrt(2 * Math.PI));
  const y = (p) => H - pad.b - (p / peak) * (H - pad.t - pad.b);
  const pdf = (v) => Math.exp(-((v - muTotal) ** 2) / (2 * sigmaTotal ** 2)) / (sigmaTotal * Math.sqrt(2 * Math.PI));

  const step = (xMax - xMin) / 160;
  const pts = [];
  for (let v = xMin; v <= xMax; v += step) pts.push(`${x(v).toFixed(1)},${y(pdf(v)).toFixed(1)}`);
  // Aire « over » : uniquement au-delà de la ligne (et non au-delà de la moyenne)
  const overPts = pts.filter((_, i) => xMin + i * step >= line);

  return (
    <section className="glass card matrix-wrap">
      <h3 className="title-3" style={{ justifySelf: 'start' }}>Distribution du total de points</h3>
      <p className="faint xsmall" style={{ justifySelf: 'start', marginBottom: 4 }}>
        Loi normale centrée sur {fmtNum(muTotal, 1)} points (écart-type {fmtNum(sigmaTotal, 1)}). Zone colorée : dépassement de la ligne {fmtNum(line, 1)}.
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 620 }}>
        <defs>
          <linearGradient id="areaOver" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* axe */}
        <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="var(--glass-border-strong)" strokeWidth="1.5" />
        {/* aire "over" : de la ligne jusqu'à l'extrémité droite */}
        {overPts.length ? (
          <polygon points={[`${x(Math.max(line, xMin))},${H - pad.b}`, ...overPts, `${x(xMax)},${H - pad.b}`].join(' ')} fill="url(#areaOver)" />
        ) : null}
        {/* courbe */}
        <polyline points={pts.join(' ')} fill="none" stroke="#60a5fa" strokeWidth="2.6" strokeLinejoin="round" />
        {/* ligne du total */}
        <line x1={x(line)} y1={pad.t} x2={x(line)} y2={H - pad.b} stroke="#a78bfa" strokeWidth="2" strokeDasharray="6 5" />
        <text x={x(line)} y={pad.t - 4} fill="#a78bfa" fontSize="12" textAnchor="middle" fontFamily="JetBrains Mono, monospace">
          ligne {fmtNum(line, 1)}
        </text>
        <text x={x(muTotal)} y={H - 10} fill="currentColor" opacity="0.65" fontSize="11.5" textAnchor="middle" fontFamily="JetBrains Mono, monospace">
          μ = {fmtNum(muTotal, 1)} pts
        </text>
        <text x={W - pad.r} y={H - 10} fill="currentColor" opacity="0.65" fontSize="11.5" textAnchor="end" fontFamily="JetBrains Mono, monospace">
          P(total &gt; ligne) = {fmtPct(pOver)}
        </text>
      </svg>
    </section>
  );
}

/* ---------- Tennis : scores en sets probables ---------- */
export function SetBars({ analysis }) {
  const sets = analysis?.model?.sets ?? [];
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);
  if (!sets.length) return null;
  const max = Math.max(...sets.map((s) => s.p));

  return (
    <section className="glass card matrix-wrap">
      <h3 className="title-3" style={{ justifySelf: 'start' }}>Scores en sets (Monte-Carlo)</h3>
      <p className="faint xsmall" style={{ justifySelf: 'start', marginBottom: 8 }}>
        Résultat en sets le plus probable, cohérent avec la probabilité de victoire.
      </p>
      <div className="col" style={{ width: '100%', gap: 10 }}>
        {sets.slice(0, 6).map((s, i) => (
          <div key={s.score} className="row" style={{ gap: 12 }}>
            <span className="mono" style={{ width: 46, fontWeight: 700 }}>{s.score}</span>
            <div className="pbar grow">
              <div className="pbar-fill" style={{ width: mounted ? `${(s.p / max) * 100}%` : 0, transitionDelay: `${i * 80}ms` }} />
            </div>
            <span className="mono small" style={{ width: 58, textAlign: 'right' }}>{fmtPct(s.p)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Radar de comparaison (5 axes) ---------- */
export function RadarCompare({ analysis }) {
  const radar = analysis?.radar ?? [];
  if (radar.length < 3) return null;
  const W = 320;
  const H = 320;
  const cx = W / 2;
  const cy = H / 2;
  const R = 108;
  const n = radar.length;

  const point = (i, v) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = (v / 100) * R;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const poly = (key) => radar.map((r, i) => point(i, r[key]).map((x) => x.toFixed(1)).join(',')).join(' ');

  const homeName = analysis?.teams?.home?.name ?? 'Domicile';
  const awayName = analysis?.teams?.away?.name ?? 'Extérieur';

  return (
    <section className="glass card matrix-wrap">
      <h3 className="title-3" style={{ justifySelf: 'start' }}>Radar des forces (échelle relative)</h3>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 340 }}>
        {/* grilles */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon
            key={f}
            points={radar.map((_, i) => point(i, f * 100).map((x) => x.toFixed(1)).join(',')).join(' ')}
            fill="none"
            stroke="var(--glass-border-strong)"
            strokeWidth="1"
          />
        ))}
        {/* axes */}
        {radar.map((r, i) => {
          const [px, py] = point(i, 100);
          return <line key={r.axis} x1={cx} y1={cy} x2={px} y2={py} stroke="var(--glass-border)" strokeWidth="1" />;
        })}
        {/* polygones */}
        <polygon className="radar-polygon" points={poly('home')} fill="rgba(139, 92, 246, 0.3)" stroke="#8b5cf6" strokeWidth="2.2" />
        <polygon className="radar-polygon" points={poly('away')} fill="rgba(34, 211, 238, 0.22)" stroke="#22d3ee" strokeWidth="2.2" />
        {/* labels */}
        {radar.map((r, i) => {
          const [px, py] = point(i, 126);
          return (
            <text key={r.axis} x={px} y={py} fill="currentColor" opacity="0.7" fontSize="11.5" textAnchor="middle" dominantBaseline="middle">
              {r.axis}
            </text>
          );
        })}
      </svg>
      <div className="row" style={{ gap: 16 }}>
        <span className="small" style={{ color: '#8b5cf6', fontWeight: 600 }}>■ {homeName}</span>
        <span className="small" style={{ color: '#22d3ee', fontWeight: 600 }}>■ {awayName}</span>
      </div>
    </section>
  );
}

/* ---------- Fiabilité : courbe d'évolution (taux cumulé) ---------- */
export function EvolutionCurve({ curve = [] }) {
  const W = 720;
  const H = 260;
  const pad = { l: 44, r: 18, t: 18, b: 36 };
  const pts = useMemo(
    () =>
      curve.map((c, i) => [
        pad.l + (i / Math.max(1, curve.length - 1)) * (W - pad.l - pad.r),
        H - pad.b - c.rate * (H - pad.t - pad.b),
      ]),
    [curve],
  );
  if (pts.length < 2) return null;

  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${path} L${pts[pts.length - 1][0]},${H - pad.b} L${pts[0][0]},${H - pad.b} Z`;

  return (
    <section className="glass card">
      <h3 className="title-3" style={{ marginBottom: 10 }}>Courbe d'évolution du taux de réussite</h3>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }}>
        <defs>
          <linearGradient id="curveArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* grille horizontale 0/25/50/75/100 % */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const yy = H - pad.b - f * (H - pad.t - pad.b);
          return (
            <g key={f}>
              <line x1={pad.l} y1={yy} x2={W - pad.r} y2={yy} stroke="var(--glass-border)" strokeDasharray="3 6" />
              <text x={pad.l - 8} y={yy + 4} fontSize="11" fill="currentColor" opacity="0.55" textAnchor="end" fontFamily="JetBrains Mono, monospace">
                {Math.round(f * 100)}%
              </text>
            </g>
          );
        })}
        <path d={area} fill="url(#curveArea)" />
        <path
          d={path}
          fill="none"
          stroke="url(#curveStroke)"
          strokeWidth="2.8"
          strokeLinejoin="round"
          className="curve-line"
          style={{ '--len': 2400 }}
        />
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 5 : 3.4} fill={curve[i].hit ? '#34d399' : '#f87171'} stroke="var(--bg-1)" strokeWidth="1.5" />
        ))}
        <text x={pad.l} y={H - 10} fontSize="11" fill="currentColor" opacity="0.55" fontFamily="JetBrains Mono, monospace">
          1<tspan dy="-4" fontSize="8">er</tspan>
          <tspan dy="4"> pronostic évalué</tspan>
        </text>
        <text x={W - pad.r} y={H - 10} fontSize="11" fill="currentColor" opacity="0.55" textAnchor="end" fontFamily="JetBrains Mono, monospace">
          dernier ({curve.length})
        </text>
      </svg>
    </section>
  );
}
