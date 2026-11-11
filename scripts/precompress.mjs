// Writes a .br and a .gz copy next to every compressible file in dist/ after
// the Vite build, so server/index.ts can serve them with the matching
// Content-Encoding. The bundle is 3.4 MB uncompressed and about 950 KB
// gzipped (about 750 KB brotli); App Hosting passes bytes through as the
// server sends them, and before this nothing compressed them, so every
// visitor downloaded the full 3.4 MB before the sign-in form appeared.
// Compressing once at build time costs nothing per request.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);
const dist = path.resolve(process.cwd(), 'dist');
const compressible = /\.(js|mjs|css|html|svg|json|txt|xml|webmanifest|map)$/i;

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const files = (await walk(dist)).filter((f) => compressible.test(f) && !/\.(br|gz)$/.test(f));
let before = 0;
let afterBr = 0;
for (const file of files) {
  const buf = await fs.readFile(file);
  if (buf.length < 1024) continue;
  const [br, gz] = await Promise.all([
    brotli(buf, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
      },
    }),
    gzip(buf, { level: 9 }),
  ]);
  await Promise.all([fs.writeFile(file + '.br', br), fs.writeFile(file + '.gz', gz)]);
  before += buf.length;
  afterBr += br.length;
}
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
console.log(`precompress: ${files.length} files, ${mb(before)} raw, ${mb(afterBr)} brotli`);
