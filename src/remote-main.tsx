import React from 'react';
import ReactDOM from 'react-dom/client';
import { MobileCompanion } from './components/remote/MobileCompanion';
import './styles/theme.css';

const rootEl = document.getElementById('remote-root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <MobileCompanion />
    </React.StrictMode>
  );
}