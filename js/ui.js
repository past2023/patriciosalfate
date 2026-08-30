/* ============================================================
   UI — preloader, header, menu, reveals, parallax, progress,
   magnetic buttons, marquees.
   ============================================================ */
import { $, $$, clamp, lerp, reduceMotion, bus } from './util.js';
import { t, getLang, setLang } from './i18n.js';

/* ---------------- preloader ---------------- */
let preDone = false;

function runPreloader() {
  const pre = $('#pre');
  if (!pre) { bus.emit('ready'); return; }
  const num = $('#pre-num');
  const bar = $('#pre-line b') || $('#pre-line');
  const t0 = performance.now();
  const dur = reduceMotion ? 250 : 1000;
  const minHold = reduceMotion ? 350 : 780;

  function tick(now) {
    const p = clamp((now - t0) / dur, 0, 1);
    const e = 1 - Math.pow(1 - p, 3);
    if (num) num.textContent = String(Math.round(e * 100)).padStart(3, '0');
    if (bar) bar.style.width = (e * 100).toFixed(1) + '%';
    if (p < 1 && !(now - t0 >= minHold)) {
      requestAnimationFrame(tick);
    } else {
      if (num) num.textContent = '100';
      if (bar) bar.style.width = '100%';
      setTimeout(finish, reduceMotion ? 60 : 320);
    }
  }
  requestAnimationFrame(tick);

  function finish() {
    if (preDone) return;
    preDone = true;
    pre.classList.add('done');
    document.body.classList.add('ready');
    setTimeout(() => {
      pre.remove();
      bus.emit('ready');
    }, reduceMotion ? 120 : 1000);
  }
}

/* ---------------- header / progress / parallax ---------------- */
function initScrollFX() {
  const header = $('#site-header');
  const progress = $('#progress');
  const parEls = $$('[data-parallax]').map((el) => ({
    el,
    sp: parseFloat(el.dataset.parallax) || 0.12,
  }));
  let ticking = false;

  function update() {
    ticking = false;
    const y = window.scrollY || 0;
    if (header) header.classList.toggle('scrolled', y > 30);
    if (progress) {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
    }
    if (!reduceMotion && parEls.length) {
      const vh = window.innerHeight;
      for (const { el, sp } of parEls) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -80 || r.top > vh + 80) continue;
        const mid = r.top + r.height / 2 - vh / 2;
        el.style.transform = `translate3d(0, ${(-mid * sp).toFixed(1)}px, 0)`;
      }
    }
  }
  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();
}

/* ---------------- burger menu ---------------- */
function initMenu() {
  const burger = $('#burger');
  if (!burger) return;
  const setOpen = (open) => {
    document.body.classList.toggle('menu-open', open);
    if (!open && !document.body.classList.contains('ov-open')) document.body.style.overflow = '';
    burger.setAttribute('aria-expanded', String(open));
  };
  burger.addEventListener('click', () => {
    const open = !document.body.classList.contains('menu-open');
    if (open) document.body.style.overflow = 'hidden';
    setOpen(open);
  });
  $$('#menu a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('menu-open')) setOpen(false);
  });
}

/* ---------------- reveals ---------------- */
let io = null;
export function observeReveals(root = document) {
  if (reduceMotion) {
    $$('[data-reveal]', root).forEach((el) => el.classList.add('rv-in'));
    return;
  }
  if (!io) {
    io = new IntersectionObserver((es) => {
      for (const e of es) {
        if (e.isIntersecting) {
          e.target.classList.add('rv-in');
          io.unobserve(e.target);
        }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  }
  $$('[data-reveal]:not(.rv-in)', root).forEach((el) => io.observe(el));
}

/* ---------------- magnetic buttons ---------------- */
function initMagnetic() {
  if (reduceMotion || !matchMedia('(pointer: fine)').matches) return;
  $$('.magnetic').forEach((el) => {
    let raf = 0, tx = 0, ty = 0, cx = 0, cy = 0, inside = false;
    function loop() {
      raf = requestAnimationFrame(loop);
      cx = lerp(cx, tx, inside ? 0.22 : 0.12);
      cy = lerp(cy, ty, inside ? 0.22 : 0.12);
      el.style.transform = `translate(${cx.toFixed(2)}px, ${cy.toFixed(2)}px)`;
      if (!inside && Math.abs(cx) < 0.3 && Math.abs(cy) < 0.3) {
        cx = cy = 0;
        el.style.transform = '';
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      tx = clamp((e.clientX - (r.left + r.width / 2)) * 0.22, -14, 14);
      ty = clamp((e.clientY - (r.top + r.height / 2)) * 0.22, -12, 12);
      inside = true;
      if (!raf) raf = requestAnimationFrame(loop);
    });
    el.addEventListener('mouseleave', () => { inside = false; tx = 0; ty = 0; });
  });
}

/* ---------------- marquees (content injected) ---------------- */
export function buildMarquee(el, items) {
  if (!el) return;
  el.innerHTML = '';
  const track = document.createElement('div');
  track.className = 'marquee-track';
  for (let c = 0; c < 2; c++) {   /* two copies => seamless -50% loop */
    const div = document.createElement('div');
    div.className = 'mq-set';
    for (const it of items) {
      const s = document.createElement('span');
      s.textContent = it;
      div.appendChild(s);
      const i = document.createElement('i');
      i.textContent = '✦';
      div.appendChild(i);
    }
    track.appendChild(div);
  }
  el.appendChild(track);
}

/* ---------------- language switcher ---------------- */
function initLang() {
  $$('.lang button').forEach((b) => {
    b.addEventListener('click', () => {
      if (b.dataset.lang === getLang()) return;
      $$('.lang button').forEach((x) => x.classList.toggle('act', x.dataset.lang === b.dataset.lang));
      setLang(b.dataset.lang);
    });
  });
  const mark = () =>
    $$('.lang button').forEach((b) => b.classList.toggle('act', b.dataset.lang === getLang()));
  mark();
  bus.on('lang', mark);
}

/* ---------------- init ---------------- */
export function initUI() {
  runPreloader();
  initScrollFX();
  initMenu();
  initMagnetic();
  initLang();
  observeReveals();
}

/* ---------- theme (dark default / light) — shared by index & pages ---------- */
export function initTheme() {
  const btn = $('#theme-btn');
  if (!btn) return;
  const isLight = () => document.documentElement.classList.contains('light');
  const sync = () => {
    btn.setAttribute('aria-label', t(isLight() ? 'theme.dark' : 'theme.light'));
    btn.setAttribute('title', t(isLight() ? 'theme.dark' : 'theme.light'));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = isLight() ? '#f4f1ea' : '#0a0a0c';
  };
  btn.addEventListener('click', () => {
    const light = !isLight();
    document.documentElement.classList.toggle('light', light);
    try { localStorage.setItem('ps.theme', light ? 'light' : 'dark'); } catch (_) {}
    sync();
    bus.emit('theme', light);
  });
  sync();
  bus.on('lang', sync);
}

/* logo: prefer a local copy (img/logo.jpg) if the user saved one */
export async function initLogo() {
  const img = $('#logo-img');
  if (!img) return;
  img.addEventListener('error', () => img.remove(), { once: true });
  try {
    const r = await fetch('/img/logo.jpg', { method: 'HEAD' });
    if (r.ok) img.src = '/img/logo.jpg';
  } catch (_) {}
}
