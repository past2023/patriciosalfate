/* ============================================================
   LISTING — the auto-update system.

   How it works (no build step, no CMS, no server code):
   1. Each gallery is a folder on the hosting, e.g. /photos/photo/
   2. The web server returns its directory listing for that folder
      (Apache: via the shipped .htaccess — Options +Indexes;
       Nginx: `autoindex on;` — see README).
   3. This module fetches the listing HTML, parses the file names,
      sizes and dates, recurses into subfolders, and returns the
      photo list sorted "newest first".
   4. If a manifest.json exists in the folder (static hosts that
      cannot do directory listing — see /tools/manifest.html),
      it is used instead.

   Thumbnails are generated client-side on <canvas> (see thumb.js),
   so uploading a photo is the ONLY step you ever do.

   This file is dependency-free on purpose: it can be loaded from
   Node for automated tests.
   ============================================================ */

const IMG_RE = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;
const MAX_DEPTH = 3;

/* ---------- pure parser: listing HTML -> entries ---------- */

/*
 * Parses a directory listing in any of the supported formats:
 *  - Apache "Indexes" (simple <pre> list)
 *  - Apache "FancyIndexing" (table with size + date)
 *  - Nginx autoindex (table with size + date)
 *  - Python http.server / others (simple <ul><li> list)
 *
 * @param {string} html   raw listing HTML
 * @param {string} baseUrl absolute URL the listing was fetched from
 * @returns {{ files: Array, dirs: Array }}
 *   files: [{ name, url, date (ms|null), size (bytes|null) }]
 *   dirs:  [{ name, url }]   (subfolders, for recursion)
 */
export function parseListing(html, baseUrl) {
  let doc;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch (_) {
    return { files: [], dirs: [] };
  }

  const base = new URL(baseUrl);
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const basePath = base.pathname.replace(/\/+$/, '');
  const files = [];
  const dirs = [];
  const seen = new Set();

  const links = doc.querySelectorAll('a[href]');
  for (const a of links) {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;

    let u;
    try { u = new URL(href, base); } catch (_) { continue; }
    if (u.origin !== base.origin) continue;                 // skip external links
    const path = u.pathname;
    const isDir = path.endsWith('/');
    const noSlash = isDir ? path.slice(0, -1) : path;
    const rawName = decodeURIComponent(noSlash.split('/').pop() || '');
    if (!rawName || rawName === '.') continue;

    let size = null, date = null;

    /* date/size: look at the table row (Apache fancy / Nginx) */
    const tr = a.closest('tr');
    if (tr) {
      const tds = Array.from(tr.querySelectorAll('td'));
      for (let i = 0; i < tds.length; i++) {
        const cls = (tds[i].className || '').toLowerCase();
        const txt = tds[i].textContent.trim();
        if (cls.includes('size')) { if (size == null) size = parseSize(txt); continue; }
        if (cls.includes('date')) { if (date == null) date = parseDate(txt); continue; }
        if (cls === 'link' || cls === '') continue;         // name cell
        /* unclassed cells: positional/shape heuristics */
        if (size == null && /^\d[\d.,]*\s*(B|KB|MB|K|M)?$/i.test(txt)) size = parseSize(txt);
        if (date == null && isDateLike(txt)) date = parseDate(txt);
      }
      if (size == null && tds[1]) size = parseSize(tds[1].textContent);
      if (date == null && tds[2]) date = parseDate(tds[2].textContent);
    } else {
      /* <li> or <pre> lists: date/size may be in the tail text */
      const li = a.closest('li') || a.parentElement;
      if (li) {
        const txt = li.textContent.replace(a.textContent, '');
        const d = parseDate(txt);
        if (d) date = d;
        const s = parseSize(txt);
        if (s != null) size = s;
      }
    }

    const url = u.href;
    if (seen.has(url)) continue;
    seen.add(url);

    if (isDir) {
      /* only true subfolders: skip the "../" parent link */
      if (!path.startsWith(basePath + '/')) continue;
      dirs.push({ name: rawName, url });
    } else if (IMG_RE.test(rawName)) {
      files.push({
        name: rawName,
        url,
        date,
        size,
        sub: path.slice(basePath.length + 1).replace(/\/+$/, ''),
      });
    }
  }

  return { files, dirs };
}

/* "245 KB", "1.2 MB", "12.3K", "4567" -> bytes */
function parseSize(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^([\d.,]+)\s*(B|KB|MB|K|M)?/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  if (!isFinite(n)) return null;
  const u = (m[2] || '').toUpperCase();
  if (u === 'KB' || u === 'K') return Math.round(n * 1024);
  if (u === 'MB' || u === 'M') return Math.round(n * 1024 * 1024);
  return Math.round(n);
}

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
  янв: 0, фев: 1, мар: 2, апр: 3, мая: 4, май: 4, июн: 5,
  июл: 6, авг: 7, сен: 8, окт: 9, ноя: 10, дек: 11,
};

