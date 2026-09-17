// ============================================================================
// PronoScope — Liste déroulante avec recherche (filtre championnat, équipes…)
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../icons';

/**
 * Composant_select enrichi : champ de recherche + liste filtrée + navigation clavier.
 * @param {{
 *   icon?: string, placeholder?: string, value?: any,
 *   options: Array<{value: any, label: string, hint?: string, icon?: string}>,
 *   onChange: (option|null) => void, onQuery?: (q: string) => void,
 *   align?: 'left'|'right', width?: number|string
 * }} props
 */
export function SearchSelect({ icon = 'search', placeholder = 'Rechercher…', value = null, options = [], onChange, onQuery, align = 'left', width = 260 }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focusIdx, setFocusIdx] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? options.filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q))
      : options;
    return list.slice(0, 60);
  }, [options, query]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setFocusIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const select = (opt) => {
    onChange?.(opt);
    setOpen(false);
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[focusIdx]) select(filtered[focusIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const selectedLabel = value?.label ?? placeholder;

  return (
    <div className="field" ref={rootRef} style={{ position: 'relative', width }}>
      <button
        type="button"
        className="btn"
        style={{ width: '100%', justifyContent: 'flex-start' }}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Icon name={icon} size={17} />
        <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
          {selectedLabel}
        </span>
        <Icon name="chevronDown" size={15} />
      </button>

      {open ? (
        <div className="ss-list glass-strong" style={align === 'right' ? { left: 'auto', right: 0 } : undefined} role="listbox">
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--glass-border)' }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-3)' }}>
                <Icon name="search" size={15} />
              </span>
              <input
                ref={inputRef}
                className="input"
                style={{ paddingLeft: 34, paddingTop: 8, paddingBottom: 8 }}
                placeholder={placeholder}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setFocusIdx(0);
                  onQuery?.(e.target.value);
                }}
                onKeyDown={onKey}
              />
            </div>
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div className="faint small" style={{ padding: '16px 16px', textAlign: 'center' }}>
                Aucun résultat pour « {query} »
              </div>
            ) : (
              filtered.map((o, i) => (
                <button
                  key={String(o.value)}
                  type="button"
                  className={`ss-item ${i === focusIdx ? 'focused' : ''}`}
                  role="option"
                  aria-selected={value?.value === o.value}
                  onMouseEnter={() => setFocusIdx(i)}
                  onClick={() => select(o)}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    {o.icon ? <Icon name={o.icon} size={16} /> : null}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                  </span>
                  {o.hint ? <span className="faint xsmall" style={{ whiteSpace: 'nowrap' }}>{o.hint}</span> : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
