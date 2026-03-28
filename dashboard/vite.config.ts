import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'https://xetux2-inbox.zbawxh.easypanel.host',
      '/webhook': 'https://xetux2-inbox.zbawxh.easypanel.host',
    },
  },
  build: {
    outDir: 'dist',
  },
});
