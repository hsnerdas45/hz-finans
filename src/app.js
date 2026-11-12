/* ============================================================================
   H&Z FİNANS — uygulama katmanı
   Tüm hesaplar HZ (engine) üzerinden yapılır. Burada sadece durum + arayüz var.
   ========================================================================== */
(function () {
'use strict';
var M = HZ.Money, D = HZ.D, KIND = HZ.KIND, METHOD = HZ.METHOD;

/* ─────────────────────────────────────────────────────── yardımcılar ─── */
function $(s, r) { return (r || document).querySelector(s); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function uid(p) { return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function toast(msg) {
  var t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('on'); }, 2600);
}
function money(v, o) { return M.fmt(v, o); }
var CAT_ORDER = ['c1', 'c2', 'c3', 'c4'];
function catColor(i) { return 'var(--' + CAT_ORDER[i % 4] + ')'; }

/* ───────────────────────────────────────────────────────────── durum ─── */
var S = {
  config: { people: [], primarySalaryDay: 31, categories: [] },
  cards: [], recurring: [], plans: [], imports: [], buckets: {},
  get transactions() {
    var out = [];
    for (var k in S.buckets) out = out.concat(S.buckets[k] || []);
    return out;
  },
  view: 'ozet', monthOffset: 0, tumu: false,
  an: { mo: 0, span: 6 },   /* Analiz sayfası kendi dönemini tutar */
  filters: { q: '', cat: '', person: '', card: '', kind: '' },
  ready: false
};
function state() {
  return { config: S.config, cards: S.cards, recurring: S.recurring, accounts: S.config.accounts || [], transactions: S.transactions };
}
function cardById(id) { for (var i = 0; i < S.cards.length; i++) if (S.cards[i].id === id) return S.cards[i]; return null; }
/* Varsayilan kart her listede basta gelir; sonra aktifler, en sonda pasifler. */
function sortedCards() {
  var def = S.config.defaultCardId;
  return S.cards.slice().sort(function (a, b) {
    if (a.id === def) return -1;
    if (b.id === def) return 1;
    var aa = a.active === false ? 1 : 0, bb = b.active === false ? 1 : 0;
    if (aa !== bb) return aa - bb;
    return (a.name || '').localeCompare(b.name || '', 'tr');
  });
}
function defaultCardId() {
  var d = S.config.defaultCardId;
  if (d && cardById(d)) return d;
  var first = sortedCards().filter(function (c) { return c.active !== false; })[0];
  return first ? first.id : '';
}
function cardOptions(sel) {
  var pick = sel || defaultCardId();
  return sortedCards().map(function (c) {
    return '<option value="' + esc(c.id) + '"' + (pick === c.id ? ' selected' : '') + '>' + esc(c.name) +
      (c.id === S.config.defaultCardId ? ' ★' : '') + '</option>';
  }).join('');
}
function personColor(name) {
  var i = (S.config.people || []).findIndex(function (p) { return p.name === name; });
  return i < 0 ? 'var(--ink3)' : catColor(i);
}

var DEFAULT_CATS = ['Market', 'Restoran', 'Kafe', 'Yakıt', 'Ulaşım', 'Ev', 'Kira', 'Aidat', 'Fatura',
  'Sağlık', 'Giyim', 'Alışveriş', 'Elektronik', 'Eğitim', 'Eğlence', 'Sigorta', 'Abonelik', 'Kredi', 'Vergi', 'Diğer'];

/* ──────────────────────────────────────────────────────── depolama ─── */
var Store = {
  db: null, mode: 'local', unsubs: [],

  async init() {
    /* Veri kaynağı: GitHub sürümünde Firebase (window.HZ_VERI, girişten sonra çözülür),
       Claude sayfasında Claude veritabanı, ikisi de yoksa bu tarayıcının belleği. */
    try {
      this.db = window.HZ_VERI ? await window.HZ_VERI()
        : (typeof claude !== 'undefined' ? await claude.use('db') : null);
    } catch (e) { this.db = null; }
    if (this.db) { this.mode = 'cloud'; await this.subscribe(); }
    else { this.mode = 'local'; this.loadLocal(); S.ready = true; renderAll(); }
    setSync();
  },

  async subscribe() {
    var db = this.db;
    var got = { config: false, cards: false, recurring: false, plans: false, imports: false, tx: false };
    function mark(k) { got[k] = true; if (Object.values(got).every(Boolean) && !S.ready) { S.ready = true; } renderAll(); }
    /* ÖNEMLİ: db anlık görüntüleri DONDURULMUŞ gelir. Doğrudan üzerine yazmak
       'use strict' altında TypeError fırlatır ve kaydetme sessizce başarısız olur.
       Bu yüzden gelen her şeyin değiştirilebilir bir kopyasını alıyoruz. */
    function thaw(o) { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return o; } }

    db.doc('config/app').onSnapshot(function (s) {
      if (s.exists) {
        S.config = Object.assign({ people: [], primarySalaryDay: 31, categories: DEFAULT_CATS }, thaw(s.data()));
        if (!S.config.people) S.config.people = [];
        if (!S.config.categories || !S.config.categories.length) S.config.categories = DEFAULT_CATS.slice();
      }
      mark('config');
    }, function () { mark('config'); });

    db.collection('cards').onSnapshot(function (s) {
      S.cards = s.docs.map(function (d) { return Object.assign({ id: d.id }, thaw(d.data())); });
      mark('cards');
    }, function () { mark('cards'); });

    db.collection('recurring').onSnapshot(function (s) {
      S.recurring = s.docs.map(function (d) { return Object.assign({ id: d.id }, thaw(d.data())); });
      mark('recurring');
    }, function () { mark('recurring'); });

    db.collection('plans').onSnapshot(function (s) {
      S.plans = s.docs.map(function (d) { return Object.assign({ id: d.id }, thaw(d.data())); });
      mark('plans');
    }, function () { mark('plans'); });

    db.collection('imports').onSnapshot(function (s) {
      S.imports = s.docs.map(function (d) { return Object.assign({ id: d.id }, thaw(d.data())); });
      mark('imports');
    }, function () { mark('imports'); });

    db.collection('tx').orderBy('month', 'desc').limit(60).onSnapshot(function (s) {
      var b = {};
      s.docs.forEach(function (d) { b[d.id] = thaw(d.data().items || []); });
      S.buckets = b;
      mark('tx');
    }, function () { mark('tx'); });
  },

  loadLocal() {
    try {
      var raw = localStorage.getItem('hz_finans_v3');
      if (raw) {
        var d = JSON.parse(raw);
        S.config = d.config || S.config; S.cards = d.cards || [];
        S.recurring = d.recurring || []; S.plans = d.plans || []; S.buckets = d.buckets || {};
        S.imports = d.imports || [];
      }
    } catch (e) { }
    if (!S.config.categories || !S.config.categories.length) S.config.categories = DEFAULT_CATS;
  },
  saveLocal() {
    try {
      localStorage.setItem('hz_finans_v3', JSON.stringify({
        config: S.config, cards: S.cards, recurring: S.recurring, plans: S.plans, buckets: S.buckets, imports: S.imports
      }));
    } catch (e) { }
  },

  async put(coll, id, data) {
    if (this.db) { try { await this.db.doc(coll + '/' + id).set(data); } catch (e) { toast('Kaydedilemedi: ' + e.code); return false; } }
    else { this.saveLocal(); }
    return true;
  },
  async del(coll, id) {
    if (this.db) { try { await this.db.doc(coll + '/' + id).delete(); } catch (e) { toast('Silinemedi'); return false; } }
    else { this.saveLocal(); }
    return true;
  },
  async putBucket(monthKey, items) {
    items = items || S.buckets[monthKey] || [];
    if (this.db) { try { await this.db.doc('tx/' + monthKey).set({ month: monthKey, items: items }); } catch (e) { toast('Kaydedilemedi: ' + e.code); return false; } }
    else { this.saveLocal(); }
    return true;
  },
  /* Birden fazla ayı yazarken: önce hepsinin kopyasını al, sonra sırayla yaz.
     Aksi hâlde ilk yazmadan dönen anlık görüntü, henüz yazılmamış ayları
     eski hâline çevirir ve ikinci yazma eski veriyi kaydeder. */
  async putBuckets(keys) {
    var list = keys.map(function (k) { return [k, (S.buckets[k] || []).slice()]; }), ok = true;
    for (var i = 0; i < list.length; i++) { if (!(await this.putBucket(list[i][0], list[i][1]))) ok = false; }
    list.forEach(function (x) { S.buckets[x[0]] = x[1]; });
    return ok;
  },
  async saveConfig() {
    S.config.updatedAt = new Date().toISOString();
    return this.put('config', 'app', S.config);
  }
};
function setSync() {
  var d = $('#sync .dot'), t = $('#syncTxt');
  if (Store.mode === 'cloud') { d.classList.remove('off'); t.textContent = 'senkron'; }
  else { d.classList.add('off'); t.textContent = 'yerel'; }
}

/* ────────────────────────────────────────────────── işlem yazma ─── */
async function addTx(tx) {
  tx.id = tx.id || uid('t');
  tx.createdAt = tx.createdAt || new Date().toISOString();
  var mk = D.monthKey(tx.date);
  S.buckets[mk] = (S.buckets[mk] || []).concat([tx]);
  await Store.putBucket(mk);
  renderAll();
  return tx;
}
async function addManyTx(list) {
  var touched = {};
  list.forEach(function (tx) {
    tx.id = tx.id || uid('t');
    var mk = D.monthKey(tx.date);
    S.buckets[mk] = (S.buckets[mk] || []).concat([tx]);
    touched[mk] = 1;
  });
  await Store.putBuckets(Object.keys(touched));
  renderAll();
}
async function delTx(id) {
  for (var mk in S.buckets) {
    var arr = S.buckets[mk] || [], i = arr.findIndex(function (t) { return t.id === id; });
    if (i >= 0) {
      S.buckets[mk] = arr.filter(function (t) { return t.id !== id; });
      await Store.putBucket(mk); renderAll(); return;
    }
  }
}
async function delTxWhere(pred) {
  var touched = {};
  for (var mk in S.buckets) {
    var before = S.buckets[mk].length;
    S.buckets[mk] = S.buckets[mk].filter(function (t) { return !pred(t); });
    if (S.buckets[mk].length !== before) touched[mk] = 1;
  }
  await Store.putBuckets(Object.keys(touched));
  renderAll();
}

/* ═══════════════════════════════════════════════════════ GEZİNME ═══ */
var NAV = [
  { id: 'ozet', label: 'Özet', icon: 'M3 12h4l2.5-7 4 14L16 12h5' },
  { id: 'harcama', label: 'Hareketler', icon: 'M3 6h18v12H3zM3 10h18M7 14h4' },
  { id: 'kartlar', label: 'Kartlar', icon: 'M2 7h20v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7Zm0 4h20M6 16h4' },
  { id: 'odemeler', label: 'Ödemeler', icon: 'M4 4h13l3 3v13H4V4Zm3 5h8M7 13h8M7 17h5' },
  { id: 'analiz', label: 'Analiz', icon: 'M4 20V10m5 10V4m5 16v-7m5 7V8' },
  { id: 'ayarlar', label: 'Ayarlar', icon: 'M4 6h16M4 12h16M4 18h16', deskOnly: true }
];
function buildNav() {
  $('#dnav').innerHTML = NAV.map(function (n) {
    return '<button data-nav="' + n.id + '"' + (S.view === n.id ? ' aria-current="page"' : '') + '>' + n.label + '</button>';
  }).join('');
  /* Mobil alt çubukta 5 sekme; Ayarlar başlıktaki dişli düğmesinde. */
  $('#bnav').innerHTML = NAV.filter(function (n) { return !n.deskOnly; }).map(function (n) {
    return '<button data-nav="' + n.id + '"' + (S.view === n.id ? ' aria-current="page"' : '') + '>' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="' + n.icon + '"/></svg>' +
      '<span>' + n.label + '</span></button>';
  }).join('');
  var gear = $('#gearBtn');
  if (gear) gear.setAttribute('aria-current', S.view === 'ayarlar' ? 'page' : 'false');
}
function go(id) {
  S.view = id;
  document.querySelectorAll('.view').forEach(function (v) { v.classList.toggle('on', v.id === 'v-' + id); });
  buildNav(); renderAll(); window.scrollTo({ top: 0, behavior: 'instant' });
}
document.addEventListener('click', function (e) {
  var n = e.target.closest('[data-nav]'); if (n) { go(n.dataset.nav); return; }
  var a = e.target.closest('[data-act]');
  if (a) {
    /* Sessiz hata olmasın: bir işlem patlarsa kullanıcı görsün. */
    Promise.resolve(handleAct(a.dataset.act, a.dataset, e))
      .catch(function (err) { toast('İşlem tamamlanamadı: ' + (err && err.message ? err.message : err)); });
  }
});
window.addEventListener('unhandledrejection', function (e) {
  toast('Hata: ' + ((e.reason && e.reason.message) || e.reason));
});

/* ═══════════════════════════════════════════════════════ ÖZET ═════ */
/*
  TEK DÖNEM MANTIĞI — uygulamanın tamamı bu kurala göre çalışır.
  ──────────────────────────────────────────────────────────────────
  Dönem, maaşın yattığı gün başlar, bir sonraki maaş gününde biter.
  Maaş günü ayın 31'i ise "Ağustos dönemi" = 31 Ağustos – 29 Eylül.

  Bu aralıkta yapılan HER harcama Ağustos harcamasıdır; çünkü Ağustos
  maaşıyla ödenmiştir. 5 Eylül'de ödenen kira da Ağustos giderindedir.

  Kart borçları kesim tarihine göre değil, SON ÖDEME tarihine göre
  hangi dönemde ödeniyorsa o döneme yazılır. Kesim tarihleri ve ekstre
  dökümleri yalnızca Kartlar sekmesinde görünür — özet sade kalsın.
*/
function maasGunu() { return S.config.primarySalaryDay || 31; }

/** Bir ayın maaş tarihi: 2026-08 + maaş günü 31 → 31.08.2026 */
function maasTarihi(mk) {
  var p = mk.split('-'), y = +p[0], m = +p[1];
  return D.make(y, m, D.clampDay(y, m, maasGunu()));
}
/** O ayın maaşının kapsadığı ödeme penceresi: 31 Ağu – 29 Eyl */
function ayOdemePenceresi(mk) {
  return HZ.SalaryPeriod.forDate(maasTarihi(mk), maasGunu());
}

/**
 * BİR İŞLEM HANGİ AYA YAZILIR?
 * ────────────────────────────
 * · Kredi kartı harcaması → ait olduğu EKSTRENİN ayı.
 *   Ekstrenin ayı = o ekstreyi hangi ayın maaşı ödüyorsa o ay.
 *   Ziraat  24 Tem – 23 Ağu (son ödeme 3 Eyl)  → Ağustos
 *   Garanti 27 Tem – 26 Ağu (son ödeme 5 Eyl)  → Ağustos
 *   İş Bank.  5 Ağu –  4 Eyl (son ödeme 14 Eyl) → Ağustos
 *   24 Ağustos'ta yapılan Ziraat harcaması → son ödeme 3 Ekim → EYLÜL borcu.
 * · Nakit, banka, gelir, kart ödemesi → TAKVİM ayı.
 */
function txAy(t) {
  var kartIsi = (t.kind === KIND.EXPENSE && t.method === METHOD.CARD) || t.kind === KIND.REFUND;
  if (kartIsi && t.cardId) {
    var c = cardById(t.cardId);
    if (c && c.statementDay) {
      /* sdate: ekstre yüklendiyse bankanın bu işlemi koyduğu ekstre; yoksa işlem tarihi */
      var sp = HZ.StatementPeriod.forDate(HZ.cdate(t), c);
      if (sp && sp.dueDate) return HZ.SalaryPeriod.forDate(sp.dueDate, maasGunu()).key;
    }
  }
  return D.monthKey(t.date);
}
/** O aya yazılan tüm işlemler */
function ayTx(mk) {
  return S.transactions.filter(function (t) { return txAy(t) === mk; });
}
function ayRapor(mk) { return HZ.Report.summarize(ayTx(mk), D.monthLabel(mk)); }

/** Ekranda açık olan ay. Varsayılan: bugünün maaşının ait olduğu ay.
    9 Eylül'de maaş 31 Ağustos'ta yattığı için açık ay AĞUSTOS'tur. */
function aktifAy() {
  var simdi = HZ.SalaryPeriod.forDate(D.todayISO(), maasGunu()).key;
  return D.addMonthKey(simdi, S.monthOffset);
}
function ayAdi(mk) { return D.monthLabel(mk); }
function ayKisa(mk) { return D.monthLabel(mk).split(' ')[0]; }

function periodBar(mk) {
  var pen = ayOdemePenceresi(mk);
  return '<div class="periodbar">' +
    '<button class="nudge" data-act="ay" data-d="-1" aria-label="Önceki ay">‹</button>' +
    '<div class="mid">' +
      '<div class="k">Ay</div>' +
      '<div class="v">' + esc(ayAdi(mk)) + '</div>' +
      '<div class="muted">maaş ' + D.trFmt(maasTarihi(mk)) +
        ' · ödemeler ' + esc(pen.label) + '</div>' +
    '</div>' +
    '<button class="nudge" data-act="ay" data-d="1" aria-label="Sonraki ay">›</button>' +
    (S.monthOffset ? '<button class="btn sm" data-act="ay" data-d="0">Bugün</button>' : '') +
  '</div>';
}

/** Büyük, tıklanabilir gösterge kutusu — ilgili sekmeye götürür. */
function tile(k, v, s, cls, git, filtre) {
  return '<button class="tile' + (cls ? ' ' + cls : '') + '" data-act="go" data-go="' + esc(git) + '"' +
    (filtre !== undefined ? ' data-f="' + esc(filtre) + '"' : '') + '>' +
    '<div class="k">' + esc(k) + '</div>' +
    '<div class="v">' + v + '</div>' +
    '<div class="s">' + esc(s) + '</div>' +
    '<div class="go">dokun · düzenle ›</div>' +
  '</button>';
}

function quickbarHtml() {
  var c = cardById(defaultCardId());
  return '<div class="quickbar">' +
    '<button class="qbtn" data-act="quickAdd" data-card="' + esc(c ? c.id : '') + '">' +
      '<b><i></i>Kart harcaması</b><span>' + esc(c ? c.name : 'kart tanımlı değil') + '</span></button>' +
    '<button class="qbtn" data-act="quickAdd" data-method="CASH">' +
      '<b><i style="background:var(--c3)"></i>Nakit harcama</b><span>cepten çıkan para</span></button>' +
    '<button class="qbtn" data-act="incomeNew">' +
      '<b><i style="background:var(--ok)"></i>Gelir ekle</b><span>maaş, ek gelir</span></button>' +
    '<button class="qbtn" data-act="ekstre">' +
      '<b><i style="background:var(--c4)"></i>Ekstre yükle</b><span>elle girdiklerinle eşleştirir</span></button>' +
  '</div>';
}

/** Kısa işlem satırı — her satırda Düzelt ve Sil var. */
function miniRow(t, acikAy) {
  var iade = t.kind === KIND.REFUND;
  var gelir = t.kind === KIND.INCOME || iade, odeme = t.kind === KIND.CARD_PAYMENT;
  var kart = cardById(t.cardId);
  var ay = txAy(t);
  var alt = [D.trFmt(t.date), t.category, kart ? kart.name : '', t.person]
    .filter(function (x) { return x; }).join(' · ');
  return '<div class="rowline">' +
    '<div class="grow"><b>' + esc(t.note || (gelir ? 'Gelir' : odeme ? 'Kart ödemesi' : t.category || '—')) + '</b>' +
      (t.installment ? ' <span class="tag">' + t.installment.no + (t.installment.count ? '/' + t.installment.count : '. taksit') + '</span>' : '') +
      (iade ? ' <span class="tag">iade</span>' : '') +
      (t.ikey ? ' <span class="tag ok" title="Ekstreyle doğrulandı">ekstre ✓</span>' : '') +
      (acikAy && ay !== acikAy ? ' <span class="tag alt">' + esc(ayKisa(ay)) + ' ayı</span>' : '') +
      '<div class="muted">' + esc(alt) + '</div></div>' +
    '<div class="num" style="font-weight:700;color:' +
      (gelir ? 'var(--ok)' : odeme ? 'var(--ink2)' : 'var(--ink)') + '">' +
      (gelir ? '+' : odeme ? '−' : '') + money(t.amount) + '</div>' +
    '<div class="acts">' +
      '<button class="btn sm" data-act="txEdit" data-id="' + esc(t.id) + '">Düzelt</button>' +
      '<button class="btn sm dang" data-act="delTx" data-id="' + esc(t.id) + '" aria-label="Sil">✕</button>' +
    '</div>' +
  '</div>';
}
function txSirala(list) {
  return list.slice().sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.createdAt || '') < (a.createdAt || '') ? -1 : 1;
  });
}

