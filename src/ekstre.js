/* ============================================================================
   HZEkstre — kredi kartı ekstresi okuyucu
   Saf işlev: metin satırları ya da tablo alır, ortak biçimde ekstre döndürür.
   DOM yok. PDF'ten satır çıkarmak ve Excel'i açmak uygulama katmanının işi.

   Çıktı:
     { bank, close, due, total, carry, rows: [ {date, desc, amount, type, inst} ],
       charges, credits, ok }
   type: EXPENSE | FEE | PAYMENT | REFUND      inst: { no, count } | null
   Sağlama:  devir + harcamalar − alacaklar = dönem borcu   → ok
   Tutmuyorsa okuyucu bir satırı kaçırmış ya da yanlış okumuştur.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HZEkstre = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';

var MONEY = /(-?)(\d{1,3}(?:\.\d{3})*,\d{2})(\+?)/g;
var AY = { ocak: 1, 'şubat': 2, subat: 2, mart: 3, nisan: 4, 'mayıs': 5, mayis: 5, haziran: 6, temmuz: 7,
  'ağustos': 8, agustos: 8, 'eylül': 9, eylul: 9, ekim: 10, 'kasım': 11, kasim: 11, 'aralık': 12, aralik: 12 };
var TRH = 'A-Za-zÇĞİÖŞÜçğıöşü';

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function iso(y, m, d) { return y + '-' + pad2(+m) + '-' + pad2(+d); }
function kurus(s) { return Math.round(parseFloat(String(s).replace(/\./g, '').replace(',', '.')) * 100); }
function tokens(line) {
  var out = [], m; MONEY.lastIndex = 0;
  while ((m = MONEY.exec(line))) out.push({ neg: m[1] === '-', amt: kurus(m[2]), plus: m[3] === '+' });
  return out;
}
function stripMoney(s) { return s.replace(MONEY, ''); }
function tidy(s) { return s.replace(/\s+/g, ' ').replace(/^[\s\-.]+|[\s\-.]+$/g, ''); }
function lower(s) { return String(s).toLocaleLowerCase('tr-TR'); }
function trDate(s) {
  var m = new RegExp('(\\d{1,2})\\s+([' + TRH + ']+)\\s+(\\d{4})').exec(s);
  if (!m) return null;
  var a = AY[lower(m[2])];
  return a ? iso(m[3], a, m[1]) : null;
}
/** GG/AA/YYYY, GG.AA.YYYY, GG-AA-YY, YYYY-AA-GG ya da "5 Eylül 2026" */
function anyDate(s) {
  s = String(s == null ? '' : s).trim();
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return iso(m[1], m[2], m[3]);
  m = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/.exec(s);
  if (m) { var y = +m[3]; if (y < 100) y += 2000; return (+m[2] >= 1 && +m[2] <= 12 && +m[1] <= 31) ? iso(y, m[2], m[1]) : null; }
  return trDate(s);
}

var RE_PAY = /ÖDEME|ODEME|TAHS[İI]LAT|HAVALE|EFT|V[İI]RMAN|ÖDEMEN[İI]Z/i;
var RE_FEE = /FA[İI]Z|BSMV|KKDF|ÜCRET|A[İI]DAT|KOM[İI]SYON|GEC[İI]KME/i;
var RE_SKIP = /MAX[İI]PUAN [İI]LAVE|PUAN KAZANIM|CH[İI]P.?PARA|BONUS KAZAN/i;

/** Satır türü: alacak yazan satır ödeme ya da iadedir; borç yazan harcama ya da masraf. */
function classify(desc, credit) {
  if (credit) return RE_PAY.test(desc) ? 'PAYMENT' : 'REFUND';
  return RE_FEE.test(desc) ? 'FEE' : 'EXPENSE';
}
function row(date, desc, amount, credit, inst) {
  return { date: date, desc: desc, amount: amount, type: classify(desc, credit), inst: inst || null };
}

