import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages serves the site from /<repo>/. Override with VITE_BASE for other hosts.
const base = process.env.VITE_BASE ?? '/chess/';

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
});
