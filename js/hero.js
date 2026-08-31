/* ============================================================
   HERO — canvas aurora base + auto-updating photo slideshow
   (Ken Burns, crossfade) + scramble title reveal.

   The slideshow reads photos/hero — add wide shots there and
   they appear on the front page automatically.
   ============================================================ */
import { $, $$, clamp, reduceMotion, bus } from './util.js';
import { t, getLang } from './i18n.js';
import { SITE, galleryPath } from './config.js';
import { scanGallery } from './listing.js';
import { getThumbUrl } from './thumb.js';

const SLIDE_MS = 5000;
const KEN_MS = 5200;

/* ---------------- canvas aurora base ---------------- */
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

let aurora = null;
function initAurora() {
  const c = $('#hero-aurora');
  if (!c) return;
  const ctx = c.getContext('2d');
  let w, h, raf = 0, t0 = performance.now();
  let bg = cssVar('--bg') || '#0a0a0c';
  let light = document.documentElement.classList.contains('light');
  const blobs = [
    { x: 0.22, y: 0.72, r: 0.55, hue: 322, sp: 0.00006, ph: 0 },
    { x: 0.78, y: 0.30, r: 0.50, hue: 222, sp: 0.00004, ph: 2 },
    { x: 0.55, y: 0.85, r: 0.42, hue: 280, sp: 0.00005, ph: 4 },
  ];
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = c.width = Math.ceil(c.clientWidth * dpr);
    h = c.height = Math.ceil(c.clientHeight * dpr);
    if (reduceMotion) frame(0);
  }
  function frame(now) {
    if (!reduceMotion) raf = requestAnimationFrame(frame);
    const t = now - t0;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    for (const b of blobs) {
      const bx = (b.x + Math.sin(t * b.sp + b.ph) * 0.08) * w;
      const by = (b.y + Math.cos(t * b.sp * 1.3 + b.ph) * 0.06) * h;
      const br = b.r * Math.max(w, h);
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      const base = light ? 0.10 : 0.16;
      const a = base + 0.05 * Math.sin(t * b.sp * 4 + b.ph);
      const lch = light ? 48 : 42;
      g.addColorStop(0, `hsla(${b.hue}, 62%, ${lch}%, ${a})`);
      g.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }
  bus.on('theme', (isLight) => {
    light = !!isLight;
    bg = cssVar('--bg') || '#0a0a0c';
    frame(performance.now());
  });
  resize();
  window.addEventListener('resize', resize, { passive: true });
  if (!reduceMotion) raf = requestAnimationFrame(frame);
  else frame(0);
  aurora = c;
}

/* ---------------- slideshow ---------------- */
let slideUrls = [];
let slideA = null, slideB = null, slideIdx = 0, slideTimer = 0, kenT = 0;
let kenRaf = 0;

function kenBurnsLoop(now) {
  kenRaf = requestAnimationFrame(kenBurnsLoop);
  const active = slideA.classList.contains('active') ? slideA : slideB;
  if (!active || !active.classList.contains('active') || reduceMotion) return;
  const t = clamp((now - kenT) / KEN_MS, 0, 1);
  const s = 1.06 + 0.1 * t;
  const dx = Math.sin(t * Math.PI) * 1.2;
  const dy = Math.cos(t * Math.PI * 0.7) * 1.0;
  active.style.transform = `scale(${s.toFixed(4)}) translate(${dx.toFixed(2)}%, ${dy.toFixed(2)}%)`;
}

function nextSlide() {
  if (slideUrls.length < 2) return;
  const incoming = slideIdx === 0 ? slideB : slideA;
  const outgoing = slideIdx === 0 ? slideA : slideB;
  slideIdx = slideIdx === 0 ? 1 : 0;
  incoming.src = slideUrls[slideIdx];
  incoming.style.transform = '';
  outgoing.classList.remove('active');
  incoming.classList.add('active');
  kenT = performance.now();
}

function startKenBurns() {
  if (reduceMotion) return;
  if (!kenRaf) kenRaf = requestAnimationFrame(kenBurnsLoop);
}

async function initSlides() {
  slideA = $('#hero-slide-a');
  slideB = $('#hero-slide-b');
  if (!slideA || !slideB) return;
  try {
    const res = await scanGallery(galleryPath(SITE.heroFolder));
    const photos = res.photos.slice(0, 8);
    if (!photos.length) return;   /* aurora stays on */
    /* use canvas-generated 1600px thumbnails — light on the network */
    const urls = await Promise.all(photos.map(async (p) => {
      /* A hero thumbnail is an optimization, never a prerequisite for the
         local photo. This also keeps mobile Safari useful if canvas or
         ImageBitmap generation is unavailable. */
      try { return await getThumbUrl(p, 1600); } catch (_) { return p.url; }
    }));
    slideUrls = urls.filter(Boolean);
    if (!slideUrls.length) return;

    slideA.src = slideUrls[0];
    slideA.alt = '';
    requestAnimationFrame(() => {
      slideA.classList.add('active');
      kenT = performance.now();
      startKenBurns();
      if (slideUrls.length > 1) {
        slideTimer = setInterval(nextSlide, SLIDE_MS);
      }
    });
  } catch (_) {
    /* hero keeps the aurora — never breaks the page */
  }
}

