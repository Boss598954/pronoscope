// ============================================================================
// PronoScope — Petits composants transverses : Reveal, EmptyState, StatusPill
// ============================================================================
import { Icon } from '../icons';
import { useReveal } from '../../hooks/useReveal';
import { MATCH_LABELS, STATUS_LABELS } from '../../config';

/** Enveloppe d'apparition au scroll. */
export function Reveal({ children, delay = 0, variant = '', as: Tag = 'div', className = '', ...rest }) {
  const ref = useReveal({ delay });
  const cls = ['reveal', variant ? `reveal-${variant}` : '', className].filter(Boolean).join(' ');
  return (
    <Tag ref={ref} className={cls} {...rest}>
      {children}
    </Tag>
  );
}

/** État vide réutilisable. */
export function EmptyState({ icon = 'database', title = 'Rien à afficher', text = '', action = null }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={34} />
      </div>
      <div className="title-3">{title}</div>
      {text ? <p className="muted small" style={{ maxWidth: '46ch' }}>{text}</p> : null}
      {action}
    </div>
  );
}

/** Pastille d'état de match. */
export function StatusPill({ status }) {
  const s = STATUS_LABELS[status] ?? STATUS_LABELS.scheduled;
  return (
    <span className={`status-pill ${s.cls}`}>
      {s.label}
    </span>
  );
}

/** Étiquette automatique de match (Derby, Choc…) avec infobulle explicative. */
export function MatchLabelPill({ label }) {
  const meta = MATCH_LABELS[label];
  if (!meta) return null;
  return (
    <span className={`match-label ${meta.cls}`} title={meta.hint}>
      <Icon name={meta.icon} size={12} />
      {label}
    </span>
  );
}

/** Tricode de compétition (petit badge pays/ligue). */
export function CompBadge({ code }) {
  return (
    <span
      className="mono"
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        minWidth: 30,
        padding: '2px 6px',
        borderRadius: 7,
        fontSize: '0.66rem',
        fontWeight: 700,
        letterSpacing: '0.06em',
        background: 'var(--glass)',
        border: '1px solid var(--glass-border)',
        color: 'var(--text-2)',
      }}
      title={code}
    >
      {code}
    </span>
  );
}

/** Série de forme (V/N/D). */
export function FormStreak({ form = [], max = 5 }) {
  if (!form.length) return <span className="faint xsmall">forme inconnue</span>;
  return (
    <span className="form-streak" title="Forme récente (les plus récents à gauche)">
      {form.slice(0, max).map((f, i) => (
        <span key={i} className={`form-dot form-${f.v ?? f}`}>
          {f.v ?? f}
        </span>
      ))}
    </span>
  );
}
