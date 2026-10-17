// Melis Ragusin — Studio. A panel in the same dark gallery as the site, for one person: the artist.
import { t, setLang, getLang } from './i18n.js';
import * as B from './backend.js';
import { prepareImage, prepareVideo, slug } from './images.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ser = (o) => JSON.stringify(o, null, 2) + '\n';
const clone = (o) => JSON.parse(JSON.stringify(o));
let app = $('#app');
const SITE = 'https://melisragusin.com';

const I = {
  plus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M8 2.5v11M2.5 8h11"/></svg>',
  x: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>',
  grip: '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="5.5" cy="3.5" r="1.1"/><circle cx="10.5" cy="3.5" r="1.1"/><circle cx="5.5" cy="8" r="1.1"/><circle cx="10.5" cy="8" r="1.1"/><circle cx="5.5" cy="12.5" r="1.1"/><circle cx="10.5" cy="12.5" r="1.1"/></svg>',
  img: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="4" width="18" height="16" rx="1.5"/><circle cx="9" cy="10" r="1.8"/><path d="M3.5 17.5l5.5-5 4 3.5 3-2.5 4.5 4"/></svg>',
  up: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M8 11V2.5M4.5 6L8 2.5 11.5 6M2.5 13.5h11"/></svg>',
  ext: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M6 3H3v10h10v-3M9 3h4v4M13 3L7.5 8.5"/></svg>',
  back: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" width="14" height="14"><path d="M10 3L5 8l5 5"/></svg>',
  search: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>',
  more: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M4 6l4 4 4-4"/></svg>',
  trash: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9"/></svg>',
};

/* =========================================================
   STATE: what is on GitHub (base) and what is being edited (docs)
   ========================================================= */
const S = {
  user: null,
  base: {},      // path -> serialised text as published
  docs: {},      // path -> object being edited, or null when it will be deleted
  uploads: {},   // main path -> { url, files: [{ path, blob }] }
  restored: false,
};
const CATS = [['Motion', 'motion'], ['New-Media', 'newmedia'], ['Mixed-Media', 'mixed']];
const HALLS = [
  { id: 'motion', cat: 'Motion', n: 'I', key: 'hallMotion', c: 'rgba(255,154,106,.9)' },
  { id: 'new', cat: 'New-Media', n: 'II', key: 'hallNew', c: 'rgba(134,168,255,.9)' },
  { id: 'mixed', cat: 'Mixed-Media', n: 'III', key: 'hallMixed', c: 'rgba(231,194,122,.9)' },
];
const WALLS = [['otomatik', 'auto'], ['sol', 'left'], ['sağ', 'right'], ['karşı', 'end']];

const pPath = (id) => `data/projects/${id}.json`;
const jPath = (id) => `data/journal/${id}.json`;
const projects = () => Object.entries(S.docs).filter(([p, d]) => p.startsWith('data/projects/') && d).map(([, d]) => d)
  .sort((a, b) => (+a.order || 0) - (+b.order || 0) || String(a.id).localeCompare(b.id));
const stories = () => Object.entries(S.docs).filter(([p, d]) => p.startsWith('data/journal/') && d).map(([, d]) => d)
  .sort((a, b) => (+a.order || 0) - (+b.order || 0) || String(a.id).localeCompare(b.id));
const work = (id) => S.docs[pPath(id)] || null;
const gallery = () => S.docs['data/gallery.json'] || (S.docs['data/gallery.json'] = { motion: { works: [] }, new: { works: [] }, mixed: { works: [] } });
const homeDoc = () => S.docs['data/home.json'] || (S.docs['data/home.json'] = { series: [] });

function changes() {
  const out = [];
  const paths = new Set([...Object.keys(S.base), ...Object.keys(S.docs)]);
  for (const p of paths) {
    const d = S.docs[p], b = S.base[p];
    if (d === null && b != null) out.push({ path: p, text: null, kind: 'removed' });
    else if (d && b == null) out.push({ path: p, text: ser(d), kind: 'added' });
    else if (d && ser(d) !== b) out.push({ path: p, text: ser(d), kind: 'changed' });
  }
  return out;
}
const isDirty = (p) => { const d = S.docs[p], b = S.base[p]; return d === null ? b != null : d ? ser(d) !== b : false; };
// pictures and clips are published only when something still uses them
function usedUploads(list) {
  const text = list.map((c) => c.text || '').join('\n');
  return Object.entries(S.uploads).filter(([p, u]) => !u.published && text.includes(p)).flatMap(([, u]) => u.files);
}

let saveT;
function touch() {
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    const docs = {}, from = {}; changes().forEach((c) => { docs[c.path] = c.text == null ? null : JSON.parse(c.text); from[c.path] = S.base[c.path] == null ? null : S.base[c.path]; });
    const ups = {}; Object.entries(S.uploads).forEach(([p, u]) => { if (!u.published && u.files.length) ups[p] = { files: u.files }; });
    await B.draftSave('state', { docs, from, uploads: ups, at: Date.now() });
  }, 350);
  topbar();
  actionBar();
}

/* =========================================================
   PICTURES: what to show for a path (a fresh upload, or the site's light copy)
   ========================================================= */
