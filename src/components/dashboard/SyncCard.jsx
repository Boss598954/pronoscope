// ============================================================================
// PronoScope — Carte de première synchronisation (base vide au 1er lancement)
// ============================================================================
import { useState } from 'react';
import { Icon } from '../icons';
import { api } from '../../lib/api';
import { toast } from '../ui/toast';
import { sound } from '../../lib/sound';

const STAGES = [
  'Téléchargement des calendriers football (openfootball)…',
  'Récupération du calendrier NBA (CDN officiel)…',
  'Agrégation des statistiques ATP/WTA (JeffSackmann)…',
  'Matchs du jour tennis (ESPN)…',
  'Classements, étiquettes et fiabilité…',
];

export function SyncCard({ onSynced, compact = false }) {
  const [busy, setBusy] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setStageIdx(0);
    const rot = setInterval(() => setStageIdx((i) => (i + 1) % STAGES.length), 7000);
    try {
      const res = await api.refreshData(true);
      clearInterval(rot);
      sound.success();
      if (res?.ok) {
        toast.ok('Synchronisation terminée : les données publiques sont chargées dans la base.');
        onSynced?.(res);
      }
    } catch (err) {
      clearInterval(rot);
      sound.error();
      toast.bad(err.message ?? 'Échec de la synchronisation.');
    } finally {
      clearInterval(rot);
      setBusy(false);
    }
  };

  return (
    <div className={`glass card card-topline ${compact ? '' : ''}`} style={{ display: 'grid', gap: 14, justifyItems: 'start' }}>
      <div className="row" style={{ gap: 12 }}>
        <span style={{ color: 'var(--accent-1)' }}>
          <Icon name="refresh" size={22} className={busy ? 'spin' : ''} />
        </span>
        <h3 className="title-3">{busy ? 'Synchronisation en cours…' : 'Première synchronisation requise'}</h3>
      </div>
      <p className="muted small" style={{ maxWidth: '60ch' }}>
        La base est encore vide. Un premier téléchargement des sources publiques gratuites (openfootball, CDN NBA,
        JeffSackmann, ESPN) va remplir le calendrier et les statistiques. Comptez 30 à 90 secondes — ensuite, le
        rafraîchissement quotidien se fera tout seul à minuit.
      </p>
      <button type="button" className="btn btn-primary btn-lg" onClick={run} disabled={busy}>
        <Icon name={busy ? 'refresh' : 'zap'} size={18} className={busy ? 'spin' : ''} />
        {busy ? STAGES[stageIdx] : 'Synchroniser maintenant'}
      </button>
      {busy ? (
        <div className="pbar" style={{ width: '100%' }}>
          <div className="pbar-fill" style={{ width: '72%', transition: 'width 6s ease' }} />
        </div>
      ) : null}
    </div>
  );
}
