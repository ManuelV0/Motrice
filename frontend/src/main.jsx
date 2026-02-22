import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './context/ToastContext';
import { BillingProvider } from './context/BillingContext';
import RootErrorBoundary from './components/RootErrorBoundary';
import 'leaflet/dist/leaflet.css';
import './styles/index.css';

const THEME_KEY = 'motrice.theme';

function bootstrapTheme() {
  let storedTheme = null;
  try {
    storedTheme = window.localStorage.getItem(THEME_KEY);
  } catch {
    storedTheme = null;
  }

  const theme = storedTheme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
}

bootstrapTheme();
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
