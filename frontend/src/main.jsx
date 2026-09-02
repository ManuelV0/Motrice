import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './context/ToastContext';
import { BillingProvider } from './context/BillingContext';
import RootErrorBoundary from './components/RootErrorBoundary';
import { initializeSupabaseAuth } from './services/authSession';
import { initializeProfileVerificationCamera } from './services/profileVerificationCamera';
import 'leaflet/dist/leaflet.css';
import './styles/index.css';

function bootstrapTheme() {
  document.documentElement.setAttribute('data-theme', 'dark');
  document.documentElement.style.colorScheme = 'dark';
}

bootstrapTheme();
initializeSupabaseAuth().catch(() => {
  // La pagina di login mostrera l'errore se Supabase non e raggiungibile.
});
initializeProfileVerificationCamera().catch(() => {
  // La verifica mantiene disponibile il fallback galleria.
});
window.__MOTRICE_BOOT_OK__ = true;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <BillingProvider>
            <App />
          </BillingProvider>
        </ToastProvider>
      </BrowserRouter>
    </RootErrorBoundary>
  </React.StrictMode>
);
