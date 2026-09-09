import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// The client never talks to audio.cpp directly. In development everything under
// /api is proxied to the Miso service, which is the only process that does.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5170,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5171',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
});
