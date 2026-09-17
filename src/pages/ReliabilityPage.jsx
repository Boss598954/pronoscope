// ============================================================================
// PronoScope — Fenêtre 5 : Historique de fiabilité (pronostic vs réalité)
// ============================================================================
import { useEffect, useState } from 'react';
import { Icon } from '../components/icons';
import { Gauge } from '../components/ui/Gauge';
import { EvolutionCurve } from '../components/analysis/Charts';
import { Reveal, EmptyState } from '../components/ui/bits';
import { api } from '../lib/api';
import { fmtPct, fmtDateTime, timeAgo } from '../lib/format';

const MARKET_NAMES = {
  '1': 'Victoire domicile (1)', X: 'Match nul (X)', '2': 'Victoire extérieur (2)',
  '1X': 'Double chance 1X', X2: 'Double chance X2', '12': 'Pas de nul (12)',
  BTTS: 'Les deux équipes marquent', H: 'Victoire NBA domicile', A: 'Victoire NBA extérieur',
  P1: 'Victoire tennis 1', P2: 'Victoire tennis 2',
};

function marketLabel(market) {
  if (MARKET_NAMES[market]) return MARKET_NAMES[market];
  const mLine = /^(O|U)(\d+(?:\.\d+)?)$/.exec(market);
  if (mLine) return `${mLine[1] === 'O' ? 'Plus de' : 'Moins de'} ${mLine[2].replace('.', ',')} (total)`;
  return market;
}