function img(path, w = 480) {
  if (!path) return '';
  const p = String(path).trim().replace(/^https?:\/\/(www\.)?melisragusin\.com\//, '').replace(/^\/+/, '');
  if (S.uploads[p]) return S.uploads[p].url;
  if (/^https?:/.test(p)) return p;
  return '/' + (window.mrImg ? window.mrImg.fit(p, w) : p);
}
const isClip = (v) => /\.(mp4|webm|mov|m4v)$/i.test(v || '');
const isSiteClip = (v) => /^\/?assets\/(hero|gallery)\/media\//.test(v || '');
function cover(w) {
  if (!w) return '';
  if (isClip(w.video) && isSiteClip(w.video)) return w.video.replace(/\.(mp4|webm)$/i, '.jpg');
  if (isClip(w.video) && S.uploads[w.video.replace(/^\/+/, '')]) return (w.images || [])[0] || S.uploads[w.video.replace(/^\/+/, '')].poster || '';
  if (isClip(w.video)) return w.video.replace(/\.(mp4|webm|mov|m4v)$/i, '.jpg');
  return (w.images || [])[0] || '';
}
const catName = (c) => `<span lang="en">${t((CATS.find((x) => x[0] === c) || [, 'all'])[1])}</span>`;

/* =========================================================
   SHELL: top bar, toast, dialogs
   ========================================================= */
let route = { name: 'works' };
function topbar() {
  const n = changes().length;
  const cur = { works: 'works', work: 'works', gallery: 'gallery', home: 'home', journal: 'journal', story: 'journal' }[route.name];
  const el = $('#top');
  el.innerHTML = `
    <a class="brand" href="#/works" aria-label="Melis Ragusin Studio"><img src="/assets/logo-wordmark-tight.png" alt="Melis Ragusin"><span>${t('studio')}</span></a>
    <nav class="nav">${['works', 'gallery', 'home', 'journal'].map((k) => `<a href="#/${k}"${cur === k ? ' aria-current="page"' : ''}>${t(k)}</a>`).join('')}</nav>
    <div class="tools">
      <a class="icon site" href="${SITE}" target="_blank" rel="noopener" title="${t('viewSite')}" aria-label="${t('viewSite')}">${I.ext}</a>
      <div class="lang" role="group" aria-label="Language"><button type="button" data-lang="en" aria-pressed="${getLang() === 'en'}">EN</button><button type="button" data-lang="tr" aria-pressed="${getLang() === 'tr'}">TR</button></div>
      ${S.live === 'wait' ? `<span class="live" title="${t('updating')}"><span>${t('updating')}</span></span>` : S.live === 'done' ? `<a class="live on" href="${SITE}" target="_blank" rel="noopener" title="${t('liveShort')}"><span>${t('liveShort')}</span></a>` : ''}
      <button class="btn gold sm pub" type="button" data-act="publish"${n ? '' : ' hidden'}><span class="lbl">${t('publish')}</span>${n ? `<span class="n">${n}</span>` : ''}</button>
      <button class="me" type="button" data-act="menu" aria-label="${esc(S.user ? S.user.name : '')}">${S.user && S.user.avatar ? `<img src="${esc(S.user.avatar)}" alt="">` : ''}</button>
    </div>`;
}
let toastT;
function toast(msg, err) { const el = $('#toast'); el.textContent = msg; el.classList.toggle('err', !!err); el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), err ? 6000 : 3400); }
function dialog({ title, body, foot, small, onOpen }) {
  const v = document.createElement('div'); v.className = 'veil';
  v.innerHTML = `<div class="dlg${small ? ' small' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="dh"><h2>${title}</h2><button class="icon" type="button" data-close aria-label="${t('cancel')}">${I.x}</button></div><div class="db">${body}</div>${foot ? `<div class="df">${foot}</div>` : ''}</div>`;
  document.body.appendChild(v); requestAnimationFrame(() => v.classList.add('on'));
  const close = () => { v.classList.remove('on'); setTimeout(() => v.remove(), 300); document.removeEventListener('keydown', key); };
  const key = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  v.addEventListener('click', (e) => { if (e.target === v || e.target.closest('[data-close]')) close(); });
  if (onOpen) onOpen(v, close);
  return close;
}
const confirmBox = (text, yes, danger) => new Promise((res) => {
  dialog({ title: '&nbsp;', small: true, body: `<p style="font-size:16px;line-height:1.7;color:var(--soft)">${esc(text)}</p>`,
    foot: `<button class="btn sm" data-close>${t('cancel')}</button><button class="btn sm ${danger ? 'danger' : 'solid'}" data-yes>${esc(yes)}</button>`,
    onOpen: (v, close) => { v.querySelector('[data-yes]').onclick = () => { close(); res(true); }; v.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === v) res(false); }); } });
});
function pickWork({ cat, exclude = [], title }) {
  return new Promise((res) => {
    const list = projects().filter((w) => !w.removed && (!cat || w.cat === cat));
    dialog({ title: title || t('chooseWork'),
      body: `<div class="pick">${list.map((w) => `<button type="button" data-id="${esc(w.id)}" class="${exclude.includes(w.id) ? 'in-hall' : ''}"><div class="im">${cover(w) ? `<img src="${esc(img(cover(w), 480))}" alt="" loading="lazy">` : ''}</div><b>${esc(w.title)}</b><span>${esc(w.year)}${exclude.includes(w.id) ? ' · ' + t('inHall') : ''}</span></button>`).join('')}</div>`,
      onOpen: (v, close) => { v.querySelector('.pick').addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (!b) return; close(); res(b.dataset.id); }); v.addEventListener('click', (e) => { if (e.target === v || e.target.closest('[data-close]')) res(null); }); } });
  });
}
function chooseFiles({ accept = 'image/*', multiple = true } = {}) {
  return new Promise((res) => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = multiple; i.onchange = () => res([...i.files]); i.click(); });
}
async function addImages(files, name) {
  const ok = files.filter((f) => /^image\//.test(f.type));
  files.filter((f) => !/^image\//.test(f.type)).forEach((f) => toast(t('notImage', { f: f.name }), true));
  const big = ok.filter((f) => f.size > 40e6); big.forEach((f) => toast(t('tooBig', { f: f.name, m: 40 }), true));
  const list = ok.filter((f) => f.size <= 40e6); if (!list.length) return [];
  toast(t('preparing'));
  const out = [];
  for (const f of list) { try { const r = await prepareImage(f, name); S.uploads[r.path] = { url: r.url, files: r.files }; out.push(r.path); } catch (e) { toast(t('notImage', { f: f.name }), true); } }
  return out;
}
async function addVideo(file, name, maxMB = 40) {
  if (!file) return null;
  if (!/mp4$/i.test(file.type) && !/\.mp4$/i.test(file.name)) { toast(t('notVideo', { f: file.name }), true); return null; }
  if (file.size > maxMB * 1e6) { toast(t('tooBig', { f: file.name, m: maxMB }), true); return null; }
  const r = await prepareVideo(file, name);
  S.uploads[r.path] = { url: r.url, files: r.files, poster: r.poster };
  if (r.poster) S.uploads[r.poster] = { url: r.posterUrl, files: [] };
  return r.path;
}

/* drag to reorder — mouse, pen and touch.
   axis: 'x' for a row of pictures, 'y' for a list, 'grid' for cards in rows.
   press: the items are links in a page that scrolls — with a finger they are picked up by holding them a moment
   (a quick swipe still scrolls the page and a tap still opens the item). */
let holding = false; // an item is held by a finger: the page must not scroll under it
function sortable(list, itemSel, { handle, axis = 'y', press = false, onMove }) {
  list.addEventListener('dragstart', (e) => e.preventDefault()); // links and pictures must not start the browser's own drag
  // phones decide at the first touch whether a page may hold its scrolling back, so this listener is always there
  list.addEventListener('touchmove', (e) => { if (holding && e.cancelable) e.preventDefault(); }, { passive: false });
  list.addEventListener('pointerdown', (e) => {
    const h = handle ? e.target.closest(handle) : e.target.closest(itemSel);
    if (!h || !list.contains(h) || e.button > 0) return;
    if (!handle && e.target.closest('button,input,textarea,select' + (press ? '' : ',a'))) return;
    const item = h.closest(itemSel); if (!item || item.parentNode !== list) return;
    const items = () => $$(itemSel, list).filter((x) => x.parentNode === list);
    const from = items().indexOf(item), finger = press && e.pointerType !== 'mouse';
    let started = false, armed = !finger, lx = e.clientX, ly = e.clientY, raf = 0, timer = 0; const x0 = e.clientX, y0 = e.clientY;
    const place = () => {
      const over = document.elementFromPoint(lx, ly);
      let tgt = over && over.closest(itemSel);
      // over the top bar, the bottom bar or a gap: the nearest item takes the place (so the ends are reachable too)
      if (!tgt || tgt.parentNode !== list) {
        let best = Infinity; tgt = null;
        for (const el of items()) {
          const r = el.getBoundingClientRect();
          const dx = lx < r.left ? r.left - lx : lx > r.right ? lx - r.right : 0, dy = ly < r.top ? r.top - ly : ly > r.bottom ? ly - r.bottom : 0;
          const d = axis === 'y' ? dy : axis === 'x' ? dx : Math.hypot(dx, dy * 2);
          if (d < best) { best = d; tgt = el; }
        }
      }
      if (!tgt || tgt === item) return;
      const r = tgt.getBoundingClientRect();
      const after = axis === 'y' ? ly > r.top + r.height / 2 : lx > r.left + r.width / 2;
      list.insertBefore(item, after ? tgt.nextSibling : tgt);
    };
    // near the top or bottom of the screen the page scrolls by itself, so an item can be carried past the screen
    const edge = () => {
      raf = 0; if (!started || axis === 'x') return;
      // the edges are those of the part not covered by the top bar and the bars at the bottom
      let top = 0, bot = innerHeight;
      const tb = $('#top'); if (tb) top = Math.max(0, tb.getBoundingClientRect().bottom);
      $$('.act, .nav').forEach((el) => { const r = el.getBoundingClientRect(); if (r.height && getComputedStyle(el).position === 'fixed' && r.top > innerHeight / 2) bot = Math.min(bot, r.top); });
      // only towards the edge the item is being carried to (picking one up near an edge does not scroll)
      const m = Math.min(80, (bot - top) * 0.15), d = ly < top + m && ly < y0 - 24 ? ly - (top + m) : ly > bot - m && ly > y0 + 24 ? ly - (bot - m) : 0;
      if (!d) return;
      const v = Math.sign(d) * Math.min(32, 3 + Math.abs(d) / 3.5); // faster the closer to (or past) the edge
      const y = scrollY; scrollBy(0, Math.round(v)); if (scrollY !== y) place();
      raf = requestAnimationFrame(edge);
    };
    const begin = () => { started = true; item.classList.add('sortghost'); document.body.classList.add('sorting'); };
    if (finger) timer = setTimeout(() => { armed = true; holding = true; item.classList.add('lift'); try { navigator.vibrate && navigator.vibrate(12); } catch (x) {} }, 320);
    const move = (ev) => {
      lx = ev.clientX; ly = ev.clientY;
      if (!armed) { if (Math.hypot(lx - x0, ly - y0) > 8) end(); return; } // a swipe: the page scrolls as usual
      if (!started) { if (!finger && Math.hypot(lx - x0, ly - y0) < 6) return; begin(); }
      ev.preventDefault();
      place();
      if (!raf) raf = requestAnimationFrame(edge);
    };
    // the click that follows a drag (or a long hold) must not open the item
    const eat = () => { const stop = (ev) => { ev.preventDefault(); ev.stopPropagation(); }; addEventListener('click', stop, true); setTimeout(() => removeEventListener('click', stop, true), 400); };
    const end = () => {
      clearTimeout(timer);
      removeEventListener('pointermove', move); removeEventListener('pointerup', end); removeEventListener('pointercancel', end); holding = false;
      if (raf) cancelAnimationFrame(raf); raf = 0;
      document.body.classList.remove('sorting'); item.classList.remove('lift', 'sortghost');
      if (finger && armed) eat();
      if (!started) return;
      started = false; eat();
      item.dataset.dragged = '1';
      const to = items().indexOf(item); if (to !== from) onMove(from, to);
    };
    addEventListener('pointermove', move, { passive: false }); addEventListener('pointerup', end); addEventListener('pointercancel', end);
  });
}
const moveIn = (arr, from, to) => { const [x] = arr.splice(from, 1); arr.splice(to, 0, x); };
// works and stories are ordered by their "order" number. After a drag only the moved one gets a new number,
// between its new neighbours, so a single file is published; if the numbers leave no room, all are numbered again.
function reorder(all, shown, from, to) {
  const moved = shown[from], seq = shown.slice(); moveIn(seq, from, to);
  const slots = shown.map((d) => all.indexOf(d)).sort((a, b) => a - b), next = all.slice();
  slots.forEach((k, i) => { next[k] = seq[i]; });
  const k = next.indexOf(moved), num = (d) => +d.order || 0;
  const before = next[k - 1], after = next[k + 1];
  const fits = (x) => (!before || num(before) < x) && (!after || x < num(after)) && Number.isFinite(x);
  let x = !before ? num(after) - 1 : !after ? num(before) + 1 : Math.round((num(before) + num(after)) / 2 * 1000) / 1000;
  if (fits(x)) moved.order = x;
  else next.forEach((d, i) => { if (+d.order !== i) d.order = i; });
  touch();
}

/* =========================================================
   WORKS
   ========================================================= */
const filt = { cat: 'all', q: '' };
function viewWorks() {
  const all = projects();
  const count = (c) => all.filter((w) => c === 'all' ? !w.removed : c === 'hidden' ? w.removed : !w.removed && w.cat === c).length;
  const q = filt.q.trim().toLowerCase();
  const list = all.filter((w) => (filt.cat === 'all' ? !w.removed : filt.cat === 'hidden' ? w.removed : !w.removed && w.cat === filt.cat) && (!q || `${w.title} ${w.year} ${w.medium} ${w.id}`.toLowerCase().includes(q)));
  app.innerHTML = `
    ${S.restored ? `<div class="banner"><span>${t('restored')}</span><button class="btn sm gold" data-act="publish">${t('publish')}</button></div>` : ''}
    <div class="head"><div><div class="k kl">${t('studio')}</div><h1>${t('works')}</h1><p>${t('worksLead')}</p></div></div>
    <div class="bar">
      <div class="pills" role="group">${[['all', t('all')], ...CATS.map(([c, k]) => [c, `<span lang="en">${t(k)}</span>`]), ['hidden', t('hidden')]].map(([c, l]) => `<button type="button" data-cat="${c}" aria-pressed="${filt.cat === c}">${l}<sup>${count(c)}</sup></button>`).join('')}</div>
      <label class="search">${I.search}<input type="search" id="q" placeholder="${t('search')}" value="${esc(filt.q)}"></label>
    </div>
    <div class="grid" id="grid">
      ${filt.cat !== 'hidden' ? `<a class="card new" href="#/new-work"><div class="im"><div class="plus"><i>+</i><span class="k">${t('newWork')}</span></div></div></a>` : ''}
      ${list.map((w) => {
        const p = pPath(w.id), c = cover(w);
        return `<a class="card${w.removed ? ' hid' : ''}" data-id="${esc(w.id)}" draggable="false" href="#/work/${encodeURIComponent(w.id)}"><div class="im">${c ? `<img src="${esc(img(c, 480))}" alt="" loading="lazy" decoding="async" draggable="false">` : ''}
          <span class="tags">${isDirty(p) ? `<span class="tag gold">${S.base[p] == null ? t('draft') : t('edited')}</span>` : ''}${w.status ? `<span class="tag">${esc(w.status)}</span>` : ''}${w.removed ? `<span class="tag dim">${t('hidden')}</span>` : ''}</span></div>
          <span class="t">${esc(w.title || '—')}</span><span class="m"><b>${esc(w.year)}</b> · ${catName(w.cat)}</span></a>`;
      }).join('')}
    </div>${list.length ? '' : `<p class="empty">${t('nothing')}</p>`}`;
  sortable($('#grid'), '.card[data-id]', { axis: 'grid', press: true, onMove: (a, b) => { reorder(all, list, a, b); viewWorks(); } });
  $$('[data-cat]').forEach((b) => b.onclick = () => { filt.cat = b.dataset.cat; viewWorks(); });
  const q2 = $('#q'); q2.oninput = () => { filt.q = q2.value; const pos = q2.selectionStart; viewWorks(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); };
}

/* ---------- one work ---------- */
let sel = 0; // the picture shown large
function metaRows(w) { return (w.meta || []).map((m) => { const i = String(m).indexOf(':'); return i > 0 ? [m.slice(0, i).trim(), m.slice(i + 1).trim()] : ['', String(m).trim()]; }); }
function setMeta(w, rows) { w.meta = rows.filter((r) => r[0] || r[1]).map((r) => r[0] ? `${r[0]}: ${r[1]}` : r[1]); }
function newWork() {
  const all = projects(), y = String(new Date().getFullYear());
  const minOrder = Math.min(0, ...all.map((w) => +w.order || 0));
  const w = { id: '', order: minOrder - 1, title: '', year: y, cat: 'New-Media', medium: '', meta: [], video: '', statement: '', images: [] };
  let n = 1, id; do { id = `new-work-${n++}`; } while (S.docs[pPath(id)] !== undefined || S.base[pPath(id)] != null);
  w.id = id; w._new = true; S.docs[pPath(id)] = w; touch();
  location.replace('#/work/' + id);
}
// a new work takes its address from its title and year (until it is published)
function rename(w) {
  if (!w._new || S.base[pPath(w.id)] != null) return;
  const old = pPath(w.id); let base = slug(`${w.title || 'new-work'}-${w.year || ''}`), id = base, n = 2;
  while (id !== w.id && (S.docs[pPath(id)] !== undefined || S.base[pPath(id)] != null)) id = `${base}-${n++}`;
  if (id === w.id) return;
  delete S.docs[old]; w.id = id; S.docs[pPath(id)] = w;
  history.replaceState(null, '', '#/work/' + encodeURIComponent(id)); route.id = id;
}
function viewWork(id) {
  const w = work(id); if (!w) { location.hash = '#/works'; return; }
  const p = pPath(id), imgs = w.images || [];
  if (sel >= imgs.length) sel = 0;
  const big = imgs[sel] || cover(w);
  const amb = big ? (S.uploads[big.replace(/^\/+/, '')] ? '' : (window.mrImg && window.mrImg.amb(big.replace(/^\/+/, '')))) : '';
  const rows = metaRows(w);
  const gT = w.seo_title || `${w.title || ''} - ${w.year || ''} - Melis Ragusin Art`;
  const gD = w.seo_description || (w.statement || '').replace(/\s+/g, ' ').slice(0, 155);
  const isNew = S.base[p] == null;
  app.innerHTML = `
    <a class="crumb" href="#/works">${I.back}${t('back')}</a>
    <div class="ed">
      <div class="stagec">
        <div class="stagebox"><div class="amb${amb ? '' : ' blur'}" style="background-image:url('${esc(amb ? '/' + amb : img(big || cover(w), 480))}')"></div>
          ${big || cover(w) ? `<img src="${esc(img(big || cover(w), 1600))}" alt="">` : `<div class="none">${I.img}<span>${t('noImage')}</span></div>`}
        </div>
        <div class="strip" id="strip">${imgs.map((u, k) => `<div class="th${k === sel ? ' on' : ''}" data-k="${k}" tabindex="0"><img src="${esc(img(u, 480))}" alt="">${k === 0 ? `<span class="one">${t('cover')}</span>` : ''}<button class="x" type="button" data-rm="${k}" aria-label="${t('remove')}">${I.x}</button></div>`).join('')}
          <button class="drop" type="button" data-act="add-img" title="${t('addImages')}" aria-label="${t('addImages')}">${I.plus}</button></div>
        <p class="hint">${t('imagesHelp')}</p>
      </div>
      <div class="form">
        <div class="sec">
          <div class="f"><label for="f-title">${t('title')}</label><input class="in title" id="f-title" data-b="title" value="${esc(w.title)}" placeholder="${t('titlePh')}" autocomplete="off"></div>
          <div class="row">
            <div class="f"><label>${t('year')}</label><input class="in" data-b="year" value="${esc(w.year)}" inputmode="numeric" maxlength="4"></div>
            <div class="f"><label>${t('medium')}</label><input class="in" data-b="medium" value="${esc(w.medium)}" placeholder="${t('mediumPh')}"></div>
          </div>
          <div class="f"><span class="lb">${t('category')}</span><div class="seg" role="group">${CATS.map(([c, k]) => `<button type="button" data-setcat="${c}" aria-pressed="${w.cat === c}" lang="en">${t(k)}</button>`).join('')}</div></div>
        </div>
        <div class="sec"><h3>${t('statement')}</h3>
          <div class="f"><textarea class="in serif" data-b="statement" rows="9">${esc(w.statement)}</textarea><span class="help">${t('statementHelp')}</span></div>
        </div>
        <div class="sec"><h3>${t('details')}</h3>
          <div class="facts" id="facts">${rows.map((r, k) => `<div class="fact" data-k="${k}"><input value="${esc(r[0])}" placeholder="${t('label')}" data-m="0"><input value="${esc(r[1])}" placeholder="${t('value')}" data-m="1"><button class="icon" type="button" data-rmrow="${k}" aria-label="${t('remove')}">${I.x}</button></div>`).join('')}</div>
          <button class="btn sm addrow" type="button" data-act="add-row">${I.plus}${t('addDetail')}</button>
          <span class="help">${t('detailsHelp')}</span>
        </div>
        <div class="sec"><h3>${t('film')}</h3>
          <div class="f"><input class="in" data-b="video" value="${esc(S.uploads[(w.video || '').replace(/^\/+/, '')] ? '' : w.video)}" placeholder="https://player.vimeo.com/video/…"${S.uploads[(w.video || '').replace(/^\/+/, '')] ? ' disabled' : ''}>
          ${S.uploads[(w.video || '').replace(/^\/+/, '')] ? `<video src="${esc(S.uploads[w.video.replace(/^\/+/, '')].url)}" muted loop autoplay playsinline style="max-width:220px;border-radius:2px;margin-top:8px"></video>` : ''}
          <span class="help">${t('filmHelp')}</span></div>
          <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn sm" type="button" data-act="up-video">${I.up}${t('uploadVideo')}</button>${w.video ? `<button class="btn sm ghost danger" type="button" data-act="rm-video">${t('removeVideo')}</button>` : ''}</div>
        </div>
        <div class="sec"><h3>${t('platform')}</h3>
          <div class="row"><div class="f"><label>${t('btnLabel')}</label><input class="in" data-b="buy.label" value="${esc(w.buy && w.buy.label)}" placeholder="${t('btnLabelPh')}"></div>
          <div class="f"><label>${t('link')}</label><input class="in" data-b="buy.url" value="${esc(w.buy && w.buy.url)}" placeholder="https://…" inputmode="url"></div></div>
          <span class="help">${t('noPrices')}</span>
        </div>
        <div class="sec"><h3>${t('status')}</h3>
          <div class="sw"><div class="tx"><b>${t('sold')}</b><span>${t('soldHelp')}</span></div><button class="tog" type="button" role="switch" aria-checked="${w.status === 'Sold out'}" data-tog="sold" aria-label="${t('sold')}"></button></div>
          <div class="sw"><div class="tx"><b>${t('hide')}</b><span>${t('hideHelp')}</span></div><button class="tog" type="button" role="switch" aria-checked="${!!w.removed}" data-tog="removed" aria-label="${t('hide')}"></button></div>
        </div>
        <div class="sec"><h3>${t('google')}</h3>
          <div class="google"><div class="u"><i>M</i><span>melisragusin.com › projects › ${esc(w.id)}</span></div><div class="gt" id="g-t">${esc(gT)}</div><div class="gd" id="g-d">${esc(gD)}</div></div>
          <div class="f"><label>${t('gTitle')}</label><input class="in" data-b="seo_title" value="${esc(w.seo_title)}" placeholder="${esc(`${w.title || ''} - ${w.year || ''} - Melis Ragusin Art`)}"><span class="count" data-cnt="seo_title" data-max="60"></span></div>
          <div class="f"><label>${t('gDesc')}</label><textarea class="in" data-b="seo_description" rows="3" placeholder="${esc((w.statement || '').replace(/\s+/g, ' ').slice(0, 155))}">${esc(w.seo_description)}</textarea><span class="count" data-cnt="seo_description" data-max="155"></span></div>
          <span class="help">${t('googleHelp')}</span>
        </div>
        <details class="more"><summary>${t('advanced')}</summary><div>
          <div class="f"><label>${t('address')}</label><input class="in" value="melisragusin.com/projects/${esc(w.id)}/" disabled><span class="help">${t('addressHelp')}</span></div>
          <div class="f"><label>${t('order')}</label><input class="in" data-b="order" data-num value="${esc(w.order)}" inputmode="numeric"><span class="help">${t('orderHelp')}</span></div>
          <div><button class="btn sm danger" type="button" data-act="del-work">${I.trash}${t('deleteWork')}</button></div>
        </div></details>
      </div>
    </div>`;
  counts();
  // bindings
  bindInputs(w, () => {
    if (w._new) rename(w);
    $('#g-t').textContent = w.seo_title || `${w.title || ''} - ${w.year || ''} - Melis Ragusin Art`;
    $('#g-d').textContent = w.seo_description || (w.statement || '').replace(/\s+/g, ' ').slice(0, 155);
    counts();
  });
  $$('[data-setcat]').forEach((b) => b.onclick = () => { w.cat = b.dataset.setcat; touch(); viewWork(w.id); });
  $$('[data-tog]').forEach((b) => b.onclick = () => {
    const on = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', on);
    if (b.dataset.tog === 'sold') { if (on) w.status = 'Sold out'; else delete w.status; }
    if (b.dataset.tog === 'removed') { if (on) w.removed = true; else delete w.removed; }
    touch();
  });
  const facts = $('#facts');
  facts.addEventListener('input', () => { setMeta(w, $$('.fact', facts).map((r) => [r.querySelector('[data-m="0"]').value.trim(), r.querySelector('[data-m="1"]').value.trim()])); touch(); });
  facts.addEventListener('click', (e) => { const b = e.target.closest('[data-rmrow]'); if (!b) return; const r = metaRows(w); r.splice(+b.dataset.rmrow, 1); setMeta(w, r); touch(); viewWork(w.id); });
  $('[data-act="add-row"]').onclick = () => { const r = metaRows(w); r.push(['', '']); w.meta = r.map((x) => x[0] ? `${x[0]}: ${x[1]}` : x[1]); viewWork(w.id); const last = $$('.fact').pop(); last && last.querySelector('input').focus(); };
  // pictures
  const strip = $('#strip');
  strip.addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-rm]'); if (rm) { e.stopPropagation(); w.images.splice(+rm.dataset.rm, 1); if (sel >= w.images.length) sel = Math.max(0, w.images.length - 1); touch(); viewWork(w.id); return; }
    const th = e.target.closest('.th'); if (th && !th.dataset.dragged) { sel = +th.dataset.k; viewWork(w.id); return; }
    if (e.target.closest('[data-act="add-img"]')) { const files = await chooseFiles(); const paths = await addImages(files, w.title || w.id); if (paths.length) { w.images = [...(w.images || []), ...paths]; touch(); viewWork(w.id); } }
  });
  sortable(strip, '.th', { axis: 'x', onMove: (a, b) => { moveIn(w.images, a, b); sel = b; touch(); viewWork(w.id); } });
  dropZone($('.stagec'), async (files) => { const paths = await addImages(files, w.title || w.id); if (paths.length) { w.images = [...(w.images || []), ...paths]; touch(); viewWork(w.id); } });
  $('[data-act="up-video"]').onclick = async () => { const [f] = await chooseFiles({ accept: 'video/mp4', multiple: false }); const path = await addVideo(f, w.title || w.id); if (path) { w.video = path; touch(); viewWork(w.id); } };
  const rv = $('[data-act="rm-video"]'); if (rv) rv.onclick = () => { w.video = ''; touch(); viewWork(w.id); };
  $('[data-act="del-work"]').onclick = async () => {
    if (!(await confirmBox(t('deleteSure', { t: w.title || w.id }), t('del'), true))) return;
    const wp = pPath(w.id); if (S.base[wp] == null) delete S.docs[wp]; else S.docs[wp] = null;
    // it also leaves the gallery and the home page
    const g = gallery(); HALLS.forEach((h) => { const hh = g[h.id]; if (!hh) return; hh.works = (hh.works || []).filter((x) => x.work !== w.id); if (hh.door === w.id) delete hh.door; });
    const hm = homeDoc(); hm.series = (hm.series || []).filter((x) => x.work !== w.id);
    touch(); location.hash = '#/works';
  };
}
function counts() { $$('[data-cnt]').forEach((c) => { const inp = c.parentNode.querySelector('[data-b]'); const n = (inp.value || inp.placeholder || '').length, max = +c.dataset.max; c.textContent = `${n} / ${max}`; c.classList.toggle('over', n > max); }); }
function bindInputs(doc, after) {
  const form = $('.form', app);
  form.addEventListener('input', (e) => {
    const el = e.target.closest('[data-b]'); if (!el) return;
    const key = el.dataset.b; let v = el.value;
    if (el.dataset.num !== undefined) v = v.trim() === '' ? 0 : +v.replace(/[^\d-]/g, '') || 0;
    setIn(doc, key, v); touch(); after && after(key);
  });
}
function setIn(o, key, v) {
  const ks = key.split('.'); let cur = o;
  for (let i = 0; i < ks.length - 1; i++) { cur[ks[i]] = cur[ks[i]] || {}; cur = cur[ks[i]]; }
  const last = ks[ks.length - 1];
  if (v === '' && last !== 'title' && last !== 'year' && last !== 'statement' && last !== 'video' && last !== 'medium') delete cur[last]; else cur[last] = v;
  if (ks[0] === 'buy' && o.buy && !o.buy.label && !o.buy.url) delete o.buy;
}
function dropZone(el, onFiles) {
  el.addEventListener('dragover', (e) => { if ([...(e.dataTransfer.items || [])].some((i) => i.kind === 'file')) { e.preventDefault(); el.classList.add('over'); } });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('over'); onFiles([...e.dataTransfer.files]); });
}

