import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Base relativa: funciona en GitHub Pages (/NOC-Monitor-Lab/) y en cualquier subcarpeta.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    // Una sola app de ~600 kB (React + lucide); el aviso de 500 kB no aporta nada aquí.
    chunkSizeWarningLimit: 900,
  },
});
