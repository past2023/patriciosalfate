/* ============================================================
   STARFIELD — dark-mode background: a slow video-game style
   star drift (three depth layers, gentle twinkle, rare pink
   stars). Hidden in light mode; static when reduced motion.
   ============================================================ */
import { reduceMotion, bus } from './util.js';

let canvas = null, ctx = null, raf = 0, stars = [];
let W = 0, H = 0, dpr = 1, running = false;

function makeStars() {
  const count = Math.min(240, Math.floor((W * H) / 8500));
  stars = [];
  for (let i = 0; i < count; i++) {
    const z = Math.random();  /* 0 = far … 1 = near */
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      z,
      r: 0.4 + z * 1.5,
      tw: Math.random() * Math.PI * 2,
      pink: Math.random() < 0.07,
    });
  }
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.max(1, Math.ceil(W * dpr));
  canvas.height = Math.max(1, Math.ceil(H * dpr));
  makeStars();
  if (running && reduceMotion) render(performance.now() * 0.001);
}

function render(t) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const vx = 2.0, vy = 10;  /* gentle diagonal drift, px/s at z=1 */
  for (const s of stars) {
    const sp = 0.22 + s.z * 1.15;
    const a = (0.12 + s.z * 0.5) * (0.7 + 0.3 * Math.sin(t * 2.1 + s.tw));
    ctx.fillStyle = s.pink
      ? `rgba(255, 96, 180, ${a.toFixed(3)})`
      : `rgba(196, 216, 255, ${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drift(dt) {
  const vx = 2.0, vy = 10;
  for (const s of stars) {
    const sp = 0.22 + s.z * 1.15;
    s.x += vx * sp * dt;
    s.y += vy * sp * dt;
    if (s.x > W + 2) s.x = -2;
    if (s.y > H + 2) s.y = -2;
  }
}

let last = 0;
function loop(now) {
  if (!running) return;
  raf = requestAnimationFrame(loop);
  const t = now * 0.001;
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
  last = now;
  drift(dt);
  render(t);
}

function setOn(on) {
  if (on === running) return;
  running = on;
  cancelAnimationFrame(raf);
  raf = 0;
  last = 0;
  if (on) {
    if (reduceMotion) render(performance.now() * 0.001);
    else raf = requestAnimationFrame(loop);
  }
}

export function initStarfield() {
  canvas = document.getElementById('starfield');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize, { passive: true });

  const isLight = () => document.documentElement.classList.contains('light');
  const update = () => setOn(!isLight());
  update();
  bus.on('theme', (light) => setOn(!light));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (running && !reduceMotion) {
      last = 0;
      raf = requestAnimationFrame(loop);
    }
  });
}