/* =========================================================
   VIRTUAL GALLERY
   ========================================================= */
const open = new Set();
function viewGallery(hid) {
  const g = gallery(), H = HALLS.find((h) => h.id === hid) || HALLS[0], hall = g[H.id] || (g[H.id] = { works: [] });
  hall.works = hall.works || [];
  const items = hall.works.filter((x) => work(x.work));
  const door = work(hall.door) || (items[0] && work(items[0].work));
  app.innerHTML = `
    <div class="head"><div><div class="k kl">${t('studio')}</div><h1>${t('gallery')}</h1><p>${t('galleryLead')}</p></div><a class="btn sm" href="${SITE}/#${H.id}" target="_blank" rel="noopener">${I.ext}${t('viewSite')}</a></div>
    <div class="halls" role="group">${HALLS.map((h) => `<button type="button" class="hall" data-hall="${h.id}" aria-pressed="${h.id === H.id}" style="--c:${h.c}"><span class="gl"></span><i>${h.n}</i><b lang="en">${t(h.key)}</b><span>${t('worksIn', { n: ((g[h.id] && g[h.id].works) || []).filter((x) => work(x.work)).length })}</span></button>`).join('')}</div>
    <div class="door"><div class="pic">${door && cover(door) ? `<img src="${esc(img(cover(door), 480))}" alt="">` : ''}</div>
      <div><div class="k">${t('door')}</div><div class="nm">${esc(door ? door.title : '—')}${!hall.door ? ` <span class="muted" style="font-size:14px;font-family:var(--sans)">· ${t('firstWork')}</span>` : ''}</div>
      <button class="btn sm" type="button" data-act="door">${t('change')}</button><p class="hint">${t('doorHelp')}</p></div></div>
    ${H.id === 'mixed' ? `<p class="hint" style="margin-top:18px">${t('soldNote')}</p>` : ''}
    <div class="plan" id="plan">${items.map((x, k) => slot(H, x, k)).join('')}</div>
    <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap"><button class="btn sm gold" type="button" data-act="add">${I.plus}${t('addToHall')}</button></div>
    <p class="hint">${t('wallHelp')}</p>`;
  $$('[data-hall]').forEach((b) => b.onclick = () => { location.hash = '#/gallery/' + b.dataset.hall; });
  $('[data-act="door"]').onclick = async () => { const id = await pickWork({ cat: H.cat }); if (!id) return; hall.door = id; touch(); viewGallery(H.id); };
  $('[data-act="add"]').onclick = async () => {
    const id = await pickWork({ cat: H.cat, exclude: items.map((x) => x.work) }); if (!id || items.some((x) => x.work === id)) return;
    const e = { work: id, wall: 'otomatik' }; if (H.id === 'motion') e.orientation = 'portrait';
    hall.works.push(e); touch(); viewGallery(H.id);
  };
  const plan = $('#plan');
  plan.addEventListener('click', async (e) => {
    const s = e.target.closest('.slot'); if (!s) return; const x = items[+s.dataset.k];
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.wall) { x.wall = b.dataset.wall; touch(); viewGallery(H.id); }
    else if (b.dataset.or) { x.orientation = b.dataset.or; touch(); viewGallery(H.id); }
    else if (b.dataset.act === 'rm') { hall.works.splice(hall.works.indexOf(x), 1); touch(); viewGallery(H.id); }
    else if (b.dataset.act === 'open') { const k = H.id + ':' + x.work; open.has(k) ? open.delete(k) : open.add(k); viewGallery(H.id); }
    else if (b.dataset.act === 'clip') { const [f] = await chooseFiles({ accept: 'video/mp4', multiple: false }); const p = await addVideo(f, x.work + '-gallery', 8); if (p) { x.video = p; touch(); viewGallery(H.id); } }
    else if (b.dataset.act === 'rmclip') { delete x.video; touch(); viewGallery(H.id); }
    else if (b.dataset.act === 'alt') { const files = await chooseFiles({ multiple: false }); const [p] = await addImages(files, x.work + '-gallery'); if (p) { x.image = p; touch(); viewGallery(H.id); } }
    else if (b.dataset.act === 'rmalt') { delete x.image; touch(); viewGallery(H.id); }
  });
  plan.addEventListener('input', (e) => { const i = e.target.closest('[data-size]'); if (!i) return; const x = items[+i.closest('.slot').dataset.k]; if (i.value.trim()) x.size = i.value; else delete x.size; touch(); });
  sortable(plan, '.slot', { handle: '.hd', onMove: (a, b) => { const A = hall.works.indexOf(items[a]), Bi = hall.works.indexOf(items[b]); moveIn(hall.works, A, Bi); touch(); viewGallery(H.id); } });
}
const dimsOf = (w) => { const m = ((w && w.meta) || []).find((x) => /^\s*dimensions?\s*:/i.test(x)); return m ? m.replace(/^[^:]*:\s*/, '').replace(/\s*cm\s*$/i, '') : ''; };
function slot(H, x, k) {
  const w = work(x.work), opened = open.has(H.id + ':' + x.work), wall = x.wall || 'otomatik';
  const pic = x.image || cover(w);
  let extra = '';
  if (H.id === 'motion') extra = `
      <div class="f"><span class="lb">${t('screen')}</span><div class="seg">${[['portrait', 'portrait'], ['landscape', 'landscape']].map(([v, l]) => `<button type="button" data-or="${v}" aria-pressed="${(x.orientation || 'portrait') === v}">${t(l)}</button>`).join('')}</div></div>
      <div class="f"><span class="lb">${t('clip')}</span>${x.video ? `<video src="${esc(S.uploads[x.video.replace(/^\/+/, '')] ? S.uploads[x.video.replace(/^\/+/, '')].url : '/' + x.video.replace(/^\/+/, ''))}" muted loop autoplay playsinline style="width:${(x.orientation || 'portrait') === 'portrait' ? 90 : 180}px;border-radius:2px"></video>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" type="button" data-act="clip">${I.up}${t('uploadVideo')}</button>${x.video ? `<button class="btn sm ghost danger" type="button" data-act="rmclip">${t('removeVideo')}</button>` : ''}</div><span class="help">${t('clipHelp')}</span></div>`;
  else extra = `
      <div class="f"><label>${t('size')}</label><input class="in" data-size value="${esc(x.size)}" placeholder="${esc(dimsOf(w) || t('sizePh'))}"><span class="help">${t('sizeHelp')}</span></div>
      <div class="f"><span class="lb">${t('altImage')}</span><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" type="button" data-act="alt">${I.up}${t('choose')}</button>${x.image ? `<button class="btn sm ghost danger" type="button" data-act="rmalt">${t('remove')}</button>` : ''}</div><span class="help">${t('altImageHelp')}</span></div>`;
  return `<div class="slot${opened ? ' open' : ''}" data-k="${k}">
    <span class="hd" title="⇅">${I.grip}</span><span class="no">${k + 1}</span>
    <div class="pic">${pic ? `<img src="${esc(img(pic, 480))}" alt="">` : ''}</div>
    <div class="nm"><b>${esc(w.title)}</b><span>${esc(w.year)}${x.size || dimsOf(w) ? ' · ' + esc(x.size || dimsOf(w)) + ' cm' : ''}${H.id === 'motion' ? ' · ' + t(x.orientation === 'landscape' ? 'landscape' : 'portrait') : ''}</span></div>
    <div class="walls"><div class="seg">${WALLS.map(([v, l]) => `<button type="button" data-wall="${v}" aria-pressed="${wall === v}">${t(l)}</button>`).join('')}</div></div>
    <div style="display:flex"><button class="icon" type="button" data-act="open" aria-label="…" aria-expanded="${opened}" style="transform:rotate(${opened ? 180 : 0}deg)">${I.more}</button></div>
    <div class="ex">${extra}<div><button class="btn sm ghost danger" type="button" data-act="rm">${I.x}${t('remove')}</button></div></div>
  </div>`;
}