/*
 * Recognized date shapes:
 *  2026-08-27 14:32    2026/08/27 27-Aug-2026  27 Aug 2026
 *  08/27/26 14:32      27.08.2026
 */
function parseDate(s) {
  if (!s) return null;
  s = String(s).trim();

  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)).getTime();

  m = s.match(/(\d{1,2})[-\/\s]([A-Za-zА-Яа-я]{3,})[-\/\s,]+(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon != null) {
      let y = +m[3]; if (y < 100) y += 2000;
      return new Date(y, mon, +m[1], +(m[4] || 0), +(m[5] || 0)).getTime();
    }
  }

  m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/);
  if (m) {
    let y = +m[3]; if (y < 100) y += 2000;
    const d = new Date(y, +m[2] - 1, +m[1]);
    if (!isNaN(d)) return d.getTime();
  }
  return null;
}

function isDateLike(s) {
  return (
    /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(s) ||
    /^\d{1,2}[-\/\s][A-Za-zА-Яа-я]{3,}[-\/\s]/.test(s) ||
    /^\d{1,2}[/.]\d{1,2}[/.]\d{2,4}$/.test(s)
  );
}

/* ---------- async scanner (browser) ---------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, timeout = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { cache: 'no-cache', signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { text: await res.text(), url: res.url };
  } finally {
    clearTimeout(timer);
  }
}

function sortByDateDesc(list) {
  return list.sort((a, b) => {
    if (a.date && b.date) return b.date - a.date;
    if (a.date) return -1;
    if (b.date) return 1;
    return b.name.localeCompare(a.name);
  });
}

/*
 * Scans a gallery folder.
 *
 * Photo sources (merged, local folder files always win by name):
 *  - files in the folder itself (directory listing, recursive) — the
 *    permanent "one update system";
 *  - an optional manifest.json in the folder — used for absolute (remote)
 *    photo URLs, e.g. the temporary links to the previous website.
 *
 * @returns {Promise<{photos:Array, source:'manifest'|'auto'|'auto+manifest', updatedAt:number|null}>}
 * throws Error when neither manifest nor listing is available.
 */
export async function scanGallery(folderUrl, { signal } = {}) {
  /* 1) optional manifest.json (remote URLs / static hosts) */
  let manifestPhotos = null;
  try {
    const res = await fetch(folderUrl + 'manifest.json', { cache: 'no-cache', signal });
    if (res.ok) {
      const j = await res.json();
      const arr = Array.isArray(j) ? j : (j.photos || []);
      manifestPhotos = arr
        .filter((p) => p && typeof p.path === 'string' && p.path)
        .map((p) => {
          const abs = /^https?:/i.test(p.path);
          const name = decodeURIComponent(String(p.path).split('/').pop());
          return {
            name,
            url: abs ? p.path : folderUrl + p.path.split('/').map(encodeURIComponent).join('/'),
            thumb: p.thumb && /^https?:/i.test(p.thumb) ? p.thumb : null,
            date: p.date ? (new Date(p.date).getTime() || null) : null,
            size: p.size || null,
            cover: !!p.cover,
          };
        })
        .filter((p) => IMG_RE.test(p.name));
    }
  } catch (_) { /* no manifest — folder only */ }

  /* 2) server directory listing */
  let folderPhotos = null;
  try {
    const { text, url } = await fetchText(folderUrl, 15000);
    const { files, dirs } = parseListing(text, url);
    folderPhotos = [...files];

    /* recurse into subfolders (bounded) */
    let frontier = dirs;
    let depth = 0;
    while (frontier.length && depth < MAX_DEPTH) {
      depth++;
      const next = [];
      for (let i = 0; i < frontier.length; i += 4) {
        const batch = frontier.slice(i, i + 4);
        const results = await Promise.all(batch.map(async (d) => {
          try {
            const r = await fetchText(d.url, 12000);
            const parsed = parseListing(r.text, r.url);
            return { files: parsed.files, dirs: parsed.dirs };
          } catch (_) {
            return { files: [], dirs: [] };
          }
        }));
        for (const r of results) {
          folderPhotos.push(...r.files);
          next.push(...r.dirs);
        }
      }
      frontier = next;
      if (signal && signal.aborted) break;
    }
  } catch (e) {
    if (!manifestPhotos || !manifestPhotos.length) throw new Error('LISTING_FAILED: ' + e.message);
    /* folder unreadable but manifest covers it */
  }

  if (manifestPhotos && manifestPhotos.length) {
    if (folderPhotos && folderPhotos.length) {
      /* local uploads win over manifest entries with the same name */
      const byName = new Map();
      for (const p of manifestPhotos) byName.set(p.name, p);
      for (const p of folderPhotos) byName.set(p.name, p);
      return { photos: sortByDateDesc([...byName.values()]), source: 'auto+manifest', updatedAt: null };
    }
    return { photos: sortByDateDesc(manifestPhotos), source: 'manifest', updatedAt: null };
  }

  return { photos: sortByDateDesc(folderPhotos || []), source: 'auto', updatedAt: null };
}