/* ───────────────────────────────────────────────── ZİRAAT (Bankkart) ─── */
function parseZiraat(lines, t) {
  var d1 = /Hesap Kesim Tarihi\s*:?\s*(\d{2})[\/.](\d{2})[\/.](\d{4})/.exec(t);
  var d2 = /Son Ödeme Tarihi\s*:?\s*(\d{2})[\/.](\d{2})[\/.](\d{4})/.exec(t);
  var tot = /Dönem Borcu(?:\s*TL)?\s*:?\s*([\d.]+,\d{2})/.exec(t);
  var dev = /ÖNCEKİ AYDAN DEVİR\s+([\d.]+,\d{2})/.exec(t);
  var rows = [];
  lines.forEach(function (line) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(.+)$/.exec(line);
    if (!m) return;
    var rest = m[4], tk = tokens(rest);
    if (!tk.length) return;
    /* Taksit satırında son alan taksit tutarıdır. Diğerlerinde son alan
       "Bankkart Lira" puan sütunu olabilir ("… 2.100,00 2,10") — atılır. */
    if (rest.indexOf('Taksidi') < 0 && tk.length >= 2 && tk[tk.length - 1].amt * 50 < tk[tk.length - 2].amt) tk.pop();
    var k = tk[tk.length - 1];
    if (!k.amt) return;
    var tak = /İşlemin (\d+)\/(\d+) Taksidi/.exec(rest);
    var desc = tidy(stripMoney(rest).replace(/\s*(TL|USD|EUR|İşlemin \d+\/\d+ Taksidi|Taksidi)\s*/g, ' '));
    rows.push(row(iso(m[3], m[2], m[1]), desc, k.amt, k.plus || k.neg, tak ? { no: +tak[1], count: +tak[2] } : null));
  });
  return { bank: 'Ziraat', close: d1 && iso(d1[3], d1[2], d1[1]), due: d2 && iso(d2[3], d2[2], d2[1]),
    total: tot ? kurus(tot[1]) : null, carry: dev ? kurus(dev[1]) : 0, rows: rows };
}

/* ───────────────────────────────────────────── İŞ BANKASI (Maximum) ─── */
function parseMaximum(lines, t) {
  var d1 = /Hesap Kesim Tarihi\s*:?\s*(\d{2})[.\/](\d{2})[.\/](\d{4})/.exec(t);
  var d2 = /Son Ödeme Tarihi\s*:?\s*(\d{2})[.\/](\d{2})[.\/](\d{4})/.exec(t);
  var tot = /Hesap Özeti Borcu\s*:?\s*([\d.]+,\d{2})/.exec(t);
  var dev = /BİR ÖNCEKİ HESAP ÖZETİ BAKİYENİZ\s*\**\s*([\d.]+,\d{2})/.exec(t);
  var rows = [];
  lines.forEach(function (line) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})\s*(.+)$/.exec(line);      /* tarih açıklamaya bitişik gelebilir */
    if (!m) return;
    var rest = m[4];
    if (RE_SKIP.test(rest)) return;                                /* puan satırı, para hareketi değil */
    var tak = /(\d+)\/(\d+)\s*taksidi/i.exec(rest);
    var clean = rest.replace(/\d+\/\d+\s*taksidi\s*(\([^)]*\))?/i, '');
    var tk = tokens(clean);
    if (!tk.length) return;
    if (tk.length >= 2 && tk[tk.length - 1].amt < 1000) tk.pop();  /* son alan MaxiPuan (<10,00) */
    var k = tk[tk.length - 1];
    if (!k.amt) return;
    var desc = tidy(stripMoney(clean).replace(/^\s*\d+\s+/, ''));
    rows.push(row(iso(m[3], m[2], m[1]), desc, k.amt, k.neg || k.plus, tak ? { no: +tak[1], count: +tak[2] } : null));
  });
  return { bank: 'İş Bankası', close: d1 && iso(d1[3], d1[2], d1[1]), due: d2 && iso(d2[3], d2[2], d2[1]),
    total: tot ? kurus(tot[1]) : null, carry: dev ? kurus(dev[1]) : 0, rows: rows };
}