/* =========================================================
   HOME PAGE
   ========================================================= */
// a strip on the home page starts from its work: the title, the kind, the cover and the opening of the
// work's own statement (whole sentences, about two lines) — all of it can be changed afterwards
const KIND = { 'New-Media': 'New-Media Works', Motion: 'Motion Art', 'Mixed-Media': 'Mixed-Media' };
function shortText(st) {
  const paras = String(st || '').replace(/\r/g, '').split(/\n\s*\n/).map((x) => x.replace(/\s+/g, ' ').trim()).filter((x) => x && !/^(description|about|statement)$/i.test(x));
  // whole sentences only: a sentence ends at . ! ? … followed by a capital (so "RICH ENOUGH? floats" stays one)
  const sents = paras.slice(0, 3).map((p) => p.split(/(?<=[.!?…]["'”’)]*)\s+(?=["'“‘(]?[A-ZÇĞİÖŞÜ0-9])/));
  let out = '';
  for (let i = 0; i < sents.length; i++) {
    if (i > 0 && out.length >= 90) break; // a very short opening takes the next paragraph's first lines too
    for (const x of sents[i]) { if (out && (out + ' ' + x).length > 190) return out; out = out ? out + ' ' + x : x; }
  }
  if (out.length > 230) out = out.slice(0, 220).replace(/\s+\S*$/, '') + '…';
  return out;
}
function stripFrom(id) {
  const w = work(id), s = { work: id }; if (!w) return s;
  if (w.title) s.name = w.title;
  const m = String(w.medium || '').trim();
  const kind = m && (m.includes('·') || Object.values(KIND).includes(m)) ? m : KIND[w.cat] || m;
  if (kind) s.medium = kind;
  const pic = cover(w); if (pic) s.image = pic;
  const tx = shortText(w.statement); if (tx) s.text = tx;
  return s;
}
function viewHome() {
  const h = homeDoc(); h.series = h.series || [];
  app.innerHTML = `
    <div class="head"><div><div class="k kl">${t('studio')}</div><h1>${t('home')}</h1><p>${t('homeLead')}</p></div><a class="btn sm" href="${SITE}/home.html" target="_blank" rel="noopener">${I.ext}${t('viewSite')}</a></div>
    <div class="series" id="ser">${h.series.map((s, k) => { const w = work(s.work); const pic = s.image || cover(w); return `
      <div class="ser" data-k="${k}"><span class="hd">${I.grip}</span>
        <div class="pic">${pic ? `<img src="${esc(img(pic, 480))}" alt="">` : ''}<button type="button" data-act="img">${t('change')}</button></div>
        <div class="fl">
          <div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap"><b class="serif" style="font-size:24px;font-weight:400">${esc(w ? w.title : s.work)}</b><span class="k">${esc(w ? w.year : '')}</span><button class="link" type="button" data-act="work" style="margin-left:auto">${t('change')}</button></div>
          <div class="row"><div class="f"><label>${t('shortName')}</label><input class="in" data-s="name" value="${esc(s.name)}" placeholder="${esc(w ? w.title : t('shortNamePh'))}"></div>
          <div class="f"><label>${t('kind')}</label><input class="in" data-s="medium" value="${esc(s.medium)}" placeholder="${t('kindPh')}"></div></div>
          <div class="f"><label>${t('text')}</label><textarea class="in" data-s="text" rows="2" style="min-height:70px">${esc(s.text)}</textarea></div>
          ${s.image && s.image !== cover(w) ? `<div><button class="link" type="button" data-act="rmimg">${t('useCover')}</button></div>` : ''}
        </div>
        <button class="icon" type="button" data-act="rm" aria-label="${t('remove')}">${I.x}</button>
      </div>`; }).join('')}</div>
    <div style="margin-top:18px"><button class="btn sm gold" type="button" data-act="add">${I.plus}${t('addSeries')}</button></div>`;
  const box = $('#ser');
  box.addEventListener('input', (e) => { const i = e.target.closest('[data-s]'); if (!i) return; const s = h.series[+i.closest('.ser').dataset.k]; if (i.value.trim()) s[i.dataset.s] = i.value; else delete s[i.dataset.s]; touch(); });
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return; const s = h.series[+b.closest('.ser').dataset.k];
    if (b.dataset.act === 'rm') { h.series.splice(h.series.indexOf(s), 1); touch(); viewHome(); }
    // a strip given another work starts from that work's own name, picture and kind (the old ones belonged to the previous work)
    if (b.dataset.act === 'work') { const id = await pickWork({}); if (id && id !== s.work) { h.series[h.series.indexOf(s)] = stripFrom(id); touch(); viewHome(); } }
    if (b.dataset.act === 'img') { const f = await chooseFiles({ multiple: false }); const [p] = await addImages(f, s.work + '-home'); if (p) { s.image = p; touch(); viewHome(); } }
    if (b.dataset.act === 'rmimg') { delete s.image; touch(); viewHome(); }
  });
  $('[data-act="add"]').onclick = async () => { const id = await pickWork({}); if (!id) return; h.series.push(stripFrom(id)); touch(); viewHome(); };
  sortable(box, '.ser', { handle: '.hd', onMove: (a, b) => { moveIn(h.series, a, b); touch(); viewHome(); } });
}

/* =========================================================
   JOURNAL
   ========================================================= */
function viewJournal() {
  const list = stories();
  app.innerHTML = `
    <div class="head"><div><div class="k kl">${t('studio')}</div><h1>${t('journal')}</h1><p>${t('journalLead')}</p></div><button class="btn sm gold" type="button" data-act="new">${I.plus}${t('newStory')}</button></div>
    <div class="jl" id="jl">${list.map((a) => `<a class="jr" draggable="false" href="#/story/${encodeURIComponent(a.id)}"><div class="pic">${a.hero ? `<img src="${esc(img(a.hero, 480))}" alt="" loading="lazy" draggable="false">` : ''}</div>
      <div><b>${esc(a.title || '—')}</b><span>${esc(a.date)}${a.category ? ' · ' + esc(a.category) : ''}</span></div>
      <span class="k">${isDirty(jPath(a.id)) ? `<span class="tag gold">${S.base[jPath(a.id)] == null ? t('draft') : t('edited')}</span>` : '→'}</span></a>`).join('')}</div>`;
  sortable($('#jl'), '.jr', { press: true, onMove: (x, y) => { reorder(list, list, x, y); viewJournal(); } });
  $('[data-act="new"]').onclick = () => {
    let n = 1, id; do { id = `new-story-${n++}`; } while (S.docs[jPath(id)] !== undefined || S.base[jPath(id)] != null);
    const minO = Math.min(0, ...list.map((a) => +a.order || 0));
    const d = new Date(), M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    S.docs[jPath(id)] = { id, order: minO - 1, title: '', category: '', date: `${M[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`, read: '', hero: '', images: [], excerpt: '', body: [], _new: true };
    touch(); location.hash = '#/story/' + id;
  };
}
function renameStory(a) {
  if (!a._new || S.base[jPath(a.id)] != null) return;
  const old = jPath(a.id); let base = slug(a.title || 'new-story'), id = base, n = 2;
  const taken = (x) => S.docs[jPath(x)] !== undefined || S.base[jPath(x)] != null || S.docs[pPath(x)] || ['projects', 'blog', 'artist-bio', 'contact', 'admin', 'assets'].includes(x);
  while (id !== a.id && taken(id)) id = `${base}-${n++}`;
  if (id === a.id) return;
  delete S.docs[old]; a.id = id; S.docs[jPath(id)] = a; history.replaceState(null, '', '#/story/' + encodeURIComponent(id)); route.id = id;
}
function viewStory(id) {
  const a = S.docs[jPath(id)]; if (!a) { location.hash = '#/journal'; return; }
  a.body = Array.isArray(a.body) ? a.body : []; a.images = Array.isArray(a.images) ? a.images : [];
  const isNew = S.base[jPath(id)] == null;
  app.innerHTML = `
    <a class="crumb" href="#/journal">${I.back}${t('backJournal')}</a>
    <div class="ed">
      <div class="stagec">
        <div class="stagebox"><div class="amb blur" style="background-image:url('${esc(img(a.hero, 480))}')"></div>${a.hero ? `<img src="${esc(img(a.hero, 1600))}" alt="">` : `<div class="none">${I.img}<span>${t('noImage')}</span></div>`}</div>
        <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap"><button class="btn sm" type="button" data-act="hero">${I.up}${t('coverImage')}</button></div>
        <div class="strip" id="strip" style="margin-top:22px">${a.images.map((u, k) => `<div class="th" data-k="${k}"><img src="${esc(img(u, 480))}" alt=""><button class="x" type="button" data-rm="${k}" aria-label="${t('remove')}">${I.x}</button></div>`).join('')}<button class="drop" type="button" data-act="add-img" aria-label="${t('addImages')}">${I.plus}</button></div>
        <p class="hint">${t('images')}</p>
      </div>
      <div class="form">
        <div class="sec">
          <div class="f"><label>${t('title')}</label><input class="in title" data-b="title" value="${esc(a.title)}" autocomplete="off"></div>
          <div class="row"><div class="f"><label>${t('date')}</label><input class="in" data-b="date" value="${esc(a.date)}" placeholder="${t('datePh')}"></div>
          <div class="f"><label>${t('category')}</label><input class="in" data-b="category" value="${esc(a.category)}" placeholder="${t('catPh')}"></div>
          <div class="f"><label>${t('read')}</label><input class="in" data-b="read" value="${esc(a.read)}" placeholder="${t('readPh')}"></div></div>
        </div>
        <div class="sec"><h3>${t('excerpt')}</h3><div class="f"><textarea class="in serif" data-b="excerpt" rows="3">${esc(a.excerpt)}</textarea><span class="help">${t('excerptHelp')}</span></div></div>
        <div class="sec"><h3>${t('body')}</h3>
          <div class="blocks" id="blocks">${a.body.map((b, k) => `<div class="blk" data-k="${k}"><span class="hd">${I.grip}</span><div><div class="ty">${b.t === 'h' ? t('heading') : t('paragraph')}</div>${b.t === 'h' ? `<input class="in h" data-x value="${esc(b.x)}">` : `<textarea class="in" data-x rows="4">${esc(b.x)}</textarea>`}</div><button class="icon" type="button" data-rm aria-label="${t('remove')}">${I.x}</button></div>`).join('')}</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn sm" type="button" data-add="h">${I.plus}${t('addHeading')}</button><button class="btn sm" type="button" data-add="p">${I.plus}${t('addParagraph')}</button></div>
        </div>
        <details class="more"><summary>${t('advanced')}</summary><div>
          <div class="f"><label>${t('address')}</label><input class="in" value="melisragusin.com/${esc(a.id)}/" disabled><span class="help">${t('addressHelp')}</span></div>
          <div class="f"><label>${t('order')}</label><input class="in" data-b="order" data-num value="${esc(a.order)}" inputmode="numeric"></div>
          <div><button class="btn sm danger" type="button" data-act="del">${I.trash}${t('deleteStory')}</button></div>
        </div></details>
      </div>
    </div>`;
  bindInputs(a, (k) => { if (k === 'title') renameStory(a); });
  const blocks = $('#blocks');
  blocks.addEventListener('input', (e) => { const x = e.target.closest('[data-x]'); if (!x) return; a.body[+x.closest('.blk').dataset.k].x = x.value; touch(); });
  blocks.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (!b) return; a.body.splice(+b.closest('.blk').dataset.k, 1); touch(); viewStory(a.id); });
  sortable(blocks, '.blk', { handle: '.hd', onMove: (x, y) => { moveIn(a.body, x, y); touch(); viewStory(a.id); } });
  $$('[data-add]').forEach((b) => b.onclick = () => { a.body.push({ t: b.dataset.add, x: '' }); touch(); viewStory(a.id); const l = $$('[data-x]').pop(); l && l.focus(); });
  $('[data-act="hero"]').onclick = async () => { const f = await chooseFiles({ multiple: false }); const [p] = await addImages(f, a.title || a.id); if (p) { a.hero = p; if (!a.images.includes(p)) a.images.unshift(p); touch(); viewStory(a.id); } };
  const strip = $('#strip');
  strip.addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-rm]'); if (rm) { a.images.splice(+rm.dataset.rm, 1); touch(); viewStory(a.id); return; }
    if (e.target.closest('[data-act="add-img"]')) { const f = await chooseFiles(); const ps = await addImages(f, a.title || a.id); if (ps.length) { a.images.push(...ps); touch(); viewStory(a.id); } }
  });
  sortable(strip, '.th', { axis: 'x', onMove: (x, y) => { moveIn(a.images, x, y); touch(); viewStory(a.id); } });
  $('[data-act="del"]').onclick = async () => { if (!(await confirmBox(t('deleteSure', { t: a.title || a.id }), t('del'), true))) return; if (isNew) delete S.docs[jPath(a.id)]; else S.docs[jPath(a.id)] = null; touch(); location.hash = '#/journal'; };
}

