/* v7 — ekstre okuyucu + mutabakat + gerçek kesim tarihleri */
const HZ = require('../src/engine.js'), EK = require('../src/ekstre.js');
const { D, Recon, StatementPeriod, Cards, Report, KIND } = HZ;
let n = 0, bad = 0;
function ok(ad, c, ek) { n++; if (!c) { bad++; console.log('  ✗ ' + ad + (ek !== undefined ? '   → ' + JSON.stringify(ek) : '')); } else console.log('  ✓ ' + ad); }

/* ── okuyucular ─────────────────────────────────────────── */
const Z = EK.fromText(`Bankkart Hesap Özeti
Hesap Kesim Tarihi : 23/10/2026
Son Ödeme Tarihi : 03/11/2026
Dönem Borcu TL : 5.250,75
ÖNCEKİ AYDAN DEVİR 3.000,00
05/10/2026 ÖDEME - İNTERNET BANKACILIĞI 3.000,00+
10/10/2026 MIGROS MANISA TL 1.450,75 1,45
12/08/2026 TEKNOSA İşlemin 3/6 Taksidi 12.000,00 2.000,00
15/10/2026 SHELL PETROL 1.800,00 1,80`);
ok('Ziraat: banka tanındı', Z.bank === 'Ziraat', Z.bank);
ok('Ziraat: kesim/son ödeme', Z.close === '2026-10-23' && Z.due === '2026-11-03', [Z.close, Z.due]);
ok('Ziraat: 4 satır', Z.rows.length === 4, Z.rows.length);
ok('Ziraat: puan sütunu atıldı', Z.rows[1].amount === 145075, Z.rows[1]);
ok('Ziraat: taksit 3/6, tutar taksit tutarı', Z.rows[2].inst && Z.rows[2].inst.no === 3 && Z.rows[2].inst.count === 6 && Z.rows[2].amount === 200000, Z.rows[2]);
ok('Ziraat: ödeme satırı harcama değil', Z.rows[0].type === 'PAYMENT', Z.rows[0]);
ok('Ziraat: sağlama tutuyor', Z.ok === true, [Z.calc, Z.total]);

const M = EK.fromText(`MAXIMUM KART HESAP ÖZETİ
Hesap Kesim Tarihi: 04.11.2026
Son Ödeme Tarihi: 14.11.2026
Hesap Özeti Borcu: 4.100,00
BİR ÖNCEKİ HESAP ÖZETİ BAKİYENİZ ***** 1.000,00
10/10/2026ÖDEMENİZ İÇİN TEŞEKKÜR EDERİZ -1.000,00
12/10/20261234 OPET AKARYAKIT 2.100,00 4,20
20/10/2026ARORA GIYIM 3/9 taksidi (Toplam: 18.000,00 TL) 2.000,00
25/10/2026MAXİPUAN İLAVE 5,00`);
ok('İş Bankası: tanındı + tarihler', M.bank === 'İş Bankası' && M.close === '2026-11-04' && M.due === '2026-11-14', [M.bank, M.close, M.due]);
ok('İş Bankası: puan satırı atlandı (3 satır)', M.rows.length === 3, M.rows.map(r => r.desc));
ok('İş Bankası: MaxiPuan sütunu atıldı', M.rows[1].amount === 210000 && /OPET/.test(M.rows[1].desc) && !/^1234/.test(M.rows[1].desc), M.rows[1]);
ok('İş Bankası: taksit 3/9', M.rows[2].inst && M.rows[2].inst.no === 3 && M.rows[2].amount === 200000, M.rows[2]);
ok('İş Bankası: sağlama tutuyor', M.ok === true, [M.calc, M.total]);

const G = EK.fromText(`BONUS KART EKSTRESİ
Hesap Kesim Tarihi 26 Ekim 2026
Son Ödeme Tarihi 5 Kasım 2026
Dönem Borcunuz 1.275,50
ÖNCEKİ DÖNEMDEN DEVİR EDİLEN TUTAR 500,00
3 Ekim 2026 ÖDEME 500,00+
8 Ekim 2026 TRENDYOL 248,00
12 Ekim 2026 MEDIAMARKT 3.000,00x3= 2.Taksit 1.000,00
9 Ekim 2026 TRENDYOL IADE 48,00+
DÖNEM FAİZİ 20,00
KKDF + BSMV 7,50
15 Ekim 2026 ZARA 48,00`);
ok('Garanti: tanındı + tarihler', G.bank === 'Garanti' && G.close === '2026-10-26' && G.due === '2026-11-05', [G.bank, G.close, G.due]);
ok('Garanti: faiz satırları kesim gününe, tür FEE', G.rows.filter(r => r.type === 'FEE').length === 2 && G.rows.filter(r => r.type === 'FEE')[0].date === '2026-10-26', G.rows.map(r => r.type));
ok('Garanti: iade ödeme değil iade', G.rows.find(r => /IADE/.test(r.desc)).type === 'REFUND');
ok('Garanti: sağlama tutuyor', G.ok === true, [G.calc, G.total]);

