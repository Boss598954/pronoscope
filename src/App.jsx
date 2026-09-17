// ============================================================================
// PronoScope — Coquille applicative : écran de chargement, navigation, routes
// ============================================================================
import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { AnimatedBackground } from './components/AnimatedBackground';
import { LoadingScreen } from './components/LoadingScreen';
import { Icon } from './components/icons';
import { useTheme } from './hooks/useTheme';
import { sound } from './lib/sound';
import { supabaseConfigured, APP_VERSION, DISCLAIMER } from './config';

// Découpage du bundle : chaque page se charge à la demande
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const AnalysisPage = lazy(() => import('./pages/AnalysisPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const ReliabilityPage = lazy(() => import('./pages/ReliabilityPage'));

/** Effet ripple global sur les boutons (au clic). */
function useGlobalRipple() {
  useEffect(() => {
    const onPointerDown = (e) => {
      const btn = e.target instanceof Element ? e.target.closest('.btn, .chip[style*="cursor: pointer"], .icon-btn, .tab') : null;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 1.15;
      const ink = document.createElement('span');
      ink.className = 'ripple-ink';
      ink.style.width = ink.style.height = `${size}px`;
      ink.style.left = `${e.clientX - rect.left - size / 2}px`;
      ink.style.top = `${e.clientY - rect.top - size / 2}px`;
      btn.appendChild(ink);
      setTimeout(() => ink.remove(), 700);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);
}

/** Remonte en haut à chaque changement de page. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

function PageFallback() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', padding: '80px 0' }}>
      <span className="spin" style={{ color: 'var(--accent-1)' }}>
        <Icon name="refresh" size={30} />
      </span>
    </div>
  );
}

export default function App() {
  const { theme, toggle } = useTheme();
  const [soundOn, setSoundOn] = useState(sound.enabled);
  const [booted, setBooted] = useState(false);
  const [app, setApp] = useState({ counters: null, warning: null, refreshKey: 0 });
  const [showConfigBanner, setShowConfigBanner] = useState(true);
  useGlobalRipple();

  const onBootDone = useCallback(({ counters, warning }) => {
    setApp((a) => ({ ...a, counters, warning }));
    setBooted(true);
    // Masque l'écran d'amorçage statique présent dans index.html
    document.getElementById('boot-splash')?.classList.add('done');
    setTimeout(() => document.getElementById('boot-splash')?.remove(), 700);
  }, []);

  const refreshApp = useCallback(() => {
    import('./lib/api').then(async ({ fetchCounters }) => {
      const counters = await fetchCounters();
      setApp((a) => ({ ...a, counters, refreshKey: a.refreshKey + 1 }));
    });
  }, []);

  return (
    <>
      <AnimatedBackground />
      {!booted ? <LoadingScreen onDone={onBootDone} /> : null}

      <BrowserRouter>
        <div className="app-shell">
          <Navbar
            theme={theme}
            onToggleTheme={toggle}
            soundOn={soundOn}
            onToggleSound={() => setSoundOn(sound.toggle())}
          />

          <main className="app-main">
            {!supabaseConfigured && showConfigBanner ? (
              <div className="banner banner-warn" style={{ marginBottom: 20 }}>
                <Icon name="alert" size={17} />
                <span className="small grow">
                  <strong>Configuration requise.</strong> Renseignez les variables VITE_SUPABASE_URL et
                  VITE_SUPABASE_ANON_KEY (Paramètres du site &gt; Environment variables dans Netlify), puis redéployez.
                  Suivez le GUIDE-DEPLOIEMENT.md fourni avec le projet.
                </span>
                <button type="button" className="icon-btn" onClick={() => setShowConfigBanner(false)} aria-label="Fermer">
                  <Icon name="close" size={15} />
                </button>
              </div>
            ) : null}

            {booted && app.warning && supabaseConfigured ? (
              <div className="banner banner-info" style={{ marginBottom: 20 }}>
                <Icon name="info" size={17} />
                <span className="small">{app.warning}</span>
              </div>
            ) : null}

            <ScrollToTop />
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<Dashboard app={app} refresh={refreshApp} />} />
                <Route path="/calendrier" element={<CalendarPage app={app} />} />
                <Route path="/analyse" element={<AnalysisPage />} />
                <Route path="/historique" element={<HistoryPage />} />
                <Route path="/fiabilite" element={<ReliabilityPage />} />
                <Route path="*" element={<Dashboard app={app} refresh={refreshApp} />} />
              </Routes>
            </Suspense>
          </main>

          <footer className="app-footer">
            <div className="spread" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div className="row" style={{ gap: 8 }}>
                <span className="logo-badge" style={{ width: 26, height: 26, borderRadius: 8 }}>
                  <Icon name="oracle" size={14} />
                </span>
                <span>
                  <strong>PronoScope</strong> · v{APP_VERSION} — données publiques ouvertes, aucune clé API payante.
                </span>
              </div>
              <span className="xsmall">
                Raccourcis clavier : 1–5 pour naviguer · thème {'⇄'} en haut à droite
              </span>
            </div>
            <p style={{ marginTop: 12, maxWidth: '100ch' }}>{DISCLAIMER}</p>
          </footer>
        </div>
      </BrowserRouter>
    </>
  );
}
