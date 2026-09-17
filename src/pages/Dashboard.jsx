// ============================================================================
// PronoScope — Fenêtre 1 : Accueil / Tableau de bord
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons';
import { SportTiles, Counters, DailySummary, Ticker } from '../components/dashboard/DashboardParts';
import { SyncCard } from '../components/dashboard/SyncCard';
import { Reveal } from '../components/ui/bits';
import { supabase } from '../lib/supabase';
import { APP_TAGLINE, SPORTS } from '../config';

export default function Dashboard({ app, refresh }) {
  const navigate = useNavigate();
  const [selectedSport, setSelectedSport] = useState(null);
  const [matches, setMatches] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);

  const counters = app.counters;
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    const from = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
    const to = new Date(Date.now() + 10 * 86400000).toISOString();
    supabase
      .from('matches')
      .select('id, sport, competition, competition_name, match_date, home_team, away_team, status, label, meta, home_score, away_score')
      .gte('match_date', from)
      .lte('match_date', to)
      .order('match_date', { ascending: true })
      .limit(600)
      .then(({ data, error }) => {
        if (error) setErrorMsg("Lecture du calendrier impossible : " + error.message);
        setMatches(data ?? []);
      });
  }, [reloadKey, app.refreshKey]);

  const onSynced = () => {
    setReloadKey((k) => k + 1);
    refresh?.();
  };

  const onAnalyze = (matchId) => navigate(`/analyse?match=${encodeURIComponent(matchId)}`);

  const isEmpty = !counters || (counters.matches ?? 0) === 0;
  const bySportCounts = useMemo(() => counters?.by_sport ?? {}, [counters]);

  return (
    <div className="page-enter">
      {/* Bandeau héros */}
      <Reveal>
        <section className="hero glass">
          <div className="hero-glow" />
          <span className="chip chip-accent" style={{ marginBottom: 14 }}>
            <Icon name="sparkles" size={13} /> {APP_TAGLINE}
          </span>
          <h1 className="display-1" style={{ maxWidth: '20ch' }}>
            Le sport, <span className="grad-text">décrypté par la donnée</span> — jamais inventé.
          </h1>
          <p className="lead" style={{ marginTop: 14 }}>
            PronoScope agrège des sources publiques ouvertes (openfootball, CDN NBA, JeffSackmann, ESPN) et calcule des
            probabilités par modèles statistiques : Poisson/Dixon-Coles au football, loi normale au basketball,
            service/retour + Monte-Carlo au tennis. Chaque chiffre est traçable, chaque marché non couvert est signalé,
            et la fiabilité de chaque pronostic est mesurée honnêtement face aux résultats réels.
          </p>
          <div className="hero-cta">
            <button type="button" className="btn btn-primary btn-lg" onClick={() => navigate('/analyse')}>
              <Icon name="gauge" size={18} /> Lancer une analyse
            </button>
            <button type="button" className="btn btn-lg" onClick={() => navigate('/calendrier')}>
              <Icon name="calendar" size={17} /> Voir le calendrier
            </button>
          </div>
        </section>
      </Reveal>

      {errorMsg ? (
        <div className="banner banner-warn" style={{ marginBottom: 18 }}>
          <Icon name="alert" size={17} />
          <span className="small">{errorMsg}</span>
        </div>
      ) : null}

      <Ticker matches={matches} />

      {/* Sélection du sport en grandes tuiles animées */}
      <Reveal>
        <h2 className="display-2" style={{ marginBottom: 16 }}>Choisissez votre terrain</h2>
      </Reveal>
      <SportTiles selected={selectedSport} onSelect={setSelectedSport} counts={bySportCounts} />

      {/* Compteurs */}
      <Reveal>
        <h2 className="display-2" style={{ margin: '8px 0 16px' }}>La base en un coup d'œil</h2>
      </Reveal>
      <Counters counters={counters} />

      {/* Première synchronisation si la base est vide */}
      {isEmpty ? (
        <Reveal>
          <div style={{ marginBottom: 26 }}>
            <SyncCard onSynced={onSynced} />
          </div>
        </Reveal>
      ) : null}

      {/* Résumé du jour */}
      <DailySummary matches={matches} onAnalyze={onAnalyze} />

      {/* Note de transparence */}
      <Reveal>
        <section className="glass card" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <span style={{ color: 'var(--accent-3)', flex: 'none', marginTop: 2 }}>
            <Icon name="info" size={20} />
          </span>
          <div className="small muted">
            <strong style={{ color: 'var(--text-1)' }}>Comment ça marche ?</strong> Chaque nuit à 00 h 00 (UTC+1), une
            fonction planifiée télécharge les calendriers et résultats depuis les dépôts openfootball (football), le CDN
            officiel NBA (basketball) et les CSV JeffSackmann + ESPN (tennis), puis agrège les statistiques. Vos analyses
            sont calculées à la demande, mises en cache pour toujours être réaffichées à l'identique, et leur fiabilité
            est comparée aux résultats réels dans l'onglet dédié — échecs compris. Aucune donnée n'est jamais inventée :
            ce que les sources ne couvrent pas est affiché « donnée non disponible ».
          </div>
        </section>
      </Reveal>
    </div>
  );
}