/* ──────────────────────────────────────────────── GARANTİ (Bonus) ─── */
function parseBonus(lines, t) {
  var c = new RegExp('Hesap Kesim Tarihi\\s*:?\\s*(\\d{1,2}\\s+[' + TRH + ']+\\s+\\d{4})').exec(t);
  var d = new RegExp('Son Ödeme Tarihi\\s*:?\\s*(\\d{1,2}\\s+[' + TRH + ']+\\s+\\d{4})').exec(t);
  var tot = /Dönem Borcunuz\s*:?\s*([\d.]+,\d{2})/.exec(t);
  var dev = /ÖNCEKİ DÖNEMDEN DEVİR EDİLEN TUTAR\s+([\d.]+,\d{2})/.exec(t);
  var close = c ? trDate(c[1]) : null;
  var rows = [];
  lines.forEach(function (line) {
    if (!tokens(line).length) return;
    var dm = new RegExp('^(\\d{1,2}\\s+[' + TRH + ']+\\s+\\d{4})\\s+(.+)$').exec(line);
    var date, rest;
    if (dm) { date = trDate(dm[1]); rest = dm[2]; if (!date) return; }
    else if (/^(DÖNEM FAİZİ|GEÇ ÖDEME FAİZİ|KKDF|BSMV|ÜCRET)/.test(line) && close) { date = close; rest = line; }
    else return;                                 /* tarihsiz faiz/ücret satırları kesim gününe yazılır */
    var tk = tokens(rest);
    if (!tk.length) return;
    var k = tk[tk.length - 1];
    if (!k.amt) return;
    var tak = /(\d+)\.Taksit/.exec(rest);
    var desc = tidy(stripMoney(rest).replace(/x\d+=|\d+\.Taksit|\bTL\b/g, ' '));
    rows.push(row(date, desc, k.amt, k.plus || k.neg, tak ? { no: +tak[1], count: 0 } : null));
  });
  return { bank: 'Garanti', close: close, due: d ? trDate(d[1]) : null,
    total: tot ? kurus(tot[1]) : null, carry: dev ? kurus(dev[1]) : 0, rows: rows };
}

/* ─────────────────────────────────────────────── tanınmayan banka ─── */
/* Kural: tarihle başlayıp tutarla biten satır bir işlemdir. */
function parseGeneric(lines, t) {
  function hdr(re) {
    var m = re.exec(t); if (!m) return null;
    return anyDate(m[1]);
  }
  var close = hdr(new RegExp('Hesap Kesim Tarihi\\s*:?\\s*(\\d{1,2}[.\\/ -](?:\\d{1,2}|[' + TRH + ']+)[.\\/ -]\\d{2,4})'));
  var due = hdr(new RegExp('Son Ödeme Tarihi\\s*:?\\s*(\\d{1,2}[.\\/ -](?:\\d{1,2}|[' + TRH + ']+)[.\\/ -]\\d{2,4})'));
  var tot = /(?:Dönem Borcu(?:nuz)?|Hesap Özeti Borcu|Toplam Borç)(?:\s*TL)?\s*:?\s*([\d.]+,\d{2})/i.exec(t);
  var dev = /(?:ÖNCEKİ (?:AYDAN|DÖNEMDEN) DEVİR[^\d]*|ÖNCEKİ DÖNEM BORCU[^\d]*)([\d.]+,\d{2})/i.exec(t);
  var rows = [];
  lines.forEach(function (line) {
    var m = new RegExp('^(\\d{1,2}[.\\/-]\\d{1,2}[.\\/-]\\d{2,4}|\\d{1,2}\\s+[' + TRH + ']+\\s+\\d{4})\\s*(.+)$').exec(line);
    if (!m) return;
    var date = anyDate(m[1]); if (!date) return;
    var rest = m[2];
    if (RE_SKIP.test(rest)) return;
    var tk = tokens(rest); if (!tk.length) return;
    var k = tk[tk.length - 1]; if (!k.amt) return;
    var tak = /(\d+)\s*\/\s*(\d+)\s*(?:taks|\.?\s*taksit)/i.exec(rest) || /\((\d+)\/(\d+)\)/.exec(rest);
    var credit = k.neg || k.plus || /\bALACAK\b|\(A\)\s*$/i.test(rest);
    rows.push(row(date, tidy(stripMoney(rest).replace(/\bTL\b/g, ' ')), k.amt, credit,
      tak ? { no: +tak[1], count: +tak[2] } : null));
  });
  return { bank: 'Tanınmayan banka', close: close, due: due,
    total: tot ? kurus(tot[1]) : null, carry: dev ? kurus(dev[1]) : 0, rows: rows };
}