/** Kalan bakiyenin nasıl bulunduğunu açıkça gösteren şerit. */
function hesapSeridi(gelir, cikis, kalanBorc, bakiye) {
  function par(l, v) {
    return '<span class="p"><i>' + esc(l) + '</i>' + money(v, { decimals: false }) + '</span>';
  }
  return '<div class="hesap">' +
    par('gelir', gelir) + '<b>−</b>' +
    par('nakit / banka gideri', cikis) + '<b>−</b>' +
    par('ay borcu', kalanBorc) + '<b>=</b>' +
    '<span class="p son ' + (bakiye >= 0 ? 'ok' : 'warn') + '"><i>kalan</i>' +
      money(bakiye, { decimals: false }) + '</span>' +
    '<span class="not">Kart harcamaların “ay borcu”nun içindedir; bakiyede iki kez sayılmaz.</span>' +
  '</div>';
}

function renderOzet() {
  var el = $('#v-ozet'); if (!el) return;
  var today = D.todayISO(), st = state(), mk = aktifAy();
  var rep = ayRapor(mk);
  var plan = HZ.Planner.plan(st, today, ayOdemePenceresi(mk));
  var tx = ayTx(mk);
  var gelirAdet = tx.filter(function (t) { return t.kind === KIND.INCOME; }).length;
  /* Nakit/banka harcaması: düzenli ödemeye bağlı olanlar borç tarafında sayılır. */
  var nakitGider = tx.reduce(function (a, t) {
    return a + (HZ.isCashOutflow(t) && t.kind === KIND.EXPENSE && !t.recurringId ? t.amount : 0);
  }, 0);

  var toplamBorc = S.cards.reduce(function (a, c) {
    return a + HZ.Cards.currentBalance(c, st.transactions, today);
  }, 0);

  /* Kalan bakiye = gelir − bu dönemdeki nakit çıkışı − henüz ödenmemiş zorunlu ödeme.
     Kartla yapılan alışveriş bu dönem para çıkışı DEĞİLDİR; borcu bir sonraki
     ekstrede ödenir, o yüzden buradan düşülmez. */
  /* Borç kapatmayla (sıfır noktası) ödenmiş sayılan kalemler bu ayın hesabından düşülmez —
     o para kapanıştan önce ödendi; kalan bakiye yeni dönemden itibaren hesaplanır. */
  var ayBorcu = plan.items.reduce(function (a, i) { return a + (i.settled ? 0 : i.total); }, 0);
  var bakiye = rep.totalIncome - nakitGider - ayBorcu;

  var issues = HZ.validate(st).filter(function (i) { return i.level === 'error'; });
  /* Son işlemler HER aydan gelir — az önce girdiğin kayıt her zaman burada görünür. */
  var son = txSirala(S.transactions).slice(0, 8);

  el.innerHTML = '<div class="stack">' +

    periodBar(mk) +
    kapanisSerit() +

    '<div class="tiles">' +
      tile(ayKisa(mk) + ' geliri', money(rep.totalIncome, { decimals: false }),
        gelirAdet ? gelirAdet + ' gelir kaydı' : 'henüz gelir girilmedi',
        'ok', 'harcama', KIND.INCOME) +
      tile(ayKisa(mk) + ' gideri', money(rep.totalExpense, { decimals: false }),
        rep.expenses.length + ' harcama · kart ' + money(rep.cardExpense, { decimals: false }),
        '', 'harcama', KIND.EXPENSE) +
      tile('Toplam kart borcu', money(toplamBorc, { decimals: false }),
        S.cards.length + ' kart · bugünkü bakiye', 'acc', 'kartlar') +
      tile('Kalan bakiye', money(bakiye, { decimals: false }),
        'gelir − nakit gider − ay borcu',
        bakiye >= 0 ? 'ok' : 'warn', 'odemeler') +
    '</div>' +

    hesapSeridi(rep.totalIncome, nakitGider, ayBorcu, bakiye) +

    quickbarHtml() +

    (function () {
      var n = mukerrerGruplari().filter(function (g) { return g.kesin; }).length;
      return n ? '<div class="warnbox" style="align-items:center"><span>⚠</span><div style="flex:1"><b>' + n +
        ' işlem iki kez girilmiş görünüyor</b> — aynı kart, aynı gün, aynı tutar.</div>' +
        '<button class="btn sm" data-act="mukerrer">İncele</button></div>' : '';
    })() +

    (issues.length ? '<div class="warnbox crit"><span>⚠</span><div><b>Veri kontrolü</b><ul>' +
      issues.slice(0, 3).map(function (i) { return '<li>' + esc(i.msg) + '</li>'; }).join('') +
      '</ul></div></div>' : '') +

    (plan.items.length ?
      '<div><div class="sect-h"><h2>' + esc(ayKisa(mk)) + ' borçları</h2>' +
        '<div class="note">' + esc(ayKisa(mk)) + ' maaşıyla · ' + esc(ayOdemePenceresi(mk).label) + '</div></div>' +
        '<div class="paylist">' + plan.items.map(payRow).join('') + '</div></div>'
      : '<div class="panel"><div class="empty"><b>Bu dönemde vadesi gelen ödeme yok</b>' +
        'Kira ve faturaları Ödemeler sekmesinden düzenli ödeme olarak tanımlarsan burada otomatik çıkar.</div></div>') +

    '<div class="panel"><div class="panel-h"><h2>Son girilen işlemler</h2>' +
      '<div class="note"><button class="btn sm" data-act="go" data-go="harcama" data-f="">Tümünü gör ›</button></div></div>' +
      '<div class="panel-b">' +
        (son.length ? son.map(function (t) { return miniRow(t, mk); }).join('')
          : '<div class="empty"><b>Henüz işlem yok</b>' +
            'Sağ alttaki + düğmesiyle harcama, “Gelir ekle” ile maaş girebilirsin.</div>') +
      '</div></div>' +

    '<div class="cardgrid">' +
      '<div class="panel"><div class="panel-h"><h2>Kart limit kullanımı</h2>' +
        '<div class="note"><button class="btn sm" data-act="go" data-go="kartlar">Kartlar ›</button></div></div><div class="panel-b">' +
        (S.cards.length ? sortedCards().filter(function (c) { return c.active !== false; }).map(function (c) {
          var bal = HZ.Cards.currentBalance(c, st.transactions, today);
          var pct = c.limit ? Math.min(100, bal / c.limit * 100) : 0;
          var cls = pct > 85 ? 'hot' : pct > 60 ? 'warm' : 'cool';
          return '<div class="mrow"><div class="t"><b>' + esc(c.name) + '</b><span>' +
            money(bal, { decimals: false }) + ' / ' + money(c.limit, { decimals: false }) + '</span></div>' +
            '<div class="meter"><i class="' + cls + '" style="width:' + pct.toFixed(1) + '%"></i></div>' +
            '<div class="t"><span>kullanılabilir ' + money(c.limit - bal, { decimals: false }) + '</span>' +
            '<span>%' + pct.toFixed(0) + '</span></div></div>';
        }).join('') : '<div class="empty">Henüz kart yok</div>') +
      '</div></div>' +

      '<div class="panel"><div class="panel-h"><h2>Kişi bazlı harcama</h2>' +
        '<div class="note">' + esc(ayAdi(mk)) + '</div></div><div class="panel-b">' +
        personBars(rep) + '</div></div>' +
    '</div>' +

  '</div>';
}

function kpi(k, v, s, cls) {
  return '<div class="kpi"><div class="k">' + esc(k) + '</div>' +
    '<div class="v ' + (cls || '') + '">' + v + '</div><div class="s">' + esc(s) + '</div></div>';
}

function payRow(i) {
  var soon = i.status !== 'PAID' && i.daysToDue >= 0 && i.daysToDue <= 3;
  var cls = i.status === 'PAID' ? 'PAID' : i.status === 'OVERDUE' ? 'OVERDUE' : soon ? 'SOON' : i.status;
  var pillTxt = i.status === 'PAID' ? 'Ödendi'
    : i.status === 'OVERDUE' ? (-i.daysToDue) + ' gün gecikti'
    : i.status === 'PARTIAL' ? 'Kısmi · kalan ' + money(i.remaining, { decimals: false })
    : i.daysToDue === 0 ? 'Bugün son gün' : i.daysToDue + ' gün kaldı';
  var pillCls = i.status === 'PAID' ? 'PAID' : i.status === 'OVERDUE' ? 'OVERDUE' : soon ? 'SOON' : i.status === 'PARTIAL' ? 'PARTIAL' : 'UNPAID';
  return '<div class="payrow s-' + cls + '">' +
    '<div class="stripe"></div>' +
    '<div class="mid">' +
      '<div class="nm">' + esc(i.name) +
        (i.type === 'CARD' ? '<span class="pill ghost">ekstre</span>' : '') + '</div>' +
      '<div class="sub"><span>' + esc(i.sub || '') + '</span><span>son ödeme ' + D.trFmt(i.dueDate) + '</span>' +
        (i.person ? '<span>' + esc(i.person) + '</span>' : '') + '</div>' +
    '</div>' +
    '<div class="rt">' +
      '<div class="amt">' + money(i.remaining > 0 ? i.remaining : i.total, { decimals: false }) + '</div>' +
      '<span class="pill ' + pillCls + '">' + pillTxt + '</span>' +
      (i.status !== 'PAID' ? '<button class="btn sm pri" data-act="payItem" data-id="' + esc(i.id) + '">Öde</button>' : '') +
    '</div></div>';
}

function personBars(rep) {
  var people = (S.config.people || []).map(function (p) { return p.name; });
  Object.keys(rep.byPerson).forEach(function (k) { if (people.indexOf(k) < 0) people.push(k); });
  var max = Math.max.apply(null, people.map(function (p) { return rep.byPerson[p] || 0; }).concat([1]));
  var total = rep.totalExpense;
  if (!total) return '<div class="empty">Bu dönemde harcama kaydı yok</div>';
  return '<div class="barlist">' + people.map(function (p, idx) {
    var v = rep.byPerson[p] || 0;
    return '<div class="row"><div class="nm">' + esc(p) + '</div>' +
      '<div class="tr"><i style="width:' + (v / max * 100).toFixed(1) + '%;background:' + catColor(idx) + '"></i></div>' +
      '<div class="val">' + money(v, { decimals: false }) + '</div></div>';
  }).join('') + '</div>' +
    '<div class="rowline" style="border-top:1px solid var(--brd);border-bottom:0;margin-top:8px;padding-top:10px">' +
    '<span class="grow lbl">Toplam</span><span class="num" style="font-weight:700">' +
    money(total, { decimals: false }) + '</span></div>';
}


/* ═══════════════════════════════════════════════════ HAREKETLER ═══ */
/* Dönemin tüm hareketleri: gelir, gider ve kart ödemeleri tek listede.
   Her satır düzeltilebilir ve silinebilir. */
function renderHarcamalar() {
  var el = $('#v-harcama'); if (!el) return;
  var mk = aktifAy();
  var rep = S.tumu ? HZ.Report.summarize(S.transactions, 'Tüm işlemler') : ayRapor(mk);

  el.innerHTML = '<div class="stack">' +
    quickbarHtml() +
    periodBar(mk) +

    '<div class="seg" style="max-width:340px;margin:0 auto">' +
      '<button data-act="kapsam" data-v="ay" aria-pressed="' + (!S.tumu) + '">' + esc(ayKisa(mk)) + ' ayı</button>' +
      '<button data-act="kapsam" data-v="tum" aria-pressed="' + (!!S.tumu) + '">Tüm işlemler</button>' +
    '</div>' +

    '<div class="kpis">' +
      kpi('Gelir', money(rep.totalIncome, { decimals: false }), S.tumu ? 'tüm zamanlar' : 'bu ay yatan', 'pos') +
      kpi('Gider', money(rep.totalExpense, { decimals: false }), rep.expenses.length + ' harcama', '') +
      kpi('Nakit / banka', money(rep.cashExpense + rep.bankExpense, { decimals: false }), 'doğrudan hesaptan', '') +
      kpi('Kredi kartı', money(rep.cardExpense, { decimals: false }),
        'taksitli ' + money(rep.installmentExpense, { decimals: false }), '') +
    '</div>' +

    '<div class="panel"><div class="panel-h"><h2>İşlemler</h2>' +
      '<div class="note">' + (S.tumu ? 'tüm kayıtlar' : esc(ayAdi(mk))) + '</div></div>' +
      '<div class="panel-b">' + txFilters() +
        '<div id="txTableHost">' + txTable(mk) + '</div></div></div>' +

  '</div>';
  bindFilters();
}

/* --- filtre çubuğu + işlem tablosu ---------------------------------- */
function txKinds() {
  return [['', 'Tüm işlemler'], [KIND.EXPENSE, 'Harcamalar'],
          [KIND.INCOME, 'Gelirler'], [KIND.CARD_PAYMENT, 'Kart ödemeleri'], [KIND.REFUND, 'İadeler']];
}
function optList(pairs, sel) {
  return pairs.map(function (p) {
    return '<option value="' + esc(p[0]) + '"' + (String(sel || '') === String(p[0]) ? ' selected' : '') +
      '>' + esc(p[1]) + '</option>';
  }).join('');
}
function txFilters() {
  var f = S.filters;
  var cats = (S.config.categories || DEFAULT_CATS).map(function (c) { return [c, c]; });
  var kisiler = (S.config.people || []).map(function (p) { return [p.name, p.name]; });
  var kartlar = sortedCards().map(function (c) { return [c.id, c.name]; });
  var acik = !!(f.q || f.kind || f.cat || f.person || f.card);
  return '<div class="txf">' +
    '<input id="fq" type="search" placeholder="Ara — not, kategori, kişi" value="' + esc(f.q) + '">' +
    '<select id="fkind" aria-label="İşlem türü">' + optList(txKinds(), f.kind) + '</select>' +
    '<select id="fcat" aria-label="Kategori">' + optList([['', 'Tüm kategoriler']].concat(cats), f.cat) + '</select>' +
    '<select id="fperson" aria-label="Kişi">' + optList([['', 'Herkes']].concat(kisiler), f.person) + '</select>' +
    '<select id="fcard" aria-label="Kart">' + optList([['', 'Tüm kartlar']].concat(kartlar), f.card) + '</select>' +
    (acik ? '<button class="btn sm" data-act="fClear">Filtreyi temizle</button>' : '') +
    '</div>';
}
function txMatch(t) {
  var f = S.filters;
  if (f.kind && t.kind !== f.kind) return false;
  if (f.cat && t.category !== f.cat) return false;
  if (f.person && t.person !== f.person) return false;
  if (f.card && t.cardId !== f.card) return false;
  if (f.q) {
    var q = f.q.toLocaleLowerCase('tr');
    var kart = cardById(t.cardId);
    var saman = [t.note, t.category, t.person, kart ? kart.name : ''].join(' ').toLocaleLowerCase('tr');
    if (saman.indexOf(q) < 0) return false;
  }
  return true;
}
var METHOD_TR = { CASH: 'Nakit', CREDIT_CARD: 'Kredi kartı', BANK_ACCOUNT: 'Banka' };
function txTable(mk) {
  var hepsi = S.tumu ? S.transactions.slice() : ayTx(mk);
  var rows = txSirala(hepsi.filter(txMatch));
  if (!rows.length) {
    return '<div class="empty"><b>' +
      (hepsi.length ? 'Bu filtreye uyan kayıt yok' : 'Bu ayda kayıt yok') + '</b>' +
      (hepsi.length ? 'Filtreyi temizleyip tekrar deneyin.'
        : '“Tüm işlemler”e geçerek diğer aylardaki kayıtları görebilirsin.') + '</div>';
  }
  var gider = rows.reduce(function (s, t) { return s + (HZ.isExpense(t) ? t.amount : 0); }, 0);
  var gelir = rows.reduce(function (s, t) { return s + (t.kind === KIND.INCOME ? t.amount : 0); }, 0);
  return '<div class="tblwrap"><table>' +
    '<thead><tr><th>Tarih</th><th>Açıklama</th><th>Kategori</th><th>Yöntem</th>' +
    '<th class="r">Tutar</th><th></th></tr></thead><tbody>' +
    rows.map(function (t) {
      var kart = cardById(t.cardId);
      var iade = t.kind === KIND.REFUND;
      var gelirMi = t.kind === KIND.INCOME || iade, odeme = t.kind === KIND.CARD_PAYMENT;
      var renk = gelirMi ? 'var(--ok)' : odeme ? 'var(--ink2)' : 'var(--ink)';
      var isaret = gelirMi ? '+' : odeme ? '−' : '';
      return '<tr>' +
        '<td class="num" style="white-space:nowrap">' + D.trFmt(t.date) +
          (S.tumu ? '<div class="muted">' + esc(ayKisa(txAy(t))) + ' ayı</div>' : '') + '</td>' +
        '<td>' + esc(t.note || (gelirMi ? 'Gelir' : odeme ? 'Kart ödemesi' : '—')) +
          (t.installment ? ' <span class="tag">' + t.installment.no + (t.installment.count ? '/' + t.installment.count : '. taksit') + '</span>' : '') +
          (iade ? ' <span class="tag">iade</span>' : '') +
          (t.ikey ? ' <span class="tag ok" title="Ekstreyle doğrulandı">ekstre ✓</span>' : '') +
          (t.person ? '<div class="muted"><span class="owner-dot" style="background:' +
            personColor(t.person) + '"></span>' + esc(t.person) + '</div>' : '') +
        '</td>' +
        '<td>' + esc(t.category || '—') + '</td>' +
        '<td class="muted">' + esc(METHOD_TR[t.method] || t.method || '—') +
          (kart ? '<div class="muted">' + esc(kart.name) + '</div>' : '') + '</td>' +
        '<td class="r num" style="font-weight:700;color:' + renk + '">' + isaret + money(t.amount) + '</td>' +
        '<td class="r" style="white-space:nowrap">' +
          '<button class="btn sm" data-act="txEdit" data-id="' + esc(t.id) + '">Düzelt</button> ' +
          '<button class="btn sm dang" data-act="delTx" data-id="' + esc(t.id) + '" aria-label="Sil">✕</button></td>' +
        '</tr>';
    }).join('') + '</tbody></table></div>' +
    '<div class="rowline" style="border-bottom:0;justify-content:space-between;flex-wrap:wrap;gap:6px">' +
      '<span class="muted">' + rows.length + ' kayıt' +
        (rows.length !== hepsi.length ? ' (toplam ' + hepsi.length + ' içinden)' : '') + '</span>' +
      '<span class="num" style="font-weight:700">' +
        (gelir ? 'Gelir ' + money(gelir, { decimals: false }) + '  ·  ' : '') +
        'Gider ' + money(gider, { decimals: false }) + '</span>' +
    '</div>';
}
function txTabloTazele() {
  var host = $('#txTableHost');
  if (host) host.innerHTML = txTable(aktifAy());
  else renderHarcamalar();
}
function bindFilters() {
  var q = $('#fq');
  if (q) q.addEventListener('input', function () { S.filters.q = q.value; txTabloTazele(); });
  [['#fkind', 'kind'], ['#fcat', 'cat'], ['#fperson', 'person'], ['#fcard', 'card']].forEach(function (p) {
    var el = $(p[0]);
    if (el) el.addEventListener('change', function () { S.filters[p[1]] = el.value; renderHarcamalar(); });
  });
}


