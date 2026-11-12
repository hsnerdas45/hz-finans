/* ============================================================================
   H&Z FINANS — MOTOR TESTLERI
   §29'daki 25 edge-case + §25 cift sayim testi + para/tarih guvenligi
   Calistir:  node engine.test.js
   ========================================================================== */
const HZ = require('../src/engine.js');
const { Money, D, StatementPeriod, SalaryPeriod, Cards, Recurring, Installments, Report, Planner, KIND, METHOD } = HZ;

let pass = 0, fail = 0; const failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  catch (e) { fail++; failures.push(name + ' → ' + e.message); console.log('  \x1b[31m✗\x1b[0m ' + name + '\n      \x1b[31m' + e.message + '\x1b[0m'); }
}
function eq(a, b, msg) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error((msg ? msg + ': ' : '') + 'beklenen ' + sb + ', gelen ' + sa);
}
function section(s) { console.log('\n\x1b[1m\x1b[36m' + s + '\x1b[0m'); }
const TL = v => Money.parse(v);

/* --- test kartlari ------------------------------------------------------- */
const ziraat = { id: 'c1', name: 'Ziraat', bank: 'Ziraat', owner: 'Hasan', limit: TL(100000), statementDay: 23, dueDay: 3, openingBalance: 0, active: true };
const isbank = { id: 'c2', name: 'İş Bankası', bank: 'İş Bankası', owner: 'Hasan', limit: TL(252000), statementDay: 4, dueDay: 14, openingBalance: 0, active: true };
const garanti = { id: 'c3', name: 'Garanti', bank: 'Garanti', owner: 'Hasan', limit: TL(122000), statementDay: 29, dueDay: 8, openingBalance: 0, active: true };
const son31 = { id: 'c4', name: 'Kesim31', bank: 'X', owner: 'Hasan', limit: TL(50000), statementDay: 31, dueDay: 10, openingBalance: 0, active: true };

let _n = 0;
function ex(date, amount, card, extra) {
  return Object.assign({ id: 'e' + (++_n), kind: KIND.EXPENSE, date, amount: TL(amount), person: 'Hasan',
    method: card ? METHOD.CARD : METHOD.CASH, cardId: card ? card.id : null, category: 'Market' }, extra || {});
}
function pay(date, amount, card) {
  return { id: 'p' + (++_n), kind: KIND.CARD_PAYMENT, date, amount: TL(amount), person: 'Hasan',
    method: METHOD.BANK, cardId: card.id, category: 'Kredi Kartı' };
}
function inc(date, amount, person) {
  return { id: 'i' + (++_n), kind: KIND.INCOME, date, amount: TL(amount), person: person || 'Hasan', category: 'Maaş' };
}

/* ========================================================================== */
section('PARA — floating point güvenliği (§30)');

t('0.1 + 0.2 tam olarak 0.30 eder', () => {
  eq(Money.fmt(TL(0.1) + TL(0.2)), '0,30 ₺');
});
t('Türkçe format ayrıştırma: "1.234,56" → 123456 kuruş', () => {
  eq(Money.parse('1.234,56'), 123456);
  eq(Money.parse('1234.56'), 123456);
  eq(Money.parse('1234,56'), 123456);
  eq(Money.parse('12.000'), 1200000);      // binlik ayırıcı
  eq(Money.parse('8.348,28 ₺'), 834828);
});
t('Taksit bölmesi toplamı korur — 100,00 / 3', () => {
  const parts = Money.split(TL(100), 3);
  eq(parts.reduce((a, b) => a + b, 0), TL(100));
  eq(parts, [3334, 3333, 3333]);
});
t('Taksit bölmesi toplamı korur — 8.348,28 / 4', () => {
  const parts = Money.split(TL(8348.28), 4);
  eq(parts.reduce((a, b) => a + b, 0), TL(8348.28));
  eq(Money.fmt(parts[0]), '2.087,07 ₺');
});
t('1000 rastgele taksit bölmesinde hiç kuruş kaybı yok', () => {
  for (let i = 0; i < 1000; i++) {
    const total = Math.floor(Math.random() * 5000000) + 1;
    const n = Math.floor(Math.random() * 12) + 1;
    const s = Money.split(total, n).reduce((a, b) => a + b, 0);
    if (s !== total) throw new Error('kayıp: ' + total + '/' + n);
  }
});

/* ========================================================================== */
section('TARİH — timezone bağımsızlığı (§30)');

