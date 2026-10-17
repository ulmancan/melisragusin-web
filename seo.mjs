// seo.mjs — builds the folder Netlify publishes (dist/), keeping every address the old WordPress site had.
//
//  · /projects/<id>/, /artist-bio/, /blog/, /<post>/ … are real pages with their own title, description,
//    canonical address, social preview and structured data (titles and descriptions: data/seo.json and the
//    "SEO" fields of each work in the panel).
//  · old addresses that no longer exist, and the site's own .html addresses, redirect (301) to the right page.
//  · sitemap.xml, robots.txt, Google Analytics / Tag Manager and the Search Console verification.
//
// Run by build.mjs on every deploy. Locally:  node build.mjs  → open dist/ through a web server.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const SEO = JSON.parse(readFileSync('data/seo.json', 'utf8'));
const SITE = SEO.site.replace(/\/$/, '');
const GA = 'G-F29YEYPSKZ', GTM = 'GTM-WCVT5K5X', VERIFY = 's0BoLfnQs5mXBIUdwzuJBkOsfOnreOBaPdUy1QMPZCc';
const DEFAULT_IMAGE = 'assets/bio/portrait-sofa.jpg';
const OUT = 'dist';

const readJSONDir = (dir) => readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('._')).map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));
const projects = readJSONDir('data/projects').filter((p) => p && p.id && !p.removed);
const journal = existsSync('data/journal') ? readJSONDir('data/journal') : [];

/* ---------- 1. copy the site (without what only the offline preview or the workshop needs) ---------- */
const SKIP = new Set(['dist', 'work', 'shots', 'data', '_to_delete', 'node_modules', '.git', '.github', 'concept-home.html', 'melis-miami-experience.html',
  'build.mjs', 'build.mjs.bak', 'seo.mjs', 'netlify.toml', 'README.md', 'OKU.txt', 'package.json', 'package-lock.json']);
