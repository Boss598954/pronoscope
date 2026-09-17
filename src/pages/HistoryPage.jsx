// ============================================================================
// PronoScope — Fenêtre 4 : Historique (48 h, scopé par appareil anonyme)
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons';
import { Reveal, EmptyState, StatusPill, MatchLabelPill } from '../components/ui/bits';
import { TeamCrest } from '../components/ui/TeamCrest';
import { supabase, getDeviceId } from '../lib/supabase';
import { api } from '../lib/api';
import { toast } from '../components/ui/toast';
import { fmtPct, fmtDateTime, timeAgo, dayKey, humanDay } from '../lib/format';
import { competitionMeta } from '../config';

export default function HistoryPage() {
  const [tab, setTab] = useState('analyses');
  const [items, setItems] = useState(null);
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const loadAnalyses = useCallback(async () => {
    setItems(null);
    try {
      const res = await api.history();
      setItems(res.items ?? []);
    } catch (err) {
      setItems([]);
      toast.bad(err.message ?? 'Historique indisponible.');
    }
  }, []);

  const loadResults = useCallback(async () => {
    setResults(null);
    if (!supabase) {
      setResults([]);
      return;
    }
    const from = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from('matches')
      .select('id, sport, competition, competition_name, match_date, home_team, away_team, home_score, away_score, status, label')
      .eq('status', 'finished')
      .gte('match_date', from)
      .order('match_date', { ascending: false })
      .limit(200);
    setResults(data ?? []);
  }, []);

  useEffect(() => {
    if (tab === 'analyses') loadAnalyses();
    else loadResults();
  }, [tab, loadAnalyses, loadResults]);

  const removeOne = async (cacheKey) => {
    setBusy(true);
    try {
      await api.historyRemove(cacheKey);
      setItems((it) => it.filter((x) => x.cacheKey !== cacheKey));
      toast.ok('Analyse retirée de votre historique.');
    } catch (err) {
      toast.bad(err.message ?? 'Suppression impossible.');
    } finally {
      setBusy(false);
    }
  };

  const clearAll = async () => {
    setBusy(true);
    try {
      await api.historyClear();
      setItems([]);
      toast.ok('Historique vidé.');
    } catch (err) {
      toast.bad(err.message ?? 'Suppression impossible.');
    } finally {
      setBusy(false);
    }
  };

  const deviceId = getDeviceId();

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h1 className="display-2">Historique</h1>
          <p className="lead">Vos 48 dernières heures d'analyses et les résultats des matchs terminés.</p>
        </div>
        <div className="tabs">
          <button type="button" className={`tab ${tab === 'analyses' ? 'active' : ''}`} onClick={() => setTab('analyses')}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <Icon name="gauge" size={15} /> Mes analyses
            </span>
          </button>
          <button type="button" className={`tab ${tab === 'results' ? 'active' : ''}`} onClick={() => setTab('results')}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <Icon name="checkCircle" size={15} /> Résultats des matchs
            </span>
          </button>
        </div>
      </div>

      <div className="banner banner-info" style={{ marginBottom: 20 }}>
        <Icon name="shield" size={17} />
        <span className="small">
          Cet historique est rattaché à un identifiant d'appareil anonyme (<span className="mono">{deviceId.slice(0, 13)}…</span>),
          généré et stocké uniquement dans votre navigateur : aucun compte, aucune donnée personnelle. Les entrées de plus
          de 48 heures sont automatiquement purgées.
        </span>
      </div>

      {tab === 'analyses' ? (
        items === null ? (
          <div className="col" style={{ gap: 12 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 84 }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <section className="glass card">
            <EmptyState
              icon="history"
              title="Aucune analyse ces 48 dernières heures"
              text="Lancez une analyse depuis l'onglet Analyse : elle apparaîtra ici pendant 48 heures, puis sera purgée automatiquement."
              action={
                <button type="button" className="btn btn-primary" onClick={() => navigate('/analyse')}>
                  <Icon name="zap" size={15} /> Analyser un match
                </button>
              }
            />
          </section>
        ) : (
          <>
            <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 14 }}>
              <button type="button" className="btn btn-sm btn-danger" onClick={clearAll} disabled={busy}>
                <Icon name="trash" size={14} /> Tout effacer
              </button>
            </div>
            <div className="col" style={{ gap: 12 }}>
              {items.map((it, i) => (
                <Reveal key={`${it.cacheKey}-${i}`} delay={Math.min(i, 6) * 40}>
                  <div className="history-item">
                    <span style={{ color: 'var(--accent-1)', flex: 'none' }}>
                      <Icon name={it.sport === 'football' ? 'football' : it.sport === 'basketball' ? 'basketball' : 'tennis'} size={19} />
                    </span>
                    <div className="grow" style={{ minWidth: 200 }}>
                      <div style={{ fontWeight: 700 }}>{it.subject ?? 'Analyse'}</div>
                      <div className="faint xsmall">
                        {it.verdict ? `${it.verdict.label} · ${fmtPct(it.verdict.probability)}` : ''}
                        {it.verdict?.exactScore ? ` · score probable ${it.verdict.exactScore}` : ''}
                      </div>
                    </div>
                    {it.match ? (
                      <div className="row" style={{ gap: 8 }}>
                        <StatusPill status={it.match.status} />
                        {it.match.homeScore != null ? (
                          <span className="mono small">
                            {it.match.homeScore}–{it.match.awayScore}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="chip xsmall">saisie libre</span>
                    )}
                    <span className="faint xsmall" title={fmtDateTime(it.createdAt)}>{timeAgo(it.createdAt)}</span>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => removeOne(it.cacheKey)}
                      disabled={busy}
                      aria-label="Retirer de mon historique"
                      title="Retirer de mon historique"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </Reveal>
              ))}
            </div>
          </>
        )
      ) : results === null ? (
        <div className="col" style={{ gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 74 }} />
          ))}
        </div>
      ) : results.length === 0 ? (
        <section className="glass card">
          <EmptyState
            icon="checkCircle"
            title="Aucun match terminé sur les 48 dernières heures"
            text="Dès qu'un match de la base se termine (ou sera synchronisé comme terminé), son score réel apparaît ici."
          />
        </section>
      ) : (
        <ResultsList results={results} />
      )}
    </div>
  );
}