t('Tarih aritmetiği Date/timezone kullanmaz', () => {
  eq(D.addDays('2026-02-28', 1), '2026-03-01');       // 2026 artık yıl değil
  eq(D.addDays('2028-02-28', 1), '2028-02-29');       // 2028 artık yıl
  eq(D.addDays('2026-12-31', 1), '2027-01-01');
  eq(D.addDays('2026-01-01', -1), '2025-12-31');
});
t('Ay uzunlukları doğru (30/31/Şubat)', () => {
  eq(D.daysInMonth(2026, 2), 28); eq(D.daysInMonth(2028, 2), 29);
  eq(D.daysInMonth(2026, 4), 30); eq(D.daysInMonth(2026, 1), 31);
  eq(D.daysInMonth(2000, 2), 29); eq(D.daysInMonth(1900, 2), 28);
});
t('Gün kırpma: 31 → Şubat’ta 28', () => {
  eq(D.clampDay(2026, 2, 31), 28);
  eq(D.clampDay(2028, 2, 31), 29);
  eq(D.clampDay(2026, 4, 31), 30);
});

/* ========================================================================== */
section('§29 EDGE CASE 1-3 — hesap kesim günü sınırları');

t('1. Hesap kesim GÜNÜNDE yapılan harcama o döneme aittir', () => {
  const p = StatementPeriod.forDate('2026-09-23', ziraat);
  eq(p.close, '2026-09-23');
  eq(p.start, '2026-08-24');
});
t('2. Kesimden bir gün ÖNCE — aynı dönem', () => {
  const p = StatementPeriod.forDate('2026-09-22', ziraat);
  eq(p.close, '2026-09-23');
});
t('3. Kesimden bir gün SONRA — sonraki dönem (24 Eyl → 24 Eyl–23 Eki)', () => {
  const p = StatementPeriod.forDate('2026-09-24', ziraat);
  eq(p.start, '2026-09-24');
  eq(p.close, '2026-10-23');
});

section('§29 EDGE CASE 4-8 — ay/yıl geçişi, 30/31 gün, Şubat');

t('4. Ay değişimi doğru', () => {
  eq(StatementPeriod.forDate('2026-09-30', ziraat).close, '2026-10-23');
  eq(StatementPeriod.forDate('2026-10-01', ziraat).close, '2026-10-23');
});
t('5. Yıl değişimi doğru', () => {
  const p = StatementPeriod.forDate('2026-12-30', ziraat);
  eq(p.start, '2026-12-24'); eq(p.close, '2027-01-23');
  eq(p.dueDate, '2027-02-03');
});
t('6. 31 günlük ay — kesim 31, Ocak', () => {
  eq(StatementPeriod.forDate('2026-01-31', son31).close, '2026-01-31');
  eq(StatementPeriod.forDate('2026-01-15', son31).close, '2026-01-31');
});
t('7. 30 günlük ay — kesim 31, Nisan’da 30’a kırpılır', () => {
  const p = StatementPeriod.forDate('2026-04-30', son31);
  eq(p.close, '2026-04-30');
  eq(StatementPeriod.forDate('2026-05-01', son31).close, '2026-05-31');
});
t('8. ŞUBAT — kesim 31, Şubat’ta 28’e kırpılır ve dönem sınırları tutar', () => {
  const p = StatementPeriod.forDate('2026-02-20', son31);
  eq(p.start, '2026-02-01');   // 31 Ocak'ın ertesi günü
  eq(p.close, '2026-02-28');
  const q = StatementPeriod.forDate('2026-03-01', son31);
  eq(q.start, '2026-03-01');   // 28 Şubat'ın ertesi günü
  eq(q.close, '2026-03-31');
});

section('§29 EDGE CASE 9-10 — farklı kartlar, farklı kesim/son ödeme');

t('9. Aynı tarih, üç kartta üç farklı dönem', () => {
  const d = '2026-09-25';
  eq(StatementPeriod.forDate(d, ziraat).close, '2026-10-23');  // 23'ü geçti
  eq(StatementPeriod.forDate(d, isbank).close, '2026-10-04');  // 4'ü geçti
  eq(StatementPeriod.forDate(d, garanti).close, '2026-09-29'); // 29'a var
});
t('10. Son ödeme tarihleri: aynı ay içinde ve sonraki aya taşan', () => {
  eq(StatementPeriod.dueDateFor('2026-09-23', 3), '2026-10-03');   // sonraki aya taşar
  eq(StatementPeriod.dueDateFor('2026-09-04', 14), '2026-09-14');  // aynı ayda
  eq(StatementPeriod.dueDateFor('2026-09-29', 8), '2026-10-08');
});
t('13. Son ödeme tarihi sonraki aya geçiyor — dönem ilişkisi korunur', () => {
  const p = StatementPeriod.forDate('2026-09-10', ziraat);
  eq(p.close, '2026-09-23'); eq(p.dueDate, '2026-10-03');
});

