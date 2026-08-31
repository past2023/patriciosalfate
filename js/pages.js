/* ============================================================
   PAGES — shared bootstrap for the sub-pages
   (photo day, interior, web design, cv, music).
   Usage: <script type="module" src="/js/pages.js" data-page="...">
   or set window.PAGE = { grid: { sel, folder } } before load.
   ============================================================ */
import { $ } from './util.js';
import { detectLang, setLang, applyLang } from './i18n.js';
import { initUI, initTheme, initLogo } from './ui.js';
import { initCursor } from './cursor.js';
import { initStarfield } from './starfield.js';
import { getThumbUrl } from './thumb.js';
import { scanGallery } from './listing.js';
import { pageLightbox } from './gallery.js';

/* masonry: fit each figure's row span to the real image ratio
   (grid-auto-rows: 10px, gap: 14px) so cells fill edge to edge */
const M_ROW = 10, M_GAP = 14;
function setSpan(fig) {
  const img = fig.querySelector('img');
  if (!img || !img.naturalWidth || !img.naturalHeight) return;
  const w = fig.clientWidth || 300;
  const h = w * (img.naturalHeight / img.naturalWidth);
  fig.style.gridRowEnd = 'span ' + Math.max(14, Math.round((h + M_GAP) / (M_ROW + M_GAP)));
}

/* page-specific photo grid (masonry) + shared lightbox */
async function initPhotoGrid(sel, folder) {
  const grid = $(sel);
  if (!grid) return;
  const lb = pageLightbox();
  try {
    const { photos } = await scanGallery('/photos/' + folder + '/');
    if (!photos.length) { grid.remove(); return; }
    photos.forEach((p, i) => {
      const fig = document.createElement('figure');
      fig.innerHTML = `<span class="skel"></span><img alt="" loading="${i < 3 ? 'eager' : 'lazy'}" decoding="async">`;
      grid.appendChild(fig);
      const img = fig.querySelector('img');
      const revealImage = () => {
        fig.querySelector('.skel')?.remove();
        img.classList.add('ld');
        setSpan(fig);
      };
      const showImage = (src) => {
        /* Attach listeners before assigning src. On mobile, a cached image can
           complete synchronously and otherwise remain behind the skeleton. */
        img.onload = revealImage;
        img.onerror = () => {
          if (src !== p.url) {
            img.onerror = null;
            img.src = p.url;
            return;
          }
          /* Do not leave a failed tile looking like an endless loader. */
          fig.querySelector('.skel')?.remove();
          fig.classList.add('is-unavailable');
        };
        img.src = src;
        /* Safari can have a decoded cached image ready before the event is
           delivered. Explicitly reveal it so mobile tiles cannot stay black. */
        if (img.complete && img.naturalWidth) revealImage();
      };
      /* Show the real file immediately; a generated canvas thumbnail replaces
         it when ready. This keeps the gallery usable on mobile browsers whose
         canvas/ImageBitmap pipeline is slow or unavailable. */
      showImage(p.url);
      getThumbUrl(p, 700)
        .then((url) => {
          if (url !== p.url) showImage(url);
        })
        .catch(() => {});
      const openPhoto = () => lb.openPhotos(photos, i);
      fig.addEventListener('click', openPhoto);
      fig.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openPhoto();
        }
      });
      fig.tabIndex = 0;
      fig.setAttribute('role', 'button');
      fig.setAttribute('aria-label', p.name);
    });

    /* keep spans correct when the responsive column width changes */
    let rzT = 0;
    window.addEventListener('resize', () => {
      if (!grid.isConnected) return;
      clearTimeout(rzT);
      rzT = setTimeout(() => grid.querySelectorAll('figure').forEach(setSpan), 160);
    }, { passive: true });
  } catch (_) {
    grid.innerHTML = '<p class="mono">—</p>';
  }
}

