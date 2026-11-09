// Spočítá id rozšíření z pole "key" v public/manifest.json (stejně jako Chrome).
// Použití: node tools/extension-id.mjs
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8'));
const der = Buffer.from(manifest.key, 'base64');
const hex = createHash('sha256').update(der).digest('hex').slice(0, 32);
const id = [...hex].map((ch) => String.fromCharCode(97 + parseInt(ch, 16))).join('');
console.log(id);
