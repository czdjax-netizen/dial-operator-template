# Rychlá volba: pokyny pro Claude

Projekt je **šablona** nové karty pro Chrome (rozšíření MV3): odkazy ve skupinách jako dlaždice, náhrada Speed Dial 2. Funkce jsou hotové a otestované, vzhled je záměrně obyčejný. Uživatel si udělal fork a chce si hlavně **přetvořit vzhled podle sebe**. Často jde o začátečníka: vysvětluj jednoduše, česky, krátce, bez žargonu, a ukazuj výsledek.

## Pravidla

- Vzhled měň klidně a odvážně (barvy, písma, rozvržení, animace, nové motivy, nové volby v nastavení).
- **Funkce zachovej**: datový model, úložiště, synchronizace, import a zálohy. Když změna zasáhne logiku v `src/lib/`, doplň nebo uprav testy v `tests/`.
- Po změně spusť `npm test`, `npm run check` a `npm run build`. Vzhled ověř přes `npm run e2e` (Playwright bez okna, snímky v `private/shots/`) a snímky si prohlédni. Uživateli řekni, ať v `chrome://extensions` klikne u rozšíření na obnovit.
- Žádné skripty ani styly z CDN: rozšíření MV3 nesmí načítat cizí kód. Písma a knihovny přes npm (třeba `@fontsource/...`) nebo soubory v `public/`. Obrázky z webu jdou, ale lepší je dát je do `public/`.
- Klíč v `public/manifest.json` (`key`) neměň, pokud o to uživatel výslovně nežádá. Výjimka: hned po forku má jednou proběhnout `npm run new-key` (viz README), jinak má rozšíření stejné id jako šablona.
- Commit a push dělej, když o to uživatel požádá. Po povedené změně mu to nabídni.
- Texty v rozhraní a komentáře česky, identifikátory v kódu anglicky.

## Kde co je

- `src/theme/tokens.css`: barvy a motivy jako CSS proměnné (`--bg`, `--surface`, `--text`, `--accent`…), písma, zaoblení. Motiv = blok `:root[data-theme='nazev']`.
- `src/theme/base.css`: tlačítka (`.btn`, `.btn.primary`, `.btn.danger`), pole (`.input`), společné styly.
- `src/newtab/`: komponenty stránky (Svelte 5): `App` (rozvržení, klávesy), `Header` (název a hledání), `GroupTabs`, `Grid`, `Tile` (dlaždice), `GlyphArt` (dlaždice bez loga), `Footer`, `EmptyState`, dialogy (`Modal`, `DialDialog`, `GroupDialog`, `ImportWizard`), `TileMenu`, `Toast`.
- `src/newtab/settings/`: panel nastavení (`SettingsPanel`) a ovládací prvky `Seg`, `Toggle`, `Slider`.
- `src/popup/`: okénko po kliknutí na ikonu rozšíření. `src/background/sw.ts`: položky v menu prohlížeče.
- `src/lib/`: logika bez vzhledu (model, úložiště `store.svelte.ts`, import, zálohy, synchronizace, hledání log). `src/lib/platform/` je jediné místo, které sahá na API prohlížeče.
- `src/lib/brand.ts`: název aplikace. `public/manifest.json`: manifest rozšíření. `public/icons/`: ikony (kreslí je `node tools/make-icons.mjs`).
- `fixtures/sd2-sample.json`: ukázková data (`?seed=fixture` ve vývoji, testy).

## Jak přidat nový motiv

1. V `src/theme/tokens.css` přidat blok `:root[data-theme='vesmir'] { ... }` se všemi proměnnými jako u `light`/`dark`.
2. V `src/lib/model.ts` přidat jméno do `ThemeName`.
3. V `src/newtab/settings/SettingsPanel.svelte` přidat volbu do „Motiv“.
4. Volitelně `resolveTheme` v `src/theme/theme.ts`, pokud má motiv nahradit „podle systému“.

Nová volba v nastavení: přidat pole do `Settings` a výchozí hodnotu do `defaultSettings()` v `src/lib/model.ts` (bez výchozí hodnoty se volba neuloží), pak ovládací prvek v `SettingsPanel.svelte`.

## Příkazy

| Příkaz | Co dělá |
|---|---|
| `npm run dev` | Vývoj na http://127.0.0.1:5173/newtab.html (`?seed=fixture` ukázková data, `?wipe=1` smazat vše, `&logos=0` bez hledání log) |
| `npm test` | Vitest, testy v `tests/` |
| `npm run check` | svelte-check, má být 0 chyb a 0 varování |
| `npm run build` | Rozšíření do `dist/` |
| `npm run e2e` | Build a Playwright bez okna (web režim, synchronizace tří počítačů, rozšíření z `dist/`) |
| `npm run zip` | `release/rychla-volba-<verze>.zip` pro instalaci bez buildu |
| `npm run new-key` | Nový klíč rozšíření (jednou po forku) |
| `npm run extension-id` | Id rozšíření z klíče |

## Pasti

- **Svelte 5 runes:** `structuredClone` na reaktivním stavu hází `DataCloneError`, používat `cloneData()` z `model.ts` nebo `$state.snapshot()`.
- **Pořadí** odkazů a skupin je frakční klíč `pos` (knihovna fractional-indexing). Porovnávat `<` a `>`, ne `localeCompare`.
- **`mergeSettings` zahodí klíč, který není ve výchozím nastavení.** Nová volba proto musí mít výchozí hodnotu.
- **Service worker** (`src/background/sw.ts`) nemá DOM. Importovat do něj jen čistou logiku (`model`, `ops`, `state-utils`, `brand`), ne `store.svelte.ts` ani komponenty.
- **`chrome.storage.onChanged` hlásí i vlastní zápisy**, proto zápisy nesou `_writer` (řeší `src/lib/platform/chrome.ts`).
- **Synchronizace** jde přes `chrome.storage.sync` (limit 100 kB, asi 300 odkazů). Loga a návštěvy se nesynchronizují. Bez přihlášeného účtu v Chromu se chová jako lokální úložiště.
- **Loga** hledá `src/lib/logo-resolver.ts`. Ve vývoji jde stahování přes dev proxy `/__proxy` (CORS), v rozšíření napřímo díky `host_permissions`.
- **Playwright:** na novém počítači `npx playwright install chromium`. `toContainText` porovnává text v DOM, ne vykreslený (CSS `text-transform`).
- **Windows:** dev server na pozadí se zastavuje přes `Get-NetTCPConnection -LocalPort 5173 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess }`.
