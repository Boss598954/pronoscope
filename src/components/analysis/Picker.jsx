// ============================================================================
// PronoScope — Sélecteur d'analyse : match du calendrier OU saisie libre
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../icons';
import { SearchSelect } from '../ui/SearchSelect';
import { SPORTS, SPORT_KEYS, competitionMeta } from '../../config';
import { supabase } from '../../lib/supabase';
import { api } from '../../lib/api';
import { fmtDateShort, fmtTime } from '../../lib/format';
import { sound } from '../../lib/sound';

export function Picker({ onAnalyze, busy, prefillHome = null, prefillSport = null }) {
  const [mode, setMode] = useState('match'); // 'match' | 'libre'
  const [sport, setSport] = useState('football');
  const [upcoming, setUpcoming] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [home, setHome] = useState(null);
  const [away, setAway] = useState(null);
  const [homeOpts, setHomeOpts] = useState([]);
  const [awayOpts, setAwayOpts] = useState([]);
  const [matchSel, setMatchSel] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const debounceRef = useRef(0);
  const autoRunRef = useRef(null);

  // Chargement des matchs à venir (mode « match du calendrier »)
  useEffect(() => {
    if (!supabase) {
      setMatchesLoading(false);
      return;
    }
    const from = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const to = new Date(Date.now() + 12 * 86400000).toISOString();
    supabase
      .from('matches')
      .select('id, sport, competition, competition_name, match_date, home_team, away_team, status, label, meta, home_score, away_score')
      .gte('match_date', from)
      .lte('match_date', to)
      .order('match_date', { ascending: true })
      .limit(600)
      .then(({ data }) => {
        setUpcoming((data ?? []).filter((m) => m.status !== 'cancelled'));
        setMatchesLoading(false);
      });
  }, []);

  // Autocomplétion débouncée (300 ms) : alimente les options pendant la frappe
  const lookup = useCallback(
    (q, which) => {
      clearTimeout(debounceRef.current);
      const query = String(q ?? '').trim();
      if (query.length < 2) {
        which === 'home' ? setHomeOpts([]) : setAwayOpts([]);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await api.autocomplete(sport, query);
          const opts = (res.suggestions ?? []).map((s) => ({
            value: s.name,
            label: s.name,
            hint: s.competition ? competitionMeta(s.competition).name : s.tour ? `${s.tour.toUpperCase()}${s.rank ? ` · n°${s.rank}` : ''}` : '',
            competition: s.competition ?? null,
            tour: s.tour ?? null,
          }));
          which === 'home' ? setHomeOpts(opts) : setAwayOpts(opts);
        } catch {
          /* silencieux : l'autocomplétion est un confort */
        }
      }, 300);
    },
    [sport],
  );

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const upcomingFiltered = useMemo(
    () => upcoming.filter((m) => m.sport === sport).slice(0, 100),
    [upcoming, sport],
  );

  const matchOptions = useMemo(
    () =>
      upcomingFiltered.map((m) => ({
        value: m.id,
        match: m,
        label: `${m.home_team} — ${m.away_team}`,
        hint: `${competitionMeta(m.competition).name} · ${fmtDateShort(m.match_date)} ${fmtTime(m.match_date)}`,
      })),
    [upcomingFiltered],
  );

  // Pré-sélection depuis l'URL (?match=...) : chargement direct si besoin,
  // puis lancement AUTOMATIQUE de l'analyse.
  useEffect(() => {
    const id = searchParams.get('match');
    if (!id || autoRunRef.current === id || busy) return;
    const inList = upcoming.find((m) => m.id === id);
    if (inList) {
      autoRunRef.current = id;
      setSport(inList.sport);
      setMatchSel({ value: inList.id, match: inList, label: `${inList.home_team} — ${inList.away_team}` });
      setMode('match');
      onAnalyze({ matchId: id });
      return;
    }
    if (!matchesLoading && supabase) {
      autoRunRef.current = id;
      supabase
        .from('matches')
        .select('*')
        .eq('id', id)
        .maybeSingle()
        .then(({ data: m }) => {
          if (m) {
            setSport(m.sport);
            setMatchSel({ value: m.id, match: m, label: `${m.home_team} — ${m.away_team}` });
            setMode('match');
            onAnalyze({ matchId: m.id });
          }
        });
    }
  }, [searchParams, upcoming, matchesLoading, onAnalyze, busy]);

  // Pré-remplissage « saisie libre » (suggestion cliquée depuis un message d'erreur)
  useEffect(() => {
    if (prefillHome) {
      setMode('libre');
      if (prefillSport) setSport(prefillSport);
      setHome({ value: prefillHome, label: prefillHome, hint: '' });
    }
  }, [prefillHome, prefillSport]);

  const canAnalyze = busy
    ? false
    : mode === 'match'
      ? Boolean(matchSel)
      : Boolean(home && away && home.value !== away?.value);

  const submit = () => {
    if (!canAnalyze) return;
    sound.tap();
    if (mode === 'match' && matchSel) {
      onAnalyze({ matchId: matchSel.value });
    } else if (home && away) {
      onAnalyze({
        sport,
        home: home.value,
        away: away.value,
        competition: sport === 'tennis' ? null : (home.competition ?? null),
        tour: sport === 'tennis' ? (home.tour ?? away.tour ?? null) : null,
      });
    }
  };

  return (
    <section className="picker-card glass card-topline">
      <div className="spread" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 className="title-3" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Icon name="gauge" size={20} style={{ color: 'var(--accent-1)' }} /> Nouvelle analyse
        </h2>
        <div className="tabs">
          <button type="button" className={`tab ${mode === 'match' ? 'active' : ''}`} onClick={() => setMode('match')}>
            Match du calendrier
          </button>
          <button type="button" className={`tab ${mode === 'libre' ? 'active' : ''}`} onClick={() => setMode('libre')}>
            Saisie libre
          </button>
        </div>
      </div>

      {/* Sélecteur de sport */}
      <div className="row" style={{ gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {SPORT_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={`chip ${sport === k ? 'chip-accent' : ''}`}
            style={{ cursor: 'pointer', padding: '8px 16px' }}
            onClick={() => {
              setSport(k);
              setHome(null);
              setAway(null);
              setHomeOpts([]);
              setAwayOpts([]);
            }}
          >
            <Icon name={SPORTS[k].icon} size={15} /> {SPORTS[k].label}
          </button>
        ))}
      </div>

      {mode === 'match' ? (
        matchesLoading ? (
          <div className="skeleton" style={{ height: 52 }} />
        ) : matchOptions.length ? (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <SearchSelect
              icon="calendar"
              placeholder="Choisir un match à venir…"
              options={matchOptions}
              value={matchSel}
              onChange={setMatchSel}
              width={420}
            />
            <button type="button" className="btn btn-primary" onClick={submit} disabled={!canAnalyze}>
              <Icon name="zap" size={16} /> {busy ? 'Calcul en cours…' : 'Analyser'}
            </button>
          </div>
        ) : (
          <p className="muted small">
            Aucun match à venir dans la base pour {SPORTS[sport].label}. Synchronisez les données depuis l'accueil,
            ou passez en « saisie libre ».
          </p>
        )
      ) : (
        <div className="picker-grid">
          <div>
            <label className="faint xsmall" style={{ display: 'block', marginBottom: 6 }}>
              {sport === 'tennis' ? 'Joueuse / joueur 1' : 'Équipe à domicile'}
            </label>
            <SearchSelect
              icon={SPORTS[sport].icon}
              placeholder="Tapez au moins 2 lettres…"
              options={homeOpts}
              value={home}
              onChange={setHome}
              onQuery={(q) => lookup(q, 'home')}
              width="100%"
            />
          </div>
          <div style={{ display: 'grid', placeItems: 'center', height: 44, color: 'var(--text-3)' }}>
            <Icon name="close" size={16} />
          </div>
          <div>
            <label className="faint xsmall" style={{ display: 'block', marginBottom: 6 }}>
              {sport === 'tennis' ? 'Joueuse / joueur 2' : "Équipe à l'extérieur"}
            </label>
            <SearchSelect
              icon={SPORTS[sport].icon}
              placeholder="Tapez au moins 2 lettres…"
              options={awayOpts}
              value={away}
              onChange={setAway}
              onQuery={(q) => lookup(q, 'away')}
              width="100%"
            />
          </div>
          <div style={{ gridColumn: '1 / -1', justifySelf: 'start' }}>
            <button type="button" className="btn btn-primary btn-lg" onClick={submit} disabled={!canAnalyze}>
              <Icon name="zap" size={17} /> {busy ? 'Calcul en cours…' : "Lancer l'analyse"}
            </button>
          </div>
        </div>
      )}

      <p className="faint xsmall" style={{ marginTop: 14, maxWidth: '72ch' }}>
        Le moteur de calcul tourne côté serveur (Edge Function Supabase) à partir des historiques réels agrégés en base.
        Une analyse déjà calculée est réaffichée à l'identique, jamais recalculée.
      </p>
    </section>
  );
}
