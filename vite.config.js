import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base path so built assets work on GitHub Pages (/Argon-Demo/), subpaths, or root domains
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
  server: {
    port: 5173,
    open: true,
  },
});
