/* HZBelge — banka ve kart belgesi okuyucu.
   Fotoğraf, taranmış PDF ve metin PDF'ten "hesap hareketleri" tablosunu satırlara ayırır,
   okunan tutarları bakiye zinciriyle sağlar, satırları gelir / gider / kart ödemesi olarak sınıflar.

   Burada OCR yok: görüntüyü okuyan taraf bir "kaynak" nesnesi verir —
     kaynak.kelimeler            [{t, x0, y0, x1, y1}]  sayfanın bütün kelimeleri (y aşağı doğru artar)
     kaynak.serit(rect, tur)     → Promise<[{t, y0, y1}]>  bir sütun şeridindeki satırlar
                                   tur: 'tarih' | 'sayi' | 'fis' | 'metin'
   Tarayıcıda Tesseract (fotoğraf/taranmış PDF) ya da pdf.js (metin PDF), testlerde Node Tesseract. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HZBelge = api;
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

var AYLAR = { ocak: 1, subat: 2, mart: 3, nisan: 4, mayis: 5, haziran: 6, temmuz: 7, agustos: 8, eylul: 9, ekim: 10,
  kasim: 11, aralik: 12, oca: 1, sub: 2, mar: 3, nis: 4, may: 5, haz: 6, tem: 7, agu: 8, eyl: 9, eki: 10, kas: 11, ara: 12 };

function pad2(n) { return (n < 10 ? '0' : '') + n; }
/** Karşılaştırma için: küçük harf, Türkçe harfler sadeleşir */
function sade(s) {
  return String(s || '').toLocaleLowerCase('tr-TR').replace(/i̇/g, 'i')
    .replace(/[çğıöşüâî]/g, function (c) { return { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i' }[c]; })
    .replace(/\s+/g, ' ').trim();
}
function buyukHarf(s) {        /* "HALİL BAŞKENTLİ" → "Halil Başkentli" */
  return String(s || '').toLocaleLowerCase('tr-TR').replace(/(^|[\s\-'’])(\S)/g, function (m, a, b) { return a + b.toLocaleUpperCase('tr-TR'); });
}

/* ───────────────────────────────────────────── tarih ve sayı ─── */
/** "18.11.2026", "18112026", "18/11/2026 14:32", "18 Kasım 2026" → {date, saat} */
function tarihOku(s) {
  s = String(s || '');
  var saat = /(?:^|\D)([01]?\d|2[0-3])[:.]([0-5]\d)(?::[0-5]\d)?(?!\d)/.exec(s.replace(/\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}/, ' '));
  var m = /(\d{1,2})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(\d{4}|\d{2})(?!\d)/.exec(s), y, a, g;
  if (m) { g = +m[1]; a = +m[2]; y = +m[3]; }
  else if ((m = /(?:^|\D)(\d{2})(\d{2})(20\d{2})(?!\d)/.exec(s))) { g = +m[1]; a = +m[2]; y = +m[3]; }
  else {
    var t = sade(s); m = /(\d{1,2})\s+([a-z]{3,7})\.?\s+(\d{4})/.exec(t);
    if (!m || !AYLAR[m[2]] && !AYLAR[m[2].slice(0, 3)]) return null;
    g = +m[1]; a = AYLAR[m[2]] || AYLAR[m[2].slice(0, 3)]; y = +m[3];
  }
  if (y < 100) y += 2000;
  if (a < 1 || a > 12 || g < 1 || g > 31 || y < 2000 || y > 2099) return null;
  return { date: y + '-' + pad2(a) + '-' + pad2(g), saat: saat ? pad2(+saat[1]) + ':' + saat[2] : null };
}

/** OCR'a dayanıklı tutar okuma → {v: kuruş (işaretli), kesin} ya da null.
    "1.400,00" "-2.400.00" "1141 14,39" "4896,85" "115.559.227" (belirsiz) */
function sayiOku(s) {
  s = String(s || '').replace(/[Oo]/g, '0').replace(/\s+/g, '').replace(/TL|TRY|₺/gi, '');
  var m = /[\d.,]*\d/.exec(s); if (!m) return null;
  var govde = m[0], once = s.slice(0, m.index), sonra = s.slice(m.index + govde.length);
  var neg = /[-−–]/.test(once) || /^[-−–]/.test(sonra) || /\(/.test(once) || /^\s*B\b/i.test(sonra);
  var son = Math.max(govde.lastIndexOf(','), govde.lastIndexOf('.')), kesin = true, kurus;
  if (son >= 0 && govde.length - son - 1 === 2) {
    var tam = govde.slice(0, son), parca = tam.split(/[.,]/);
    kesin = parca.length === 1 || parca.slice(1).every(function (p) { return p.length === 3; }) && parca[0].length <= 3;
    kurus = parseInt(tam.replace(/[.,]/g, '') || '0', 10) * 100 + parseInt(govde.slice(son + 1), 10);
  } else if (son < 0 && govde.length <= 3) {
    kurus = parseInt(govde, 10) * 100; kesin = false;          /* "700" — kuruş kısmı yok */
  } else {
    var rak = govde.replace(/[.,]/g, '');                      /* ayraç kaymış: son iki hane kuruş varsay */
    if (rak.length < 3) return null;
    kurus = parseInt(rak, 10); kesin = false;
  }
  if (!isFinite(kurus)) return null;
  return { v: neg ? -kurus : kurus, kesin: kesin };
}

/* ─────────────────────────────────────────── tablo başlığı ─── */
var BASLIK = [
  ['tarih', /^(islem)?tarih/], ['saat', /^saat$/], ['fis', /^(fis|dekont|referans|ref)/],
  ['aciklama', /^aciklama/], ['tutar', /^(islem)?tutar/], ['bakiye', /^bakiye/],
  ['borc', /^borc/], ['alacak', /^alacak/]
];
/** Sayfadaki kelimelerden hareket tablosunun sütunlarını bulur. */
function tabloBul(kelimeler) {
  var aday = [];
  kelimeler.forEach(function (w) {
    var t = sade(w.t).replace(/[^a-z]/g, '');
    BASLIK.forEach(function (b) { if (b[1].test(t)) aday.push({ ad: b[0], w: w }); });
  });
  var tarihler = aday.filter(function (a) { return a.ad === 'tarih'; }), en = null;
  tarihler.forEach(function (tr) {
    var h = tr.w.y1 - tr.w.y0, ayni = aday.filter(function (a) { return Math.abs(a.w.y0 - tr.w.y0) < h * 0.8; });
    var adlar = {}; ayni.forEach(function (a) { if (!adlar[a.ad] || a.w.x0 < adlar[a.ad].x0) adlar[a.ad] = a.w; });
    adlar.tarih = tr.w;
    var puan = Object.keys(adlar).length;
    var tamam = adlar.aciklama && (adlar.tutar || adlar.borc && adlar.alacak);
    if (tamam && (!en || puan > en.puan)) en = { puan: puan, adlar: adlar, h: h };
  });
  if (!en) return null;
  var sut = Object.keys(en.adlar).map(function (k) { return { ad: k, x0: en.adlar[k].x0, x1: en.adlar[k].x1, w: en.adlar[k] }; })
    .sort(function (a, b) { return a.x0 - b.x0; });
  var pay = en.h * 0.45, sag = Math.max.apply(null, kelimeler.map(function (w) { return w.x1; })) + pay;
  var basAlt = Math.max.apply(null, sut.map(function (s) { return s.w.y1; }));
  /* sayı sütunları: başlık sağa da sola da yaslı olabilir — sınırı başlıktan değil altındaki tutarlardan bul */
  var SAYISAL = ['tutar', 'bakiye', 'borc', 'alacak'], ss = sut.filter(function (s) { return SAYISAL.indexOf(s.ad) >= 0; });
  kelimeler.forEach(function (w) {
    if (w.y0 <= basAlt || !/^[-+−(]?\d{1,3}(?:[.,\s]?\d{3})*[.,]\d{2}\)?$/.test(String(w.t).replace(/TL|₺/g, '').trim())) return;
    var en2 = null, ed = 1e9;
    ss.forEach(function (s) {
      var d = Math.min(Math.abs(w.x1 - s.x1), Math.abs(w.x0 - s.x0), Math.abs((w.x0 + w.x1) / 2 - (s.x0 + s.x1) / 2));
      if (d < ed) { ed = d; en2 = s; }
    });
    if (en2 && ed < en.h * 8) (en2.veri = en2.veri || []).push(w);
  });
  sut.forEach(function (s, i) {
    var sayisal = SAYISAL.indexOf(s.ad) >= 0;
    s.sol = i === 0 ? s.x0 - pay : (sayisal ? s.x0 - pay : s.x0 - pay * 0.5);
    if (sayisal && s.veri && s.veri.length >= 2) s.sol = Math.min(s.sol, Math.min.apply(null, s.veri.map(function (w) { return w.x0; })) - pay * 0.6);
  });
  for (var j = 1; j < sut.length; j++) if (sut[j].sol < sut[j - 1].x1) sut[j].sol = sut[j - 1].x1 + 1;
  sut.forEach(function (s, i) { s.sag = i + 1 < sut.length ? sut[i + 1].sol : sag; });
  var ust = Math.max.apply(null, sut.map(function (s) { return s.w.y1; })) + en.h * 0.15;
  /* tablonun altı: başlığın altında "toplam / devreden / sayfa" ya da sayfa sonu */
  var alt = Math.max.apply(null, kelimeler.map(function (w) { return w.y1; })) + 2;
  var o = {}; sut.forEach(function (s) { o[s.ad] = s; });
  return { sutun: o, sira: sut.map(function (s) { return s.ad; }), ust: ust, alt: alt, h: en.h };
}

/** Başlığın üstündeki metin: banka adı, hesap sahibi, dönem */
function ustBilgi(kelimeler, tablo) {
  var ust = kelimeler.filter(function (w) { return !tablo || w.y1 <= tablo.ust - tablo.h; })
    .sort(function (a, b) { return Math.abs(a.y0 - b.y0) > 12 ? a.y0 - b.y0 : a.x0 - b.x0; })
    .map(function (w) { return w.t; }).join(' ');
  var hepsi = kelimeler.map(function (w) { return w.t; }).join(' ');
  var banka = bankaBul(ust) || (/ziraat mobil|ziraatbank/.test(sade(hepsi)) ? 'ziraat' : null);
  var sahip = /(?:Sayın|Ad[ıi]?\s*Soyad[ıi]?|Müşteri\s*Ad[ıi]?|Hesap\s*Sahibi)\s*:?\s*([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü]+){1,2})/.exec(ust);
  var donem = /(\d{2}[.\/]\d{2}[.\/]\d{4})\s*[-–]\s*(\d{2}[.\/]\d{2}[.\/]\d{4})/.exec(ust);
  var hesapNo = /(?:Hesap\s*No|IBAN)\s*:?\s*([A-Z]{2}\d[\d ]{10,32}|\d[\d\-]{6,20})/i.exec(ust);
  return { banka: banka, sahip: sahip ? sahip[1].replace(/\s+(Şube|Sube|Müşteri)$/i, '') : null,
    donem: donem ? [tarihOku(donem[1]).date, tarihOku(donem[2]).date] : null, hesap: hesapNo ? hesapNo[1].replace(/\s/g, '') : null, metin: ust };
}

var BANKALAR = [
  ['ziraat', /ziraat/], ['isbank', /is bankasi|isbank|maximum/], ['garanti', /garanti|bonus/],
  ['yapikredi', /yapi ve kredi|yapi kredi|yapikredi|world/], ['vakif', /vakiflar|vakifbank/], ['halk', /halk ?bank/],
  ['akbank', /akbank|axess/], ['qnb', /qnb|finansbank/], ['teb', /turk ekonomi|\bteb\b/], ['deniz', /denizbank/],
  ['enpara', /enpara/], ['kuveyt', /kuveyt/], ['ing', /\bing\b/], ['papara', /papara/]
];
function bankaBul(metin) {
  var t = sade(metin), en = null;
  BANKALAR.forEach(function (b) { var m = b[1].exec(t); if (m && (!en || m.index < en.i)) en = { ad: b[0], i: m.index }; });
  return en && en.ad;
}

/* ───────────────────────────────────────────── satırlara böl ─── */
/** Tarih sütunundaki her tarih bir satırın çapasıdır; satırın üstü/altı komşu çapaların ortası. */
async function hesapSatirlari(kaynak, tablo) {
  var S = tablo.sutun, ust = tablo.ust, alt = tablo.alt;
  function rect(s) { return { left: Math.max(0, Math.round(s.sol)), top: Math.round(ust), width: Math.round(s.sag - s.sol), height: Math.round(alt - ust) }; }
  var tl = await kaynak.serit(rect(S.tarih), 'tarih');
  var capa = tl.map(function (l) { var d = tarihOku(l.t); return d ? { d: d, y: (l.y0 + l.y1) / 2, y0: l.y0, y1: l.y1 } : null; })
    .filter(Boolean).sort(function (a, b) { return a.y - b.y; });
  if (!capa.length) return [];
  var bant = capa.map(function (a, i) {
    var u = i ? (capa[i - 1].y + a.y) / 2 : null, d = i + 1 < capa.length ? (a.y + capa[i + 1].y) / 2 : null;
    if (u == null && d == null) { u = a.y0 - tablo.h; d = a.y1 + tablo.h; }
    if (u == null) u = a.y - (d - a.y);
    if (d == null) d = a.y + (a.y - u);
    return { capa: a, ust: u, alt: d };
  });
  var seritler = {};
  for (var k in S) {
    if (k === 'tarih') continue;
    seritler[k] = await kaynak.serit(rect(S[k]), k === 'aciklama' ? 'metin' : k === 'fis' ? 'fis' : k === 'saat' ? 'tarih' : 'sayi');
  }
  function icinde(ad, b) {
    return (seritler[ad] || []).filter(function (l) { var y = (l.y0 + l.y1) / 2; return y > b.ust && y <= b.alt; })
      .map(function (l) { return l.t; }).join(' ').replace(/\s+/g, ' ').trim();
  }
  var satirlar = bant.map(function (b, i) {
    var r = { sira: i, date: b.capa.d.date, saat: b.capa.d.saat, desc: icinde('aciklama', b) };
    if (S.saat) { var sa = tarihOku('01.01.2000 ' + icinde('saat', b)); if (sa && sa.saat) r.saat = sa.saat; }
    if (S.fis) {
      var fk = (kaynak.kelimeler || []).filter(function (w) { var y = (w.y0 + w.y1) / 2, x = (w.x0 + w.x1) / 2; return y > b.ust && y <= b.alt && x >= S.fis.sol && x < S.fis.sag; })
        .map(function (w) { return fisDuzelt(w.t); }).filter(function (t) { return /^[A-Z]{0,3}\d{3,}$/.test(t); });
      r._fis = [fk[0], fisDuzelt(icinde('fis', b))].filter(Boolean);
    }
    if (S.tutar) r.tutarYazi = icinde('tutar', b);
    else { r.borcYazi = icinde('borc', b); r.alacakYazi = icinde('alacak', b); }
    if (S.bakiye) r.bakiyeYazi = icinde('bakiye', b);
    return r;
  });
  /* fiş: tam sayfa okuması ile sütun okuması arasında, belgedeki fişlerin çoğunun uzunluğunda olanı seç */
  var boy = {};
  satirlar.forEach(function (r) { (r._fis || []).forEach(function (f) { boy[f.length] = (boy[f.length] || 0) + 1; }); });
  var mod = +Object.keys(boy).sort(function (a, b) { return boy[b] - boy[a]; })[0];
  satirlar.forEach(function (r) {
    if (!r._fis) return;
    r.fis = r._fis.filter(function (f) { return f.length === mod; })[0] || r._fis[0] || '';
    delete r._fis;
  });
  return satirlar;
}
function fisDuzelt(s) {
  s = String(s || '').replace(/\s+/g, '').toUpperCase();
  s = s.replace(/[^A-Z0-9]/g, '');
  return s.replace(/^([A-NP-Z]{0,3})(.*)$/, function (m, a, b) { return a + b.replace(/O/g, '0').replace(/[IL]/g, '1'); });
}

/* ────────────────────────────────────────── bakiye zinciri ─── */
/** Okunan tutar/bakiyeleri birbirine göre sağlar ve onarır. Satırlar belge sırasında. */
function zincir(satirlar) {
  var n = satirlar.length;
  satirlar.forEach(function (r) {
    var t = null;
    if (r.tutarYazi != null) t = sayiOku(r.tutarYazi);
    else {
      var b = sayiOku(r.borcYazi), a = sayiOku(r.alacakYazi);
      if (a && Math.abs(a.v) > 0) t = { v: Math.abs(a.v), kesin: a.kesin };
      else if (b && Math.abs(b.v) > 0) t = { v: -Math.abs(b.v), kesin: b.kesin };
    }
    r._t = t; r._b = r.bakiyeYazi != null ? sayiOku(r.bakiyeYazi) : null;
    r.notlar = [];
  });
  var bakiyeVar = satirlar.filter(function (r) { return r._b; }).length >= Math.max(2, n * 0.5);
  if (!bakiyeVar) {
    satirlar.forEach(function (r) {
      r.amount = r._t ? r._t.v : null; r.bakiye = null;
      r.durum = !r._t ? 'kontrol' : r._t.kesin ? 'ok' : 'kontrol';
      if (r.durum === 'kontrol') r.notlar.push(r._t ? 'tutar net okunamadı' : 'tutar okunamadı');
    });
    return { yon: null, satirlar: satirlar };
  }
  /* yön: yeniden eskiye mi (b[i] = b[i+1] + t[i]) eskiden yeniye mi (b[i] = b[i-1] + t[i]) */
  function tut(i, j, k) { var x = satirlar[i], y = satirlar[j]; return x._b && y._b && satirlar[k]._t && Math.abs(Math.abs(x._b.v - y._b.v) - Math.abs(satirlar[k]._t.v)) === 0; }
  var azalan = 0, artan = 0;
  for (var i = 0; i + 1 < n; i++) { if (tut(i, i + 1, i)) azalan++; if (tut(i + 1, i, i + 1)) artan++; }
  var sira = satirlar.map(function (r, i) { return i; });
  if (azalan >= artan) sira.reverse();             /* iç hesap hep eskiden yeniye */
  var T = sira.map(function (i) { return satirlar[i]._t ? satirlar[i]._t.v : null; });
  var B = sira.map(function (i) { return satirlar[i]._b ? satirlar[i]._b.v : null; });
  var tK = sira.map(function (i) { return !!(satirlar[i]._t && satirlar[i]._t.kesin); });
  var okT = T.map(function () { return false; }), okB = B.map(function () { return false; }), Bp = B.slice();
  var degisti = T.map(function () { return false; });
  /* 1) kesin: b[k] = b[k-1] + t[k] üçü birden tutuyorsa (işaret düşmüşse düzelt) */
  for (var k = 1; k < T.length; k++) {
    if (B[k] == null || B[k - 1] == null || T[k] == null) continue;
    if (B[k] - B[k - 1] === T[k]) { okT[k] = okB[k] = okB[k - 1] = true; }
    else if (B[k] - B[k - 1] === -T[k]) { T[k] = -T[k]; okT[k] = okB[k] = okB[k - 1] = true; degisti[k] = true; }
  }
  /* 2) yayılım */
  var don = true, tur = 0;
  while (don && tur++ < 4 * T.length + 5) {
    don = false;
    for (k = 1; k < T.length; k++) {
      if (okB[k] && okB[k - 1] && !okT[k]) {
        var t2 = B[k] - B[k - 1]; if (T[k] !== t2) degisti[k] = true; T[k] = t2; okT[k] = true; don = true;
      }
    }
    for (k = 0; k < B.length; k++) {
      if (okB[k]) continue;
      /* aday değerler: soldan (b[k-1] ± t[k]) ve sağdan (b[k+1] ∓ t[k+1]); işaret düşmüş olabilir */
      var ad = [];
      if (k > 0 && okB[k - 1] && T[k] != null) { ad.push({ v: B[k - 1] + T[k], y: 'L' }); ad.push({ v: B[k - 1] - T[k], y: 'L', ters: true }); }
      if (k + 1 < B.length && okB[k + 1] && T[k + 1] != null) { ad.push({ v: B[k + 1] - T[k + 1], y: 'R' }); ad.push({ v: B[k + 1] + T[k + 1], y: 'R', ters: true }); }
      if (!ad.length) continue;
      ad.forEach(function (a) {
        a.p = a.ters ? 0 : 1;
        if (a.v === Bp[k]) a.p += 2;                                                     /* okunan bakiyeyle aynı */
        if (ad.some(function (b) { return b.y !== a.y && b.v === a.v; })) a.p += 3;       /* iki yandan aynı sonuç */
        if (a.y === 'L' && k + 1 < B.length && Bp[k + 1] != null && T[k + 1] != null &&
            (Bp[k + 1] === a.v + T[k + 1] || Bp[k + 1] === a.v - T[k + 1])) a.p += 2;    /* bir sonraki satır tutuyor */
        if (a.y === 'R' && k > 0 && Bp[k - 1] != null && T[k] != null &&
            (a.v - Bp[k - 1] === T[k] || a.v - Bp[k - 1] === -T[k])) a.p += 2;
        var kenar = a.y === 'L' ? (k + 1 >= B.length || Bp[k + 1] == null) : (k === 0 || Bp[k - 1] == null);
        if (!a.ters && kenar && (a.y === 'L' ? tK[k] || okT[k] : tK[k + 1] || okT[k + 1])) a.p += 1;
      });
      ad.sort(function (a, b) { return b.p - a.p; });
      var en = ad[0];
      if (en.p < 2 || (ad[1] && ad[1].p === en.p && ad[1].v !== en.v)) continue;
      B[k] = en.v; okB[k] = true; don = true;
      ad.forEach(function (a) {
        if (a.v !== en.v) return;
        var i2 = a.y === 'L' ? k : k + 1;
        if (a.ters) { T[i2] = -T[i2]; degisti[i2] = true; }
        okT[i2] = true;
      });
    }
  }
  /* en eski satırın tutarını sağlayacak önceki bakiye yok: okunduğu gibi */
  for (k = 0; k < T.length; k++) if (!okT[k] && T[k] != null && tK[k] && (k === 0 || !okB[k - 1])) okT[k] = true;
  sira.forEach(function (i, k) {
    var r = satirlar[i];
    r.amount = T[k]; r.bakiye = B[k];
    if (okT[k] && T[k] != null) {
      r.durum = degisti[k] || (r._t && r._t.v !== T[k]) ? 'duzeltildi' : 'ok';
      if (r.durum === 'duzeltildi') r.notlar.push('tutar bakiyeden düzeltildi');
    } else { r.durum = 'kontrol'; r.notlar.push(T[k] == null ? 'tutar okunamadı' : 'tutar bakiyeyle tutmuyor'); }
  });
  return { yon: azalan >= artan ? 'azalan' : 'artan', satirlar: satirlar };
}

/** Birden çok fotoğraf/sayfa birbirini tekrar edebilir: aynı satırı bir kez al.
    Anahtar: tarih + (saat | fiş) + tutar rakamları; ikisi de yoksa tarih + tutar + bakiye. */
function tekrarAyikla(satirlar) {
  var gor = {}, out = [], atilan = [];
  satirlar.forEach(function (r) {
    var rak = function (s) { return String(s || '').replace(/\D/g, ''); };
    var tut = rak(r.tutarYazi != null ? r.tutarYazi : (r.borcYazi || '') + '/' + (r.alacakYazi || ''));
    var kim = r.saat || r.fis || (r.bakiyeYazi ? 'b' + rak(r.bakiyeYazi) : null);
    if (!kim) { out.push(r); return; }
    var a = r.date + '|' + kim + '|' + tut + '|' + sade(r.desc).slice(0, 24);
    if (gor[a]) { atilan.push(r); return; }
    gor[a] = 1; out.push(r);
  });
  return { satirlar: out, atilan: atilan };
}

/* ────────────────────────────────────────────── sınıflandır ─── */
function kartBul(ctx, metin, sadeceSahip, slug) {
  var kartlar = (ctx.kartlar || []).filter(function (c) { return c.active !== false; });
  var m = /[*#xX•&%@$]{2,}[^\d]{0,12}?(\d{4})(?!\d)/.exec(String(metin || ''));
  if (m) { var k4 = kartlar.filter(function (c) { return c.last4 === m[1]; }); if (k4.length) return k4; }
  var hedef = slug || bankaBul(metin);
  if (!hedef) return [];
  return kartlar.filter(function (c) {
    return bankaBul(c.bank || c.name || '') === hedef && (!sadeceSahip || !c.owner || sadeceSahip(c.owner));
  });
}
function kisiAdi(desc) {
  var d = String(desc || '');
  var m = /Gönd:\s*([A-ZÇĞİÖŞÜa-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜa-zçğıöşü]+){0,2}?)\s+(?:\1\s+)?(?:tarafından|tarafindan|\d{4}-|$)/i.exec(d);
  if (m) return buyukHarf(m[1]);
  m = /\/(?:TR\d[\d ]{10,30})?-?([^\/]+?)\/(?:.*?)FAST/i.exec(d);
  if (m) return buyukHarf(m[1].replace(/^TR\d+-?/i, '').trim());
  m = /([A-ZÇĞİÖŞÜ]{2,}(?:\s+[A-ZÇĞİÖŞÜ]{2,}){1,2}?)(?:\s+\1)?\s+(?:[A-ZÇĞİÖŞÜa-zçğıöşü]+\s+)?Mobil Havale/.exec(d);
  if (m) return buyukHarf(m[1]);
  return null;
}
/** Bir hesap satırı → önerilen kayıt.
    ctx: {kartlar, kisiler:[{name}], sahip:'HASAN ERDAŞ', kisi:'Hasan'} */
function siniflandir(r, ctx) {
  var d = r.desc || '', t = sade(d), gelen = r.amount > 0, tutar = Math.abs(r.amount || 0);
  var kisi = kisiAdi(d);
  var o = { kind: gelen ? 'INCOME' : 'EXPENSE', category: gelen ? 'Gelen havale' : 'Diğer', note: '', karar: 'ekle', cardId: null };
  var sp = sade(ctx.sahip || ctx.kisi || '').split(' ').filter(Boolean);
  function sahipMi(ad) {
    var a = sade(ad).split(' ').filter(Boolean);
    if (!sp.length || !a.length || a[0] !== sp[0]) return false;
    return sp.length < 2 || a[a.length - 1] === sp[sp.length - 1];
  }
  var aktarim = /fast|eft|\/tr\d/.test(t);
  if (/maas|ucret odemesi|ikramiye|prim odemesi/.test(t) && gelen) {
    o.category = 'Maaş';
    var firma = /(?:ÖDEMESİ|ODEMESI)\s+(.+?)(?:\s+(?:SANAY|SAN\.|TİC|LTD|A\.?Ş).*)?$/i.exec(d);
    o.note = (/fark/.test(t) ? 'Maaş farkı' : 'Maaş') + (firma ? ' (' + firma[1].split(' ')[0] + ')' : '');
  } else if (/kk tahsilat|kredi karti tahsilat|kredi karti odeme|kart odemesi|kart borcu|hesaptan karta virman|karta virman|kk odeme/.test(t) && !gelen) {
    var k1 = kartBul(ctx, d), k2 = k1.length ? k1 : kartBul(ctx, '', null, ctx.banka);
    o.kind = 'CARD_PAYMENT'; o.category = 'Kredi Kartı';
    if (k2.length === 1) { o.cardId = k2[0].id; o.note = k2[0].name + ' kart borcu ödemesi'; }
    else { o.note = 'Kart borcu ödemesi — kartı seç'; o.soru = 'hangi kart'; }
  } else if (/atm|para cekme|nakit cekim/.test(t) && !gelen) {
    o.category = 'Nakit çekim'; o.note = "ATM'den nakit çekim"; o.karar = 'atla';
    o.neden = 'nakit harcamalarını elle giriyorsun — çekimi ayrıca saymıyorum';
  } else if (/mesaj ucreti|sms ucreti/.test(t)) { o.category = 'Faiz & Ücret'; o.note = 'SMS ücreti'; }
  else if (/\bbsmv\b/.test(t)) { o.category = 'Faiz & Ücret'; o.note = 'BSMV'; }
  else if (/komisyon|masraf|islem ucreti|hesap isletim/.test(t) && !gelen) { o.category = 'Faiz & Ücret'; o.note = 'Banka ücreti'; }
  else if (/faiz/.test(t)) { o.category = 'Faiz & Ücret'; o.note = gelen ? 'Faiz geliri' : 'Faiz'; }
  else if (/binance|kripto|btcturk|paribu|bitexen|yatirim|borsa|hisse/.test(t)) {
    o.category = 'Yatırım'; o.note = /binance/.test(t) ? 'Binance (kripto)' : 'Yatırım';
  }
  else if (/\bkira\b|kira odeme/.test(t) && !gelen) { o.category = 'Kira'; o.note = 'Kira' + (kisi ? ' (' + kisi + ')' : ''); }
  else if (/aidat|apartman yonetim|site yonetim/.test(t) && !gelen) { o.category = 'Aidat'; o.note = 'Aidat'; }
  else if (/elektrik|dogalgaz|dogal gaz|su idaresi|aski|izsu|maski|turkcell|vodafone|turk telekom|ttnet|superonline|fatura/.test(t) && !gelen) {
    o.category = 'Fatura'; o.note = 'Fatura';
  } else if (gelen) {
    o.note = 'Gelen havale' + (kisi ? ' — ' + kisi : '');
    if (kisi && sahipMi(kisi)) { o.category = 'Kendi hesabından'; o.note = 'Kendi hesabından aktarım'; o.karar = 'atla'; o.neden = 'kendi hesapların arasında aktarım gelir değil'; }
  } else if (kisi) {
    /* kendi adına başka bankaya: o bankada tek kartın varsa kart borcu ödemesidir */
    if (sahipMi(kisi) && aktarim) {
      var kk = kartBul(ctx, d, function (o) { return sade(o).split(' ')[0] === (sp[0] || ''); });
      if (kk.length === 1) { o.kind = 'CARD_PAYMENT'; o.category = 'Kredi Kartı'; o.cardId = kk[0].id; o.note = kk[0].name + ' kart borcu (kendi hesabına)'; }
      else { o.category = 'Havale'; o.note = 'Kendi hesabına aktarım'; o.soru = 'kart ödemesi mi'; }
    } else { o.category = 'Havale'; o.note = 'Havale — ' + kisi; }
  } else { o.category = 'Diğer'; o.note = d.slice(0, 60); }
  if (!o.note) o.note = d.slice(0, 60);
  o.amount = tutar;
  return o;
}

/* ──────────────────────────────────────────────── kimlikler ─── */
/** Kalıcı kayıt kimliği: aynı belge tekrar yüklenince aynı kimlik çıkar.
    Ziraat: zh-YYYYMMDD-<fiş>-<sıra> (sıra: aynı gün+fiş içinde yukarıdan aşağı) — 18.11 içe aktarımıyla uyumlu. */
function kimlikVer(satirlar, banka) {
  var say = {};
  return satirlar.map(function (r) {
    var gun = r.date.replace(/-/g, ''), a;
    if (banka === 'ziraat' && r.fis) a = 'zh-' + gun + '-' + r.fis;
    else a = 'bh-' + (banka || 'banka') + '-' + gun + '-' + (r.saat ? r.saat.replace(':', '') : r.fis || 'x') + '-' + Math.abs(r.amount || 0);
    say[a] = (say[a] || 0) + 1;
    return a + '-' + say[a];
  });
}

/* ─────────────────────────────────── kart dökümü (fotoğraf) ─── */
/** OCR satırlarını kart okuyucusunun anlayacağı "tarih açıklama tutar" satırlarına çevirir.
    Uygulama ekranı görüntülerinde tarih ve tutar ayrı satırlarda olabilir. */
var PARA = /[-+]?\s*\d{1,3}(?:[.\s]\d{3})*[,.]\d{2}(?:\s*(?:TL|₺))?(?:\s*[-+])?/g;
function kartSatirlari(satirlar) {
  var L = satirlar.map(function (s) {
    var t = String(s.t != null ? s.t : s).replace(/\s+/g, ' ').trim(), d = tarihOku(t);
    var p = t.replace(/\d{1,2}\s*[.\/-]\s*\d{1,2}\s*[.\/-]\s*\d{2,4}/g, ' ').replace(/\b([01]?\d|2[0-3])[:.][0-5]\d(?::[0-5]\d)?\b(?![.,]\d)/g, ' ').match(PARA);
    return { t: t, d: d, p: p ? p[p.length - 1] : null };
  });
  var out = [], kul = {};
  function para(s) { var x = sayiOku(s); if (!x) return null; var v = Math.abs(x.v) / 100; return (x.v < 0 || /^\s*-|-\s*$/.test(s) ? '-' : '') + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function temiz(t) {
    return t.replace(/\d{1,2}\s*[.\/-]\s*\d{1,2}\s*[.\/-]\s*\d{2,4}/, '').replace(/\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]{3,7}\.?\s+\d{4}/, '')
      .replace(/\b([01]?\d|2[0-3]):[0-5]\d\b/, '').replace(PARA, '').replace(/\bTL\b|₺/g, '').replace(/\s+/g, ' ').trim();
  }
  function tarihYaz(d) { var p = d.date.split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
  L.forEach(function (l, i) {
    if (kul[i]) return;
    if (l.d && l.p) { out.push(tarihYaz(l.d) + ' ' + temiz(l.t) + ' ' + para(l.p)); kul[i] = 1; return; }
    if (l.p && !l.d) {
      var j = [i - 1, i + 1, i - 2, i + 2].filter(function (j) { return L[j] && L[j].d && !L[j].p && !kul[j]; })[0];
      if (j == null) return;
      var acik = (temiz(L[j].t) + ' ' + temiz(l.t)).trim() || (L[i - 1] && !L[i - 1].d && !L[i - 1].p ? L[i - 1].t : '');
      out.push(tarihYaz(L[j].d) + ' ' + acik + ' ' + para(l.p)); kul[i] = kul[j] = 1;
    }
  });
  return out;
}

/* ───────────────────────────────────────────── kaynaklar ─── */
var BEYAZ = { tarih: '0123456789./-:', sayi: '0123456789.,-', fis: 'ABCDEFGHJKMNPRSTUVWXYZ0123456789', metin: '' };
function blokSatirlari(data) {
  var satir = [], kel = [];
  (data.blocks || []).forEach(function (b) { (b.paragraphs || []).forEach(function (p) { (p.lines || []).forEach(function (l) {
    satir.push({ t: String(l.text || '').trim(), y0: l.bbox.y0, y1: l.bbox.y1, x0: l.bbox.x0, x1: l.bbox.x1 });
    (l.words || []).forEach(function (w) { if (String(w.text).trim()) kel.push({ t: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 }); });
  }); }); });
  return { satir: satir.filter(function (l) { return l.t; }), kel: kel };
}
/** Tesseract işçisi + görüntü → kaynak. (Tarayıcıda da Node'da da aynı.) */
async function ocrKaynak(worker, img) {
  await worker.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: '3' });
  var r = await worker.recognize(img, {}, { blocks: true }), b = blokSatirlari(r.data);
  return {
    kelimeler: b.kel, satirlar: b.satir, metin: b.satir.map(function (l) { return l.t; }).join('\n'),
    serit: async function (rect, tur) {
      await worker.setParameters({ tessedit_char_whitelist: BEYAZ[tur] || '', tessedit_pageseg_mode: '6' });
      var q = await worker.recognize(img, { rectangle: rect }, { blocks: true });
      return blokSatirlari(q.data).satir;
    }
  };
}
/** Metin PDF: pdf.js parçaları (sayfa koordinatında, y aşağı) → kaynak */
function metinKaynak(parcalar) {
  var kel = parcalar.filter(function (p) { return String(p.t).trim(); });
  function satirla(liste) {
    liste = liste.slice().sort(function (a, b) { return a.y0 - b.y0 || a.x0 - b.x0; });
    var out = [], cur = null;
    liste.forEach(function (w) {
      var h = (w.y1 - w.y0) || 8;
      if (!cur || Math.abs((w.y0 + w.y1) / 2 - (cur.y0 + cur.y1) / 2) > h * 0.5) { cur = { w: [], y0: w.y0, y1: w.y1 }; out.push(cur); }
      cur.w.push(w); cur.y0 = Math.min(cur.y0, w.y0); cur.y1 = Math.max(cur.y1, w.y1);
    });
    return out.map(function (l) {
      return { t: l.w.sort(function (a, b) { return a.x0 - b.x0; }).map(function (w) { return String(w.t).trim(); }).join(' '), y0: l.y0, y1: l.y1 };
    });
  }
  var hepsi = satirla(kel);
  return {
    kelimeler: kel, satirlar: hepsi, metin: hepsi.map(function (l) { return l.t; }).join('\n'),
    serit: async function (rect) {
      return satirla(kel.filter(function (w) {
        var x = (w.x0 + w.x1) / 2, y = (w.y0 + w.y1) / 2;
        return x >= rect.left && x < rect.left + rect.width && y >= rect.top && y < rect.top + rect.height;
      }));
    }
  };
}
/** Sayfalar (kaynaklar) → hesap hareketleri. Başlığı olmayan sayfa önceki sayfanın sütunlarını kullanır
    (aynı ölçekte taranmış PDF); fotoğrafta başlık görünmüyorsa sayfa atlanır ve uyarı verilir. */
async function hesapOku(kaynaklar) {
  var hepsi = [], uyarilar = [], bilgi = null, onceki = null;
  for (var i = 0; i < kaynaklar.length; i++) {
    var k = kaynaklar[i], tb = tabloBul(k.kelimeler);
    if (!bilgi && (tb || i === 0)) bilgi = ustBilgi(k.kelimeler, tb);
    if (!tb && onceki && k.ayniOlcek) {
      var ust = Math.min.apply(null, k.kelimeler.map(function (w) { return w.y0; })) - 2;
      tb = Object.assign({}, onceki, { ust: ust, alt: Math.max.apply(null, k.kelimeler.map(function (w) { return w.y1; })) + 2 });
    }
    if (!tb) { uyarilar.push((kaynaklar.length > 1 ? (i + 1) + '. sayfada' : 'Belgede') + ' sütun başlıkları (Tarih, Açıklama, Tutar) bulunamadı'); continue; }
    onceki = tb;
    var s = await hesapSatirlari(k, tb);
    s.forEach(function (r) { r.sayfa = i + 1; });
    hepsi = hepsi.concat(s);
  }
  var t = tekrarAyikla(hepsi), z = zincir(t.satirlar);
  return { bilgi: bilgi || {}, satirlar: z.satirlar, yon: z.yon, atilan: t.atilan, uyarilar: uyarilar };
}

/** Excel/CSV tablo (satır dizileri) hesap hareketi mi? Öyleyse ham satırlar; değilse null. */
function tablodanHesap(tablo) {
  for (var h = 0; h < Math.min(tablo.length, 40); h++) {
    var k = {};
    (tablo[h] || []).forEach(function (c, i) {
      var t = sade(c).replace(/[^a-z]/g, '');
      BASLIK.forEach(function (b) { if (b[1].test(t) && k[b[0]] == null) k[b[0]] = i; });
    });
    if (k.tarih == null || k.aciklama == null || k.bakiye == null || (k.tutar == null && (k.borc == null || k.alacak == null))) continue;
    var out = [];
    tablo.slice(h + 1).forEach(function (r) {
      var d = tarihOku(r[k.tarih]); if (!d) return;
      var x = { sira: out.length, date: d.date, saat: d.saat, desc: String(r[k.aciklama] || '').replace(/\s+/g, ' ').trim(),
        bakiyeYazi: String(r[k.bakiye] == null ? '' : r[k.bakiye]) };
      if (k.saat != null) { var sa = tarihOku('01.01.2000 ' + r[k.saat]); if (sa && sa.saat) x.saat = sa.saat; }
      if (k.fis != null) x.fis = String(r[k.fis] || '').trim();
      if (k.tutar != null) x.tutarYazi = sayiYazi(r[k.tutar]); else { x.borcYazi = sayiYazi(r[k.borc]); x.alacakYazi = sayiYazi(r[k.alacak]); }
      x.bakiyeYazi = sayiYazi(r[k.bakiye]);
      out.push(x);
    });
    var bilgi = ustBilgi(tablo.slice(0, h).map(function (r, i) { return { t: r.join(' '), x0: 0, x1: 1, y0: i, y1: i + 0.5 }; }), null);
    var t = tekrarAyikla(out), z = zincir(t.satirlar);
    return { bilgi: bilgi, satirlar: z.satirlar, yon: z.yon, atilan: t.atilan, uyarilar: [] };
  }
  return null;
}
/* Excel hücresi sayı olarak gelebilir: 1400 → "1400,00" */
function sayiYazi(v) {
  if (typeof v === 'number') return (v < 0 ? '-' : '') + Math.abs(v).toFixed(2).replace('.', ',');
  return String(v == null ? '' : v);
}

/** Belge türü: "hesap" (vadesiz hesap hareketleri) ya da "kart" */
function turBul(metin, tablo) {
  var t = sade(metin);
  if (tablo && tablo.sutun.bakiye) return 'hesap';
  if (/hesap hareket|hesap dokum|hesap ekstresi|vadesiz|iban/.test(t) && !/son odeme tarihi|donem borcu|asgari odeme|hesap kesim/.test(t)) return 'hesap';
  return 'kart';
}

return { sade: sade, tarihOku: tarihOku, sayiOku: sayiOku, tabloBul: tabloBul, ustBilgi: ustBilgi, bankaBul: bankaBul,
  hesapSatirlari: hesapSatirlari, zincir: zincir, tekrarAyikla: tekrarAyikla, siniflandir: siniflandir, kisiAdi: kisiAdi,
  kimlikVer: kimlikVer, ocrKaynak: ocrKaynak, metinKaynak: metinKaynak, hesapOku: hesapOku, tablodanHesap: tablodanHesap, blokSatirlari: blokSatirlari, kartSatirlari: kartSatirlari, kartBul: kartBul, turBul: turBul, fisDuzelt: fisDuzelt };
});
