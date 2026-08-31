/* ============================================================
   APP — boot sequence. Loads every module, wires the site.
   ============================================================ */
import { $, $$, bus } from './util.js';
import { detectLang, setLang, t, applyLang } from './i18n.js';
import { SITE, galleryPath } from './config.js';
import { initUI, buildMarquee, initTheme, initLogo } from './ui.js';
import { initCursor } from './cursor.js';
import { initHero } from './hero.js';
import { initStarfield } from './starfield.js';
import { initGalleries } from './gallery.js';
import { initServices } from './services.js';
import { getThumbUrl } from './thumb.js';
import { scanGallery } from './listing.js';

/* ---------------- channel icons (inline SVG, no icon fonts) ---------------- */
const IC = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS = {
  max: IC('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  telegram: IC('<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>'),
  phone: IC('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z"/>'),
  whatsapp: IC('<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>'),
  vk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="2.8" y="2.8" width="18.4" height="18.4" rx="5.5"/><text x="12" y="15.6" text-anchor="middle" font-family="Arial, sans-serif" font-size="9.5" font-weight="700" fill="currentColor" stroke="none">VK</text></svg>',
};

/* ---------------- static content that JS must fill ---------------- */
function buildGeoMarquee() {
  buildMarquee($('#hero-geo'), t('geo.list').split('|'));
}

function fillStaticContent() {
  /* marquee: services */
  buildMarquee($('#marquee-main'), ['mq.1', 'mq.2', 'mq.3', 'mq.4', 'mq.5', 'mq.6'].map((k) => t(k)));

  /* marquee: clients */
  buildMarquee($('#marquee-clients'), SITE.clients);

  /* marquee: countries (hero bottom edge) */
  buildGeoMarquee();

  /* video cards (YouTube) */
  const vg = $('#vgrid');
  if (vg) {
    SITE.videos.forEach((v) => {
      const a = document.createElement('a');
      a.className = 'vcard';
      a.href = `https://www.youtube.com/watch?v=${v.id}`;
      a.target = '_blank';
      a.rel = 'noopener';
      a.innerHTML = `
        <figure>
          <img src="https://i.ytimg.com/vi/${v.id}/hqdefault.jpg" alt="" loading="lazy">
          <span class="play" aria-hidden="true"></span>
        </figure>
        <div class="vinfo"><b>${t(v.i18n)}</b><span>${t('video.open')} ↗</span></div>`;
      vg.appendChild(a);
    });
  }

  /* contact channels */
  const cg = $('#ch-grid');
  if (cg) {
    SITE.channels.forEach((c) => {
      const a = document.createElement('a');
      a.className = 'ch';
      a.href = c.href;
      if (!c.href.startsWith('tel:')) { a.target = '_blank'; a.rel = 'noopener'; }
      a.innerHTML = `
        <span class="ic">${ICONS[c.icon] || ICONS.phone}</span>
        <span class="lbl">${t(c.i18n)}</span>
        <span class="val">${c.val}</span>`;
      cg.appendChild(a);
    });
  }

  /* process steps */
  const pg = $('#pgrid');
  if (pg) {
    [1, 2, 3].forEach((n) => {
      const d = document.createElement('div');
      d.className = 'pstep';
      d.dataset.reveal = '';
      d.style.transitionDelay = `${(n - 1) * 90}ms`;
      d.innerHTML = `
        <span class="n">0${n}</span>
        <h3 data-i18n="process.s${n}.t">${t(`process.s${n}.t`)}</h3>
        <p data-i18n="process.s${n}.d">${t(`process.s${n}.d`)}</p>`;
      pg.appendChild(d);
    });
  }

  /* about portrait (auto from photos/about) */
  const frame = $('#about-frame');
  if (frame) {
    scanGallery(galleryPath(SITE.aboutFolder))
      .then((res) => {
        const first = res.photos[0];
        if (!first) throw new Error('empty about folder');
        return getThumbUrl(first, 1100)
          .catch(() => first.url)
          .then((url) => {
            const img = document.createElement('img');
            img.alt = '';
            img.loading = 'lazy';
            img.onload = () => img.classList.add('ld');
            img.onerror = () => {
              if (url !== first.url) {
                img.onerror = null;
                img.src = first.url;
              }
            };
            img.src = url;
            frame.appendChild(img);
          });
      })
      .catch(() => frame.classList.add('noimg'));
  }
}

/* re-translate the JS-built blocks on language switch */
function onLang() {
  buildMarquee($('#marquee-main'), ['mq.1', 'mq.2', 'mq.3', 'mq.4', 'mq.5', 'mq.6'].map((k) => t(k)));
  buildMarquee($('#marquee-clients'), SITE.clients);
  buildGeoMarquee();

  const vg = $('#vgrid');
  if (vg) vg.querySelectorAll('.vcard').forEach((a, i) => {
    a.querySelector('b').textContent = t(SITE.videos[i].i18n);
    a.querySelector('.vinfo span').textContent = `${t('video.open')} ↗`;
  });

  const cg = $('#ch-grid');
  if (cg) cg.querySelectorAll('.ch').forEach((a, i) => {
    a.querySelector('.lbl').textContent = t(SITE.channels[i].i18n);
  });

  const pg = $('#pgrid');
  if (pg) pg.querySelectorAll('.pstep').forEach((d, i) => {
    d.querySelector('h3').textContent = t(`process.s${i + 1}.t`);
    d.querySelector('p').textContent = t(`process.s${i + 1}.d`);
  });
}

function initManagerAvatar() {
  const av = $('#manager-avatar');
  if (av) av.addEventListener('error', () => av.remove(), { once: true });
}

/* ---------------- boot ---------------- */
async function main() {
  const lang = detectLang();
  setLang(lang, { push: false });
  applyLang();
  markLangButtons(lang);

  fillStaticContent();
  initUI();
  initTheme();
  initLogo();
  initManagerAvatar();
  initCursor();
  initStarfield();
  initHero();
  initServices();
  await initGalleries();
  bus.on('lang', onLang);

  /* footer year */
  const y = $('#year');
  if (y) y.textContent = String(new Date().getFullYear());
}

function markLangButtons(lang) {
  $$('.lang button').forEach((b) => b.classList.toggle('act', b.dataset.lang === lang));
}

main().catch((e) => {
  console.error('[app] fatal', e);
  const pre = $('#pre');
  if (pre) pre.remove();
  document.body.classList.add('ready');
});
