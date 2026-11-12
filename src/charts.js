/* ============================================================================
   HZChart — bagimsiz SVG grafik uretici (kutuphane yok, tema jetonlariyla calisir)
   Tum fonksiyonlar saf: veri alir, SVG string dondurur. DOM'a dokunmaz.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HZChart = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
var INK = 'var(--chart-ink, #888)';       /* eksen/etiket rengi — sayfa tanimlar */
var INK2 = 'var(--chart-ink2, #aaa)';
var GRID = 'var(--chart-grid, rgba(128,128,128,.18))';
var SURF = 'var(--chart-surf, transparent)';

/* ─────────────────────────────────────────────────────── PASTA ─── */
/**
 * pie(items, opts)
 *   items: [{k:'Market', v:12345, c:'var(--k1)'}]  (kurus veya herhangi bir birim)
 *   opts:  {size, hole, fmt, title}
 * Dilimler arasinda 2px yuzey boslugu; %8'in ustundeki dilimlere ic etiket.
 */
function pie(items, opts) {
  opts = opts || {};
  var S = opts.size || 260, R = S / 2 - 4, CX = S / 2, CY = S / 2;
  var hole = opts.hole == null ? 0.56 : opts.hole;
  var fmt = opts.fmt || function (v) { return String(v); };
  var total = items.reduce(function (a, x) { return a + x.v; }, 0);
  if (!total) return '';

  var ang = -Math.PI / 2, parts = [], labels = [];
  items.forEach(function (it) {
    var frac = it.v / total, sweep = frac * Math.PI * 2;
    var a0 = ang, a1 = ang + sweep;
    ang = a1;
    /* 2px görsel boşluk için küçük açı payı */
    var pad = Math.min(0.018, sweep / 6);
    var b0 = a0 + pad / 2, b1 = a1 - pad / 2;
    if (b1 <= b0) b1 = b0 + 0.0001;
    var ri = R * hole;
    var x0 = CX + R * Math.cos(b0), y0 = CY + R * Math.sin(b0);
    var x1 = CX + R * Math.cos(b1), y1 = CY + R * Math.sin(b1);
    var xi1 = CX + ri * Math.cos(b1), yi1 = CY + ri * Math.sin(b1);
    var xi0 = CX + ri * Math.cos(b0), yi0 = CY + ri * Math.sin(b0);
    var large = (b1 - b0) > Math.PI ? 1 : 0;
    parts.push('<path d="M' + x0.toFixed(2) + ' ' + y0.toFixed(2) +
      ' A' + R + ' ' + R + ' 0 ' + large + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2) +
      ' L' + xi1.toFixed(2) + ' ' + yi1.toFixed(2) +
      ' A' + ri + ' ' + ri + ' 0 ' + large + ' 0 ' + xi0.toFixed(2) + ' ' + yi0.toFixed(2) + ' Z"' +
      ' fill="' + it.c + '"><title>' + esc(it.k) + ' · ' + esc(fmt(it.v)) +
      ' (%' + (frac * 100).toFixed(0) + ')</title></path>');
    if (frac >= 0.08) {
      var am = (b0 + b1) / 2, rm = ri + (R - ri) / 2;
      labels.push('<text x="' + (CX + rm * Math.cos(am)).toFixed(1) + '" y="' + (CY + rm * Math.sin(am) + 4).toFixed(1) +
        '" text-anchor="middle" font-size="11.5" font-weight="700" fill="#fff" style="paint-order:stroke;stroke:rgba(0,0,0,.35);stroke-width:2.5px">%' +
        (frac * 100).toFixed(0) + '</text>');
    }
  });

  var center = '';
  if (hole > 0.3) {
    center = '<text x="' + CX + '" y="' + (CY - 6) + '" text-anchor="middle" font-size="10" font-weight="700" letter-spacing="1" fill="' + INK2 + '">' +
      esc(opts.title || 'TOPLAM') + '</text>' +
      '<text x="' + CX + '" y="' + (CY + 14) + '" text-anchor="middle" font-size="17" font-weight="800" fill="' + INK + '">' +
      esc(fmt(total)) + '</text>';
  }
  return '<svg viewBox="0 0 ' + S + ' ' + S + '" role="img" aria-label="' + esc(opts.title || 'Dağılım') + '">' +
    parts.join('') + labels.join('') + center + '</svg>';
}

/* ──────────────────────────────────────────────────────── EĞRİ ─── */
/**
 * line(labels, series, opts)
 *   labels: ['Nis','May',...]
 *   series: [{name:'Gelir', c:'var(--k3)', data:[...]}, ...]
 *   opts:   {w,h,fmt,area}
 * Tek eksen, yumusak egri (Catmull-Rom -> kubik Bezier), 8px nokta.
 */
