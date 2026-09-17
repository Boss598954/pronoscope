// ============================================================================
// PronoScope — Fenêtre 2 : Calendrier des matchs
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/icons';
import { FiltersBar, MatchCard } from '../components/calendar/CalendarParts';
import { Reveal, EmptyState } from '../components/ui/bits';
import { supabase } from '../lib/supabase';
import { competitionMeta, SPORTS } from '../config';
import { dayKey, humanDay } from '../lib/format';

export default function CalendarPage({ app }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sport, setSport] = useState(searchParams.get('sport') ?? null);
  const [dateFilter, setDateFilter] = useState('7d');
  const [competition, setCompetition] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setError("Le site n'est pas relié à une base Supabase (voir guide de déploiement).");
      return;
    }
    const from = new Date(Date.now() - 4 * 86400000).toISOString();
    const to = new Date(Date.now() + 30 * 86400000).toISOString();
    setLoading(true);
    supabase
      .from('matches')
      .select('id, sport, competition, competition_name, season, match_date, home_team, away_team, home_score, away_score, status, label, meta')
      .gte('match_date', from)
      .lte('match_date', to)
      .order('match_date', { ascending: true })
      .limit(2000)
      .then(({ data, error: err }) => {
        if (err) setError("Lecture impossible : " + err.message);
        setMatches(data ?? []);
        setLoading(false);
      });
  }, [app.refreshKey]);

  useEffect(() => {
    const s = searchParams.get('sport');
    if (s) setSport(s);
  }, [searchParams]);

  const competitionsAvailable = useMemo(
    () => [...new Set(matches.map((m) => m.competition))].filter((c) => !sport || competitionMeta(c).sport === sport).sort(),
    [matches, sport],
  );

  const filtered = useMemo(() => {
    const now = Date.now();
    const todayK = dayKey(new Date().toISOString());
    const tomorrowK = dayKey(new Date(Date.now() + 86400000).toISOString());
    return matches.filter((m) => {
      if (sport && m.sport !== sport) return false;
      if (competition && m.competition !== competition) return false;
      const t = new Date(m.match_date).getTime();
      if (dateFilter === 'today') return dayKey(m.match_date) === todayK;
      if (dateFilter === 'tomorrow') return dayKey(m.match_date) === tomorrowK;
      if (dateFilter === '7d') return t > now - 6 * 3600 * 1000 && t < now + 7 * 86400000;
      return true; // 'all'
    });
  }, [matches, sport, competition, dateFilter]);

  // Groupement : par compétition puis par date
  const grouped = useMemo(() => {
    const byComp = new Map();
    for (const m of filtered) {
      if (!byComp.has(m.competition)) byComp.set(m.competition, []);
      byComp.get(m.competition).push(m);
    }
    return [...byComp.entries()]
      .sort((a, b) => {
        const an = competitionMeta(a[0]).name;
        const bn = competitionMeta(b[0]).name;
        return an.localeCompare(bn, 'fr');
      })
      .map(([comp, list]) => {
        const byDay = new Map();
        for (const m of list) {
          const k = dayKey(m.match_date);
          if (!byDay.has(k)) byDay.set(k, []);
          byDay.get(k).push(m);
        }
        return {
          comp,
          days: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])),
          count: list.length,
        };
      });
  }, [filtered]);

  const onAnalyze = (m) => navigate(`/analyse?match=${encodeURIComponent(m.id)}`);

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h1 className="display-2">Calendrier</h1>
          <p className="lead">
            Tous les matchs à venir et récents, regroupés par compétition puis par date. Étiquettes calculées à partir
            des classements réels — jamais inventées.
          </p>
        </div>
        <span className="chip">
          <Icon name="list" size={14} /> {filtered.length} matchs affichés
        </span>
      </div>

      <FiltersBar
        sport={sport}
        onSport={(s) => {
          setSport(s);
          setCompetition(null);
          if (s) setSearchParams({ sport: s });
          else setSearchParams({});
        }}
        dateFilter={dateFilter}
        onDateFilter={setDateFilter}
        competition={competition}
        onCompetition={setCompetition}
        competitions={competitionsAvailable}
      />

      {error ? (
        <div className="banner banner-warn" style={{ marginBottom: 18 }}>
          <Icon name="alert" size={17} />
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="col" style={{ gap: 12 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 92 }} />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <section className="glass card">
          <EmptyState
            icon="calendar"
            title="Aucun match pour ces filtres"
            text="Aucune rencontre ne correspond à la sélection. Élargissez la plage de dates, changez de championnat, ou vérifiez que la base a bien été synchronisée (bouton sur l'accueil)."
            action={
              <button type="button" className="btn" onClick={() => { setDateFilter('all'); setCompetition(null); setSport(null); }}>
                <Icon name="refresh" size={15} /> Réinitialiser les filtres
              </button>
            }
          />
        </section>
      ) : (
        <div className="comp-list">
          {grouped.map(({ comp, days, count }) => {
            const meta = competitionMeta(comp);
            return (
              <section key={comp}>
                <header className="comp-header">
                  <Icon name="trophy" size={19} style={{ color: 'var(--label-choc)' }} />
                  <h2 className="title-3">{meta.name}</h2>
                  <span className="faint xsmall">{meta.country}</span>
                  <span className="chip mono xsmall">{count}</span>
                </header>
                {days.map(([k, list]) => (
                  <div key={k} className="day-group">
                    <div className="row" style={{ gap: 8, marginBottom: 10 }}>
                      <Icon name="calendar" size={14} style={{ color: 'var(--accent-3)' }} />
                      <strong className="small">{humanDay(k)}</strong>
                    </div>
                    <div className="matches-grid">
                      {list.map((m, i) => (
                        <Reveal key={m.id} delay={Math.min(i, 6) * 45}>
                          <MatchCard m={m} onAnalyze={onAnalyze} />
                        </Reveal>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