const X = EK.fromTable([
  ['Hesap Kesim Tarihi', '23.10.2026'], ['Son Ödeme Tarihi', '03.11.2026'], ['Dönem Borcu', '3.250,75'],
  ['İşlem Tarihi', 'Açıklama', 'Tutar'],
  ['10.10.2026', 'MIGROS MANISA', '1.450,75'],
  ['15.10.2026', 'SHELL PETROL', '1.800,00'],
  ['05.10.2026', 'ÖDEME', '-3.000,00'],
  ['12.08.2026', 'TEKNOSA 3/6 taksit', '2.000,00'],
  ['', 'TOPLAM', '']]);
ok('Excel: başlık satırı bulundu, 4 işlem', X.rows.length === 4, X.rows);
ok('Excel: kesim ve dönem borcu okundu', X.close === '2026-10-23' && X.due === '2026-11-03' && X.total === 325075, [X.close, X.due, X.total]);
ok('Excel: eksi tutar ödeme', X.rows[2].type === 'PAYMENT' && X.rows[2].amount === 300000, X.rows[2]);
ok('Excel: taksit açıklamadan okundu', X.rows[3].inst && X.rows[3].inst.no === 3, X.rows[3]);
const X2 = EK.fromTable([['Tarih', 'Açıklama', 'Tutar'], ['10.10.2026', 'A', '-100,00'], ['11.10.2026', 'B', '-50,00'], ['12.10.2026', 'C', '-20,00'], ['13.10.2026', 'ODEME', '170,00']]);
ok('Excel: harcamalar eksi yazılmışsa yön düzeltilir', X2.rows.filter(r => r.type === 'EXPENSE').length === 3 && X2.rows[3].type === 'PAYMENT', X2.rows.map(r => r.type));

/* ── mutabakat ─────────────────────────────────────────── */
const kart = { id: 'ziraat', statementDay: 23, dueDay: 3, openingBalance: 0, limit: 10000000 };
const per = StatementPeriod.build(2026, 10, kart);
let id = 0;
const tx = (date, amount, note, ek) => Object.assign({ id: 't' + (++id), kind: 'EXPENSE', method: 'CREDIT_CARD', cardId: 'ziraat', date, amount, note }, ek || {});
const R = (date, amount, desc, type, inst) => ({ date, amount, desc, type: type || 'EXPENSE', inst: inst || null });

let elle = [tx('2026-10-09', 145075, 'Migros'), tx('2026-10-15', 180000, 'benzin')];
let r = Recon.match([R('2026-10-10', 145075, 'MIGROS MANISA'), R('2026-10-15', 180000, 'SHELL PETROL'), R('2026-10-18', 9900, 'NETFLIX')], elle, kart, per);
ok('elle girilen + ekstre: 2 eşleşti, 1 yeni', r.counts.ESLESTI === 2 && r.counts.YENI === 1, r.counts);
ok('eşleşme doğru kayıtla', r.items[0].tx.id === elle[0].id && r.items[1].tx.id === elle[1].id);
ok('yetim yok', r.orphans.length === 0, r.orphans.length);

/* aynı ekstre ikinci kez */
const sonra = elle.map((t, i) => Object.assign({}, t, { ikey: r.items[i].row.key })).concat([tx('2026-10-18', 9900, 'NETFLIX', { ikey: r.items[2].row.key })]);
let r2 = Recon.match([R('2026-10-10', 145075, 'MIGROS MANISA'), R('2026-10-15', 180000, 'SHELL PETROL'), R('2026-10-18', 9900, 'NETFLIX')], sonra, kart, per);
ok('aynı ekstre tekrar yüklenince hepsi "zaten var"', r2.counts.VAR === 3 && r2.counts.YENI === 0, r2.counts);

