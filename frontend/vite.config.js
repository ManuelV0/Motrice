import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function hasSentryBuildToken() {
  if (String(process.env.SENTRY_AUTH_TOKEN || '').trim()) return true;

  const tokenFile = resolve(process.cwd(), '.env.sentry-build-plugin');
  if (!existsSync(tokenFile)) return false;

  try {
    return /^\s*SENTRY_AUTH_TOKEN\s*=\s*\S+/m.test(readFileSync(tokenFile, 'utf8'));
  } catch {
    return false;
  }
}

const uploadSentrySourceMaps = hasSentryBuildToken();

export default defineConfig({
  plugins: [
    react(),
    ...(uploadSentrySourceMaps
      ? [sentryVitePlugin({
          org: 'motrice',
          project: 'capacitor',
          telemetry: false,
          sourcemaps: {
            filesToDeleteAfterUpload: ['./dist/**/*.map'],
          },
        })]
      : []),
  ],
  optimizeDeps: {
    exclude: ['maplibre-gl']
  },
  build: {
    target: 'es2020',
    // Hidden maps are uploaded only when a private Sentry build token is
    // available, then removed from dist so they never ship inside the app.
    sourcemap: uploadSentrySourceMaps ? 'hidden' : false,
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  }
});
