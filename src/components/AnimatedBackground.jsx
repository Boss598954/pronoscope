// ============================================================================
// PronoScope — Arrière-plan animé (canvas : orbes lumineux + grille subtile)
// ============================================================================
import { useEffect, useRef } from 'react';

/**
 * Fond animé : orbes dégradées violet/bleu/cyan qui dérivent lentement,
 * parallaxe légère au scroll, pause quand l'onglet est masqué,
 * désactivé si l'utilisateur préfère réduire les animations.
 */
export function AnimatedBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    let raf = 0;
    let running = true;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;

    const palette = [
      { c1: 'rgba(124, 58, 237, 0.16)', c2: 'rgba(124, 58, 237, 0)' },
      { c1: 'rgba(37, 99, 235, 0.13)', c2: 'rgba(37, 99, 235, 0)' },
      { c1: 'rgba(6, 182, 212, 0.12)', c2: 'rgba(6, 182, 212, 0)' },
      { c1: 'rgba(167, 139, 250, 0.10)', c2: 'rgba(167, 139, 250, 0)' },
    ];

    const orbs = Array.from({ length: 9 }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.16 + Math.random() * 0.24,
      vx: (Math.random() - 0.5) * 0.00016,
      vy: (Math.random() - 0.5) * 0.00012,
      p: palette[i % palette.length],
      phase: Math.random() * Math.PI * 2,
    }));

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (t) => {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);

      const light = document.documentElement.getAttribute('data-theme') === 'light';
      const boost = light ? 0.55 : 1;

      for (const o of orbs) {
        o.x += o.vx;
        o.y += o.vy;
        if (o.x < -0.3) o.x = 1.3;
        if (o.x > 1.3) o.x = -0.3;
        if (o.y < -0.3) o.y = 1.3;
        if (o.y > 1.3) o.y = -0.3;
        const breathe = 1 + Math.sin(t / 3400 + o.phase) * 0.1;
        const R = o.r * Math.min(w, h) * breathe;
        const g = ctx.createRadialGradient(o.x * w, o.y * h, 0, o.x * w, o.y * h, R);
        g.addColorStop(0, o.p.c1.replace(/0\.\d+\)$/, `${0.14 * boost})`));
        g.addColorStop(1, o.p.c2);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(o.x * w, o.y * h, R, 0, Math.PI * 2);
        ctx.fill();
      }

      // Grille subtile
      ctx.strokeStyle = light ? 'rgba(20, 30, 70, 0.05)' : 'rgba(148, 163, 216, 0.05)';
      ctx.lineWidth = 1;
      const step = 64;
      const off = (window.scrollY * 0.12) % step;
      ctx.beginPath();
      for (let x = 0; x <= w; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = -off; y <= h; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    };

    if (reduced) {
      // Une seule image statique pour respecter prefers-reduced-motion
      running = true;
      draw(0);
      running = false;
      cancelAnimationFrame(raf);
    } else {
      raf = requestAnimationFrame(draw);
    }

    const onVis = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reduced) {
        running = true;
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        background:
          'radial-gradient(1300px 900px at 15% -10%, rgba(124, 58, 237, 0.07), transparent 60%), radial-gradient(1100px 800px at 90% 110%, rgba(6, 182, 212, 0.06), transparent 60%)',
      }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
