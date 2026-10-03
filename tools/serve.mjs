#!/usr/bin/env node
// Minimal static server for a local preview of site/:  npm run serve  →  http://localhost:8080
// (The page also works when index.html is opened straight from disk, but some browsers are stricter about sound
// there. A real web server over https is the reference.)  PORT=3000 npm run serve changes the port.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { SITE } from './lib.mjs';

const port = +(process.env.PORT || 8080);
// What the page needs and nothing else: own scripts, inline styles, a data: favicon. No network at all.
export const CSP = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SITE, path.normalize(p));
  if (!f.startsWith(SITE)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
    const h = { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' };
    if (process.env.CSP) h['content-security-policy'] = CSP;      // strict policy: the page must work with it
    res.writeHead(200, h).end(data);
  });
}).listen(port, () => {
  console.log(`dreambau.com preview on http://localhost:${port}/`);
  console.log('  one at random:   /            force one:   /?anim=4k   /?anim=16k   /?anim=64k');
});