/* ---------------- boot ---------------- */
function main() {
  const cfg = window.PAGE || {};

  setLang(detectLang(), { push: false });
  applyLang();

  initUI();
  initTheme();
  initLogo();
  initCursor();
  initStarfield();

  /* footer year */
  const y = $('#year');
  if (y) y.textContent = String(new Date().getFullYear());

  /* per-page photo grid */
  if (cfg.grid) initPhotoGrid(cfg.grid.sel, cfg.grid.folder);

  /* music platforms (from data attributes) */
  const mg = $('#mp-grid');
  if (mg) {
    const ICONS = {
      spotify: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.6 14.4a.6.6 0 0 1-.85.2c-2.3-1.4-5.2-1.7-8.6-.9a.62.62 0 1 1-.27-1.2c3.7-.9 6.9-.6 9.5 1a.6.6 0 0 1 .22.9zm1.2-2.7a.78.78 0 0 1-1.07.26c-2.6-1.6-6.6-2.06-9.7-1.05a.8.8 0 1 1-.46-1.52c3.6-1.16 8.05-.65 11.03 1.2.36.22.47.7.3 1.1zm.1-2.8C14.8 7.9 9.6 7.7 6.5 8.7a.95.95 0 1 1-.55-1.8c3.6-1.16 9.4-.95 13.1 1.25a.94.94 0 0 1-1 1.6z"/></svg>',
      apple: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.05 12.54c-.03-2.5 2.04-3.7 2.13-3.76-1.16-1.7-2.97-1.93-3.61-1.96-1.54-.16-3 .9-3.78.9-.78 0-1.98-.88-3.26-.86-1.68.03-3.22.98-4.08 2.48-1.74 3.02-.44 7.5 1.25 9.95.83 1.2 1.82 2.55 3.11 2.5 1.25-.05 1.72-.8 3.23-.8 1.5 0 1.93.8 3.25.78 1.34-.02 2.19-1.22 3-2.43.95-1.39 1.34-2.73 1.36-2.8-.03-.01-2.6-1-2.62-3.99zM14.6 4.9c.69-.83 1.15-1.99 1.02-3.15-.99.04-2.18.66-2.89 1.49-.64.74-1.2 1.92-1.05 3.05 1.1.09 2.23-.56 2.92-1.39z"/></svg>',
      vk: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.16 17.75c-5.6 0-8.79-3.83-8.91-10.2h2.76c.09 4.67 2.15 6.64 3.8 7.03V7.55h2.6v3.98c1.63-.17 3.33-2.03 3.9-3.98h2.6a7.9 7.9 0 0 1-3.62 5.15 8.2 8.2 0 0 1 4.2 5.05h-2.86a5.13 5.13 0 0 0-4.28-3.7v3.7h-.19z"/></svg>',
      yandex: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.9 22c-4.7 0-8.5-2.4-8.5-8.2V2h3.1v2.6h5.2V2h3.1v3.6c3.1.5 4.5 2.6 4.4 4.8-.1 2.3-1.7 3.9-4.1 4.2v1.6c0 1.6.2 2.8.4 3.2l.4.6H12.9zm2.6-11.6c.6-.3 1-.9 1-1.7 0-.9-.6-1.6-1.7-1.7H11v3.5h4.5v-.1zM11 14.4h4c1.1 0 1.8-.7 1.8-1.8 0-1.1-.7-1.8-1.8-1.8H11v3.6z"/></svg>',
      deezer: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-6.6 14.5h-2.2v-2h2.2v2zm0-3.9h-2.2v-2h2.2v2zm0-3.9h-2.2v-2h2.2v2zm3.9 7.8h-2.2v-2h2.2v2zm0-3.9h-2.2v-2h2.2v2zm0-3.9h-2.2v-2h2.2v2zm3.9 7.8h-2.2v-2h2.2v2zm0-3.9h-2.2v-2h2.2v2z"/></svg>',
      bandcamp: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M0 18.75l7.43-13.5H24L16.57 18.75H0z"/></svg>',
    };
    mg.querySelectorAll('a[data-mp]').forEach((a) => {
      const ic = a.querySelector('.ic');
      if (ic && ICONS[a.dataset.mp]) ic.innerHTML = ICONS[a.dataset.mp];
    });
  }
}

main();
