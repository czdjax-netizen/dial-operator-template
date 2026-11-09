/**
 * Google Disk: zatím jen práce s odkazem na složku z nastavení (kontrola tvaru, id složky).
 * Zálohy na Disk zatím nejsou, potřebovaly by přihlášení přes OAuth (chrome.identity).
 */

const ID = /^[A-Za-z0-9_-]{10,}$/;

/**
 * Vytáhne id složky z odkazu, který Google Disk nabízí ke sdílení:
 * `https://drive.google.com/drive/folders/<id>?usp=sharing`,
 * `https://drive.google.com/drive/u/0/folders/<id>`, `…/open?id=<id>`, nebo holé id.
 * Vrací null, když to id složky není.
 */
export function parseDriveFolderId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (ID.test(raw)) return raw;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.hostname !== 'drive.google.com') return null;
  const m = u.pathname.match(/\/folders\/([A-Za-z0-9_-]+)/);
  const id = m?.[1] ?? u.searchParams.get('id');
  return id && ID.test(id) ? id : null;
}

/** Odkaz na složku pro otevření v prohlížeči. */
export function driveFolderLink(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`;
}
