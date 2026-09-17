// ============================================================================
// PronoScope — Fenêtre 3 : Analyse d'un match
// ============================================================================
import { useState } from 'react';
import { Icon } from '../components/icons';
import { Picker } from '../components/analysis/Picker';
import { VerdictBanner, MarketGrid, CompareBars } from '../components/analysis/AnalysisParts';
import { ScoreMatrix, NormalCurve, SetBars, RadarCompare } from '../components/analysis/Charts';
import { AnalysisText, TeamsForm, SourcesBlock } from '../components/analysis/AnalysisText';
import { Reveal, EmptyState } from '../components/ui/bits';
import { api } from '../lib/api';
import { toast } from '../components/ui/toast';
import { sound } from '../lib/sound';

const BUSY_STAGES = [
  'Lecture des historiques en base…',
  'Pondération par récence…',
  'Exécution du modèle statistique…',
  'Calcul des marchés et du verdict…',
  'Mise en cache de l\u2019analyse…',
];

export default function AnalysisPage() {
  const [busy, setBusy] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);
  const [analysis, setAnalysis] = useState(null);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState(null);
  const [prefill, setPrefill] = useState(null); // { home, sport } pour relancer en saisie libre

  const runAnalysis = async (params) => {
    setBusy(true);
    setError(null);
    setAnalysis(null);
    const rot = setInterval(() => setStageIdx((i) => (i + 1) % BUSY_STAGES.length), 2200);
    try {
      const res = await api.analyze(params);
      setAnalysis(res.analysis);
      setCached(Boolean(res.cached));
      sound.success();
      if (res.cached) toast.info('Analyse déjà calculée : réaffichée à l\u2019identique depuis le cache.');
    } catch (err) {
      setError(err);
      sound.error();
    } finally {
      clearInterval(rot);
      setBusy(false);
    }
  };

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h1 className="display-2">Analyse</h1>
          <p className="lead">
            Choisissez un match du calendrier ou confrontez librement deux équipes/joueurs : le moteur calcule les
            probabilités, le score exact le plus probable et le marché conseillé.
          </p>
        </div>
      </div>

      <Picker onAnalyze={runAnalysis} busy={busy} prefillHome={prefill?.home} prefillSport={prefill?.sport} />

      {/* Calcul en cours */}
      {busy ? (
        <section className="glass card" style={{ marginTop: 22, display: 'grid', gap: 14, justifyItems: 'center', padding: '34px 22px' }}>
          <span style={{ color: 'var(--accent-1)' }}>
            <Icon name="oracle" size={40} className="float-y" />
          </span>
          <div className="title-3">{BUSY_STAGES[stageIdx]}</div>
          <div className="pbar" style={{ width: 'min(420px, 100%)' }}>
            <div className="pbar-fill" style={{ width: '68%' }} />
          </div>
          <span className="faint xsmall">Côté serveur (Edge Function) — généralement moins de 3 secondes.</span>
        </section>
      ) : null}

      {/* Erreur */}
      {error && !busy ? (
        <section className="glass card" style={{ marginTop: 22 }}>
          <EmptyState
            icon="alert"
            title="Analyse impossible pour le moment"
            text={error.message}
            action={
              error.extra?.suggestions?.length ? (
                <div className="col" style={{ gap: 8, alignItems: 'center' }}>
                  <span className="faint xsmall">Suggestions proches (cliquez pour relancer) :</span>
                  <div className="row-wrap" style={{ justifyContent: 'center' }}>
                    {error.extra.suggestions.slice(0, 5).map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="chip chip-accent"
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          setError(null);
                          setPrefill({ home: s, sport: undefined });
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null
            }
          />
        </section>
      ) : null}

      {/* Résultat */}
      {analysis && !busy ? (
        <div className="analysis-layout" style={{ marginTop: 22 }}>
          <Reveal>
            <VerdictBanner analysis={analysis} cached={cached} />
          </Reveal>

          <Reveal>
            <AnalysisText analysis={analysis} />
          </Reveal>

          <Reveal>
            <div className="duo-grid">
              <CompareBars analysis={analysis} />
              <RadarCompare analysis={analysis} />
            </div>
          </Reveal>

          <Reveal>
            <MarketGrid analysis={analysis} />
          </Reveal>

          {analysis.sport === 'football' ? (
            <Reveal>
              <ScoreMatrix analysis={analysis} />
            </Reveal>
          ) : null}
          {analysis.sport === 'basketball' ? (
            <Reveal>
              <NormalCurve analysis={analysis} />
            </Reveal>
          ) : null}
          {analysis.sport === 'tennis' ? (
            <Reveal>
              <SetBars analysis={analysis} />
            </Reveal>
          ) : null}

          <Reveal>
            <TeamsForm analysis={analysis} />
          </Reveal>

          <Reveal>
            <SourcesBlock analysis={analysis} />
          </Reveal>
        </div>
      ) : null}

      {!analysis && !busy && !error ? (
        <section className="glass card" style={{ marginTop: 22 }}>
          <EmptyState
            icon="gauge"
            title="Aucune analyse en cours"
            text="Sélectionnez un match à venir dans la liste, ou saisissez librement deux équipes / joueuses (l'autocomplétion propose les noms présents dans la base). Le résultat est mis en cache : la même analyse sera toujours réaffichée à l'identique."
          />
        </section>
      ) : null}
    </div>
  );
}