function ResultsList({ results }) {
  const navigate = useNavigate();
  const byDay = new Map();
  for (const m of results) {
    const k = dayKey(m.match_date);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(m);
  }
  return (
    <div className="col" style={{ gap: 20 }}>
      {[...byDay.entries()].map(([k, list]) => (
        <div key={k}>
          <div className="row" style={{ gap: 8, marginBottom: 10 }}>
            <Icon name="calendar" size={14} style={{ color: 'var(--accent-3)' }} />
            <strong className="small">{humanDay(k)}</strong>
            <span className="faint xsmall">{list.length} matchs terminés</span>
          </div>
          <div className="col" style={{ gap: 10 }}>
            {list.map((m) => (
              <div key={m.id} className="history-item">
                <TeamCrest name={m.home_team} size={30} />
                <div className="grow" style={{ minWidth: 170 }}>
                  <div className="small" style={{ fontWeight: 600 }}>
                    {m.home_team} <span className="faint">–</span> {m.away_team}
                  </div>
                  <div className="faint xsmall">{competitionMeta(m.competition).name}{m.label ? ' · ' : ''}{m.label ? <MatchLabelPill label={m.label} /> : null}</div>
                </div>
                <TeamCrest name={m.away_team} size={30} />
                <span className="mono" style={{ fontSize: '1.05rem', fontWeight: 700, minWidth: 64, textAlign: 'center' }}>
                  {m.home_score}–{m.away_score}
                </span>
                <button type="button" className="btn btn-sm" onClick={() => navigate(`/analyse?match=${encodeURIComponent(m.id)}`)}>
                  <Icon name="history" size={13} /> Rétrospective
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
