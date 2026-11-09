/**
 * Platformní vrstva: jediné místo, které sahá na API prostředí.
 * - `web`: běh jako obyčejná stránka (localhost, `npm run dev`), fetch přes dev proxy.
 * - `chrome`: běh jako rozšíření, chrome.storage, chrome.search, fetch s host permissions.
 */

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  getMany(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
  /** Změny z jiných karet/oken (vlastní zápisy se nehlásí). Vrací funkci pro odhlášení. */
  onExternalChange(cb: (keys: string[]) => void): () => void;
}

/**
 * Úložiště pro synchronizaci mezi počítači. V rozšíření `chrome.storage.sync`
 * (přes účet v Chromu), ve vývoji paměť dev serveru (`/__sync`).
 */
export interface SyncArea {
  kind: 'chrome' | 'dev';
  /** Celkový limit v bajtech (JSON hodnot + délka klíčů). */
  quotaBytes: number;
  /** Limit jedné položky v bajtech. */
  quotaPerItem: number;
  getAll(): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
  /** Něco se ve sync úložišti změnilo (jiný počítač, jiná karta i vlastní zápis). */
  onChange(cb: () => void): () => void;
}

export interface FetchMeta {
  ok: boolean;
  status: number;
  /** Výsledná URL po přesměrování. */
  url: string;
  contentType: string;
}

export interface TextResponse extends FetchMeta {
  text: string;
}

export interface BlobResponse extends FetchMeta {
  blob: Blob;
}

export interface TabInfo {
  url: string;
  title: string;
}

export interface Platform {
  kind: 'web' | 'chrome';
  kv: KeyValueStore;
  /** null = synchronizace tu není k dispozici (web build bez dev serveru). */
  syncArea: SyncArea | null;
  fetchText(url: string, timeoutMs?: number): Promise<TextResponse | null>;
  fetchBlob(url: string, timeoutMs?: number): Promise<BlobResponse | null>;
  /** Hledání výchozím vyhledávačem (web: Google, rozšíření: chrome.search). */
  search(query: string, newTab: boolean): void;
  /** Nabídne soubor ke stažení (záloha). */
  saveFile(name: string, blob: Blob): void;
  /** Aktivní karta (popup „přidat“). Na webu bere `?url=&title=` z adresy. */
  activeTab(): Promise<TabInfo | null>;
}
