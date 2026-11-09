# Rychlá volba

Nová karta pro Chrome: oblíbené odkazy jako dlaždice ve skupinách (podobně jako Speed Dial 2). Je to **základ**: všechno funguje, ale vzhled je schválně obyčejný. Udělej si fork a s pomocí Claude Code si z toho udělej vlastní novou kartu, jaká se ti líbí.

## Co umí

- skupiny odkazů a dlaždice s logy webů (najdou se samy), jinak barevné iniciály,
- hledání v odkazech (klávesa `/`), Enter otevře první shodu, adresu, nebo hledání na webu,
- přidat, upravit a smazat odkaz (s možností vrátit), přetahování myší, přesun do jiné skupiny,
- přidání stránky přes pravé tlačítko myši nebo ikonu rozšíření,
- import ze Speed Dial 2, záloha do souboru a body obnovy,
- synchronizace mezi počítači přes účet přihlášený v Chromu,
- světlý a tmavý motiv, nastavení mřížky (sloupce, mezery, zaoblení…), soukromý režim.

## Než začneš (jednou)

1. Na GitHubu klikni na **Fork**. Vznikne tvoje vlastní kopie, kterou můžeš měnit.
2. Nainstaluj [Git](https://git-scm.com/), [Node.js](https://nodejs.org/) (verze 22 nebo novější) a [Claude Code](https://claude.com/claude-code).
3. Stáhni si svůj fork a připrav ho:

   ```bash
   git clone https://github.com/TVUJ-UCET/dial-operator-template.git
   cd dial-operator-template
   npm ci
   npx playwright install chromium
   ```

4. **Vygeneruj si vlastní klíč rozšíření** (jen jednou, hned teď):

   ```bash
   npm run new-key
   ```

   Klíč určuje „id“ rozšíření v Chromu. Díky vlastnímu klíči se tvoje rozšíření nepoplete s jinými forky (vlastní data i synchronizace). Změnu v `public/manifest.json` ulož do gitu. Po instalaci už klíč neměň, rozšíření by jinak „zapomnělo“ svoje data.

5. Pojmenuj si ho: název je v `src/lib/brand.ts` a v `public/manifest.json` (`name`, `short_name`, `default_title`).

## Spuštění a instalace do Chromu

- **Vývoj:** `npm run dev`, pak otevři http://127.0.0.1:5173/newtab.html?seed=fixture (ukázková data). Změny v kódu se ukazují hned.
- **Rozšíření:** `npm run build` postaví rozšíření do složky `dist`. V Chromu otevři `chrome://extensions`, zapni **Režim pro vývojáře**, klikni **Načíst rozbalené** a vyber složku `dist`. Po dalším `npm run build` stačí na kartě rozšíření kliknout na šipku „obnovit“.
- **Na jiný počítač bez Node:** `npm run zip` vyrobí `release/rychla-volba-<verze>.zip`. Ten rozbal do stálé složky a načti stejně jako `dist`.

Rozšíření při aktualizaci **neodebírej**, smazala by se jeho data. Funguje v Chromu (a v Edge či Brave) na Windows, Macu a Linuxu. Na mobilu rozšíření nejdou.

## Vlastní vzhled s Claude Code

Ve složce projektu spusť `claude` a napiš, co chceš. Třeba:

- „Udělej vesmírný motiv: tmavě modré pozadí s hvězdami a dlaždice, které při najetí trochu svítí.“
- „Chci pixelový styl jako ve staré videohře, s pixelovým písmem.“
- „Pastelové barvy, hodně zaoblené dlaždice a jemná animace při otevření stránky.“
- „Přidej do nastavení výběr barvy zvýraznění.“
- „Ať se nahoře zobrazuje hodina a datum.“

Claude ví, kde co je (návod pro něj je v `CLAUDE.md`). Když se ti změna líbí, ulož ji do gitu (`git add -A`, `git commit -m "…"`, `git push`), nebo o to požádej Clauda. Když se nelíbí, můžeš se vrátit k poslední uložené verzi.

Kde je vzhled:

- `src/theme/tokens.css`: barvy, motivy, písmo, zaoblení,
- `src/theme/base.css`: tlačítka a společné styly,
- `src/newtab/*.svelte`: části stránky (hlavička, skupiny, dlaždice, patička, dialogy),
- `src/newtab/settings/`: panel nastavení.

## Testy

```bash
npm test          # testy logiky (import, zálohy, synchronizace…)
npm run check     # kontrola typů
npm run e2e       # build a testy v prohlížeči bez okna, snímky do private/shots/
```
