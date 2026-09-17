// ============================================================================
// PronoScope — Accueil : tuiles de sports animées + compteurs + résumé + ticker
// ============================================================================
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../icons';
import { SPORTS, SPORT_KEYS } from '../../config';
import { useCountUp } from '../../hooks/useCountUp';
import { useOnScreen } from '../../hooks/useReveal';
import { Reveal, EmptyState, MatchLabelPill, StatusPill } from '../ui/bits';
import { TeamCrest } from '../ui/TeamCrest';
import { fmtTime, fmtDateShort, dayKey } from '../../lib/format';
import { competitionMeta } from '../../config';

/* ---------- Grandes tuiles de sélection du sport ---------- */
export function SportTiles({ selected, onSelect, counts = {} }) {
  const navigate = useNavigate();
  return (
    <div className="sports-grid">
      {SPORT_KEYS.map((key, i) => {
        const s = SPORTS[key];
        const active = selected === key;
        return (
          <Reveal key={key} delay={i * 110}>
            <button
              type="button"
              className={`sport-tile glass card card-hover ${active ? 'selected' : ''}`}
              style={{ '--tile-accent': s.accent, width: '100%', textAlign: 'left' }}
              onClick={() => {
                onSelect?.(key);
                soundTap();
                navigate(`/calendrier?sport=${key}`);
              }}
              aria-pressed={active}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div
                  className="tile-icon"
                  style={{
                    display: 'grid',
                    placeItems: 'center',
                    width: 62,
                    height: 62,
                    borderRadius: 20,
                    color: '#fff',
                    background: `linear-gradient(135deg, ${s.accent}, ${s.accent2})`,
                    boxShadow: `0 10px 30px color-mix(in srgb, ${s.accent} 40%, transparent)`,
                  }}
                >
                  <Icon name={s.icon} size={32} />
                </div>
                <div className="grow">
                  <div className="title-3" style={{ fontSize: '1.15rem' }}>{s.label}</div>
                  <div className="faint xsmall">{s.description}</div>
                  <div className="row" style={{ gap: 8, marginTop: 8 }}>
                    <span className="chip mono" style={{ color: s.accent }}>
                      {counts[key] ?? 0} matchs
                    </span>
                    {active ? <span className="chip chip-accent">sélectionné</span> : null}
                  </div>
                </div>
              </div>
            </button>
          </Reveal>
        );
      })}
    </div>
  );
}

function soundTap() {
  import('../../lib/sound').then((m) => m.sound.tap());
}

/* ---------- Compteurs animés ---------- */
function Counter({ icon, label, value, suffix = '' }) {
  const [ref, visible] = useOnScreen();
  const v = useCountUp(value, { duration: 1600, active: visible });
  return (
    <div ref={ref} className="glass card card-hover card-topline" style={{ padding: '20px 22px' }}>
      <div className="row" style={{ gap: 10, color: 'var(--accent-1)' }}>
        <Icon name={icon} size={19} />
        <span className="faint xsmall" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
      </div>
      <div className="stat-num" style={{ marginTop: 10 }}>
        {Number.isFinite(value) ? Math.round(v).toLocaleString('fr-FR') : '—'}
        {suffix}
      </div>
    </div>
  );
}

export function Counters({ counters }) {
  return (
    <div className="counters-grid">
      <Counter icon="calendar" label="Matchs chargés" value={counters?.matches ?? 0} />
      <Counter icon="trophy" label="Championnats suivis" value={counters?.competitions ?? 0} />
      <Counter icon="database" label="Analyses en cache" value={counters?.analyses ?? 0} />
      <SyncBadge counters={counters} />
    </div>
  );
}

