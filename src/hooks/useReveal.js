// ============================================================================
// PronoScope — Révélation au scroll (IntersectionObserver)
// ============================================================================
import { useEffect, useRef, useState } from 'react';

/**
 * Ajoute la classe « visible » (déclenchant l'animation CSS) quand l'élément
 * entre dans le viewport. Usage : const ref = useReveal(); <div ref={ref} className="reveal">…
 * @param {{once?: boolean, threshold?: number, delay?: number}} opts
 */
export function useReveal({ once = true, threshold = 0.12, delay = 0 } = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('visible');
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (delay) el.style.transitionDelay = `${delay}ms`;
            el.classList.add('visible');
            if (once) io.unobserve(entry.target);
          } else if (!once) {
            el.classList.remove('visible');
          }
        });
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, threshold, delay]);

  return ref;
}

/**
 * Détecte la première apparition d'un élément à l'écran (utilisé pour
 * déclencher les compteurs animés au bon moment).
 */
export function useOnScreen({ threshold = 0.3 } = {}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return [ref, visible];
}
