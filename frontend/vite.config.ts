import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// In development the API runs on port 3000; the dev server forwards /api to it so the browser
// only ever talks to one origin (no CORS setup needed while developing).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.VITE_DEV_API ?? 'http://localhost:3000', changeOrigin: true } },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Libraries change rarely, so they are split from the app code and stay cached between updates.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'react';
          if (id.includes('@tanstack') || id.includes('axios')) return 'data';
          if (id.includes('radix-ui') || id.includes('@floating-ui')) return 'radix';
          if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('/zod/')) return 'forms';
          if (id.includes('date-fns')) return 'date';
          if (id.includes('lucide-react')) return 'icons';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
