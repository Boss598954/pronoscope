// ============================================================================
// PronoScope — Écusson d'équipe avec repli automatique sur monogramme coloré
// ============================================================================
import { hashHue, monogram } from '../../lib/format';

/**
 * Écusson : si un logo n'est pas disponible dans les sources (cas général),
 * un monogramme coloré déterministe est généré à partir du nom de l'équipe.
 * @param {{ name: string, size?: number, accent?: string|null }} props
 */
export function TeamCrest({ name, size = 40, accent = null }) {
  const hue = hashHue(name || '?');
  const hue2 = (hue + 46) % 360;
  const bg = accent
    ? `linear-gradient(135deg, color-mix(in srgb, ${accent} 82%, #000), color-mix(in srgb, ${accent} 45%, #fff))`
    : `linear-gradient(135deg, hsl(${hue} 62% 42%), hsl(${hue2} 70% 52%))`;
  return (
    <div
      className="crest"
      title={name}
      style={{
        width: size,
        height: size,
        background: bg,
        fontSize: size * 0.34,
      }}
      aria-hidden="true"
    >
      {monogram(name)}
    </div>
  );
}
