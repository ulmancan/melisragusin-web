// Where the content lives: the site's GitHub repository. Sign-in goes through Netlify (GitHub OAuth),
// reading is one GraphQL request, and publishing is one commit (so one deploy) for any number of changes.
export const REPO = { owner: 'ulmancan', name: 'melisragusin-web', branch: 'main' };
const API = 'https://api.github.com';
const DEMO = /[?&]demo\b/.test(location.search) && /^(localhost|127\.)/.test(location.hostname); // a look at the Studio without signing in, on this computer only
let token = null;
try { token = localStorage.getItem('mr-studio-token'); } catch (e) {}

export const isDemo = () => DEMO;
export const hasToken = () => DEMO || !!token;
export function signOut() { token = null; try { localStorage.removeItem('mr-studio-token'); } catch (e) {} }

/* ---------- sign in (the same Netlify OAuth handshake the old panel used) ---------- */
export function signIn() {
  if (DEMO) return Promise.resolve('demo');
  return new Promise((resolve, reject) => {
    const host = /^(localhost|127\.|\[::1\])/.test(location.hostname) ? 'melisragusin.netlify.app' : location.hostname;
    const url = `https://api.netlify.com/auth?provider=github&site_id=${encodeURIComponent(host)}&scope=repo`;
    const w = 620, h = 720, x = Math.max(0, (screen.width - w) / 2), y = Math.max(0, (screen.height - h) / 2);
    const pop = window.open(url, 'mr-studio-auth', `width=${w},height=${h},left=${x},top=${y}`);
    if (!pop) { reject(new Error('popup')); return; }
    const done = (err, tok) => { removeEventListener('message', onMsg); try { pop.close(); } catch (e) {} err ? reject(err) : resolve(tok); };
    const onMsg = (e) => {
      if (e.origin !== 'https://api.netlify.com' || typeof e.data !== 'string') return;
      if (e.data === 'authorizing:github') { pop.postMessage(e.data, e.origin); return; }
      const m = /^authorization:github:(success|error):(.*)$/s.exec(e.data);
      if (!m) return;
      let body = {}; try { body = JSON.parse(m[2]); } catch (_) {}
      if (m[1] === 'success' && body.token) { token = body.token; try { localStorage.setItem('mr-studio-token', token); } catch (_) {} done(null, token); }
      else done(new Error(body.message || 'auth'));
    };
    addEventListener('message', onMsg);
    // (no watching pop.closed: GitHub's pages may report the window as closed while it is still signing in)
  });
}

