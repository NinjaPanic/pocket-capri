// node scripts/face-lab.mjs → face-lab/index.html (planche des expressions du visage)
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'face-lab');
fs.mkdirSync(out, { recursive: true });
await build({ entryPoints: [path.join(root, 'scripts', 'face-lab.ts')], bundle: true, outfile: path.join(out, 'lab.js'), format: 'iife', logLevel: 'warning' });
fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#111"><canvas></canvas><script src="lab.js"></script>');
console.log('ok');