/* =========================================================
   ACTION BAR (on an edited page) and PUBLISH
   ========================================================= */
function curPath() { return route.name === 'work' ? pPath(route.id) : route.name === 'story' ? jPath(route.id) : route.name === 'gallery' ? 'data/gallery.json' : route.name === 'home' ? 'data/home.json' : null; }
function actionBar() {
  const p = curPath(), bar = $('#act');
  const on = !!p && isDirty(p) && S.base[p] != null;
  bar.classList.toggle('on', on);
  if (!on) return;
  bar.innerHTML = `<span class="s"><i></i>${t('unsaved')}</span><span class="b"><button class="btn sm ghost" type="button" data-act="undo">${t('undo')}</button><button class="btn sm gold" type="button" data-act="publish">${t('publish')}</button></span>`;
}
function label(c) {
  const m = c.path.match(/^data\/(projects|journal)\/(.+)\.json$/);
  const doc = S.docs[c.path] || (S.base[c.path] ? JSON.parse(S.base[c.path]) : {});
  if (m) return `${m[1] === 'projects' ? t('works') : t('journal')} · ${esc(doc.title || m[2])}`;
  return c.path === 'data/gallery.json' ? t('gallery') : t('home');
}
function publishDialog() {
  const list = changes();
  if (!list.length) { toast(t('nothingToPublish')); return; }
  dialog({ title: t('pubTitle'), small: true,
    body: `<p class="muted" style="font-size:14px;line-height:1.75">${t('pubLead')}</p><ul class="chg" style="margin-top:18px">${list.map((c) => `<li><i></i>${label(c)} <small>· ${t(c.kind)}</small></li>`).join('')}</ul><div class="prog" hidden><i></i></div>`,
    foot: `<button class="btn sm ghost danger" type="button" data-discard style="margin-right:auto">${t('discardAll')}</button><button class="btn sm" data-close>${t('cancel')}</button><button class="btn sm solid" type="button" data-go>${t('pubNow')}</button>`,
    onOpen: (v, close) => {
      v.querySelector('[data-discard]').onclick = async () => { close(); if (!(await confirmBox(t('discardSure'), t('discardAll'), true))) return; resetDocs(); S.uploads = {}; S.restored = false; touch(); render(); };
      v.querySelector('[data-go]').onclick = async (e) => {
        const btn = e.currentTarget; btn.disabled = true; btn.textContent = t('publishing');
        const prog = v.querySelector('.prog'); prog.hidden = false;
        const ch = changes().map((c) => ({ path: c.path, text: c.text == null ? null : JSON.stringify(clean(JSON.parse(c.text)), null, 2) + '\n' }));
        const ups = usedUploads(ch);
        const names = ch.map((c) => { const m = c.path.match(/\/([^/]+)\.json$/); return m ? m[1] : c.path; });
        const bases = {}; ch.forEach((c) => { bases[c.path] = S.base[c.path] == null ? null : S.base[c.path]; });
        const go = async (force) => {
          const sha = await B.publish({ changes: ch, uploads: ups, since: S.head, bases, force, message: `Studio: ${names.slice(0, 4).join(', ')}${names.length > 4 ? ` +${names.length - 4}` : ''}`, onStep: (f) => { prog.firstChild.style.width = Math.round(f * 100) + '%'; } });
          // what is now published becomes the new starting point
          S.head = sha;
          ch.forEach((c) => { if (c.text == null) { delete S.base[c.path]; delete S.docs[c.path]; } else { S.base[c.path] = c.text; S.docs[c.path] = JSON.parse(c.text); } });
          Object.values(S.uploads).forEach((u) => { u.published = true; });
          S.restored = false; touch(); close(); render(); toast(t('pubDone'));
          live(sha);
        };
        try { await go(false); }
        catch (err) {
          btn.disabled = false; btn.textContent = t('pubNow'); prog.hidden = true;
          if (err.code === 401) { toast(t('signInFailed'), true); gate(); return; }
          if (err.code === 'stale') {
            close();
            const what = err.paths.map((p) => label({ path: p })).join(', ');
            const ok = await confirmBox(t('staleQ', { x: what }), t('getLatest'));
            // the changes are kept: the ones made on an older version are set aside when the newest is loaded
            if (ok) { await new Promise((r) => setTimeout(r, 450)); S.uploads = {}; S.restored = false; await start(); }
            return;
          }
          toast(t('pubFailed', { e: err.message }), true);
        }
      };
    } });
}
const clean = (o) => { if (o && typeof o === 'object') delete o._new; return o; };
// after publishing, the top bar shows "Updating the site…" until melisragusin.com is built from it
let liveRun = 0;
async function live(sha) {
  const run = ++liveRun; S.live = 'wait'; topbar();
  const ok = await B.waitLive(sha);
  if (run !== liveRun) return;
  S.live = ok ? 'done' : ''; topbar();
  if (ok) { toast(t('isLive')); setTimeout(() => { if (run === liveRun) { S.live = ''; topbar(); } }, 12000); }
  else if (sha !== 'demo') toast(t('liveSlow'));
}
function resetDocs() { S.docs = {}; for (const [p, txt] of Object.entries(S.base)) S.docs[p] = JSON.parse(txt); }

