// Pictures added in the Studio are prepared in the browser before they are published: a sensible original
// (at most 2560 px). The site's build then makes the light copies phones use, like tools/imgv.py does.
const MAX = 2560;
const blobOf = (canvas, type, q) => new Promise((res) => canvas.toBlob((b) => res(b), type, q));
function draw(src, w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, w, h); return c; }
// halving steps keep large reductions crisp
function scaled(src, sw, sh, tw) {
  let cur = src, w = sw, h = sh;
  while (w / 2 >= tw) { w = Math.round(w / 2); h = Math.round(h / 2); cur = draw(cur, w, h); }
  return draw(cur, tw, Math.max(1, Math.round(sh * tw / sw)));
}
export const slug = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/İ/g, 'i').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'image';
const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };

// returns { path, url, files: [{ path, blob }] }  (url: a preview until it is published)
export async function prepareImage(file, name) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
  const w0 = bmp.width, h0 = bmp.height;
  const png = file.type === 'image/png', base = `${slug(name || file.name.replace(/\.[a-z0-9]+$/i, ''))}-${stamp()}`;
  const files = [];
  // the original: kept as it is when it is already reasonable, otherwise made lighter
  let orig, ext, ow = w0;
  if (Math.max(w0, h0) <= MAX && file.size <= 2.5e6 && /^image\/(jpeg|png|webp)$/.test(file.type)) { orig = file; ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type]; }
  else {
    const k = Math.min(1, MAX / Math.max(w0, h0)); ow = Math.round(w0 * k);
    const c = scaled(bmp, w0, h0, ow);
    if (png && file.size <= 6e6 && k === 1) { orig = file; ext = 'png'; }
    else { orig = await blobOf(c, 'image/jpeg', 0.9); ext = 'jpg'; }
  }
  const path = `assets/uploads/${base}.${ext}`;
  files.push({ path, blob: orig });
  // the light copies (480 / 960 / 1600 px and the blurred one) are made by the site's build when it is published
  bmp.close && bmp.close();
  return { path, url: URL.createObjectURL(orig), files };
}

// a short video for the gallery screens or a work page: published as it is, with a still taken from it
// (the site shows <name>.jpg next to a clip while it loads, and as the work's picture in lists)
export async function prepareVideo(file, name) {
  const base = `${slug(name || file.name.replace(/\.[a-z0-9]+$/i, ''))}-${stamp()}`;
  const path = `assets/uploads/${base}.mp4`, url = URL.createObjectURL(file);
  const files = [{ path, blob: file }];
  let poster = '', posterUrl = '';
  try {
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; setTimeout(rej, 8000); });
    await new Promise((res) => { v.onseeked = res; v.currentTime = Math.min(1, (v.duration || 2) / 3); setTimeout(res, 3000); });
    const k = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
    const c = draw(v, Math.round(v.videoWidth * k), Math.round(v.videoHeight * k));
    const b = await blobOf(c, 'image/jpeg', 0.86);
    if (b) { poster = `assets/uploads/${base}.jpg`; posterUrl = URL.createObjectURL(b); files.push({ path: poster, blob: b }); }
  } catch (e) {}
  return { path, url, files, poster, posterUrl };
}