/* ---------------- scramble title ---------------- */
const GLYPHS = {
  ru: 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЫЭЮЯ·—/\\|▮',
  en: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ·—/\\|▮#*+',
  es: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ·—/\\|▮#*+',
};
function scramble(lineEl, text, delay) {
  if (reduceMotion) { lineEl.textContent = text; return; }
  if (lineEl.__scRaf) cancelAnimationFrame(lineEl.__scRaf);
  const set = GLYPHS[getLang()] || GLYPHS.en;
  const t0 = performance.now() + delay;
  const dur = 750;
  function step(now) {
    if (now < t0) { lineEl.__scRaf = requestAnimationFrame(step); return; }
    const p = clamp((now - t0) / dur, 0, 1);
    const fixed = Math.floor(p * text.length);
    let out = '';
    for (let i = 0; i < text.length; i++) {
      if (i < fixed || text[i] === ' ') out += text[i];
      else out += set[(Math.random() * set.length) | 0];
    }
    lineEl.textContent = out;
    if (p < 1) lineEl.__scRaf = requestAnimationFrame(step);
    else { lineEl.textContent = text; lineEl.__scRaf = 0; }
  }
  lineEl.__scRaf = requestAnimationFrame(step);
}

function runTitle() {
  const top = $('#hero-line-top .line-in');
  const bot = $('#hero-line-bot .line-in');
  if (!top || !bot) return;
  scramble(top, t('hero.titleTop'), 150);
  scramble(bot, t('hero.titleBottom'), 380);
}

/* ---------------- sci-fi title pulse (every 5 s) ----------------
   A different high-tech effect fires on PATRICIO SALFATE every 5 s:
   scan sweep / RGB glitch / under-glow / flicker / data-shift /
   partial re-scramble / hologram interference / tech grid /
   chromatic burst / digital rebuild. Solid text stays solid. */
const FX_LIST = [
  'fx-scan', 'fx-glitch', 'fx-glow', 'fx-flicker', 'fx-shift',
  'fx-data', 'fx-holo', 'fx-grid', 'fx-burst', 'fx-build',
];
let fxStep = (Math.random() * FX_LIST.length) | 0;
let fxTimer = 0;

function miniScramble() {
  const lines = [$('#hero-line-top .line-in'), $('#hero-line-bot .line-in')].filter(Boolean);
  const el = lines[(Math.random() * lines.length) | 0];
  if (!el || el.__scRaf) return;
  const text = el.textContent;
  if (!text) return;
  const set = GLYPHS[getLang()] || GLYPHS.en;
  const flips = [];
  const n = 3 + ((Math.random() * 4) | 0);
  while (flips.length < n) {
    const i = (Math.random() * text.length) | 0;
    if (text[i] !== ' ' && !flips.includes(i)) flips.push(i);
  }
  const t0 = performance.now();
  const dur = 420;
  function step(now) {
    const p = clamp((now - t0) / dur, 0, 1);
    let out = '';
    for (let i = 0; i < text.length; i++) {
      out += flips.includes(i) && p < 0.72
        ? set[(Math.random() * set.length) | 0]
        : text[i];
    }
    el.textContent = out;
    if (p < 1) el.__scRaf = requestAnimationFrame(step);
    else { el.textContent = text; el.__scRaf = 0; }
  }
  el.__scRaf = requestAnimationFrame(step);
}

function techPulse() {
  if (reduceMotion || !document.body.classList.contains('ready')) return;
  const h1 = $('#hero-title');
  if (!h1) return;
  const fx = FX_LIST[fxStep % FX_LIST.length];
  fxStep++;
  if (fx === 'fx-data') { miniScramble(); return; }
  FX_LIST.forEach((f) => { if (f !== 'fx-data') h1.classList.remove(f); });
  void h1.offsetWidth;  /* restart the animation */
  h1.classList.add(fx);
  h1.addEventListener('animationend', () => h1.classList.remove(fx), { once: true });
  setTimeout(() => h1.classList.remove(fx), 1900);  /* safety net */
}

function startTitlePulse() {
  if (reduceMotion) return;
  clearTimeout(fxTimer);
  fxTimer = setInterval(techPulse, 5000);
}

/* ---------------- init ---------------- */
export function initHero() {
  initAurora();
  initSlides();
  bus.on('ready', () => {
    runTitle();
    setTimeout(startTitlePulse, 2400);
  });
  bus.on('lang', () => {
    if (document.body.classList.contains('ready')) runTitle();
  });
}
