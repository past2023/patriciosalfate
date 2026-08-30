# patriciosalfate.ru — new website

**Photographer + designer. Dark theme by default (with a light-mode toggle),
fluorescent pink accent, fully static site.**
HTML + CSS + Vanilla JS + Canvas. No frameworks, no build step, no CMS, no database.

## 🌗 Themes

The default is **dark** (black background, like the original site). The
sun/moon button in the header switches to the **light** theme (white
background) and back — the choice is remembered in the browser.

## 📄 Pages

The site has five full pages (same design system, RU/EN, both themes):

| Page | URL | Content |
|---|---|---|
| Photo Day | `/фотодень/` | hotel photoshoot: why a hotel, how it goes, photo gallery |
| Interior photography | `/интерьерная_фотосъемка/` | Airbnb-certified interior/architecture shoots, gallery |
| Web Design | `/веб-дизайн/` | full-cycle web development + selected client websites |
| CV | `/cv/` | profile, skills, experience, education, languages, music, links |
| Music | `/music/` | artist Patricio Salfate — direct links to Spotify, Apple Music, VK Music, Yandex Music, Deezer, Bandcamp |

Photo-day and interior galleries use the same one-update system: their photos
live in `photos/photonday/` and `photos/interior/` (currently bridged to the
old site via `manifest.json`; uploaded files win by name).

To add a page: copy any `cv/index.html`-style page, add its texts to
`js/i18n.js` and a link to the header nav.

## 📦 Photos from the previous site (temporary bridge)

The folders `photos/{photo,fashion,hero,about}/` contain a `manifest.json`
with hotlinks to the real photos on the old site (patriciosalfate.ru), so the
site already shows the actual work. **Any file you upload always wins over a
manifest entry with the same file name.** Once all your photos are uploaded
into the folders, simply delete the four `manifest.json` files — the site
keeps working purely from the folder contents.

The same bridge pattern is used for the header logo (hotlinked from the old
site — see below), the page heroes and the page photo galleries.

## 🏷️ Logo

The header logo is hotlinked from the old site. To make it live on the new
hosting, download `logoamor01.jpg` and save it as `img/logo.jpg` — the site
automatically switches to the local file. If the image ever fails to load,
a "PS" monogram fallback is shown.

---

## ✨ The core idea: ONE update system

There is exactly **one** thing to do — upload photos to a folder on the
hosting:

```
photos/
├── portraits/ → "Portraits" gallery
├── fashion/   → "Fashion & commercial" gallery
├── interior/  → "Interiors" gallery
├── branding/  → "Design & branding" gallery
├── design/    → "Design" gallery
├── hero/      → main-screen slideshow (wide 16:9 photos)
└── about/     → first photo = portrait in the "About" block
```

Drop JPG/PNG/WebP files into the file manager and:

1. the site **finds them on its own** (reads the hosting directory listing —
   names, sizes, dates);
2. **thumbnails are drawn in the visitor's browser** on `<canvas>` and cached
   in IndexedDB — nothing is generated on the server;
3. new work **appears first** (sorted by file date); counters and the
   "updated" dates recalculate automatically;
4. subfolders inside a gallery are picked up too (up to 3 levels) — handy for
   sorting shoots by date.

No "rebuild", no "upload a new file", no "edit a JSON" — **one folder, one system**.

### How it works, technically

The browser does `GET /photos/photo/` — the hosting answers with an
HTML file listing (a standard directory listing). The site parses it
(understands Apache Indexes, Apache FancyIndexing and Nginx autoindex
formats), filters images and sorts by date.
Thumbnail = original → `createImageBitmap` → `<canvas>` → WebP → IndexedDB.

### Hosting requirements (directory listing)

| Hosting | What is needed |
|---|---|
| **Apache** (Reg.ru, Beget, Timeweb, cPanel, most .ru hosts) | **Nothing.** `photos/.htaccess` with `Options +Indexes` and UTF-8 is already shipped. |
| **Nginx** | One line in the site config (see below). |
| **Static hosts** (Pages/Netlify/Vercel, etc., no listing) | Generate a `manifest.json` with [tools/manifest.html](tools/manifest.html) and put it into the gallery folder. |

**Nginx** — add to `server { ... }`:

```nginx
location /photos/ {
    autoindex on;
    autoindex_exact_size off;
}
```

**Static hosting without listing** — open `tools/manifest.html` in the
browser, select the photo folder (files are never sent anywhere), download
the `manifest.json` and upload it into the gallery folder (e.g.
`photos/photo/manifest.json`). A manifest may also contain **remote (absolute)
URLs** — that is exactly how the temporary bridge to the old site works.
When a directory listing is available, it is **merged** with the manifest and
local files win by name.