/* ========================================================================== */
section('§29 EDGE CASE 11-13 — maaş dönemi (Hasan: her ayın 31’i)');

t('11. Maaş günü 31 → ay sonu mantığı', () => {
  const p = SalaryPeriod.forDate('2026-09-07', 31);
  eq(p.start, '2026-08-31');
  eq(p.end, '2026-09-29');       // 30 Eylül'ün bir gün öncesi
  eq(p.nextStart, '2026-09-30');
});
t('11b. Şubat’ta maaş günü 31 → 28’e kırpılır', () => {
  const p = SalaryPeriod.forDate('2026-02-15', 31);
  eq(p.start, '2026-01-31');
  eq(p.end, '2026-02-27');
  const q = SalaryPeriod.forDate('2026-02-28', 31);
  eq(q.start, '2026-02-28'); eq(q.end, '2026-03-30');
});
t('11c. Zeynep maaş günü 5 → 5 Eyl–4 Eki', () => {
  const p = SalaryPeriod.forDate('2026-09-07', 5);
  eq(p.start, '2026-09-05'); eq(p.end, '2026-10-04');
});
t('12. Maaş günü ile son ödeme tarihi aynı güne gelirse borç O döneme dahildir', () => {
  // maaş günü 3, Ziraat son ödeme 3 Ekim
  const p = SalaryPeriod.forDate('2026-10-03', 3);
  eq(p.start, '2026-10-03');
  const st = { config: { primarySalaryDay: 3, people: [] }, cards: [ziraat], recurring: [], accounts: [],
    transactions: [ex('2026-09-10', 10000, ziraat)] };
  const plan = Planner.plan(st, '2026-10-03', p);
  eq(plan.items.length, 1, 'borç bu döneme düşmeli');
  eq(plan.items[0].dueDate, '2026-10-03');
});

/* ========================================================================== */
section('§29 EDGE CASE 14-15 — taksitler');

t('14. Taksitli işlem: 12.000 / 6 = 6 ayrı 2.000 TL kaydı', () => {
  const rows = Installments.generate({ id: 'pl1', name: 'Beyaz Eşya', totalAmount: TL(12000), count: 6,
    firstDate: '2026-09-10', cardId: ziraat.id, person: 'Hasan', category: 'Elektronik' }, ziraat);
  eq(rows.length, 6);
  eq(rows.reduce((s, r) => s + r.amount, 0), TL(12000), 'toplam korunmalı');
  eq(Money.fmt(rows[0].amount), '2.000,00 ₺');
  eq(rows.map(r => r.date), ['2026-09-10','2026-10-10','2026-11-10','2026-12-10','2027-01-10','2027-02-10']);
  eq(rows[0].note, 'Beyaz Eşya (1/6)');
});
t('14b. Ana alışveriş AYRICA gider yazılmaz — toplam tam 12.000', () => {
  const rows = Installments.generate({ id: 'pl1', name: 'X', totalAmount: TL(12000), count: 6,
    firstDate: '2026-09-10', cardId: ziraat.id, person: 'Hasan', category: 'Elektronik' }, ziraat);
  const st = { config: {}, cards: [ziraat], accounts: [], recurring: [], transactions: rows };
  const yil = Report.range(st, '2026-01-01', '2027-12-31');
  eq(yil.totalExpense, TL(12000), 'taksitlerin toplamı ana tutarı aşmamalı');
});
t('15. Gelecek taksitler doğru ekstre dönemlerine bağlanır', () => {
  const rows = Installments.generate({ id: 'pl2', name: 'Y', totalAmount: TL(6000), count: 3,
    firstDate: '2026-09-25', cardId: ziraat.id, person: 'Hasan', category: 'Giyim' }, ziraat);
  // 25 Eylül → 23 Ekim ekstresi (kesim 23 geçilmiş)
  eq(rows[0].statementKey, 'c1:2026-10');
  eq(rows[1].statementKey, 'c1:2026-11');
  eq(rows[2].statementKey, 'c1:2026-12');
});
t('31 günlük taksit başlangıcı Şubat’a taşınca kırpılır', () => {
  const rows = Installments.generate({ id: 'pl3', name: 'Z', totalAmount: TL(300), count: 3,
    firstDate: '2025-12-31', cardId: ziraat.id, person: 'Hasan', category: 'Diğer' }, ziraat);
  eq(rows.map(r => r.date), ['2025-12-31', '2026-01-31', '2026-02-28']);
});

