// [UPDATED BY ANTIGRAVITY CLI - 2026-05-28]
// Project: Fingas
// Purpose: Vite config — optimised for fast load time on mobile.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // Target modern browsers (iOS 14+, Android 8+) — smaller output
    target: 'es2020',
    // Inline small assets directly into JS to save round-trips
    assetsInlineLimit: 4096,
    // Reduce chunk size warnings threshold
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Fine-grained chunking — each library loads only when needed
        manualChunks(id) {
          if (!id.includes('node_modules')) return null;
          if (id.includes('recharts'))        return 'charts';
          if (id.includes('framer-motion'))   return 'motion';
          if (id.includes('@supabase'))       return 'supabase';
          if (id.includes('react-router'))    return 'router';
          if (id.includes('lucide-react'))    return 'icons';
          if (id.includes('react-dom') || id.includes('/react/')) return 'react-vendor';
          return 'vendor';
        },
      },
    },
  },
  // Warm up frequently used modules to reduce cold-start latency
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'framer-motion',
      '@supabase/supabase-js',
    ],
  },
  server: {
    host: true,
    port: 5173,
  },
});