async function gh(path, opts = {}) {
  const r = await fetch(API + path, { ...opts, headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (r.status === 401) { signOut(); throw Object.assign(new Error('signed-out'), { code: 401 }); }
  if (!r.ok) { let m = r.statusText; try { m = (await r.json()).message || m; } catch (e) {} throw Object.assign(new Error(m), { code: r.status }); }
  return r.status === 204 ? null : r.json();
}
async function gql(query, variables = {}) {
  const r = await gh('/graphql', { method: 'POST', body: JSON.stringify({ query, variables }) });
  if (r.errors && r.errors.length) throw new Error(r.errors[0].message);
  return r.data;
}

/* ---------- read everything the Studio edits ---------- */
// returns { user, head, files: { 'data/projects/x.json': text, ... } }
export async function loadAll() {
  if (DEMO) return loadDemo();
  const tree = (alias, dir) => `${alias}: object(expression: $${alias}) { ... on Tree { entries { name type object { ... on Blob { text } } } } }`;
  const q = `query($owner: String!, $name: String!, $ref: String!, $projects: String!, $journal: String!, $gallery: String!, $home: String!) {
    viewer { login name avatarUrl }
    repository(owner: $owner, name: $name) {
      viewerPermission
      ref(qualifiedName: $ref) { target { oid } }
      ${tree('projects')} ${tree('journal')}
      gallery: object(expression: $gallery) { ... on Blob { text } }
      home: object(expression: $home) { ... on Blob { text } }
    }
  }`;
  const b = REPO.branch;
  const d = await gql(q, { owner: REPO.owner, name: REPO.name, ref: 'refs/heads/' + b, projects: b + ':data/projects', journal: b + ':data/journal', gallery: b + ':data/gallery.json', home: b + ':data/home.json' });
  const repo = d.repository;
  if (!repo) throw Object.assign(new Error('no-repo'), { code: 404 });
  if (!['WRITE', 'MAINTAIN', 'ADMIN'].includes(repo.viewerPermission)) throw Object.assign(new Error('no-access'), { code: 403 });
  const files = {};
  const add = (dir, t) => ((t && t.entries) || []).forEach((e) => { if (e.type === 'blob' && /\.json$/.test(e.name) && !e.name.startsWith('._') && e.object && e.object.text != null) files[`${dir}/${e.name}`] = e.object.text; });
  add('data/projects', repo.projects); add('data/journal', repo.journal);
  if (repo.gallery && repo.gallery.text != null) files['data/gallery.json'] = repo.gallery.text;
  if (repo.home && repo.home.text != null) files['data/home.json'] = repo.home.text;
  return { user: { login: d.viewer.login, name: d.viewer.name || d.viewer.login, avatar: d.viewer.avatarUrl }, head: repo.ref && repo.ref.target.oid, files };
}

// the demo reads the site's own data folder (used to look at the Studio without signing in)
async function loadDemo() {
  const files = {};
  const list = (txt) => [...txt.matchAll(/href="([^"]+\.json)"/g)].map((m) => decodeURIComponent(m[1]).split('/').pop());
  for (const dir of ['data/projects', 'data/journal']) {
    let names = [];
    try { names = list(await (await fetch(`../${dir}/`)).text()); } catch (e) {}
    await Promise.all(names.filter((n) => !n.startsWith('._')).map(async (n) => { files[`${dir}/${n}`] = await (await fetch(`../${dir}/${n}`)).text(); }));
  }
  files['data/gallery.json'] = await (await fetch('../data/gallery.json')).text();
  files['data/home.json'] = await (await fetch('../data/home.json')).text();
  return { user: { login: 'melisragusin', name: 'Melis Ragusin', avatar: '' }, head: 'demo', files };
}

/* ---------- publish: one commit with every change ---------- */
// changes: [{ path, text }] (text null = delete); uploads: [{ path, blob }]
export async function publish({ changes, uploads, message, onStep }) {
  if (DEMO) { for (let i = 0; i <= 10; i++) { onStep && onStep(i / 10); await new Promise((r) => setTimeout(r, 120)); } return 'demo'; }
  const R = `/repos/${REPO.owner}/${REPO.name}`;
  const ref = await gh(`${R}/git/ref/heads/${REPO.branch}`);
  const head = ref.object.sha;
  const base = await gh(`${R}/git/commits/${head}`);
  const tree = [], steps = uploads.length + 3; let step = 0;
  const tick = () => onStep && onStep(++step / steps);
  for (const u of uploads) {
    const b = await gh(`${R}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: await toBase64(u.blob), encoding: 'base64' }) });
    tree.push({ path: u.path, mode: '100644', type: 'blob', sha: b.sha }); tick();
  }
  for (const c of changes) tree.push(c.text == null ? { path: c.path, mode: '100644', type: 'blob', sha: null } : { path: c.path, mode: '100644', type: 'blob', content: c.text });
  const nt = await gh(`${R}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: base.tree.sha, tree }) }); tick();
  const nc = await gh(`${R}/git/commits`, { method: 'POST', body: JSON.stringify({ message, tree: nt.sha, parents: [head] }) }); tick();
  await gh(`${R}/git/refs/heads/${REPO.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: nc.sha }) }); tick();
  return nc.sha;
}
const toBase64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });

/* ---------- unpublished work survives a closed tab (kept in this browser only) ---------- */
const DB = 'mr-studio', STORE = 'drafts';
function idb() { return new Promise((res, rej) => { const o = indexedDB.open(DB, 1); o.onupgradeneeded = () => o.result.createObjectStore(STORE); o.onsuccess = () => res(o.result); o.onerror = () => rej(o.error); }); }
export async function draftSave(key, value) { try { const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(value, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch (e) {} }
export async function draftLoad(key) { try { const db = await idb(); return await new Promise((res, rej) => { const rq = db.transaction(STORE).objectStore(STORE).get(key); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }); } catch (e) { return null; } }