/* ========================================================================== */
section('§25 + §3 ★ ÇİFT SAYIM TESTİ — harcama ≠ kart ödemesi');

t('★ 10 Eyl 10.000 Ziraat harcaması + 03 Eki 10.000 kart ödemesi', () => {
  const txs = [ex('2026-09-10', 10000, ziraat), pay('2026-10-03', 10000, ziraat)];
  const st = { config: {}, cards: [ziraat], accounts: [], recurring: [], transactions: txs };

  const eylul = Report.calendarMonth(st, '2026-09');
  const ekim = Report.calendarMonth(st, '2026-10');

  eq(eylul.totalExpense, TL(10000), 'Eylül gideri tam 10.000 olmalı');
  eq(ekim.totalExpense, TL(0), 'Ekim gideri 0 olmalı — ödeme gider DEĞİLDİR');

  const toplam = Report.range(st, '2026-01-01', '2026-12-31');
  eq(toplam.totalExpense, TL(10000), 'TOPLAM GİDER 20.000 DEĞİL 10.000 OLMALI');
  eq(toplam.totalCardPayments, TL(10000), 'kart ödemesi ayrıca izlenmeli');
});
t('★ Nakit çıkışı doğru: Eylül 0, Ekim 10.000', () => {
  const txs = [ex('2026-09-10', 10000, ziraat), pay('2026-10-03', 10000, ziraat)];
  const st = { config: {}, cards: [ziraat], accounts: [], recurring: [], transactions: txs };
  eq(Report.calendarMonth(st, '2026-09').cashOutflow, TL(0), 'kartla alışverişte para çıkmaz');
  eq(Report.calendarMonth(st, '2026-10').cashOutflow, TL(10000), 'para ödeme günü çıkar');
});
t('★ Ödeme sonrası kart bakiyesi sıfırlanır', () => {
  const txs = [ex('2026-09-10', 10000, ziraat), pay('2026-10-03', 10000, ziraat)];
  eq(Cards.currentBalance(ziraat, txs, '2026-10-02'), TL(10000));
  eq(Cards.currentBalance(ziraat, txs, '2026-10-03'), TL(0));
});
t('★ Kategori dağılımında kart ödemesi görünmez', () => {
  const txs = [ex('2026-09-10', 10000, ziraat), pay('2026-10-03', 10000, ziraat)];
  const st = { config: {}, cards: [ziraat], accounts: [], recurring: [], transactions: txs };
  const r = Report.range(st, '2026-01-01', '2026-12-31');
  eq(Object.keys(r.byCategory), ['Market']);
  eq(r.byCategory['Market'], TL(10000));
});
t('★ Nakit harcama kart ekstresine karışmaz (§13)', () => {
  const txs = [ex('2026-09-10', 1000, null, { category: 'Market' }), ex('2026-09-10', 500, ziraat)];
  const st = { config: {}, cards: [ziraat], accounts: [], recurring: [], transactions: txs };
  const r = Report.calendarMonth(st, '2026-09');
  eq(r.totalExpense, TL(1500), 'ikisi de gider');
  eq(r.cashExpense, TL(1000));
  eq(r.cardExpense, TL(500));
  eq(Cards.currentBalance(ziraat, txs, '2026-09-30'), TL(500), 'nakit kart borcuna eklenmemeli');
});

/* ========================================================================== */
section('§29 EDGE CASE 16-19 — nakit, tam/kısmi kart ödemesi');

