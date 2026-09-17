// ============================================================================
// PronoScope — Bandeau verdict + grille des marchés + comparaisons
// ============================================================================
import { useEffect, useState } from 'react';
import { Icon } from '../icons';
import { Gauge } from '../ui/Gauge';
import { TeamCrest } from '../ui/TeamCrest';
import { Reveal, MatchLabelPill } from '../ui/bits';
import { toast } from '../ui/toast';
import { sound } from '../../lib/sound';
import { fmtPct, fmtOdds, fmtNum } from '../../lib/format';

/* ---------- Bandeau verdict (en haut de l'analyse) ---------- */
export function VerdictBanner({ analysis, cached }) {
  const { verdict, fixture, teams, sport, generatedAt, model } = analysis;
  const homeName = teams?.home?.name ?? fixture?.homeTeam ?? '—';
  const awayName = teams?.away?.name ?? fixture?.awayTeam ?? '—';

  const copySummary = async () => {
    const txt = [
      `PronoScope — ${homeName} vs ${awayName}`,
      verdict ? `Pronostic : ${verdict.label} (${fmtPct(verdict.probability)})` : '',
      verdict?.exactScore ? `Score le plus probable : ${verdict.exactScore}` : '',
      verdict ? `Confiance : ${verdict.confidence.level} (${verdict.confidence.score}/100)` : '',
      `Analyse ${cached ? 'en cache du' : 'calculée le'} ${new Date(generatedAt).toLocaleString('fr-FR')}`,
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(txt);
      toast.ok('Résumé copié dans le presse-papiers.');
      sound.tap();
    } catch {
      toast.warn('Copie impossible sur ce navigateur.');
    }
  };

  const share = async () => {
    const text = `PronoScope : ${homeName} vs ${awayName} → ${verdict?.label ?? ''} (${fmtPct(verdict?.probability ?? 0)})`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'PronoScope', text, url: window.location.href });
      } catch { /* annulé */ }
    } else {
      copySummary();
    }
  };

  return (
    <section className="verdict-banner glass-strong" style={{ borderRadius: 'var(--radius-xl)' }}>
      <div className="verdict-grid">
        {/* Jauge de confiance circulaire animée */}
        <Gauge
          value={verdict?.confidence?.score ?? 0}
          sub={verdict?.confidence?.level ?? ''}
          label="Confiance"
          size={148}
        />

        {/* Marché conseillé + score exact */}
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <span className="chip chip-accent">
              <Icon name="sparkles" size={13} /> MARCHÉ CONSEILLÉ
            </span>
            {cached ? (
              <span className="chip" title="Cette analyse a déjà été calculée : elle est réaffichée à l'identique depuis le cache.">
                <Icon name="database" size={13} /> cache
              </span>
            ) : null}
          </div>
          <div className="verdict-pick">{verdict?.label ?? '—'}</div>
          <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <span className="chip mono">
              <Icon name="target" size={13} /> {fmtPct(verdict?.probability ?? 0)}
            </span>
            {verdict?.odds ? (
              <span className="chip mono" title="Cote juste : 1 / probabilité. En dessous, aucun intérêt mathématique.">
                cote juste {fmtOdds(verdict.odds)}
              </span>
            ) : null}
            {verdict?.exactScore ? (
              <span className="chip mono" style={{ color: 'var(--accent-3)' }}>
                score probable {verdict.exactScore} · {fmtPct(verdict.exactScoreP ?? 0)}
              </span>
            ) : null}
          </div>
          {fixture ? (
            <div className="row" style={{ gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
              <div className="row" style={{ gap: 9 }}>
                <TeamCrest name={homeName} size={30} />
                <span className="small" style={{ fontWeight: 600 }}>{homeName}</span>
              </div>
              <span className="faint small">vs</span>
              <div className="row" style={{ gap: 9 }}>
                <TeamCrest name={awayName} size={30} />
                <span className="small" style={{ fontWeight: 600 }}>{awayName}</span>
              </div>
              <span className="faint xsmall">{fixture.competitionName ?? fixture.competition}{fixture.label ? ' · ' : ''}</span>
              {fixture.label ? <MatchLabelPill label={fixture.label} /> : null}
            </div>
          ) : (
            <div className="faint xsmall" style={{ marginTop: 14 }}>Analyse en saisie libre (aucun match officiel rattaché).</div>
          )}
        </div>

        {/* Actions */}
        <div className="col" style={{ gap: 9 }}>
          <button type="button" className="btn" onClick={copySummary}>
            <Icon name="copy" size={15} /> Copier le résumé
          </button>
          <button type="button" className="btn" onClick={share}>
            <Icon name="share" size={15} /> Partager
          </button>
        </div>
      </div>

      <div className="faint xsmall" style={{ padding: '0 clamp(20px, 3vw, 34px) 16px' }}>
        Modèle : {model?.kind === 'poisson-dixon-coles' ? 'Poisson bivarié + Dixon-Coles' : model?.kind === 'normale-points' ? 'distribution normale des points' : 'service/retour + Monte-Carlo'} ·{' '}
        analyse {cached ? 'rejouée depuis le cache (calculée le' : 'calculée le'}{' '}
        {new Date(generatedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })})
      </div>
    </section>
  );
}