/* =========================================================
   ROUTER
   ========================================================= */
function parse() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [a, b] = h.split('/');
  if (a === 'work' && b) return { name: 'work', id: b };
  if (a === 'new-work') return { name: 'new-work' };
  if (a === 'gallery') return { name: 'gallery', id: b || 'motion' };
  if (a === 'home') return { name: 'home' };
  if (a === 'journal') return { name: 'journal' };
  if (a === 'story' && b) return { name: 'story', id: b };
  return { name: 'works' };
}
function render() {
  route = parse();
  if (route.name === 'new-work') { newWork(); return; }
  if (route.name !== 'work') sel = 0;
  ({ works: viewWorks, work: () => viewWork(route.id), gallery: () => viewGallery(route.id), home: viewHome, journal: viewJournal, story: () => viewStory(route.id) })[route.name]();
  topbar(); actionBar();
}

/* =========================================================
   SIGN IN and START
   ========================================================= */
function gate(msg) {
  document.body.classList.add('gated');
  $('#top').innerHTML = ''; $('#act').classList.remove('on');
  app.innerHTML = `<div class="gate"><div class="bg" style="background-image:url('/assets/hero/media/artwork-2.jpg')"></div><div class="box">
    <img src="/assets/logo-wordmark-tight.png" alt="Melis Ragusin">
    <h1>${t('gateTitle')}</h1><p>${t('gateText')}</p>
    <button class="btn solid" type="button" id="signin">${t('signIn')}</button>
    ${msg ? `<p class="err">${esc(msg)}</p>` : ''}
    <div class="lang" role="group" aria-label="Language"><button type="button" data-lang="en" aria-pressed="${getLang() === 'en'}">EN</button><button type="button" data-lang="tr" aria-pressed="${getLang() === 'tr'}">TR</button></div>
  </div></div>`;
  $('#signin').onclick = async (e) => {
    const btn = e.currentTarget; btn.textContent = t('signingIn'); setTimeout(() => { if (btn.isConnected) btn.textContent = t('signIn'); }, 15000);
    try { await B.signIn(); await start(); }
    catch (err) { gate(err.message === 'popup' ? t('popupBlocked') : t('signInFailed')); }
  };
}
async function start() {
  const ld = $('#loading'); ld.classList.remove('done');
  try {
    const d = await B.loadAll();
    S.user = d.user; S.head = d.head; S.base = {};
    for (const [p, txt] of Object.entries(d.files)) { try { S.base[p] = ser(JSON.parse(txt)); } catch (e) {} }
    resetDocs();
    // unpublished changes from an earlier visit
    const saved = await B.draftLoad('state');
    if (saved && saved.docs) {
      let any = false, old = 0;
      for (const [p, v] of Object.entries(saved.docs)) {
        // a change made on a version that has since been replaced (published from another device or browser)
        // is set aside, so it can never bring the older version back
        if (saved.from && p in saved.from && (saved.from[p] == null ? null : saved.from[p]) !== (S.base[p] == null ? null : S.base[p])) { old++; continue; }
        S.docs[p] = v; any = true;
      }
      if (old) setTimeout(() => toast(t('draftOld')), 900);
      for (const [p, u] of Object.entries(saved.uploads || {})) {
        (u.files || []).forEach((f) => { if (!S.uploads[f.path]) S.uploads[f.path] = { files: f.path === p ? u.files : [], url: URL.createObjectURL(f.blob) }; });
        if (S.uploads[p]) S.uploads[p].files = u.files;
      }
      S.restored = any && changes().length > 0;
    }
    document.body.classList.remove('gated');
    render();
  } catch (err) {
    if (err.code === 401 || err.message === 'signed-out') gate();
    else if (err.code === 403 || err.message === 'no-access' || err.code === 404) gate(t('noAccess'));
    else gate(t('loadFailed'));
  } finally { setTimeout(() => ld.classList.add('done'), 150); }
}

