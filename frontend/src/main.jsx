import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './context/ToastContext';
import { BillingProvider } from './context/BillingContext';
import RootErrorBoundary from './components/RootErrorBoundary';
import { initializeSupabaseAuth } from './services/authSession';
import { initializeErrorMonitoring } from './services/errorMonitoring';
import 'leaflet/dist/leaflet.css';
import './styles/index.css';

const PENDING_PROFILE_CAPTURE_KEY = 'motrice.profile-verification-camera-pending';

function bootstrapTheme() {
  document.documentElement.setAttribute('data-theme', 'dark');
  document.documentElement.style.colorScheme = 'dark';
}

bootstrapTheme();
window.__MOTRICE_BOOT_OK__ = true;

function renderApp() {
  initializeSupabaseAuth().catch(() => {
    // La pagina di login mostrera l'errore se Supabase non e raggiungibile.
  });

  // Load the native camera bridge at startup only when Android is restoring an
  // interrupted capture. During normal launches it stays inside the verification route.
  try {
    if (window.localStorage.getItem(PENDING_PROFILE_CAPTURE_KEY)) {
      import('./services/profileVerificationCamera')
        .then(({ initializeProfileVerificationCamera }) => initializeProfileVerificationCamera())
        .catch(() => {
          // La pagina di verifica mostrera un errore e consentira un nuovo scatto.
        });
    }
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }

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
}

const monitoringInitialization = initializeErrorMonitoring()
  .catch(() => ({ enabled: false }));

// Sentry must never delay or block the app on slower phones. It receives a
// short head start to catch bootstrap failures, then continues in background.
Promise.race([
  monitoringInitialization,
  new Promise((resolve) => window.setTimeout(resolve, 800)),
]).finally(renderApp);
