import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';
import { devProxy } from './tools/dev-proxy';
import { devSync } from './tools/dev-sync';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  plugins: [svelte(), devProxy(), devSync()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'chrome120',
    // dist/ je rovnou rozbalené rozšíření (manifest a ikony jdou z public/)
    rollupOptions: {
      input: {
        newtab: 'newtab.html',
        popup: 'popup.html',
        sw: 'src/background/sw.ts',
      },
      output: {
        // service worker musí mít pevné jméno, na které ukazuje manifest
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
  },
});
