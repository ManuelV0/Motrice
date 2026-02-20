import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  esbuild: {
    target: 'es2017'
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2017'
    }
  },
  build: {
    target: 'es2017'
  }
});
