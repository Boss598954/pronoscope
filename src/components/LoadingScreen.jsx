// ============================================================================
// PronoScope — Écran de chargement à PROGRESSION RÉELLE
// Les étapes correspondent à de vraies vérifications réseau (config, base,
// compteurs). Si la base est indisponible, l'application démarre quand même
// en mode dégradé avec un bandeau d'avertissement.
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { supabaseConfigured } from '../config';
import { fetchCounters } from '../lib/api';
import { sleep } from '../lib/supabase';

const STEPS = [
  { key: 'init', label: 'Initialisation de PronoScope…', weight: 12 },
  { key: 'config', label: 'Vérification de la configuration…', weight: 16 },
  { key: 'db', label: 'Connexion à la base de données…', weight: 34 },
  { key: 'counters', label: 'Lecture des compteurs du jour…', weight: 26 },
  { key: 'ui', label: 'Préparation de l\u2019interface…', weight: 12 },
];

export function LoadingScreen({ onDone, onCounters }) {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(STEPS[0].label);
  const [warning, setWarning] = useState(null);
  const doneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const t0 = Date.now();
      let acc = 0;
      let counters = null;
      let warn = null;

      for (const step of STEPS) {
        if (cancelled) return;
        setStage(step.label);

        if (step.key === 'config' && !supabaseConfigured) {
          warn = "Configuration absente : renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans Netlify (voir guide).";
        }

        if (step.key === 'db') {
          if (supabaseConfigured) {
            try {
              counters = await fetchCounters();
              if (counters && counters.matches === 0) {
                warn = "La base est vide : utilisez le bouton « Synchroniser maintenant » sur l'accueil.";
              }
            } catch {
              warn = 'Base de données injoignable pour le moment : démarrage en mode dégradé.';
            }
          }
        }

        // Progression réelle par étape + petit lissage pour la fluidité
        acc += step.weight;
        setProgress(acc);
        await sleep(Math.max(140, (Date.now() - t0) < 500 ? 220 : 90));
      }

      // Durée minimale d'affichage pour éviter le flash
      const elapsed = Date.now() - t0;
      if (elapsed < 1100) await sleep(1100 - elapsed);
      if (cancelled) return;

      setProgress(100);
      setWarning(warn);
      await sleep(320);
      if (!cancelled && !doneRef.current) {
        doneRef.current = true;
        onDone?.({ counters, warning: warn });
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [onDone]);

  return (
    <div className="loader-screen" role="status" aria-live="polite">
      <div className="loader-box">
        <div className="loader-logo">
          <Icon name="oracle" size={42} />
        </div>
        <div className="loader-title">PronoScope</div>
        <div className="loader-bar">
          <div className="loader-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="loader-pct grad-text">{Math.round(progress)}&nbsp;%</div>
        <div className="loader-stage">{warning ?? stage}</div>
      </div>
    </div>
  );
}