/* tiny test harness: `node listing.mjs --selftest` (needs a DOM shim) */
if (typeof process !== 'undefined' && process.argv && process.argv.includes('--selftest')) {
  if (typeof globalThis.DOMParser === 'undefined') {
    globalThis.DOMParser = class {
      parseFromString(html) {
        /* minimal DOM stub good enough for the parser: links with parent info */
        const anchors = [];
        const re = /<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
        let m;
        while ((m = re.exec(html))) {
          const href = m[1];
          const idx = re.lastIndex;
          anchors.push({
            getAttribute: (n) => (n === 'href' ? href : null),
            textContent: m[2].trim(),
            closest: (sel) => {
              if (sel === 'tr') {
                const trStart = html.lastIndexOf('<tr', idx);
                const trEnd = html.indexOf('</tr>', idx);
                const trHtml = html.slice(trStart, trEnd);
                const tds = Array.from(trHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)).map((x) => ({
                  className: (x[0].match(/class="([^"]*)"/) || [])[1] || '',
                  textContent: x[1].replace(/<[^>]+>/g, '').trim(),
                }));
                return { querySelectorAll: () => tds };
              }
              if (sel === 'li') {
                const liStart = html.lastIndexOf('<li', idx);
                const liEnd = html.indexOf('</li>', idx);
                return { textContent: html.slice(liStart, liEnd).replace(/<[^>]+>/g, ' ') };
              }
              return null;
            },
            parentElement: null,
          });
        }
        return { querySelectorAll: (sel) => (sel === 'a[href]' ? anchors : []) };
      }
    };
  }
  const samples = {
    apacheFancy: `<!DOCTYPE html><html><body><h1>Index of /photos/photo/</h1><table class="index">
      <tr><td class="link"><a href="../">../</a></td><td class="size">-</td><td class="date">-</td></tr>
      <tr><td class="link"><a href="sub/">sub/</a></td><td class="size">-</td><td class="date">2026-08-01 10:00</td></tr>
      <tr><td class="link"><a href="IMG_7001.jpg">IMG_7001.jpg</a></td><td class="size">2.3 MB</td><td class="date">27-Aug-2026 14:32</td></tr>
      <tr><td class="link"><a href="Фото%201.png">Фото%201.png</a></td><td class="size">512 KB</td><td class="date">2026-08-25 09:15</td></tr>
      <tr><td class="link"><a href="readme.txt">readme.txt</a></td><td class="size">12 B</td><td class="date">2026-08-01 10:00</td></tr>
    </table></body></html>`,
    simple: `<html><body><pre><a href="../">../</a>\n<a href="a.webp">a.webp</a>\n<a href="b.jpg">b.jpg</a></pre></body></html>`,
    nginx: `<html><body><table><tr><td class="link"><a href="c.jpg">c.jpg</a></td><td class="size">1.2M</td><td class="date">2026-08-20 12:00</td></tr></table></body></html>`,
  };
  let fail = 0;
  const check = (label, cond) => {
    console.log((cond ? '  ok  ' : ' FAIL ') + label);
    if (!cond) fail++;
  };
  const a = parseListing(samples.apacheFancy, 'http://x/photos/photo/');
  check('apache fancy: 2 image files', a.files.length === 2);
  check('apache fancy: subfolder detected', a.dirs.length === 1 && a.dirs[0].name === 'sub');
  check('apache fancy: size parsed', a.files[0].size === Math.round(2.3 * 1024 * 1024));
  check('apache fancy: month-name date parsed', a.files[0].date === new Date(2026, 7, 27, 14, 32).getTime());
  check('apache fancy: cyrillic name decoded', a.files[1].name === 'Фото 1.png');
  const s = parseListing(samples.simple, 'http://x/photos/photo/');
  check('simple: 2 files, no dates', s.files.length === 2 && s.files[0].date === null);
  const n = parseListing(samples.nginx, 'http://x/photos/photo/');
  check('nginx: date parsed', n.files[0].date === new Date(2026, 7, 20, 12, 0).getTime());
  console.log(fail ? `SELFTEST FAILED (${fail})` : 'SELFTEST PASSED');
  process.exit(fail ? 1 : 0);
}