function SyncBadge({ counters }) {
  const last = counters?.last_refresh;
  return (
    <div className="glass card card-hover" style={{ padding: '20px 22px', display: 'grid', gap: 8, alignContent: 'start' }}>
      <div className="row" style={{ gap: 10, color: 'var(--accent-3)' }}>
        <Icon name="refresh" size={19} />
        <span className="faint xsmall" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>Dernière synchro</span>
      </div>
      <div className="mono" style={{ fontSize: '0.98rem', marginTop: 6 }}>
        {last ? new Date(last).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' }) : 'jamais'}
      </div>
      <div className="faint xsmall">Rafraîchissement quotidien automatique à 00 h 00 (UTC+1).</div>
    </div>
  );
}

/* ---------- Résumé du jour ---------- */
export function DailySummary({ matches = [], onAnalyze }) {
  const todayK = dayKey(new Date().toISOString());
  const today = useMemo(
    () => matches.filter((m) => dayKey(m.match_date) === todayK),
    [matches, todayK],
  );

  if (!today.length) {
    return (
      <section className="dashboard-section glass card">
        <EmptyState
          icon="calendar"
          title="Aucun match aujourd'hui"
          text="Le calendrier du jour est vide : les sources publiques ne référencent aucune rencontre pour aujourd'hui, ou la base n'a pas encore été synchronisée."
        />
      </section>
    );
  }

  const byComp = new Map();
  for (const m of today) {
    if (!byComp.has(m.competition)) byComp.set(m.competition, []);
    byComp.get(m.competition).push(m);
  }

  const highlighted = today.filter((m) => m.label && m.label !== 'Sans enjeu apparent').slice(0, 3);

  return (
    <section className="dashboard-section">
      <div className="spread" style={{ marginBottom: 14 }}>
        <h2 className="display-2">Résumé du jour</h2>
        <span className="chip chip-accent">
          <Icon name="calendar" size={14} /> {today.length} match{today.length > 1 ? 's' : ''} · {byComp.size} compétition{byComp.size > 1 ? 's' : ''}
        </span>
      </div>

      {highlighted.length ? (
        <div className="summary-grid" style={{ marginBottom: 16 }}>
          {highlighted.map((m, i) => (
            <Reveal key={m.id} delay={i * 90}>
              <div className="glass card card-hover" style={{ display: 'grid', gap: 10 }}>
                <MatchLabelPill label={m.label} />
                <div className="row" style={{ gap: 12 }}>
                  <TeamCrest name={m.home_team} size={36} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="small" style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.home_team} <span className="faint">reçoit</span> {m.away_team}
                    </div>
                    <div className="faint xsmall">{competitionMeta(m.competition).name} · {fmtTime(m.match_date)}</div>
                  </div>
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => onAnalyze(m.id)}>
                    <Icon name="gauge" size={14} /> Analyser
                  </button>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      ) : null}

      <div className="comp-list">
        {[...byComp.entries()].map(([comp, list]) => (
          <div key={comp}>
            <div className="row" style={{ gap: 10, marginBottom: 10 }}>
              <Icon name="trophy" size={17} style={{ color: 'var(--label-choc)' }} />
              <strong>{competitionMeta(comp).name}</strong>
              <span className="faint xsmall">{list.length} matchs</span>
            </div>
            <div className="matches-grid">
              {list.slice(0, 6).map((m) => (
                <DailyMatchRow key={m.id} m={m} onAnalyze={onAnalyze} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DailyMatchRow({ m, onAnalyze }) {
  return (
    <div className="glass match-card match-line">
      <div className="match-team">
        <TeamCrest name={m.home_team} size={30} />
        <span className="tname">{m.home_team}</span>
      </div>
      <div className="match-vs">
        <span className="match-time">{m.home_score != null ? `${m.home_score}–${m.away_score}` : fmtTime(m.match_date)}</span>
        <StatusPill status={m.status} />
      </div>
      <div className="match-team right">
        <span className="tname">{m.away_team}</span>
        <TeamCrest name={m.away_team} size={30} />
      </div>
    </div>
  );
}

/* ---------- Ticker défilant des prochains matchs ---------- */
export function Ticker({ matches = [] }) {
  const next = useMemo(
    () => matches
      .filter((m) => m.status === 'scheduled')
      .sort((a, b) => new Date(a.match_date) - new Date(b.match_date))
      .slice(0, 14),
    [matches],
  );
  if (next.length < 2) return null;
  const items = [...next, ...next]; // duplication pour boucle parfaite
  return (
    <div className="ticker glass" style={{ padding: '10px 0', marginBottom: 24 }} aria-hidden="true">
      <div className="ticker-track">
        {items.map((m, i) => (
          <span className="ticker-item" key={`${m.id}-${i}`}>
            <Icon name={SPORTS[m.sport]?.icon ?? 'calendar'} size={14} style={{ color: SPORTS[m.sport]?.accent }} />
            <strong>{m.home_team}</strong>
            <span className="faint">vs</span>
            <strong>{m.away_team}</strong>
            <span className="faint xsmall">· {fmtDateShort(m.match_date)} {fmtTime(m.match_date)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