/* aynı gün aynı yerde iki alışveriş, biri elle girilmiş */
let r3 = Recon.match([R('2026-10-10', 5000, 'SIMIT SARAYI'), R('2026-10-10', 5000, 'SIMIT SARAYI')], [tx('2026-10-10', 5000, 'simit')], kart, per);
ok('aynı gün iki eş satır: biri eşleşir, biri yeni', r3.counts.ESLESTI === 1 && r3.counts.YENI === 1, r3.counts);
ok('eş satırların parmak izi farklı', r3.items[0].row.key !== r3.items[1].row.key);

/* yakın tutar */
let r4 = Recon.match([R('2026-10-10', 145075, 'MIGROS')], [tx('2026-10-10', 145000, 'Migros')], kart, per);
ok('yakın tutar → benzer, fark 0,75', r4.counts.BENZER === 1 && r4.items[0].diff === 75, [r4.counts, r4.items[0].diff]);
let r5 = Recon.match([R('2026-10-10', 145075, 'MIGROS')], [tx('2026-10-10', 90000, 'başka')], kart, per);
ok('uzak tutar eşleşmez', r5.counts.YENI === 1 && r5.orphans.length === 1, [r5.counts, r5.orphans.length]);
let r6 = Recon.match([R('2026-10-20', 145075, 'MIGROS')], [tx('2026-10-10', 145075, 'Migros')], kart, per);
ok('10 gün arayla aynı tutar eşleşmez', r6.counts.YENI === 1, r6.counts);

/* iki aday: tarihi yakın olan seçilir */
const a1 = tx('2026-10-08', 20000, 'x'), a2 = tx('2026-10-10', 20000, 'y');
let r7 = Recon.match([R('2026-10-10', 20000, 'MARKET')], [a1, a2], kart, per);
ok('iki adaydan tarihi yakın olan', r7.items[0].tx.id === a2.id && r7.orphans.length === 1);

/* taksit planı */
const plan = tx('2026-10-12', 200000, 'Teknosa (3/6)', { installment: { groupId: 'p1', no: 3, count: 6 } });
const plan4 = tx('2026-11-12', 200000, 'Teknosa (4/6)', { installment: { groupId: 'p1', no: 4, count: 6 } });
let r8 = Recon.match([R('2026-08-12', 200000, 'TEKNOSA', 'EXPENSE', { no: 3, count: 6 })], [plan, plan4], kart, per);
ok('taksit satırı planın aynı numaralı taksidiyle eşleşir', r8.counts.ESLESTI === 1 && r8.items[0].tx.id === plan.id, r8.counts);
ok('gelecek taksit yetim sayılmaz', r8.orphans.length === 0, r8.orphans.length);
ok('ilk alışveriş tarihi dönemin dışında → dönem başına çekilir', Recon.sdateFor('2026-08-12', per) === per.start);

/* ödeme */
let r9 = Recon.match([R('2026-10-05', 300000, 'ÖDEME', 'PAYMENT')], [{ id: 'p', kind: 'CARD_PAYMENT', cardId: 'ziraat', date: '2026-10-04', amount: 300000, note: 'Kart ödemesi' }], kart, per);
ok('ödeme satırı elle girilen kart ödemesiyle eşleşir', r9.counts.ESLESTI === 1, r9.counts);
let r10 = Recon.match([R('2026-10-05', 300000, 'ÖDEME', 'PAYMENT')], [tx('2026-10-05', 300000, 'harcama')], kart, per);
ok('ödeme satırı harcamayla eşleşmez', r10.counts.YENI === 1, r10.counts);
ok('başka kartın kaydı eşleşmez', Recon.match([R('2026-10-10', 100, 'A')], [tx('2026-10-10', 100, 'A', { cardId: 'garanti' })], kart, per).counts.YENI === 1);
ok('nakit kayıt eşleşmez', Recon.match([R('2026-10-10', 100, 'A')], [tx('2026-10-10', 100, 'A', { method: 'CASH' })], kart, per).counts.YENI === 1);

