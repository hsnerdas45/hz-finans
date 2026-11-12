/* ============================================================================
   H&Z FINANS — FINANCIAL ENGINE
   Saf hesaplama katmani. DOM yok, framework yok, global state yok.
   Tum para degerleri KURUS (minor unit, tamsayi) olarak tutulur.
   Tum tarihler 'YYYY-MM-DD' string. Date objesi ve timezone hic kullanilmaz.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HZ = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';

/* ---------------------------------------------------------------- MONEY --- */
/* Kurus bazli tamsayi aritmetigi. 0.1+0.2 problemi yok. */
var Money = {
  /** 1234.56 (TL)  ->  123456 (kurus).  "1.234,56" / "1234,56" / "1234.56" kabul eder. */
  parse: function (v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return Math.round(v * 100);
    var s = String(v).trim().replace(/[₺\s ]/g, '');
    if (s === '') return 0;
    var neg = /^-/.test(s) || /\(.*\)/.test(s);
    s = s.replace(/[()\-]/g, '');
    var lastC = s.lastIndexOf(','), lastD = s.lastIndexOf('.');
    if (lastC > -1 && lastD > -1) {
      // hangisi ondalik: en sagdaki
      if (lastC > lastD) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (lastC > -1) {
      // tek tip ayirac ',': 3'luk gruplar ise binlik, degilse ondalik
      s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
    } else if (lastD > -1) {
      // tek tip ayirac '.': "12.000" TR'de on iki bin demektir.
      // 3'luk gruplar deseni varsa binlik ayirac say, aksi halde ondalik.
      if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    }
    var n = parseFloat(s);
    if (!isFinite(n)) return 0;
    return (neg ? -1 : 1) * Math.round(n * 100);
  },
  toNumber: function (minor) { return (minor || 0) / 100; },
  /** Kurusu TL string'ine cevirir: 123456 -> "1.234,56" */
  fmt: function (minor, opts) {
    opts = opts || {};
    var n = Math.abs(minor || 0);
    var neg = (minor || 0) < 0;
    var whole = Math.floor(n / 100), cents = n % 100;
    var w = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    var out = opts.decimals === false ? w : w + ',' + String(cents).padStart(2, '0');
    if (opts.decimals === 'auto' && cents === 0) out = w;
    return (neg ? '-' : '') + out + (opts.symbol === false ? '' : ' ₺');
  },
  /** Toplami tam korunacak sekilde n parcaya boler. Kalan ilk taksitlere dagilir. */
  split: function (totalMinor, n) {
    n = Math.max(1, Math.round(n));
    var sign = totalMinor < 0 ? -1 : 1, t = Math.abs(totalMinor);
    var base = Math.floor(t / n), rem = t - base * n, out = [];
    for (var i = 0; i < n; i++) out.push(sign * (base + (i < rem ? 1 : 0)));
    return out;
  },
  /** Yuzde: 20% asgari odeme gibi. Yukari yuvarlar (banka lehine degil, guvenli taraf). */
  pct: function (minor, percent) { return Math.ceil((minor || 0) * percent / 100); }
};

/* ----------------------------------------------------------------- DATE --- */
/* Howard Hinnant civil<->days. Tamamen tamsayi; Date/timezone yok. */
function daysFromCivil(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  var era = Math.floor(y / 400);
  var yoe = y - era * 400;
  var doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  var doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
function civilFromDays(z) {
  z += 719468;
  var era = Math.floor(z / 146097);
  var doe = z - era * 146097;
  var yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  var y = yoe + era * 400;
  var doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  var mp = Math.floor((5 * doy + 2) / 153);
  var d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  var m = mp + (mp < 10 ? 3 : -9);
  return { y: y + (m <= 2 ? 1 : 0), m: m, d: d };
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }

var D = {
  parse: function (iso) {
    var p = String(iso).slice(0, 10).split('-');
    return { y: +p[0], m: +p[1], d: +p[2] };
  },
  make: function (y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); },
  serial: function (iso) { var p = D.parse(iso); return daysFromCivil(p.y, p.m, p.d); },
  fromSerial: function (z) { var c = civilFromDays(z); return D.make(c.y, c.m, c.d); },
  daysInMonth: function (y, m) { return [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; },
  /** Ayin gun sayisini asan gun numarasini ay sonuna kirpar. 31 -> Subat'ta 28/29. */
  clampDay: function (y, m, day) { return Math.min(Math.max(1, day | 0), D.daysInMonth(y, m)); },
  addDays: function (iso, n) { return D.fromSerial(D.serial(iso) + n); },
  addMonths: function (y, m, n) {
    var t = (y * 12 + (m - 1)) + n;
    return { y: Math.floor(t / 12), m: (t % 12 + 12) % 12 + 1 };
  },
  cmp: function (a, b) { return D.serial(a) - D.serial(b); },
  lte: function (a, b) { return D.serial(a) <= D.serial(b); },
  gte: function (a, b) { return D.serial(a) >= D.serial(b); },
  between: function (x, a, b) { var s = D.serial(x); return s >= D.serial(a) && s <= D.serial(b); },
  monthKey: function (iso) { return String(iso).slice(0, 7); },
  monthStart: function (key) { return key + '-01'; },
  monthEnd: function (key) { var p = key.split('-'); return D.make(+p[0], +p[1], D.daysInMonth(+p[0], +p[1])); },
  addMonthKey: function (key, n) { var p = key.split('-'); var r = D.addMonths(+p[0], +p[1], n); return r.y + '-' + pad2(r.m); },
  diffDays: function (a, b) { return D.serial(a) - D.serial(b); },
  todayISO: function () {
    // Yerel takvim gunu (tarayici saat dilimi). Sadece "bugun" icin kullanilir.
    var n = new Date();
    return D.make(n.getFullYear(), n.getMonth() + 1, n.getDate());
  },
  trFmt: function (iso) { var p = D.parse(iso); return pad2(p.d) + '.' + pad2(p.m) + '.' + p.y; }
};

var AY_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
D.monthLabel = function (key) { var p = key.split('-'); return AY_TR[+p[1] - 1] + ' ' + p[0]; };
D.rangeLabel = function (a, b) {
  var pa = D.parse(a), pb = D.parse(b);
  var la = pa.d + ' ' + AY_TR[pa.m - 1], lb = pb.d + ' ' + AY_TR[pb.m - 1];
  return la + ' – ' + lb + (pa.y !== pb.y ? ' ' + pb.y : '');
};

/* ------------------------------------------------ STATEMENT PERIOD SERVICE --- */
/*
  Kural: hesap kesim gunu DAHIL o donemin icindedir.
  Ziraat kesim=23  ->  24 Agustos .. 23 Eylul  bir donemdir.
                       24 Eylul'de yapilan harcama 24 Eylul .. 23 Ekim donemine gider.
  Kesim gunu ayda yoksa (31 -> Subat) ay sonuna kirpilir.
*/
var StatementPeriod = {
  /** (y,m) ayinin kesim tarihi */
  closingOf: function (y, m, statementDay) { return D.make(y, m, D.clampDay(y, m, statementDay)); },

  /** Son odeme tarihi: kesimden SONRAKI ilk `dueDay`. */
  dueDateFor: function (closeISO, dueDay) {
    if (!dueDay) return null;
    var c = D.parse(closeISO), y = c.y, m = c.m;
    var d = D.clampDay(y, m, dueDay);
    if (daysFromCivil(y, m, d) <= daysFromCivil(c.y, c.m, c.d)) {
      var n = D.addMonths(y, m, 1); y = n.y; m = n.m; d = D.clampDay(y, m, dueDay);
    }
    return D.make(y, m, d);
  },

  /**
   * GERCEK EKSTRE KAYDI. Bankalar kesim gununu hafta sonuna/tatile gore kaydirir;
   * "her ayin 23'u" varsayimi bazi aylarda 1-2 gun sapar ve harcama yanlis aya duser.
   * Ekstre yuklendiginde (ya da elle duzeltildiginde) o ayin gercek tarihleri
   * card.ekstre['YYYY-AA'] = { close, due, total, carry, charges, credits } olarak saklanir
   * ve tum hesaplar varsayilan gun yerine bunu kullanir.
   */
  ov: function (card, y, m) {
    var e = card && card.ekstre;
    return (e && e[y + '-' + pad2(m)]) || null;
  },
  closeFor: function (card, y, m) {
    var o = StatementPeriod.ov(card, y, m);
    return (o && o.close) || StatementPeriod.closingOf(y, m, card.statementDay);
  },
  /** Gercek bir kesim tarihinin hangi ekstre ayina ait oldugu (varsayilan gune en yakin ay). */
  keyForClose: function (card, closeISO) {
    var c = D.parse(closeISO), best = null, bd = 1e9;
    for (var k = -1; k <= 1; k++) {
      var mm = D.addMonths(c.y, c.m, k);
      var d = Math.abs(D.serial(StatementPeriod.closingOf(mm.y, mm.m, card.statementDay || c.d)) - D.serial(closeISO));
      if (d < bd) { bd = d; best = mm.y + '-' + pad2(mm.m); }
    }
    return best;
  },

  /** Verilen kesim ayindan donem nesnesi uretir. */
  build: function (y, m, card) {
    var dd = card.dueDay;
    var close = StatementPeriod.closeFor(card, y, m);
    var pm = D.addMonths(y, m, -1);
    var prevClose = StatementPeriod.closeFor(card, pm.y, pm.m);
    var o = StatementPeriod.ov(card, y, m);
    return {
      cardId: card.id,
      key: card.id + ':' + y + '-' + pad2(m),
      periodKey: y + '-' + pad2(m),
      start: D.addDays(prevClose, 1),
      close: close,
      dueDate: (o && o.due) || StatementPeriod.dueDateFor(close, dd),
      actual: !!(o && o.close),
      label: D.rangeLabel(D.addDays(prevClose, 1), close)
    };
  },

  /** Bir islem tarihinin hangi ekstre donemine dustugunu bulur. ANA FONKSIYON. */
  forDate: function (isoDate, card) {
    if (!card || !card.statementDay) return null;
    var t = D.parse(isoDate), y = t.y, m = t.m;
    var cd = D.clampDay(y, m, card.statementDay);
    if (t.d > cd) { var n = D.addMonths(y, m, 1); y = n.y; m = n.m; }
    var p = StatementPeriod.build(y, m, card), s = D.serial(isoDate);
    // Gercek kesim tarihi varsayilandan farkliysa komsu doneme kayabilir.
    for (var i = 0; i < 3; i++) {
      var q;
      if (s > D.serial(p.close)) q = D.addMonths(y, m, 1);
      else if (s < D.serial(p.start)) q = D.addMonths(y, m, -1);
      else break;
      y = q.y; m = q.m; p = StatementPeriod.build(y, m, card);
    }
    return p;
  },

  /** Bir tarihte "en son kesilmis" (kesinlesmis) ekstre. */
  lastClosed: function (asOfISO, card) {
    if (!card || !card.statementDay) return null;
    var cur = StatementPeriod.forDate(asOfISO, card);
    var p = D.parse(cur.periodKey + '-01');
    // cari donem henuz kesilmedi -> bir onceki
    var pm = D.addMonths(p.y, p.m, -1);
    return StatementPeriod.build(pm.y, pm.m, card);
  },

  /** asOf tarihinden ileri/geri n donem listesi */
  series: function (fromISO, card, count) {
    var out = [], cur = StatementPeriod.forDate(fromISO, card);
    var p = D.parse(cur.periodKey + '-01');
    for (var i = 0; i < count; i++) {
      var mm = D.addMonths(p.y, p.m, i);
      out.push(StatementPeriod.build(mm.y, mm.m, card));
    }
    return out;
  }
};

/* --------------------------------------------------- SALARY PERIOD SERVICE --- */
/*
  Maas gunu 31 -> her ayin son gunu (Subat'ta 28/29).
  Donem: [maas tarihi, bir sonraki maas tarihi - 1 gun]
*/
var SalaryPeriod = {
  dateIn: function (y, m, salaryDay) { return D.make(y, m, D.clampDay(y, m, salaryDay)); },

  forDate: function (isoDate, salaryDay) {
    var t = D.parse(isoDate), y = t.y, m = t.m;
    var sd = D.clampDay(y, m, salaryDay);
    if (t.d < sd) { var p = D.addMonths(y, m, -1); y = p.y; m = p.m; }
    var start = SalaryPeriod.dateIn(y, m, salaryDay);
    var n = D.addMonths(y, m, 1);
    var nextStart = SalaryPeriod.dateIn(n.y, n.m, salaryDay);
    return {
      key: y + '-' + pad2(m),
      start: start,
      end: D.addDays(nextStart, -1),
      nextStart: nextStart,
      label: D.rangeLabel(start, D.addDays(nextStart, -1))
    };
  },

  shift: function (period, n, salaryDay) {
    var p = D.parse(period.start);
    var t = D.addMonths(p.y, p.m, n);
    return SalaryPeriod.forDate(SalaryPeriod.dateIn(t.y, t.m, salaryDay), salaryDay);
  }
};

/* -------------------------------------------------------------- TX KINDS --- */
var KIND = {
  EXPENSE: 'EXPENSE',           // gercek tuketim (nakit, kart veya banka)
  CARD_PAYMENT: 'CARD_PAYMENT', // kart borcu odemesi — GIDER DEGILDIR
  INCOME: 'INCOME',             // gelir
  REFUND: 'REFUND',             // karta iade — borcu ve harcamayi azaltir, GELIR DEGILDIR
  TRANSFER: 'TRANSFER'          // hesaplar arasi — GIDER DEGILDIR
};
var METHOD = { CASH: 'CASH', CARD: 'CREDIT_CARD', BANK: 'BANK_ACCOUNT' };

var PRIORITY = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
var PRIORITY_TR = { CRITICAL: 'Kritik', HIGH: 'Yüksek', MEDIUM: 'Orta', LOW: 'Düşük' };

/* ------------------------------------------------------------ SELECTORS --- */
/**
 * Kart hesaplarinda kullanilan tarih. Ekstreden gelen bir satirin islem tarihi
 * o ekstrenin donemi disinda kalabilir (taksitte ilk alisveris tarihi, gec yansiyan
 * provizyon). Banka onu hangi ekstreye yazdiysa oraya aittir: `sdate` bunu sabitler.
 */
function cdate(t) { return t.sdate || t.date; }
function isCardRefund(t) { return t.kind === KIND.REFUND && !!t.cardId; }
function isExpense(t) { return t.kind === KIND.EXPENSE; }
function isCardExpense(t) { return t.kind === KIND.EXPENSE && t.method === METHOD.CARD && !!t.cardId; }
function isCashOutflow(t) {
  // Gercekten cepten/hesaptan cikan para
  if (t.kind === KIND.CARD_PAYMENT) return true;
  if (t.kind === KIND.EXPENSE) return t.method === METHOD.CASH || t.method === METHOD.BANK;
  return false;
}

/** Tum islemleri tarih araligina gore filtreler. */
function inRange(txs, a, b) {
  var sa = D.serial(a), sb = D.serial(b);
  return txs.filter(function (t) { var s = D.serial(t.date); return s >= sa && s <= sb; });
}
function sum(arr, f) { return arr.reduce(function (s, x) { return s + (f ? f(x) : x); }, 0); }

/* ---------------------------------------------------------- CARD ENGINE --- */
var Cards = {
  /**
   * Kartin belirli bir tarihteki toplam borcu (CURRENT BALANCE).
   * = acilis borcu + tum kart harcamalari - tum kart odemeleri
   */
  currentBalance: function (card, txs, asOfISO) {
    var asOf = asOfISO || D.todayISO(), s = D.serial(asOf);
    // KAPANIS: "bu tarihe kadar her sey odendi". Kapanis gunu ve oncesindeki
    // kart hareketleri bakiyeye girmez; bakiye o gunden itibaren sifirdan baslar
    // (openingBalance kapanista 0 yapilir, sonraki ekstre esitlemeleri onu kullanir).
    var k = card.kapanis ? D.serial(card.kapanis) : null;
    var bal = card.openingBalance || 0;
    if (k != null && s <= k) return 0;
    for (var i = 0; i < txs.length; i++) {
      var t = txs[i];
      if (t.cardId !== card.id) continue;
      if (D.serial(cdate(t)) > s) continue;
      if (k != null && D.serial(cdate(t)) <= k) continue;
      if (isCardExpense(t)) bal += t.amount;
      else if (t.kind === KIND.CARD_PAYMENT || t.kind === KIND.REFUND) bal -= t.amount;
    }
    return bal;
  },

  availableLimit: function (card, txs, asOfISO) {
    return (card.limit || 0) - Cards.currentBalance(card, txs, asOfISO);
  },

  /** Bir ekstre doneminin tam finansal tablosu. */
  statement: function (card, txs, period, asOfISO) {
    var asOf = asOfISO || D.todayISO();
    var mine = txs.filter(function (t) { return t.cardId === card.id; });

    // Donem ici harcama (sadece bu ekstrede olusan tutar)
    var periodSpend = sum(mine.filter(function (t) {
      return (isCardExpense(t) || isCardRefund(t)) && D.between(cdate(t), period.start, period.close);
    }), function (t) { return isCardRefund(t) ? -t.amount : t.amount; });

    // kapanistan once kesilmis ekstreler odenmis sayilir; borcu gecmis kayit olarak gorunur
    var settled = !!(card.kapanis && D.serial(period.close) <= D.serial(card.kapanis));

    // Ekstre borcu (devir dahil): kesim gunundeki bakiye
    var statementBalance = settled
      ? Cards.currentBalance(Object.assign({}, card, { kapanis: null, openingBalance: (card.kapanisOnce || {}).openingBalance != null ? card.kapanisOnce.openingBalance : card.openingBalance }), txs, period.close)
      : Cards.currentBalance(card, txs, period.close);

    // Bu ekstreye yapilan odemeler: kesimden SONRA, bir SONRAKI kesime kadar.
    // Son odeme tarihi degil sonraki kesim sinir olmalidir; aksi halde gecikmeli
    // yapilan odeme hicbir ekstreye islenmez ve borc odenmis gorunmez.
    var pk = period.periodKey.split('-');
    var nm = D.addMonths(+pk[0], +pk[1], 1);
    var payWindowEnd = StatementPeriod.closeFor(card, nm.y, nm.m);
    var paid = sum(mine.filter(function (t) {
      return t.kind === KIND.CARD_PAYMENT &&
        D.serial(t.date) > D.serial(period.close) &&
        D.serial(t.date) <= D.serial(payWindowEnd);
    }), function (t) { return t.amount; });

    var remaining = Math.max(statementBalance - paid, 0);
    if (settled) { remaining = 0; }
    var minRate = card.minPaymentRate == null ? 20 : card.minPaymentRate;
    var minimum = Math.min(Money.pct(statementBalance, minRate), statementBalance);

    var status;
    if (statementBalance <= 0) status = 'NONE';
    else if (settled || remaining === 0) status = 'PAID';
    else if (paid > 0) status = 'PARTIAL';
    else if (period.dueDate && D.serial(asOf) > D.serial(period.dueDate)) status = 'OVERDUE';
    else status = 'UNPAID';

    return {
      card: card, period: period,
      periodSpend: periodSpend,
      statementBalance: statementBalance,
      paid: paid,
      remaining: remaining,
      minimum: minimum,
      dueDate: period.dueDate,
      daysToDue: period.dueDate ? D.diffDays(period.dueDate, asOf) : null,
      status: status,
      settled: settled,
      closed: D.serial(asOf) > D.serial(period.close)
    };
  },

  /** Kartin ozet paneli icin: guncel bakiye + son kesilen ekstre + cari donem. */
  snapshot: function (card, txs, asOfISO) {
    var asOf = asOfISO || D.todayISO();
    var cur = StatementPeriod.forDate(asOf, card);
    var last = StatementPeriod.lastClosed(asOf, card);
    return {
      card: card,
      currentBalance: Cards.currentBalance(card, txs, asOf),
      availableLimit: Cards.availableLimit(card, txs, asOf),
      utilization: card.limit ? Math.min(100, Cards.currentBalance(card, txs, asOf) / card.limit * 100) : 0,
      currentPeriod: cur ? Cards.statement(card, txs, cur, asOf) : null,
      lastStatement: last ? Cards.statement(card, txs, last, asOf) : null
    };
  }
};

/* ------------------------------------------------------ RECURRING / DEBTS --- */
var Recurring = {
  /** Bir duzenli odemenin [a,b] araligindaki vade tarihlerini uretir. */
  occurrences: function (r, aISO, bISO) {
    if (r.active === false) return [];
    var out = [];
    var a = D.parse(aISO), b = D.parse(bISO);
    var startBound = r.startDate || '1900-01-01';
    var endBound = r.endDate || '2999-12-31';
    var step = r.frequency === 'YEARLY' ? 12 : (r.frequency === 'QUARTERLY' ? 3 : 1);
    // guvenli tarama: araligin bir ay oncesinden bir ay sonrasina
    var cur = D.addMonths(a.y, a.m, -1);
    var limitK = b.y * 12 + b.m + 1;
    while (cur.y * 12 + cur.m <= limitK) {
      var due = D.make(cur.y, cur.m, D.clampDay(cur.y, cur.m, r.dueDay || 1));
      var okStep = true;
      if (step > 1 && r.startDate) {
        var s = D.parse(r.startDate);
        okStep = (((cur.y * 12 + cur.m) - (s.y * 12 + s.m)) % step) === 0;
      }
      if (okStep && D.between(due, aISO, bISO) && D.gte(due, startBound) && D.lte(due, endBound)) {
        out.push({ recurringId: r.id, date: due, amount: r.amount, name: r.name });
      }
      cur = D.addMonths(cur.y, cur.m, 1);
    }
    return out;
  },

  /** Bir vade icin yapilmis odemeler (o vadeye baglanan EXPENSE kayitlari). */
  paidFor: function (occ, txs) {
    // Ayni takvim ayinda, bu duzenli odemeye baglanan harcamalar
    var mk = D.monthKey(occ.date);
    return sum(txs.filter(function (t) {
      return t.recurringId === occ.recurringId && D.monthKey(t.date) === mk && isExpense(t);
    }), function (t) { return t.amount; });
  }
};

/* ------------------------------------------------------------ INSTALLMENTS --- */
var Installments = {
  /**
   * Taksitli alisverisi N adet EXPENSE kaydina boler.
   * ONEMLI: ana alisveris AYRICA gider olarak kaydedilmez — cift sayim olur.
   * Her taksit kendi tarihine ve dolayisiyla kendi ekstre donemine baglanir.
   */
  generate: function (plan, card) {
    var parts = Money.split(plan.totalAmount, plan.count);
    var out = [];
    var first = D.parse(plan.firstDate);
    for (var i = 0; i < plan.count; i++) {
      var mm = D.addMonths(first.y, first.m, i);
      var date = D.make(mm.y, mm.m, D.clampDay(mm.y, mm.m, first.d));
      var sp = card ? StatementPeriod.forDate(date, card) : null;
      out.push({
        id: plan.id + '-' + (i + 1),
        kind: KIND.EXPENSE,
        date: date,
        amount: parts[i],
        person: plan.person,
        method: METHOD.CARD,
        cardId: plan.cardId,
        category: plan.category,
        subcategory: plan.subcategory || '',
        note: plan.name + ' (' + (i + 1) + '/' + plan.count + ')',
        installment: { groupId: plan.id, no: i + 1, count: plan.count, planName: plan.name },
        statementKey: sp ? sp.key : null,
        createdAt: plan.createdAt || D.todayISO()
      });
    }
    return out;
  },

  /** Bir plana ait kalan (gelecek) taksitler */
  remaining: function (planId, txs, asOfISO) {
    var asOf = asOfISO || D.todayISO();
    return txs.filter(function (t) {
      return t.installment && t.installment.groupId === planId && D.serial(t.date) > D.serial(asOf);
    });
  }
};

/* --------------------------------------------------------- REPORT ENGINE --- */
/*
  MERKEZI RAPORLAMA. Tum ekranlar buradan beslenir; ayni islem iki kez sayilmaz.
*/
var Report = {
  /** Takvim ayi raporu (01–30/31). Nakit + kart harcamasi burada birlesir. */
  calendarMonth: function (state, monthKey) {
    var a = D.monthStart(monthKey), b = D.monthEnd(monthKey);
    return Report.range(state, a, b, D.monthLabel(monthKey));
  },

  /** Herhangi bir tarih araligi icin rapor. */
  range: function (state, aISO, bISO, label) {
    var txs = inRange(state.transactions || [], aISO, bISO);
    return Report.summarize(txs, label || (D.trFmt(aISO) + ' – ' + D.trFmt(bISO)), aISO, bISO);
  },

  /** Verilen islem listesi icin rapor. TEK GERCEK KAYNAK.
      Tarih araligi yerine hazir liste alir; "ay" tanimi cagirana aittir. */
  summarize: function (txs, label, aISO, bISO) {
    var expenses = txs.filter(isExpense);
    var income = txs.filter(function (t) { return t.kind === KIND.INCOME; });
    var cardPayments = txs.filter(function (t) { return t.kind === KIND.CARD_PAYMENT; });

    var totalExpense = sum(expenses, function (t) { return t.amount; });
    var totalIncome = sum(income, function (t) { return t.amount; });
    var totalCardPayments = sum(cardPayments, function (t) { return t.amount; });
    var cashOutflow = sum(txs.filter(isCashOutflow), function (t) { return t.amount; });

    var refunds = txs.filter(function (t) { return t.kind === KIND.REFUND; });
    var totalRefund = sum(refunds, function (t) { return t.amount; });
    totalExpense -= totalRefund;

    var byMethod = { CASH: 0, CREDIT_CARD: 0, BANK_ACCOUNT: 0 };
    expenses.forEach(function (t) { byMethod[t.method || METHOD.CASH] += t.amount; });
    refunds.forEach(function (t) { byMethod[t.cardId ? METHOD.CARD : (t.method || METHOD.CASH)] -= t.amount; });

    var byCategory = {}, byPerson = {}, byCard = {}, bySubcategory = {};
    expenses.forEach(function (t) {
      byCategory[t.category || 'Diğer'] = (byCategory[t.category || 'Diğer'] || 0) + t.amount;
      byPerson[t.person || 'Ortak'] = (byPerson[t.person || 'Ortak'] || 0) + t.amount;
      if (t.cardId) byCard[t.cardId] = (byCard[t.cardId] || 0) + t.amount;
      if (t.subcategory) {
        var k = (t.category || 'Diğer') + ' › ' + t.subcategory;
        bySubcategory[k] = (bySubcategory[k] || 0) + t.amount;
      }
    });

    refunds.forEach(function (t) {
      var c = t.category || 'Diğer', p = t.person || 'Ortak';
      byCategory[c] = (byCategory[c] || 0) - t.amount;
      byPerson[p] = (byPerson[p] || 0) - t.amount;
      if (t.cardId) byCard[t.cardId] = (byCard[t.cardId] || 0) - t.amount;
    });

    var incomeByPerson = {};
    income.forEach(function (t) { incomeByPerson[t.person || 'Ortak'] = (incomeByPerson[t.person || 'Ortak'] || 0) + t.amount; });

    var installmentTotal = sum(expenses.filter(function (t) { return !!t.installment; }), function (t) { return t.amount; });

    return {
      label: label || '',
      start: aISO || null, end: bISO || null,
      totalIncome: totalIncome,
      totalExpense: totalExpense,
      net: totalIncome - totalExpense,
      cashOutflow: cashOutflow,          // gercek para cikisi (kart odemeleri dahil)
      totalCardPayments: totalCardPayments, // ayri izlenir, GIDERE EKLENMEZ
      totalRefund: totalRefund,             // giderden dusulmus iadeler
      cashExpense: byMethod.CASH,
      bankExpense: byMethod.BANK_ACCOUNT,
      cardExpense: byMethod.CREDIT_CARD,
      installmentExpense: installmentTotal,
      byCategory: byCategory,
      bySubcategory: bySubcategory,
      byPerson: byPerson,
      byCard: byCard,
      incomeByPerson: incomeByPerson,
      count: txs.length,
      expenses: expenses
    };
  },

  /**
   * EKSTRE AYI — kullanicinin dusunme bicimi.
   * "Agustos ekstrem 23'unde kesiliyor, borcum 74.726,22; 24 Agustos'tan sonrasi Eylul'e ait."
   * Bu fonksiyon, KESIM TARIHI verilen takvim ayina dusen tum kart ekstrelerini toplar.
   * Her kartin kendi penceresi vardir (Ziraat 24 Tem–23 Agu, Is Bankasi 5 Tem–4 Agu ...),
   * ama hepsi ayni ay icinde kesilir; toplami o ayin gercek borc yukudur.
   */
  statementMonth: function (state, monthKey, asOfISO) {
    var asOf = asOfISO || D.todayISO();
    var txs = state.transactions || [];
    var p = D.parse(monthKey + '-01');
    var items = [];
    (state.cards || []).forEach(function (c) {
      if (!c.statementDay || c.active === false) return;
      var sp = StatementPeriod.build(p.y, p.m, c);
      var st = Cards.statement(c, txs, sp, asOf);
      st.periodCategories = Report.cardPeriodCategories(c, txs, sp);
      st.periodTx = txs.filter(function (t) {
        return t.cardId === c.id && isCardExpense(t) && D.between(cdate(t), sp.start, sp.close);
      }).sort(function (a, b) { return D.cmp(b.date, a.date); });
      items.push(st);
    });
    items.sort(function (a, b) { return D.cmp(a.dueDate || a.period.close, b.dueDate || b.period.close); });

    var byCategory = {};
    items.forEach(function (i) {
      for (var k in i.periodCategories) byCategory[k] = (byCategory[k] || 0) + i.periodCategories[k];
    });

    return {
      key: monthKey,
      label: D.monthLabel(monthKey) + ' ekstreleri',
      items: items,
      total: sum(items, function (i) { return i.statementBalance; }),
      paid: sum(items, function (i) { return i.paid; }),
      remaining: sum(items, function (i) { return i.remaining; }),
      minimum: sum(items, function (i) { return i.minimum; }),
      spend: sum(items, function (i) { return i.periodSpend; }),
      byCategory: byCategory,
      overdue: items.filter(function (i) { return i.status === 'OVERDUE'; })
    };
  },

  /** Bir kartin bir ekstre donemindeki harcamalarinin kategori dagilimi. */
  cardPeriodCategories: function (card, txs, period) {
    var out = {};
    txs.forEach(function (t) {
      if (t.cardId !== card.id || !(isCardExpense(t) || isCardRefund(t))) return;
      if (!D.between(cdate(t), period.start, period.close)) return;
      var k = t.category || 'Diğer';
      out[k] = (out[k] || 0) + (isCardRefund(t) ? -t.amount : t.amount);
    });
    return out;
  },

  /** Onceki doneme gore degisim */
  compare: function (cur, prev) {
    function pct(a, b) { return b === 0 ? (a === 0 ? 0 : 100) : ((a - b) / Math.abs(b)) * 100; }
    return {
      expenseDelta: cur.totalExpense - prev.totalExpense,
      expensePct: pct(cur.totalExpense, prev.totalExpense),
      incomeDelta: cur.totalIncome - prev.totalIncome,
      incomePct: pct(cur.totalIncome, prev.totalIncome)
    };
  },

  /** Elde gercekten ne kadar para var (nakit pozisyonu) — butceden farklidir. */
  cashPosition: function (state, asOfISO) {
    var asOf = asOfISO || D.todayISO(), s = D.serial(asOf);
    var opening = sum(state.accounts || [], function (a) { return a.openingBalance || 0; });
    var txs = (state.transactions || []).filter(function (t) { return D.serial(t.date) <= s; });
    var inc = sum(txs.filter(function (t) { return t.kind === KIND.INCOME; }), function (t) { return t.amount; });
    var out = sum(txs.filter(isCashOutflow), function (t) { return t.amount; });
    return opening + inc - out;
  }
};

/* ------------------------------------------------------- SALARY PLANNER --- */
/*
  "MAASIM YATTIGINDA GERCEKTEN NE KADAR PARAM VAR VE HANGI BORCLARI ODEMELIYIM?"
  Bu fonksiyon uygulamanin kalbidir.

  Kural: bir kart borcu, KESIM tarihine gore degil SON ODEME tarihine gore
  hangi maas donemine ait oldugu belirlenir.
*/
var Planner = {
  plan: function (state, asOfISO, periodOverride) {
    var asOf = asOfISO || D.todayISO();
    var cfg = state.config || {};
    var salaryDay = cfg.primarySalaryDay || 31;
    var kapanis = kapanisTarihi(cfg);
    var period = periodOverride || SalaryPeriod.forDate(asOf, salaryDay);
    var txs = state.transactions || [];

    /* --- GELIR: donem icinde beklenen + gerceklesen --- */
    var actualIncome = sum(inRange(txs, period.start, period.end).filter(function (t) { return t.kind === KIND.INCOME; }),
      function (t) { return t.amount; });
    var expectedIncome = 0, incomeLines = [];
    (cfg.people || []).forEach(function (p) {
      if (!p.monthlySalary) return;
      var day = p.salaryDay || salaryDay;
      // bu donemde bu kisinin maas gunu var mi?
      var ps = D.parse(period.start), found = null;
      for (var k = 0; k <= 1; k++) {
        var mm = D.addMonths(ps.y, ps.m, k);
        var cand = D.make(mm.y, mm.m, D.clampDay(mm.y, mm.m, day));
        if (D.between(cand, period.start, period.end)) { found = cand; break; }
      }
      if (found) {
        expectedIncome += p.monthlySalary;
        incomeLines.push({ person: p.name, amount: p.monthlySalary, date: found, received: D.lte(found, asOf) });
      }
    });

    /* --- YUKUMLULUKLER --- */
    var items = [];

    // 1) Kredi karti ekstreleri — SON ODEME tarihi bu donemde olanlar
    (state.cards || []).forEach(function (card) {
      if (card.active === false || !card.statementDay || !card.dueDay) return;
      // ilgili donemleri tara (once/sonra 3 ay yeterli)
      var ps = D.parse(period.start);
      for (var k = -3; k <= 3; k++) {
        var mm = D.addMonths(ps.y, ps.m, k);
        var sp = StatementPeriod.build(mm.y, mm.m, card);
        if (!sp.dueDate || !D.between(sp.dueDate, period.start, period.end)) continue;
        var st = Cards.statement(card, txs, sp, asOf);
        if (st.statementBalance <= 0) continue;
        items.push({
          type: 'CARD',
          id: sp.key,
          name: card.name,
          sub: card.bank + (card.last4 ? ' ····' + card.last4 : ''),
          person: card.owner,
          priority: 'CRITICAL',
          total: st.statementBalance,
          paid: st.paid,
          remaining: st.remaining,
          minimum: st.minimum,
          dueDate: sp.dueDate,
          daysToDue: D.diffDays(sp.dueDate, asOf),
          status: st.status,
          settled: st.settled,
          statementLabel: sp.label,
          cardId: card.id,
          periodKey: sp.periodKey
        });
      }
    });

    // 2) Duzenli odemeler — vadesi bu donemde olanlar
    (state.recurring || []).forEach(function (r) {
      Recurring.occurrences(r, period.start, period.end).forEach(function (occ) {
        var paid = Recurring.paidFor(occ, txs);
        var remaining = Math.max(r.amount - paid, 0);
        var settled = !!(kapanis && D.serial(occ.date) <= D.serial(kapanis));
        if (settled && remaining > 0) { paid = r.amount; remaining = 0; }
        var status = remaining === 0 ? 'PAID' : (paid > 0 ? 'PARTIAL'
          : (D.serial(asOf) > D.serial(occ.date) ? 'OVERDUE' : 'UNPAID'));
        items.push({
          type: 'RECURRING',
          id: r.id + ':' + occ.date,
          name: r.name,
          sub: r.category,
          person: r.owner,
          priority: r.priority || 'MEDIUM',
          total: r.amount,
          paid: paid,
          remaining: remaining,
          dueDate: occ.date,
          daysToDue: D.diffDays(occ.date, asOf),
          status: status,
          settled: settled,
          recurringId: r.id
        });
      });
    });

    // Siralama: once oncelik, sonra vade
    items.sort(function (a, b) {
      var pa = PRIORITY[a.priority] == null ? 9 : PRIORITY[a.priority];
      var pb = PRIORITY[b.priority] == null ? 9 : PRIORITY[b.priority];
      if (pa !== pb) return pa - pb;
      return D.cmp(a.dueDate, b.dueDate);
    });

    var totalRequired = sum(items, function (i) { return i.total; });
    var totalPaid = sum(items, function (i) { return i.paid; });
    var totalRemaining = sum(items, function (i) { return i.remaining; });
    var income = Math.max(actualIncome, expectedIncome);

    // Donem ici nakit harcamalar (yukumluluk disi, plansiz harcama)
    var periodTx = inRange(txs, period.start, period.end);
    var discretionary = sum(periodTx.filter(function (t) {
      return isCashOutflow(t) && t.kind === KIND.EXPENSE && !t.recurringId;
    }), function (t) { return t.amount; });

    return {
      period: period,
      salaryDay: salaryDay,
      income: income,
      actualIncome: actualIncome,
      expectedIncome: expectedIncome,
      incomeLines: incomeLines,
      items: items,
      totalRequired: totalRequired,
      totalPaid: totalPaid,
      totalRemaining: totalRemaining,
      discretionary: discretionary,
      /** Maas sonrasi kalan: gelir - zorunlu odemeler */
      afterObligations: income - totalRequired,
      /** Bugun itibariyle kalan: gelir - odenenler - plansiz nakit harcamalar */
      remainingBudget: income - totalPaid - discretionary,
      overdue: items.filter(function (i) { return i.status === 'OVERDUE'; }),
      upcoming: items.filter(function (i) { return i.status !== 'PAID' && i.daysToDue >= 0 && i.daysToDue <= 7; })
    };
  }
};

/* ------------------------------------------------------- AUTO CATEGORIZE --- */
/* AI yok — basit kural tablosu. Ileride model eklenebilecek sekilde ayrik. */
var RULES = [
  [/FA[İI]Z|BSMV|KKDF|ÖDEME ÜCRET|ÜCRET[İI]|GEC[İI]KME|KOM[İI]SYON/i, 'Faiz & Ücret'],
  [/GIB |G[İI]B |VERG[İI]|MTV|HAZ[İI]NE|SGK/i, 'Vergi'],
  [/MASK[İI]|[İI]SK[İI]|ASK[İI]|GED[İI]Z|AKSA |DOGALGAZ|DOĞALGAZ|ELEKTR[İI]K|TT MOBIL|TURK TELEKOM|TÜRK TELEKOM|TURKCELL|VODAFONE|SUPERONL[İI]NE|TTNET|FAT\.ÖDE|FATURA/i, 'Fatura'],
  [/HASTANE|ECZANE|OPT[İI]K|DOKTOR|MED[İI]CAL|LABORATUVAR|ACIBADEM|D[İI]Ş/i, 'Sağlık'],
  [/CHICKEN|KOKORE|TANTUNI|BÜFE|BUFE|LOKANTA|KÖFTE|KOFTE|BALIK[CÇ]I|MCDONALD|BURGER|P[İI]ZZA|DOMINO|RESTORAN|YEMEKSEPET[İI]|GANTEPS[İI]|UNLU MAM/i, 'Restoran'],
  [/PATISSE|DONDURMA|KAHVE|COFFEE|COFFEA|CAFE|KAFE|STARBUCKS|B[İI]STRO|SÜTLÜ/i, 'Kafe'],
  [/BIM|B[İI]M|A101|ŞOK|SOK MARKET|MIGROS|M[İI]GROS|CARREFOUR|FILE|F[İI]LE|OZKAYALAR|ÖZKAYALAR|ÖKDEM|OKDEM|GETIR|MARKET|BAKKAL|MANAV|SEBZE|EKMEK|F[İI]R[İI]N/i, 'Market'],
  [/OPET|SHELL|PETROL OF|BP |TOTAL|AYTEM[İI]Z|PETROL|AKARYAKIT|BENZ[İI]N|LUKOIL/i, 'Yakıt'],
  [/RESTORAN|LOKANTA|KÖFTE|KOFTE|PIDE|P[İI]DE|KEBAP|MCDONALD|BURGER|DOMINO|P[İI]ZZA|YEMEKSEPET[İI]|GETIR YEMEK|TRENDYOL YEMEK/i, 'Restoran'],
  [/KAHVE|COFFEE|CAFE|KAFE|STARBUCKS|B[İI]STRO|COFFEA/i, 'Kafe'],
  [/NETFLIX|SPOTIFY|YOUTUBE|APPLE\.COM|GOOGLE|ICLOUD|AMAZON PRIME|D[İI]SNEY|BLU TV|EXXEN|ADOBE|MICROSOFT/i, 'Abonelik'],
  [/ECZANE|HASTANE|DOKTOR|MEDICAL|LABORATUVAR|D[İI]Ş|OPT[İI]K/i, 'Sağlık'],
  [/TURKCELL|VODAFONE|TÜRK TELEKOM|TURK TELEKOM|SUPERONL[İI]NE|TTNET|FATURA|ELEKTR[İI]K|DOĞALGAZ|DOGALGAZ|SU [İI]DARES|ASK[İI]|EDAŞ|GAZ/i, 'Fatura'],
  [/S[İI]GORTA|MAPFRE|ALLIANZ|AK S[İI]GORTA|ANADOLU S[İI]G|HEP[İI]Y[İI]/i, 'Sigorta'],
  [/OTOBÜS|OTOBUS|METRO|[İI]ETT|ULAŞIM|ULASIM|TAKS[İI]|UBER|B[İI]TAKS[İI]|HGS|OGS|OTOYOL|B[İI]LET/i, 'Ulaşım'],
  [/GS STORE|MAĞAZA|MAGAZA|LC WAIK|DEFACTO|ZARA|H&M|KOTON|BOYNER|G[İI]Y[İI]M|ADAL/i, 'Giyim'],
  [/TEKNOSA|VATAN|MED[İI]AMARKT|APPLE STORE|ELEKTRON[İI]K|B[İI]LG[İI]SAYAR/i, 'Elektronik'],
  [/K[İI]RA/i, 'Kira'],
  [/A[İI]DAT|APARTMAN|S[İI]TE YÖNET/i, 'Aidat'],
  [/G[İI]B |VERG[İI]|MTV|HAZ[İI]NE/i, 'Vergi'],
  [/ÖSYM|OSYM|KURS|OKUL|ÜN[İI]VERS[İI]TE|EĞ[İI]T[İI]M|K[İI]TAP/i, 'Eğitim'],
  [/S[İI]NEMA|T[İI]YATRO|KONSER|OYUN|STEAM|PLAYSTATION/i, 'Eğlence'],
  [/KRED[İI] ÖDEME|KRED[İI] TAKS[İI]T/i, 'Kredi']
];
function autoCategory(desc) {
  if (!desc) return 'Diğer';
  for (var i = 0; i < RULES.length; i++) if (RULES[i][0].test(desc)) return RULES[i][1];
  return 'Diğer';
}

/* ------------------------------------------------------------- VALIDATE --- */
/** Veri butunlugu kontrolu — cift sayim ve tutarsizlik avcisi. */
/** config.kapanis: { date, ... } — bu tarihe kadarki duzenli odemeler odenmis sayilir */
function kapanisTarihi(cfg) {
  var k = cfg && cfg.kapanis;
  return !k ? null : (typeof k === 'string' ? k : k.date || null);
}

function validate(state) {
  var issues = [];
  var txs = state.transactions || [];
  var cardIds = {};
  (state.cards || []).forEach(function (c) { cardIds[c.id] = c; });

  txs.forEach(function (t) {
    if (!t.date || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) issues.push({ level: 'error', msg: 'Geçersiz tarih: ' + t.id });
    if (!Number.isInteger(t.amount)) issues.push({ level: 'error', msg: 'Tutar tamsayı (kuruş) değil: ' + t.id });
    if (t.amount < 0) issues.push({ level: 'error', msg: 'Negatif tutar: ' + t.id });
    if ((t.method === METHOD.CARD || t.kind === KIND.CARD_PAYMENT) && !cardIds[t.cardId])
      issues.push({ level: 'error', msg: 'Kart bulunamadı: ' + t.id });
    if (t.kind === KIND.EXPENSE && /kart[ ]?ödeme|ekstre ödeme|kredi kartı ödemesi/i.test(t.category || ''))
      issues.push({ level: 'warn', msg: 'Kart ödemesi GİDER olarak kaydedilmiş (çift sayım riski): ' + (t.note || t.id) });
  });

  (state.cards || []).forEach(function (c) {
    var bal = Cards.currentBalance(c, txs);
    if (bal < 0) issues.push({ level: 'info', msg: c.name + ' alacaklı bakiye: ' + Money.fmt(-bal) });
    if (!c.limit) return;
    // Limit asimi: bugunku bakiye VE gelecek taksitlerle olusacak tepe bakiye
    var mine = txs.filter(function (t) { return t.cardId === c.id; })
      .slice().sort(function (a, b) { return D.cmp(a.date, b.date); });
    var run = c.openingBalance || 0, peak = run, peakDate = null;
    if (c.kapanis) mine = mine.filter(function (t) { return D.serial(cdate(t)) > D.serial(c.kapanis); });
    mine.forEach(function (t) {
      if (isCardExpense(t)) run += t.amount;
      else if (t.kind === KIND.CARD_PAYMENT || t.kind === KIND.REFUND) run -= t.amount;
      if (run > peak) { peak = run; peakDate = t.date; }
    });
    if (peak > c.limit) {
      issues.push({
        level: 'warn',
        msg: c.name + ' limit aşımı: ' + Money.fmt(peak) + ' / ' + Money.fmt(c.limit) +
          (peakDate && D.serial(peakDate) > D.serial(D.todayISO()) ? ' (' + D.trFmt(peakDate) + ' itibarıyla)' : '')
      });
    }
  });
  return issues;
}


/* ------------------------------------------------------------ MUTABAKAT --- */
/*
  EKSTRE ↔ UYGULAMA ESLESTIRMESI
  Ay icinde elle girilen harcamalar ile ay sonunda yuklenen ekstre ayni islemleri
  icerir. Her ekstre satiri icin sirayla:
    VAR      bu satir daha once ice aktarilmis (ayni parmak izi)  → atlanir
    ESLESTI  elle girilmis bir kayitla ayni (ayni kart, ayni tutar, ±3 gun;
             taksitte ayni taksit numarasi)                        → yeni kayit ACILMAZ
    BENZER   ayni gunlerde, tutari cok yakin bir kayit var          → kullanici karar verir
    YENI     uygulamada karsiligi yok                               → eklenir
  Ayrica donem icinde elle girilmis ama ekstrede hic gorunmeyen kayitlar
  "yetim" olarak raporlanir. Bir kayit en fazla bir satirla eslesir.
*/
var Recon = {
  WINDOW: 3,          // gun
  NEAR_ABS: 500,      // 5,00 TL
  NEAR_PCT: 2,        // %2
  INST_TOL: 100,      // taksit kurus yuvarlama farki

  norm: function (s) {
    return String(s == null ? '' : s).toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
      .replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/â/g, 'a').replace(/î/g, 'i')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  },
  /** 0..1 — kisa adin kelimelerinin kaci digerinde geciyor */
  sim: function (a, b) {
    var x = Recon.norm(a).split(' ').filter(function (w) { return w.length >= 3; });
    var y = Recon.norm(b).split(' ').filter(function (w) { return w.length >= 3; });
    if (!x.length || !y.length) return 0;
    if (x.length > y.length) { var t = x; x = y; y = t; }
    var hit = 0;
    x.forEach(function (w) {
      if (y.some(function (v) { return v === w || v.indexOf(w) === 0 || w.indexOf(v) === 0; })) hit++;
    });
    return hit / x.length;
  },
  /** Her satira kalici bir parmak izi verir. Ayni gun ayni yerde ayni tutarli
      iki alisveris icin sira numarasi eklenir. */
  keys: function (cardId, rows) {
    var seen = {};
    rows.forEach(function (r) {
      var base = [cardId, r.date, r.type || 'EXPENSE', r.amount, Recon.norm(r.desc),
        r.inst ? r.inst.no + '/' + (r.inst.count || 0) : ''].join('|');
      seen[base] = (seen[base] || 0) + 1;
      r.key = base + '#' + seen[base];
    });
    return rows;
  },
  kindOf: function (row) {
    return row.type === 'PAYMENT' ? KIND.CARD_PAYMENT : row.type === 'REFUND' ? KIND.REFUND : KIND.EXPENSE;
  },
  /** Satirin tarihi ekstre doneminin disindaysa doneme cekilmis hali; icindeyse null */
  sdateFor: function (dateISO, period) {
    if (!period) return null;
    var s = D.serial(dateISO);
    if (s < D.serial(period.start)) return period.start;
    if (s > D.serial(period.close)) return period.close;
    return null;
  },

  match: function (rows, txs, card, period) {
    var mine = (txs || []).filter(function (t) { return t.cardId === card.id; });
    var byKey = {}, used = {};
    mine.forEach(function (t) { if (t.ikey) byKey[t.ikey] = t; });
    Recon.keys(card.id, rows);
    var items = rows.map(function (r) { return { row: r, status: 'YENI', tx: null, diff: 0 }; });

    // 1) daha once ice aktarilmis
    items.forEach(function (o) {
      var t = byKey[o.row.key];
      if (t && !used[t.id]) { o.status = 'VAR'; o.tx = t; used[t.id] = 1; }
    });

    // 1b) ayni ekstre baska bicimde (PDF yerine Excel gibi): aciklama metni farkli
    //     olabilir ama kart + tarih + tur + tutar aynidir. Bir satir tek bir ekstrede
    //     yer aldigi icin bu dortlu, daha once ice aktarilmis kaydi guvenle tanir.
    function stem(k) { return String(k || '').split('|').slice(0, 4).join('|'); }
    var byStem = {};
    mine.forEach(function (t) {
      if (!t.ikey || used[t.id]) return;
      (byStem[stem(t.ikey)] = byStem[stem(t.ikey)] || []).push(t);
    });
    items.forEach(function (o) {
      if (o.status !== 'YENI') return;
      var l = byStem[stem(o.row.key)] || [], t = l.filter(function (x) { return !used[x.id]; })[0];
      if (t) { o.status = 'VAR'; o.tx = t; used[t.id] = 1; }
    });

    function manual(o) {
      var k = Recon.kindOf(o.row);
      return mine.filter(function (t) {
        return !t.ikey && !used[t.id] && t.kind === k && (k !== KIND.EXPENSE || t.method === METHOD.CARD);
      });
    }
    function gap(t, r) {
      var a = Math.abs(D.serial(t.date) - D.serial(r.date));
      var e = Recon.sdateFor(r.date, period);
      if (!e) return a;
      var b = Math.abs(D.serial(cdate(t)) - D.serial(e));
      // taksit satirinin tarihi ilk alisveris gunudur; yalnizca ekstredeki yeri anlamlidir
      return r.inst ? b : Math.min(a, b);
    }
    function inPeriod(t) {
      if (!period) return true;
      var s = D.serial(cdate(t));
      return s >= D.serial(period.start) - 5 && s <= D.serial(period.close) + 5;
    }

    // 2) taksit satirlari ↔ taksit planinin ayni numarali kaydi
    items.forEach(function (o) {
      if (o.status !== 'YENI' || !o.row.inst) return;
      var c = manual(o).filter(function (t) {
        return t.installment && t.installment.no === o.row.inst.no &&
          (!o.row.inst.count || !t.installment.count || t.installment.count === o.row.inst.count) &&
          Math.abs(t.amount - o.row.amount) <= Recon.INST_TOL && inPeriod(t);
      }).sort(function (a, b) {
        var d = Recon.sim(b.note, o.row.desc) - Recon.sim(a.note, o.row.desc);
        return d || (Math.abs(a.amount - o.row.amount) - Math.abs(b.amount - o.row.amount));
      })[0];
      if (c) {
        used[c.id] = 1; o.tx = c; o.diff = o.row.amount - c.amount;
        o.status = o.diff === 0 ? 'ESLESTI' : 'BENZER';
      }
    });

    // 3) ve 4) once tam tutar, sonra yakin tutar — en yakin tarihli cift once
    function pass(exact) {
      var pairs = [];
      items.forEach(function (o, i) {
        if (o.status !== 'YENI') return;
        manual(o).forEach(function (t) {
          var g = gap(t, o.row); if (g > Recon.WINDOW) return;
          var df = o.row.amount - t.amount;
          if (exact ? df !== 0 : (df === 0 ||
            Math.abs(df) > Math.max(Recon.NEAR_ABS, Math.round(o.row.amount * Recon.NEAR_PCT / 100)))) return;
          pairs.push({ i: i, t: t, g: g, df: df, s: Recon.sim(t.note, o.row.desc) });
        });
      });
      pairs.sort(function (a, b) { return a.g - b.g || b.s - a.s || Math.abs(a.df) - Math.abs(b.df) || a.i - b.i; });
      pairs.forEach(function (p) {
        var o = items[p.i];
        if (o.status !== 'YENI' || used[p.t.id]) return;
        used[p.t.id] = 1; o.tx = p.t; o.diff = p.df; o.status = exact ? 'ESLESTI' : 'BENZER';
      });
    }
    pass(true); pass(false);

    // donem icinde elle girilmis ama ekstrede karsiligi olmayan kart harcamalari
    var orphans = !period ? [] : mine.filter(function (t) {
      return !t.ikey && !used[t.id] && isCardExpense(t) && D.between(cdate(t), period.start, period.close);
    });

    var n = { VAR: 0, ESLESTI: 0, BENZER: 0, YENI: 0 };
    items.forEach(function (o) { n[o.status]++; });
    return { items: items, orphans: orphans, counts: n, period: period || null };
  }
};

/* ------------------------------------------------------------- EXPORTS --- */
return {
  Money: Money, D: D,
  StatementPeriod: StatementPeriod, SalaryPeriod: SalaryPeriod,
  Cards: Cards, Recurring: Recurring, Installments: Installments,
  Report: Report, Planner: Planner, Recon: Recon, cdate: cdate, kapanisTarihi: kapanisTarihi,
  KIND: KIND, METHOD: METHOD, PRIORITY: PRIORITY, PRIORITY_TR: PRIORITY_TR,
  isExpense: isExpense, isCardExpense: isCardExpense, isCashOutflow: isCashOutflow,
  autoCategory: autoCategory, validate: validate,
  inRange: inRange, sum: sum
};
});
