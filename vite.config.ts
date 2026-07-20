import { defineConfig } from 'vite';

// base './' keeps asset paths relative so the build works on GitHub Pages
// (or any static host) without knowing the repo name in advance.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 3000,
  },
});