/* ── gerçek kesim tarihleri ─────────────────────────────── */
ok('varsayılan: 24 Ekim harcaması Kasım ekstresinde', StatementPeriod.forDate('2026-10-24', kart).periodKey === '2026-11');
const kart2 = Object.assign({}, kart, { ekstre: { '2026-10': { close: '2026-10-26', due: '2026-11-05' } } });
const p2 = StatementPeriod.forDate('2026-10-24', kart2);
ok('kesim 26 Ekim\'e kaydıysa 24 Ekim harcaması Ekim ekstresinde', p2.periodKey === '2026-10' && p2.close === '2026-10-26' && p2.dueDate === '2026-11-05', p2);
ok('sonraki dönem 27 Ekim\'de başlar', StatementPeriod.build(2026, 11, kart2).start === '2026-10-27');
ok('27 Ekim harcaması Kasım ekstresinde', StatementPeriod.forDate('2026-10-27', kart2).periodKey === '2026-11');
const kart3 = Object.assign({}, kart, { ekstre: { '2026-10': { close: '2026-10-21' } } });
ok('kesim 21 Ekim\'e çekildiyse 22 Ekim harcaması Kasım\'a', StatementPeriod.forDate('2026-10-22', kart3).periodKey === '2026-11');
ok('gerçek kesimin ekstre ayı bulunur', StatementPeriod.keyForClose(kart, '2026-10-26') === '2026-10' && StatementPeriod.keyForClose({ statementDay: 4 }, '2026-11-03') === '2026-11' && StatementPeriod.keyForClose({ statementDay: 31 }, '2026-10-01') === '2026-09');
ok('geçersiz kılma yoksa eski davranış aynı', StatementPeriod.build(2026, 10, kart).close === '2026-10-23' && StatementPeriod.build(2026, 10, kart).dueDate === '2026-11-03');

/* ── sdate ve iade ───────────────────────────────────────── */
const gec = tx('2026-10-22', 50000, 'geç yansıyan', { sdate: '2026-10-24' });
ok('sdate: geç yansıyan harcama Ekim kesim borcunda yok', Cards.currentBalance(kart, [gec], '2026-10-23') === 0 && Cards.currentBalance(kart, [gec], '2026-10-24') === 50000);
const iade = { id: 'i', kind: 'REFUND', cardId: 'ziraat', date: '2026-10-12', amount: 4800, category: 'Giyim', person: 'Hasan' };
const al = tx('2026-10-10', 24800, 'zara', { category: 'Giyim', person: 'Hasan' });
ok('iade kart borcunu azaltır', Cards.currentBalance(kart, [al, iade], '2026-10-23') === 20000);
const rep = Report.summarize([al, iade], 'x');
ok('iade gideri ve kategoriyi azaltır, gelir sayılmaz', rep.totalExpense === 20000 && rep.byCategory['Giyim'] === 20000 && rep.totalIncome === 0, [rep.totalExpense, rep.byCategory, rep.totalIncome]);
ok('iade dönem harcamasından düşer', Cards.statement(kart, [al, iade], per, '2026-10-25').periodSpend === 20000);

/* ── aynı ekstre başka biçimde ───────────────────────────── */
const pdfSat = [R('2026-10-10', 145075, 'MIGROS MANISA'), R('2026-08-12', 200000, 'TEKNOSA İşlemin 3/6 Taksidi', 'EXPENSE', { no: 3, count: 6 })];
Recon.keys('ziraat', pdfSat);
const planT = [1, 2, 3, 4].map(i => tx('2026-' + String(7 + i).padStart(2, '0') + '-12', 200000, 'Teknosa', { installment: { no: i, count: 6 } }));
planT[2].ikey = pdfSat[1].key;
const kayitli = [tx('2026-10-09', 145075, 'Migros', { ikey: pdfSat[0].key })].concat(planT);
let rx = Recon.match([R('2026-10-10', 145075, 'MIGROS MANISA TL'), R('2026-08-12', 200000, 'TEKNOSA 3/6 taksit', 'EXPENSE', { no: 3, count: 6 })], kayitli, kart, per);
ok('PDF ile yüklenen ekstre Excel olarak tekrar gelince: hepsi "zaten var"', rx.counts.VAR === 2 && rx.counts.YENI === 0 && rx.counts.ESLESTI === 0, rx.counts);
ok('taksit satırı başka numaralı taksitle eşleşmedi', rx.items[1].tx.id === planT[2].id);
/* komşu ekstrelerde aynı tutar: 23 Eki (Ekim ekstresi, yüklü) ve 24 Eki (Kasım ekstresi) ayrı işlemlerdir */
const ekimSat = [R('2026-10-23', 4500, 'YEMEKHANE')]; Recon.keys('ziraat', ekimSat);
const perKas = StatementPeriod.build(2026, 11, kart);
let rk = Recon.match([R('2026-10-24', 4500, 'YEMEKHANE')], [tx('2026-10-23', 4500, 'yemek', { ikey: ekimSat[0].key })], kart, perKas);
ok('önceki ekstreyle doğrulanmış kayıt, sonraki ekstrenin satırını yutmaz', rk.counts.YENI === 1, rk.counts);
/* taksit satırı, planTı olmayan ama ilk alışveriş günü tutan başka kayıtla eşleşmez */
let rt = Recon.match([R('2026-08-12', 200000, 'TEKNOSA 3/6', 'EXPENSE', { no: 3, count: 6 })], [tx('2026-08-12', 200000, 'başka alışveriş')], kart, per);
ok('taksit satırı ilk alışveriş tarihine göre eşleşmez', rt.counts.YENI === 1, rt.counts);
const XD = EK.fromTable([['Dönem Borcu', '1.100,00'], ['Önceki Dönem Devir', '1.000,00'], ['Tarih', 'Açıklama', 'Tutar'], ['10.10.2026', 'A', '100,00']]);
ok('Excel: "Önceki Dönem Devir" okunur, sağlama tutar', XD.carry === 100000 && XD.ok === true, [XD.carry, XD.calc, XD.total]);

