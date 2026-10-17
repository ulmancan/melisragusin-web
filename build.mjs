// build.mjs — regenerates data-projects.js and data-journal.js from the
// per-entry JSON files the CMS edits (data/projects/*.json, data/journal/*.json).
// Netlify runs this on every deploy (see netlify.toml). You can also run it
// locally with:  node build.mjs
import { readFileSync, writeFileSync, readdirSync, rmSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

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

/* ---------- LIGHT PICTURES (assets/v/, made here on every deploy, by tools/imgv.py, or by the Studio on upload) ---------- */
// On Netlify (and wherever sharp is installed) the missing light copies are made right here, so the repository
// never has to carry them. Without sharp the build simply uses the copies that already exist.
await (async () => {
  let sharp; try { sharp = (await import('sharp')).default; } catch (e) { return; }
  const FOLDERS = ['assets/wp', 'assets/bio', 'assets/press', 'assets/journal', 'assets/uploads'], FILES = ['assets/berkeley-certificate.jpg', 'assets/sedition.jpg'];
  const list = (d) => { let o = []; try { for (const e of readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith('.')) continue; const p = `${d}/${e.name}`; o = o.concat(e.isDirectory() ? list(p) : [p]); } } catch (e) {} return o; };
  const todo = FILES.filter((f) => existsSync(f)).concat(...FOLDERS.map(list)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  const out = (f, t) => `assets/v/${f.slice(7)}.${t}.webp`, has = (f, t) => existsSync(out(f, t)) || existsSync(out(f, t).replace(/\.webp$/, '.jpg'));
  let made = 0; const t0 = Date.now();
  const one = async (f) => {
    try {
      const meta = await sharp(f).metadata(), w = meta.orientation >= 5 ? meta.height : meta.width; if (!w) return;
      const ws = [480, 960, 1600].filter((x) => x < w * 0.92);
      if (statSync(f).size > 700000 && Math.min(w, 2400) > (ws[ws.length - 1] || 0) * 1.1) ws.push(Math.min(w, 2400));
      for (const x of ws) if (!has(f, x)) { mkdirSync(dirname(out(f, x)), { recursive: true }); await sharp(f).rotate().resize({ width: x }).webp({ quality: 80, effort: 2 }).toFile(out(f, x)); made++; }
      if (!has(f, 'amb')) { mkdirSync(dirname(out(f, 'amb')), { recursive: true }); await sharp(f).rotate().flatten({ background: '#000' }).resize({ width: 96 }).blur(4).modulate({ saturation: 1.5, brightness: 0.74 }).webp({ quality: 70, effort: 2 }).toFile(out(f, 'amb')); made++; }
    } catch (e) { console.warn('light copy skipped:', f, e.message); }
  };
  for (let i = 0; i < todo.length; i += 6) await Promise.all(todo.slice(i, i + 6).map(one));
  console.log(`light copies: ${made} made in ${((Date.now() - t0) / 1000).toFixed(1)} s (${todo.length} pictures)`);
})();
// data-img.js tells the pages which smaller copies of a picture exist, so a phone never loads a 5 MB original
// for a 300 px card. Every picture keeps working without them (the original is used).
const imgSize = (file) => {
  try {
    const b = readFileSync(file);
    if (b[0] === 0x89 && b[1] === 0x50) return b.readUInt32BE(16);                                  // PNG
    if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {             // WebP
      const t = b.toString('ascii', 12, 16);
      if (t === 'VP8X') return 1 + b.readUIntLE(24, 3);
      if (t === 'VP8L') return 1 + (b.readUInt16LE(21) & 0x3fff);
      return b.readUInt16LE(26) & 0x3fff;
    }
    if (b[0] === 0xff && b[1] === 0xd8) {                                                             // JPEG
      let i = 2;
      while (i < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1], len = b.readUInt16BE(i + 2);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return b.readUInt16BE(i + 7);
        i += 2 + len;
      }
    }
  } catch (e) {}
  return 0;
};
const IMG = {};
const walk = (dir) => { let out = []; try { for (const e of readdirSync(dir, { withFileTypes: true })) { if (e.name.startsWith('.')) continue; const p = `${dir}/${e.name}`; out = out.concat(e.isDirectory() ? walk(p) : [p]); } } catch (e) {} return out; };
for (const f of walk('assets/v')) {
  const m = f.match(/^assets\/v\/(.+)\.(\d+|amb)\.(webp|jpg)$/); if (!m) continue;
  const key = 'assets/' + m[1], e = IMG[key] || (IMG[key] = { w: [] });
  if (m[3] === 'jpg') e.x = 'jpg'; // copies made in a browser that cannot write WebP
  if (m[2] === 'amb') e.a = 1; else e.w.push(+m[2]);
}
for (const [key, e] of Object.entries(IMG)) { e.w.sort((a, b) => a - b); const o = imgSize(key); if (o) e.o = o; else if (!existsSync(key)) delete IMG[key]; }
writeFileSync('data-img.js', `window.MR_IMG = ${JSON.stringify(IMG)};
(function () {
  var M = window.MR_IMG;
  function key(u) { return String(u || '').trim().replace(/^https?:\\/\\/(www\\.)?melisragusin\\.com\\//, '').replace(/^\\/+/, '').split('?')[0]; }
  function v(k, t) { return 'assets/v/' + k.slice(7) + '.' + t + '.' + (M[k].x || 'webp'); }
  window.mrImg = {
    // srcset for an <img>: the light copies, then the original at its own width
    srcset: function (u) { var k = key(u), e = M[k]; if (!e || !e.w.length) return ''; var s = e.w.map(function (w) { return v(k, w) + ' ' + w + 'w'; }); if (e.o && e.w[e.w.length - 1] < e.o * 0.98) s.push(k + ' ' + e.o + 'w'); return s.join(', '); },
    // the smallest copy at least this wide (or the original)
    fit: function (u, w) { var k = key(u), e = M[k]; if (!e) return u; for (var i = 0; i < e.w.length; i++) if (e.w[i] >= w) return v(k, e.w[i]); return u; },
    // the sharpest light copy (for a full-screen view): the full-size copy of a heavy original, else the original
    full: function (u) { var s = this.srcset(u); return s ? s.split(', ').pop().split(' ')[0] : u; },
    // the tiny, already-blurred copy for the light behind a work ('' if there is none)
    amb: function (u) { var k = key(u), e = M[k]; return e && e.a ? v(k, 'amb') : ''; },
    // attributes to paste into an <img> tag
    attrs: function (u, sizes) { var s = this.srcset(u); return s ? ' srcset="' + s + '" sizes="' + (sizes || '100vw') + '"' : ''; }
  };
})();
`);

console.log(`build: ${ORDER.length} projects, ${JOURNAL.length} journal entries, ${Object.keys(IMG).length} pictures with light copies`);

/* ---------- PUBLISHED SITE (dist/): old addresses, SEO, sitemap, redirects — see seo.mjs ---------- */
await import('./seo.mjs');

/* ---------- which commit this build shows (the Studio waits for it to say "live") ---------- */
writeFileSync('dist/build.json', JSON.stringify({ commit: process.env.COMMIT_REF || '', at: new Date().toISOString() }) + '\n');
