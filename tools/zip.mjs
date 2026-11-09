// Zabalí hotový build (dist/) do release/rychla-volba-<verze>.zip pro instalaci bez buildu.
// Spouští se přes `npm run zip` (nejdřív proběhne build). Bez závislostí: ZIP s deflate
// zapisuje přímo, CRC32 bere ze zlib (Node 22.2+).
// Použití: node tools/zip.mjs

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import zlib from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

let manifest;
try {
  manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
} catch {
  console.error('Chybí dist/manifest.json, nejdřív npm run build.');
  process.exit(1);
}
if (manifest.version !== pkg.version) {
  console.error(`Verze nesedí: manifest ${manifest.version}, package.json ${pkg.version}.`);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function dosTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

const now = dosTime(new Date());
const locals = [];
const central = [];
let offset = 0;

for (const file of walk(dist)) {
  const name = Buffer.from(relative(dist, file).split(sep).join('/'), 'utf8');
  const data = readFileSync(file);
  const crc = zlib.crc32(data) >>> 0;
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  // malé nebo už zkomprimované soubory (PNG, woff2) uložit bez komprese, pokud deflate nepomůže
  const stored = deflated.length >= data.length;
  const body = stored ? data : deflated;
  const method = stored ? 0 : 8;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // jména v UTF-8
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(now.time, 10);
  local.writeUInt16LE(now.date, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  locals.push(local, name, body);

  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0x0800, 8);
  cd.writeUInt16LE(method, 10);
  cd.writeUInt16LE(now.time, 12);
  cd.writeUInt16LE(now.date, 14);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(body.length, 20);
  cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(name.length, 28);
  cd.writeUInt32LE(offset, 42);
  central.push(cd, name);

  offset += local.length + name.length + body.length;
}

const cdSize = central.reduce((n, b) => n + b.length, 0);
const count = central.length / 2;
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(count, 8);
end.writeUInt16LE(count, 10);
end.writeUInt32LE(cdSize, 12);
end.writeUInt32LE(offset, 16);

const outDir = join(root, 'release');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `rychla-volba-${pkg.version}.zip`);
const zip = Buffer.concat([...locals, ...central, end]);
writeFileSync(out, zip);
console.log(`${relative(root, out)}: ${count} souborů, ${(zip.length / 1024).toFixed(0)} kB`);