/* ── kapanış: bu tarihe kadar her şey ödendi ─────────────── */
{
  const k0 = { id: 'ziraat', statementDay: 23, dueDay: 3, openingBalance: 5000000, limit: 10000000 };
  const once = [tx('2026-10-10', 100000, 'eski'), tx('2026-11-10', 50000, 'kapanıştan önce, açık dönem')];
  const sonra = [tx('2026-11-15', 20000, 'kapanıştan sonra')];
  ok('kapanış yokken eski borç görünür', Cards.currentBalance(k0, once, '2026-11-12') === 5000000 + 150000);
  const k1 = Object.assign({}, k0, { kapanis: '2026-11-12', openingBalance: 0 });
  ok('kapanış günü bakiye 0', Cards.currentBalance(k1, once, '2026-11-12') === 0);
  ok('kapanıştan sonra yalnızca yeni harcama', Cards.currentBalance(k1, once.concat(sonra), '2026-11-20') === 20000);
  const ekim = Cards.statement(k1, once, StatementPeriod.build(2026, 10, k1), '2026-11-20');
  ok('kapanıştan önce kesilen ekstre ödenmiş', ekim.status === 'NONE' || ekim.status === 'PAID', ekim.status);
  const k2 = Object.assign({}, k0, { kapanis: '2026-11-12', openingBalance: 0, kapanisOnce: { openingBalance: 5000000 } });
  const eyl = Cards.statement(k2, once, StatementPeriod.build(2026, 9, k2), '2026-11-20');
  ok('eski ekstre (açılış borçlu) ödendi görünür', eyl.status === 'PAID' && eyl.remaining === 0, eyl);
  const kas = Cards.statement(k1, once.concat(sonra), StatementPeriod.build(2026, 11, k1), '2026-11-25');
  ok('kapanışı içeren dönemin ekstre borcu yalnızca kapanış sonrası', kas.statementBalance === 20000 && kas.status !== 'PAID', kas);
  const rec = { id: 'kira', name: 'Kira', amount: 2250000, dueDay: 5, frequency: 'MONTHLY', priority: 'CRITICAL' };
  const st = { config: { primarySalaryDay: 31, kapanis: { date: '2026-11-12' } }, cards: [k1], recurring: [rec], transactions: once };
  const pl = HZ.Planner.plan(st, '2026-11-12', { start: '2026-10-31', end: '2026-11-29', key: '2026-10' });
  const kira = pl.items.find(i => i.recurringId === 'kira');
  ok('kapanıştan önceki kira ödendi sayılır', kira && kira.status === 'PAID' && kira.remaining === 0, kira);
  const pl2 = HZ.Planner.plan(st, '2026-12-01', { start: '2026-11-30', end: '2026-12-30', key: '2026-11' });
  ok('kapanıştan sonraki kira ödenmemiş', pl2.items.find(i => i.recurringId === 'kira').status !== 'PAID');
}

console.log('\n' + (n - bad) + '/' + n + ' geçti');
process.exit(bad ? 1 : 0);