t('16. Nakit harcama takvim ayına yazılır, karta değmez', () => {
  const txs = [ex('2026-09-10', 1000)];
  const st = { config: {}, cards: [ziraat], accounts: [], recurring: [], transactions: txs };
  eq(Report.calendarMonth(st, '2026-09').cashExpense, TL(1000));
  eq(Cards.currentBalance(ziraat, txs, '2026-09-30'), 0);
});
t('17-19. Tam ödeme / kısmi ödeme / ödenmemiş — ekstre durumları', () => {
  const p = StatementPeriod.forDate('2026-09-10', ziraat);
  const base = [ex('2026-09-10', 10000, ziraat)];

  const none = Cards.statement(ziraat, base, p, '2026-09-30');
  eq(none.remaining, TL(10000)); eq(none.status, 'UNPAID');

  const partial = Cards.statement(ziraat, base.concat([pay('2026-10-01', 4000, ziraat)]), p, '2026-10-01');
  eq(partial.paid, TL(4000)); eq(partial.remaining, TL(6000)); eq(partial.status, 'PARTIAL');

  const full = Cards.statement(ziraat, base.concat([pay('2026-10-03', 10000, ziraat)]), p, '2026-10-03');
  eq(full.remaining, TL(0)); eq(full.status, 'PAID');

  const late = Cards.statement(ziraat, base, p, '2026-10-05');
  eq(late.status, 'OVERDUE');
});
t('★ Son ödeme tarihinden SONRA yapılan ödeme de ekstreye işlenir', () => {
  // Ziraat: 10 Eyl harcama → 23 Eyl kesim → 3 Eki son ödeme.
  // Kullanıcı 10 Ekim'de (gecikmeli) ödüyor — borç kapanmış sayılmalı.
  const p = StatementPeriod.forDate('2026-09-10', ziraat);
  const txs = [ex('2026-09-10', 10000, ziraat), pay('2026-10-10', 10000, ziraat)];
  const st = Cards.statement(ziraat, txs, p, '2026-10-11');
  eq(st.paid, TL(10000), 'gecikmeli ödeme sayılmalı');
  eq(st.remaining, TL(0));
  eq(st.status, 'PAID');
});
t('Bir sonraki kesimden sonraki ödeme bu ekstreye yazılmaz', () => {
  const p = StatementPeriod.forDate('2026-09-10', ziraat);
  const txs = [ex('2026-09-10', 10000, ziraat), pay('2026-10-24', 10000, ziraat)];
  const st = Cards.statement(ziraat, txs, p, '2026-10-25');
  eq(st.paid, TL(0), '23 Ekim kesiminden sonrası sonraki ekstreye aittir');
});
t('Asgari ödeme %20 hesaplanır', () => {
  const p = StatementPeriod.forDate('2026-09-10', ziraat);
  const st = Cards.statement(ziraat, [ex('2026-09-10', 10000, ziraat)], p, '2026-09-30');
  eq(Money.fmt(st.minimum), '2.000,00 ₺');
});

/* ========================================================================== */
section('§29 EDGE CASE 20-22 — iki kullanıcı, ortak dashboard, tekrar sayım');

t('20-21. İki kullanıcı ayrı toplanır, ortak dashboard birleştirir (§22)', () => {
  const txs = [
    ex('2026-09-05', 8000, ziraat, { person: 'Hasan' }),
    ex('2026-09-06', 3000, null, { person: 'Zeynep' }),
    ex('2026-09-07', 1500, null, { person: 'Ortak' })
  ];
  const st = { config: {}, cards: [ziraat], accounts: [], recurring: [], transactions: txs };
  const r = Report.calendarMonth(st, '2026-09');
  eq(r.byPerson, { Hasan: TL(8000), Zeynep: TL(3000), Ortak: TL(1500) });
  eq(r.totalExpense, TL(12500));
  eq(r.label, 'Eylül 2026', 'dönem etiketi açıkça yazılmalı');
});
t('22. Aynı işlem iki raporda iki kez sayılmaz', () => {
  const txs = [ex('2026-09-10', 5000, ziraat, { category: 'Market', recurringId: 'r1' })];
  const st = { config: {}, cards: [ziraat], accounts: [], recurring: [], transactions: txs };
  const r = Report.calendarMonth(st, '2026-09');
  // hem kategori hem kart hem kişi dağılımında var ama toplam bir kez
  eq(r.byCategory['Market'], TL(5000));
  eq(r.byCard['c1'], TL(5000));
  eq(r.byPerson['Hasan'], TL(5000));
  eq(r.totalExpense, TL(5000), 'toplam tek sayım');
});

section('§29 EDGE CASE 23-25 — negatif bakiye, limit aşımı, geçmiş tarihli işlem');

