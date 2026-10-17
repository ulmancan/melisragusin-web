/* Melis Ragusin — shared behaviour for every inner page:
   the top bar settles on scroll, mobile menu, reveals, split headings, page off like a screen, newsletter. */
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  root.classList.add('js');
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // the page glides: wheel and trackpad scrolling is eased, touch keeps its native feel
  var lenis = null;
  if (!reduced && window.Lenis && matchMedia('(pointer: fine)').matches) {
    lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1, smoothWheel: true, anchors: false });
    var loop = function (t) { lenis.raf(t); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    // pause it while a viewer or the menu holds the page
    new MutationObserver(function () { if (d.body.style.overflow === 'hidden') lenis.stop(); else lenis.start(); }).observe(d.body, { attributes: true, attributeFilter: ['style'] });
  }
  window.mrLenis = lenis;

  // top bar
  var tb = d.getElementById('tb');
  function onScroll() { if (tb) tb.classList.toggle('solid', scrollY > 30); }
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // current page in the menu
  var here = window.PAGE_FILE || location.pathname.split('/').pop() || 'index.html';
  if (here === 'home') here = 'home.html';
  d.querySelectorAll('.mainnav > a').forEach(function (a) { if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page'); });
  // Projects and About are links too; they stay lit on the pages that belong to them
  var SECTION = { 'archive.html': 'archive.html', 'project.html': 'archive.html', 'artist-bio.html': 'artist-bio.html', 'exhibitions-interview.html': 'artist-bio.html', 'oksijen-interview.html': 'artist-bio.html' };
  d.querySelectorAll('.mainnav .navlink').forEach(function (a) { if (SECTION[here] && a.getAttribute('href') === SECTION[here]) a.setAttribute('aria-current', 'page'); });

  // mobile menu
  var tg = d.getElementById('navToggle'), nav = d.getElementById('mainnav');
  if (tg && nav) {
    tg.addEventListener('click', function () { var o = !nav.classList.contains('open'); nav.classList.toggle('open', o); tg.classList.toggle('on', o); tg.setAttribute('aria-expanded', o ? 'true' : 'false'); });
    nav.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { nav.classList.remove('open'); tg.classList.remove('on'); }); });
  }

  // split headings into words that come into focus
  window.mrSplit = function (el) {
    if (!el || el.dataset.splitDone) return; el.dataset.splitDone = '1';
    var k = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var f = d.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (p) {
            if (!p) return;
            if (/^\s+$/.test(p)) { f.appendChild(d.createTextNode(p)); return; }
            var s = d.createElement('span'); s.className = 'w'; s.textContent = p; s.style.transitionDelay = (k++ * 70) + 'ms'; f.appendChild(s);
          });
          node.replaceChild(f, n);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    })(el);
  };

  // reveal on scroll
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (en) {
    en.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -10% 0px' }) : null;
  window.mrReveal = function (scope) {
    (scope || d).querySelectorAll('[data-split]').forEach(function (el) { mrSplit(el); });
    (scope || d).querySelectorAll('.rv,[data-split]').forEach(function (el) { if (io) io.observe(el); else el.classList.add('in'); });
  };
  mrReveal();

  // every page opens on the MR mark, and closes on it
  var ld = d.getElementById('mrload');
  window.mrLoaderLeave = function (href) {
    if (!ld || reduced) { location.href = href; return; }
    try { sessionStorage.setItem('mrT', '1'); } catch (e) {}
    ld.classList.remove('done'); ld.classList.add('leave'); setTimeout(function () { location.href = href; }, 460);
  };
  if (ld) {
    var hide = function () { ld.classList.add('done'); };
    if (reduced) hide();
    else if (d.readyState === 'complete') setTimeout(hide, 450);
    else { addEventListener('load', function () { setTimeout(hide, 450); }); setTimeout(hide, 2600); }
  }
  d.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]'); if (!a || e.defaultPrevented) return;
    var h = a.getAttribute('href');
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === '_blank' || /^(#|mailto:|tel:|https?:|javascript:)/.test(h)) return;
    e.preventDefault(); mrLoaderLeave(a.href);
  });
  addEventListener('pageshow', function (e) { if (ld && e.persisted) { ld.classList.remove('leave'); ld.classList.add('done'); } });

  // links to a part of a page: glide there and stop just below the top bar, on this page or arriving from another
  var headH = function () { var t = d.getElementById('tb'); return Math.min(t ? t.offsetHeight : 0, 72) + 18; };
  window.mrGoTo = function (el, smooth) {
    if (!el) return;
    el.querySelectorAll('.rv,[data-split]').forEach(function (x) { x.classList.add('in'); });
    if (el.classList.contains('rv')) el.classList.add('in');
    var y = function () { return Math.max(0, el.getBoundingClientRect().top + scrollY - headH()); };
    if (lenis) lenis.scrollTo(y(), { immediate: !smooth, duration: 1.4, force: true }); else scrollTo({ top: y(), behavior: smooth && !reduced ? 'smooth' : 'auto' });
    // if anything above moved while travelling (images, fonts), settle on the right place
    var fix = function () { var t = y(); if (Math.abs(t - scrollY) > 3) { if (lenis) lenis.scrollTo(t, { immediate: true, force: true }); else scrollTo({ top: t, behavior: 'auto' }); } };
    setTimeout(fix, smooth && !reduced ? 1600 : 150); setTimeout(fix, smooth && !reduced ? 2300 : 600);
  };
  var byHash = function (h) { try { return h && h.length > 1 ? d.getElementById(decodeURIComponent(h.slice(1))) : null; } catch (e) { return null; } };
  d.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
    var el = byHash(a.getAttribute('href')); if (!el) return;
    e.preventDefault(); mrGoTo(el, true);
    try { history.replaceState(null, '', location.pathname + location.search + a.getAttribute('href')); } catch (err) {}
  });
  if (location.hash) {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    var arrive = function () { mrGoTo(byHash(location.hash), false); };
    if (d.readyState === 'complete') setTimeout(arrive, 0); else addEventListener('load', function () { setTimeout(arrive, 0); });
  }

  // newsletter (Netlify Forms); only says thank you when the sign-up went through
  window.mrSubscribe = function (e, f) {
    e.preventDefault(); var n = f.parentNode.querySelector('.nl-note'), b = f.querySelector('button');
    var say = function (t) { n.textContent = t; n.classList.add('show'); };
    if (location.protocol === 'file:') { say('Preview copy: sign-ups work on the live site.'); return false; }
    b.disabled = true;
    fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(new FormData(f)).toString() })
      .then(function (r) { if (!r.ok) throw 0; say('Thank you — you are on the list.'); f.reset(); })
      .catch(function () { say('Could not sign you up just now. Please write to melis@melisragusin.com.'); })
      .finally(function () { b.disabled = false; });
    return false;
  };

  // simple helpers for page scripts
  window.mrEsc = function (t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); };
  window.mrVideoExt = (function () {
    var safari = /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Android|Edg/.test(navigator.userAgent);
    return safari || !d.createElement('video').canPlayType('video/webm; codecs="vp9"') ? 'mp4' : 'webm';
  })();
})();
