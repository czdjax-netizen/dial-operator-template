import type { Plugin } from 'vite';

/**
 * Dev-only proxy `/__proxy?url=…`: v web režimu (localhost) obchází CORS při stahování
 * HTML a ikon pro resolver log. V rozšíření se fetch dělá přímo díky host permissions.
 * Server poslouchá jen na 127.0.0.1, proxy existuje jen během `npm run dev`.
 */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const MAX_BYTES = 5 * 1024 * 1024;

export function devProxy(): Plugin {
  return {
    name: 'dial-operator-dev-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__proxy', async (req, res) => {
        const params = new URL(req.url ?? '', 'http://localhost').searchParams;
        const target = params.get('url') ?? '';
        const timeout = Math.min(Number(params.get('timeout') ?? 8000) || 8000, 20000);
        if (!/^https?:\/\//i.test(target)) {
          res.statusCode = 400;
          res.end('bad url');
          return;
        }
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeout);
        try {
          const upstream = await fetch(target, {
            redirect: 'follow',
            signal: ctrl.signal,
            headers: { 'user-agent': UA, accept: '*/*', 'accept-language': 'cs,en;q=0.8' },
          });
          const buf = Buffer.from(await upstream.arrayBuffer());
          if (buf.byteLength > MAX_BYTES) {
            res.statusCode = 413;
            res.end();
            return;
          }
          res.statusCode = 200;
          res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/octet-stream');
          res.setHeader('x-upstream-status', String(upstream.status));
          res.setHeader('x-final-url', upstream.url);
          res.setHeader('cache-control', 'no-store');
          res.end(buf);
        } catch (err) {
          res.statusCode = 200;
          res.setHeader('x-upstream-status', '0');
          res.setHeader('x-proxy-error', (err as Error)?.name ?? 'Error');
          res.end();
        } finally {
          clearTimeout(timer);
        }
      });
    },
  };
}