export default function ReliabilityPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .reliability()
      .then((res) => setData(res))
      .catch((err) => setError(err));
  }, []);

  if (error) {
    return (
      <div className="page-enter">
        <div className="page-header">
          <h1 className="display-2">Fiabilité</h1>
        </div>
        <section className="glass card">
          <EmptyState icon="alert" title="Suivi indisponible" text={error.message ?? 'Erreur inconnue.'} />
        </section>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-enter">
        <div className="page-header">
          <h1 className="display-2">Fiabilité</h1>
        </div>
        <div className="col" style={{ gap: 14 }}>
          <div className="skeleton" style={{ height: 130 }} />
          <div className="skeleton" style={{ height: 260 }} />
        </div>
      </div>
    );
  }

  const { summary, byMarket, curve, detail, community } = data;

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h1 className="display-2">Historique de fiabilité</h1>
          <p className="lead">
            Pour chaque analyse dont le match s'est terminé, le pronostic est confronté au résultat réel. Les échecs
            sont affichés aussi honnêtement que les réussites — c'est la condition d'un modèle digne de confiance.
          </p>
        </div>
        {summary?.level ? (
          <span className="chip chip-accent" style={{ padding: '8px 16px' }}>
            <Icon name="star" size={14} /> {summary.level}
          </span>
        ) : null}
      </div>

      {/* KPI */}
      <div className="reli-kpis">
        <div className="glass card card-topline" style={{ display: 'grid', placeItems: 'center', gap: 6, padding: '18px 20px' }}>
          <Gauge value={summary?.rate != null ? summary.rate * 100 : 0} sub="réussite" size={124} />
        </div>
        <Kpi icon="checkCircle" label="Réussites" value={summary?.hits ?? 0} color="var(--ok)" />
        <Kpi icon="xCircle" label="Échecs" value={summary?.misses ?? 0} color="var(--bad)" />
        <Kpi icon="clock" label="En attente de résultat" value={summary?.pending ?? 0} color="var(--warn)" />
        <Kpi icon="flame" label="Série en cours" value={summary?.streak ?? 0} suffix={summary?.streak > 1 ? ' ✓' : ''} color="var(--label-derby)" />
        <Kpi
          icon="trendingUp"
          label="Communauté (tous appareils)"
          value={community?.rate != null ? fmtPct(community.rate, 1) : '—'}
          color="var(--accent-3)"
          hint={`${community?.evaluated ?? 0} pronostics évalués au total`}
        />
      </div>

      {/* Courbe d'évolution */}
      {curve?.length >= 2 ? (
        <Reveal>
          <EvolutionCurve curve={curve} />
        </Reveal>
      ) : null}

      {/* Taux par marché */}
      {byMarket?.length ? (
        <Reveal>
          <section className="glass card" style={{ marginBottom: 22, overflowX: 'auto' }}>
            <h3 className="title-3" style={{ marginBottom: 12 }}>Taux de réussite par marché</h3>
            <table className="market-table">
              <thead>
                <tr>
                  <th>Marché</th>
                  <th>Pronostics</th>
                  <th>Réussis</th>
                  <th style={{ width: '38%' }}>Taux</th>
                </tr>
              </thead>
              <tbody>
                {byMarket.map((m) => (
                  <tr key={m.market}>
                    <td style={{ fontWeight: 600 }}>{marketLabel(m.market)}</td>
                    <td className="mono">{m.n}</td>
                    <td className="mono">{m.hits}</td>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <div className="pbar grow">
                          <div className={`pbar-fill ${m.rate >= 0.6 ? 'ok' : m.rate >= 0.45 ? '' : 'bad'}`} style={{ width: `${Math.round(m.rate * 100)}%` }} />
                        </div>
                        <span className="mono small" style={{ minWidth: 52, textAlign: 'right' }}>{fmtPct(m.rate, 0)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </Reveal>
      ) : null}

      {/* Détail match par match */}
      <Reveal>
        <section className="glass card">
          <h3 className="title-3" style={{ marginBottom: 14 }}>Détail match par match</h3>
          {!detail?.length ? (
            <EmptyState
              icon="target"
              title="Aucun pronostic suivi pour l'instant"
              text="Analysez un match à venir (pas déjà terminé) : dès que le match se joue, la comparaison pronostic/résultat apparaîtra ici avec une pastille verte (réussite) ou rouge (échec)."
            />
          ) : (
            <div className="col" style={{ gap: 10 }}>
              {(detail ?? []).map((r) => (
                <div key={r.id} className="reli-item">
                  <span className={`hit-dot ${r.hit === null ? 'pending' : r.hit ? 'hit' : 'miss'}`} title={r.hit === null ? 'En attente du résultat' : r.hit ? 'Pronostic réussi' : 'Pronostic raté'} />
                  <div style={{ minWidth: 0 }}>
                    <div className="small" style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.subject ?? 'Analyse'}
                    </div>
                    <div className="faint xsmall">
                      {marketLabel(r.market)} · pronostic « {r.pick} » à {fmtPct(Number(r.probability))}
                      {r.hit !== null ? ` · réel : ${r.actual}` : ' · en attente du résultat'}
                    </div>
                  </div>
                  <div className="col" style={{ gap: 2, alignItems: 'flex-end', flex: 'none' }}>
                    <span className={`chip xsmall ${r.hit === null ? 'chip-warn' : r.hit ? 'chip-ok' : 'chip-bad'}`}>
                      {r.hit === null ? 'en attente' : r.hit ? '✓ réussi' : '✕ raté'}
                    </span>
                    <span className="faint xsmall" title={fmtDateTime(r.evaluatedAt ?? r.createdAt)}>
                      {timeAgo(r.evaluatedAt ?? r.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </Reveal>

      <p className="faint xsmall" style={{ marginTop: 16, maxWidth: '80ch' }}>
        Méthodologie : chaque analyse d'un match à venir enregistre le marché conseillé et sa probabilité. Quand le
        match se termine (données réelles des sources), le pronostic est comparé au résultat et marqué réussi ou raté.
        Les analyses « saisie libre » et rétrospectives (match déjà terminé) sont exclues du suivi : aucune triche possible.
      </p>
    </div>
  );
}

function Kpi({ icon, label, value, suffix = '', color = 'var(--accent-1)', hint }) {
  return (
    <div className="glass card card-hover" style={{ padding: '18px 20px', display: 'grid', gap: 8, alignContent: 'start' }}>
      <div className="row" style={{ gap: 9, color }}>
        <Icon name={icon} size={18} />
        <span className="faint xsmall" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      </div>
      <div className="stat-num" style={{ fontSize: '1.8rem' }}>
        {value}
        {suffix}
      </div>
      {hint ? <div className="faint xsmall">{hint}</div> : null}
    </div>
  );
}