function line(labels, series, opts) {
  opts = opts || {};
  var W = opts.w || 640, H = opts.h || 220;
  var PL = 58, PR = 12, PT = 14, PB = 26;
  var fmt = opts.fmt || function (v) { return String(v); };
  var iw = W - PL - PR, ih = H - PT - PB;
  var all = [];
  series.forEach(function (s) { all = all.concat(s.data); });
  var max = Math.max.apply(null, all.concat([1]));
  var step = niceStep(max);
  var top = Math.ceil(max / step) * step || step;
  var n = labels.length;
  function X(i) { return PL + (n <= 1 ? iw / 2 : i * iw / (n - 1)); }
  function Y(v) { return PT + ih - (v / top) * ih; }

  /* ızgara + eksen etiketleri */
  var grid = '', ticks = Math.min(4, Math.round(top / step));
  for (var g = 0; g <= ticks; g++) {
    var v = top * g / ticks, y = Y(v);
    grid += '<line x1="' + PL + '" y1="' + y.toFixed(1) + '" x2="' + (W - PR) + '" y2="' + y.toFixed(1) +
      '" stroke="' + GRID + '" stroke-width="1"/>' +
      '<text x="' + (PL - 8) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end" font-size="10" fill="' + INK2 + '">' +
      esc(fmt(v)) + '</text>';
  }
  var xlab = labels.map(function (l, i) {
    return '<text x="' + X(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10.5" fill="' + INK2 + '">' + esc(l) + '</text>';
  }).join('');

  var paths = series.map(function (s) {
    var pts = s.data.map(function (v, i) { return [X(i), Y(v)]; });
    var d = smooth(pts);
    var out = '';
    if (opts.area !== false && series.length === 1) {
      out += '<path d="' + d + ' L' + X(n - 1).toFixed(1) + ' ' + (PT + ih) + ' L' + X(0).toFixed(1) + ' ' + (PT + ih) + ' Z" fill="' + s.c + '" opacity=".12"/>';
    }
    out += '<path d="' + d + '" fill="none" stroke="' + s.c + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
    out += pts.map(function (p, i) {
      return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="4" fill="' + s.c +
        '" stroke="' + SURF + '" stroke-width="2"><title>' + esc(s.name) + ' · ' + esc(labels[i]) + ' · ' + esc(fmt(s.data[i])) + '</title></circle>';
    }).join('');
    return out;
  }).join('');

  /* preserveAspectRatio varsayilan (meet) — dar ekranda yazi bozulmaz */
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block" role="img" aria-label="' +
    esc(opts.title || 'Eğri grafik') + '">' + grid + xlab + paths + '</svg>';
}

function smooth(p) {
  if (!p.length) return '';
  if (p.length < 3) return 'M' + p.map(function (x) { return x[0].toFixed(1) + ' ' + x[1].toFixed(1); }).join(' L');
  var d = 'M' + p[0][0].toFixed(1) + ' ' + p[0][1].toFixed(1);
  for (var i = 0; i < p.length - 1; i++) {
    var p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    var t = 0.18;
    var c1x = p1[0] + (p2[0] - p0[0]) * t, c1y = p1[1] + (p2[1] - p0[1]) * t;
    var c2x = p2[0] - (p3[0] - p1[0]) * t, c2y = p2[1] - (p3[1] - p1[1]) * t;
    d += ' C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ',' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) +
      ',' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
  }
  return d;
}

/* ─────────────────────────────────────────────────────── SÜTUN ─── */
/**
 * bars(labels, series, opts) — gruplanmis sutun (gelir ↔ gider)
 *   series: [{name, c, data:[]}]
 * Tek eksen; sutun uclari 4px yuvarlak; komsu sutunlar arasi 2px bosluk.
 */
function bars(labels, series, opts) {
  opts = opts || {};
  var W = opts.w || 640, H = opts.h || 230;
  var PL = 58, PR = 12, PT = 14, PB = 26;
  var fmt = opts.fmt || function (v) { return String(v); };
  var iw = W - PL - PR, ih = H - PT - PB;
  var all = []; series.forEach(function (s) { all = all.concat(s.data); });
  var max = Math.max.apply(null, all.concat([1]));
  var step = niceStep(max), top = Math.ceil(max / step) * step || step;
  var n = labels.length, m = series.length;
  var slot = iw / Math.max(1, n);
  var bw = Math.min(26, (slot - 12) / m - 2);
  if (bw < 4) bw = Math.max(3, (slot - 6) / m - 1);

  var grid = '', ticks = Math.min(4, Math.round(top / step));
  for (var g = 0; g <= ticks; g++) {
    var v = top * g / ticks, y = PT + ih - (v / top) * ih;
    grid += '<line x1="' + PL + '" y1="' + y.toFixed(1) + '" x2="' + (W - PR) + '" y2="' + y.toFixed(1) +
      '" stroke="' + GRID + '" stroke-width="1"/>' +
      '<text x="' + (PL - 8) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end" font-size="10" fill="' + INK2 + '">' + esc(fmt(v)) + '</text>';
  }

  var out = '';
  labels.forEach(function (l, i) {
    var cx = PL + slot * i + slot / 2;
    var groupW = m * bw + (m - 1) * 2;
    series.forEach(function (s, j) {
      var v = s.data[i] || 0;
      var h = Math.max(v > 0 ? 2 : 0, (v / top) * ih);
      var x = cx - groupW / 2 + j * (bw + 2);
      var y = PT + ih - h;
      out += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) +
        '" rx="4" ry="4" fill="' + s.c + '"><title>' + esc(s.name) + ' · ' + esc(l) + ' · ' + esc(fmt(v)) + '</title></rect>';
    });
    out += '<text x="' + cx.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10.5" fill="' + INK2 + '">' + esc(l) + '</text>';
  });

  return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block" role="img" aria-label="' +
    esc(opts.title || 'Sütun grafik') + '">' + grid + out + '</svg>';
}

/* ─────────────────────────────────────────────────────── LEJANT ─── */
function legend(series) {
  return '<div class="chart-legend">' + series.map(function (s) {
    return '<span><i style="background:' + s.c + '"></i>' + esc(s.name) +
      (s.value != null ? ' <b>' + esc(s.value) + '</b>' : '') + '</span>';
  }).join('') + '</div>';
}

/** Eksen icin okunakli adim (1/2/5 × 10^n) */
function niceStep(max) {
  if (max <= 0) return 1;
  var raw = max / 4, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
  var r = raw / mag;
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * mag;
}

return { pie: pie, line: line, bars: bars, legend: legend, niceStep: niceStep };
});