const SKIP_PATH = ['assets/gallery/local', 'assets/hero/local'];
rmSync(OUT, { recursive: true, force: true });
const copyDir = (src, dst) => {
  mkdirSync(dst, { recursive: true });
  for (const f of readdirSync(src)) {
    if (f.startsWith('.') || f.startsWith('._') || f.endsWith('.bak')) continue;
    const s = join(src, f), rel = s.replace(/^\.\//, '');
    if (src === '.' && SKIP.has(f)) continue;
    if (SKIP_PATH.includes(rel)) continue;
    if (statSync(s).isDirectory()) copyDir(s, join(dst, f)); else cpSync(s, join(dst, f));
  }
};
copyDir('.', OUT);

/* ---------- helpers ---------- */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const abs = (u) => !u ? '' : /^https?:\/\//.test(u) ? u : SITE + '/' + String(u).replace(/^\/+/, '');
const clip = (s, n = 158) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'; };
const PERSON = { '@type': ['Person', 'Organization'], '@id': SITE + '/#person', name: 'Melis Ragusin', url: SITE + '/', image: abs('assets/logo-mr.png'),
  sameAs: ['https://www.instagram.com/melisragusin/', 'https://www.seditionart.com/melis-ragusin', 'https://blackdove.com/e25bb57d-cef1-46b9-9ff1-cc29c46284b6'] };
const WEBSITE = { '@type': 'WebSite', '@id': SITE + '/#website', url: SITE, name: 'Melis Ragusin', alternateName: 'Melis Ragusin Art', publisher: { '@id': SITE + '/#person' }, inLanguage: 'en-US' };

const ANALYTICS_HEAD = `<!-- Google Tag Manager --><script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM}');</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA}');</script>`;
// on the live site, links point at the clean addresses (the menu is highlighted first, from the .html names)
const LINKS = `<script>(function () { var d = document;
    var PAGES = { 'artist-bio.html': 'artist-bio/', 'contact.html': 'contact/', 'exhibitions-interview.html': 'exhibitions-interview/', 'oksijen-interview.html': 'oksijen-interview/', 'privacy-policy.html': 'privacy-policy/', 'journal.html': 'blog/', 'index.html': '/', 'gallery.html': '/' };
    var CATURL = { Motion: 'motion-art/', 'New-Media': 'new-media-works/', 'Mixed-Media': 'mixed-media-works/' };
    var clean = function (h) {
      var m = /^(project|article|archive)\\.html(?:\\?(.*))?$/.exec(h), q;
      if (m) {
        q = new URLSearchParams(m[2] || '');
        if (m[1] === 'project' && q.get('id')) return 'projects/' + encodeURIComponent(q.get('id')) + '/';
        if (m[1] === 'article' && q.get('id')) return encodeURIComponent(q.get('id')) + '/';
        if (m[1] === 'archive') { var c = q.get('cat'); q.delete('cat'); var rest = q.toString(); return (CATURL[c] || 'projects/') + (rest ? '?' + rest : ''); }
        return null;
      }
      var p = /^([a-z-]+\\.html)(#.*)?$/.exec(h); return p && PAGES[p[1]] ? PAGES[p[1]] + (p[2] || '') : null;
    };
    var fix = function (root) { (root.querySelectorAll ? root : d).querySelectorAll('a[href]').forEach(function (a) { var c = clean(a.getAttribute('href')); if (c) a.setAttribute('href', c); }); };
    d.addEventListener('DOMContentLoaded', function () { fix(d); new MutationObserver(function (ms) { ms.forEach(function (mu) { mu.addedNodes.forEach(function (n) { if (n.nodeType === 1) { if (n.matches && n.matches('a[href]')) { var c = clean(n.getAttribute('href')); if (c) n.setAttribute('href', c); } fix(n); } }); }); }).observe(d.documentElement, { childList: true, subtree: true }); });
})();</script>`;
const ANALYTICS_BODY = `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${GTM}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;

// replace a page's head tags (title, description, canonical, social, structured data) and add analytics
function dress(html, m) {
  html = html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta\s+name="(description|robots|twitter:[^"]*)"[^>]*>\s*/gi, '')
    .replace(/<meta\s+property="og:[^"]*"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '')
    .replace(/<script src="https:\/\/identity\.netlify\.com[^>]*><\/script>\s*/gi, '');
  const img = abs(m.image || DEFAULT_IMAGE);
  const head = [
    m.base ? `<base href="/">` : '',
    m.vars ? `<script>${Object.entries(m.vars).map(([k, v]) => `window.${k}=${JSON.stringify(v)};`).join('')}</script>` : '',
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}">`,
    `<meta name="robots" content="follow, index, max-snippet:-1, max-video-preview:-1, max-image-preview:large">`,
    `<link rel="canonical" href="${esc(m.url)}">`,
    `<meta property="og:locale" content="en_US"><meta property="og:type" content="${m.type || 'website'}"><meta property="og:title" content="${esc(m.title)}"><meta property="og:description" content="${esc(m.description)}"><meta property="og:url" content="${esc(m.url)}"><meta property="og:site_name" content="Melis Ragusin"><meta property="og:image" content="${esc(img)}">`,
    `<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(m.title)}"><meta name="twitter:description" content="${esc(m.description)}"><meta name="twitter:image" content="${esc(img)}">`,
    m.verify ? `<meta name="google-site-verification" content="${VERIFY}">` : '',
    `<link rel="apple-touch-icon" href="/assets/logo-mr.png">`,
    `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': [PERSON, WEBSITE, ...(m.ld || [])] })}</script>`,
    LINKS,
    ANALYTICS_HEAD,
  ].filter(Boolean).join('\n');
  html = html.replace(/<head>/i, '<head>\n' + head);
  html = html.replace(/<body([^>]*)>/i, (b) => b + '\n' + ANALYTICS_BODY);
  return html;
}
const webpage = (m) => ({ '@type': 'WebPage', '@id': m.url + '#webpage', url: m.url, name: m.title, isPartOf: { '@id': SITE + '/#website' }, about: { '@id': SITE + '/#person' }, inLanguage: 'en-US', primaryImageOfPage: abs(m.image || DEFAULT_IMAGE) });
const write = (path, html) => { const f = join(OUT, path, 'index.html'); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, html); };
const src = (f) => readFileSync(f, 'utf8');
const urls = []; // for the sitemap: [url, image?]

