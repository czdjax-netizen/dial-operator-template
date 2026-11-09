/**
 * Obrázky náhledů v IndexedDB (WebP 256 px). IndexedDB funguje stejně na localhostu
 * i ve stránce rozšíření, proto není v platformní vrstvě.
 */

const DB_NAME = 'dial-operator';
const DB_VERSION = 1;
const STORE = 'thumbs';

export interface ThumbRecord {
  dialId: string;
  blob: Blob;
  kind: 'logo' | 'shot' | 'custom';
  source?: string;
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'dialId' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function putThumb(rec: ThumbRecord): Promise<void> {
  await tx('readwrite', (s) => s.put(rec));
  const cached = urlCache.get(rec.dialId);
  if (cached) URL.revokeObjectURL(cached.url);
  urlCache.delete(rec.dialId);
}

export function getThumb(dialId: string): Promise<ThumbRecord | undefined> {
  return tx('readonly', (s) => s.get(dialId) as IDBRequest<ThumbRecord | undefined>);
}

export function getAllThumbs(): Promise<ThumbRecord[]> {
  return tx('readonly', (s) => s.getAll() as IDBRequest<ThumbRecord[]>);
}

/** Obrázek → base64 (bez prefixu `data:`), po kusech kvůli limitu argumentů. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

export function base64ToBlob(data: string, mime: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function deleteThumb(dialId: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(dialId));
  const cached = urlCache.get(dialId);
  if (cached) URL.revokeObjectURL(cached.url);
  urlCache.delete(dialId);
}

export async function clearThumbs(): Promise<void> {
  await tx('readwrite', (s) => s.clear());
  for (const c of urlCache.values()) URL.revokeObjectURL(c.url);
  urlCache.clear();
}

const urlCache = new Map<string, { url: string; updatedAt: number }>();

/** Object URL náhledu pro <img>, cache podle `updatedAt`. */
export async function thumbObjectUrl(dialId: string, updatedAt: number): Promise<string | null> {
  const cached = urlCache.get(dialId);
  if (cached && cached.updatedAt === updatedAt) return cached.url;
  const rec = await getThumb(dialId);
  if (!rec) return null;
  if (cached) URL.revokeObjectURL(cached.url);
  const url = URL.createObjectURL(rec.blob);
  urlCache.set(dialId, { url, updatedAt });
  return url;
}
