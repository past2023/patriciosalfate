/* ============================================================
   GALLERY — the auto-updating portfolio.

   * Work section: one card per folder in photos/ (scanGallery)
   * Full-screen overlay with masonry grid
   * Lightbox: canvas renderer with zoom / pan / pinch,
     progressive thumbnail -> full swap, keyboard & touch.
   ============================================================ */
import { $, $$, clamp, lerp, bus, reduceMotion, prettyName, humanSize } from './util.js';
import { t, fmtDate, plural } from './i18n.js';
import { SITE, galleryPath } from './config.js';
import { scanGallery } from './listing.js';
import { getThumbUrl, releaseThumbs } from './thumb.js';

const state = {
  bySlug: new Map(),    // slug -> { photos, source, updatedAt, error }
  openSlug: null,
  overlayUrls: [],
};
let overlay = null, lightbox = null;

/* ================= Work section ================= */

async function loadGallery(slug) {
  const key = slug;
  if (state.bySlug.has(key)) return state.bySlug.get(key);
  const entry = { photos: [], source: null, updatedAt: null, error: null };
  state.bySlug.set(key, entry);
  try {
    const res = await scanGallery(galleryPath(slug));
    Object.assign(entry, res);
  } catch (e) {
    entry.error = e.message;
  }
  return entry;
}

/* non-mutating lookup used by services (preview images) */
export function peekGallery(slug) {
  return loadGallery(slug);
}

/* escape file names before putting them into markup */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function photoUnit(n) {
  return t('work.photos');
}

function countLabel(n) {
  return `${n} ${photoUnit(n)}`;
}

function cardMeta(entry) {
  const latest = entry.photos[0] ? entry.photos[0].date : null;
  return entry.photos.length
    ? `${countLabel(entry.photos.length)} · ${t('ov.updated').replace('{d}', fmtDate(latest))}`
    : '';
}

async function buildWorkGrid() {
  const grid = $('#ggrid');
  if (!grid) return;
  grid.innerHTML = '';
  const entries = await Promise.all(SITE.galleries.map((g) => loadGallery(g.slug)));

  SITE.galleries.forEach((g, i) => {
    const entry = entries[i];
    const card = document.createElement('article');
    card.className = `gcard gcard--${g.span}`;
    card.dataset.reveal = '';
    card.style.transitionDelay = `${Math.min(i, 4) * 80}ms`;
    card.dataset.slug = g.slug;

    if (entry.error && !entry.photos.length) {
      card.classList.add('is-empty');
      card.innerHTML = `
        <div class="empty-in">
          <span class="big" data-i18n="work.error">${t('work.error')}</span>
          <p>${t('ov.error')}</p>
          <button class="btn" data-retry="${g.slug}"><span data-i18n="work.retry">${t('work.retry')}</span></button>
        </div>`;
      card.addEventListener('click', async (e) => {
        const retry = e.target.closest('[data-retry]');
        if (!retry) return;
        e.stopPropagation();
        state.bySlug.delete(g.slug);
        await loadGallery(g.slug);
        buildWorkGrid();
      });
      grid.appendChild(card);
      return;
    }

    const title = t(`gallery.${g.slug}.title`);
    const desc = t(`gallery.${g.slug}.desc`);
    const latest = entry.photos[0] || null;
    const cover = latest && (entry.photos.find((p) => p.cover) || latest);

    card.innerHTML = `
      <figure>
        <span class="skel"></span>
        ${cover ? `<img alt="${esc(title)}" loading="lazy" decoding="async">` : ''}
      </figure>
      <div class="veil"></div>
      <div class="laser" aria-hidden="true"></div>
      <span class="go" aria-hidden="true">↗</span>
      <div class="gcard-body">
        <h3>${title}</h3>
        <p>${desc}</p>
        <div class="gcard-meta">
          <span class="chip"><b>${countLabel(entry.photos.length)}</b></span>
          ${latest ? `<span class="chip">${t('ov.updated').replace('{d}', fmtDate(latest.date))}</span>` : ''}
        </div>
      </div>
      ${!latest ? `<div class="empty-in" style="position:absolute;inset:0;z-index:4;background:var(--surface)">
        <span class="big" data-i18n="work.empty">${t('work.empty')}</span>
        <p data-i18n="work.emptyText">${t('work.emptyText')}</p>
        <code>photos/${g.slug}/</code>
      </div>` : ''}`;

    if (cover) {
      const img = card.querySelector('img');
      getThumbUrl(cover, 900)
        .then((url) => {
          img.src = url;
          img.onload = () => img.classList.add('ld');
          img.onerror = () => img.remove();
        })
        .catch(() => {});
    }

    card.addEventListener('click', () => openOverlay(g.slug));
    card.setAttribute('data-cursor', 'open');
    grid.appendChild(card);
  });

  observeRevealsSafe(grid);
}

