/* هیرو واقع‌گرایانه: نمایش تمام‌صفحهٔ عکس‌ها/رندرها و کلیپ‌های واقعی پروژه‌ها و همایش‌ها که با اسکرول جابه‌جا می‌شوند.
   محتوا از data/hero.json می‌آید (پنل ادمین، تب «اسلایدهای هیرو»). هر اسلاید یک عکس یا یک کلیپ کوتاه بی‌صدا دارد.
   اگر عکس کوچک باشد (کمتر از ۱۵۰۰ پیکسل) تمام‌صفحه کشیده نمی‌شود و روی پس‌زمینهٔ محو خودش می‌نشیند تا تار نشود.
   اگر اینترنت کند/صرفه‌جویی داده یا «کاهش حرکت» فعال باشد، فقط اسلاید اول نشان داده می‌شود. */
(function () {
  'use strict';
  var root = document.getElementById('hero'), H = window.HERO;
  if (!root || !H || !H.slides) return;
  var slides = H.slides.filter(function (s) { return s.active !== false && (s.image || s.video); });
  if (!slides.length) { root.style.display = 'none'; return; }
  var n = slides.length, cn = navigator.connection || {}, reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var still = reduce || cn.saveData || /(^|-)2g$/.test(cn.effectiveType || '') || n < 2;
  function sm(a, b, x) { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); }
  function T() { return t(); }
  function pick(o) { return o && (o[L] || o.fa) || ''; }
  var imgSrc = function (s) { var m = innerWidth < 760 && s.imageMobile ? s.imageMobile : s.image; return img(m); };
  var vidBase = 'assets/videos';

  /* ---------- ساخت DOM (یک‌بار) ---------- */
  function build() {
    root.classList.toggle('still', still);
    root.style.height = still ? '' : (100 + (n - 1) * 80) + 'vh';
    root.innerHTML = '<div class="reel-pin"><div class="reel-slides">' + slides.map(function (s, i) {
      var media = s.video ? '<video class="rs-img" muted loop playsinline preload="' + (i < 2 ? 'auto' : 'none') + '" poster="' + imgSrc(s) + '">' + (s.videoWebm ? '<source src="' + vidBase + s.videoWebm + '" type="video/webm">' : '') + '<source src="' + vidBase + s.video + '" type="video/mp4"></video>'
        : '<img class="rs-img" alt="" ' + (i == 0 ? 'fetchpriority="high"' : 'loading="lazy"') + ' decoding="async" src="' + imgSrc(s) + '">';
      return '<figure class="rs' + (i == 0 ? ' on' : '') + '" data-i="' + i + '"><div class="rs-bg" style="background-image:url(' + imgSrc(s) + ')"></div>' + media + '</figure>';
    }).join('') + '</div><div class="reel-shade"></div><div class="reel-ui">' +
      '<div class="reel-lead"><small></small><h1></h1><p></p></div>' +
      '<div class="reel-cap"><span class="rc-n"></span><h2></h2><span class="rc-m"></span><button class="btn rc-b" data-a="proj" data-v=""></button></div>' +
      (n > 1 ? '<div class="reel-prog" role="tablist">' + slides.map(function (s, i) { return '<button role="tab" aria-label="' + (i + 1) + '" data-ri="' + i + '"><i></i></button>'; }).join('') + '</div>' : '') +
      '<div class="reel-hint"><em></em></div></div></div>';
    [].forEach.call(root.querySelectorAll('img.rs-img'), function (im) { function chk() { if (im.naturalWidth && (im.naturalWidth < 1500 || im.naturalWidth / im.naturalHeight < 1.1)) im.parentNode.classList.add('fit'); } if (im.complete) chk(); else im.addEventListener('load', chk); });
    [].forEach.call(root.querySelectorAll('video.rs-img'), function (v) { v.addEventListener('loadedmetadata', function () { if (v.videoWidth < 1100) v.parentNode.classList.add('fit'); }); });
    [].forEach.call(root.querySelectorAll('.reel-prog button'), function (b) { b.addEventListener('click', function () { var i = +b.dataset.ri, tot = root.offsetHeight - innerHeight; window.scrollTo({ top: root.offsetTop + (n > 1 ? i / (n - 1) : 0) * tot, behavior: 'smooth' }); }); });
  }

  /* ---------- متن‌ها (فارسی/انگلیسی) ---------- */
  var cur = -1;
  function text() {
    var Tt = T(), h = Tt.hero; if (!root.querySelector('.reel-lead')) return;
    root.querySelector('.reel-lead small').textContent = Tt.brand.name;
    root.querySelector('.reel-lead h1').textContent = h.teamTitle;
    root.querySelector('.reel-lead p').textContent = h.subheadline;
    root.querySelector('.reel-hint em').textContent = h.scroll;
    root.setAttribute('aria-label', Tt.brand.name);
    cur = -1; caption(Math.max(0, Math.round(pos)));
  }
  function caption(i) {
    if (i === cur) return; cur = i; var s = slides[i], cap = root.querySelector('.reel-cap'), b = cap.querySelector('.rc-b');
    cap.classList.remove('in'); void cap.offsetWidth;
    cap.querySelector('.rc-n').textContent = fa(String(i + 1).padStart(2, '0')) + ' / ' + fa(String(n).padStart(2, '0'));
    cap.querySelector('h2').textContent = pick(s.title); cap.querySelector('.rc-m').textContent = pick(s.meta);
    if (s.projectSlug) { b.style.display = ''; b.dataset.v = s.projectSlug; b.textContent = T().hero.viewProject + ' ←'; } else b.style.display = 'none';
    cap.classList.add('in');
    [].forEach.call(root.querySelectorAll('.reel-prog button'), function (x, k) { x.classList.toggle('on', k === i); });
  }

  /* ---------- اسکرول ---------- */
  var pos = 0, tgt = 0, ticking = false, vids = [];
  function progress() { var r = root.getBoundingClientRect(), tot = root.offsetHeight - innerHeight; return tot > 0 ? Math.min(1, Math.max(0, -r.top / tot)) : 0; }
  function update() {
    ticking = false; var p = still ? 0 : progress(); tgt = p * (n - 1); pos += (tgt - pos) * 0.35; if (Math.abs(tgt - pos) < 0.001) pos = tgt;
    var figs = root.querySelectorAll('.rs'), i0 = Math.floor(pos), f = pos - i0;
    [].forEach.call(figs, function (fg, k) {
      var o = k === i0 ? 1 - sm(0.55, 1, f) : (k === i0 + 1 ? sm(0.55, 1, f) : 0), tk = Math.min(1, Math.max(0, (pos - (k - 0.7)) / 1.7));
      fg.style.opacity = o.toFixed(3); fg.style.visibility = o < 0.003 ? 'hidden' : 'visible'; fg.style.zIndex = o > 0.5 ? 2 : 1;
      if (!reduce) fg.style.setProperty('--kb', tk.toFixed(3)); fg.style.setProperty('--dir', k % 2 ? -1 : 1);
    });
    var act = Math.round(pos); caption(act); var pinEl = root.querySelector('.reel-pin'); if (pinEl && figs[act]) pinEl.classList.toggle('fitcur', figs[act].classList.contains('fit'));
    var lead = root.querySelector('.reel-lead'); if (lead) lead.style.setProperty('--lo', (1 - sm(0.12, 0.5, pos)).toFixed(3));
    root.style.setProperty('--end', sm(0.93, 1, p).toFixed(3));
    vids.forEach(function (v) { var k = +v.parentNode.dataset.i; if (k === act) { if (v.paused) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); } } else if (!v.paused) v.pause(); });
    if (Math.abs(tgt - pos) > 0.001) request();
  }
  function request() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  function warm(i) { var s = slides[i]; if (s && !s.video && !s._w) { s._w = 1; var im = new Image(); im.src = imgSrc(s); } }

  build(); vids = [].slice.call(root.querySelectorAll('video')); window.REEL = { text: text }; text();
  if (!still) { addEventListener('scroll', function () { request(); warm(Math.round(pos) + 1); }, { passive: true }); addEventListener('resize', request); warm(1); update(); } else update();
  window.__reel = { set: function (p) { var tot = root.offsetHeight - innerHeight; window.scrollTo(0, root.offsetTop + p * tot); pos = p * (n - 1); update(); } };
})();