/* ---------- 2. pages at their old addresses ---------- */
const CATPAGE = { Motion: ['/motion-art/', 'Motion Art'], 'New-Media': ['/new-media-works/', 'New-Media Works'], 'Mixed-Media': ['/mixed-media-works/', 'Mixed-Media Works'] };
for (const p of SEO.pages) {
  const url = SITE + p.path;
  let image = p.image, ld = [], vars = { PAGE_FILE: p.file };
  if (p.file === 'article.html') {
    const a = journal.find((j) => j.id === p.id); vars.PAGE_ID = p.id;
    image = image || (a && (a.hero || (a.images || [])[0]));
    if (a) ld.push({ '@type': 'Article', headline: a.title, author: { '@id': SITE + '/#person' }, publisher: { '@id': SITE + '/#person' }, image: abs(image), url, mainEntityOfPage: url, ...(/^\d{4}-\d{2}/.test(a.date || '') ? { datePublished: a.date } : {}) });
  }
  if (p.cat) vars.PAGE_CAT = p.cat;
  const m = { url, title: p.title, description: p.description, type: p.type, image, base: p.path !== '/', vars: p.path === '/' ? null : vars, verify: p.path === '/' };
  m.ld = [webpage(m), ...ld];
  if (p.path === '/') writeFileSync(join(OUT, 'index.html'), dress(src('index.html'), m)); // the gallery opens the site
  else write(p.path, dress(src(p.file), m));
  urls.push([url, image && abs(image)]);
}
// journal entries added later through the panel get their page too, at /<id>/
for (const a of journal) {
  if (!a || !a.id || SEO.pages.some((p) => p.path === `/${a.id}/`)) continue;
  const url = `${SITE}/${a.id}/`, image = a.hero || (a.images || [])[0];
  const m = { url, title: `${a.title} - Melis Ragusin Art`, description: clip(a.excerpt || ''), type: 'article', image, base: true, vars: { PAGE_FILE: 'article.html', PAGE_ID: a.id } };
  m.ld = [webpage(m), { '@type': 'Article', headline: a.title, author: { '@id': SITE + '/#person' }, publisher: { '@id': SITE + '/#person' }, image: abs(image), url, mainEntityOfPage: url }];
  write(`/${a.id}/`, dress(src('article.html'), m));
  urls.push([url, image && abs(image)]);
}
// every work at /projects/<id>/
for (const p of projects) {
  const url = `${SITE}/projects/${p.id}/`;
  const cover = /\.(mp4|webm)$/i.test(p.video || '') ? p.video.replace(/\.(mp4|webm)$/i, '.jpg') : (p.images || [])[0];
  const title = p.seo_title || `${p.title} - ${p.year} - Melis Ragusin Art`;
  const description = p.seo_description || clip(p.statement) || `${p.title} (${p.year}) by Melis Ragusin.`;
  const [catPath, catName] = CATPAGE[p.cat] || ['/projects/', 'Projects'];
  const m = { url, title, description, type: 'article', image: cover, base: true, vars: { PAGE_FILE: 'project.html', PAGE_ID: p.id } };
  m.ld = [webpage(m),
    { '@type': 'VisualArtwork', '@id': url + '#artwork', name: p.title, url, creator: { '@id': SITE + '/#person' }, dateCreated: String(p.year || ''), image: abs(cover), description: clip(p.statement, 300), ...(p.medium ? { artMedium: p.medium } : {}) },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, item: { '@id': SITE + '/', name: 'Home' } },
      { '@type': 'ListItem', position: 2, item: { '@id': SITE + catPath, name: catName } },
      { '@type': 'ListItem', position: 3, item: { '@id': url, name: p.title } }] }];
  write(`/projects/${p.id}/`, dress(src('project.html'), m));
  urls.push([url, cover && abs(cover), (p.images || []).slice(0, 6).map(abs)]);
}
// the site's own front page (the room with the series), kept at /home.html
{
  const m = { url: SITE + '/home.html', title: 'Melis Ragusin — New Media & Mixed Media Artist', description: SEO.pages.find((x) => x.path === '/').description, image: DEFAULT_IMAGE };
  m.ld = [webpage(m)];
  writeFileSync(join(OUT, 'home.html'), dress(src('home.html'), m));
  urls.splice(1, 0, [m.url]);
}
// a page for addresses that do not exist
{
  const nf = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found — Melis Ragusin</title><meta name="robots" content="noindex"><link rel="icon" type="image/svg+xml" href="/assets/favicon.svg"><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300&family=Jost:wght@300;400&display=swap" rel="stylesheet"><style>html,body{height:100%;margin:0;background:#000;color:#f4f2ee;font-family:Jost,system-ui,sans-serif}main{min-height:100%;display:grid;place-items:center;text-align:center;padding:24px}h1{font-family:'Cormorant Garamond',Georgia,serif;font-weight:300;font-size:clamp(40px,7vw,84px);margin:0 0 12px}p{color:#9d9890;letter-spacing:.04em}a{color:#c6a870;text-decoration:none;letter-spacing:.24em;text-transform:uppercase;font-size:12px;margin:0 14px}</style></head><body><main><div><h1>This page has moved</h1><p>The work you are looking for may have a new home.</p><p style="margin-top:34px"><a href="/home.html">Home</a><a href="/projects/">All works</a><a href="/">Virtual gallery</a></p></div></main></body></html>`;
  writeFileSync(join(OUT, '404.html'), nf);
}

