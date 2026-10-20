import { crx } from '@crxjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import manifest from './manifest.json' with { type: 'json' };

export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest })],
  server: {
    // The dev server is fetched from the extension's chrome-extension:// origin.
    cors: { origin: [/^chrome-extension:\/\//] },
  },
});
