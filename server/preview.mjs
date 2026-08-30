/* ============================================================
   PREVIEW SERVER (local development only — NOT deployed).

   Serves the site and mimics an Apache "FancyIndexing"
   directory listing for /photos/*, exactly like a typical
   shared hosting (Reg.ru, Beget, Timeweb, cPanel...).
   This way the auto-update system behaves in the preview
   the same way it will in production.

   Run:  node server/preview.mjs   ->  http://localhost:8080
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${MONTHS[d.getMonth()]}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtSize(n) {
  if (n == null) return '-';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* Apache-FancyIndexing-like listing (the parser understands it) */
function dirListing(dir, urlPath) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return null;
  }
  const rows = [];
  rows.push(row('../', null, null));
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name === '.htaccess' || e.name === 'README.txt') continue;
    if (e.name.endsWith('.html') && e.name === 'index.html') continue;
    const full = path.join(dir, e.name);
    const isDir = e.isDirectory();
    let size = null, date = null;
    try {
      const st = fs.statSync(full);
      size = st.size;
      date = st.mtimeMs;
    } catch (_) {}
    rows.push(row(
      e.name + (isDir ? '/' : ''),
      isDir ? null : size,
      date,
    ));
  }
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Index of ${escapeHtml(urlPath)}</title></head>
<body><h1>Index of ${escapeHtml(urlPath)}/</h1><hr>
<table class="index">
${rows.join('\n')}
</table>
<hr></body></html>`;

  function row(name, size, date) {
    return `<tr><td class="link"><a href="${escapeHtml(name)}">${escapeHtml(name)}</a></td><td class="size">${fmtSize(size)}</td><td class="date">${date ? fmtDate(date) : '-'}</td></tr>`;
  }
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch (_) {
    res.writeHead(400).end('Bad request');
    return;
  }

  let filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }

  /* /photos/* with directory listing, like Apache with .htaccess */
  if (urlPath.startsWith('/photos/') || urlPath === '/photos') {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      const listing = dirListing(filePath, urlPath.replace(/\/+$/, ''));
      if (listing != null) {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        });
        res.end(listing);
        return;
      }
    }
  }

  /* try file, then /index.html */
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(ROOT, '404.html'), (e2, p404) => {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(e2 ? '404 Not Found' : p404);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const isAsset = /\.(css|js|svg|jpg|jpeg|png|webp|gif|avif|woff2)$/.test(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': isAsset ? 'public, max-age=86400' : 'no-cache',
    });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Preview:  http://localhost:${PORT}`);
  console.log(`Root:     ${ROOT}`);
  console.log('Photos dir listing: Apache-FancyIndexing style (like shared hosting).');
});