/* global clicks: language, publish, menu, undo */
document.addEventListener('click', async (e) => {
  const l = e.target.closest('[data-lang]');
  if (l) { setLang(l.dataset.lang); if (document.body.classList.contains('gated')) gate(); else render(); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'publish') publishDialog();
  if (b.dataset.act === 'undo') {
    const p = curPath(); if (!p) return; const d = S.docs[p] || (S.base[p] ? JSON.parse(S.base[p]) : {});
    if (!(await confirmBox(t('undoSure', { t: d.title || label({ path: p }) }), t('undo')))) return;
    if (S.base[p] != null) S.docs[p] = JSON.parse(S.base[p]); touch(); render();
  }
  if (b.dataset.act === 'menu') {
    const old = $('.menu'); if (old) { old.remove(); return; }
    const m = document.createElement('div'); m.className = 'menu';
    m.innerHTML = `<div class="who"><span class="k">${t('signedInAs')}</span><b>${esc(S.user ? S.user.name : '')}</b><span class="muted" style="font-size:12.5px">@${esc(S.user ? S.user.login : '')}</span></div>
      <a href="${SITE}" target="_blank" rel="noopener">${I.ext}${t('viewSite')}</a><button type="button" data-out>${I.back}${t('signOut')}</button>`;
    document.body.appendChild(m);
    m.querySelector('[data-out]').onclick = () => { B.signOut(); m.remove(); gate(); };
    setTimeout(() => document.addEventListener('click', function off(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('click', off); } }), 0);
  }
});
// each page opens at its top; going back to a list returns to where it was left
const scrolls = {}; let lastHash = location.hash;
addEventListener('hashchange', () => {
  scrolls[lastHash] = scrollY; lastHash = location.hash;
  if (document.body.classList.contains('gated')) return;
  render(); scrollTo(0, scrolls[location.hash] || 0);
});
addEventListener('beforeunload', (e) => { if (changes().length) { e.preventDefault(); e.returnValue = t('leave'); } });

setLang(getLang());
if (!B.hasToken()) { gate(); $('#loading').classList.add('done'); } else start();
