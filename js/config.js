/* ============================================================
   SITE CONFIG — edit this file to customize the site.
   - galleries: each one is a folder inside /photos/
   - services / videos / clients: content blocks
   ============================================================ */

export const SITE = {
  // Brand
  name: 'PATRICIO SALFATE',
  city: 'Saint Petersburg',

  // Root folder of the auto-update system.
  // Upload photos into /photos/<gallery-slug>/ on your hosting.
  root: '/photos/',

  // Special folders
  heroFolder: 'hero',     // photos/hero  — hero slideshow (16:9 wide shots work best)
  aboutFolder: 'about',   // photos/about — first photo becomes the portrait in "About"

  // ---- Galleries shown in the "Work" section ----------------
  // Categories: portraits / fashion / interior / branding / design.
  // Each one is a folder inside /photos/ — drop photos in, they appear here.
  // Add a new category: create a folder photos/<slug> and add an entry here.
  galleries: [
    { slug: 'portraits', span: 'a' },
    { slug: 'fashion',   span: 'b' },
    { slug: 'interior',  span: 'b' },
    { slug: 'branding',  span: 'a' },
    { slug: 'design',    span: 'a' },
  ],

  // ---- Services (details live in js/i18n.js) ----------------
  services: [
    { i18n: 'service.photo',     gallery: 'portraits' },
    { i18n: 'service.branding',  gallery: 'branding' },
    { i18n: 'service.web',       gallery: 'branding' },
    { i18n: 'service.print',     gallery: 'branding' },
    { i18n: 'service.fashion',   gallery: 'fashion' },
  ],

  // ---- Showreel (YouTube ids) -------------------------------
  videos: [
    { id: 'BNymFbUMwaU', i18n: 'video.synthon'  },
    { id: 'oWFehohN7Wc', i18n: 'video.barradas' },
    { id: 'cAul4N1_g50', i18n: 'video.class02'  },
  ],

  // ---- Clients strip ----------------------------------------
  clients: ['WILDBERRIES', 'OZON', 'AIRBNB', 'SYNTHON', 'APHRODITE DELIGHTS', 'SANTORINI'],

  // ---- Contact ----------------------------------------------
  phoneDisplay: '+7 964 377 2778',
  phoneHref: 'tel:+79643772778',
  // MAX is the main channel — first in the list and as the primary CTA
  channels: [
    { i18n: 'ch.max',       icon: 'max',       href: 'https://max.ru/u/f9LHodD0cOLoePG0Rmk1zH5-Sx1EwiOp3Um5KLAWZi0ST6kvktuLWyzizs4', val: 'MAX' },
    { i18n: 'ch.telegram',  icon: 'telegram',  href: 'https://t.me/patriciosalfate',  val: '@patriciosalfate' },
    { i18n: 'ch.phone',     icon: 'phone',     href: 'tel:+79643772778',        val: '+7 964 377 2778' },
    { i18n: 'ch.whatsapp',  icon: 'whatsapp',  href: 'https://wa.me/79643772778', val: '+7 964 377 2778' },
    { i18n: 'ch.vk',        icon: 'vk',        href: 'https://vk.com/patriciosalfate', val: 'vk.com/patriciosalfate' },
  ],
};

export const galleryPath = (slug) => `${SITE.root}${slug}/`;
