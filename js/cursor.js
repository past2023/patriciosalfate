/* ============================================================
   CURSOR — custom dot + trailing ring, labels on hover targets.
   Desktop (fine pointer) only, respects reduced motion.
   ============================================================ */
import { $, finePointer, reduceMotion, lerp, bus } from './util.js';
import { t } from './i18n.js';

let dot, ring;
let mx = -100, my = -100, rx = -100, ry = -100;
let visible = false, mode = '', label = '';
let raf = 0;

function setMode(el) {
  const c = el && el.closest
    ? el.closest('[data-cursor], a, button')
    : null;
  const attr = c && c.dataset ? c.dataset.cursor : null;
  if (attr === 'zoom') { mode = 'zoom'; label = t('cursor.view'); }
  else if (attr === 'open') { mode = 'open'; label = t('cursor.open'); }
  else if (c) { mode = 'link'; label = ''; }
  else { mode = ''; label = ''; }

  if (ring) {
    ring.classList.toggle('on-zoom', mode === 'zoom');
    ring.classList.toggle('on-link', mode === 'link' || mode === 'open');
    const span = ring.querySelector('span');
    if (span && span.textContent !== label) span.textContent = label;
  }
}

function loop() {
  raf = requestAnimationFrame(loop);
  const k = visible ? 0.32 : 0.12;
  rx = lerp(rx, mx, k);
  ry = lerp(ry, my, k);
  if (dot) dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%,-50%)`;
  if (ring) ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%,-50%)`;
}

export function initCursor() {
  if (!finePointer || reduceMotion) return;
  dot = $('#cur-dot');
  ring = $('#cur-ring');
  if (!dot || !ring) return;

  window.addEventListener('mousemove', (e) => {
    mx = e.clientX; my = e.clientY;
    if (!visible) { visible = true; rx = mx; ry = my; }
    setMode(e.target);
  }, { passive: true });

  document.addEventListener('mouseleave', () => { visible = false; });
  document.addEventListener('mouseover', (e) => setMode(e.target), { passive: true });

  /* keep labels fresh when language changes */
  bus.on('lang', () => setMode(document.elementFromPoint(mx, my)));

  if (!raf) raf = requestAnimationFrame(loop);
}
