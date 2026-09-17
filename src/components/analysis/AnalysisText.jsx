// ============================================================================
// PronoScope — Texte d'analyse + bloc sources + formes récentes
// ============================================================================
import { Icon } from '../icons';
import { FormStreak } from '../ui/bits';
import { TeamCrest } from '../ui/TeamCrest';
import { fmtPct, timeAgo } from '../../lib/format';

/* ---------- Texte d'analyse généré côté serveur ---------- */
export function AnalysisText({ analysis }) {
  const { text, sport } = analysis ?? {};
  if (!text) return null;
  return (
    <section className="analysis-text glass card">
      <h3 className="title-3" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 9 }}>
        <Icon name="activity" size={19} style={{ color: 'var(--accent-1)' }} /> Lecture du modèle
      </h3>
      <p style={{ color: 'var(--text-1)', fontWeight: 500 }}>{text.intro}</p>
      {text.paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      <p
        style={{
          marginTop: 4,
          padding: '13px 16px',
          borderRadius: 'var(--radius-m)',
          background: 'var(--grad-brand-soft)',
          border: '1px solid var(--glass-border)',
          color: 'var(--text-1)',
          fontWeight: 600,
        }}
      >
        {text.conclusion}
      </p>
    </section>
  );
}

/* ---------- Formes récentes des deux camps ---------- */
export function TeamsForm({ analysis }) {
  const { teams, sport } = analysis ?? {};
  const home = teams?.home;
  const away = teams?.away;
  if (!home?.stats?.form?.length && !away?.stats?.form?.length) return null;

  const TeamForm = ({ t, label }) => (
    <div className="glass card">
      <div className="row" style={{ marginBottom: 10 }}>
        <TeamCrest name={t?.name ?? '?'} size={34} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t?.name}</div>
          <div className="faint xsmall">{label}</div>
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="faint xsmall">Forme récente</span>
        <FormStreak form={t?.stats?.form ?? []} />
      </div>
      <div className="col" style={{ gap: 6 }}>
        {(t?.stats?.form ?? []).slice(0, 5).map((f, i) => (
          <div key={i} className="spread xsmall mono" style={{ color: 'var(--text-2)' }}>
            <span>{f.d}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '46%' }}>
              {f.v === 'V' ? '✓' : f.v === 'N' ? '=' : '✕'} {f.o}
            </span>
            <span>
              {sport === 'football' ? `${f.gs}-${f.gc}` : sport === 'basketball' ? `${f.p}-${f.op}` : f.s}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="duo-grid">
      <TeamForm t={home} label={home?.competition ? `· ${home.competition}` : home?.tour ? `· ${home.tour.toUpperCase()}${home.stats?.rank ? ` · n°${home.stats.rank}` : ''}` : ''} />
      <TeamForm t={away} label={away?.competition ? `· ${away.competition}` : away?.tour ? `· ${away.tour.toUpperCase()}${away.stats?.rank ? ` · n°${away.stats.rank}` : ''}` : ''} />
    </div>
  );
}

/* ---------- Bloc sources (dépôts utilisés, volume, honnêteté) ---------- */
export function SourcesBlock({ analysis }) {
  const src = analysis?.sources;
  if (!src) return null;
  return (
    <section className="sources-block glass">
      <div className="row" style={{ gap: 9, marginBottom: 6 }}>
        <Icon name="database" size={18} style={{ color: 'var(--accent-3)' }} />
        <h3 className="title-3">Sources des données</h3>
      </div>
      <p className="muted small" style={{ marginBottom: 4 }}>
        <strong className="mono">{src.historicalMatches}</strong> matchs historiques ont alimenté ce calcul.
        Dernière mise à jour des sources : {src.lastDataUpdate ? timeAgo(src.lastDataUpdate) : 'inconnue'}.
      </p>
      <ul>
        {(src.repos ?? []).map((r) => (
          <li key={r.name} className="small" style={{ display: 'flex', gap: 9, alignItems: 'baseline' }}>
            <a href={r.url} target="_blank" rel="noreferrer noopener" style={{ fontWeight: 600 }}>
              {r.name}
            </a>
            <span className="faint xsmall">{r.usage}</span>
          </li>
        ))}
      </ul>
      {(src.notes ?? []).length ? (
        <div className="col" style={{ gap: 7, marginTop: 12 }}>
          {src.notes.map((n, i) => (
            <div key={i} className="banner banner-info" style={{ padding: '9px 13px' }}>
              <Icon name="info" size={15} />
              <span className="small">{n}</span>
            </div>
          ))}
        </div>
      ) : null}
      <p className="faint xsmall" style={{ marginTop: 12 }}>
        Principe d'honnêteté : aucune statistique n'est inventée. Les marchés non couverts par les sources ouvertes
        (corners, cartons, fautes, tirs cadrés…) sont explicitement signalés « donnée non disponible ».
      </p>
    </section>
  );
}