t('23. Fazla ödeme negatif (alacaklı) bakiye üretir, gider yaratmaz', () => {
  const txs = [ex('2026-09-10', 1000, ziraat), pay('2026-10-03', 1500, ziraat)];
  eq(Cards.currentBalance(ziraat, txs, '2026-10-03'), TL(-500));
  const st = { config: {}, cards: [ziraat], accounts: [], recurring: [], transactions: txs };
  eq(Report.range(st, '2026-01-01', '2026-12-31').totalExpense, TL(1000));
});
t('24. Limit aşımı tespit edilir', () => {
  const txs = [ex('2026-09-10', 120000, ziraat)];
  eq(Cards.availableLimit(ziraat, txs, '2026-09-30'), TL(-20000));
  const issues = HZ.validate({ cards: [ziraat], transactions: txs });
  if (!issues.some(i => /limit aşımı/.test(i.msg))) throw new Error('limit aşımı uyarısı yok');
});
t('25. Geçmiş tarihli işlem doğru döneme geriye dönük yerleşir', () => {
  const txs = [ex('2026-07-15', 2000, ziraat)];   // bugün Eylül olsa da
  const p = StatementPeriod.forDate('2026-07-15', ziraat);
  eq(p.close, '2026-07-23');
  const st = { config: {}, cards: [ziraat], accounts: [], recurring: [], transactions: txs };
  eq(Report.calendarMonth(st, '2026-07').totalExpense, TL(2000));
  eq(Report.calendarMonth(st, '2026-09').totalExpense, TL(0));
  eq(Cards.currentBalance(ziraat, txs, '2026-09-01'), TL(2000), 'bakiyeye yansımalı');
});
t('Kart ödemesi GİDER kategorisiyle girilirse uyarı verilir', () => {
  const bad = [{ id: 'x', kind: KIND.EXPENSE, date: '2026-10-03', amount: TL(10000), person: 'Hasan',
    method: METHOD.BANK, category: 'Kart Ödemesi' }];
  const issues = HZ.validate({ cards: [ziraat], transactions: bad });
  if (!issues.some(i => /çift sayım/i.test(i.msg))) throw new Error('çift sayım uyarısı yok');
});

/* ========================================================================== */
section('§6-§7 ★ MAAŞ DÖNEMİ PLANLAYICI — "ne kadar param kalıyor?"');

t('★ Kart borcu KESİM tarihine değil SON ÖDEME tarihine göre döneme düşer', () => {
  // Ziraat: 10 Eyl harcama → 23 Eyl kesim → 3 Eki son ödeme
  // Maaş günü 31 → dönem 31 Ağu–29 Eyl. 3 Ekim BU dönemde DEĞİL.
  const st = { config: { primarySalaryDay: 31, people: [] }, cards: [ziraat], accounts: [], recurring: [],
    transactions: [ex('2026-09-10', 12500, ziraat)] };
  const eylul = Planner.plan(st, '2026-09-07');
  eq(eylul.period.start, '2026-08-31'); eq(eylul.period.end, '2026-09-29');
  eq(eylul.items.length, 0, '3 Ekim vadeli borç Eylül dönemine düşmemeli');

  const ekim = Planner.plan(st, '2026-10-01');
  eq(ekim.period.start, '2026-09-30'); eq(ekim.period.end, '2026-10-30');
  eq(ekim.items.length, 1, '3 Ekim vadeli borç Ekim dönemine düşmeli');
  eq(ekim.items[0].total, TL(12500));
  eq(ekim.items[0].dueDate, '2026-10-03');
});

t('★ §7 ekranı: gelir – zorunlu ödemeler = kalan', () => {
  const kira = { id: 'r1', name: 'Kira', amount: TL(20000), dueDay: 5, owner: 'Ortak', category: 'Kira', priority: 'CRITICAL', frequency: 'MONTHLY', active: true };
  const aidat = { id: 'r2', name: 'Aidat', amount: TL(2000), dueDay: 10, owner: 'Ortak', category: 'Aidat', priority: 'HIGH', frequency: 'MONTHLY', active: true };
  const fatura = { id: 'r3', name: 'Faturalar', amount: TL(2500), dueDay: 20, owner: 'Ortak', category: 'Fatura', priority: 'HIGH', frequency: 'MONTHLY', active: true };
  const st = {
    config: { primarySalaryDay: 25, people: [{ name: 'Hasan', salaryDay: 25, monthlySalary: TL(50000) }] },
    cards: [ziraat, isbank, garanti], accounts: [], recurring: [kira, aidat, fatura],
    transactions: [
      ex('2026-09-10', 12500, ziraat),   // → 3 Eki
      ex('2026-09-20', 7500, isbank),    // kesim 4 Eki → 14 Eki
      ex('2026-09-15', 4800, garanti)    // kesim 29 Eyl → 8 Eki
    ]
  };
  const p = Planner.plan(st, '2026-09-25');
  eq(p.period.start, '2026-09-25'); eq(p.period.end, '2026-10-24');
  eq(p.income, TL(50000));
  eq(p.totalRequired, TL(49300), '20000+12500+7500+4800+2000+2500');
  eq(p.afterObligations, TL(700), 'MAAŞ SONRASI KALAN 700 TL');
});

