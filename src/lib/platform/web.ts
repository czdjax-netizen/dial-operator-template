import { downloadBlob, readBlob, readText, timedFetch } from './shared';
import type { KeyValueStore, Platform, SyncArea } from './types';

const PREFIX = 'dop:';

function createLocalKv(): KeyValueStore {
  const read = (key: string): unknown => {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  };
  return {
    async get<T>(key: string) {
      return read(key) as T | undefined;
    },
    async getMany(keys) {
      const out: Record<string, unknown> = {};
      for (const k of keys) {
        const v = read(k);
        if (v !== undefined) out[k] = v;
      }
      return out;
    },
    async set(items) {
      // Zápis je synchronní, takže doběhne i těsně před navigací pryč ze stránky.
      for (const [k, v] of Object.entries(items)) localStorage.setItem(PREFIX + k, JSON.stringify(v));
    },
    async remove(keys) {
      for (const k of keys) localStorage.removeItem(PREFIX + k);
    },
    onExternalChange(cb) {
      // událost storage chodí jen z jiných karet, vlastní zápisy ne
      const handler = (e: StorageEvent) => {
        if (e.key?.startsWith(PREFIX)) cb([e.key.slice(PREFIX.length)]);
      };
      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    },
  };
}

/**
 * Vývojová náhrada chrome.storage.sync: paměť dev serveru (`tools/dev-sync.ts`).
 * Dvě karty s různým úložištěm (např. dva kontexty v Playwrightu) se tak chovají
 * jako dva počítače. Změny se zjišťují dotazem jednou za sekundu.
 */
function createDevSyncArea(): SyncArea {
  const post = async (body: unknown) => {
    const res = await fetch('/__sync', { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`dev sync: ${res.status}`);
  };
  return {
    kind: 'dev',
    quotaBytes: 102_400,
    quotaPerItem: 8_192,
    async getAll() {
      const res = await fetch('/__sync');
      return ((await res.json()) as { items: Record<string, unknown> }).items;
    },
    set: (items) => post({ set: items }),
    remove: (keys) => post({ remove: keys }),
    onChange(cb) {
      let version = -1;
      const tick = async () => {
        try {
          const res = await fetch('/__sync?version=1');
          const v = ((await res.json()) as { version: number }).version;
          if (version !== -1 && v !== version) cb();
          version = v;
        } catch {
          // dev server zrovna neběží
        }
      };
      void tick();
      const timer = setInterval(tick, 1000);
      return () => clearInterval(timer);
    },
  };
}

/** V dev režimu jde fetch přes `/__proxy` (CORS), jinak přímo. */
function proxied(url: string, timeoutMs: number): string {
  return import.meta.env.DEV ? `/__proxy?timeout=${timeoutMs}&url=${encodeURIComponent(url)}` : url;
}

export function createWebPlatform(): Platform {
  return {
    kind: 'web',
    kv: createLocalKv(),
    syncArea: import.meta.env.DEV ? createDevSyncArea() : null,
    async fetchText(url, timeoutMs = 8000) {
      return readText(await timedFetch(proxied(url, timeoutMs), timeoutMs), url);
    },
    async fetchBlob(url, timeoutMs = 8000) {
      return readBlob(await timedFetch(proxied(url, timeoutMs), timeoutMs), url);
    },
    search(query, newTab) {
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      if (newTab) window.open(url, '_blank', 'noopener');
      else window.location.href = url;
    },
    saveFile: downloadBlob,
    async activeTab() {
      const p = new URL(window.location.href).searchParams;
      const url = p.get('url');
      return url ? { url, title: p.get('title') ?? '' } : null;
    },
  };
}
