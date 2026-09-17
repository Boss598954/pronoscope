// ============================================================================
// PronoScope — Calendrier : carte de match + barre de filtres
// ============================================================================
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../icons';
import { TeamCrest } from '../ui/TeamCrest';
import { MatchLabelPill, StatusPill, CompBadge } from '../ui/bits';
import { SearchSelect } from '../ui/SearchSelect';
import { SPORTS, SPORT_KEYS, competitionMeta } from '../../config';
import { fmtTime, countdown, fmtDateShort } from '../../lib/format';
import { sound } from '../../lib/sound';

/* ---------- Carte d'un match ---------- */
export function MatchCard({ m, onAnalyze }) {
  const navigate = useNavigate();
  const played = m.status === 'finished' && m.home_score != null;
  const sport = SPORTS[m.sport];
  const winnerHome = played && m.home_score > m.away_score;
  const winnerAway = played && m.away_score > m.home_score;

  return (
    <article className="glass match-card card" style={{ padding: 0 }}>
      <div className="match-line">
        <div className="match-team">
          <TeamCrest name={m.home_team} size={38} accent={m.sport === 'basketball' ? '#c2410c' : null} />
          <span className="tname" style={{ fontWeight: winnerHome ? 700 : 500, color: winnerHome ? 'var(--text-1)' : undefined }}>
            {m.home_team}
          </span>
        </div>

        <div className="match-vs">
          {played ? (
            <span className="score-big">{m.home_score} – {m.away_score}</span>
          ) : (
            <span className="match-time" title={m.meta?.timeUnknown ? 'Horaire non fourni par la source' : undefined}>
              {m.meta?.timeUnknown ? '· h ·' : fmtTime(m.match_date)}
            </span>
          )}
          <span className="faint xsmall">{played ? 'final' : countdown(m.match_date)}</span>
        </div>

        <div className="match-team right">
          <span className="tname" style={{ fontWeight: winnerAway ? 700 : 500, color: winnerAway ? 'var(--text-1)' : undefined }}>
            {m.away_team}
          </span>
          <TeamCrest name={m.away_team} size={38} accent={m.sport === 'basketball' ? '#1d4ed8' : null} />
        </div>
      </div>

      <div className="match-foot">
        <div className="row" style={{ gap: 8 }}>
          {sport ? (
            <span title={sport.label} style={{ color: sport.accent, display: 'inline-flex' }}>
              <Icon name={sport.icon} size={15} />
            </span>
          ) : null}
          <CompBadge code={competitionMeta(m.competition).code} />
          <span className="faint xsmall" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {competitionMeta(m.competition).name}
            {m.meta?.round ? ` · J${m.meta.round}` : ''}
            {m.meta?.tournament ? ` · ${m.meta.tournament}` : ''}
          </span>
        </div>
        <div className="row" style={{ gap: 7 }}>
          {m.label ? <MatchLabelPill label={m.label} /> : null}
          <StatusPill status={m.status} />
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => {
              sound.tap();
              if (onAnalyze) onAnalyze(m);
              else navigate(`/analyse?match=${encodeURIComponent(m.id)}`);
            }}
          >
            <Icon name="gauge" size={13} /> Analyser
          </button>
        </div>
      </div>
    </article>
  );
}

/* ---------- Barre de filtres (icône calendrier + icône trophée) ---------- */
export function FiltersBar({ sport, onSport, dateFilter, onDateFilter, competition, onCompetition, competitions = [] }) {
  const quick = [
    { key: 'all', label: 'Toutes les dates' },
    { key: 'today', label: "Aujourd'hui" },
    { key: 'tomorrow', label: 'Demain' },
    { key: '7d', label: '7 jours' },
  ];

  const compOptions = useMemo(
    () => [
      { value: null, label: 'Tous les championnats', icon: 'trophy' },
      ...competitions.map((c) => ({
        value: c,
        label: competitionMeta(c).name,
        hint: competitionMeta(c).country,
        icon: 'trophy',
      })),
    ],
    [competitions],
  );

  return (
    <div className="filters-bar glass-strong">
      {/* Filtre par date : icône calendrier */}
      <span style={{ color: 'var(--accent-3)', display: 'inline-flex' }} title="Filtrer par date">
        <Icon name="calendar" size={18} />
      </span>
      <div className="quick-days">
        {quick.map((q) => (
          <button
            key={q.key}
            type="button"
            className={`chip ${dateFilter === q.key ? 'chip-accent' : ''}`}
            style={{ cursor: 'pointer' }}
            onClick={() => onDateFilter(q.key)}
          >
            {q.label}
          </button>
        ))}
      </div>

      <span style={{ width: 1, height: 26, background: 'var(--glass-border)' }} />

      {/* Filtre par championnat : icône trophée + recherche */}
      <SearchSelect
        icon="trophy"
        placeholder="Championnat…"
        value={compOptions.find((o) => o.value === competition) ?? compOptions[0]}
        options={compOptions}
        onChange={(o) => onCompetition(o?.value ?? null)}
      />

      <div className="grow" />

      {/* Filtre par sport */}
      <div className="row" style={{ gap: 6 }}>
        {SPORT_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={`icon-btn ${sport === k ? 'active-sport' : ''}`}
            style={sport === k ? { color: SPORTS[k].accent, borderColor: `color-mix(in srgb, ${SPORTS[k].accent} 55%, transparent)` } : undefined}
            onClick={() => onSport(sport === k ? null : k)}
            title={SPORTS[k].label}
            aria-label={SPORTS[k].label}
            aria-pressed={sport === k}
          >
            <Icon name={SPORTS[k].icon} size={18} />
          </button>
        ))}
      </div>
    </div>
  );
}
