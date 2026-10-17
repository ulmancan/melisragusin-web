// build.mjs — regenerates data-projects.js and data-journal.js from the
// per-entry JSON files the CMS edits (data/projects/*.json, data/journal/*.json).
// Netlify runs this on every deploy (see netlify.toml). You can also run it
// locally with:  node build.mjs
import { readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';

// HERO_LOCAL_CLEANUP: assets/hero/local/ only serves the hero when the site is opened from disk (file://).
if (process.env.NETLIFY) { rmSync('assets/hero/local', { recursive: true, force: true }); rmSync('assets/gallery/local', { recursive: true, force: true }); }

const readJSONDir = (dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('._'))   // skip macOS ._ files
    .map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));

/* ---------- PROJECTS ---------- */
// an entry marked "removed": true is a work taken off melisragusin.com: it stays out of the site
const projects = readJSONDir('data/projects')
  .filter((p) => p && p.id && !p.removed)
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));

const PROJECTS = {};
const ORDER = [];
for (const p of projects) {
  ORDER.push(p.id);
  PROJECTS[p.id] = {
    title: p.title || '',
    year: String(p.year || ''),
    cat: p.cat || '',
    medium: p.medium || '',
    meta: Array.isArray(p.meta) ? p.meta : [],
    video: p.video ? p.video : null,
    statement: p.statement || '',
    images: Array.isArray(p.images) ? p.images : [],
    buy: p.buy && p.buy.url ? { label: p.buy.label || 'View on platform', url: p.buy.url } : null,
    status: p.status || '',
  };
}
writeFileSync(
  'data-projects.js',
  'window.PROJECTS = ' + JSON.stringify(PROJECTS, null, 1) + ';\n' +
  'window.PROJECT_ORDER = ' + JSON.stringify(ORDER) + ';\n'
);

/* ---------- VIRTUAL GALLERY & HOME PAGE (single files the panel edits) ---------- */
const readJSON = (f, fallback) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch (e) { return fallback; } };
writeFileSync('data-gallery.js', 'window.GALLERY = ' + JSON.stringify(readJSON('data/gallery.json', {}), null, 1) + ';\n');
writeFileSync('data-home.js', 'window.HOME = ' + JSON.stringify(readJSON('data/home.json', {}), null, 1) + ';\n');

/* ---------- JOURNAL ---------- */
const journal = readJSONDir('data/journal')
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));

const JOURNAL = journal.map((a) => ({
  id: a.id,
  title: a.title || '',
  category: a.category || '',
  date: a.date || '',
  read: a.read || '',
  hero: a.hero || '',
  images: Array.isArray(a.images) ? a.images : [],
  excerpt: a.excerpt || '',
  body: a.body || '',
}));
writeFileSync('data-journal.js', 'window.JOURNAL = ' + JSON.stringify(JOURNAL, null, 1) + ';\n');

console.log(`build: ${ORDER.length} projects, ${JOURNAL.length} journal entries`);

/* ---------- PUBLISHED SITE (dist/): old addresses, SEO, sitemap, redirects — see seo.mjs ---------- */
await import('./seo.mjs');