/* ═══════════════════════════════════════════════════════ KARTLAR ══ */
function renderKartlar() {
  var el = $('#v-kartlar'); if (!el) return;
  var today = D.todayISO(), txs = S.transactions;

  el.innerHTML = '<div class="stack">' +
    '<div class="sect-h"><h2>Kredi kartları</h2><div class="note"><button class="btn sm" data-act="cardNew">+ Kart ekle</button></div></div>' +
    (S.cards.length ? '<div class="cardgrid">' + sortedCards().map(function (c) {
      var snap = HZ.Cards.snapshot(c, txs, today);
      var last = snap.lastStatement, cur = snap.currentPeriod;
      var pct = c.limit ? Math.min(100, snap.currentBalance / c.limit * 100) : 0;
      var mcls = pct > 85 ? 'hot' : pct > 60 ? 'warm' : 'cool';
      var stat = last ? last.status : 'NONE';
      var pillTxt = { PAID: 'Ödendi', PARTIAL: 'Kısmi ödendi', OVERDUE: 'Gecikmiş', UNPAID: 'Ödenmedi', NONE: 'Borç yok' }[stat];
      return '<div class="ccard">' +
        '<div class="hd">' +
          '<div class="nm">' + esc(c.name) + (c.active === false ? ' <span class="pill ghost">pasif</span>' : '') + '</div>' +
          '<div class="who"><span class="owner-dot" style="background:' + personColor(c.owner) + '"></span>' + esc(c.owner || '') +
            ' · ' + esc(c.bank || '') + (c.last4 ? ' ····' + esc(c.last4) : '') + '</div>' +
        '</div>' +
        '<div class="bd">' +
          '<div class="meter" style="margin-bottom:9px"><i class="' + mcls + '" style="width:' + pct.toFixed(1) + '%"></i></div>' +
          '<dl class="dl">' +
            '<dt>Güncel borç</dt><dd>' + money(snap.currentBalance) + '</dd>' +
            '<dt>Kullanılabilir limit</dt><dd' + (snap.availableLimit < 0 ? ' style="color:var(--crit)"' : '') + '>' + money(snap.availableLimit) + '</dd>' +
            '<dt>Toplam limit</dt><dd>' + money(c.limit, { decimals: false }) + '</dd>' +
            '<div class="sep"></div>' +
            (last ?
              '<dt>Dönem borcu <span class="muted">(' + esc(last.period.label) + ')</span></dt><dd>' + money(last.statementBalance) + '</dd>' +
              '<dt>Ödenen</dt><dd style="color:var(--ok)">' + money(last.paid) + '</dd>' +
              '<dt>Kalan</dt><dd style="color:' + (last.remaining > 0 ? 'var(--acc)' : 'var(--ok)') + '">' + money(last.remaining) + '</dd>' +
              '<dt>Asgari ödeme</dt><dd>' + money(last.minimum) + '</dd>' +
              '<dt>Son ödeme</dt><dd>' + (last.dueDate ? D.trFmt(last.dueDate) : '—') + '</dd>'
              : '<dt>Hesap kesim günü tanımlı değil</dt><dd>—</dd>') +
            '<div class="sep"></div>' +
            '<dt>Varsayılan kesim / son ödeme günü</dt><dd>' + (c.statementDay || '—') + ' / ' + (c.dueDay || '—') + '</dd>' +
            (cur ? '<dt>Açık dönem harcaması</dt><dd>' + money(cur.periodSpend) + '</dd>' +
                   '<dt>Açık dönem kesim</dt><dd>' + D.trFmt(cur.period.close) + '</dd>' : '') +
          '</dl>' +
          (last && last.remaining > 0 ? '<div style="margin-top:10px"><span class="pill ' + (stat === 'OVERDUE' ? 'OVERDUE' : stat === 'PARTIAL' ? 'PARTIAL' : 'UNPAID') + '">' + pillTxt + '</span></div>' : '') +
          ekstreTakvimi(c) +
        '</div>' +
        '<div class="ft">' +
          '<button class="btn sm pri" data-act="ekstre" data-id="' + esc(c.id) + '">Ekstre yükle</button>' +
          '<button class="btn sm" data-act="cardPay" data-id="' + esc(c.id) + '">Ödeme yap</button>' +
          (last ? '<button class="btn sm" data-act="stmt" data-id="' + esc(c.id) +
            '" data-k="' + esc(last.period.periodKey) + '">Ekstre dökümü</button>' : '') +
          '<button class="btn sm" data-act="quickAdd" data-card="' + esc(c.id) + '">Harcama ekle</button>' +
          '<button class="btn sm" data-act="cardEdit" data-id="' + esc(c.id) + '">Düzenle</button>' +
        '</div></div>';
    }).join('') + '</div>'
      : '<div class="panel"><div class="empty"><b>Henüz kart eklenmedi</b>Kart ekleyerek hesap kesim ve son ödeme takibini başlatın.</div></div>') +

    /* kart ödemeleri geçmişi */
    '<div class="panel"><div class="panel-h"><h2>Kart ödemeleri</h2><div class="note">gider değildir — nakit çıkışı olarak izlenir</div></div>' +
    '<div class="panel-b">' + cardPaymentTable() + '</div></div>' +
    '</div>';
}

function cardPaymentTable() {
  var rows = S.transactions.filter(function (t) { return t.kind === KIND.CARD_PAYMENT; })
    .sort(function (a, b) { return D.cmp(b.date, a.date); }).slice(0, 15);
  if (!rows.length) return '<div class="empty">Henüz kart ödemesi kaydedilmedi</div>';
  return '<div class="tblwrap"><table><thead><tr><th>Tarih</th><th>Kart</th><th>Kişi</th><th>Not</th><th class="r">Tutar</th><th></th></tr></thead><tbody>' +
    rows.map(function (t) {
      var c = cardById(t.cardId);
      return '<tr><td class="num">' + D.trFmt(t.date) + '</td><td>' + esc(c ? c.name : '—') + '</td>' +
        '<td>' + esc(t.person || '') + '</td><td class="muted">' + esc(t.note || '') + '</td>' +
        '<td class="r num" style="font-weight:700">' + money(t.amount) + '</td>' +
        '<td class="r" style="white-space:nowrap">' +
          '<button class="btn sm" data-act="txEdit" data-id="' + esc(t.id) + '" title="Düzenle">Düzelt</button> ' +
          '<button class="btn sm dang" data-act="delTx" data-id="' + esc(t.id) + '" title="Sil">✕</button></td></tr>';
    }).join('') + '</tbody></table></div>';
}