/* ---------- 3. redirects ---------- */
const R = [];
// the site's own .html addresses → the clean addresses (the menu links already use these on the live site)
R.push('/project.html id=:id /projects/:id/ 301!', '/article.html id=:id /:id/ 301!',
  '/archive.html cat=Motion /motion-art/ 301!', '/archive.html cat=New-Media /new-media-works/ 301!', '/archive.html cat=Mixed-Media /mixed-media-works/ 301!',
  '/archive.html /projects/ 301!', '/project.html /projects/ 301!', '/article.html /blog/ 301!', '/journal.html /blog/ 301!', '/gallery.html / 301!');
for (const f of ['artist-bio', 'contact', 'exhibitions-interview', 'oksijen-interview', 'privacy-policy']) R.push(`/${f}.html /${f}/ 301!`);
// old WordPress addresses that have no page of their own any more
for (const [a, b] of SEO.redirects) R.push(`${a} ${b} 301!`, `${a.replace(/\/$/, '')} ${b} 301!`);
// the old WordPress image addresses (Google Images) → the same pictures, now on this site
R.push('/wp-content/uploads/* /assets/wp/:splat 301', '/feed/* /blog/ 301', '/feed /blog/ 301', '/wp-admin/* / 301', '/wp-login.php / 301');
writeFileSync(join(OUT, '_redirects'), R.join('\n') + '\n');

/* ---------- 4. sitemap and robots ---------- */
const today = new Date().toISOString().slice(0, 10);
const sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">'];
for (const [u, img, more] of urls) {
  const imgs = [...new Set([img, ...(more || [])].filter(Boolean))];
  sm.push(`  <url><loc>${esc(u)}</loc><lastmod>${today}</lastmod>${imgs.map((i) => `<image:image><image:loc>${esc(i)}</image:loc></image:image>`).join('')}</url>`);
}
sm.push('</urlset>');
writeFileSync(join(OUT, 'sitemap.xml'), sm.join('\n') + '\n');
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nDisallow: /admin/\n\nSitemap: ${SITE}/sitemap.xml\n`);
// the old sitemap addresses point to the new one
writeFileSync(join(OUT, '_redirects'), R.concat(['/sitemap_index.xml /sitemap.xml 301!', '/wp-sitemap.xml /sitemap.xml 301!', '/projects-sitemap.xml /sitemap.xml 301!', '/page-sitemap.xml /sitemap.xml 301!', '/post-sitemap.xml /sitemap.xml 301!', '/category-sitemap.xml /sitemap.xml 301!']).join('\n') + '\n');

console.log(`seo: ${urls.length} pages in the sitemap, ${projects.length} works at /projects/<id>/, ${R.length + 6} redirects → ${OUT}/`);
