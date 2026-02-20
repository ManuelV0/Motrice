import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import RootErrorBoundary from './RootErrorBoundary';

window.__MOTRICE_BOOT_OK__ = true;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
