// Inspecteur d'animation : sert la page de dev (dist/renderer/lab.html) en local, en lecture seule.
// Usage : npm run lab   → http://127.0.0.1:5199/lab.html
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'dist', 'renderer');
// her face as tuned in the editor (read only; nothing else from brain/data is ever served)
const face = path.join(root, '..', 'brain', 'data', 'face.json');
const port = Number(process.env.CAPRI_LAB_PORT) || 5199;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.map': 'application/json' };

http.createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = url === '/face.json' ? face : path.join(dir, url === '/' ? 'lab.html' : url);
  if (url !== '/face.json' && !path.resolve(file).startsWith(dir)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(data);
  });
}).listen(port, '127.0.0.1', () => console.log(`inspecteur : http://127.0.0.1:${port}/lab.html`));
