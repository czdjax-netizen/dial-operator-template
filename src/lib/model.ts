/**
 * Datový model dial-operatoru. Připravený na pozdější synchronizaci:
 * UUID, updatedAt, měkké mazání (deletedAt) a frakční pozice (pos).
 */

export const SCHEMA_VERSION = 1;

export type ThumbKind = 'logo' | 'shot' | 'custom' | 'glyph';

export interface ThumbRef {
  kind: ThumbKind;
  /** Odkud obrázek je (URL ikony, 'google-favicon', 'sd2'…). */
  source?: string;
  updatedAt: number;
}

export interface Group {
  id: string;
  title: string;
  color?: string;
  /** Frakční index, porovnávat obyčejným `<` (ne localeCompare). */
  pos: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  /** Původní id ze Speed Dial 2. */
  legacyId?: string;
}

export interface VisitsByDaypart {
  morning: number;
  afternoon: number;
  evening: number;
  night: number;
}

export interface Dial {
  id: string;
  groupId: string;
  title: string;
  /** Titulek zadal člověk, automatický úklid ho nesmí přepsat. */
  titleLocked?: boolean;
  url: string;
  pos: string;
  thumb?: ThumbRef;
  visits: number;
  visitsByDaypart?: VisitsByDaypart;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  legacyId?: string;
}

export type ThemeName = 'auto' | 'light' | 'dark';
export type FontName = 'system' | 'serif' | 'mono';
export type OrderBy = 'manual' | 'visits' | 'title' | 'created';
export type Radius = 'none' | 'small' | 'medium' | 'large';
export type Padding = 'none' | 'small' | 'medium' | 'large';
export type Align = 'left' | 'center' | 'right';

export interface Settings {
  theme: ThemeName;
  font: FontName;
  /** Násobek velikosti písma titulků (SD2 fontSize 80 → 0.8). */
  fontScale: number;
  layout: {
    columns: number;
    maxWidth: number;
    gap: number;
    centered: boolean;
    compact: boolean;
    showTitle: boolean;
    showVisits: boolean;
    alignTitle: Align;
    radius: Radius;
    padding: Padding;
    showAdd: boolean;
    /** Stavový řádek dole. */
    showStatus: boolean;
  };
  behavior: {
    openInNewTab: boolean;
    keepActiveGroup: boolean;
    orderBy: OrderBy;
    orderGroupsBy: 'manual' | 'title';
    contextMenu: boolean;
    privacy: boolean;
  };
  background: {
    /** Co je za mřížkou: obrázek, nebo jen barva motivu. */
    kind: 'image' | 'none';
    imageUrl?: string;
    opacity: number;
    size: string;
    position: string;
    repeat: string;
  };
  sync: {
    /**
     * Odkaz na složku Google Disku pro zálohy a synchronizaci. Zadává ho uživatel
     * v nastavení, v kódu natvrdo není. Prázdný = synchronizace vypnutá.
     */
    driveFolderUrl: string;
  };
}

export interface Meta {
  schemaVersion: number;
  deviceId: string;
  createdAt: number;
  /** Kdy se naposledy změnilo nastavení (pro synchronizaci, vyhrává novější). */
  settingsUpdatedAt?: number;
}

export interface Snapshot {
  id: string;
  createdAt: number;
  reason: string;
  groups: Group[];
  dials: Dial[];
}

export function defaultSettings(): Settings {
  return {
    theme: 'auto',
    font: 'system',
    fontScale: 1,
    layout: {
      columns: 4,
      maxWidth: 1280,
      gap: 16,
      centered: true,
      compact: false,
      showTitle: true,
      showVisits: false,
      alignTitle: 'center',
      radius: 'medium',
      padding: 'none',
      showAdd: true,
      showStatus: true,
    },
    behavior: {
      openInNewTab: false,
      keepActiveGroup: true,
      orderBy: 'manual',
      orderGroupsBy: 'manual',
      contextMenu: true,
      privacy: false,
    },
    background: {
      kind: 'none',
      opacity: 0.3,
      size: 'cover',
      position: 'center',
      repeat: 'no-repeat',
    },
    sync: {
      driveFolderUrl: '',
    },
  };
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Část dne podle SD2: ráno 6–12, odpoledne 12–18, večer 18–24, noc 0–6. */
export function daypartOf(date: Date): keyof VisitsByDaypart {
  const h = date.getHours();
  if (h < 6) return 'night';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/**
 * Hluboká kopie čistě datových objektů. Funguje i na reaktivních proxy Svelte 5
 * (structuredClone na nich hází DataCloneError).
 */
export function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Hluboké sloučení nastavení s výchozími hodnotami (neznámé klíče zahodí). */
export function mergeSettings(base: Settings, patch: DeepPartial<Settings> | undefined | null): Settings {
  const out = cloneData(base) as unknown as Record<string, unknown>;
  const src = (patch ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(out)) {
    const value = src[key];
    if (value === undefined || value === null) continue;
    const current = out[key];
    if (current && typeof current === 'object' && !Array.isArray(current) && typeof value === 'object') {
      const inner = current as Record<string, unknown>;
      for (const k of Object.keys(value as object)) {
        const v = (value as Record<string, unknown>)[k];
        if (v !== undefined && v !== null && (k in inner || key === 'background')) inner[k] = v;
      }
    } else if (typeof value === typeof current) {
      out[key] = value;
    }
  }
  return out as unknown as Settings;
}
