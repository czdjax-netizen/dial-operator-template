import { PAGE_ID, downloadBlob, readBlob, readText, timedFetch } from './shared';
import type { KeyValueStore, Platform, SyncArea } from './types';

/**
 * Platforma rozšíření. Data v chrome.storage.local (unlimitedStorage), synchronizace
 * v chrome.storage.sync, fetch napřímo díky host permissions (bez CORS).
 */

/** Klíč, kterým každý zápis označí svého autora. Vlastní zápisy pak onChanged ignoruje. */
export const WRITER_KEY = '_writer';
let writes = 0;

function createChromeKv(): KeyValueStore {
  const area = chrome.storage.local;
  return {
    async get<T>(key: string) {
      return (await area.get(key))[key] as T | undefined;
    },
    async getMany(keys) {
      return (await area.get(keys)) as Record<string, unknown>;
    },
    async set(items) {
      // počítadlo zajistí, že se _writer změní vždy a onChanged ho opravdu nahlásí
      await area.set({ ...items, [WRITER_KEY]: `${PAGE_ID}:${++writes}` });
    },
    async remove(keys) {
      await area.remove(keys);
    },
    onExternalChange(cb) {
      const handler = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
        if (areaName !== 'local') return;
        const writer = changes[WRITER_KEY]?.newValue;
        if (typeof writer === 'string' && writer.startsWith(`${PAGE_ID}:`)) return;
        const keys = Object.keys(changes).filter((k) => k !== WRITER_KEY);
        if (keys.length) cb(keys);
      };
      chrome.storage.onChanged.addListener(handler);
      return () => chrome.storage.onChanged.removeListener(handler);
    },
  };
}

function createChromeSyncArea(): SyncArea {
  const area = chrome.storage.sync;
  return {
    kind: 'chrome',
    quotaBytes: area.QUOTA_BYTES,
    quotaPerItem: area.QUOTA_BYTES_PER_ITEM,
    getAll: async () => (await area.get(null)) as Record<string, unknown>,
    set: (items) => area.set(items),
    remove: (keys) => area.remove(keys),
    onChange(cb) {
      const handler = (_changes: unknown, areaName: string) => {
        if (areaName === 'sync') cb();
      };
      chrome.storage.onChanged.addListener(handler);
      return () => chrome.storage.onChanged.removeListener(handler);
    },
  };
}

export function createChromePlatform(): Platform {
  return {
    kind: 'chrome',
    kv: createChromeKv(),
    syncArea: createChromeSyncArea(),
    async fetchText(url, timeoutMs = 8000) {
      return readText(await timedFetch(url, timeoutMs), url);
    },
    async fetchBlob(url, timeoutMs = 8000) {
      return readBlob(await timedFetch(url, timeoutMs), url);
    },
    search(query, newTab) {
      void chrome.search.query({ text: query, disposition: newTab ? 'NEW_TAB' : 'CURRENT_TAB' });
    },
    saveFile: downloadBlob,
    async activeTab() {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab?.url ? { url: tab.url, title: tab.title ?? '' } : null;
    },
  };
}

/** Běží kód jako stránka rozšíření (ne jako obyčejný web)? */
export function isExtensionPage(): boolean {
  return typeof location !== 'undefined' && location.protocol === 'chrome-extension:' && !!globalThis.chrome?.runtime?.id;
}
