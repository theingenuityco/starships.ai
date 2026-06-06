import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Self-host Inter (bundled into the app, no CDN) as the Claude-style UI face.
import '@fontsource-variable/inter';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
