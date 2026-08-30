/* ============================================================
   UTIL — tiny shared helpers. No dependencies.
   ============================================================ */

export const $  = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export const reduceMotion =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const finePointer =
  typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches;

/* tiny event bus */
export const bus = {
  m: {},
  on(e, f) { (this.m[e] ??= []).push(f); },
  emit(e, d) { (this.m[e] || []).forEach(f => { try { f(d); } catch (_) {} }); },
};

/* promise queue with concurrency */
export class Queue {
  constructor(limit = 3) {
    this.limit = limit;
    this.active = 0;
    this.items = [];
  }
  push(task) {
    return new Promise((resolve, reject) => {
      this.items.push({ task, resolve, reject });
      this._run();
    });
  }
  _run() {
    while (this.active < this.limit && this.items.length) {
      const { task, resolve, reject } = this.items.shift();
      this.active++;
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => { this.active--; this._run(); });
    }
  }
}

/* pretty filename: "IMG_7001 copy.jpg" -> "IMG 7001 copy" */
export function prettyName(name) {
  return decodeURIComponent(name)
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function humanSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* IntersectionObserver reveal helper */
const io = typeof IntersectionObserver !== 'undefined'
  ? new IntersectionObserver((es) => {
      for (const e of es) {
        if (e.isIntersecting) {
          e.target.classList.add('rv-in');
          io.unobserve(e.target);
        }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' })
  : null;

export function observeReveals(root = document) {
  $$('[data-reveal]:not(.rv-in)', root).forEach((el) => {
    if (io) io.observe(el);
    else el.classList.add('rv-in');
  });
}

export function setRevealDelay(el, i) {
  el.style.transitionDelay = `${Math.min(i, 6) * 70}ms`;
}
