import type { Plugin } from 'vite';

/**
 * Dev-only `/__sync`: náhrada chrome.storage.sync v paměti dev serveru.
 * - `GET /__sync` vrátí `{ version, items }`, `GET /__sync?version=1` jen `{ version }`,
 * - `POST /__sync` s `{ set?: {...}, remove?: [...] }` zapíše a zvýší verzi,
 * - `DELETE /__sync` vše smaže (pro testy).
 * Data zmizí s restartem serveru. Server poslouchá jen na 127.0.0.1.
 */
export function devSync(): Plugin {
  const items = new Map<string, unknown>();
  let version = 0;
  return {
    name: 'dial-operator-dev-sync',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__sync', (req, res) => {
        const json = (body: unknown) => {
          res.setHeader('content-type', 'application/json');
          res.setHeader('cache-control', 'no-store');
          res.end(JSON.stringify(body));
        };
        if (req.method === 'GET') {
          const onlyVersion = new URL(req.url ?? '', 'http://localhost').searchParams.has('version');
          json(onlyVersion ? { version } : { version, items: Object.fromEntries(items) });
          return;
        }
        if (req.method === 'DELETE') {
          items.clear();
          version++;
          json({ version });
          return;
        }
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let raw = '';
        req.on('data', (chunk) => (raw += chunk));
        req.on('end', () => {
          try {
            const body = JSON.parse(raw || '{}') as { set?: Record<string, unknown>; remove?: string[] };
            for (const [k, v] of Object.entries(body.set ?? {})) items.set(k, v);
            for (const k of body.remove ?? []) items.delete(k);
            version++;
            json({ version });
          } catch {
            res.statusCode = 400;
            res.end('bad json');
          }
        });
      });
    },
  };
}
