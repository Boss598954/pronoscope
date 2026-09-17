// ============================================================================
// PronoScope — Point d'entrée React
// ============================================================================
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Styles (ordre important : fondations -> composants -> animations -> pages)
import './styles/base.css';
import './styles/components.css';
import './styles/animations.css';
import './styles/pages.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
