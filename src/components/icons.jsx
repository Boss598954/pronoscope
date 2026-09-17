// ============================================================================
// PronoScope — Jeu d'icônes SVG inline (aucune dépendance, aucun emoji UI)
// Toutes les icônes partagent le style « trait arrondi » (comme Lucide).
// ============================================================================

const ICONS = {
  // --- Sports ---------------------------------------------------------------
  football: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5l4.1 3-1.6 4.8h-5L7.9 10.5z" />
      <path d="M12 7.5V3.4M16.1 10.5l4.1 1.3M16.5 15.3l2.7 3.2M7.5 15.3l-2.7 3.2M7.9 10.5L3.8 11.8" />
    </>
  ),
  basketball: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3v18" />
      <path d="M5.6 5.6c3.5 3.5 3.5 9.3 0 12.8M18.4 5.6c-3.5 3.5-3.5 9.3 0 12.8" />
    </>
  ),
  tennis: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.2 6.2c3.3 1.7 5 3.5 5 5.8s-1.7 4.1-5 5.8M18.8 6.2c-3.3 1.7-5 3.5-5 5.8s1.7 4.1 5 5.8" />
    </>
  ),

  // --- Navigation & actions -------------------------------------------------
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3 10.5h18" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 21h8M12 17.5V21M7 4h10v5.5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4.2a1 1 0 0 0-1 1C3.2 9.2 5 11 7.3 11M17 6h2.8a1 1 0 0 1 1 1c0 2.2-1.8 4-4.1 4" />
    </>
  ),
  history: (
    <>
      <path d="M3.6 12a8.4 8.4 0 1 0 2.5-6L3.2 8.8" />
      <path d="M3.2 4v5h5" />
      <path d="M12 7.8V12l3 2" />
    </>
  ),
  gauge: (
    <>
      <path d="M4.5 19a9 9 0 1 1 15 0" />
      <path d="M12 14.5L15.8 10" />
      <circle cx="12" cy="14.8" r="1.5" />
    </>
  ),
  shield: <path d="M12 3l7.5 3v5.8c0 4.6-3.2 7.8-7.5 9.2-4.3-1.4-7.5-4.6-7.5-9.2V6z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M16.6 16.6L21 21" />
    </>
  ),
  chevronDown: <path d="M6 9.5l6 6 6-6" />,
  chevronRight: <path d="M9.5 6l6 6-6 6" />,
  arrowRight: <path d="M4 12h15.5M13.5 6l6.5 6-6.5 6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  refresh: <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6L20.5 8M20.5 3.5V8H16" />,
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M5.5 15H4.5a2 2 0 0 1-2-2V4.5a2 2 0 0 1 2-2H13a2 2 0 0 1 2 2v1" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5.2" r="2.6" />
      <circle cx="6" cy="12" r="2.6" />
      <circle cx="18" cy="18.8" r="2.6" />
      <path d="M8.3 10.7l7.4-4.2M8.3 13.3l7.4 4.2" />
    </>
  ),
  trash: <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13.5h9l1-13.5M10 11v6M14 11v6" />,
  filter: <path d="M3.5 5h17l-6.8 7.8V19l-3.4-1.9v-4.3z" />,
  external: <path d="M14 3.5h6.5V10M20.5 3.5L11 13M18 13.8V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V7.5A1.5 1.5 0 0 1 5 6h5.2" />,
  list: <path d="M8.5 6h12M8.5 12h12M8.5 18h12M4 6h.01M4 12h.01M4 18h.01" />,

  // --- Thème & son ----------------------------------------------------------
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
    </>
  ),
  moon: <path d="M20.6 13.2A8.6 8.6 0 1 1 10.8 3.4a6.8 6.8 0 0 0 9.8 9.8z" />,
  volumeOn: <path d="M11 5L6.5 8.8H3.5v6.4h3L11 19.2zM15.3 8.7a4.7 4.7 0 0 1 0 6.6M18 5.9a8.6 8.6 0 0 1 0 12.2" />,
  volumeOff: <path d="M11 5L6.5 8.8H3.5v6.4h3L11 19.2zM16 9.5l5.5 5.5M21.5 9.5L16 15" />,

  // --- États & indicateurs --------------------------------------------------
  check: <path d="M4.5 12.5l5 5L19.5 7" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.4l2.7 2.7 5.3-6" />
    </>
  ),
  xCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.6v.2" />
    </>
  ),
  alert: <path d="M12 3.6L2.8 19.8h18.4zM12 10v4.4M12 17.3v.2" />,
  zap: <path d="M13 2.5L3.5 13.5H11L10 21.5 20.5 10.5H13z" />,
  flame: <path d="M12 2.8S6.2 8.2 6.2 13.1a5.8 5.8 0 0 0 11.6 0c0-1.9-.9-3.7-2.4-5.3-.6 1.2-1.4 2-2.5 2.5.4-2.2-.1-4.6-.9-7.5z" />,
  star: <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z" />,
  sparkles: (
    <>
      <path d="M11 4.5l1.4 4.1 4.1 1.4-4.1 1.4L11 15.5l-1.4-4.1-4.1-1.4 4.1-1.4z" />
      <path d="M18.5 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.4 2" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="2.6" />
      <path d="M4 5v14c0 1.4 3.6 2.6 8 2.6s8-1.2 8-2.6V5M4 12c0 1.4 3.6 2.6 8 2.6s8-1.2 8-2.6" />
    </>
  ),
  activity: <path d="M3 12h4l3-7.5 4 15 3-9.5h4" />,
  trendingUp: <path d="M3 17.5l6-6 4 4 8-8.5M15 7h6v6" />,
  layers: <path d="M12 2.8l9.4 4.9-9.4 4.9-9.4-4.9zM3.7 12.4l8.3 4.3 8.3-4.3M3.7 16.9l8.3 4.3 8.3-4.3" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.4" />
    </>
  ),
  oracle: (
    <>
      <circle cx="12" cy="10" r="7" />
      <path d="M8.5 20.5h7M12 6.8l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9z" />
      <path d="M7.4 12.8C8.8 13.9 10.4 14.5 12 14.5s3.2-.6 4.6-1.7" />
    </>
  ),
};

/**
 * Affiche une icône SVG inline.
 * @param {{name: string, size?: number, strokeWidth?: number, className?: string}} props
 */
export function Icon({ name, size = 20, strokeWidth = 2, className = '' }) {
  const content = ICONS[name];
  if (!content) {
    return <span className={`icon icon-missing ${className}`} style={{ width: size, height: size }} aria-hidden="true" />;
  }
  return (
    <svg
      className={`icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {content}
    </svg>
  );
}

export const ICON_NAMES = Object.keys(ICONS);
