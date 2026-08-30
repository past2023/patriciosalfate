/* ============================================================
   THUMB — client-side thumbnail factory (canvas + IndexedDB).

   Full photos live on the hosting; thumbnails are generated in
   the browser with <canvas>, cached in IndexedDB so revisits are
   instant. New photos uploaded to a folder get their thumbnail
   automatically on the next visit — nothing to prebuild.

   Cache key includes the file SIZE reported by the directory
   listing, so re-uploading a file with the same name (new
   content) automatically invalidates the old thumbnail.
   ============================================================ */
import { Queue } from './util.js';

const DB_NAME = 'ps-thumbs';
const STORE = 'thumbs';
const MAX_CACHED = 500;

const mem = new Map();            // key -> objectURL
const inFlight = new Map();       // key -> Promise<objectURL>
const queue = new Queue(3);       // at most 3 encodes at a time

let dbp = null;

function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    if (!('indexedDB' in window)) return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
  return dbp;
}

function idbGet(key) {
  return openDB().then((db) => {
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readonly');
        const rq = tx.objectStore(STORE).get(key);
        rq.onsuccess = () => resolve(rq.result || null);
        rq.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  });
}

async function idbSet(key, blob) {
  const db = await openDB();
  if (!db) return;
  await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ blob, t: Date.now() }, key);
      const cnt = tx.objectStore(STORE).count();
      cnt.onsuccess = () => { if (cnt.result <= MAX_CACHED) return; };
      tx.oncomplete = () => {
        resolve();
        /* soft cap: drop the oldest entries in a follow-up tx */
        if (cnt.result > MAX_CACHED) evictOldest(cnt.result - MAX_CACHED + 50);
      };
      tx.onerror = () => resolve();
    } catch (_) { resolve(); }
  });
}

function evictOldest(n) {
  openDB().then((db) => {
    if (!db) return;
    new Promise((resolve) => {
      try {
        const entries = [];
        const rtx = db.transaction(STORE, 'readonly');
        const cur = rtx.objectStore(STORE).openCursor();
        cur.onsuccess = () => {
          if (cur.result) {
            entries.push([cur.result.key, cur.result.value.t || 0]);
            cur.result.continue();
          }
        };
        rtx.oncomplete = () => resolve(entries);
        rtx.onerror = () => resolve([]);
      } catch (_) { resolve([]); }
    }).then((entries) => {
      if (!entries.length) return;
      entries.sort((a, b) => a[1] - b[1]);
      const toDrop = entries.slice(0, Math.min(n, entries.length - 100)).map((e) => e[0]);
      if (!toDrop.length) return;
      const tx = db.transaction(STORE, 'readwrite');
      for (const k of toDrop) tx.objectStore(STORE).delete(k);
      tx.onerror = () => {};
    });
  });
}

function webpOK() {
  if (typeof document === 'undefined') return false;
  const c = document.createElement('canvas');
  c.width = c.height = 2;
  return c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
}
let webpCache = null;

/* decode a blob into an ImageBitmap (or a canvas fallback) */
async function decodeBlob(blob) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(blob);
    } catch (_) { /* fall through */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

function encodeThumb(src, targetW, targetH) {
  const c = document.createElement('canvas');
  c.width = targetW;
  c.height = targetH;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, targetW, targetH);
  const type = webpCache === null ? (webpCache = webpOK()) : webpCache;
  return new Promise((resolve) => {
    c.toBlob(
      (b) => resolve(b),
      type ? 'image/webp' : 'image/jpeg',
      0.82
    );
  });
}

/*
 * Returns an object URL for a thumbnail of the given photo.
 * @param {object} photo { url, size, name }
 * @param {number} w     target width in CSS px
 */
export function getThumbUrl(photo, w = 800) {
  /* remote (cross-origin) images: use the given display URL directly —
     no canvas pipeline, no CORS (browser renders <img> cross-origin fine) */
  try {
    if (new URL(photo.url).origin !== location.origin) {
      return Promise.resolve(photo.thumb || photo.url);
    }
  } catch (_) { /* relative/odd URL — run the pipeline */ }

  const key = `${photo.url}@${w}@${photo.size || 0}`;
  if (mem.has(key)) return Promise.resolve(mem.get(key));
  if (inFlight.has(key)) return inFlight.get(key);

  const p = queue.push(async () => {
    /* 1) memory (handled above) */
    /* 2) IndexedDB */
    const hit = await idbGet(key);
    if (hit && hit.blob) {
      const url = URL.createObjectURL(hit.blob);
      mem.set(key, url);
      return url;
    }
    /* 3) generate */
    const res = await fetch(photo.url, { cache: 'force-cache' });
    if (!res.ok) throw new Error('image HTTP ' + res.status);
    const blob = await res.blob();

    /* prefer decoder-side resize (fast, low memory); fall back to canvas */
    let bmp = null;
    if ('createImageBitmap' in window) {
      try {
        bmp = await createImageBitmap(blob, { resizeWidth: w, resizeQuality: 'high' });
      } catch (_) { bmp = null; }
    }
    if (!bmp) bmp = await decodeBlob(blob);

    let tw = bmp.width;
    let th = bmp.height;
    if (th > 1800) { tw = Math.round(tw * (1800 / th)); th = 1800; }

    const out = await encodeThumb(bmp, tw, th);
    if (bmp.close) bmp.close();
    if (out) {
      idbSet(key, out);
      const url = URL.createObjectURL(out);
      mem.set(key, url);
      return url;
    }
    /* encoder failed — use the original file as the thumbnail */
    const url = URL.createObjectURL(blob);
    mem.set(key, url);
    return url;
  });

  inFlight.set(key, p);
  p.finally(() => inFlight.delete(key));
  return p;
}

/* revoke object URLs of a gallery when its overlay closes (IDB keeps them) */
export function releaseThumbs(urls) {
  urls.forEach((u) => {
    if (u && u.startsWith('blob:')) {
      try { URL.revokeObjectURL(u); } catch (_) {}
    }
  });
}