function finish(st) {
  st.rows = st.rows.filter(function (r) { return r.date && r.amount > 0; });
  st.charges = st.rows.reduce(function (s, r) { return s + (r.type === 'EXPENSE' || r.type === 'FEE' ? r.amount : 0); }, 0);
  st.credits = st.rows.reduce(function (s, r) { return s + (r.type === 'PAYMENT' || r.type === 'REFUND' ? r.amount : 0); }, 0);
  st.calc = (st.carry || 0) + st.charges - st.credits;
  st.ok = st.total != null && st.calc === st.total;
  return st;
}

/** PDF'ten çıkarılmış satırlar (ya da düz metin) → ekstre */
function fromLines(lines) {
  lines = lines.map(function (l) { return String(l).replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim(); })
    .filter(function (l) { return l; });
  var t = lines.join('\n'), st;
  if (/Bankkart|ÖNCEKİ AYDAN DEVİR/.test(t)) st = parseZiraat(lines, t);
  else if (/MAXIMUM|MAXİPUAN|MaxiPuan|Hesap Özeti Borcu/.test(t)) st = parseMaximum(lines, t);
  else if (/Dönem Borcunuz|ÖNCEKİ DÖNEMDEN DEVİR EDİLEN|BONUS/i.test(t)) st = parseBonus(lines, t);
  else st = parseGeneric(lines, t);
  if (!st.rows.length && st.bank !== 'Tanınmayan banka') {      /* profil tutmadıysa genel kurala düş */
    var g = parseGeneric(lines, t);
    if (g.rows.length) { g.bank = st.bank + ' (genel okuma)'; g.close = g.close || st.close; g.due = g.due || st.due;
      if (g.total == null) g.total = st.total; st = g; }
  }
  return finish(st);
}
function fromText(text) { return fromLines(String(text).split(/\r?\n/)); }