t('★ §8 öncelik sıralaması: CRITICAL önce, sonra vade', () => {
  const st = {
    config: { primarySalaryDay: 25, people: [] },
    cards: [ziraat], accounts: [],
    recurring: [
      { id: 'r1', name: 'Netflix', amount: TL(200), dueDay: 6, owner: 'Ortak', category: 'Abonelik', priority: 'LOW', frequency: 'MONTHLY', active: true },
      { id: 'r2', name: 'Kira', amount: TL(20000), dueDay: 15, owner: 'Ortak', category: 'Kira', priority: 'CRITICAL', frequency: 'MONTHLY', active: true },
      { id: 'r3', name: 'Elektrik', amount: TL(1500), dueDay: 8, owner: 'Ortak', category: 'Fatura', priority: 'HIGH', frequency: 'MONTHLY', active: true }
    ],
    transactions: [ex('2026-09-10', 5000, ziraat)]
  };
  const p = Planner.plan(st, '2026-09-25');
  eq(p.items.map(i => i.name), ['Ziraat', 'Kira', 'Elektrik', 'Netflix']);
});

t('★ Kısmi ödeme sonrası kalan borç güncellenir (§24)', () => {
  const kira = { id: 'r1', name: 'Kira', amount: TL(20000), dueDay: 5, owner: 'Ortak', category: 'Kira', priority: 'CRITICAL', frequency: 'MONTHLY', active: true };
  const st = { config: { primarySalaryDay: 25, people: [] }, cards: [], accounts: [], recurring: [kira],
    transactions: [{ id: 'k1', kind: KIND.EXPENSE, date: '2026-10-05', amount: TL(12000), person: 'Ortak', method: METHOD.BANK, category: 'Kira', recurringId: 'r1' }] };
  const p = Planner.plan(st, '2026-10-06');
  eq(p.items[0].paid, TL(12000));
  eq(p.items[0].remaining, TL(8000));
  eq(p.items[0].status, 'PARTIAL');
});

t('★ Kira ödemesi hem gider hem borç kapatma — ama gider bir kez sayılır', () => {
  const kira = { id: 'r1', name: 'Kira', amount: TL(20000), dueDay: 5, owner: 'Ortak', category: 'Kira', priority: 'CRITICAL', frequency: 'MONTHLY', active: true };
  const st = { config: { primarySalaryDay: 25, people: [] }, cards: [], accounts: [], recurring: [kira],
    transactions: [{ id: 'k1', kind: KIND.EXPENSE, date: '2026-10-05', amount: TL(20000), person: 'Ortak', method: METHOD.BANK, category: 'Kira', recurringId: 'r1' }] };
  eq(Report.calendarMonth(st, '2026-10').totalExpense, TL(20000), 'tek sayım');
  eq(Planner.plan(st, '2026-10-06').items[0].status, 'PAID');
});

/* ========================================================================== */
section('§14 — nakit pozisyonu ≠ kalan bütçe');

t('CURRENT CASH ile REMAINING BUDGET ayrı hesaplanır', () => {
  const st = {
    config: { primarySalaryDay: 25, people: [{ name: 'Hasan', salaryDay: 25, monthlySalary: TL(50000) }] },
    cards: [ziraat], accounts: [{ id: 'a1', name: 'Vadesiz', openingBalance: TL(5000) }],
    recurring: [{ id: 'r1', name: 'Kira', amount: TL(20000), dueDay: 5, owner: 'Ortak', category: 'Kira', priority: 'CRITICAL', frequency: 'MONTHLY', active: true }],
    transactions: [
      inc('2026-09-25', 50000),
      ex('2026-09-26', 3000, ziraat),                 // kartla — nakde dokunmaz
      ex('2026-09-27', 1000, null, { method: METHOD.CASH })
    ]
  };
  eq(Report.cashPosition(st, '2026-09-30'), TL(54000), '5000 + 50000 - 1000');
  const p = Planner.plan(st, '2026-09-30');
  eq(p.afterObligations, TL(30000), '50000 - 20000 kira');
  if (Report.cashPosition(st, '2026-09-30') === p.afterObligations) throw new Error('ikisi aynı olmamalı');
});

/* ========================================================================== */
section('OTOMATİK KATEGORİLEME (§19)');

