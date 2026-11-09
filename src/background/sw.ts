import { APP_NAME } from '../lib/brand';
import { newId } from '../lib/model';
import { quickAdd } from '../lib/ops';
import { STORAGE_KEYS, migrate, type PersistedState } from '../lib/state-utils';

/**
 * Service worker rozšíření: položky „Přidat stránku / odkaz“ v menu prohlížeče (pravé tlačítko).
 * Odkaz zapíše rovnou do chrome.storage.local a do fronty náhledů. Logo dohledá až nová
 * záložka (resolver potřebuje DOM a canvas, které service worker nemá).
 */

const MENU_PAGE = 'dial-add-page';
const MENU_LINK = 'dial-add-link';
const WRITER_KEY = '_writer';
let writes = 0;

async function readState() {
  const raw = (await chrome.storage.local.get([...STORAGE_KEYS])) as PersistedState;
  return migrate(raw);
}

/** Menu podle nastavení (CHOVÁNÍ: položka v menu prohlížeče). */
async function updateMenus(): Promise<void> {
  const { settings } = await readState();
  await chrome.contextMenus.removeAll();
  if (!settings.behavior.contextMenu) return;
  chrome.contextMenus.create({ id: MENU_PAGE, title: `Přidat stránku do: ${APP_NAME}`, contexts: ['page'] });
  chrome.contextMenus.create({ id: MENU_LINK, title: `Přidat odkaz do: ${APP_NAME}`, contexts: ['link'] });
}

function badge(text: string, color: string, tabId?: number): void {
  void chrome.action.setBadgeBackgroundColor({ color, tabId });
  void chrome.action.setBadgeText({ text, tabId });
  setTimeout(() => void chrome.action.setBadgeText({ text: '', tabId }), 2500);
}

/** Přidá odkaz do otevřené skupiny. Vrací výsledek kvůli testům. */
async function addFromBrowser(url: string, title: string, tabId?: number): Promise<'added' | 'duplicate' | 'invalid'> {
  const state = await readState();
  const r = quickAdd(
    state.groups,
    state.dials,
    { url, title, activeGroupId: state.ui.activeGroupId, orderGroupsBy: state.settings.behavior.orderGroupsBy },
    Date.now(),
    newId,
  );
  if (!r.dial) {
    badge(r.duplicateOf ? '=' : '!', r.duplicateOf ? '#007c9e' : '#c62828', tabId);
    return r.duplicateOf ? 'duplicate' : 'invalid';
  }
  await chrome.storage.local.set({
    groups: r.groups,
    dials: r.dials,
    thumbQueue: [...state.thumbQueue, r.dial.id],
    [WRITER_KEY]: `sw:${++writes}`,
  });
  badge('+', '#0a8f4e', tabId);
  return 'added';
}

chrome.runtime.onInstalled.addListener(() => void updateMenus());
chrome.runtime.onStartup.addListener(() => void updateMenus());
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) void updateMenus();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const link = info.menuItemId === MENU_LINK;
  const url = link ? info.linkUrl : (info.pageUrl ?? tab?.url);
  // u odkazu titulek neznáme, odvodí se z adresy
  const title = link ? '' : (tab?.title ?? '');
  if (url) void addFromBrowser(url, title, tab?.id);
});

// pro E2E test (Playwright neumí kliknout do menu prohlížeče)
(globalThis as unknown as { addFromBrowserForTests: typeof addFromBrowser }).addFromBrowserForTests = addFromBrowser;