/* ───────────────────────────────────────────────── Excel / CSV ─── */
function para(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Math.round(v * 100);
  var s = String(v).trim().replace(/[₺\s ]|TL/g, '');
  if (!/\d/.test(s) || /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(s)) return null;
  var neg = /^-/.test(s) || /-$/.test(s) || /^\(.*\)$/.test(s), plus = /\+$/.test(s);
  s = s.replace(/[()+\-]/g, '');
  var c = s.lastIndexOf(','), d = s.lastIndexOf('.');
  if (c > -1 && d > -1) s = c > d ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (c > -1) s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  else if (d > -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  var n = parseFloat(s);
  if (!isFinite(n)) return null;
  return { amt: Math.round(n * 100), credit: neg || plus };
}
function fromTable(table) {
  var rows = (table || []).map(function (r) {
    return (r || []).map(function (c) { return c == null ? '' : (c instanceof Date ? iso(c.getFullYear(), c.getMonth() + 1, c.getDate()) : String(c).trim()); });
  });
  /* başlık satırı: tarih + (açıklama | tutar) içeren ilk satır */
  var col = null, start = 0;
  for (var i = 0; i < Math.min(rows.length, 40) && !col; i++) {
    var h = rows[i].map(lower), c = {};
    h.forEach(function (x, j) {
      if (c.date == null && /tarih/.test(x) && !/son ödeme|kesim/.test(x)) c.date = j;
      else if (c.desc == null && /açıklama|aciklama|işlem|islem|işyeri|detay/.test(x)) c.desc = j;
      else if (c.credit == null && /alacak/.test(x)) c.credit = j;
      else if (c.debit == null && /borç|borc/.test(x)) c.debit = j;
      else if (c.amount == null && /tutar|miktar/.test(x)) c.amount = j;
      else if (c.inst == null && /taksit/.test(x)) c.inst = j;
    });
    if (c.date != null && (c.desc != null || c.amount != null || c.debit != null)) { col = c; start = i + 1; }
  }
  var flat = rows.map(function (r) { return r.join(' '); }).join('\n');
  function meta(re) {
    for (var a = 0; a < rows.length; a++) for (var b = 0; b < rows[a].length; b++) {
      if (!re.test(rows[a][b])) continue;
      var self = rows[a][b].replace(re, ''), next = rows[a].slice(b + 1).filter(function (x) { return x; })[0];
      return [self, next];
    }
    return null;
  }
  function mDate(re) { var m = meta(re); return m ? (anyDate(m[0].replace(/^[\s:]+/, '')) || anyDate(m[1])) : null; }
  function mMoney(re) { var m = meta(re); if (!m) return null;
    var p = para(m[0].replace(/^[\s:]+/, '')) || para(m[1]); return p ? p.amt : null; }
  var st = { bank: 'Excel/CSV', close: mDate(/Hesap Kesim Tarihi/i), due: mDate(/Son Ödeme Tarihi/i),
    total: mMoney(/Dönem Borcu(nuz)?|Hesap Özeti Borcu/i), carry: mMoney(/Önceki\s+(Ay|Dönem|Hesap)\S*\s+(Devir|Devreden|Borc|Bakiye)|Devreden (Borç|Bakiye|Tutar)/i) || 0, rows: [] };

  for (var k = start; k < rows.length; k++) {
    var r = rows[k]; if (!r || r.length < 2) continue;
    var date = null, desc = '', amt = null, credit = false, inst = null;
    if (col) {
      date = anyDate(r[col.date]);
      desc = col.desc != null ? r[col.desc] : '';
      if (col.debit != null || col.credit != null) {
        var db = col.debit != null ? para(r[col.debit]) : null, cr = col.credit != null ? para(r[col.credit]) : null;
        if (cr && cr.amt) { amt = cr.amt; credit = true; } else if (db && db.amt) { amt = db.amt; credit = db.credit; }
      }
      if (amt == null && col.amount != null) { var p = para(r[col.amount]); if (p) { amt = p.amt; credit = p.credit; } }
      if (col.inst != null) { var im = /(\d+)\s*\/\s*(\d+)/.exec(r[col.inst]); if (im) inst = { no: +im[1], count: +im[2] }; }
    } else {
      r.forEach(function (c) { if (!date) date = anyDate(c); });
      for (var j = r.length - 1; j >= 0 && amt == null; j--) {
        if (anyDate(r[j])) continue;
        var q = para(r[j]); if (q && q.amt) { amt = q.amt; credit = q.credit; }
      }
      desc = r.filter(function (c) { return c && !anyDate(c) && !para(c); }).sort(function (a, b) { return b.length - a.length; })[0] || '';
    }
    if (!date || !amt) continue;
    if (RE_SKIP.test(desc)) continue;
    if (!inst) { var tm = /(\d+)\s*\/\s*(\d+)\s*(?:taks|\.?\s*taksit)/i.exec(desc) || /\((\d+)\/(\d+)\)/.exec(desc);
      if (tm) inst = { no: +tm[1], count: +tm[2] }; }
    st.rows.push(row(date, tidy(desc), Math.abs(amt), credit, inst));
  }
  /* Bazı dökümlerde harcama eksi, ödeme artı yazılır: satırların çoğu "alacak" görünüyorsa yön terstir. */
  var nc = st.rows.filter(function (x) { return x.type === 'PAYMENT' || x.type === 'REFUND'; }).length;
  if (st.rows.length >= 3 && nc > st.rows.length / 2) {
    st.rows.forEach(function (x) {
      var wasCredit = x.type === 'PAYMENT' || x.type === 'REFUND';
      x.type = classify(x.desc, !wasCredit);
    });
    st.flipped = true;
  }
  if (!st.rows.length && flat) return fromText(flat);     /* tablo değil, metin dökümüyse */
  return finish(st);
}

return { fromLines: fromLines, fromText: fromText, fromTable: fromTable, classify: classify,
  anyDate: anyDate, tokens: tokens, kurus: kurus };
});