---

## 🚀 Quick start

```bash
# local preview (emulates an Apache directory listing, like on the hosting)
node server/preview.mjs
# → http://localhost:8080
```

**Deploy:** upload the whole repository content to the site root
(`public_html` / `www`), including the hidden `photos/.htaccess`.
Done — `https://patriciosalfate.ru`.

> `photos/design/` is the dedicated Design gallery on the homepage. It ships
> with 4 layout mockups — replace or extend them with your own work at any time.

## 📁 Structure

```
index.html          — the whole site (one page, anchor sections)
404.html            — custom 404 page (canvas stars)
css/main.css        — design system (colors at the top: :root + html.light)
js/config.js        — SETTINGS: galleries, services, videos, contacts
js/i18n.js          — ALL texts RU/EN (edit here)
js/listing.js       — auto-update engine (directory-listing parser)
js/thumb.js         — canvas thumbnails + IndexedDB cache
js/hero.js          — theme-aware canvas aurora + slideshow + scramble
js/gallery.js       — work grid, gallery overlay, lightbox (zoom/pan/pinch)
js/services.js      — services (accordion + cursor preview)
js/ui.js            — preloader, menu, reveals, magnetic buttons, RU/EN, themes
js/pages.js         — shared bootstrap for the sub-pages
js/cursor.js        — custom cursor
фотодень/            — Photo Day page
интерьерная_фотосъемка/ — Interior photography page
веб-дизайн/          — Web Design page
cv/                  — CV page
music/               — Music page
server/preview.mjs  — local preview server (not needed on the hosting)
tools/manifest.html — manifest.json generator for hosts without listing
photos/             ← UPLOAD YOUR PHOTOS HERE
```

## ✏️ What to change where

- **Texts (RU/EN)** — `js/i18n.js` (every string exists in both languages).
- **Galleries** — `js/config.js` → `galleries: [{ slug: 'photo', span: 'a' }]`
  (span: `a` = vertical card 4:5, `b` = horizontal 3:2).
  Gallery texts — `js/i18n.js` → `gallery.<slug>.title/desc`.
- **Services / videos / clients / contacts** — `js/config.js`
  (channel icons — the `ICONS` map in `js/app.js`).
- **Accent color** — `css/main.css`, `:root { --accent: #ff2ea6; ... }`
  (light theme — the `html.light` block right below).
- **Name in the hero** — `js/i18n.js` → `hero.titleTop / hero.titleBottom`.
- **Countries in the hero strip** — `js/i18n.js` → `geo.list` (pipe-separated).
- **Menu links** — header `<nav>` + burger menu in `index.html` (and in each
  sub-page, same markup).
- **Page texts** — `js/i18n.js`, keys `pg.pd.*` / `pg.in.*` / `pg.wd.*` /
  `pg.cv.*` / `pg.mu.*`.
- **Music platform links** — `music/index.html` (the "Listen on" grid).

## 🧠 Features

- **Canvas lightbox**: opens with the complete uncropped photo (with an
  optional immersive edge-to-edge fill toggle), smooth wheel/button zoom
  towards the cursor, drag-pan, pinch on phones, double click, keys
  ←/→/Esc/+/-/0, keyboard-friendly controls and "download original".
- **Hero slideshow** from `photos/hero` with Ken Burns; if the folder is
  empty — canvas aurora.
- **Laser sweep** across the hero photo and over work cards on hover —
  the modern replacement for film grain.
- **Themes**: dark by default, light via the toggle — both are remembered.
- **RU/EN** — the default is **RU**; EN only when the user clicks the
  button (the choice is remembered), `?lang=en` works by link.
- **Animations**: preloader with counter, scramble headline, laser sweep,
  scroll reveals, parallax, magnetic buttons, marquees, custom cursor.
- **Accessibility**: `prefers-reduced-motion` disables animations, semantic
  markup, aria labels, focus styles.
- **Without JS** — the site honestly says JavaScript is required.

## 📄 File formats

JPG, PNG, WebP, GIF, AVIF (bmp is parsed, but browsers won't show it).
HEIC is not supported by browsers — convert to JPG/WebP before uploading.

## 🔒 Privacy note

The directory listing exposes **file names** (the photo galleries are public
by nature). If you want to turn the listing off later — just remove
`Options +Indexes` from `photos/.htaccess` (but auto-updating will stop).

## 🧪 Tests

```bash
node js/listing.js --selftest   # listing parser (Apache/Nginx/plain)
```
