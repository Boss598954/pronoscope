// ============================================================================
// PronoScope — Barre de navigation (5 fenêtres + thème + son) + nav mobile
// ============================================================================
import { useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from './icons';
import { Logo } from './Logo';
import { sound } from '../lib/sound';

export const NAV_ITEMS = [
  { to: '/', label: 'Accueil', icon: 'oracle', key: '1' },
  { to: '/calendrier', label: 'Calendrier', icon: 'calendar', key: '2' },
  { to: '/analyse', label: 'Analyse', icon: 'gauge', key: '3' },
  { to: '/historique', label: 'Historique', icon: 'history', key: '4' },
  { to: '/fiabilite', label: 'Fiabilité', icon: 'target', key: '5' },
];

/** Raccourcis clavier 1-5 pour naviguer entre les fenêtres. */
function useKeyboardNav() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const item = NAV_ITEMS.find((n) => n.key === e.key);
      if (item && location.pathname !== item.to) {
        navigate(item.to);
        sound.nav();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, location.pathname]);
}

export function Navbar({ theme, onToggleTheme, soundOn, onToggleSound }) {
  useKeyboardNav();
  return (
    <>
      <header className="navbar">
        <Logo />
        <nav className="nav-links" aria-label="Navigation principale">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              onClick={() => sound.nav()}
              title={`Fenêtre ${item.key} — raccourci clavier « ${item.key} »`}
            >
              <Icon name={item.icon} size={16} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="nav-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={onToggleSound}
            aria-label={soundOn ? 'Couper les sons' : 'Activer les sons'}
            title={soundOn ? 'Couper les sons' : 'Activer les sons'}
          >
            <Icon name={soundOn ? 'volumeOn' : 'volumeOff'} size={18} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
            title={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
          </button>
        </div>
      </header>

      {/* Navigation mobile (bas d'écran, style application) */}
      <nav className="mobile-nav" aria-label="Navigation mobile">
        <div className="row">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `mnav-link ${isActive ? 'active' : ''}`}
              onClick={() => sound.nav()}
            >
              <Icon name={item.icon} size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