function observeRevealsSafe(root) {
  import('./ui.js').then(({ observeReveals }) => observeReveals(root));
}

/* re-render only localized text when language switches */
function refreshWorkLang() {
  const grid = $('#ggrid');
  if (!grid) return;
  grid.querySelectorAll('.gcard').forEach((card) => {
    const slug = card.dataset.slug;
    const g = SITE.galleries.find((x) => x.slug === slug);
    if (!g) return;
    const entry = state.bySlug.get(slug);
    const h3 = card.querySelector('h3');
    if (h3) h3.textContent = t(`gallery.${g.slug}.title`);
    const p = card.querySelector('.gcard-body > p');
    if (p) p.textContent = t(`gallery.${g.slug}.desc`);
    const chips = card.querySelectorAll('.gcard-meta .chip');
    if (entry && entry.photos.length && chips.length) {
      chips[0].innerHTML = `<b>${countLabel(entry.photos.length)}</b>`;
      const latest = entry.photos[0].date;
      if (chips[1]) chips[1].textContent = t('ov.updated').replace('{d}', fmtDate(latest));
    }
    const err = card.querySelector('[data-i18n]');
    if (err) err.textContent = t(err.dataset.i18n);
  });
}

/* ================= Overlay (gallery view) ================= */

function buildOverlayShell() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.id = 'ov';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `
    <div class="ov-head">
      <button class="icon-btn" id="ov-back" data-i18n-aria="ov.back" aria-label="Back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 5l-7 7 7 7"/></svg>
      </button>
      <div class="ov-title">
        <h2 id="ov-name">—</h2>
        <div class="meta"><span id="ov-count"></span><span id="ov-updated"></span></div>
      </div>
      <div class="ov-actions">
        <button class="icon-btn" id="ov-rescan" data-i18n-aria="ov.rescan" data-i18n-title="ov.rescan" aria-label="Rescan">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 11a8 8 0 1 0-2.34 6.34"/><path d="M20 4v7h-7"/></svg>
        </button>
        <button class="icon-btn" id="ov-close" data-i18n-aria="ov.close" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
    </div>
    <div class="ov-body"><div class="ov-inner" id="ov-grid-wrap"></div></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#ov-back').addEventListener('click', closeOverlay);
  overlay.querySelector('#ov-close').addEventListener('click', closeOverlay);
  overlay.querySelector('#ov-rescan').addEventListener('click', rescan);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open') && !lbOpen()) closeOverlay();
  });
}

async function openOverlay(slug) {
  buildOverlayShell();
  state.openSlug = slug;
  const g = SITE.galleries.find((x) => x.slug === slug);
  document.body.style.overflow = 'hidden';
  document.body.classList.add('ov-open');
  overlay.classList.add('open');

  const entry = await loadGallery(slug);
  if (state.openSlug !== slug) return;   /* user already left */
  renderOverlayGrid(entry);
}

/* overlay masonry: fit each item's row span to the real photo ratio
   (grid-auto-rows: 10px, gap: 14px) — no gaps, cells filled edge to edge */
const O_ROW = 10, O_GAP = 14;
function setMSpan(item) {
  const img = item.querySelector('img');
  if (!img || !img.naturalWidth || !img.naturalHeight) return;
  const w = item.clientWidth || 300;
  const h = w * (img.naturalHeight / img.naturalWidth);
  item.style.gridRowEnd = 'span ' + Math.max(12, Math.round((h + O_GAP) / (O_ROW + O_GAP)));
}

function bindMasonryResizeOnce() {
  if (state.masonryResizeBound) return;
  state.masonryResizeBound = true;
  let rzT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rzT);
    rzT = setTimeout(() => {
      const m = document.querySelector('#ov .masonry');
      if (m && overlay && overlay.classList.contains('open')) {
        m.querySelectorAll('.m-item').forEach(setMSpan);
      }
    }, 160);
  }, { passive: true });
}

function renderOverlayGrid(entry) {
  const slug = state.openSlug;
  $('#ov-name').textContent = t(`gallery.${slug}.title`);
  $('#ov-count').textContent = entry.photos.length ? countLabel(entry.photos.length) : '';
  const latest = entry.photos[0] ? entry.photos[0].date : null;
  $('#ov-updated').textContent = latest ? t('ov.updated').replace('{d}', fmtDate(latest)) : '';

  const wrap = $('#ov-grid-wrap');
  releaseThumbs(state.overlayUrls);
  state.overlayUrls = [];
  wrap.innerHTML = '';

  if (!entry.photos.length) {
    wrap.innerHTML = `
      <div class="ov-empty">
        <span class="big">${entry.error ? t('work.error') : t('ov.empty')}</span>
        <p>${entry.error ? t('ov.error') : t('ov.emptyText')}</p>
        <code>photos/${slug}/</code>
      </div>`;
    return;
  }

  const masonry = document.createElement('div');
  masonry.className = 'masonry';
  entry.photos.forEach((p, i) => {
    const fig = document.createElement('figure');
    fig.className = 'm-item';
    fig.dataset.cursor = 'zoom';
    fig.innerHTML = `
      <span class="skel"></span>
      <img alt="${esc(p.name)}" loading="lazy" decoding="async">
      <figcaption><span>${esc(p.name)}</span><span>${humanSize(p.size)}</span></figcaption>`;
    const img = fig.querySelector('img');
    getThumbUrl(p, 720)
      .then((url) => {
        if (state.openSlug !== slug) return;
        img.src = url;
        img.onload = () => { img.classList.add('ld'); setMSpan(fig); };
        img.onerror = () => fig.remove();
        state.overlayUrls.push(url);
      })
      .catch(() => {});
    fig.addEventListener('click', () => {
      if (!lightbox) buildLightbox();
      lightbox.open(slug, i);
    });
    masonry.appendChild(fig);
  });
  wrap.appendChild(masonry);
  bindMasonryResizeOnce();
  overlay.querySelector('.ov-body').scrollTop = 0;
}

async function rescan() {
  const slug = state.openSlug;
  if (!slug) return;
  const btn = $('#ov-rescan');
  btn.classList.add('spin');
  btn.disabled = true;
  state.bySlug.delete(slug);
  const entry = await loadGallery(slug);
  btn.classList.remove('spin');
  btn.disabled = false;
  if (state.openSlug === slug) renderOverlayGrid(entry);
}

function closeOverlay() {
  if (lbOpen()) lightbox.close();
  overlay.classList.remove('open');
  document.body.classList.remove('ov-open');
  state.openSlug = null;
  document.body.style.overflow = '';
  setTimeout(() => releaseThumbs(state.overlayUrls), 800);
  state.overlayUrls = [];
}

function lbOpen() { return lightbox && lightbox.isOpen; }

/* ================= Lightbox (canvas zoom/pan) ================= */

function buildLightbox() {
  const el = document.createElement('div');
  el.id = 'lb';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `
    <canvas id="lb-canvas"></canvas>
    <div class="lb-load" id="lb-load"></div>
    <div class="lb-err" id="lb-err"><span data-i18n="lb.error"></span></div>
    <div class="lb-top">
      <span class="lb-count"><b id="lb-idx">01</b> / <span id="lb-total">00</span></span>
      <button class="icon-btn" id="lb-close" data-i18n-aria="lb.close" aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
    <button class="lb-arrow lb-prev" id="lb-prev" data-i18n-aria="lb.prev" aria-label="Prev">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 5l-7 7 7 7"/></svg>
    </button>
    <button class="lb-arrow lb-next" id="lb-next" data-i18n-aria="lb.next" aria-label="Next">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 5l7 7-7 7"/></svg>
    </button>
    <div class="lb-bottom">
      <span class="lb-name" id="lb-name"></span>
      <span class="lb-zoom" id="lb-zoom">100%</span>
      <div class="lb-ctrl">
        <a class="icon-btn" id="lb-dl" data-i18n-aria="lb.download" data-i18n-title="lb.download" aria-label="Download" download>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 4v11m0 0l-4-4m4 4l4-4"/><path d="M5 19h14"/></svg>
        </a>
      </div>
    </div>`;
  document.body.appendChild(el);
  lightbox = new Lightbox(el);
  el.querySelector('#lb-close').addEventListener('click', () => lightbox.close());
  el.querySelector('#lb-prev').addEventListener('click', () => lightbox.prev());
  el.querySelector('#lb-next').addEventListener('click', () => lightbox.next());
  document.addEventListener('keydown', onLbKey);
}

function onLbKey(e) {
  if (!lightbox || !lightbox.isOpen) return;
  if (e.key === 'Escape') lightbox.close();
  else if (e.key === 'ArrowRight') lightbox.next();
  else if (e.key === 'ArrowLeft') lightbox.prev();
  else if (e.key === '+' || e.key === '=') lightbox.zoomStep(1.3);
  else if (e.key === '-') lightbox.zoomStep(1 / 1.3);
  else if (e.key === '0') lightbox.resetZoom();
}

/* standalone lightbox for sub-pages (built on demand, once) */
export function pageLightbox() {
  if (!lightbox) buildLightbox();
  return lightbox;
}

class Lightbox {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('#lb-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.isOpen = false;
    this.photos = [];
    this.i = 0;
    this.bmp = null;
    this.full = false;
    this.touched = false;
    this.s = 1; this.fit = 1; this.tx = 0; this.ty = 0;
    this.vw = 0; this.vh = 0; this.dpr = 1;
    this.pointers = new Map();
    this.pinched = null;
    this._fullCache = new Map();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);

    const cv = this.canvas;
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0016));
    }, { passive: false });

    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        this.dragging = { x: e.clientX, y: e.clientY, tx: this.tx, ty: this.ty };
        /* swipe-to-navigate: only when not zoomed in */
        this.swipe = (this.s <= this.fit * 1.02)
          ? { x: e.clientX, y: e.clientY, t: performance.now() }
          : null;
        cv.classList.add('grabbing');
      } else if (this.pointers.size === 2) {
        this.swipe = null;
        this.dragging = null;
        const [a, b] = [...this.pointers.values()];
        this.pinched = {
          d: Math.hypot(a.x - b.x, a.y - b.y),
          s: this.s, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2,
        };
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const r = cv.getBoundingClientRect();
      if (this.pointers.size === 1 && this.dragging) {
        this.tx = this.dragging.tx + (e.clientX - this.dragging.x);
        this.ty = this.dragging.ty + (e.clientY - this.dragging.y);
        this.touched = true;
        this.clampPan();
        this.render();
      } else if (this.pointers.size === 2 && this.pinched) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2 - r.left;
        const my = (a.y + b.y) / 2 - r.top;
        const target = clamp(this.pinched.s * (d / this.pinched.d), this.fit, this.fit * 9);
        this.zoomAt(mx, my, target / this.s);
        this.tx += (a.x + b.x) / 2 - this.pinched.mx;
        this.ty += (a.y + b.y) / 2 - this.pinched.my;
        this.pinched.mx = (a.x + b.x) / 2; this.pinched.my = (a.y + b.y) / 2;
        this.pinched.d = d; this.pinched.s = this.s;
        this.touched = true;
        this.clampPan();
        this.render();
      }
    });
    const up = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinched = null;
      if (this.pointers.size === 0) {
        this.dragging = null;
        cv.classList.remove('grabbing');
        /* horizontal flick at 100% zoom = next / prev photo */
        const sw = this.swipe;
        this.swipe = null;
        if (sw) {
          const dx = e.clientX - sw.x;
          const dy = e.clientY - sw.y;
          const dt = performance.now() - sw.t;
          if (dt < 600 && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.4) {
            if (dx < 0) this.next(); else this.prev();
          }
        }
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('dblclick', (e) => {
      const r = cv.getBoundingClientRect();
      const target = this.s < this.fit * 1.6 ? this.fit * 2.4 : this.fit;
      this.zoomAt(e.clientX - r.left, e.clientY - r.top, target / this.s);
      this.touched = this.s > this.fit * 1.05;
    });
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    this.canvas.width = Math.ceil(this.vw * this.dpr);
    this.canvas.height = Math.ceil(this.vh * this.dpr);
    if (this.bmp) {
      if (!this.touched) this.applyFit(false);
      this.clampPan();
      this.render();
    }
  }

  open(slug, i) {
    const entry = state.bySlug.get(slug);
    if (!entry) return;
    this.photos = entry.photos;
    this.isOpen = true;
    this.root.classList.add('open');
    document.body.style.overflow = 'hidden';
    this.resize();
    this.show(i);
    this.root.querySelector('#lb-close').focus({ preventScroll: true });
  }

  /* for standalone pages: open an arbitrary photos array */
  openPhotos(photos, i) {
    this.photos = photos;
    this.isOpen = true;
    this.root.classList.add('open');
    document.body.style.overflow = 'hidden';
    this.resize();
    this.show(i);
    this.root.querySelector('#lb-close').focus({ preventScroll: true });
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove('open');
    if (!overlay.classList.contains('open')) document.body.style.overflow = '';
    this._fullCache.forEach((b) => b && b.close && b.close());
    this._fullCache.clear();
  }

  prev() { this.show((this.i - 1 + this.photos.length) % this.photos.length); }
  next() { this.show((this.i + 1) % this.photos.length); }

  show(i) {
    this.i = i;
    const p = this.photos[i];
    if (!p) return;
    this.touched = false;
    this.full = false;
    this.bmp = null;
    this.root.querySelector('#lb-err').classList.remove('on');
    this.root.querySelector('#lb-load').classList.add('on');

    const idx = this.root.querySelector('#lb-idx');
    const total = this.root.querySelector('#lb-total');
    idx.textContent = String(i + 1).padStart(2, '0');
    total.textContent = String(this.photos.length).padStart(2, '0');
    this.root.querySelector('#lb-name').textContent = prettyName(p.name);
    this.root.querySelector('#lb-dl').href = p.url;
    this.root.querySelector('#lb-zoom').textContent = '100%';

    /* progressive: thumbnail first, then full-res via canvas */
    getThumbUrl(p, 1400)
      .then((url) => new Promise((res) => {
        const im = new Image();
        im.onload = () => {
          if (this.i !== i) return;
          this.setBitmap(im, false);
          res();
        };
        im.onerror = () => res();
        im.src = url;
      }))
      .catch(() => {});

    this.loadFull(p, i);
    this.preloadNeighbors();
  }

  async loadFull(p, i) {
    try {
      let bmp = this._fullCache.get(p.url);
      if (!bmp) {
        const sameOrigin = (() => {
          try { return new URL(p.url).origin === location.origin; } catch (_) { return false; }
        })();
        bmp = await (async () => {
          if (!sameOrigin) {
            /* cross-origin: plain <img> load (canvas can still render it) */
            return await new Promise((resolve, reject) => {
              const x = new Image();
              x.onload = () => resolve(x);
              x.onerror = () => reject(new Error('image load failed'));
              x.src = p.url;
            });
          }
          const res = await fetch(p.url, { cache: 'force-cache' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const blob = await res.blob();
          if ('createImageBitmap' in window) {
            try { return await createImageBitmap(blob); } catch (_) {}
          }
          const u = URL.createObjectURL(blob);
          const im = await new Promise((resolve, reject) => {
            const x = new Image();
            x.onload = () => resolve(x);
            x.onerror = reject;
            x.src = u;
          });
          setTimeout(() => URL.revokeObjectURL(u), 5000);
          return im;
        })();
        if (this._fullCache.size >= 4) {
          const first = this._fullCache.keys().next().value;
          const old = this._fullCache.get(first);
          if (old && old.close) old.close();
          this._fullCache.delete(first);
        }
        this._fullCache.set(p.url, bmp);
      }
      if (this.i !== i) return;
      this.root.querySelector('#lb-load').classList.remove('on');
      this.setBitmap(bmp, true);
    } catch (_) {
      if (this.i === i) {
        this.root.querySelector('#lb-load').classList.remove('on');
        if (!this.bmp) this.root.querySelector('#lb-err').classList.add('on');
      }
    }
  }

  preloadNeighbors() {
    [1, -1].forEach((d) => {
      const p = this.photos[(this.i + d + this.photos.length) % this.photos.length];
      if (p && !this._fullCache.has(p.url)) this.loadFull(p, -1);
    });
  }

  /* HTMLImageElement and ImageBitmap expose size differently */
  _size() {
    const b = this.bmp;
    if (!b) return [0, 0];
    if (typeof b.naturalWidth === 'number') return [b.naturalWidth, b.naturalHeight];
    return [b.width, b.height];
  }

  setBitmap(bmp, isFull) {
    const hadBmp = !!this.bmp;
    this.bmp = bmp;
    this.full = isFull || this.full;
    if (!hadBmp || isFull) {
      if (!this.touched || isFull) this.applyFit(isFull && !hadBmp);
    }
    this.render();
    this.root.querySelector('#lb-load').classList.remove('on');
  }

  applyFit(hard) {
    const [iw, ih] = this._size();
    this.fit = Math.min(this.vw / iw, this.vh / ih);
    /* never open a photo tiny: the SHORT side is shown at at least
       65% of the viewport's short side (soft upscale if the source
       is small — logos, 200x300 seeds, failed full-res loads) */
    const shortSide = Math.min(iw, ih);
    if (shortSide) {
      const targetShort = Math.min(this.vw, this.vh) * 0.65;
      if (shortSide * this.fit < targetShort) this.fit = targetShort / shortSide;
    }
    if (hard || !this.touched) {
      this.s = this.fit;
      this.tx = (this.vw - iw * this.s) / 2;
      this.ty = (this.vh - ih * this.s) / 2;
    }
    this.clampPan();
  }

  clampPan() {
    if (!this.bmp) return;
    const [iw, ih] = this._size();
    const w = iw * this.s, h = ih * this.s;
    if (w <= this.vw) this.tx = (this.vw - w) / 2;
    else this.tx = clamp(this.tx, this.vw - w, 0);
    if (h <= this.vh) this.ty = (this.vh - h) / 2;
    else this.ty = clamp(this.ty, this.vh - h, 0);
  }

  zoomAt(cx, cy, factor) {
    if (!this.bmp) return;
    const s2 = clamp(this.s * factor, this.fit, this.fit * 9);
    const k = s2 / this.s;
    this.tx = cx - k * (cx - this.tx);
    this.ty = cy - k * (cy - this.ty);
    this.s = s2;
    this.touched = this.s > this.fit * 1.02;
    this.clampPan();
    this.render();
    this.root.querySelector('#lb-zoom').textContent = Math.round((this.s / this.fit) * 100) + '%';
  }

  zoomStep(f) { this.zoomAt(this.vw / 2, this.vh / 2, f); }
  resetZoom() {
    if (!this.bmp) return;
    this.touched = false;
    this.applyFit(true);
    this.render();
    this.root.querySelector('#lb-zoom').textContent = '100%';
  }

  render() {
    if (!this.bmp) return;
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.setTransform(this.dpr * this.s, 0, 0, this.dpr * this.s, this.dpr * this.tx, this.dpr * this.ty);
    c.drawImage(this.bmp, 0, 0);
  }
}

/* ================= init ================= */
export async function initGalleries() {
  await buildWorkGrid();
  bus.on('lang', refreshWorkLang);
}
