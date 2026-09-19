import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './context/ToastContext';
import { BillingProvider } from './context/BillingContext';
import RootErrorBoundary from './components/RootErrorBoundary';
import { initializeSupabaseAuth } from './services/authSession';
import 'leaflet/dist/leaflet.css';
import './styles/index.css';

const PENDING_PROFILE_CAPTURE_KEY = 'motrice.profile-verification-camera-pending';

function bootstrapTheme() {
  document.documentElement.setAttribute('data-theme', 'dark');
  document.documentElement.style.colorScheme = 'dark';
}

bootstrapTheme();
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
        // La verifica mantiene disponibile il fallback galleria.
      });
  }
} catch {
  // Storage can be unavailable in restricted browser contexts.
}
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
