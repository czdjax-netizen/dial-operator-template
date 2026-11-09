// Vygeneruje nový klíč rozšíření a zapíše ho do public/manifest.json ("key").
// Klíč určuje id rozšíření v Chromu. Každý fork si ho má vygenerovat JEDNOU hned na začátku,
// aby se jeho rozšíření nepletlo s ostatními (vlastní id = vlastní data i synchronizace).
// Pozor: po instalaci už klíč neměnit, jinak vznikne nové id a rozšíření „zapomene“ data.
// Použití: npm run new-key
import { createHash, generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('../public/manifest.json', import.meta.url);
const manifest = JSON.parse(readFileSync(path, 'utf8'));

const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const der = publicKey.export({ type: 'spki', format: 'der' });
manifest.key = der.toString('base64');
writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');

const hex = createHash('sha256').update(der).digest('hex').slice(0, 32);
const id = [...hex].map((ch) => String.fromCharCode(97 + parseInt(ch, 16))).join('');
console.log(`Nový klíč je v public/manifest.json. Id rozšíření: ${id}`);
console.log('Soukromý klíč není potřeba (rozbalené rozšíření ho nepoužívá), nikam se neukládá.');