t('Mağaza adından kategori önerisi', () => {
  eq(HZ.autoCategory('BIM AS. / V376'), 'Market');
  eq(HZ.autoCategory('OPET-ALTAY PETROL'), 'Yakıt');
  eq(HZ.autoCategory('NETFLIX.COM'), 'Abonelik');
  eq(HZ.autoCategory('ŞAFAK ECZANESİ'), 'Sağlık');
  eq(HZ.autoCategory('MAPFRE SIGORTA'), 'Sigorta');
  eq(HZ.autoCategory('BİLİNMEYEN YER'), 'Diğer');
});


/* ========================================================================== */
section('EKSTRE AYI — kullanıcının yöntemi (kesim ayına göre toplam borç)');

t('★ Ağustos ekstreleri: kesim tarihi Ağustos’ta olan tüm kartlar toplanır', () => {
  const st = { config: {}, cards: [ziraat, isbank, garanti], accounts: [], recurring: [],
    transactions: [
      ex('2026-07-25', 30000, ziraat),   // 24 Tem–23 Ağu → Ağustos ekstresi
      ex('2026-08-20', 20000, ziraat),   // aynı dönem
      ex('2026-08-24', 15000, ziraat),   // 24 Ağu → EYLÜL ekstresine gider
      ex('2026-07-20', 10000, isbank),   // 5 Tem–4 Ağu → Ağustos ekstresi
      ex('2026-08-10', 5000, garanti)    // 27 Tem–26 Ağu → Ağustos ekstresi
    ] };
  const r = HZ.Report.statementMonth(st, '2026-08', '2026-08-27');
  eq(r.items.length, 3, 'üç kart da Ağustos’ta kesiliyor');
  const byCard = {}; r.items.forEach(i => byCard[i.card.id] = i.statementBalance);
  eq(byCard.c1, TL(50000), 'Ziraat: 30.000+20.000 — 24 Ağustos’taki 15.000 dahil DEĞİL');
  eq(byCard.c2, TL(10000));
  eq(byCard.c3, TL(5000));
  eq(r.total, TL(65000), 'Ağustos’un toplam borç yükü');
});

t('★ 24 Ağustos harcaması Eylül ekstresine düşer', () => {
  const st = { config: {}, cards: [ziraat], accounts: [], recurring: [],
    transactions: [ex('2026-08-20', 20000, ziraat), ex('2026-08-24', 15000, ziraat)] };
  eq(HZ.Report.statementMonth(st, '2026-08', '2026-09-01').total, TL(20000));
  eq(HZ.Report.statementMonth(st, '2026-09', '2026-09-30').total, TL(35000), 'Eylül ekstresi devir dahil');
  const eylul = HZ.Report.statementMonth(st, '2026-09', '2026-09-30').items[0];
  eq(eylul.periodSpend, TL(15000), 'dönem içi harcama sadece 24 Ağustos sonrası');
  eq(eylul.period.start, '2026-08-24'); eq(eylul.period.close, '2026-09-23');
});

t('★ Ekstre ayı kategori kırılımı dönem penceresine göre hesaplanır', () => {
  const st = { config: {}, cards: [ziraat], accounts: [], recurring: [],
    transactions: [
      ex('2026-07-25', 3000, ziraat, { category: 'Market' }),
      ex('2026-08-20', 2000, ziraat, { category: 'Yakıt' }),
      ex('2026-08-25', 9999, ziraat, { category: 'Giyim' })   // sonraki döneme ait
    ] };
  const r = HZ.Report.statementMonth(st, '2026-08', '2026-08-30');
  eq(r.byCategory, { 'Market': TL(3000), 'Yakıt': TL(2000) });
  eq(r.spend, TL(5000));
});

t('★ Ödeme yapılınca ekstre ayının kalanı düşer', () => {
  const st = { config: {}, cards: [ziraat], accounts: [], recurring: [],
    transactions: [ex('2026-08-20', 20000, ziraat), pay('2026-09-05', 12000, ziraat)] };
  const r = HZ.Report.statementMonth(st, '2026-08', '2026-09-06');
  eq(r.total, TL(20000)); eq(r.paid, TL(12000)); eq(r.remaining, TL(8000));
  eq(r.items[0].status, 'PARTIAL');
});

/* ========================================================================== */
console.log('\n' + '─'.repeat(60));
if (fail === 0) {
  console.log('\x1b[42m\x1b[30m  TÜM TESTLER GEÇTİ  \x1b[0m  ' + pass + ' test');
} else {
  console.log('\x1b[41m\x1b[37m  ' + fail + ' TEST BAŞARISIZ  \x1b[0m  (' + pass + ' geçti)');
  failures.forEach(f => console.log('  • ' + f));
  process.exit(1);
}
