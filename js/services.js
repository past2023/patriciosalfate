/* ============================================================
   SERVICES — indexed accordion list.
   Each row stays tied to the auto-update system via an inline
   preview of the first photo of the related gallery.
   ============================================================ */
import { $, bus } from './util.js';
import { t } from './i18n.js';
import { SITE } from './config.js';
import { getThumbUrl } from './thumb.js';

let built = false;

async function fillInlinePreview(gallerySlug, fig) {
  try {
    const { peekGallery } = await import('./gallery.js');
    const entry = await peekGallery(gallerySlug);
    const first = entry && entry.photos && entry.photos[0];
    if (!first) return;
    const url = await getThumbUrl(first, 800);
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    fig.appendChild(img);
  } catch (_) {}
}

export function initServices() {
  const list = $('#sv-list');
  if (!list || built) return;
  built = true;

  SITE.services.forEach((sv, i) => {
    const key = sv.i18n;
    const row = document.createElement('div');
    row.className = 'sv-row';
    const items = [];
    for (let n = 1; n <= 6; n++) {
      const k = `${key}.i${n}`;
      const v = t(k);
      if (v === k) break;   /* t() echoes the key when it's missing */
      items.push(v);
    }
    row.innerHTML = `
      <button class="sv-btn" aria-expanded="false">
        <span class="sv-idx">${String(i + 1).padStart(2, '0')}</span>
        <span class="sv-name">${t(`${key}.title`)}</span>
        <span class="sv-right">
          <span class="chip">${t(`${key}.tag`)}</span>
          <span class="sv-plus" aria-hidden="true">+</span>
        </span>
      </button>
      <div class="sv-body">
        <div class="sv-body-in">
          <div class="sv-body-pad">
            <div>
              <p class="sv-desc">${t(`${key}.desc`)}</p>
              <ul class="sv-items">${items.map((x) => `<li>${x}</li>`).join('')}</ul>
            </div>
            <figure class="sv-pv-inline"></figure>
          </div>
        </div>
      </div>`;

    const btn = row.querySelector('.sv-btn');
    btn.addEventListener('click', () => {
      const open = row.classList.toggle('open');
      btn.setAttribute('aria-expanded', open);
    });

    /* inline preview */
    const inline = row.querySelector('.sv-pv-inline');
    if (inline) fillInlinePreview(sv.gallery, inline);
    list.appendChild(row);
  });

  bus.on('lang', () => {
    list.querySelectorAll('.sv-row').forEach((row, i) => {
      const key = SITE.services[i].i18n;
      row.querySelector('.sv-name').textContent = t(`${key}.title`);
      row.querySelector('.chip').textContent = t(`${key}.tag`);
      row.querySelector('.sv-desc').textContent = t(`${key}.desc`);
      const lis = row.querySelectorAll('.sv-items li');
      let n = 1;
      for (const li of lis) {
        const v = t(`${key}.i${n++}`);
        if (!v) break;
        li.textContent = v;
      }
    });
  });
}


