/* هیروی «شیشهٔ دودی»: صفحه به تکه‌های ضخیم شیشه‌ای شکسته می‌شود و محتوا روی آن‌ها چاپ شده است.
   با ماوس کل بلوک کج می‌شود، تکهٔ زیر اشاره‌گر بالا می‌آید و کج می‌شود، و «اصول کار ما» تمام تکه‌ها را می‌ترکاند.
   همه‌چیز با WebGL خام و بدون کتابخانه (بدون three.js) و بدون هیچ تصویری ساخته می‌شود.
   متن‌ها: data/fa.json و data/en.json بخش glass. اگر WebGL نبود یا «کاهش حرکت» روشن بود، نسخهٔ ثابت HTML نمایش داده می‌شود. */
(function () {
  'use strict';
  var sec = document.getElementById('glass'); if (!sec) return;
  var cv = sec.querySelector('canvas'), ov = sec.querySelector('.g-ov'), defs = sec.querySelector('.g-defs');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var gl = null; try { gl = cv.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' }); } catch (e) {}
  var G = function () { return t().glass; };
  var RTL = function () { return L == 'fa'; };

  /* ================= ریاضی ================= */
  function m4() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  function mul(a, b) { var o = new Array(16); for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) { var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
  function tr(x, y, z) { var m = m4(); m[12] = x; m[13] = y; m[14] = z; return m; }
  function rotAxis(ax, ay, az, a) { var l = Math.hypot(ax, ay, az) || 1; ax /= l; ay /= l; az /= l; var c = Math.cos(a), s = Math.sin(a), k = 1 - c;
    return [c + ax * ax * k, ay * ax * k + az * s, az * ax * k - ay * s, 0, ax * ay * k - az * s, c + ay * ay * k, az * ay * k + ax * s, 0, ax * az * k + ay * s, ay * az * k - ax * s, c + az * az * k, 0, 0, 0, 0, 1]; }
  function persp(fy, a, n, f) { var t_ = 1 / Math.tan(fy / 2), r = 1 / (n - f); return [t_ / a, 0, 0, 0, 0, t_, 0, 0, 0, 0, (f + n) * r, -1, 0, 0, 2 * f * n * r, 0]; }
  function apply(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }
  function invRT(m) { /* وارون تبدیل صلب (چرخش + انتقال) */ var r = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1], t_ = [m[12], m[13], m[14]]; var o = r.slice(); o[12] = -(r[0] * t_[0] + r[4] * t_[1] + r[8] * t_[2]); o[13] = -(r[1] * t_[0] + r[5] * t_[1] + r[9] * t_[2]); o[14] = -(r[2] * t_[0] + r[6] * t_[1] + r[10] * t_[2]); return o; }
  function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
  function eInCubic(x) { return x * x * x; }
  function eOutBack(x) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
  var seed = 11; function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

  /* همسانی (homography) برای چسباندن لایهٔ متن DOM روی بلوک کج‌شده */
  function homography(src, dst) {
    var A = [], b = [], i;
    for (i = 0; i < 4; i++) { var x = src[i][0], y = src[i][1], X = dst[i][0], Y = dst[i][1];
      A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]); b.push(X); A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]); b.push(Y); }
    for (i = 0; i < 8; i++) { var p = i; for (var r = i + 1; r < 8; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r; var tmp = A[i]; A[i] = A[p]; A[p] = tmp; var tb = b[i]; b[i] = b[p]; b[p] = tb;
      for (r = i + 1; r < 8; r++) { var f = A[r][i] / A[i][i]; for (var c = i; c < 8; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; } }
    var h = new Array(8); for (i = 7; i >= 0; i--) { var s = b[i]; for (var c2 = i + 1; c2 < 8; c2++) s -= A[i][c2] * h[c2]; h[i] = s / A[i][i]; }
    return [h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, 1];
  }

  /* ================= هندسه: چندضلعی گرد + اکسترود با پخ ================= */
  function norm2(x, y) { var l = Math.hypot(x, y) || 1; return [x / l, y / l]; }
  function area(p) { var s = 0; for (var i = 0; i < p.length; i++) { var a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function ccw(p) { return area(p) < 0 ? p.slice().reverse() : p; }
  function inset(p, d) { /* p پادساعتگرد؛ d>0 یعنی به داخل */
    var n = p.length, o = [];
    for (var i = 0; i < n; i++) { var a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n], e1 = norm2(b[0] - a[0], b[1] - a[1]), e2 = norm2(c[0] - b[0], c[1] - b[1]),
      n1 = [-e1[1], e1[0]], n2 = [-e2[1], e2[0]], bx = n1[0] + n2[0], by = n1[1] + n2[1], dn = 1 + n1[0] * n2[0] + n1[1] * n2[1]; if (dn < 0.25) dn = 0.25;
      o.push([b[0] + bx / dn * d, b[1] + by / dn * d]); }
    return o;
  }
  function roundPoly(p, r, seg) {
    var n = p.length, out = [];
    for (var i = 0; i < n; i++) {
      var p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], v1 = norm2(p0[0] - p1[0], p0[1] - p1[1]), v2 = norm2(p2[0] - p1[0], p2[1] - p1[1]);
      var dt = clamp(v1[0] * v2[0] + v1[1] * v2[1], -1, 1), ang = Math.acos(dt);
      if (ang > 3.1) { out.push(p1); continue; }
      var l1 = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]), l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), tt = Math.min(r / Math.tan(ang / 2), 0.45 * Math.min(l1, l2)), rr = tt * Math.tan(ang / 2);
      var a = [p1[0] + v1[0] * tt, p1[1] + v1[1] * tt], b = [p1[0] + v2[0] * tt, p1[1] + v2[1] * tt], bis = norm2(v1[0] + v2[0], v1[1] + v2[1]), cd = rr / Math.sin(ang / 2), c = [p1[0] + bis[0] * cd, p1[1] + bis[1] * cd];
      var a0 = Math.atan2(a[1] - c[1], a[0] - c[0]), a1 = Math.atan2(b[1] - c[1], b[0] - c[0]), da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      for (var k = 0; k <= seg; k++) { var t_ = a0 + da * k / seg; out.push([c[0] + Math.cos(t_) * rr, c[1] + Math.sin(t_) * rr]); }
    }
    return out;
  }
  function triangulate(p) { /* ear clipping، p پادساعتگرد */
    var idx = [], n = p.length, i, V = []; for (i = 0; i < n; i++) V.push(i); var guard = 0;
    function inTri(a, b, c, q) { var d1 = (q[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (q[1] - b[1]), d2 = (q[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (q[1] - c[1]), d3 = (q[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (q[1] - a[1]); return !(((d1 < 0) || (d2 < 0) || (d3 < 0)) && ((d1 > 0) || (d2 > 0) || (d3 > 0))); }
    while (V.length > 3 && guard++ < 5000) {
      var found = false;
      for (i = 0; i < V.length; i++) {
        var a = p[V[(i + V.length - 1) % V.length]], b = p[V[i]], c = p[V[(i + 1) % V.length]];
        if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 1e-9) continue;
        var ok = true; for (var j = 0; j < V.length; j++) { var q = V[j]; if (q === V[(i + V.length - 1) % V.length] || q === V[i] || q === V[(i + 1) % V.length]) continue; if (inTri(a, b, c, p[q])) { ok = false; break; } }
        if (ok) { idx.push(V[(i + V.length - 1) % V.length], V[i], V[(i + 1) % V.length]); V.splice(i, 1); found = true; break; }
      }
      if (!found) break;
    }
    if (V.length === 3) idx.push(V[0], V[1], V[2]);
    return idx;
  }
  /* اکسترود: [pos3, normal3, uv2, top1] برای هر رأس. uv = موقعیت روی بلوک (برای نقش متن) */
  function extrude(outline, D, bv, bw_, bh_, wantBottom) {
    var o = ccw(outline), n = o.length, rings = [], seg = 3, k, i;
    for (k = 0; k <= seg; k++) { var th = k / seg * Math.PI / 2; rings.push({ ins: bv * (1 - Math.sin(th)), z: D / 2 - bv * (1 - Math.cos(th)), s: Math.sin(th), c: Math.cos(th) }); }
    var bot = []; for (k = seg; k >= 0; k--) { var th2 = k / seg * Math.PI / 2; bot.push({ ins: bv * (1 - Math.sin(th2)), z: -D / 2 + bv * (1 - Math.cos(th2)), s: Math.sin(th2), c: -Math.cos(th2) }); }
    var all = rings.concat(bot), v = [], ix = [], base;
    var outN = []; for (i = 0; i < n; i++) { var a = o[(i - 1 + n) % n], b = o[i], c2 = o[(i + 1) % n], e1 = norm2(b[0] - a[0], b[1] - a[1]), e2 = norm2(c2[0] - b[0], c2[1] - b[1]); outN.push(norm2(e1[1] + e2[1], -(e1[0] + e2[0]))); }
    var ringPts = all.map(function (r) { return inset(o, r.ins); });
    function push(p, z, nx, ny, nz, top) { v.push(p[0], p[1], z, nx, ny, nz, (p[0] + bw_ / 2) / bw_, (bh_ / 2 - p[1]) / bh_, top); }
    for (var r = 0; r < all.length; r++) { var R = all[r]; for (i = 0; i < n; i++) { var P = ringPts[r][i], nn = outN[i]; push(P, R.z, nn[0] * R.s, nn[1] * R.s, R.c, 0); } }
    for (r = 0; r < all.length - 1; r++) for (i = 0; i < n; i++) { var j2 = (i + 1) % n, a1 = r * n + i, b1 = r * n + j2, a2 = (r + 1) * n + i, b2 = (r + 1) * n + j2; ix.push(a1, b1, b2, a1, b2, a2); }
    var tri = triangulate(ringPts[0]); base = v.length / 9;
    for (i = 0; i < n; i++) push(ringPts[0][i], D / 2, 0, 0, 1, 1);
    for (i = 0; i < tri.length; i += 3) ix.push(base + tri[i], base + tri[i + 1], base + tri[i + 2]);
    if (wantBottom) { var base2 = v.length / 9, lb = ringPts[ringPts.length - 1]; for (i = 0; i < n; i++) push(lb[i], -D / 2, 0, 0, -1, 0); for (i = 0; i < tri.length; i += 3) ix.push(base2 + tri[i], base2 + tri[i + 2], base2 + tri[i + 1]); }
    return { v: new Float32Array(v), i: new Uint16Array(ix) };
  }

  /* ================= طرح برش ================= */
  function pattern(portrait, mirror) {
    var P;
    if (!portrait) P = { TL: [0, 0], TR: [1, 0], BL: [0, 1], BR: [1, 1], tAB: [.22, 0], tBC: [.515, 0], tCE: [.84, 0], bAD: [.34, 1], bDE: [.865, 1], J0: [.385, .72], J1: [.48, .62], J2: [.716, .49] };
    else P = { TL: [0, 0], TR: [1, 0], BL: [0, 1], BR: [1, 1], lAB: [0, .52], rAC: [1, .5], lBD: [0, .78], rCE: [1, .76], bDE: [.5, 1], J0: [.58, .585], J1: [.50, .70], J2: [.66, .80] };
    return P;
  }
  function cellsOf(P, portrait) {
    return portrait ? { A: ['TL', 'TR', 'rAC', 'J0', 'lAB'], B: ['lAB', 'J0', 'J1', 'lBD'], C: ['J0', 'rAC', 'rCE', 'J2', 'J1'], D: ['lBD', 'J1', 'J2', 'bDE', 'BL'], E: ['J2', 'rCE', 'BR', 'bDE'] }
      : { A: ['TL', 'tAB', 'J0', 'bAD', 'BL'], B: ['tAB', 'tBC', 'J1', 'J0'], C: ['tBC', 'tCE', 'J2', 'J1'], D: ['J0', 'J1', 'J2', 'bDE', 'bAD'], E: ['tCE', 'TR', 'BR', 'bDE', 'J2'] };
  }

  /* ================= وضعیت ================= */
  var W = 0, H = 0, L_ = {}, S_ = 1, dpr = 1, items = [], pieces = {}, order = ['nav', 'A', 'B', 'C', 'D', 'E'], mode = 'in', modeT = 0, tmr = 0, hoverKey = null, hoverBtn = null, ptr = { x: 0, y: 0, in: false, ax: 0, ay: 0, glow: 0 }, tilt = { x: 0, y: 0 }, pageDirty = true, tex = null, texCv = null, running = false, last = 0, P0 = null, drift = {}, camZ = 1000;
  var portrait = false;

  function layout() {
    W = sec.clientWidth; H = sec.clientHeight; var mobile = W < 760; portrait = W < H * 0.9 || mobile && H > W;
    var mxm = mobile ? 14 : W * 0.055, myT = Math.max(H * 0.085, mobile ? 64 : 70), myB = mobile ? 16 : H * 0.085;
    L_.bw = W - 2 * mxm; L_.bh = H - myT - myB; L_.bx = mxm; L_.by = myT; S_ = mobile ? L_.bw / 760 : L_.bw / 1730;
    L_.gap = Math.max(8, 14 * S_); L_.navH = Math.max(46, L_.bh * (mobile ? 0.085 : 0.108)); L_.pw = L_.bw; L_.ph = L_.bh - L_.navH - L_.gap; L_.cy = H / 2 - (L_.by + L_.bh / 2);
    camZ = (H / 2) / Math.tan(15 * Math.PI / 180);
    dpr = Math.min(window.devicePixelRatio || 1, 2); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; gl.viewport(0, 0, cv.width, cv.height);
    P0 = pattern(portrait); items = []; buildItems(); buildOverlay(); pageDirty = true;
  }

  /* ---------- محتوای چاپ‌شده: یک لیست که هم روی بوم کشیده می‌شود و هم لایهٔ DOM از آن ساخته می‌شود ---------- */
  function buildItems() {
    var g = G(), rtl = RTL(), bw = L_.bw, bh = L_.bh, ph = L_.ph, pw = L_.pw, S = S_, mob = W < 760, it = items, pt = L_.navH + L_.gap, fs = function (v) { return Math.max(v.min || 0, v.k * S); };
    var edge = (mob ? 22 : pw * 0.052), X0 = rtl ? bw - edge : edge, al = rtl ? 'right' : 'left';
    var navY = L_.navH / 2, navFs = Math.max(13, 24 * S * (mob ? 1.2 : 1));
    /* نوار بالا */
    it.push({ k: 'mark', x: rtl ? bw - 22 * S - Math.max(18, 30 * S) : 22 * S, y: navY - Math.max(9, 15 * S), w: Math.max(18, 30 * S) });
    it.push({ k: 'text', t: 'ISB', x: rtl ? bw - 22 * S - Math.max(18, 30 * S) - 12 * S : 22 * S + Math.max(18, 30 * S) + 12 * S, y: navY, f: navFs * 1.15, wt: 700, c: 'rgba(255,255,255,.92)', al: rtl ? 'right' : 'left', ltr: true });
    var lx = rtl ? bw * 0.28 : bw * 0.30; var gapx = Math.max(24, 54 * S * (mob ? 1.4 : 1));
    if (!mob) { var cur = rtl ? bw * 0.64 : bw * 0.34; g.nav.forEach(function (n, i) { var tw = measure(n[1], navFs, 500); it.push({ k: 'link', act: 'go:' + n[0], t: n[1], x: cur, y: navY, f: navFs, wt: 500, c: 'rgba(255,255,255,.6)', hc: 'rgba(255,255,255,.95)', al: rtl ? 'right' : 'left' }); cur += (rtl ? -1 : 1) * (tw + gapx); }); }
    it.push({ k: 'link', act: 'go:contact', t: g.navCta, x: rtl ? 22 * S + measure(g.navCta, navFs, 500) : bw - 22 * S - measure(g.navCta, navFs, 500) + 0, y: navY, f: navFs, wt: 500, c: 'rgba(255,255,255,.75)', hc: '#fff', al: rtl ? 'right' : 'left', navCta: true });
    /* پنل */
    var by0 = pt, hs = mob ? Math.min(pw * 0.1, ph * 0.075) : Math.min(pw * 0.078, ph * 0.2), eb = mob ? 12 : Math.max(13, 11 * S * 1.5);
    it.push({ k: 'text', t: g.eyebrow, x: X0, y: by0 + ph * (mob ? 0.045 : 0.135), f: eb, wt: 500, c: 'rgba(255,255,255,.4)', al: al, track: rtl ? 0 : 0.2 });
    var hy = by0 + ph * (mob ? 0.11 : 0.27); g.h1.forEach(function (ln, i) { it.push({ k: 'text', t: ln, x: X0, y: hy + i * hs * 1.12, f: hs, wt: 800, c: 'grad', al: al, head: true }); });
    var sy = hy + g.h1.length * hs * 1.12 + hs * (mob ? 0.2 : 0.28), sf = mob ? 14 : Math.max(14, 21 * S * 1.1); g.sub.forEach(function (ln, i) { it.push({ k: 'text', t: ln, x: X0, y: sy + i * sf * 1.7, f: sf, wt: 400, c: 'rgba(255,255,255,.58)', al: al }); });
    var by = sy + g.sub.length * sf * 1.7 + (mob ? 20 : 34 * S * 1.2 + 14), bwid = Math.max(mob ? 124 : 116 * S * 1.35, measure(g.cta, sf * 1.02, 500) + 36), bhei = Math.max(40, 40 * S * 1.3);
    it.push({ k: 'pill', act: 'go:team', t: g.cta, x: rtl ? X0 - bwid : X0, y: by, w: bwid, h: bhei, f: sf * 1.02 });
    var lkw = measure(g.link, sf * 1.02, 500); it.push({ k: 'link', act: 'shatter', t: g.link, x: rtl ? X0 - bwid - 28 - 0 : X0 + bwid + 28, y: by + bhei / 2, f: sf * 1.02, wt: 500, c: 'rgba(255,255,255,.78)', hc: '#fff', al: rtl ? 'right' : 'left', ul: true });
    var ff = Math.max(10, 11 * S * 1.3);
    it.push({ k: 'text', t: g.footL, x: rtl ? bw - edge : edge, y: by0 + ph - Math.max(14, ph * 0.055), f: ff, wt: 400, c: 'rgba(255,255,255,.34)', al: rtl ? 'right' : 'left', ltr: true });
    it.push({ k: 'text', t: g.footR, x: rtl ? edge : bw - edge, y: by0 + ph - Math.max(14, ph * 0.055), f: ff, wt: 400, c: 'rgba(255,255,255,.34)', al: rtl ? 'left' : 'right' });
  }
  var mctx = document.createElement('canvas').getContext('2d');
  function fam() { return 'Kalameh,"Segoe UI",Tahoma,sans-serif'; }
  function measure(s, f, wt) { mctx.font = wt + ' ' + f + 'px ' + fam(); return mctx.measureText(s).width; }

  function drawPage() {
    if (!texCv) texCv = document.createElement('canvas');
    var d = Math.min(dpr, 1.75), w = Math.round(L_.bw * d), h = Math.round(L_.bh * d); if (texCv.width !== w) texCv.width = w; if (texCv.height !== h) texCv.height = h;
    var c = texCv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, L_.bw, L_.bh); c.textBaseline = 'middle';
    items.forEach(function (it) {
      if (it.k === 'mark') { c.fillStyle = 'rgba(255,255,255,.92)'; c.beginPath(); roundRect(c, it.x, it.y, it.w, it.w, 5); c.fill(); c.fillStyle = '#15151a'; c.beginPath(); roundRect(c, it.x + it.w * 0.3, it.y + it.w * 0.3, it.w * 0.4, it.w * 0.4, 2); c.fill(); return; }
      if (it.k === 'pill') { var hov = hoverBtn === it.act; c.fillStyle = hov ? '#36d67e' : 'rgba(245,245,247,.95)'; c.beginPath(); roundRect(c, it.x, it.y, it.w, it.h, 6); c.fill(); c.fillStyle = '#0c0c0f'; c.font = '600 ' + it.f + 'px ' + fam(); c.textAlign = 'center'; c.direction = RTL() ? 'rtl' : 'ltr'; c.fillText(it.t, it.x + it.w / 2, it.y + it.h / 2 + 1); return; }
      c.font = it.wt + ' ' + it.f + 'px ' + fam(); c.textAlign = it.al; c.direction = it.ltr ? 'ltr' : (RTL() ? 'rtl' : 'ltr');
      if (it.c === 'grad') { var gr = c.createLinearGradient(0, it.y - it.f * 0.6, 0, it.y + it.f * 0.6); gr.addColorStop(0, '#e2e2e6'); gr.addColorStop(1, '#b9b9c0'); c.fillStyle = gr; } else c.fillStyle = (it.k === 'link' && hoverBtn === it.act) ? (it.hc || it.c) : it.c;
      if (it.track && 'letterSpacing' in c) c.letterSpacing = (it.track * it.f) + 'px'; else if ('letterSpacing' in c) c.letterSpacing = it.head ? (-0.03 * it.f) + 'px' : '0px';
      c.fillText(it.t, it.x, it.y);
      if (it.ul && hoverBtn === it.act) { var tw = c.measureText(it.t).width, x0 = it.al === 'right' ? it.x - tw : it.x; c.fillRect(x0, it.y + it.f * 0.62, tw, 1.2); }
    });
    gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texCv);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    pageDirty = false;
  }
  function roundRect(c, x, y, w, h, r) { c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  /* ---------- لایهٔ DOM (متن قابل انتخاب و دکمه‌های واقعی) ---------- */
  function buildOverlay() {
    ov.innerHTML = ''; ov.style.width = L_.bw + 'px'; ov.style.height = L_.bh + 'px';
    items.forEach(function (it) {
      if (it.k === 'mark') return; var el = document.createElement(it.act ? 'a' : 'span'); el.textContent = it.t; el.className = 'g-t';
      if (it.act) { el.href = '#'; el.dataset.act = it.act; el.setAttribute('role', 'button'); }
      var w = it.k === 'pill' ? it.w : measure(it.t, it.f, it.wt || 500) + 4, h = it.k === 'pill' ? it.h : it.f * 1.5, x = it.x, y = it.k === 'pill' ? it.y : it.y - h / 2;
      if (it.k !== 'pill') { x = it.al === 'right' ? it.x - w : it.x; }
      el.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px;font:' + (it.wt || 500) + ' ' + it.f + 'px/' + h + 'px ' + fam() + ';text-align:' + (it.k === 'pill' ? 'center' : it.al) + ';direction:' + (it.ltr ? 'ltr' : (RTL() ? 'rtl' : 'ltr'));
      ov.appendChild(el);
    });
  }

  /* ================= WebGL ================= */
  var prog, loc = {}, bufs = {};
  var VS = 'attribute vec3 aP,aN;attribute vec3 aU;uniform mat4 uP,uV,uM;uniform mat3 uNm;varying vec3 vN,vW;varying vec3 vU;void main(){vec4 w=uM*vec4(aP,1.);vW=w.xyz;vN=uNm*aN;vU=aU;gl_Position=uP*uV*w;}';
  var FS = 'precision highp float;varying vec3 vN,vW,vU;uniform vec3 uCam;uniform vec2 uPtr;uniform float uGlow,uHov,uIri,uPlain;uniform sampler2D uTex;' +
    'vec3 env(vec3 d){vec3 c=vec3(.045,.05,.065);c+=vec3(.82,.9,1.)*pow(max(dot(d,normalize(vec3(-.55,.62,.56))),0.),18.)*1.25;c+=vec3(.7,.78,.95)*smoothstep(.45,.95,d.y)*.4;c+=vec3(.3,.34,.5)*pow(max(dot(d,normalize(vec3(.8,.05,.6))),0.),8.)*.35;c+=vec3(.15,.16,.2)*smoothstep(.5,-.2,abs(d.y-.05))*.35;return c;}' +
    'void main(){vec3 N=normalize(vN);vec3 V=normalize(uCam-vW);float ndv=clamp(dot(N,V),0.,1.);float fr=pow(1.-ndv,3.);vec3 R=reflect(-V,N);' +
    'float eI=.42*(1.+uHov*3.5);vec3 base=vec3(.082,.082,.098);float sh=.5+.5*N.y;' +
    'vec3 col=base*(.7+.5*sh);col+=env(R)*(.30+.9*fr)*eI*1.55;col+=env(R)*(.10+.55*pow(1.-ndv,4.))*.9;' +
    'float ph=6.2832*(ndv*1.15+.15);vec3 ir=.5+.5*cos(ph+vec3(0.,2.1,4.2));ir=mix(vec3(.25,1.,.62),vec3(.68,.42,1.),.5+.5*sin(ph*1.3));col+=ir*(.06+.9*fr)*uIri*.55;' +
    'float d=length(vW.xy-uPtr);col+=vec3(.42,.37,.62)*.2*exp(-1.6*pow(d/300.,2.))*uGlow;' +
    'if(vU.z>.5){vec4 tx=texture2D(uTex,vU.xy);col=col*(1.-tx.a)+tx.rgb*tx.a;}' +
    'float sheen=smoothstep(-.2,.92,dot(R,normalize(vec3(-.45,.65,.6))));col+=vec3(.55,.62,.8)*sheen*.09*(1.+uHov*2.2);col*=1.+.14*clamp(vW.y/450.,-1.,1.);col+=pow(1.-ndv,5.)*.5*(1.+uHov*1.4)*vec3(.82,.84,1.);gl_FragColor=vec4(pow(col,vec3(.92)),1.);}';
  function sh(ty, s) { var o = gl.createShader(ty); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(o)); return null; } return o; }
  function initGL() {
    var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS); if (!vs || !fs) return false;
    prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false; gl.useProgram(prog);
    ['aP', 'aN', 'aU'].forEach(function (n) { loc[n] = gl.getAttribLocation(prog, n); });
    ['uP', 'uV', 'uM', 'uNm', 'uCam', 'uPtr', 'uGlow', 'uHov', 'uIri', 'uTex', 'uPlain'].forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n); });
    tex = gl.createTexture(); gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.clearColor(0, 0, 0, 0); return true;
  }
  function upload(key, g) {
    var b = bufs[key]; if (!b) b = bufs[key] = { vb: gl.createBuffer(), ib: gl.createBuffer(), n: 0 };
    gl.bindBuffer(gl.ARRAY_BUFFER, b.vb); gl.bufferData(gl.ARRAY_BUFFER, g.v, gl.DYNAMIC_DRAW); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.i, gl.DYNAMIC_DRAW); b.n = g.i.length;
  }

  /* ================= تکه‌ها ================= */
  function Piece(key) { this.key = key; this.lift = 0; this.vl = 0; this.tx = 0; this.vtx = 0; this.ty = 0; this.vty = 0; this.hov = 0; this.cx = 0; this.cy = 0; this.poly = null; this.fly = { dir: [0, 0], z: 0, ax: [0, 0, 1], rot: 0, delay: 0 }; }
  function mkPieces() { order.forEach(function (k) { pieces[k] = pieces[k] || new Piece(k); }); pieces.back = pieces.back || new Piece('back'); }
  function randFly() { order.forEach(function (k, i) { var p = pieces[k]; p.fly = { dx: (rnd() - 0.5) * 1.0, dy: rnd(), z: 420 + rnd() * 380, ax: [rnd() - .5, rnd() - .5, rnd() - .5 + .2], rot: 2 + rnd() * 1.6, delay: i * 0.04 }; }); }

  function panelPt(P, name, tm) {
    var p = P[name], x = p[0], y = p[1], dr = drift[name]; if (dr) { x += Math.sin(tm / dr.px + dr.a) * dr.ax; y += Math.sin(tm / dr.py + dr.b) * dr.ay; }
    if (ptr.in && ptr.fade > 0 && name !== 'TL' && name !== 'TR' && name !== 'BL' && name !== 'BR') { var dx = x - ptr.nx, dy = y - ptr.ny, d = Math.hypot(dx * (L_.pw / L_.ph), dy); if (d < .6 && d > 1e-4) { var f = (1 - d / .6) * .05 * ptr.fade, ux = dx * (L_.pw / L_.ph), uy = dy, ul = Math.hypot(ux, uy); x += (ux / ul) * f / (L_.pw / L_.ph); y += (uy / ul) * f; } }
    var edgeX = (name === 'tAB' || name === 'tBC' || name === 'tCE' || name === 'bAD' || name === 'bDE'), edgeY = (name === 'lAB' || name === 'rAC' || name === 'lBD' || name === 'rCE'); if (edgeX) y = p[1]; if (edgeY) x = p[0]; if (name === 'bDE' && portrait) y = 1;
    return [x, y];
  }
  function initDrift() { drift = {}; ['tAB', 'tBC', 'tCE', 'bAD', 'bDE', 'lAB', 'rAC', 'lBD', 'rCE', 'J0', 'J1', 'J2'].forEach(function (n) { drift[n] = { px: 1700 + rnd() * 1800, py: 1900 + rnd() * 1900, a: rnd() * 6.3, b: rnd() * 6.3, ax: (/^J/.test(n) ? .03 : .03) * (portrait ? .7 : 1), ay: /^J/.test(n) ? .05 : (/^[lr]/.test(n) ? .03 : 0) }; }); }

  function buildCells(tm) {
    var P = P0, C = cellsOf(P, portrait), rtl = RTL(), pw = L_.pw, ph = L_.ph, ox = 0, oy = L_.navH + L_.gap, D = Math.max(6, 13 * S_ * (W < 760 ? 1.4 : 1)), bv = Math.max(1.6, 2.6 * S_ * (W < 760 ? 1.4 : 1)), R = Math.max(8, 20 * S_ * (W < 760 ? 1.2 : 1)), gap = L_.gap;
    Object.keys(C).forEach(function (k) {
      var pts = C[k].map(function (n) { var q = panelPt(P, n, tm); var x = (!portrait && rtl) ? 1 - q[0] : q[0]; return [ox + x * pw, oy + q[1] * ph]; });
      var poly = pts.map(function (p) { return [p[0] - L_.bw / 2, L_.bh / 2 - p[1]]; }); poly = ccw(poly); var piece = pieces[k]; piece.poly = poly.slice();
      var cx = 0, cy = 0; poly.forEach(function (p) { cx += p[0]; cy += p[1]; }); piece.cx = cx / poly.length; piece.cy = cy / poly.length;
      var o = roundPoly(inset(poly, gap / 2), R, 5); upload(k, extrude(o, D, bv, L_.bw, L_.bh, true));
    });
    var nr = [[-L_.bw / 2, L_.bh / 2], [L_.bw / 2, L_.bh / 2], [L_.bw / 2, L_.bh / 2 - L_.navH], [-L_.bw / 2, L_.bh / 2 - L_.navH]]; nr = ccw(nr); pieces.nav.poly = nr; pieces.nav.cx = 0; pieces.nav.cy = L_.bh / 2 - L_.navH / 2;
    upload('nav', extrude(roundPoly(inset(nr, gap / 2 * 0 + 0), R, 5), D, bv, L_.bw, L_.bh, true));
    pieces.D_ = D; pieces.bv_ = bv;
  }
  function buildBack() {
    var k = W / 1918, mir = RTL() && !portrait, bf = [[.147, .243], [.252, .169], [.287, .277], [.151, .258]], pts = bf.map(function (p) { return [(mir ? 1 - p[0] : p[0]) * W - W / 2, H / 2 - p[1] * H]; });
    var o = roundPoly(ccw(pts), 9 * k, 4); upload('back', extrude(o, Math.max(4, 11 * k), Math.max(1.4, 2.4 * k), W, H, true)); var cx = 0, cy = 0; pts.forEach(function (p) { cx += p[0]; cy += p[1]; }); pieces.back.cx = cx / 4; pieces.back.cy = cy / 4; pieces.back.poly = ccw(pts);
  }

  /* ================= رندر ================= */
  var Pm = null, Vm = null;
  function blockM() { var rx = (-tilt.y * 5.5 + .8) * Math.PI / 180, ry = (tilt.x * 7 - 1.2) * Math.PI / 180; return mul(tr(0, L_.cy, 0), mul(rotAxis(1, 0, 0, rx), rotAxis(0, 1, 0, ry))); }
  function pieceM(p, bm, s) {
    var m = m4(); var a = tr(p.cx, p.cy, 0), b = tr(-p.cx, -p.cy, 0);
    var local = mul(a, mul(tr(0, 0, p.lift), mul(rotAxis(1, 0, 0, p.tx), mul(rotAxis(0, 1, 0, p.ty), b))));
    if (s > 0.0001) { var f = p.fly, d = norm2(p.cx + f.dx * L_.bw * .3, p.cy + (.2 - f.dy * .6) * L_.bh); var out = tr(d[0] * W * .75 * s, d[1] * H * .5 * s - H * .55 * s * s, f.z * s * (W / 1440)); local = mul(out, mul(mul(a, rotAxis(f.ax[0], f.ax[1], f.ax[2], f.rot * s)), mul(b, local))); }
    return mul(bm, local);
  }
  function draw(p, key, M, iri, hov) {
    var b = bufs[key]; if (!b || !b.n) return; gl.bindBuffer(gl.ARRAY_BUFFER, b.vb); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.ib);
    gl.enableVertexAttribArray(loc.aP); gl.vertexAttribPointer(loc.aP, 3, gl.FLOAT, false, 36, 0); gl.enableVertexAttribArray(loc.aN); gl.vertexAttribPointer(loc.aN, 3, gl.FLOAT, false, 36, 12); gl.enableVertexAttribArray(loc.aU); gl.vertexAttribPointer(loc.aU, 3, gl.FLOAT, false, 36, 24);
    gl.uniformMatrix4fv(loc.uM, false, new Float32Array(M)); gl.uniformMatrix3fv(loc.uNm, false, new Float32Array([M[0], M[1], M[2], M[4], M[5], M[6], M[8], M[9], M[10]]));
    gl.uniform1f(loc.uIri, iri); gl.uniform1f(loc.uHov, hov); gl.drawElements(gl.TRIANGLES, b.n, gl.UNSIGNED_SHORT, 0);
  }
  function flyAmount(p, i) { /* s: 0 سرجای خود، 1 پراکنده */
    if (mode === 'out') { var u = clamp((modeT - p.fly.delay) / 0.72, 0, 1); return eInCubic(u); }
    if (mode === 'back' || mode === 'in') { var u2 = clamp((modeT - (mode === 'in' ? 0.05 : 0) - p.fly.delay * 0.75) / 0.72, 0, 1); return 1 - eOutBack(u2); }
    return mode === 'defs' ? 1 : 0;
  }
  function render(dt, tm) {
    if (pageDirty) drawPage(); if (tm - lastBuild > 20 || !builtOnce || mode !== 'assembled') { buildCells(tm); lastBuild = tm; builtOnce = true; }
    gl.viewport(0, 0, cv.width, cv.height); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    Pm = persp(30 * Math.PI / 180, W / H, 10, 6000); Vm = tr(0, 0, -camZ);
    gl.uniformMatrix4fv(loc.uP, false, new Float32Array(Pm)); gl.uniformMatrix4fv(loc.uV, false, new Float32Array(Vm)); gl.uniform3f(loc.uCam, 0, 0, camZ);
    gl.uniform2f(loc.uPtr, ptr.ax, ptr.ay); gl.uniform1f(loc.uGlow, ptr.glow); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(loc.uTex, 0);
    var bm = blockM(); curBM = bm;
    order.forEach(function (k, i) { var p = pieces[k], s = flyAmount(p, i); draw(p, k, pieceM(p, bm, s), .55 + .45 * p.hov, p.hov); });
    if (backS > 0.003) { var bp = pieces.back, k = W / 1918, wob = (Math.sin(tm / 1000 * 6.28 * 1.0) * .035) * backS; var M = mul(mul(tr(0, 0, 0), mul(tr(bp.cx, bp.cy, 0), mul(rotAxis(0, 1, 0, (RTL() && !portrait ? .16 : -.16) + bp.ty), mul(rotAxis(1, 0, 0, .08 + bp.tx + wob), mul(rotAxis(0, 0, 1, 0), tr(-bp.cx, -bp.cy, 0)))))), m4()); var sc = backS; var S3 = [sc, 0, 0, 0, 0, sc, 0, 0, 0, 0, sc, 0, bp.cx * (1 - sc), bp.cy * (1 - sc), 0, 1]; draw(bp, 'back', mul(S3, M), .35 + .5 * bp.hov, bp.hov); }
    if (ptr.glow) { /* درخشش در سایه‌زن اعمال می‌شود */ }
  }
  var curBM = m4(), backS = 0, lastBuild = 0, builtOnce = false;

  /* ================= تعامل ================= */
  function pick(clientX, clientY) {
    var r = sec.getBoundingClientRect(), px = clientX - r.left, py = clientY - r.top; ptr.x = px; ptr.y = py; ptr.ax = px - W / 2; ptr.ay = H / 2 - py;
    var rel = [(px - W / 2) / (1), (H / 2 - py) / 1]; var ro = [0, 0, camZ], rd = norm3([ptr.ax, ptr.ay, -camZ]); var inv = invRT(curBM), o2 = apply(inv, ro), d2 = [inv[0] * rd[0] + inv[4] * rd[1] + inv[8] * rd[2], inv[1] * rd[0] + inv[5] * rd[1] + inv[9] * rd[2], inv[2] * rd[0] + inv[6] * rd[1] + inv[10] * rd[2]];
    if (Math.abs(d2[2]) < 1e-6) return null; var tt = -o2[2] / d2[2], x = o2[0] + d2[0] * tt, y = o2[1] + d2[1] * tt; ptr.lx = x; ptr.ly = y; ptr.nx = ((x + L_.bw / 2) / L_.pw); ptr.ny = ((L_.bh / 2 - y) - (L_.navH + L_.gap)) / L_.ph; if (!portrait && RTL()) ptr.nx = 1 - ptr.nx;
    if (mode !== 'assembled') return null;
    var found = null; order.forEach(function (k) { var p = pieces[k]; if (p.poly && inPoly(p.poly, x, y)) found = k; }); return found;
  }
  function norm3(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function inPoly(poly, x, y) { var c = false; for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) { if (((poly[i][1] > y) !== (poly[j][1] > y)) && (x < (poly[j][0] - poly[i][0]) * (y - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0])) c = !c; } return c; }
  function onMove(e) {
    ptr.in = true; var k = pick(e.clientX, e.clientY); if (mode === 'assembled') { hoverKey = k; }
    var r = sec.getBoundingClientRect(); tilt.tx = ((e.clientX - r.left) / W - .5) * 2; tilt.ty = ((e.clientY - r.top) / H - .5) * 2;
    if (mode === 'defs') { var bp = pieces.back; var inv = invRT(curBM); hoverKey = (bp.poly && inPoly(bp.poly, ptr.ax, ptr.ay)) ? 'back' : null; }
    var hb = null; var tg = e.target && e.target.closest && e.target.closest('[data-act]'); if (tg) hb = tg.dataset.act; if (hb !== hoverBtn) { hoverBtn = hb; pageDirty = true; sec.style.cursor = hb ? 'pointer' : ''; } kick();
  }
  function onLeave() { ptr.in = false; hoverKey = null; tilt.tx = 0; tilt.ty = 0; if (hoverBtn) { hoverBtn = null; pageDirty = true; } kick(); }
  tilt.tx = 0; tilt.ty = 0; ptr.fade = 0; ptr.nx = .5; ptr.ny = .5;
  function onClick(e) {
    var tg = e.target && e.target.closest && e.target.closest('[data-act]');
    if (tg) { e.preventDefault(); act(tg.dataset.act); return; }
    if (mode === 'defs') { var bp = pieces.back; if (bp.poly && inPoly(bp.poly, ptr.ax, ptr.ay)) act('back'); }
  }
  function act(a) {
    if (a === 'shatter') { if (mode !== 'assembled') return; mode = 'out'; modeT = 0; hoverKey = null; randFly(); ov.style.pointerEvents = 'none'; clearTimeout(tmr); tmr = setTimeout(function () { defs.classList.add('on'); defs.setAttribute('aria-hidden', 'false'); }, 280); }
    else if (a === 'back') { if (mode !== 'defs' && mode !== 'out') return; defs.classList.remove('on'); defs.setAttribute('aria-hidden', 'true'); clearTimeout(tmr); mode = 'back'; modeT = 0; hoverKey = null; }
    else if (a.indexOf('go:') === 0) { go(a.slice(3)); }
    kick();
  }

  /* ================= حلقهٔ اصلی ================= */
  function step(ts) {
    var dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts; modeT += dt;
    if (mode === 'in' && modeT > 0.9) { mode = 'assembled'; ov.style.pointerEvents = ''; }
    if (mode === 'out' && modeT > 0.72 + 0.04 * order.length + .05) mode = 'defs';
    if (mode === 'back' && modeT > 0.72 + 0.3) { mode = 'assembled'; ov.style.pointerEvents = ''; }
    /* شیب کل بلوک */
    var k = 1 - Math.exp(-dt / 0.3); tilt.x += ((ptr.in ? tilt.tx : 0) - tilt.x) * k; tilt.y += ((ptr.in ? tilt.ty : 0) - tilt.y) * k;
    ptr.fade += ((ptr.in ? 1 : 0) - ptr.fade) * (1 - Math.exp(-dt / 0.18)); ptr.glow = ptr.fade * (mode === 'assembled' || mode === 'defs' ? 1 : 0);
    /* فنر تکه‌ها */
    order.forEach(function (key) {
      var p = pieces[key], on = hoverKey === key && mode === 'assembled', tl = on ? (key === 'nav' ? 32 : 50) * S_ * (W < 760 ? 1.4 : 1) : 0, tx = 0, ty = 0;
      if (on) { var hw = 0, hh = 0; p.poly.forEach(function (q) { hw = Math.max(hw, Math.abs(q[0] - p.cx)); hh = Math.max(hh, Math.abs(q[1] - p.cy)); }); ty = clamp((ptr.lx - p.cx) / (hw || 1), -1, 1) * .24; tx = -clamp((ptr.ly - p.cy) / (hh || 1), -1, 1) * .24; }
      function spr(x, v, target) { var a = 170 * (target - x) - 19 * v; v += a * dt; return [x + v * dt, v]; }
      var r1 = spr(p.lift, p.vl, tl); p.lift = r1[0]; p.vl = r1[1]; var r2 = spr(p.tx, p.vtx, tx); p.tx = r2[0]; p.vtx = r2[1]; var r3 = spr(p.ty, p.vty, ty); p.ty = r3[0]; p.vty = r3[1]; p.hov = clamp(p.lift / (50 * S_ * (W < 760 ? 1.4 : 1)), 0, 1);
    });
    /* برگهٔ «بازگشت» */
    var wantBack = mode === 'defs' || (mode === 'out' && modeT > 0.3), bt = wantBack ? 1 : 0; backS += (bt - backS) * (1 - Math.exp(-dt / 0.12)); var bp = pieces.back, ph = hoverKey === 'back';
    function sp2(x, v, tg) { var a = 170 * (tg - x) - 19 * v; v += a * dt; return [x + v * dt, v]; } var q1 = sp2(bp.tx, bp.vtx, ph ? .14 : 0); bp.tx = q1[0]; bp.vtx = q1[1]; bp.hov += ((ph ? 1 : 0) - bp.hov) * (1 - Math.exp(-dt / 0.1));
    var tm = ts; try { render(dt, tm); matrixOverlay(); placeBack(); } catch (err) { if (!step.warned) { step.warned = 1; console.warn('glass:', err); } }
    var busy = mode !== 'assembled' || Math.abs(tilt.x) > .002 || Math.abs(tilt.y) > .002 || ptr.in || order.some(function (kk) { var p = pieces[kk]; return Math.abs(p.lift) > .02 || Math.abs(p.vl) > .02; }) || true;
    if (busy && visible) requestAnimationFrame(step); else running = false;
  }
  var visible = true, ready = false;
  function kick() { if (!ready || running) return; running = true; last = performance.now(); requestAnimationFrame(step); }

  function matrixOverlay() {
    var bm = curBM, bw = L_.bw, bh = L_.bh, c = [[-bw / 2, bh / 2, 0], [bw / 2, bh / 2, 0], [bw / 2, -bh / 2, 0], [-bw / 2, -bh / 2, 0]], dst = [];
    c.forEach(function (p) { var w = apply(bm, p), z = camZ - w[2], s = camZ / z; dst.push([W / 2 + w[0] * s - L_.bx, H / 2 - w[1] * s - L_.by]); });
    var hm = homography([[0, 0], [bw, 0], [bw, bh], [0, bh]], dst); ov.style.transform = 'translate(' + L_.bx + 'px,' + L_.by + 'px) matrix3d(' + hm.join(',') + ')';
    ov.style.opacity = (mode === 'assembled' || mode === 'in') ? 1 : 0;
  }
  function placeBack() {
    var el = sec.querySelector('.g-back'); if (!el) return; var k = W / 1918; el.style.left = ((RTL() && !portrait ? 1 - .219 : .219) * W) + 'px'; el.style.top = (.238 * H) + 'px'; el.style.fontSize = Math.max(11, .66 * W / 100 * 1.0) + 'px'; el.style.opacity = backS > .5 ? 1 : 0; el.classList.toggle('hv', hoverKey === 'back');
  }

  /* ================= نمای دوم (تعریف‌ها) ================= */
  function buildDefs() {
    var g = G(), rtl = RTL(); defs.dir = rtl ? 'rtl' : 'ltr';
    defs.innerHTML = '<div class="g-col"><h2>' + g.defsTitle + '</h2>' + g.defs.map(function (d) { return '<p><b>' + d[0] + '</b> — ' + d[1] + '</p>'; }).join('') + '</div>';
    var b = sec.querySelector('.g-back'); if (!b) { b = document.createElement('a'); b.href = '#'; b.className = 'g-back'; b.dataset.act = 'back'; b.setAttribute('role', 'button'); sec.appendChild(b); } b.textContent = g.back;
  }

  /* ================= نسخهٔ ثابت ================= */
  function buildStatic() {
    var g = G(); sec.classList.add('static'); ov.remove(); cv.remove(); defs.remove();
    var el = document.createElement('div'); el.className = 'g-static'; el.innerHTML = '<small>' + g.eyebrow + '</small><h1>' + g.h1.join(' ') + '</h1><p>' + g.sub.join(' ') + '</p><div><a class="btn p" href="#" data-act="go:team">' + g.cta + '</a></div>'; sec.appendChild(el);
    el.addEventListener('click', function (e) { var a = e.target.closest('[data-act]'); if (a) { e.preventDefault(); go(a.dataset.act.slice(3)); } });
  }

  /* ================= راه‌اندازی ================= */
  if (!gl || reduce || !initGL()) { buildStatic(); window.GLASS = { text: function () {} }; return; }
  function init() {
    mkPieces(); seed = 11; initDrift(); layout(); buildDefs(); buildBack(); ready = true; mode = 'in'; modeT = 0; randFly(); ov.style.pointerEvents = 'none'; kick();
  }
  window.GLASS = { text: function () { if (!ready) return; items = []; buildItems(); buildOverlay(); buildDefs(); pageDirty = true; kick(); }, relayout: function () { if (!ready) return; initDrift(); layout(); buildBack(); kick(); } };
  sec.addEventListener('pointermove', onMove, { passive: true }); sec.addEventListener('pointerleave', onLeave); sec.addEventListener('click', onClick);
  addEventListener('resize', function () { if (ready) { clearTimeout(window.__gr); window.__gr = setTimeout(function () { window.GLASS.relayout(); }, 120); } });
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) kick(); }, { threshold: 0 }).observe(sec);
  (document.fonts && document.fonts.load ? Promise.all([document.fonts.load('800 40px Kalameh'), document.fonts.load('500 20px Kalameh'), document.fonts.load('400 20px Kalameh')]).catch(function () {}) : Promise.resolve()).then(function () { setTimeout(init, 30); });
  window.__glass = { mode: function () { return mode; }, act: act, state: function () { return { mode: mode, hover: hoverKey, tilt: tilt, W: W, H: H, rtl: RTL(), portrait: portrait }; }, pieces: pieces };
})();