/* ---------- Grille des marchés (avec cotes justes) ---------- */
export function MarketGrid({ analysis }) {
  const markets = analysis?.markets ?? [];
  const verdictKey = analysis?.verdict?.marketKey;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <section>
      <h3 className="title-3" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 9 }}>
        <Icon name="layers" size={19} style={{ color: 'var(--accent-1)' }} /> Marchés couverts par les données
      </h3>
      <div className="markets-grid">
        {markets.map((m, i) => (
          <div
            key={m.key}
            className={`market-card ${m.key === verdictKey ? 'recommended' : ''} ${m.available ? '' : 'unavailable'}`}
            title={m.note ?? undefined}
          >
            <div className="spread" style={{ marginBottom: 9, gap: 8 }}>
              <span className="small" style={{ fontWeight: 600, lineHeight: 1.3 }}>{m.label}</span>
              {m.key === verdictKey ? (
                <span className="chip chip-accent" style={{ padding: '3px 9px', fontSize: '0.68rem' }}>
                  <Icon name="star" size={11} /> conseillé
                </span>
              ) : null}
            </div>
            {m.available ? (
              <>
                <div className="spread mono" style={{ fontSize: '1.05rem', marginBottom: 7 }}>
                  <strong>{fmtPct(m.probability)}</strong>
                  <span className="faint small">cote {fmtOdds(m.odds)}</span>
                </div>
                <div className="pbar">
                  <div
                    className={`pbar-fill ${m.probability >= 0.65 ? 'ok' : m.probability >= 0.45 ? '' : 'bad'}`}
                    style={{ width: mounted ? `${Math.round(m.probability * 100)}%` : 0, transitionDelay: `${i * 55}ms` }}
                  />
                </div>
              </>
            ) : (
              <div className="row" style={{ gap: 8, color: 'var(--text-3)' }}>
                <Icon name="info" size={15} />
                <span className="xsmall">Donnée non disponible dans les sources ouvertes.</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Jauges horizontales comparatives animées ---------- */
export function CompareBars({ analysis }) {
  const cmp = analysis?.comparison ?? [];
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 120);
    return () => clearTimeout(t);
  }, []);
  if (!cmp.length) return null;

  const homeName = analysis?.teams?.home?.name ?? 'Domicile';
  const awayName = analysis?.teams?.away?.name ?? 'Extérieur';

  return (
    <section className="glass card">
      <h3 className="title-3" style={{ marginBottom: 6 }}>Comparaison statistique</h3>
      <p className="faint xsmall" style={{ marginBottom: 14 }}>
        <span style={{ color: '#8b5cf6' }}>■</span> {homeName} &nbsp;&nbsp;
        <span style={{ color: '#22d3ee' }}>■</span> {awayName} — valeurs issues des historiques réels (pondérées par récence).
      </p>
      {cmp.map((row, i) => {
        const max = Math.max(row.home, row.away, 0.0001);
        return (
          <div className="hbar-row" key={row.label}>
            <div className="hbar-vals" style={{ textAlign: 'right' }}>{fmtNum(row.home, row.unit === 'pts' || row.unit === 'V' ? 1 : 2)}</div>
            <div>
              <div className="faint xsmall" style={{ textAlign: 'center', marginBottom: 4 }}>{row.label}</div>
              <div className="hbar-track">
                <div className="hbar-home" style={{ width: mounted ? `${(row.home / max) * 100}%` : 0, transitionDelay: `${i * 90}ms` }} />
                <div className="hbar-away" style={{ width: mounted ? `${(row.away / max) * 100}%` : 0, transitionDelay: `${i * 90 + 45}ms` }} />
              </div>
            </div>
            <div className="hbar-vals">{fmtNum(row.away, row.unit === 'pts' || row.unit === 'V' ? 1 : 2)}</div>
          </div>
        );
      })}
    </section>
  );
}
