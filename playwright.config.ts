import { defineConfig, devices } from '@playwright/test';

/**
 * E2E nad web režimem (`npm run dev`), bez okna. Snímky jdou do `private/shots/`.
 * Test rozšíření načte dist/ do Chromia z Playwrightu (e2e/extension.spec.ts).
 */
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'private/e2e-results',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    locale: 'cs-CZ',
    acceptDownloads: true,
  },
  webServer: {
    command: 'npx vite --port 5173 --host 127.0.0.1 --strictPort',
    url: 'http://127.0.0.1:5173/newtab.html',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