/* ═══════════════════════════════════════════════════ ÖDEMELER ═════ */
function renderOdemeler() {
  var el = $('#v-odemeler'); if (!el) return;
  var today = D.todayISO(), st = state(), mk = aktifAy();
  var period = ayOdemePenceresi(mk);
  var plan = HZ.Planner.plan(st, today, period);

  el.innerHTML = '<div class="stack">' +
    periodBar(mk) +

    '<div class="panel"><div class="panel-h"><h2>' + esc(ayKisa(mk)) + ' borçları</h2>' +
      '<div class="note">toplam ' + money(plan.totalRequired, { decimals: false }) + ' · kalan ' + money(plan.totalRemaining, { decimals: false }) + '</div></div>' +
      '<div class="panel-b">' + (plan.items.length ? '<div class="tblwrap"><table>' +
        '<thead><tr><th>Kalem</th><th>Öncelik</th><th>Son ödeme</th><th class="r">Toplam</th><th class="r">Ödenen</th><th class="r">Kalan</th><th>Durum</th><th></th></tr></thead><tbody>' +
        plan.items.map(function (i) {
          var soon = i.status !== 'PAID' && i.daysToDue >= 0 && i.daysToDue <= 3;
          var pc = i.status === 'PAID' ? 'PAID' : i.status === 'OVERDUE' ? 'OVERDUE' : soon ? 'SOON' : i.status === 'PARTIAL' ? 'PARTIAL' : 'UNPAID';
          var pt = { PAID: 'Tamamlandı', OVERDUE: 'Gecikmiş', PARTIAL: 'Kısmen ödendi', UNPAID: 'Ödenmedi' }[i.status] || i.status;
          return '<tr><td><b>' + esc(i.name) + '</b><div class="muted">' + esc(i.sub || '') + '</div></td>' +
            '<td><span class="tag">' + esc(HZ.PRIORITY_TR[i.priority] || i.priority) + '</span></td>' +
            '<td class="num">' + D.trFmt(i.dueDate) + '</td>' +
            '<td class="r num">' + money(i.total) + '</td>' +
            '<td class="r num" style="color:var(--ok)">' + money(i.paid) + '</td>' +
            '<td class="r num" style="font-weight:700">' + money(i.remaining) + '</td>' +
            '<td><span class="pill ' + pc + '">' + pt + '</span></td>' +
            '<td class="r">' + (i.status !== 'PAID' ? '<button class="btn sm pri" data-act="payItem" data-id="' + esc(i.id) + '">Öde</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">Bu dönemde vadesi gelen yükümlülük yok</div>') +
    '</div></div>' +

    /* düzenli ödemeler */
    '<div class="panel"><div class="panel-h"><h2>Düzenli ödeme tanımları</h2>' +
      '<div class="note"><button class="btn sm" data-act="recNew">+ Ekle</button></div></div><div class="panel-b">' +
      '<div class="muted" style="margin-bottom:12px">Kira, aidat ve faturaları buraya bir kez tanımla; her dönem ' +
      'yukarıdaki listede otomatik çıkar. Ödediğinde <b>Öde</b> düğmesine bas — harcama kaydı kendiliğinden oluşur, ' +
      'ayrıca elle girmene gerek kalmaz.</div>' +
      (S.recurring.length ? S.recurring.map(function (r) {
        return '<div class="rowline">' +
          '<div class="grow"><b>' + esc(r.name) + '</b>' + (r.active === false ? ' <span class="pill ghost">pasif</span>' : '') +
          '<div class="muted">' + esc(r.category || '') + ' · her ayın ' + r.dueDay + '\'i · ' + esc(r.owner || '') +
          ' · <span class="tag">' + esc(HZ.PRIORITY_TR[r.priority] || 'Orta') + '</span></div></div>' +
          '<div class="num" style="font-weight:700">' + money(r.amount) + '</div>' +
          '<button class="btn sm" data-act="recEdit" data-id="' + esc(r.id) + '">Düzenle</button>' +
          '</div>';
      }).join('') : '<div class="empty"><b>Düzenli ödeme tanımlı değil</b>Kira, aidat, faturalar buraya eklenir.</div>') +
    '</div></div>' +

    /* taksitler */
    '<div class="panel"><div class="panel-h"><h2>Taksitler</h2>' +
      '<div class="note"><button class="btn sm" data-act="planNew">+ Taksitli alışveriş</button></div></div><div class="panel-b">' +
      renderPlans() + '</div></div>' +

    '</div>';
}

function renderPlans() {
  if (!S.plans.length) return '<div class="empty"><b>Aktif taksit yok</b>Taksitli alışveriş eklendiğinde tüm taksitler ilgili ekstre dönemlerine otomatik dağıtılır.</div>';
  var today = D.todayISO(), txs = S.transactions;
  return S.plans.map(function (p) {
    var rows = txs.filter(function (t) { return t.installment && t.installment.groupId === p.id; })
      .sort(function (a, b) { return D.cmp(a.date, b.date); });
    var doneN = rows.filter(function (t) { return D.lte(t.date, today); }).length;
    var paid = rows.filter(function (t) { return D.lte(t.date, today); }).reduce(function (s, t) { return s + t.amount; }, 0);
    var c = cardById(p.cardId);
    if (p.kapandi) { doneN = p.count; paid = p.totalAmount; }
    var pctN = p.count ? doneN / p.count * 100 : 0;
    var next = rows.filter(function (t) { return D.serial(t.date) > D.serial(today); })[0];
    return '<div class="mrow" style="padding:12px 0">' +
      '<div class="t"><b>' + esc(p.name) + '</b><span>' + doneN + '/' + p.count + ' taksit</span></div>' +
      '<div class="meter"><i style="width:' + pctN.toFixed(1) + '%"></i></div>' +
      '<div class="t"><span>' + esc(c ? c.name : '—') + ' · ' + esc(p.person || '') + ' · ' + esc(p.category || '') + '</span>' +
        '<span>' + money(rows[0] ? rows[0].amount : 0) + ' × ' + p.count + ' = ' + money(p.totalAmount) + '</span></div>' +
      '<div class="t"><span>ödenen ' + money(paid, { decimals: false }) + ' · kalan ' + money(p.totalAmount - paid, { decimals: false }) + '</span>' +
        '<span>' + (p.kapandi ? D.trFmt(p.kapandi) + ' erken kapatıldı' : next ? 'sonraki taksit ' + D.trFmt(next.date) : 'tamamlandı') + '</span></div>' +
      '<div style="margin-top:6px"><button class="btn sm dang" data-act="planDel" data-id="' + esc(p.id) + '">Planı sil</button></div>' +
      '</div>';
  }).join('');
}

/* ═══════════════════════════════════════════════════════ ANALİZ ═══ */
/* ══════════════════════════════════════════════════════════ ANALİZ ═══
   Salt okunur. Kendi ay ve dönem seçimi vardır; Özet sekmesinin seçtiği
   dönemi ETKİLEMEZ ve hiçbir veriyi değiştirmez.
   ═══════════════════════════════════════════════════════════════════ */
function renderAnaliz() {
  var el = $('#v-analiz'); if (!el) return;
  var s = state(), today = D.todayISO();
  if (!S.an) S.an = { mo: 0, span: 6 };
  var ak = D.addMonthKey(D.monthKey(today), S.an.mo);
  var span = S.an.span;

  var months = [];
  for (var i = span - 1; i >= 0; i--) {
    var key = D.addMonthKey(ak, -i);
    var r = ayRapor(key);
    var beklenen = (S.config.people || []).reduce(function (a, p) { return a + (p.monthlySalary || 0); }, 0);
    months.push({
      key: key, kisa: D.monthLabel(key).split(' ')[0].slice(0, 3),
      gelir: beklenen + r.totalIncome, gider: r.totalExpense, rep: r
    });
  }
  var cur = months[months.length - 1];
  var topGelir = months.reduce(function (a, m) { return a + m.gelir; }, 0);
  var topGider = months.reduce(function (a, m) { return a + m.gider; }, 0);
  var labels = months.map(function (m) { return m.kisa; });
  var GELIR = 'var(--c3)', GIDER = 'var(--c2)';
  var seri = [
    { name: 'Gelir', c: GELIR, data: months.map(function (m) { return m.gelir; }) },
    { name: 'Gider', c: GIDER, data: months.map(function (m) { return m.gider; }) }
  ];
  var f = function (v) { return money(v, { decimals: false }); };

  var HUE = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)'];
  var cats = Object.entries(cur.rep.byCategory).sort(function (a, b) { return b[1] - a[1]; });
  var slices = cats.slice(0, 4).map(function (c, i) { return { k: c[0], v: c[1], c: HUE[i] }; });
  var kalan = cats.slice(4).reduce(function (a, c) { return a + c[1]; }, 0);
  if (kalan > 0) slices.push({ k: 'Diğer kategoriler', v: kalan, c: 'var(--ink3)' });
  var toplamKat = cur.rep.totalExpense;
  var bos = topGelir === 0 && topGider === 0;

  el.innerHTML = '<div class="stack">' +

    '<div class="periodbar">' +
      '<button class="nudge" data-act="anMo" data-d="-1" aria-label="Önceki ay">‹</button>' +
      '<div class="mid"><div class="k">Analiz · sadece gösterir</div>' +
        '<div class="v">' + esc(D.monthLabel(ak)) + '</div></div>' +
      '<button class="nudge" data-act="anMo" data-d="1" aria-label="Sonraki ay"' + (S.an.mo >= 0 ? ' disabled' : '') + '>›</button>' +
      '<div class="seg" style="width:190px;flex:none">' +
        [3, 6, 12].map(function (n) {
          return '<button data-act="anSpan" data-v="' + n + '" aria-pressed="' + (span === n ? 'true' : 'false') + '">' + n + ' ay</button>';
        }).join('') + '</div>' +
    '</div>' +
    '<div class="muted" style="text-align:center;margin-top:-8px">Bu sayfadaki seçimler diğer sekmeleri etkilemez; hiçbir veri değişmez.</div>' +

    (bos ? '<div class="panel"><div class="empty"><b>Henüz veri yok</b>Gelir ve harcama girdikçe grafikler burada oluşur.</div></div>' : '') +

    '<div class="panel"><div class="panel-h"><h2>Gelir ↔ gider karşılaştırması</h2><div class="note">son ' + span + ' ay</div></div>' +
      '<div class="panel-b">' + HZChart.bars(labels, seri, { fmt: f, title: 'Gelir ve gider' }) +
      HZChart.legend([{ name: 'Gelir', c: GELIR, value: f(topGelir) }, { name: 'Gider', c: GIDER, value: f(topGider) }]) +
      '<div class="kpis" style="margin-top:14px">' +
        kpi('Toplam gelir', f(topGelir), span + ' aylık', 'pos') +
        kpi('Toplam gider', f(topGider), span + ' aylık', '') +
        kpi('Fark', f(topGelir - topGider), 'gelir − gider', topGelir - topGider >= 0 ? 'pos' : 'neg') +
        kpi('Aylık ortalama gider', f(Math.round(topGider / span)), span + ' ayın ortalaması', '') +
      '</div></div></div>' +

    '<div class="panel"><div class="panel-h"><h2>Aylık seyir</h2><div class="note">eğri grafik</div></div>' +
      '<div class="panel-b">' + HZChart.line(labels, seri, { fmt: f, title: 'Aylık gelir ve gider eğrisi' }) +
      HZChart.legend([{ name: 'Gelir', c: GELIR }, { name: 'Gider', c: GIDER }]) + '</div></div>' +

    '<div class="cardgrid">' +
      '<div class="panel"><div class="panel-h"><h2>Harcama kırılımı</h2><div class="note">' + esc(D.monthLabel(ak)) + '</div></div>' +
        '<div class="panel-b">' + (toplamKat ?
          '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">' +
            '<div style="flex:none;width:190px">' + HZChart.pie(slices, { fmt: f, title: D.monthLabel(ak).split(' ')[0].toLocaleUpperCase('tr'), size: 220 }) + '</div>' +
            '<div style="flex:1;min-width:180px;display:flex;flex-direction:column;gap:9px">' +
              slices.map(function (x) {
                return '<div style="display:flex;align-items:center;gap:9px;font-size:12.5px">' +
                  '<i style="width:10px;height:10px;border-radius:3px;flex:none;background:' + x.c + '"></i>' +
                  '<span style="flex:1;color:var(--ink2)">' + esc(x.k) + '</span>' +
                  '<span class="muted" style="width:34px;text-align:right">%' + (x.v / toplamKat * 100).toFixed(0) + '</span>' +
                  '<b class="num">' + f(x.v) + '</b></div>';
              }).join('') +
            '</div></div>'
          : '<div class="empty">' + esc(D.monthLabel(ak)) + ' ayında harcama kaydı yok</div>') + '</div></div>' +

      '<div class="panel"><div class="panel-h"><h2>Ay ay özet</h2></div><div class="panel-b">' +
        months.slice().reverse().map(function (m) {
          var net = m.gelir - m.gider;
          return '<div class="rowline"><div class="grow"><b>' + esc(D.monthLabel(m.key)) + '</b>' +
            '<div class="muted">nakit ' + f(m.rep.cashExpense + m.rep.bankExpense) + ' · kart ' + f(m.rep.cardExpense) + '</div></div>' +
            '<div style="text-align:right"><div class="num" style="font-weight:700">' + f(m.gider) + '</div>' +
            '<div class="muted" style="color:' + (net >= 0 ? 'var(--ok)' : 'var(--crit)') + '">net ' + f(net) + '</div></div></div>';
        }).join('') + '</div></div>' +
    '</div>' +

  '</div>';
}


/* ═══════════════════════════════════════════════════════ AYARLAR ══ */
function renderAyarlar() {
  var el = $('#v-ayarlar'); if (!el) return;
  var issues = HZ.validate(state());

  el.innerHTML = '<div class="stack">' +

    '<div class="panel"><div class="panel-h"><h2>Kişiler ve maaş günleri</h2>' +
      '<div class="note"><button class="btn sm" data-act="personNew">+ Kişi</button></div></div><div class="panel-b">' +
      ((S.config.people || []).length ? (S.config.people).map(function (p, i) {
        return '<div class="rowline">' +
          '<span class="owner-dot" style="background:' + catColor(i) + '"></span>' +
          '<div class="grow"><b>' + esc(p.name) + '</b><div class="muted">her ayın ' + p.salaryDay + '\'i' + (p.salaryDay === 31 ? ' (ay sonu)' : '') + '</div></div>' +
          '<div class="num" style="font-weight:700">' + money(p.monthlySalary || 0, { decimals: false }) + '</div>' +
          '<button class="btn sm" data-act="personEdit" data-i="' + i + '">Düzenle</button></div>';
      }).join('') : '<div class="empty">Kişi tanımlanmadı</div>') +
      '<hr class="d">' +
      '<div class="f"><span>Planlama için ana maaş günü</span>' +
        '<select id="setPrimary">' + [1, 5, 10, 15, 20, 25, 28, 30, 31].map(function (d) {
          return '<option value="' + d + '"' + ((S.config.primarySalaryDay || 31) === d ? ' selected' : '') + '>Ayın ' + d + '\'i' + (d === 31 ? ' (ay sonu)' : '') + '</option>';
        }).join('') + '</select>' +
        '<div class="muted">Maaş dönemi bu güne göre hesaplanır. 31 seçilirse şubatta 28/29\'a, 30 günlük aylarda 30\'a kırpılır.</div></div>' +
    '</div></div>' +

    '<div class="panel"><div class="panel-h"><h2>Kartlar</h2><div class="note"><button class="btn sm" data-act="cardNew">+ Kart</button></div></div><div class="panel-b">' +
      (S.cards.length ? sortedCards().map(function (c) {
        return '<div class="rowline"><div class="grow"><b>' + esc(c.name) + '</b>' +
          (c.id === S.config.defaultCardId ? ' <span class="pill ghost">varsayılan</span>' : '') +
          '<div class="muted">' + esc(c.bank || '') + ' · ' + esc(c.owner || '') + ' · kesim ' + (c.statementDay || '—') + ' · son ödeme ' + (c.dueDay || '—') + '</div></div>' +
          '<div class="num">' + money(c.limit, { decimals: false }) + '</div>' +
          '<button class="btn sm" data-act="cardEdit" data-id="' + esc(c.id) + '">Düzenle</button></div>';
      }).join('') : '<div class="empty">Kart yok</div>') +
      (S.cards.length ? '<hr class="d"><div class="f"><span>Varsayılan kart</span>' +
        '<select id="setDefaultCard">' + sortedCards().map(function (c) {
          return '<option value="' + esc(c.id) + '"' + (S.config.defaultCardId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
        }).join('') + '</select>' +
        '<div class="muted">Hızlı harcama ekranı bu kartla açılır ve tüm listelerde ilk sırada görünür.</div></div>' : '') +
      '</div></div>' +

    '<div class="panel"><div class="panel-h"><h2>Kategoriler</h2></div><div class="panel-b">' +
      '<div class="chips" id="catChips">' + (S.config.categories || DEFAULT_CATS).map(function (c) {
        return '<button class="chip" data-act="catDel" data-c="' + esc(c) + '" title="Kaldırmak için tıklayın">' + esc(c) + ' ×</button>';
      }).join('') + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:11px"><input id="newCat" placeholder="Yeni kategori"><button class="btn" data-act="catAdd">Ekle</button></div>' +
    '</div></div>' +

    '<div class="panel"><div class="panel-h"><h2>Ekstre yükleme</h2>' +
      '<div class="note">pdf · xlsx · csv</div></div><div class="panel-b">' +
      '<div class="muted" style="margin-bottom:10px">Ekstreyi yüklediğinde elle girdiğin harcamalar ekstre satırlarıyla eşleştirilir; aynı işlem iki kez yazılmaz. Aynı ekstreyi tekrar yüklersen hiçbir şey eklenmez.</div>' +
      '<button class="btn pri" data-act="ekstre">Ekstre yükle</button>' +
      (S.imports.length ? '<div class="lbl" style="margin:14px 0 4px">Yüklenen ekstreler</div>' +
        S.imports.slice().sort(function (x, y) { return x.at < y.at ? 1 : -1; }).slice(0, 12).map(function (i) {
          var k = cardById(i.cardId);
          return '<div class="rowline"><div class="grow"><b>' + esc(k ? k.name : 'silinmiş kart') + ' · ' + esc(D.monthLabel(i.pk)) + '</b>' +
            '<div class="muted">' + D.trFmt(i.at.slice(0, 10)) + ' · ' + i.added + ' yeni · ' + i.matched + ' eşleşti · ' + esc(i.file || '') + '</div></div>' +
            '<div class="acts"><button class="btn sm dang" data-act="impUndo" data-id="' + esc(i.id) + '">Geri al</button></div></div>';
        }).join('') : '') +
    '</div></div>' +

    (window.HZ_HESAP ? '<div class="panel"><div class="panel-h"><h2>Hesap ve kullanıcılar</h2></div><div class="panel-b" id="hesapPanel"></div></div>' : '') +

    '<div class="panel"><div class="panel-h"><h2>Borçları kapat</h2><div class="note">sıfır noktası</div></div><div class="panel-b">' +
      (HZ.kapanisTarihi(S.config) ?
        '<div class="rowline"><div class="grow"><b>' + D.trFmt(HZ.kapanisTarihi(S.config)) + ' itibarıyla tüm borçlar kapatıldı</b>' +
          '<div class="muted">Bu tarihe kadarki kart borçları, ekstreler, taksitler ve düzenli ödemeler ödenmiş sayılıyor.</div></div>' +
          '<div class="acts"><button class="btn sm" data-act="kapanis">Tarihi değiştir</button>' +
          '<button class="btn sm dang" data-act="kapanisGeriAl">Geri al</button></div></div>'
        : '<div class="muted" style="margin-bottom:10px">Bütün kart borçlarını, taksitlerini ve faturalarını ödediysen buradan bir tarih seç: o güne kadarki her şey ödenmiş sayılır, kartların borcu sıfırdan başlar. Geçmiş kayıtların silinmez.</div>' +
          '<button class="btn pri" data-act="kapanis">Borçları kapat</button>') +
    '</div></div>' +

    '<div class="panel"><div class="panel-h"><h2>Veri</h2><div class="note">' + (Store.mode === 'cloud' ? 'buluta senkron' : 'yerel tarayıcı belleği') + '</div></div><div class="panel-b">' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="btn" data-act="exportJson">JSON yedek indir</button>' +
        '<button class="btn" data-act="importJson">Yedekten yükle</button>' +
        '<button class="btn" data-act="mukerrer">Mükerrer kayıtları bul</button>' +
        '<button class="btn dang" data-act="wipeTx">Tüm işlemleri sil</button>' +
      '</div>' +
      '<hr class="d">' +
      '<div class="lbl" style="margin-bottom:8px">Veri doğrulama</div>' +
      (issues.length ? issues.map(function (i) {
        return '<div class="rowline"><span class="pill ' + (i.level === 'error' ? 'OVERDUE' : i.level === 'warn' ? 'SOON' : 'ghost') + '">' +
          (i.level === 'error' ? 'hata' : i.level === 'warn' ? 'uyarı' : 'bilgi') + '</span><span class="grow">' + esc(i.msg) + '</span></div>';
      }).join('') : '<div class="pill PAID">Tutarsızlık bulunamadı</div>') +
    '</div></div>' +

    '<div class="panel"><div class="panel-h"><h2>Hesaplama kuralları</h2></div><div class="panel-b" style="font-size:13px;color:var(--ink2);display:flex;flex-direction:column;gap:9px">' +
      '<div><b style="color:var(--ink)">Harcama ≠ kart ödemesi.</b> Kartla yapılan alışveriş gider olarak sayılır; ekstreyi ödemeniz gider değil, nakit çıkışıdır. Aynı para iki kez sayılmaz.</div>' +
      '<div><b style="color:var(--ink)">Hesap kesim günü dahildir.</b> Kesim 23 ise 23 Eylül harcaması 24 Ağu–23 Eyl dönemine, 24 Eylül harcaması bir sonraki döneme gider.</div>' +
      '<div><b style="color:var(--ink)">Borç, son ödeme tarihine göre döneme düşer.</b> 23 Eylül’de kesilen ekstrenin son ödemesi 3 Ekim ise, borç 3 Ekim’i içeren maaş döneminde gösterilir.</div>' +
      '<div><b style="color:var(--ink)">Ekstre, elle girdiklerinle eşleştirilir.</b> Aynı kart, aynı tutar ve en çok 3 gün farkla girdiğin kayıt ekstredeki satırla aynı işlem sayılır; ikinci kez yazılmaz. Aynı ekstreyi tekrar yüklemek hiçbir şey eklemez.</div>' +
      '<div><b style="color:var(--ink)">Gerçek kesim tarihi önce gelir.</b> Banka kesimi 1–2 gün kaydırdıysa, yüklediğin ekstredeki tarih kullanılır; kartın varsayılan günü sadece ekstresi henüz gelmemiş aylar içindir.</div>' +
      '<div><b style="color:var(--ink)">Taksitler tek tek sayılır.</b> 12.000 TL / 6 taksit, ana tutar olarak değil 6 ayrı 2.000 TL olarak ilgili ekstre dönemlerine yazılır.</div>' +
      '<div><b style="color:var(--ink)">Para kuruş cinsinden tamsayı tutulur.</b> Ondalık yuvarlama hatası oluşmaz; taksit bölünmesinde toplam korunur.</div>' +
    '</div></div>' +

    '</div>';

  if (window.HZ_HESAP && $('#hesapPanel')) window.HZ_HESAP.ciz($('#hesapPanel'));
  var sp = $('#setPrimary');
  if (sp) sp.addEventListener('change', async function () {
    S.config.primarySalaryDay = +sp.value; await Store.saveConfig(); toast('Maaş günü güncellendi'); renderAll();
  });
  var dc = $('#setDefaultCard');
  if (dc) dc.addEventListener('change', async function () {
    S.config.defaultCardId = dc.value; await Store.saveConfig();
    toast((cardById(dc.value) || {}).name + ' varsayılan kart oldu'); renderAll();
  });
}
function peopleOpts(sel) {
  var names = (S.config.people || []).map(function (p) { return p.name; }).concat(['Ortak']);
  return names.map(function (n) { return '<option' + (sel === n ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('');
}

/* ═══════════════════════════════════════════════════════ KİPLER ═══ */
function modal(title, bodyHtml, footHtml) {
  var host = $('#modalHost');
  host.innerHTML = '<div class="scrim" data-act="closeIfScrim"><div class="sheet" role="dialog" aria-modal="true">' +
    '<div class="sheet-h"><h2>' + esc(title) + '</h2><button class="icobtn" data-act="closeModal" aria-label="Kapat">✕</button></div>' +
    '<div class="sheet-b">' + bodyHtml + '</div>' +
    (footHtml ? '<div class="sheet-f">' + footHtml + '</div>' : '') +
    '</div></div>';
  document.body.style.overflow = 'hidden';
}
function closeModal() { $('#modalHost').innerHTML = ''; document.body.style.overflow = ''; }
/* Tarayıcı confirm() yerine uygulama içi onay — telefonda da güvenli çalışır. */
var _onayFn = null;
function onay(mesaj, fn, etiket) {
  _onayFn = fn;
  modal('Onaylıyor musunuz?',
    '<div class="warnbox crit"><span>⚠</span><div>' + esc(mesaj) + '</div></div>',
    '<button class="btn" data-act="closeModal">Vazgeç</button>' +
    '<button class="btn dang" data-act="onayEvet">' + esc(etiket || 'Evet, sil') + '</button>');
}
function val(id) { var e = $('#' + id); return e ? e.value.trim() : ''; }
function mval(id) { return M.parse(val(id)); }

/* --- hızlı harcama ------------------------------------------------- */
function quickAdd(preCard, forceMethod) {
  var cats = S.config.categories || DEFAULT_CATS;
  /* Varsayılan: kredi kartı (en sık kullanılan). "Nakit harcama" düğmesi bunu bozar. */
  var useCard = forceMethod ? forceMethod === 'CREDIT_CARD' : !!(preCard || defaultCardId());
  modal('Hızlı harcama',
    '<label class="f"><span>Tutar</span><input id="qTutar" class="giant" inputmode="decimal" placeholder="0,00" autofocus></label>' +
    '<div class="f" style="margin-top:12px"><span>Ödeme yöntemi</span>' +
      '<div class="seg" id="qMethod">' +
        '<button data-m="CREDIT_CARD" aria-pressed="' + useCard + '">Kredi kartı</button>' +
        '<button data-m="CASH" aria-pressed="' + (!useCard) + '">Nakit</button>' +
        '<button data-m="BANK_ACCOUNT" aria-pressed="false">Banka</button>' +
      '</div></div>' +
    '<div class="f" id="qCardWrap" style="margin-top:12px;' + (useCard ? '' : 'display:none') + '"><span>Kart</span>' +
      '<select id="qCard">' + cardOptions(preCard) + '</select>' +
      '<div class="muted" id="qPeriod"></div></div>' +
    '<div class="f" style="margin-top:12px"><span>Kategori</span><div class="chips" id="qCats">' +
      cats.map(function (c, i) { return '<button class="chip" data-c="' + esc(c) + '" aria-pressed="' + (i === 0) + '">' + esc(c) + '</button>'; }).join('') + '</div></div>' +
    '<div class="frm two" style="margin-top:12px">' +
      '<label class="f"><span>Kişi</span><select id="qPerson">' + peopleOpts() + '</select></label>' +
      '<label class="f"><span>Tarih</span><input type="date" id="qDate" value="' + D.todayISO() + '"></label>' +
    '</div>' +
    '<label class="f" style="margin-top:12px"><span>Açıklama</span><input id="qNote" placeholder="ör. BİM alışveriş"></label>' +
    '<label class="f" style="margin-top:12px"><span>Taksit sayısı (kart için)</span><input id="qTaksit" type="number" min="1" max="36" value="1"></label>',
    '<button class="btn" data-act="closeModal">Vazgeç</button><button class="btn pri" data-act="quickSave">Kaydet</button>');

  var host = $('#modalHost');
  host.addEventListener('click', function (e) {
    var seg = e.target.closest('#qMethod button');
    if (seg) {
      host.querySelectorAll('#qMethod button').forEach(function (b) { b.setAttribute('aria-pressed', b === seg); });
      $('#qCardWrap').style.display = seg.dataset.m === 'CREDIT_CARD' ? '' : 'none';
      updPeriod();
    }
    var ch = e.target.closest('#qCats .chip');
    if (ch) {
      host.querySelectorAll('#qCats .chip').forEach(function (b) { b.setAttribute('aria-pressed', b === ch); });
      e.preventDefault();
    }
  });
  var note = $('#qNote');
  note.addEventListener('blur', function () {
    var g = HZ.autoCategory(note.value);
    var b = host.querySelector('#qCats .chip[data-c="' + g.replace(/"/g, '') + '"]');
    if (b && note.value) { host.querySelectorAll('#qCats .chip').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }
  });
  $('#qDate').addEventListener('change', updPeriod);
  var qc = $('#qCard'); if (qc) qc.addEventListener('change', updPeriod);
  updPeriod();
  /* Telefonda tek elle: tutar alanı hazır, Enter kaydeder. */
  setTimeout(function () { var a = $('#qTutar'); if (a) { a.focus(); a.select(); } }, 80);
  host.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      Promise.resolve(quickSave()).catch(function (err) { toast('Kaydedilemedi: ' + err.message); });
    }
  });
  function updPeriod() {
    var w = $('#qPeriod'); if (!w) return;
    var c = cardById(val('qCard'));
    if (!c || !c.statementDay) { w.textContent = ''; return; }
    var p = HZ.StatementPeriod.forDate(val('qDate') || D.todayISO(), c);
    w.textContent = 'Ekstre dönemi: ' + p.label + ' · son ödeme ' + (p.dueDate ? D.trFmt(p.dueDate) : '—');
  }
}
async function quickSave() {
  var amount = mval('qTutar');
  if (amount <= 0) { toast('Tutar giriniz'); return; }
  var m = $('#modalHost').querySelector('#qMethod button[aria-pressed="true"]').dataset.m;
  var cat = ($('#modalHost').querySelector('#qCats .chip[aria-pressed="true"]') || {}).dataset;
  var o = {
    amount: amount, m: m, cat: cat ? cat.c : null, date: val('qDate') || D.todayISO(),
    person: val('qPerson'), note: val('qNote'), n: Math.max(1, parseInt(val('qTaksit'), 10) || 1),
    cardId: m === 'CREDIT_CARD' ? val('qCard') : null
  };
  if (m === 'CREDIT_CARD' && !o.cardId) { toast('Kart seçiniz'); return; }
  /* Aynı harcamayı iki kez girmeyi önle: aynı kart/yöntem, aynı tutar, ±1 gün */
  var es = o.n > 1 ? null : benzerKayit(KIND.EXPENSE, o.cardId, m, amount, o.date);
  if (es) {
    onay('Bu harcama zaten kayıtlı görünüyor: ' + D.trFmt(es.date) + ' · ' + (es.note || es.category || '—') + ' · ' +
      money(es.amount) + (es.ikey ? ' (ekstreden)' : '') + '. Aynı gün aynı tutarda ikinci bir alışveriş yaptıysan ekleyebilirsin.',
      function () { return quickCommit(o); }, 'Yine de ekle');
    return;
  }
  await quickCommit(o);
}
async function quickCommit(o) {
  if (o.n > 1 && o.cardId) {
    var plan = {
      id: uid('pl'), name: o.note || o.cat || 'Taksitli alışveriş', totalAmount: o.amount, count: o.n,
      firstDate: o.date, cardId: o.cardId, person: o.person, category: o.cat || 'Diğer', createdAt: new Date().toISOString()
    };
    S.plans = S.plans.concat([plan]);
    await Store.put('plans', plan.id, plan);
    await addManyTx(HZ.Installments.generate(plan, cardById(o.cardId)));
    toast(o.n + ' taksit oluşturuldu · ' + money(o.amount, { decimals: false }));
  } else {
    var sp = o.cardId ? HZ.StatementPeriod.forDate(o.date, cardById(o.cardId)) : null;
    await addTx({
      kind: KIND.EXPENSE, date: o.date, amount: o.amount, person: o.person, method: o.m,
      cardId: o.cardId, category: o.cat || 'Diğer', note: o.note, statementKey: sp ? sp.key : null
    });
    toast(money(o.amount, { decimals: false }) + ' eklendi');
  }
  closeModal();
}

/* --- gelir ---------------------------------------------------------- */
function incomeModal() {
  var people = (S.config.people || []);
  modal('Gelir ekle',
    '<label class="f"><span>Tutar</span><input id="gTutar" class="giant" inputmode="decimal" placeholder="0,00"></label>' +
    '<div class="chips" style="margin-top:10px">' + people.map(function (p) {
      return p.monthlySalary ? '<button class="chip" data-act="setIncome" data-v="' + p.monthlySalary + '" data-p="' + esc(p.name) + '">' +
        esc(p.name) + ' maaşı · ' + money(p.monthlySalary, { decimals: false }) + '</button>' : '';
    }).join('') + '</div>' +
    '<div class="frm two" style="margin-top:14px">' +
      '<label class="f"><span>Kişi</span><select id="gPerson">' + peopleOpts() + '</select></label>' +
      '<label class="f"><span>Tarih</span><input type="date" id="gDate" value="' + D.todayISO() + '"></label>' +
    '</div>' +
    '<label class="f" style="margin-top:12px"><span>Açıklama</span><input id="gNote" value="Maaş"></label>',
    '<button class="btn" data-act="closeModal">Vazgeç</button><button class="btn pri" data-act="incomeSave">Kaydet</button>');
  setTimeout(function () { var a = $('#gTutar'); if (a) a.focus(); }, 80);
}
async function incomeSave() {
  var amount = mval('gTutar');
  if (amount <= 0) { toast('Tutar giriniz'); return; }
  await addTx({
    kind: KIND.INCOME, date: val('gDate') || D.todayISO(), amount: amount,
    person: val('gPerson'), method: METHOD.BANK, category: 'Maaş', note: val('gNote') || 'Gelir'
  });
  closeModal(); toast(money(amount, { decimals: false }) + ' gelir eklendi');
}

/* --- kart ödemesi --------------------------------------------------- */
function cardPayModal(cardId) {
  var c = cardById(cardId); if (!c) return;
  var today = D.todayISO(), txs = S.transactions;
  var snap = HZ.Cards.snapshot(c, txs, today);
  var last = snap.lastStatement;
  modal('Kart ödemesi — ' + c.name,
    '<div class="warnbox" style="background:var(--acc-soft);border-color:var(--acc);color:var(--acc-ink)"><span>ℹ</span>' +
      '<div>Bu işlem <b>gider olarak sayılmaz</b>. Kart borcunuzu azaltır ve nakit çıkışı olarak izlenir.</div></div>' +
    '<dl class="dl" style="margin:14px 0">' +
      '<dt>Güncel borç</dt><dd>' + money(snap.currentBalance) + '</dd>' +
      (last ? '<dt>Dönem borcu</dt><dd>' + money(last.statementBalance) + '</dd>' +
        '<dt>Bu döneme ödenen</dt><dd style="color:var(--ok)">' + money(last.paid) + '</dd>' +
        '<dt>Kalan</dt><dd style="color:var(--acc)">' + money(last.remaining) + '</dd>' +
        '<dt>Asgari ödeme</dt><dd>' + money(last.minimum) + '</dd>' +
        '<dt>Son ödeme tarihi</dt><dd>' + (last.dueDate ? D.trFmt(last.dueDate) : '—') + '</dd>' : '') +
    '</dl>' +
    '<label class="f"><span>Ödenecek tutar</span><input id="pTutar" class="giant" inputmode="decimal" value="' + (last ? M.fmt(last.remaining, { symbol: false }) : '0,00') + '"></label>' +
    '<div class="chips" style="margin-top:10px">' +
      (last ? '<button class="chip" data-act="setPay" data-v="' + last.remaining + '">Kalanın tamamı</button>' +
              '<button class="chip" data-act="setPay" data-v="' + last.minimum + '">Asgari ödeme</button>' : '') +
      '<button class="chip" data-act="setPay" data-v="' + Math.max(snap.currentBalance, 0) + '">Güncel borcun tamamı</button>' +
    '</div>' +
    '<div class="frm two" style="margin-top:14px">' +
      '<label class="f"><span>Tarih</span><input type="date" id="pDate" value="' + today + '"></label>' +
      '<label class="f"><span>Kişi</span><select id="pPerson">' + peopleOpts(c.owner) + '</select></label>' +
    '</div>' +
    '<label class="f" style="margin-top:12px"><span>Not</span><input id="pNote" placeholder="ör. Ekim ekstresi"></label>',
    '<button class="btn" data-act="closeModal">Vazgeç</button>' +
    '<button class="btn pri" data-act="cardPaySave" data-id="' + esc(cardId) + '">Ödemeyi kaydet</button>');
}
async function cardPaySave(cardId) {
  var amount = mval('pTutar');
  if (amount <= 0) { toast('Tutar giriniz'); return; }
  var tx = {
    kind: KIND.CARD_PAYMENT, date: val('pDate') || D.todayISO(), amount: amount,
    person: val('pPerson'), method: METHOD.BANK, cardId: cardId,
    category: 'Kredi Kartı', note: val('pNote') || 'Kart ödemesi'
  };
  async function yaz() { await addTx(tx); closeModal(); toast(money(amount, { decimals: false }) + ' kart ödemesi kaydedildi'); }
  var es = benzerKayit(KIND.CARD_PAYMENT, cardId, METHOD.BANK, amount, tx.date);
  if (es) {
    onay('Bu karta ' + D.trFmt(es.date) + ' tarihinde ' + money(es.amount) + ' ödeme zaten kayıtlı' +
      (es.ikey ? ' (ekstreden)' : '') + '. İkinci bir ödeme yaptıysan ekleyebilirsin.', yaz, 'Yine de ekle');
    return;
  }
  await yaz();
}

/* --- yükümlülük ödemesi --------------------------------------------- */
function payItemModal(itemId) {
  var plan = HZ.Planner.plan(state(), D.todayISO(), ayOdemePenceresi(aktifAy()));
  var item = plan.items.find(function (i) { return i.id === itemId; });
  if (!item) return;
  if (item.type === 'CARD') { cardPayModal(item.cardId); return; }
  modal('Ödeme — ' + item.name,
    '<dl class="dl" style="margin-bottom:14px">' +
      '<dt>Tutar</dt><dd>' + money(item.total) + '</dd>' +
      '<dt>Ödenen</dt><dd style="color:var(--ok)">' + money(item.paid) + '</dd>' +
      '<dt>Kalan</dt><dd style="color:var(--acc)">' + money(item.remaining) + '</dd>' +
      '<dt>Son ödeme</dt><dd>' + D.trFmt(item.dueDate) + '</dd></dl>' +
    '<label class="f"><span>Ödenen tutar</span><input id="rTutar" class="giant" inputmode="decimal" value="' + M.fmt(item.remaining, { symbol: false }) + '"></label>' +
    '<div class="frm two" style="margin-top:14px">' +
      '<label class="f"><span>Tarih</span><input type="date" id="rDate" value="' + D.todayISO() + '"></label>' +
      '<label class="f"><span>Ödeme yöntemi</span><select id="rMethod"><option value="BANK_ACCOUNT">Banka / EFT</option><option value="CASH">Nakit</option></select></label>' +
    '</div>',
    '<button class="btn" data-act="closeModal">Vazgeç</button>' +
    '<button class="btn pri" data-act="payItemSave" data-id="' + esc(item.recurringId) + '" data-cat="' + esc(item.sub || '') + '" data-nm="' + esc(item.name) + '">Kaydet</button>');
}
async function payItemSave(recurringId, cat, name) {
  var amount = mval('rTutar');
  if (amount <= 0) { toast('Tutar giriniz'); return; }
  await addTx({
    kind: KIND.EXPENSE, date: val('rDate') || D.todayISO(), amount: amount,
    person: 'Ortak', method: val('rMethod'), category: cat || 'Diğer',
    note: name, recurringId: recurringId
  });
  closeModal(); toast(name + ' ödendi');
}

/* --- bir ekstrenin dökümü --------------------------------------------- */
function stmtModal(cardId, monthKey) {
  var today = D.todayISO();
  var sm = HZ.Report.statementMonth(state(), monthKey, today);
  var i = sm.items.filter(function (x) { return x.card.id === cardId; })[0];
  if (!i) { toast('Bu ay bu kartta ekstre yok'); return; }
  var cats = Object.entries(i.periodCategories).sort(function (a, b) { return b[1] - a[1]; });
  var mx = cats.length ? cats[0][1] : 1;
  modal(i.card.name + ' · ' + D.monthLabel(monthKey) + ' ekstresi',
    '<dl class="dl" style="margin-bottom:14px">' +
      '<dt>Dönem</dt><dd style="font-family:var(--body);font-weight:600">' + esc(i.period.label) + '</dd>' +
      '<dt>Hesap kesim</dt><dd>' + D.trFmt(i.period.close) + '</dd>' +
      '<dt>Son ödeme</dt><dd>' + (i.dueDate ? D.trFmt(i.dueDate) : '—') + '</dd>' +
      '<div class="sep"></div>' +
      '<dt>Dönem içi harcama</dt><dd>' + money(i.periodSpend) + '</dd>' +
      '<dt>Önceki dönemden devir</dt><dd>' + money(Math.max(i.statementBalance - i.periodSpend, 0)) + '</dd>' +
      '<dt>Dönem borcu</dt><dd style="font-size:15px">' + money(i.statementBalance) + '</dd>' +
      '<dt>Asgari ödeme</dt><dd>' + money(i.minimum) + '</dd>' +
      '<dt>Ödenen</dt><dd style="color:var(--ok)">' + money(i.paid) + '</dd>' +
      '<dt>Kalan</dt><dd style="color:var(--acc)">' + money(i.remaining) + '</dd>' +
    '</dl>' +
    (cats.length ? '<div class="lbl" style="margin-bottom:9px">Kategori dağılımı</div><div class="barlist">' +
      cats.map(function (x, n) {
        return '<div class="row"><div class="nm">' + esc(x[0]) + '</div>' +
          '<div class="tr"><i style="width:' + (x[1] / mx * 100).toFixed(1) + '%;background:var(--c' + ((n % 4) + 1) + ')"></i></div>' +
          '<div class="val">' + money(x[1], { decimals: false }) + '</div></div>';
      }).join('') + '</div>' : '') +
    (i.periodTx.length ? '<hr class="d"><div class="lbl" style="margin-bottom:8px">Dönem içi işlemler (' + i.periodTx.length + ')</div>' +
      '<div class="tblwrap"><table><tbody>' + i.periodTx.slice(0, 80).map(function (t) {
        return '<tr><td class="num" style="white-space:nowrap">' + D.trFmt(t.date) + '</td>' +
          '<td>' + esc(t.note || '—') + (t.installment ? ' <span class="tag">' + t.installment.no + '/' + t.installment.count + '</span>' : '') +
          '<div class="muted">' + esc(t.category || '') + '</div></td>' +
          '<td class="r num" style="font-weight:700">' + money(t.amount) + '</td>' +
          '<td class="r" style="white-space:nowrap"><button class="btn sm" data-act="txEdit" data-id="' + esc(t.id) + '">Düzelt</button> ' +
          '<button class="btn sm dang" data-act="delTx" data-id="' + esc(t.id) + '">✕</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="muted" style="margin-top:12px">Bu dönemde kartla harcama yok.</div>'),
    '<button class="btn" data-act="closeModal">Kapat</button>' +
    (i.remaining > 0 ? '<button class="btn pri" data-act="cardPay" data-id="' + esc(cardId) + '">Borç öde</button>' : ''));
}

/* --- işlem düzenle --------------------------------------------------- */
function findTx(id) {
  for (var m in S.buckets) {
    var arr = S.buckets[m] || [];
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return { tx: arr[i], month: m };
  }
  return null;
}
function txEditModal(id) {
  var f = findTx(id); if (!f) { toast('Kayıt bulunamadı'); return; }
  var t = f.tx, cats = S.config.categories || DEFAULT_CATS;
  var isExp = t.kind === KIND.EXPENSE, isRef = t.kind === KIND.REFUND, isInc = t.kind === KIND.INCOME;
  var isPay = t.kind === KIND.CARD_PAYMENT || isRef;   /* iade de karta bağlı bir kayıttır */
  var title = isRef ? 'İadeyi düzenle' : isPay ? 'Kart ödemesini düzenle' : isInc ? 'Geliri düzenle' : 'Harcamayı düzenle';

  modal(title,
    '<label class="f"><span>Tutar</span><input id="e1" class="giant" inputmode="decimal" value="' + M.fmt(t.amount, { symbol: false }) + '"></label>' +

    (isExp ? '<div class="f" style="margin-top:12px"><span>Ödeme yöntemi</span>' +
      '<div class="seg" id="em">' +
        '<button data-m="CREDIT_CARD" aria-pressed="' + (t.method === METHOD.CARD) + '">Kredi kartı</button>' +
        '<button data-m="CASH" aria-pressed="' + (t.method === METHOD.CASH) + '">Nakit</button>' +
        '<button data-m="BANK_ACCOUNT" aria-pressed="' + (t.method === METHOD.BANK) + '">Banka</button>' +
      '</div></div>' : '') +

    ((isExp || isPay) ? '<div class="f" id="ecw" style="margin-top:12px' +
      ((isPay || t.method === METHOD.CARD) ? '' : ';display:none') + '"><span>Kart</span>' +
      '<select id="ec">' + cardOptions(t.cardId) + '</select><div class="muted" id="ep2"></div></div>' : '') +

    '<div class="frm two" style="margin-top:12px">' +
      '<label class="f"><span>Tarih</span><input type="date" id="e2" value="' + esc(t.date) + '"></label>' +
      '<label class="f"><span>Kişi</span><select id="ep">' + peopleOpts(t.person) + '</select></label>' +
    '</div>' +

    '<label class="f" style="margin-top:12px"><span>Kategori</span><select id="ek">' +
      cats.map(function (c) { return '<option' + (t.category === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') +
      (cats.indexOf(t.category) < 0 && t.category ? '<option selected>' + esc(t.category) + '</option>' : '') +
    '</select></label>' +

    '<label class="f" style="margin-top:12px"><span>Açıklama</span><input id="en" value="' + esc(t.note || '') + '"></label>' +

    (t.installment ? '<div class="warnbox" style="margin-top:12px"><span>ℹ</span><div>Bu kayıt <b>' +
      esc(t.installment.planName || '') + '</b> planının ' + t.installment.no + '/' + t.installment.count +
      ' taksidi. Burada yaptığın değişiklik sadece bu taksidi etkiler; diğer taksitler aynı kalır.</div></div>' : '') +
    (t.ikey ? '<div class="muted" style="margin-top:10px">Ekstreyle doğrulandı' + (t.raw ? ' — bankadaki açıklama: <b>' + esc(t.raw) + '</b>' : '') +
      (t.sdate && t.sdate !== t.date ? ' · ekstre tarihi ' + D.trFmt(t.sdate) : '') +
      '. Tutarı değiştirirsen kart borcu ekstreden sapar.</div>' : ''),

    '<button class="btn dang" data-act="txEditDel" data-id="' + esc(id) + '">Sil</button>' +
    '<button class="btn pri" data-act="txEditSave" data-id="' + esc(id) + '">Kaydet</button>');

  var host = $('#modalHost');
  if (isExp) {
    host.addEventListener('click', function (e) {
      var s = e.target.closest('#em button');
      if (s) {
        host.querySelectorAll('#em button').forEach(function (b) { b.setAttribute('aria-pressed', b === s); });
        $('#ecw').style.display = s.dataset.m === 'CREDIT_CARD' ? '' : 'none';
        per();
      }
    });
  }
  ['e2', 'ec'].forEach(function (x) { var e = $('#' + x); if (e) e.addEventListener('change', per); });
  per();
  function per() {
    var w = $('#ep2'); if (!w) return;
    var c = cardById(val('ec'));
    var wrap = $('#ecw');
    if (!c || !c.statementDay || (wrap && wrap.style.display === 'none')) { w.textContent = ''; return; }
    var p = HZ.StatementPeriod.forDate(val('e2') || t.date, c);
    w.textContent = 'Ekstre dönemi: ' + p.label + (p.dueDate ? ' · son ödeme ' + D.trFmt(p.dueDate) : '');
  }
}
async function txEditSave(id) {
  var f = findTx(id); if (!f) return;
  var t = f.tx;
  var amount = mval('e1');
  if (amount <= 0) { toast('Tutar giriniz'); return; }
  var date = val('e2') || t.date;
  var kind = t.kind;
  var method = t.method;
  if (kind === KIND.EXPENSE) {
    var seg = $('#modalHost').querySelector('#em button[aria-pressed="true"]');
    method = seg ? seg.dataset.m : t.method;
  }
  var cardId = (kind === KIND.CARD_PAYMENT || kind === KIND.REFUND || method === METHOD.CARD) ? (val('ec') || null) : null;
  if (method === METHOD.CARD && !cardId) { toast('Kart seçiniz'); return; }

  var next = Object.assign({}, t, {
    amount: amount, date: date, method: method, cardId: cardId,
    category: val('ek') || t.category, person: val('ep') || t.person, note: val('en'),
    statementKey: cardId ? (HZ.StatementPeriod.forDate(date, cardById(cardId)) || {}).key || null : null,
    editedAt: new Date().toISOString()
  });
  /* kart ya da tarih değiştiyse ekstre sabitlemesi artık geçerli değil */
  if (next.sdate && (cardId !== t.cardId || date !== t.date)) delete next.sdate;

  var oldM = f.month, newM = D.monthKey(date);
  S.buckets[oldM] = (S.buckets[oldM] || []).filter(function (x) { return x.id !== id; });
  S.buckets[newM] = (S.buckets[newM] || []).concat([next]);
  await Store.putBuckets(newM !== oldM ? [oldM, newM] : [oldM]);
  closeModal(); renderAll(); toast('Kayıt güncellendi');
}

/* --- kart düzenle --------------------------------------------------- */
function cardModal(id) {
  var c = id ? cardById(id) : { id: uid('c'), name: '', bank: '', owner: (S.config.people[0] || {}).name || '', last4: '', limit: 0, statementDay: 1, dueDay: 11, openingBalance: 0, minPaymentRate: 20, active: true };
  modal(id ? 'Kartı düzenle' : 'Yeni kart',
    '<div class="frm two">' +
      '<label class="f"><span>Kart adı</span><input id="cName" value="' + esc(c.name) + '" placeholder="Hasan Ziraat"></label>' +
      '<label class="f"><span>Banka</span><input id="cBank" value="' + esc(c.bank) + '" placeholder="Ziraat Bankası"></label>' +
      '<label class="f"><span>Sahibi</span><select id="cOwner">' + peopleOpts(c.owner) + '</select></label>' +
      '<label class="f"><span>Son 4 hane</span><input id="cLast4" maxlength="4" inputmode="numeric" value="' + esc(c.last4 || '') + '" placeholder="1234"></label>' +
      '<label class="f"><span>Limit</span><input id="cLimit" class="money" inputmode="decimal" value="' + M.fmt(c.limit, { symbol: false }) + '"></label>' +
      '<label class="f"><span>Açılış borcu</span><input id="cOpen" class="money" inputmode="decimal" value="' + M.fmt(c.openingBalance || 0, { symbol: false }) + '"></label>' +
      '<label class="f"><span>Hesap kesim günü</span><input id="cStat" type="number" min="1" max="31" value="' + (c.statementDay || '') + '"></label>' +
      '<label class="f"><span>Son ödeme günü</span><input id="cDue" type="number" min="1" max="31" value="' + (c.dueDay || '') + '"></label>' +
      '<label class="f"><span>Asgari ödeme oranı (%)</span><input id="cMin" type="number" min="0" max="100" value="' + (c.minPaymentRate == null ? 20 : c.minPaymentRate) + '"></label>' +
      '<label class="f"><span>Durum</span><select id="cActive"><option value="1"' + (c.active !== false ? ' selected' : '') + '>Aktif</option><option value="0"' + (c.active === false ? ' selected' : '') + '>Pasif</option></select></label>' +
    '</div>' +
    '<div class="muted" style="margin-top:10px">Tam kart numarası ve CVV hiçbir zaman saklanmaz.</div>' +
    '<div id="cPrev" class="muted" style="margin-top:6px"></div>',
    (id ? '<button class="btn dang" data-act="cardDel" data-id="' + esc(id) + '">Sil</button>' : '<button class="btn" data-act="closeModal">Vazgeç</button>') +
    '<button class="btn pri" data-act="cardSave" data-id="' + esc(c.id) + '">Kaydet</button>');
  function prev() {
    var sd = +val('cStat'), dd = +val('cDue');
    if (!sd) { $('#cPrev').textContent = ''; return; }
    var p = HZ.StatementPeriod.forDate(D.todayISO(), { id: 'x', statementDay: sd, dueDay: dd });
    $('#cPrev').textContent = 'Açık dönem: ' + p.label + (p.dueDate ? ' · son ödeme ' + D.trFmt(p.dueDate) : '');
  }
  $('#cStat').addEventListener('input', prev); $('#cDue').addEventListener('input', prev); prev();
}
async function cardSave(id) {
  var c = {
    id: id, name: val('cName') || 'Kart', bank: val('cBank'), owner: val('cOwner'),
    last4: val('cLast4'), limit: mval('cLimit'), openingBalance: mval('cOpen'),
    statementDay: +val('cStat') || null, dueDay: +val('cDue') || null,
    minPaymentRate: +val('cMin') || 0, active: val('cActive') === '1'
  };
  var list = S.cards.slice(), i = list.findIndex(function (x) { return x.id === id; });
  if (i >= 0) list[i] = c; else list.push(c);
  S.cards = list;
  await Store.put('cards', id, c);
  closeModal(); renderAll(); toast('Kart kaydedildi');
}

/* --- düzenli ödeme -------------------------------------------------- */
function recModal(id) {
  var r = id ? S.recurring.find(function (x) { return x.id === id; })
    : { id: uid('r'), name: '', amount: 0, dueDay: 1, owner: 'Ortak', category: 'Fatura', priority: 'HIGH', frequency: 'MONTHLY', active: true };
  var cats = S.config.categories || DEFAULT_CATS;
  modal(id ? 'Düzenli ödemeyi düzenle' : 'Yeni düzenli ödeme',
    '<div class="frm two">' +
      '<label class="f"><span>Ad</span><input id="rName" value="' + esc(r.name) + '" placeholder="Ev Kirası"></label>' +
      '<label class="f"><span>Tutar</span><input id="rAmt" class="money" inputmode="decimal" value="' + M.fmt(r.amount, { symbol: false }) + '"></label>' +
      '<label class="f"><span>Son ödeme günü</span><input id="rDay" type="number" min="1" max="31" value="' + r.dueDay + '"></label>' +
      '<label class="f"><span>Sahibi</span><select id="rOwner">' + peopleOpts(r.owner) + '</select></label>' +
      '<label class="f"><span>Kategori</span><select id="rCat">' + cats.map(function (c) { return '<option' + (r.category === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></label>' +
      '<label class="f"><span>Öncelik</span><select id="rPrio">' +
        ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(function (p) { return '<option value="' + p + '"' + (r.priority === p ? ' selected' : '') + '>' + HZ.PRIORITY_TR[p] + '</option>'; }).join('') + '</select></label>' +
      '<label class="f"><span>Tekrarlama</span><select id="rFreq">' +
        [['MONTHLY', 'Her ay'], ['QUARTERLY', '3 ayda bir'], ['YEARLY', 'Yılda bir']].map(function (f) { return '<option value="' + f[0] + '"' + (r.frequency === f[0] ? ' selected' : '') + '>' + f[1] + '</option>'; }).join('') + '</select></label>' +
      '<label class="f"><span>Durum</span><select id="rActive"><option value="1"' + (r.active !== false ? ' selected' : '') + '>Aktif</option><option value="0"' + (r.active === false ? ' selected' : '') + '>Pasif</option></select></label>' +
      '<label class="f"><span>Başlangıç (opsiyonel)</span><input type="date" id="rStart" value="' + esc(r.startDate || '') + '"></label>' +
      '<label class="f"><span>Bitiş (opsiyonel)</span><input type="date" id="rEnd" value="' + esc(r.endDate || '') + '"></label>' +
    '</div>',
    (id ? '<button class="btn dang" data-act="recDel" data-id="' + esc(id) + '">Sil</button>' : '<button class="btn" data-act="closeModal">Vazgeç</button>') +
    '<button class="btn pri" data-act="recSave" data-id="' + esc(r.id) + '">Kaydet</button>');
}
async function recSave(id) {
  var r = {
    id: id, name: val('rName') || 'Ödeme', amount: mval('rAmt'), dueDay: +val('rDay') || 1,
    owner: val('rOwner'), category: val('rCat'), priority: val('rPrio'), frequency: val('rFreq'),
    startDate: val('rStart') || null, endDate: val('rEnd') || null, active: val('rActive') === '1'
  };
  var list = S.recurring.slice(), i = list.findIndex(function (x) { return x.id === id; });
  if (i >= 0) list[i] = r; else list.push(r);
  S.recurring = list;
  await Store.put('recurring', id, r);
  closeModal(); renderAll(); toast('Kaydedildi');
}

/* --- kişi ----------------------------------------------------------- */
function personModal(idx) {
  var p = (idx >= 0 && S.config.people && S.config.people[idx])
    ? S.config.people[idx] : { name: '', salaryDay: 31, monthlySalary: 0 };
  modal(idx >= 0 ? 'Kişiyi düzenle' : 'Yeni kişi',
    '<div class="frm two">' +
      '<label class="f"><span>Ad</span><input id="uName" value="' + esc(p.name) + '"></label>' +
      '<label class="f"><span>Maaş günü</span><input id="uDay" type="number" min="1" max="31" value="' + p.salaryDay + '"></label>' +
      '<label class="f"><span>Aylık net maaş</span><input id="uSalary" class="money" inputmode="decimal" value="' + M.fmt(p.monthlySalary || 0, { symbol: false }) + '"></label>' +
    '</div>',
    (idx >= 0 ? '<button class="btn dang" data-act="personDel" data-i="' + idx + '">Sil</button>' : '<button class="btn" data-act="closeModal">Vazgeç</button>') +
    '<button class="btn pri" data-act="personSave" data-i="' + idx + '">Kaydet</button>');
}
async function personSave(idx) {
  var p = { name: val('uName') || 'Kişi', salaryDay: +val('uDay') || 1, monthlySalary: mval('uSalary') };
  var list = (S.config.people || []).slice();
  if (idx >= 0 && list[idx]) list[idx] = p; else list.push(p);
  S.config.people = list;
  await Store.saveConfig(); closeModal(); renderAll(); toast(p.name + ' kaydedildi');
}

/* --- taksitli alışveriş -------------------------------------------- */
function planModal() {
  var cats = S.config.categories || DEFAULT_CATS;
  modal('Taksitli alışveriş',
    '<div class="frm two">' +
      '<label class="f"><span>Açıklama</span><input id="lName" placeholder="Beyaz eşya"></label>' +
      '<label class="f"><span>Toplam tutar</span><input id="lTotal" class="money" inputmode="decimal" placeholder="0,00"></label>' +
      '<label class="f"><span>Taksit sayısı</span><input id="lCount" type="number" min="2" max="36" value="6"></label>' +
      '<label class="f"><span>İlk taksit tarihi</span><input type="date" id="lDate" value="' + D.todayISO() + '"></label>' +
      '<label class="f"><span>Kart</span><select id="lCard">' + cardOptions() + '</select></label>' +
      '<label class="f"><span>Kişi</span><select id="lPerson">' + peopleOpts() + '</select></label>' +
      '<label class="f"><span>Kategori</span><select id="lCat">' + cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select></label>' +
    '</div>' +
    '<div id="lPrev" class="muted" style="margin-top:12px"></div>',
    '<button class="btn" data-act="closeModal">Vazgeç</button><button class="btn pri" data-act="planSave">Taksitleri oluştur</button>');
  function prev() {
    var total = mval('lTotal'), n = +val('lCount') || 1;
    if (total <= 0) { $('#lPrev').textContent = ''; return; }
    var parts = M.split(total, n);
    $('#lPrev').innerHTML = 'Aylık <b>' + money(parts[0]) + '</b> × ' + n + ' = ' + money(total) +
      (parts[0] !== parts[n - 1] ? ' <span class="muted">(son taksit ' + money(parts[n - 1]) + ')</span>' : '') +
      '<br>Her taksit ilgili ekstre dönemine otomatik bağlanır.';
  }
  ['lTotal', 'lCount'].forEach(function (id) { $('#' + id).addEventListener('input', prev); });
}
async function planSave() {
  var total = mval('lTotal'), n = +val('lCount') || 1, cardId = val('lCard');
  if (total <= 0) { toast('Tutar giriniz'); return; }
  if (!cardId) { toast('Kart seçiniz'); return; }
  var plan = {
    id: uid('pl'), name: val('lName') || 'Taksitli alışveriş', totalAmount: total, count: n,
    firstDate: val('lDate') || D.todayISO(), cardId: cardId, person: val('lPerson'),
    category: val('lCat'), createdAt: new Date().toISOString()
  };
  S.plans = S.plans.concat([plan]);
  await Store.put('plans', plan.id, plan);
  await addManyTx(HZ.Installments.generate(plan, cardById(cardId)));
  closeModal(); toast(n + ' taksit oluşturuldu');
}

/* --- EKSTRE YÜKLEME ---------------------------------------------------
   Akış: kart + dosya → okuma → ÖNİZLEME (her satırın durumu) → onay.
   Elle girilmiş kayıtlar ekstre satırlarıyla eşleştirilir; aynı işlem iki kez
   yazılmaz. Aynı ekstre tekrar yüklenirse hiçbir şey eklenmez.
   Her içe aktarma kaydedilir ve tek dokunuşla geri alınabilir.            */
/* Okuyucu kitaplıkları ilk ekstre yüklemesinde gelir: önce sayfayla birlikte
   yayınlanan kopya, olmazsa cdnjs. */
var LIB = {
  pdf: ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'vendor/pdf.min.js'],
  pdfw: ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js', 'vendor/pdf.worker.min.js'],
  xlsx: ['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'vendor/xlsx.full.min.js']
};
/* Claude sayfasında kitaplıklar sayfayla birlikte yayınlanır; önce onları dene */
if (typeof claude !== 'undefined' || window.HZ_YEREL_KITAPLIK) Object.keys(LIB).forEach(function (k) { LIB[k].reverse(); });
async function lib(ad, hazir) {
  if (hazir()) return;
  for (var i = 0; i < LIB[ad].length; i++) {
    try { await loadScript(LIB[ad][i]); } catch (e) { }
    if (hazir()) return;
  }
  throw new Error('okuyucu yüklenemedi (' + ad + ') — internet bağlantını kontrol edip tekrar dene');
}
var EX = null;       /* açık içe aktarma oturumu */

function loadScript(src) {
  return new Promise(function (ok, no) {
    var s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = function () { s.remove(); no(new Error('yüklenemedi: ' + src)); };
    document.head.appendChild(s);
  });
}
/** PDF → metin satırları. Aynı yükseklikteki parçalar bir satır olur. */
async function pdfLines(buf) {
  await lib('pdf', function () { return !!window.pdfjsLib; });
  await lib('pdfw', function () { return !!window.pdfjsWorker; });   /* ana iş parçacığında çalışır */
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = LIB.pdfw[0];   /* sahte işçi kullanılır; adres yalnızca bilgi */
  var pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  var out = [], seen = {};
  for (var p = 1; p <= pdf.numPages; p++) {
    var page = await pdf.getPage(p);
    var tc = await page.getTextContent();
    var items = tc.items.filter(function (i) { return i.str; }).map(function (i) {
      return { x: i.transform[4], y: i.transform[5], s: i.str, w: i.width || 0, h: i.height || 9 };
    });
    items.sort(function (a, b) { return Math.abs(a.y - b.y) > 2.5 ? b.y - a.y : a.x - b.x; });
    var lines = [], cur = null;
    items.forEach(function (i) {
      if (!cur || Math.abs(cur.y - i.y) > 2.5) { cur = { y: i.y, parts: [] }; lines.push(cur); }
      cur.parts.push(i);
    });
    var text = lines.map(function (l) {
      l.parts.sort(function (a, b) { return a.x - b.x; });
      var s = '', end = null;
      l.parts.forEach(function (i) {
        if (end != null && i.x - end > Math.max(1.2, i.h * 0.18) && !/\s$/.test(s) && !/^\s/.test(i.s)) s += ' ';
        s += i.s; end = i.x + i.w;
      });
      return s.replace(/\s+/g, ' ').trim();
    }).filter(function (l) { return l; });
    /* Ziraat ekstresinde 2. sayfa 1. sayfanın birebir kopyası olabiliyor — bir kez al */
    var key = text.join('\n');
    if (seen[key]) continue;
    seen[key] = 1;
    out = out.concat(text);
  }
  return out;
}
function csvTable(buf) {
  var text = new TextDecoder('utf-8').decode(buf);
  if (text.indexOf(String.fromCharCode(65533)) >= 0) { try { text = new TextDecoder('windows-1254').decode(buf); } catch (e) { } }
  var lines = text.replace(/^\ufeff/, '').split(/\r?\n/);
  var n = function (ch) { return lines.slice(0, 20).join('\n').split(ch).length; };
  var sep = n(';') >= n('\t') && n(';') >= n(',') ? ';' : (n('\t') >= n(',') ? '\t' : ',');
  return lines.map(function (l) {
    return l.split(sep).map(function (c) { return c.replace(/^\s*"|"\s*$/g, '').trim(); });
  });
}
async function ekstreDosyaOku(file) {
  var buf = await file.arrayBuffer();
  if (/\.pdf$/i.test(file.name)) return HZEkstre.fromLines(await pdfLines(buf));
  if (/\.(csv|txt)$/i.test(file.name)) return HZEkstre.fromTable(csvTable(buf));
  await lib('xlsx', function () { return typeof XLSX !== 'undefined'; });
  var wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
  var tbl = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });
  return HZEkstre.fromTable(tbl);
}

/* 1. adım: kart ve dosya */
function ekstreModal(cardId) {
  if (!S.cards.length) { toast('Önce bir kart ekleyin'); return; }
  EX = null;
  var c = cardById(cardId) || cardById(defaultCardId()) || S.cards[0];
  modal('Ekstre yükle',
    '<div class="muted" style="margin-bottom:12px">Ay içinde elle girdiğin harcamalar ekstredeki satırlarla ' +
      '<b>eşleştirilir</b>; aynı işlem ikinci kez yazılmaz. Onaylamadan önce her satırı göreceksin.</div>' +
    '<div class="frm two">' +
      '<label class="f"><span>Kart</span><select id="xCard">' + cardOptions(c.id) + '</select></label>' +
      '<label class="f"><span>Kişi</span><select id="xPerson">' + peopleOpts(c.owner) + '</select></label>' +
    '</div>' +
    '<label class="f" style="margin-top:12px"><span>Ekstre dosyası</span>' +
      '<input type="file" id="xFile" accept=".pdf,.xlsx,.xls,.csv,.txt"></label>' +
    '<div class="muted" style="margin-top:8px">PDF, Excel ya da CSV. Dosya bu cihazda okunur, hiçbir yere gönderilmez.</div>' +
    '<div id="xMsg" style="margin-top:10px"></div>',
    '<button class="btn" data-act="closeModal">Vazgeç</button>');
  $('#xCard').addEventListener('change', function () {
    var k = cardById($('#xCard').value); if (k && k.owner) $('#xPerson').value = k.owner;
  });
  $('#xFile').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    var cid = val('xCard'), person = val('xPerson');
    $('#xMsg').innerHTML = '<div class="muted">Okunuyor…</div>';
    ekstreDosyaOku(f).then(function (st) {
      if (!st.rows.length) {
        $('#xMsg').innerHTML = '<div class="warnbox"><span>⚠</span><div><b class="xt">İşlem satırı bulunamadı</b>' +
          'Dosyada tarih ve tutar içeren satır yok ya da dosya taranmış bir görüntü. Bankanın Excel ya da metin tabanlı PDF çıktısını deneyin.</div></div>';
        return;
      }
      ekstreBaslat(cid, person, f.name, st);
    }).catch(function (err) {
      $('#xMsg').innerHTML = '<div class="warnbox crit"><span>⚠</span><div><b class="xt">Dosya okunamadı</b>' + esc(err && err.message || err) + '</div></div>';
    });
  });
}

function ekstreBaslat(cardId, person, fileName, st) {
  var card = cardById(cardId);
  var close = st.close, due = st.due;
  if (!close) {       /* dosyada kesim tarihi yoksa: en son harcamanın düştüğü dönemin kesimi */
    var dmax = st.rows.reduce(function (a, r) { return r.type !== 'PAYMENT' && r.date > a ? r.date : a; }, st.rows[0].date);
    var p0 = card.statementDay ? HZ.StatementPeriod.forDate(dmax, card) : null;
    close = p0 ? p0.close : dmax;
  }
  EX = { cardId: cardId, person: person, file: fileName, st: st, close: close, due: due || '',
    total: st.total, dec: {}, orph: {}, esitle: st.total != null };
  ekstreHesapla(); ekstreOnizle();
}
/** Ekstrenin dönemi: gerçek kesim tarihiyle, kartın varsayılan günü yerine */
function ekstreDonem() {
  var card = cardById(EX.cardId), c = D.parse(EX.close);
  var base = Object.assign({}, card, {
    statementDay: card.statementDay || c.d,
    dueDay: card.dueDay || (EX.due ? D.parse(EX.due).d : null)
  });
  var pk = HZ.StatementPeriod.keyForClose(base, EX.close), ek = Object.assign({}, card.ekstre || {});
  ek[pk] = Object.assign({}, ek[pk] || {}, { close: EX.close });
  if (EX.due) ek[pk].due = EX.due;
  var card2 = Object.assign({}, base, { ekstre: ek }), q = pk.split('-');
  return { pk: pk, card: card2, period: HZ.StatementPeriod.build(+q[0], +q[1], card2) };
}
function ekstreHesapla() {
  var d = ekstreDonem();
  EX.pk = d.pk; EX.period = d.period; EX.card2 = d.card;
  EX.res = HZ.Recon.match(EX.st.rows, S.transactions, d.card, d.period);
  var eski = EX.dec; EX.dec = {};
  EX.res.items.forEach(function (o) {
    var def = o.status === 'YENI' ? 'ekle' : o.status === 'VAR' ? 'atla' : 'esle';
    var k = o.row.key + '|' + o.status;
    EX.dec[o.row.key] = eski[k] || def; EX.dec[k] = EX.dec[o.row.key];
  });
}
function exKarar(o) { return EX.dec[o.row.key]; }
function exSay() {
  var n = { ekle: 0, esle: 0, atla: 0, sil: 0 };
  EX.res.items.forEach(function (o) { n[exKarar(o)]++; });
  EX.res.orphans.forEach(function (t) { if (EX.orph[t.id] === 'sil') n.sil++; });
  return n;
}
var TUR_TR = { PAYMENT: 'ödeme', REFUND: 'iade', FEE: 'faiz / ücret' };
function exSatir(o, i) {
  var r = o.row, k = exKarar(o);
  var etiket = (TUR_TR[r.type] ? '<span class="tag">' + TUR_TR[r.type] + '</span> ' : '') +
    (r.inst ? '<span class="tag">' + r.inst.no + (r.inst.count ? '/' + r.inst.count : '.') + ' taksit</span> ' : '');
  var es = o.tx ? '<div class="xes">↔ elle girdiğin: <b>' + esc(o.tx.note || o.tx.category || '—') + '</b> · ' +
    D.trFmt(o.tx.date) + (o.diff ? ' · <b>' + money(o.tx.amount) + '</b>' : '') + '</div>' : '';
  function b(v, t) {
    return '<button data-act="xDec" data-i="' + i + '" data-v="' + v + '" aria-pressed="' + (k === v) + '">' + t + '</button>';
  }
  var sec = o.status === 'VAR' ? '<span class="muted">daha önce yüklendi</span>'
    : '<div class="seg sm">' + (o.status === 'YENI' ? b('ekle', 'Ekle') + b('atla', 'Atla')
      : b('esle', o.diff ? 'Aynı işlem — tutarı düzelt' : 'Aynı işlem') + b('ekle', 'Ayrı kayıt')) + '</div>';
  return '<div class="xrow s-' + o.status + '">' +
    '<div class="xd num">' + D.trFmt(r.date).slice(0, 5) + '</div>' +
    '<div class="xn"><div>' + etiket + esc(r.desc || '—') + '</div>' + es + '</div>' +
    '<div class="xa num"' + (r.type === 'PAYMENT' || r.type === 'REFUND' ? ' style="color:var(--ok)"' : '') + '>' +
      (r.type === 'PAYMENT' || r.type === 'REFUND' ? '+' : '') + money(r.amount) + '</div>' +
    '<div class="xc">' + sec + '</div></div>';
}
function exGrup(baslik, aciklama, durum) {
  var list = EX.res.items.map(function (o, i) { return o.status === durum ? exSatir(o, i) : ''; }).join('');
  if (!list) return '';
  return '<div class="xgrp"><div class="xgh"><b>' + baslik + '</b> <span class="muted">' + aciklama + '</span></div>' + list + '</div>';
}
function exSaglama() {
  var st = EX.st;
  if (EX.total == null) return '<div class="muted" id="xChk">Dönem borcunu girersen dosyanın eksiksiz okunduğunu sağlarım.</div>';
  if (st.calc === EX.total) {
    return '<div class="warnbox" id="xChk" style="background:var(--ok-soft);border-color:var(--ok);color:var(--ok)"><span>✓</span>' +
      '<div><b class="xt">Okuma sağlaması tuttu</b>önceki devir ' + money(st.carry || 0) + ' + harcamalar ' + money(st.charges) +
      ' − ödeme/iade ' + money(st.credits) + ' = ' + money(EX.total) + '</div></div>';
  }
  return '<div class="warnbox" id="xChk"><span>⚠</span><div><b class="xt">Sağlama tutmuyor — fark ' + money(st.calc - EX.total) + '</b>' +
    'Okunan satırlar ' + money(st.calc) + ' ediyor, ekstredeki dönem borcu ' + money(EX.total) +
    '. Bir satır eksik ya da yanlış okunmuş olabilir; listeyi ekstreyle karşılaştır.</div></div>';
}
function exAlt() {
  var n = exSay();
  return '<button class="btn" data-act="closeModal">Vazgeç</button>' +
    '<button class="btn pri" data-act="xUygula" id="xOk">Onayla — ' + n.ekle + ' yeni kayıt</button>';
}
/* 2. adım: önizleme */
function ekstreOnizle() {
  var card = cardById(EX.cardId), c = EX.res.counts, yet = EX.res.orphans;
  modal(card.name + ' · ekstre önizleme',
    '<div class="muted" style="margin-bottom:10px">' + esc(EX.st.bank) + ' · ' + esc(EX.file) + ' · ' + EX.st.rows.length + ' satır</div>' +
    '<div class="frm three">' +
      '<label class="f"><span>Hesap kesim</span><input type="date" id="xClose" value="' + esc(EX.close) + '"></label>' +
      '<label class="f"><span>Son ödeme</span><input type="date" id="xDue" value="' + esc(EX.due) + '"></label>' +
      '<label class="f"><span>Dönem borcu</span><input id="xTotal" class="money" inputmode="decimal" value="' +
        (EX.total != null ? M.fmt(EX.total, { symbol: false }) : '') + '" placeholder="ekstredeki tutar"></label>' +
    '</div>' +
    '<div class="muted" style="margin:8px 0 12px">Bu ekstrenin dönemi: <b>' + esc(EX.period.label) + '</b> — ' +
      D.monthLabel(EX.pk) + ' ekstresi' + (EX.st.close ? '' : ' <span class="tag alt">kesim tarihi tahmin edildi, ekstredeki tarihle düzelt</span>') + '</div>' +
    exSaglama() +
    (c.VAR === EX.st.rows.length ? '<div class="warnbox" style="margin-top:10px;background:var(--surf2);border-color:var(--brd);color:var(--ink2)"><span>ℹ</span>' +
      '<div><b class="xt">Bu ekstre daha önce yüklenmiş</b>Bütün satırlar zaten kayıtlı; eklenecek yeni işlem yok.</div></div>' : '') +
    '<div class="chips" style="margin:14px 0 4px">' +
      '<span class="pill PAID">' + c.YENI + ' yeni</span>' +
      '<span class="pill UNPAID">' + c.ESLESTI + ' eşleşti</span>' +
      (c.BENZER ? '<span class="pill SOON">' + c.BENZER + ' benzer</span>' : '') +
      '<span class="pill ghost">' + c.VAR + ' zaten var</span>' +
      (yet.length ? '<span class="pill OVERDUE">' + yet.length + ' ekstrede yok</span>' : '') +
    '</div>' +
    exGrup('Benzer — karar ver', 'aynı günlerde, tutarı çok yakın bir kaydın var', 'BENZER') +
    exGrup('Elle girdiğinle eşleşti', 'yeni kayıt açılmayacak', 'ESLESTI') +
    exGrup('Yeni', 'uygulamada karşılığı yok, eklenecek', 'YENI') +
    (yet.length ? '<div class="xgrp"><div class="xgh"><b>Ekstrede yok</b> <span class="muted">bu dönemde elle girmişsin ama ekstrede görünmüyor</span></div>' +
      yet.map(function (t) {
        var k = EX.orph[t.id] || 'kalsin';
        return '<div class="xrow s-YOK"><div class="xd num">' + D.trFmt(t.date).slice(0, 5) + '</div>' +
          '<div class="xn">' + esc(t.note || t.category || '—') + '</div>' +
          '<div class="xa num">' + money(t.amount) + '</div>' +
          '<div class="xc"><div class="seg sm">' +
            '<button data-act="xOrph" data-id="' + esc(t.id) + '" data-v="kalsin" aria-pressed="' + (k === 'kalsin') + '">Kalsın</button>' +
            '<button data-act="xOrph" data-id="' + esc(t.id) + '" data-v="sil" aria-pressed="' + (k === 'sil') + '">Sil</button>' +
          '</div></div></div>';
      }).join('') + '</div>' : '') +
    (c.VAR ? '<div class="muted" style="margin-top:12px">' + c.VAR + ' satır daha önce yüklendiği için atlanıyor.</div>' : '') +
    '<label class="xchk"><input type="checkbox" id="xEsitle"' + (EX.esitle ? ' checked' : '') + '>' +
      '<span>Kart borcunu ekstredeki <b>dönem borcuna eşitle</b><span class="muted" style="display:block">Geçmiş aylar eksik girilmişse kartın borcu ekstreyle aynı olur.</span></span></label>',
    exAlt());
  var host = $('#modalHost');
  host.querySelector('.sheet').classList.add('wide');
  function yeniden() {
    EX.close = val('xClose') || EX.close; EX.due = val('xDue');
    ekstreHesapla(); ekstreOnizle();
  }
  $('#xClose').addEventListener('change', yeniden);
  $('#xDue').addEventListener('change', yeniden);
  $('#xTotal').addEventListener('change', function () {
    EX.total = val('xTotal') ? mval('xTotal') : null;
    var chk = $('#xChk'); if (chk) chk.outerHTML = exSaglama();
  });
  $('#xEsitle').addEventListener('change', function () { EX.esitle = $('#xEsitle').checked; });
}
function exBas(sel, v) {
  document.querySelectorAll(sel).forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === v); });
  var ok = $('#xOk'); if (ok) ok.textContent = 'Onayla — ' + exSay().ekle + ' yeni kayıt';
}

/** Daha önce aynı işyerine verdiğin kategori; yoksa sözlük tahmini */
function kategoriBul(desc, harita) {
  return harita[HZ.Recon.norm(desc)] || HZ.autoCategory(desc);
}
function kategoriHaritasi() {
  var m = {};
  S.transactions.slice().sort(function (a, b) { return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1; })
    .forEach(function (t) {
      if (t.kind !== KIND.EXPENSE || !t.category || t.category === 'Diğer') return;
      if (t.raw) m[HZ.Recon.norm(t.raw)] = t.category;
      if (t.note) m[HZ.Recon.norm(t.note)] = t.category;
    });
  return m;
}
function txYerinde(id, fn) {
  for (var mk in S.buckets) {
    var arr = S.buckets[mk] || [], i = arr.findIndex(function (t) { return t.id === id; });
    if (i >= 0) {
      var kopya = arr.slice(), yeni = fn(Object.assign({}, arr[i]));
      if (yeni) kopya[i] = yeni; else kopya.splice(i, 1);
      S.buckets[mk] = kopya; return mk;
    }
  }
  return null;
}

/* 3. adım: uygula */
async function ekstreUygula() {
  if (!EX) return;
  var card = cardById(EX.cardId), per = EX.period, kat = kategoriHaritasi();
  var imp = { id: uid('imp'), cardId: card.id, pk: EX.pk, file: EX.file, bank: EX.st.bank,
    at: new Date().toISOString(), close: EX.close, added: 0, matched: 0, changed: [], removed: [],
    prevEkstre: (card.ekstre && card.ekstre[EX.pk]) || null, openingDelta: 0,
    learnedDay: !card.statementDay };
  var dokunulan = {}, simdi = new Date().toISOString();

  EX.res.items.forEach(function (o) {
    var r = o.row, k = exKarar(o), eff = HZ.Recon.sdateFor(r.date, per);
    if (k === 'atla') return;
    if (k === 'esle' && o.tx) {
      var mk = txYerinde(o.tx.id, function (t) {
        imp.changed.push({ id: t.id, ikey: t.ikey || null, sdate: t.sdate || null, amount: t.amount, raw: t.raw || null, imp: t.imp || null });
        t.ikey = r.key; t.raw = r.desc; t.imp = imp.id;
        if (o.diff) t.amount = r.amount;
        var e = eff || r.date;
        if (t.kind !== KIND.CARD_PAYMENT && e !== t.date) t.sdate = e; else delete t.sdate;
        return t;
      });
      if (mk) { dokunulan[mk] = 1; imp.matched++; }
      return;
    }
    var odeme = r.type === 'PAYMENT', iade = r.type === 'REFUND';
    var t = {
      id: uid('t'), kind: odeme ? KIND.CARD_PAYMENT : iade ? KIND.REFUND : KIND.EXPENSE,
      date: r.date, amount: r.amount, person: EX.person,
      method: odeme ? METHOD.BANK : METHOD.CARD, cardId: card.id,
      category: odeme ? 'Kredi Kartı' : r.type === 'FEE' ? 'Faiz & Ücret' : kategoriBul(r.desc, kat),
      note: odeme ? 'Kart ödemesi' : r.desc, raw: r.desc, ikey: r.key, imp: imp.id, createdAt: simdi
    };
    if (!odeme && eff) t.sdate = eff;
    if (r.inst) t.installment = { groupId: null, no: r.inst.no, count: r.inst.count || 0, planName: r.desc };
    var bk = D.monthKey(t.date);
    S.buckets[bk] = (S.buckets[bk] || []).concat([t]); dokunulan[bk] = 1; imp.added++;
  });
  EX.res.orphans.forEach(function (t) {
    if (EX.orph[t.id] !== 'sil') return;
    var mk = txYerinde(t.id, function (x) { imp.removed.push(x); return null; });
    if (mk) dokunulan[mk] = 1;
  });

  /* ekstre kaydı karta: bundan sonra bu ayın dönemi gerçek tarihlerle hesaplanır */
  var st = EX.st, iadeler = st.rows.reduce(function (s, r) { return s + (r.type === 'REFUND' ? r.amount : 0); }, 0);
  var yeniKart = Object.assign({}, card, { ekstre: Object.assign({}, card.ekstre || {}) });
  if (!yeniKart.statementDay) yeniKart.statementDay = D.parse(EX.close).d;
  if (!yeniKart.dueDay && EX.due) yeniKart.dueDay = D.parse(EX.due).d;
  yeniKart.ekstre[EX.pk] = { close: EX.close, due: EX.due || EX.period.dueDate || null, total: EX.total,
    carry: st.carry || 0, net: st.charges - iadeler, rows: st.rows.length, imp: imp.id, at: simdi };
  if (EX.esitle && EX.total != null) {
    var bak = HZ.Cards.currentBalance(yeniKart, S.transactions, EX.close);
    imp.openingDelta = EX.total - bak;
    yeniKart.openingBalance = (yeniKart.openingBalance || 0) + imp.openingDelta;
  }
  S.cards = S.cards.map(function (c) { return c.id === card.id ? yeniKart : c; });
  S.imports = (S.imports || []).concat([imp]);

  await Store.putBuckets(Object.keys(dokunulan));
  await Store.put('cards', card.id, yeniKart);
  await Store.put('imports', imp.id, imp);
  var var_ = EX.res.counts.VAR;
  EX = null; closeModal(); renderAll();
  toast(imp.added + ' yeni eklendi · ' + imp.matched + ' eşleşti' + (var_ ? ' · ' + var_ + ' zaten vardı' : ''));
}

/* İçe aktarmayı geri al: eklenenler silinir, eşleşenler eski hâline döner */
async function ekstreGeriAl(impId) {
  var imp = (S.imports || []).find(function (x) { return x.id === impId; });
  if (!imp) return;
  var dokunulan = {}, eski = {};
  imp.changed.forEach(function (c) { eski[c.id] = c; });
  for (var mk in S.buckets) {
    var arr = S.buckets[mk] || [], yeni = [], degisti = false;
    arr.forEach(function (t) {
      if (eski[t.id]) {
        var c = eski[t.id], x = Object.assign({}, t, { amount: c.amount });
        ['ikey', 'sdate', 'raw', 'imp'].forEach(function (f) { if (c[f] == null) delete x[f]; else x[f] = c[f]; });
        yeni.push(x); degisti = true;
      } else if (t.imp === imp.id) { degisti = true; }
      else yeni.push(t);
    });
    if (degisti) { S.buckets[mk] = yeni; dokunulan[mk] = 1; }
  }
  (imp.removed || []).forEach(function (t) {
    var bk = D.monthKey(t.date);
    S.buckets[bk] = (S.buckets[bk] || []).concat([t]); dokunulan[bk] = 1;
  });
  /* önce işlemler (kopyası alınarak), sonra kart ve yükleme kaydı */
  await Store.putBuckets(Object.keys(dokunulan));
  var card = cardById(imp.cardId);
  if (card) {
    var k = Object.assign({}, card, { ekstre: Object.assign({}, card.ekstre || {}) });
    if (imp.prevEkstre) k.ekstre[imp.pk] = imp.prevEkstre; else delete k.ekstre[imp.pk];
    if (imp.openingDelta) k.openingBalance = (k.openingBalance || 0) - imp.openingDelta;
    S.cards = S.cards.map(function (c) { return c.id === k.id ? k : c; });
    await Store.put('cards', k.id, k);
  }
  S.imports = S.imports.filter(function (x) { return x.id !== impId; });
  await Store.del('imports', impId);
  renderAll(); toast('İçe aktarma geri alındı');
}

/* Kartlar sekmesi: son ekstreler, gerçek tarihleri ve durumu */
function ekstreTakvimi(c) {
  if (!c.statementDay) {
    return '<div class="xcal"><div class="muted">Kesim günü tanımlı değil — ilk ekstreyi yükleyince tarihleri ekstreden öğrenirim.</div></div>';
  }
  var today = D.todayISO(), cur = HZ.StatementPeriod.forDate(today, c), p = D.parse(cur.periodKey + '-01');
  var rows = [];
  for (var k = -2; k <= 0; k++) {
    var mm = D.addMonths(p.y, p.m, k), sp = HZ.StatementPeriod.build(mm.y, mm.m, c);
    var e = (c.ekstre || {})[sp.periodKey], acik = k === 0;
    var durum;
    if (e && e.imp) {
      var harc = HZ.Cards.statement(c, S.transactions, sp, today).periodSpend, fark = harc - (e.net || 0);
      durum = fark === 0 ? '<span class="pill PAID">yüklendi · ekstreyle aynı</span>'
        : '<span class="pill SOON">yüklendi · uygulamada ' + money(Math.abs(fark)) + (fark > 0 ? ' fazla' : ' eksik') + '</span>';
    } else durum = acik ? '<span class="pill ghost">dönem açık</span>' : '<span class="pill UNPAID">ekstre yüklenmedi</span>';
    rows.push('<div class="xcr"><div class="grow"><b>' + esc(D.monthLabel(sp.periodKey).split(' ')[0]) + '</b> ' +
      '<span class="muted">' + esc(sp.label) + '</span>' +
      '<div class="muted">kesim ' + D.trFmt(sp.close) + ' · son ödeme ' + (sp.dueDate ? D.trFmt(sp.dueDate) : '—') +
      (sp.actual ? ' · <span class="tag">gerçek tarih</span>' : '') + '</div></div>' +
      '<div class="xcs">' + durum + '</div>' +
      '<div class="acts">' +
        '<button class="btn sm" data-act="kesimEdit" data-id="' + esc(c.id) + '" data-k="' + sp.periodKey + '">Tarih</button>' +
        (e && e.imp ? '<button class="btn sm dang" data-act="impUndo" data-id="' + esc(e.imp) + '">Geri al</button>' : '') +
      '</div></div>');
  }
  return '<div class="xcal"><div class="lbl" style="margin-bottom:6px">Ekstreler</div>' + rows.reverse().join('') + '</div>';
}
function kesimModal(cardId, pk) {
  var c = cardById(cardId); if (!c) return;
  var q = pk.split('-'), sp = HZ.StatementPeriod.build(+q[0], +q[1], c);
  var vars = HZ.StatementPeriod.closingOf(+q[0], +q[1], c.statementDay);
  modal(c.name + ' · ' + D.monthLabel(pk) + ' ekstresi',
    '<div class="muted" style="margin-bottom:12px">Bankalar kesim gününü hafta sonuna ya da tatile göre 1–2 gün kaydırır. ' +
      'Bu ayın gerçek tarihlerini ekstrendeki gibi yaz; harcamalar doğru aya düşsün. Varsayılan: ayın ' + c.statementDay + '\'i (' + D.trFmt(vars) + ').</div>' +
    '<div class="frm two">' +
      '<label class="f"><span>Hesap kesim tarihi</span><input type="date" id="kClose" value="' + esc(sp.close) + '"></label>' +
      '<label class="f"><span>Son ödeme tarihi</span><input type="date" id="kDue" value="' + esc(sp.dueDate || '') + '"></label>' +
    '</div>',
    (sp.actual ? '<button class="btn" data-act="kesimSil" data-id="' + esc(cardId) + '" data-k="' + pk + '">Varsayılana dön</button>'
      : '<button class="btn" data-act="closeModal">Vazgeç</button>') +
    '<button class="btn pri" data-act="kesimSave" data-id="' + esc(cardId) + '" data-k="' + pk + '">Kaydet</button>');
}
async function kesimKaydet(cardId, pk, sil) {
  var c = cardById(cardId); if (!c) return;
  var k = Object.assign({}, c, { ekstre: Object.assign({}, c.ekstre || {}) });
  var e = Object.assign({}, k.ekstre[pk] || {});
  if (sil) { delete e.close; delete e.due; }
  else { e.close = val('kClose') || e.close; if (val('kDue')) e.due = val('kDue'); else delete e.due; }
  if (Object.keys(e).length) k.ekstre[pk] = e; else delete k.ekstre[pk];
  S.cards = S.cards.map(function (x) { return x.id === k.id ? k : x; });
  await Store.put('cards', k.id, k);
  closeModal(); renderAll(); toast(sil ? 'Varsayılan tarihe dönüldü' : 'Ekstre tarihleri kaydedildi');
}

/** Elle girişte: aynı kart/yöntem, aynı tutar, ±1 gün içinde kayıt var mı? */
function benzerKayit(kind, cardId, method, amount, date) {
  var s = D.serial(date);
  return S.transactions.filter(function (t) {
    return t.kind === kind && t.amount === amount && Math.abs(D.serial(t.date) - s) <= 1 &&
      (cardId ? t.cardId === cardId : (!t.cardId && t.method === method));
  })[0] || null;
}

/* --- yedek ---------------------------------------------------------- */
async function exportJson() {
  var payload = JSON.stringify({
    v: 3, exportedAt: new Date().toISOString(),
    config: S.config, cards: S.cards, recurring: S.recurring, plans: S.plans, buckets: S.buckets, imports: S.imports
  }, null, 2);
  var dl = null;
  try { dl = typeof claude !== 'undefined' ? await claude.use('downloads') : null; } catch (e) { }
  var name = 'hz-finans-yedek-' + D.todayISO() + '.json';
  if (!dl && typeof Blob !== 'undefined' && typeof claude === 'undefined') {
    /* GitHub sürümü: dosya doğrudan iner */
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Yedek indirildi'); return;
  }
  if (dl) {
    try { await dl.save({ filename: name, data: payload }); toast('Yedek indirildi'); return; }
    catch (e) { if (e && e.code === 'cancelled') return; }
  }
  modal('JSON yedek', '<div class="muted" style="margin-bottom:8px">Aşağıdaki metni kopyalayıp bir dosyaya kaydedin.</div>' +
    '<textarea rows="12" style="font-family:var(--mono);font-size:11px">' + esc(payload) + '</textarea>', '<button class="btn pri" data-act="closeModal">Kapat</button>');
}
function importJsonModal() {
  modal('Yedekten yükle',
    '<div class="warnbox crit"><span>⚠</span><div>Yedek, buradaki verinin <b>yerine geçer</b>: yedekte olmayan kartlar, tanımlar ve işlemler silinir.</div></div>' +
    '<label class="f" style="margin-top:12px"><span>Yedek dosyası</span><input type="file" id="jsonFile" accept=".json,.txt"></label>' +
    '<label class="f" style="margin-top:12px"><span>ya da JSON içeriğini yapıştır</span><textarea id="jsonIn" rows="10" style="font-family:var(--mono);font-size:11px" placeholder="{ ... }"></textarea></label>',
    '<button class="btn" data-act="closeModal">Vazgeç</button><button class="btn pri" data-act="importJsonRun">Yükle</button>');
  $('#jsonFile').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    f.text().then(function (t) { $('#jsonIn').value = t; toast('Dosya okundu — Yükle\'ye bas'); });
  });
}
async function importJsonRun() {
  var oncekiKapanis = HZ.kapanisTarihi(S.config);
  var d;
  try { d = JSON.parse(val('jsonIn')); } catch (e) { toast('Geçersiz JSON'); return; }
  if (!d || (!d.buckets && !d.cards && !d.config)) { toast('Bu dosya bir H&Z Finans yedeği değil'); return; }
  /* Yedek, mevcut verinin YERİNE geçer: yedekte olmayan kartlar, tanımlar ve aylar silinir. */
  async function koleksiyon(ad, yeni) {
    var eski = S[ad] || [], var_ = {};
    (yeni || []).forEach(function (x) { var_[x.id] = 1; });
    S[ad] = yeni || [];
    for (var i = 0; i < eski.length; i++) if (!var_[eski[i].id]) await Store.del(ad, eski[i].id);
    for (var j = 0; j < S[ad].length; j++) await Store.put(ad, S[ad][j].id, S[ad][j]);
  }
  if (d.config) { S.config = d.config; await Store.saveConfig(); }
  await koleksiyon('cards', d.cards);
  await koleksiyon('recurring', d.recurring);
  await koleksiyon('plans', d.plans);
  await koleksiyon('imports', d.imports);
  var yeniB = d.buckets || {}, hepsi = {};
  Object.keys(S.buckets).forEach(function (k) { hepsi[k] = 1; });
  Object.keys(yeniB).forEach(function (k) { hepsi[k] = 1; });
  S.buckets = {};
  Object.keys(hepsi).forEach(function (k) { S.buckets[k] = yeniB[k] || []; });
  await Store.putBuckets(Object.keys(hepsi));
  closeModal(); renderAll();
  /* Borçlar daha önce kapatıldıysa ve yedekte kapanış yoksa (ör. eski uygulamanın
     yedeği), aynı tarihle yeniden uygula — eski borçlar geri gelmesin. */
  if (oncekiKapanis && !HZ.kapanisTarihi(S.config)) await kapanisUygula(oncekiKapanis, true);
  toast('Yedek yüklendi · ' + S.transactions.length + ' işlem, ' + S.cards.length + ' kart' +
    (oncekiKapanis && HZ.kapanisTarihi(S.config) ? ' · borçlar ' + D.trFmt(HZ.kapanisTarihi(S.config)) + ' itibarıyla kapalı' : ''));
}

/* --- borçları kapat (sıfır noktası) --------------------------------
   "Bu tarihe kadar her şeyi ödedim." Profesyonel uygulamalardaki "mutabakat
   kilidi" gibi çalışır: kayıt uydurmaz, bir tarih koyar.
   · Kart: kapanış günü ve öncesindeki hareketler bakiyeye girmez → borç 0.
     O tarihten önce kesilmiş ekstreler "ödendi" görünür.
   · Taksit: kapanıştan sonraya düşen taksitler kaldırılır (erken kapatıldı).
   · Düzenli ödeme: vadesi kapanış gününe kadar olanlar ödenmiş sayılır.
   Geçmiş kayıtlar silinmez; her şey geri alınabilir.                     */
function kapanisOnizle(tarih) {
  var txs = S.transactions, s = D.serial(tarih);
  var kartlar = S.cards.filter(function (c) { return c.active !== false; }).map(function (c) {
    var c0 = Object.assign({}, c, { kapanis: null });
    if (c.kapanisOnce) c0.openingBalance = c.kapanisOnce.openingBalance;
    return { c: c, borc: HZ.Cards.currentBalance(c0, txs, tarih) };
  });
  var taksit = txs.filter(function (t) { return t.installment && t.cardId && D.serial(HZ.cdate(t)) > s; });
  return { kartlar: kartlar, taksit: taksit };
}
function kapanisModal() {
  var tarih = HZ.kapanisTarihi(S.config) || D.todayISO();
  modal('Borçları kapat',
    '<div class="muted" style="margin-bottom:12px">Seçtiğin güne kadarki bütün kart borçları, ekstreler, taksitler ve düzenli ödemeler <b>ödenmiş</b> sayılır. ' +
      'Kartların borcu o günden itibaren sıfırdan başlar; yeni harcamaların ve yükleyeceğin ekstreler bu tarihten sonrası için işlenir. Geçmiş kayıtların silinmez.</div>' +
    '<label class="f"><span>Bu tarihe kadar her şey ödendi</span><input type="date" id="kTarih" value="' + tarih + '"></label>' +
    '<div id="kOn" style="margin-top:14px"></div>',
    '<button class="btn" data-act="closeModal">Vazgeç</button>' +
    '<button class="btn pri" data-act="kapanisUygula">Borçları kapat</button>');
  function ciz() {
    var t = val('kTarih') || D.todayISO(), o = kapanisOnizle(t);
    var toplam = o.kartlar.reduce(function (a, k) { return a + Math.max(k.borc, 0); }, 0);
    var tk = o.taksit.reduce(function (a, x) { return a + x.amount; }, 0);
    $('#kOn').innerHTML = '<div class="lbl" style="margin-bottom:4px">Kapanacak kart borçları</div>' +
      o.kartlar.map(function (k) {
        return '<div class="rowline"><div class="grow">' + esc(k.c.name) + '</div><div class="num">' + money(Math.max(k.borc, 0)) + ' → <b>0,00 ₺</b></div></div>';
      }).join('') +
      '<div class="rowline"><div class="grow"><b>Toplam</b></div><div class="num"><b>' + money(toplam) + '</b></div></div>' +
      (o.taksit.length ? '<div class="warnbox" style="margin-top:12px"><span>ℹ</span><div><b class="xt">' + o.taksit.length + ' gelecek taksit kaldırılacak · ' + money(tk) + '</b>' +
        D.trFmt(t) + ' sonrasına düşen taksitler erken kapatılmış sayılır.</div></div>' : '');
  }
  $('#kTarih').addEventListener('change', ciz);
  ciz();
}
async function kapanisUygula(tarih, sessiz) {
  if (HZ.kapanisTarihi(S.config)) await kapanisGeriAl(true);   /* tarih değişiyorsa önce eskisini geri al */
  var s = D.serial(tarih), simdi = new Date().toISOString();
  var kayit = { date: tarih, at: simdi, cards: {}, removed: [], plans: [] };

  /* kapanıştan sonraya düşen taksitler: erken kapatıldı */
  var dokunulan = {}, planlar = {};
  for (var mk in S.buckets) {
    var arr = S.buckets[mk] || [];
    var kalan = arr.filter(function (t) {
      var sil = t.installment && t.cardId && D.serial(HZ.cdate(t)) > s;
      if (sil) { kayit.removed.push(t); if (t.installment.groupId) planlar[t.installment.groupId] = 1; }
      return !sil;
    });
    if (kalan.length !== arr.length) { S.buckets[mk] = kalan; dokunulan[mk] = 1; }
  }
  await Store.putBuckets(Object.keys(dokunulan));
  for (var i = 0; i < S.plans.length; i++) {
    var p = S.plans[i];
    if (!planlar[p.id]) continue;
    kayit.plans.push(p.id);
    S.plans[i] = Object.assign({}, p, { kapandi: tarih });
    await Store.put('plans', p.id, S.plans[i]);
  }
  /* kartlar: borç bu tarihte sıfır */
  for (var j = 0; j < S.cards.length; j++) {
    var c = S.cards[j];
    kayit.cards[c.id] = { openingBalance: c.openingBalance || 0 };
    var k = Object.assign({}, c, { kapanis: tarih, openingBalance: 0, kapanisOnce: { openingBalance: c.openingBalance || 0 } });
    S.cards[j] = k;
    await Store.put('cards', k.id, k);
  }
  /* bu ayın kaydı: yeni harcamalar ve yüklenecek ekstreler için boş ay açılır */
  var buAy = D.monthKey(D.todayISO());
  if (!S.buckets[buAy]) { S.buckets[buAy] = []; await Store.putBucket(buAy); }
  S.config.kapanis = kayit;
  await Store.saveConfig();
  if (!sessiz) {
    closeModal(); renderAll();
    toast(D.trFmt(tarih) + ' itibarıyla tüm borçlar kapatıldı' + (kayit.removed.length ? ' · ' + kayit.removed.length + ' taksit kaldırıldı' : ''));
  }
}
async function kapanisGeriAl(sessiz) {
  var kayit = S.config.kapanis; if (!kayit) return;
  if (typeof kayit === 'string') kayit = { date: kayit, cards: {}, removed: [], plans: [] };
  var dokunulan = {};
  (kayit.removed || []).forEach(function (t) {
    var bk = D.monthKey(t.date);
    if ((S.buckets[bk] || []).some(function (x) { return x.id === t.id; })) return;
    S.buckets[bk] = (S.buckets[bk] || []).concat([t]); dokunulan[bk] = 1;
  });
  await Store.putBuckets(Object.keys(dokunulan));
  for (var i = 0; i < S.plans.length; i++) {
    if (!S.plans[i].kapandi) continue;
    var p = Object.assign({}, S.plans[i]); delete p.kapandi;
    S.plans[i] = p; await Store.put('plans', p.id, p);
  }
  for (var j = 0; j < S.cards.length; j++) {
    var c = S.cards[j];
    if (!c.kapanis && !c.kapanisOnce) continue;
    var k = Object.assign({}, c);
    var once = (kayit.cards || {})[c.id] || c.kapanisOnce;
    /* kapanıştan sonra ekstre eşitlemesiyle eklenen fark korunur */
    if (once) k.openingBalance = (once.openingBalance || 0) + (c.openingBalance || 0);
    delete k.kapanis; delete k.kapanisOnce;
    S.cards[j] = k; await Store.put('cards', k.id, k);
  }
  delete S.config.kapanis;
  await Store.saveConfig();
  if (!sessiz) { closeModal(); renderAll(); }
}
function kapanisSerit() {
  var t = HZ.kapanisTarihi(S.config); if (!t) return '';
  var gun = D.diffDays(D.todayISO(), t);
  if (gun > 45) return '';
  return '<div class="warnbox" style="background:var(--ok-soft);border-color:var(--ok);color:var(--ok);align-items:center"><span>✓</span>' +
    '<div style="flex:1"><b class="xt">' + D.trFmt(t) + ' itibarıyla tüm borçlar kapatıldı</b>' +
    'Kart borçları bu tarihten sonra sıfırdan başlıyor. Yeni harcamaları gir ya da ekstreni yükle.</div>' +
    '<button class="btn sm" data-act="ekstre">Ekstre yükle</button></div>';
}

/* --- mükerrer kayıt temizliği ---------------------------------------
   Eski içe aktarmalardan kalan çift kayıtları bulur. Aynı kart/yöntem, aynı tür,
   aynı tutar: aynı gün ise "kesin", 1–3 gün arayla ise "olası". İki kaydı da
   ekstre doğrulamışsa bunlar gerçekten ayrı işlemlerdir, listelenmez.      */
function mukerrerGruplari() {
  function anahtar(t) { return [t.kind, t.cardId || t.method || '', t.amount].join('|'); }
  var l = S.transactions.filter(function (t) { return t.amount > 0; }).sort(function (a, b) {
    var ka = anahtar(a), kb = anahtar(b);
    return ka < kb ? -1 : ka > kb ? 1 : (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  });
  var out = [], g = null;
  l.forEach(function (t) {
    var son = g && g.items[g.items.length - 1];
    if (son && anahtar(son) === anahtar(t) && D.serial(t.date) - D.serial(son.date) <= 3 &&
        !(t.installment && son.installment && t.installment.no !== son.installment.no)) g.items.push(t);
    else { g = { items: [t] }; out.push(g); }
  });
  return out.filter(function (x) {
    if (x.items.length < 2) return false;
    return x.items.filter(function (t) { return t.ikey; }).length < x.items.length;
  }).map(function (x) {
    x.kesin = x.items.every(function (t) { return t.date === x.items[0].date; });
    /* tutulacak kayıt: ekstreyle doğrulanmış olan, yoksa ilk girilen */
    x.items.sort(function (a, b) {
      return (b.ikey ? 1 : 0) - (a.ikey ? 1 : 0) || ((a.createdAt || '') < (b.createdAt || '') ? -1 : 1);
    });
    x.fazla = x.items.slice(1).filter(function (t) { return !t.ikey; }).map(function (t) { return t.id; });
    return x;
  }).filter(function (x) { return x.fazla.length; })
    .sort(function (a, b) { return (b.kesin ? 1 : 0) - (a.kesin ? 1 : 0) || (a.items[0].date < b.items[0].date ? 1 : -1); });
}
var _muk = [];
function mukerrerModal() {
  _muk = mukerrerGruplari();
  var kesin = _muk.filter(function (g) { return g.kesin; });
  function grup(g, i) {
    var t0 = g.items[0], k = cardById(t0.cardId);
    return '<div class="xgrp"><div class="xgh" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
      '<span style="flex:1"><b>' + money(t0.amount) + '</b> <span class="muted">' + esc(k ? k.name : (METHOD_TR[t0.method] || '')) +
      ' · ' + g.items.length + ' kayıt</span></span>' +
      '<button class="btn sm" data-act="mukGrup" data-i="' + i + '">Fazlasını sil</button></div>' +
      g.items.map(function (t, n) {
        return '<div class="xrow" style="grid-template-columns:74px 1fr auto"><div class="xd num">' + D.trFmt(t.date) + '</div>' +
          '<div class="xn">' + esc(t.note || t.category || '—') + (t.ikey ? ' <span class="tag ok">ekstre ✓</span>' : '') +
          (n === 0 ? ' <span class="tag">kalacak</span>' : '') + '<div class="muted">' + esc(t.category || '') + '</div></div>' +
          '<div><button class="btn sm dang" data-act="mukSil" data-id="' + esc(t.id) + '">Sil</button></div></div>';
      }).join('') + '</div>';
  }
  var olasi = _muk.filter(function (g) { return !g.kesin; });
  modal('Mükerrer kayıtlar',
    (!_muk.length ? '<div class="pill PAID">Mükerrer görünen kayıt yok</div>' :
      '<div class="muted">Aynı kartta, aynı tutarda, aynı günlerde birden fazla kayıt. Aynı gün gerçekten iki alışveriş yaptıysan o grubu olduğu gibi bırak.</div>' +
      (kesin.length ? '<div class="lbl" style="margin-top:14px">Aynı gün · ' + kesin.length + ' grup</div>' +
        _muk.map(function (g, i) { return g.kesin ? grup(g, i) : ''; }).join('') : '') +
      (olasi.length ? '<div class="lbl" style="margin-top:18px">1–3 gün arayla · ' + olasi.length + ' grup — tek tek bak</div>' +
        _muk.map(function (g, i) { return g.kesin ? '' : grup(g, i); }).join('') : '')),
    '<button class="btn" data-act="closeModal">Kapat</button>' +
    (kesin.length > 1 ? '<button class="btn pri" data-act="mukHepsi">Aynı gün olan ' + kesin.length + ' grubun fazlasını sil</button>' : ''));
  $('#modalHost').querySelector('.sheet').classList.add('wide');
}
async function mukerrerSil(ids) {
  var set = {}; ids.forEach(function (i) { set[i] = 1; });
  await delTxWhere(function (t) { return set[t.id]; });
  toast(ids.length + ' kayıt silindi'); mukerrerModal();
}

/* ═══════════════════════════════════════════════════════ EYLEMLER ═ */
async function handleAct(act, ds, ev) {
  switch (act) {
    case 'ay': S.monthOffset = ds.d === '0' ? 0 : S.monthOffset + (+ds.d); renderAll(); break;
    case 'kapsam': S.tumu = ds.v === 'tum'; renderAll(); break;
    case 'go':
      if (ds.f !== undefined) S.filters = { q: '', cat: '', person: '', card: '', kind: ds.f };
      go(ds.go); break;
    case 'onayEvet': { var _f = _onayFn; _onayFn = null; closeModal(); if (_f) await _f(); break; }
    case 'closeModal': closeModal(); break;
    case 'closeIfScrim': if (ev.target.classList.contains('scrim')) closeModal(); break;
    case 'quickAdd': quickAdd(ds.card || null, ds.method || null); break;
    case 'incomeNew': incomeModal(); break;
    case 'incomeSave': await incomeSave(); break;
    case 'quickSave': await quickSave(); break;
    case 'cardPay': cardPayModal(ds.id); break;
    case 'cardPaySave': await cardPaySave(ds.id); break;
    case 'setPay': { var t = $('#pTutar'); if (t) t.value = M.fmt(+ds.v, { symbol: false }); break; }
    case 'setIncome': {
      var g = $('#gTutar'); if (g) g.value = M.fmt(+ds.v, { symbol: false });
      var gp = $('#gPerson'); if (gp && ds.p) gp.value = ds.p;
      var gn = $('#gNote'); if (gn) gn.value = ds.p + ' maaşı';
      break;
    }
    case 'payItem': payItemModal(ds.id); break;
    case 'payItemSave': await payItemSave(ds.id, ds.cat, ds.nm); break;
    case 'cardNew': cardModal(null); break;
    case 'cardEdit': cardModal(ds.id); break;
    case 'cardSave': await cardSave(ds.id); break;
    case 'cardDel': {
      var _kart = cardById(ds.id), _kid = ds.id;
      onay('“' + ((_kart && _kart.name) || 'Kart') + '” ve bu karta ait tüm işlemler silinecek. Bu geri alınamaz.',
        async function () {
          S.cards = S.cards.filter(function (c) { return c.id !== _kid; });
          await Store.del('cards', _kid);
          await delTxWhere(function (t) { return t.cardId === _kid; });
          renderAll(); toast('Kart silindi');
        });
      break;
    }
    case 'recNew': recModal(null); break;
    case 'recEdit': recModal(ds.id); break;
    case 'recSave': await recSave(ds.id); break;
    case 'recDel': {
      var _rid = ds.id;
      onay('Bu düzenli ödeme tanımı silinecek. Geçmiş ödeme kayıtların kalır.', async function () {
        S.recurring = S.recurring.filter(function (r) { return r.id !== _rid; });
        await Store.del('recurring', _rid); renderAll(); toast('Silindi');
      });
      break;
    }
    case 'personNew': personModal(-1); break;
    case 'personEdit': personModal(+ds.i); break;
    case 'personSave': await personSave(+ds.i); break;
    case 'personDel':
      S.config.people = (S.config.people || []).filter(function (_, k) { return k !== +ds.i; });
      await Store.saveConfig(); closeModal(); renderAll(); toast('Kişi silindi'); break;
    case 'planNew': planModal(); break;
    case 'planSave': await planSave(); break;
    case 'planDel': {
      var _pid = ds.id;
      onay('Taksit planı ve ona ait tüm taksit kayıtları silinecek.', async function () {
        S.plans = S.plans.filter(function (p) { return p.id !== _pid; });
        await Store.del('plans', _pid);
        await delTxWhere(function (t) { return t.installment && t.installment.groupId === _pid; });
        renderAll(); toast('Taksit planı silindi');
      });
      break;
    }
    case 'delTx': {
      var _t = findTx(ds.id), _tid = ds.id;
      onay('“' + esc(( _t && (_t.tx.note || _t.tx.category)) || 'Bu kayıt') + '” silinecek.',
        async function () { await delTx(_tid); toast('Kayıt silindi'); });
      break;
    }
    case 'fClear': S.filters = { q: '', cat: '', person: '', card: '', kind: '' }; renderHarcamalar(); break;
    case 'txEdit': txEditModal(ds.id); break;
    case 'anMo': S.an.mo = Math.min(0, S.an.mo + (+ds.d)); renderAll(); break;
    case 'anSpan': S.an.span = +ds.v; renderAll(); break;
    case 'stmt': stmtModal(ds.id, ds.k); break;
    case 'txEditSave': await txEditSave(ds.id); break;
    case 'txEditDel': {
      var _did = ds.id;
      onay('Bu kayıt silinecek.', async function () { await delTx(_did); toast('Kayıt silindi'); });
      break;
    }
    case 'catAdd': {
      var c = val('newCat'); if (!c) break;
      S.config.categories = (S.config.categories || DEFAULT_CATS).concat([c]);
      await Store.saveConfig(); renderAll(); break;
    }
    case 'catDel':
      S.config.categories = (S.config.categories || DEFAULT_CATS).filter(function (x) { return x !== ds.c; });
      await Store.saveConfig(); renderAll(); break;
    case 'exportJson': await exportJson(); break;
    case 'importJson': importJsonModal(); break;
    case 'importJsonRun': await importJsonRun(); break;
    case 'ekstre': ekstreModal(ds.id || null); break;
    case 'xDec': {
      var _o = EX && EX.res.items[+ds.i]; if (!_o) break;
      EX.dec[_o.row.key] = ds.v; EX.dec[_o.row.key + '|' + _o.status] = ds.v;
      exBas('[data-act="xDec"][data-i="' + ds.i + '"]', ds.v); break;
    }
    case 'xOrph': if (EX) { EX.orph[ds.id] = ds.v; exBas('[data-act="xOrph"][data-id="' + ds.id + '"]', ds.v); } break;
    case 'xUygula': await ekstreUygula(); break;
    case 'impUndo': {
      var _iid = ds.id, _im = (S.imports || []).find(function (x) { return x.id === _iid; });
      if (!_im) { toast('Bu yükleme kaydı bulunamadı'); break; }
      onay('Bu ekstre yüklemesi geri alınacak: eklenen ' + _im.added + ' kayıt silinir, eşleşen ' + _im.matched +
        ' kayıt önceki hâline döner. Elle girdiğin kayıtlar silinmez.',
        async function () { await ekstreGeriAl(_iid); }, 'Evet, geri al');
      break;
    }
    case 'kapanis': kapanisModal(); break;
    case 'kapanisUygula': await kapanisUygula(val('kTarih') || D.todayISO()); break;
    case 'kapanisGeriAl':
      onay('Borç kapatma geri alınacak: kartların eski borçları ve kaldırılan taksitler geri gelir.',
        async function () { await kapanisGeriAl(); toast('Borç kapatma geri alındı'); }, 'Evet, geri al');
      break;
    case 'mukerrer': mukerrerModal(); break;
    case 'mukSil': await mukerrerSil([ds.id]); break;
    case 'mukGrup': if (_muk[+ds.i]) await mukerrerSil(_muk[+ds.i].fazla); break;
    case 'mukHepsi': {
      var _ids = []; _muk.forEach(function (g) { if (g.kesin) _ids = _ids.concat(g.fazla); });
      onay(_ids.length + ' fazla kayıt silinecek. Her gruptan bir kayıt kalır.', async function () { await mukerrerSil(_ids); }, 'Evet, sil');
      break;
    }
    case 'kesimEdit': kesimModal(ds.id, ds.k); break;
    case 'kesimSave': await kesimKaydet(ds.id, ds.k, false); break;
    case 'kesimSil': await kesimKaydet(ds.id, ds.k, true); break;
    case 'wipeTx':
      onay('TÜM işlem kayıtları silinecek. Kartlar, düzenli ödemeler ve ayarlar korunur.',
        async function () {
          S.buckets = Object.assign({}, S.buckets);
          for (var mk in S.buckets) S.buckets[mk] = [];
          await Store.putBuckets(Object.keys(S.buckets));
          for (var q = 0; q < S.imports.length; q++) await Store.del('imports', S.imports[q].id);
          S.imports = [];
          S.plans = []; renderAll(); toast('İşlemler silindi');
        }, 'Evet, hepsini sil');
      break;
  }
}

/* ═══════════════════════════════════════════════════════ ÇİZİM ════ */
function renderAll() {
  if (S.view === 'ozet') renderOzet();
  else if (S.view === 'harcama') renderHarcamalar();
  else if (S.view === 'kartlar') renderKartlar();
  else if (S.view === 'odemeler') renderOdemeler();
  else if (S.view === 'analiz') renderAnaliz();
  else if (S.view === 'ayarlar') renderAyarlar();
  setSync();
}

/* ═══════════════════════════════════════════════════════ AÇILIŞ ═══ */
$('#fab').addEventListener('click', function () { quickAdd(null); });
$('#themeBtn').addEventListener('click', function () {
  var r = document.documentElement, cur = r.getAttribute('data-theme');
  var sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var next = cur ? (cur === 'dark' ? 'light' : 'dark') : (sysDark ? 'light' : 'dark');
  r.setAttribute('data-theme', next);
  try { localStorage.setItem('hz_theme', next); } catch (e) { }
});
try { var th = localStorage.getItem('hz_theme'); if (th) document.documentElement.setAttribute('data-theme', th); } catch (e) { }
document.documentElement.lang = 'tr';   /* CSS büyük harf dönüşümü için: i → İ */
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

buildNav();
if (!S.config.categories || !S.config.categories.length) S.config.categories = DEFAULT_CATS;
renderAll();
Store.init();
})();
