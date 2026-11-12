/* Uçtan uca: elle giriş + ekstre → mükerrer yok; aynı ekstre iki kez → sıfır yeni; geri al; PDF/Excel/CSV okuma */
const { chromium } = require('playwright');
process.chdir(__dirname);
const http = require('http'), fs = require('fs'), path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');
const ROOT = __dirname;
let n = 0, bad = 0;
const ok = (ad, c, ek) => { n++; if (!c) { bad++; console.log('  ✗ ' + ad + (ek !== undefined ? '   → ' + JSON.stringify(ek) : '')); } else console.log('  ✓ ' + ad); };

const srv = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split('?')[0]);
  let f = u.startsWith('/vendor/') ? path.join(__dirname, '..', u) : path.join(__dirname, 'site', u === '/' ? 'index.html' : u);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' }); r.end(b); });
});

const css = '<meta charset="utf-8"><style>body{font:10pt Arial;margin:24px}table{border-collapse:collapse;width:100%}td{padding:3px 6px;vertical-align:top}td.r{text-align:right;white-space:nowrap}h1{font-size:13pt}</style>';
const tbl = rows => '<table>' + rows.map(r => '<tr>' + r.map((c, i) => '<td' + (i >= 2 ? ' class="r"' : '') + '>' + c + '</td>').join('') + '</tr>').join('') + '</table>';
const FX = {
  ziraat: css + '<h1>Bankkart Hesap Özeti</h1><p>Sayın HASAN ÖRNEK</p>' +
    '<p>Hesap Kesim Tarihi : 26/10/2026</p><p>Son Ödeme Tarihi : 05/11/2026</p><p>Dönem Borcu TL : 5.722,25</p><p>Asgari Ödeme Tutarı TL : 1.144,45</p>' +
    tbl([['İşlem Tarihi', 'Açıklama', 'Tutar (TL)', 'Bankkart Lira'],
      ['', 'ÖNCEKİ AYDAN DEVİR', '3.000,00', ''],
      ['05/10/2026', 'ÖDEME - İNTERNET BANKACILIĞI', '3.000,00+', ''],
      ['10/10/2026', 'MIGROS MANISA TL', '1.450,75', '1,45'],
      ['12/08/2026', 'TEKNOSA İşlemin 3/6 Taksidi 12.000,00', '2.000,00', ''],
      ['15/10/2026', 'SHELL PETROL', '1.800,00', '1,80'],
      ['18/10/2026', 'NETFLIX.COM', '99,00', ''],
      ['21/10/2026', 'A101 MANISA', '252,50', ''],
      ['25/10/2026', 'KAHVE DUNYASI', '120,00', '']]),
  is: css + '<h1>MAXIMUM KART HESAP ÖZETİ</h1><p>Hesap Kesim Tarihi: 04.11.2026</p><p>Son Ödeme Tarihi: 14.11.2026</p><p>Hesap Özeti Borcu: 4.100,00</p>' +
    tbl([['İşlem Tarihi', 'Açıklama', 'Tutar', 'MaxiPuan'],
      ['', 'BİR ÖNCEKİ HESAP ÖZETİ BAKİYENİZ *****', '1.000,00', ''],
      ['10/10/2026', 'ÖDEMENİZ İÇİN TEŞEKKÜR EDERİZ', '-1.000,00', ''],
      ['12/10/2026', '1234 OPET AKARYAKIT', '2.100,00', '4,20'],
      ['20/10/2026', 'ARORA GIYIM 3/9 taksidi (Toplam: 18.000,00 TL)', '2.000,00', ''],
      ['25/10/2026', 'MAXİPUAN İLAVE', '', '5,00']]),
  garanti: css + '<h1>BONUS KART EKSTRESİ</h1><p>Hesap Kesim Tarihi 26 Ekim 2026</p><p>Son Ödeme Tarihi 5 Kasım 2026</p><p>Dönem Borcunuz 1.275,50</p>' +
    tbl([['Tarih', 'Açıklama', 'Tutar'],
      ['', 'ÖNCEKİ DÖNEMDEN DEVİR EDİLEN TUTAR', '500,00'],
      ['3 Ekim 2026', 'ÖDEME', '500,00+'],
      ['8 Ekim 2026', 'TRENDYOL', '248,00'],
      ['12 Ekim 2026', 'MEDIAMARKT 3.000,00x3= 2.Taksit', '1.000,00'],
      ['9 Ekim 2026', 'TRENDYOL IADE', '48,00+'],
      ['', 'DÖNEM FAİZİ', '20,00'], ['', 'KKDF + BSMV', '7,50'],
      ['15 Ekim 2026', 'ZARA', '48,00']])
};
const TABLO = [['Hesap Kesim Tarihi', '26.10.2026'], ['Son Ödeme Tarihi', '05.11.2026'], ['Dönem Borcu', '5.722,25'], ['Önceki Dönem Devir', '3.000,00'],
  ['İşlem Tarihi', 'Açıklama', 'Tutar'],
  ['05.10.2026', 'ÖDEME - İNTERNET BANKACILIĞI', '-3.000,00'], ['10.10.2026', 'MIGROS MANISA TL', '1.450,75'],
  ['12.08.2026', 'TEKNOSA 3/6 taksit', '2.000,00'], ['15.10.2026', 'SHELL PETROL', '1.800,00'], ['18.10.2026', 'NETFLIX.COM', '99,00'],
  ['21.10.2026', 'A101 MANISA', '252,50'], ['25.10.2026', 'KAHVE DUNYASI', '120,00']];

const T = (id, date, amount, note, ek) => Object.assign({ id, kind: 'EXPENSE', method: 'CREDIT_CARD', cardId: 'ziraat', person: 'Hasan', category: 'Market', date, amount, note, createdAt: '2026-10-01T10:00:00Z' }, ek || {});
const SEED = {
  config: { people: [{ name: 'Hasan', salaryDay: 31 }, { name: 'Zeynep', salaryDay: 5 }], primarySalaryDay: 31, categories: ['Market', 'Yakıt', 'Kafe', 'Elektronik', 'Abonelik', 'Diğer'], defaultCardId: 'ziraat' },
  cards: [
    { id: 'ziraat', name: 'Hasan Ziraat', bank: 'Ziraat', owner: 'Hasan', limit: 10000000, statementDay: 23, dueDay: 3, openingBalance: 0, minPaymentRate: 20, active: true },
    { id: 'is', name: 'Hasan İş Bankası', bank: 'İş Bankası', owner: 'Hasan', limit: 8000000, statementDay: 4, dueDay: 14, openingBalance: 0, minPaymentRate: 20, active: true },
    { id: 'garanti', name: 'Hasan Garanti', bank: 'Garanti', owner: 'Hasan', limit: 5000000, statementDay: 26, dueDay: 5, openingBalance: 0, minPaymentRate: 20, active: true }],
  recurring: [], plans: [], imports: [],
  buckets: { '2026-10': [
    T('m1', '2026-10-09', 145075, 'Migros'),                 /* ekstrede 10/10 — bir gün farkla girilmiş */
    T('m2', '2026-10-15', 180000, 'benzin', { category: 'Yakıt' }),
    T('m3', '2026-10-25', 12000, 'kahve', { category: 'Kafe' }),   /* varsayılan kesimden (23) sonra, gerçek kesimden (26) önce */
    T('m4', '2026-10-21', 25000, 'market'),                  /* ekstrede 252,50 — yakın tutar */
    T('m5', '2026-10-20', 30000, 'yanlış girilen'),          /* ekstrede yok */
    T('n1', '2026-10-12', 40000, 'pazar', { method: 'CASH', cardId: null })] }
};

(async () => {
  await new Promise(r => srv.listen(8123, r));
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  /* sentetik ekstre dosyaları */
  fs.mkdirSync("fx", { recursive: true });
  const pp = await ctx.newPage();
  for (const k of Object.keys(FX)) { await pp.setContent(FX[k]); await pp.pdf({ path: `fx/${k}.pdf`, format: 'A4' }); }
  await pp.close();
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(TABLO), 'Ekstre');
  fs.writeFileSync('fx/ziraat.xlsx', XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  fs.writeFileSync('fx/ziraat.csv', TABLO.map(r => r.join(';')).join('\r\n'));

  const page = await ctx.newPage();
  const errs = []; global.__errs = errs;
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errs.push(m.text()); });
  await page.addInitScript(seed => { if (!localStorage.getItem('hz_finans_v3')) localStorage.setItem('hz_finans_v3', seed); }, JSON.stringify(SEED));
  await page.goto('http://localhost:8123/');
  await page.waitForFunction(() => window.__T && window.__T.S.ready);
  const E = (fn, arg) => page.evaluate(fn, arg);
  const txs = () => E(() => __T.S.transactions.map(t => ({ id: t.id, date: t.date, amount: t.amount, note: t.note, kind: t.kind, ikey: !!t.ikey, sdate: t.sdate || null, inst: t.installment ? t.installment.no : 0, ay: __T.txAy(t) })));
  const yukle = async (kart, dosya) => {
    await E(() => __T.handleAct('ekstre', {}));
    await page.selectOption('#xCard', kart);
    await page.setInputFiles('#xFile', 'fx/' + dosya);
    await page.waitForSelector('#xOk', { timeout: 20000 });
    return E(() => ({ bank: __T.EX.st.bank, n: __T.EX.st.rows.length, ok: __T.EX.st.ok, close: __T.EX.close, due: __T.EX.due, total: __T.EX.total, counts: __T.EX.res.counts, orph: __T.EX.res.orphans.length, pk: __T.EX.pk, chk: document.querySelector('#xChk').textContent, btn: document.querySelector('#xOk').textContent }));
  };

  console.log('\n— taksit planı arayüzden (6 × 2.000, 12 Ağustos) —');
  await E(() => __T.handleAct('quickAdd', { card: 'ziraat' }));
  await page.fill('#qTutar', '12000'); await page.fill('#qDate', '2026-08-12'); await page.fill('#qTaksit', '6'); await page.fill('#qNote', 'Teknosa TV');
  await E(() => __T.handleAct('quickSave', {}));
  await page.waitForFunction(() => __T.S.plans.length === 1 && !document.querySelector('.scrim'));
  let a = await txs();
  ok('6 taksit oluştu', a.filter(t => t.inst).length === 6, a.filter(t => t.inst).length);
  const once = a.length;
  ok('kahve (25 Eki) varsayılan kesimle Kasım ayında', a.find(t => t.id === 'm3').ay === '2026-11', a.find(t => t.id === 'm3').ay);

  console.log('\n— elle girişte mükerrer uyarısı —');
  await E(() => __T.handleAct('quickAdd', { card: 'ziraat' }));
  await page.fill('#qTutar', '1450,75'); await page.fill('#qDate', '2026-10-10');
  await E(() => __T.handleAct('quickSave', {}));
  const uyari = await page.textContent('.sheet');
  ok('aynı kart + aynı tutar + 1 gün → uyarı', /zaten kayıtlı/.test(uyari) && /Yine de ekle/.test(uyari), uyari.slice(0, 120));
  await page.click('.sheet [data-act="closeModal"]');
  ok('vazgeçince kayıt eklenmedi', (await txs()).length === once);

  console.log('\n— Ziraat PDF: okuma + önizleme —');
  let p = await yukle('ziraat', 'ziraat.pdf');
  ok('PDF okundu: Ziraat, 7 satır', p.bank === 'Ziraat' && p.n === 7, p);
  ok('kesim 26.10 / son ödeme 05.11 / dönem borcu 5.722,25', p.close === '2026-10-26' && p.due === '2026-11-05' && p.total === 572225, p);
  ok('okuma sağlaması tuttu', p.ok === true && /sağlaması tuttu/.test(p.chk), p.chk);
  ok('Ekim ekstresi olarak tanındı', p.pk === '2026-10', p.pk);
  ok('4 eşleşti · 1 benzer · 2 yeni · 1 ekstrede yok', p.counts.ESLESTI === 4 && p.counts.BENZER === 1 && p.counts.YENI === 2 && p.counts.VAR === 0 && p.orph === 1, p);
  ok('düğme: 2 yeni kayıt', /2 yeni kayıt/.test(p.btn), p.btn);
  await page.screenshot({ path: 'onizleme.png', fullPage: false });
  await page.click('#xOk');
  await page.waitForFunction(() => !document.querySelector('.scrim'));
  a = await txs();
  ok('MÜKERRER YOK: yalnızca 2 kayıt eklendi', a.length === once + 2, [once, a.length]);
  ok('Migros tek kayıt', a.filter(t => t.amount === 145075).length === 1);
  ok('Migros elle girilen tarihi korudu, ekstreyle işaretlendi', a.find(t => t.id === 'm1').date === '2026-10-09' && a.find(t => t.id === 'm1').ikey);
  ok('yakın tutar ekstreye göre düzeltildi (250,00 → 252,50)', a.find(t => t.id === 'm4').amount === 25250, a.find(t => t.id === 'm4'));
  ok('3. taksit plan kaydıyla eşleşti, yeni taksit açılmadı', a.filter(t => t.inst).length === 6 && a.find(t => t.inst === 3).ikey);
  ok('kart ödemesi harcama değil, ödeme olarak eklendi', a.filter(t => t.kind === 'CARD_PAYMENT' && t.amount === 300000).length === 1);
  ok('GERÇEK KESİM: kahve (25 Eki) artık Ekim ayında', a.find(t => t.id === 'm3').ay === '2026-10', a.find(t => t.id === 'm3'));
  ok('ekstrede olmayan kayıt silinmedi', !!a.find(t => t.id === 'm5'));
  ok('nakit kayda dokunulmadı', a.find(t => t.id === 'n1').ay === '2026-10' && !a.find(t => t.id === 'n1').ikey);
  let k = await E(() => { const c = __T.S.cards.find(c => c.id === 'ziraat'); return { e: c.ekstre['2026-10'], bak: HZ.Cards.currentBalance(c, __T.S.transactions, '2026-10-26'), ob: c.openingBalance, imp: __T.S.imports.length }; });
  ok('karta gerçek kesim tarihi yazıldı', k.e && k.e.close === '2026-10-26' && k.e.due === '2026-11-05', k.e);
  ok('kart borcu kesim günü = dönem borcu (5.722,25)', k.bak === 572225, k);
  ok('yükleme kaydı tutuldu', k.imp === 1);

  console.log('\n— aynı ekstre ikinci kez —');
  p = await yukle('ziraat', 'ziraat.pdf');
  ok('7 satırın 7\'si "zaten var", 0 yeni', p.counts.VAR === 7 && p.counts.YENI === 0 && p.counts.ESLESTI === 0 && p.counts.BENZER === 0, p.counts);
  await page.click('#xOk');
  await page.waitForFunction(() => !document.querySelector('.scrim'));
  ok('ikinci yükleme hiçbir şey eklemedi', (await txs()).length === once + 2);
  ok('kart borcu değişmedi', (await E(() => HZ.Cards.currentBalance(__T.S.cards.find(c => c.id === 'ziraat'), __T.S.transactions, '2026-10-26'))) === 572225);

  console.log('\n— aynı ekstre Excel ve CSV olarak (farklı dosya, aynı işlemler) —');
  p = await yukle('ziraat', 'ziraat.xlsx');
  ok('Excel okundu, sağlama tuttu', p.n === 7 && p.ok === true && p.close === '2026-10-26', p);
  ok('Excel: yeni kayıt önerilmiyor', p.counts.YENI === 0, p.counts);
  await page.click('.sheet [data-act="closeModal"]');
  p = await yukle('ziraat', 'ziraat.csv');
  ok('CSV okundu, sağlama tuttu', p.n === 7 && p.ok === true, p);
  ok('CSV: yeni kayıt önerilmiyor', p.counts.YENI === 0, p.counts);
  await page.click('.sheet [data-act="closeModal"]');

  console.log('\n— sayfa yenilenince kalıcı mı —');
  await page.reload(); await page.waitForFunction(() => window.__T && window.__T.S.ready);
  a = await txs();
  ok('yenilemeden sonra kayıtlar ve ekstre işaretleri duruyor', a.length === once + 2 && a.filter(t => t.ikey).length === 7, a.filter(t => t.ikey).length);
  await E(() => __T.handleAct('go', { go: 'kartlar' }));
  const kartlar = await page.textContent('#view, main, body');
  ok('Kartlar: Ekim ekstresi "yüklendi" ve gerçek tarih etiketi', /yüklendi/.test(kartlar) && /gerçek tarih/.test(kartlar) && /kesim 26\.10\.2026/.test(kartlar));
  await page.screenshot({ path: 'kartlar.png', fullPage: true });

  console.log('\n— geri al —');
  const ids = await E(() => __T.S.imports.slice().sort((x, y) => x.at < y.at ? 1 : -1).map(i => i.id));
  for (const id of ids) {
    await E(i => __T.handleAct('impUndo', { id: i }), id); if (!(await page.$('[data-act="onayEvet"]'))) console.log('DBG', id, await E(() => JSON.stringify(__T.S.imports.map(i => i.id))), (await page.textContent('#modalHost')).slice(0, 200), errs);
    await page.click('[data-act="onayEvet"]');
    await page.waitForFunction(i => !__T.S.imports.find(x => x.id === i), id);
  }
  a = await txs();
  k = await E(() => { const c = __T.S.cards.find(c => c.id === 'ziraat'); return { e: (c.ekstre || {})['2026-10'] || null, ob: c.openingBalance }; });
  ok('geri alınca eklenen 2 kayıt gitti', a.length === once, [once, a.length]);
  ok('eşleşen kayıtların işareti kalktı', a.filter(t => t.ikey).length === 0);
  ok('düzeltilen tutar eski hâline döndü (250,00)', a.find(t => t.id === 'm4').amount === 25000);
  ok('kesim tarihi varsayılana döndü, kahve yine Kasım', k.e === null && a.find(t => t.id === 'm3').ay === '2026-11', [k, a.find(t => t.id === 'm3').ay]);
  ok('açılış borcu eski hâlinde', k.ob === 0, k.ob);

  console.log('\n— diğer bankaların PDF\'leri —');
  p = await yukle('is', 'is.pdf');
  ok('İş Bankası PDF: tanındı, puan satırı atlandı, sağlama tuttu', p.bank === 'İş Bankası' && p.n === 3 && p.ok === true && p.close === '2026-11-04', p);
  ok('İş Bankası: kesim 4 Kas → Ekim ekstresi (son ödeme 14 Kas)', p.pk === '2026-11' || p.pk === '2026-10', p.pk);
  const isAy = await E(() => __T.EX.period.dueDate);
  await page.click('#xOk'); await page.waitForFunction(() => !document.querySelector('.scrim'));
  a = await txs();
  ok('İş Bankası: 12 Eki harcaması Ekim ayında (son ödeme ' + isAy + ')', a.find(t => /OPET/.test(t.note)).ay === '2026-10', a.find(t => /OPET/.test(t.note)));
  p = await yukle('garanti', 'garanti.pdf');
  ok('Garanti PDF: tanındı, sağlama tuttu', p.bank === 'Garanti' && p.ok === true && p.close === '2026-10-26', p);
  await page.click('#xOk'); await page.waitForFunction(() => !document.querySelector('.scrim'));
  a = await txs();
  ok('Garanti: iade ayrı tür, faiz kayıtları eklendi', a.filter(t => t.kind === 'REFUND').length === 1 && a.filter(t => /FAİZ|KKDF/.test(t.note)).length === 2, a.filter(t => t.kind === 'REFUND').length);
  const rap = await E(() => { const r = __T.ayRapor('2026-10'); return { gider: r.totalExpense, iade: r.totalRefund }; });
  ok('Ekim gideri iadeyi düşüyor', rap.iade === 4800, rap);

  console.log('\n— eski mükerrerleri temizleme —');
  const onceM = (await txs()).length;
  await E(() => { const b = __T.S.buckets['2026-10']; const kopya = (id, yeni, ek) => Object.assign({}, b.find(t => t.id === id), { id: yeni, createdAt: '2026-10-30T10:00:00Z' }, ek || {});
    b.push(kopya('m2', 'd1'), kopya('m2', 'd2'), kopya('n1', 'd3'), kopya('m5', 'd4', { date: '2026-10-22' })); __T.Store.saveLocal(); });
  await E(() => __T.handleAct('go', { go: 'ozet' }));
  ok('Özet: iki kez girilmiş kayıt uyarısı', /iki kez girilmiş/.test(await page.textContent('body')));
  await E(() => __T.handleAct('mukerrer', {}));
  let mt = await page.textContent('.sheet');
  ok('aynı gün 2 grup, 1–3 gün arayla 1 grup', /Aynı gün · 2 grup/.test(mt) && /1–3 gün arayla · 1 grup/.test(mt), mt.slice(0, 300));
  await page.click('[data-act="mukHepsi"]'); await page.click('[data-act="onayEvet"]');
  await page.waitForFunction(n => __T.S.transactions.length === n, onceM + 1);
  a = await txs();
  ok('aynı gün olan 3 fazla kayıt silindi, asıllar kaldı', !a.find(t => ['d1', 'd2', 'd3'].includes(t.id)) && a.find(t => t.id === 'm2') && a.find(t => t.id === 'n1'));
  ok('1–3 gün aralı grup kullanıcıya bırakıldı', !!a.find(t => t.id === 'd4'));
  await page.click('.sheet [data-act="closeModal"]');

  console.log('\n— yedek al / yedekten yükle (yerine geçer) —');
  const yedek = await E(() => JSON.stringify({ v: 3, config: __T.S.config, cards: __T.S.cards.filter(c => c.id !== 'garanti'), recurring: [], plans: __T.S.plans, imports: [], buckets: { '2026-10': __T.S.buckets['2026-10'].slice(0, 3) } }));
  await E(() => __T.handleAct('importJson', {}));
  await page.fill('#jsonIn', yedek); await E(() => __T.handleAct('importJsonRun', {}));
  await page.waitForFunction(() => !document.querySelector('.scrim'));
  k = await E(() => ({ n: __T.S.transactions.length, kart: __T.S.cards.length, imp: __T.S.imports.length, bos: Object.keys(__T.S.buckets).filter(m => m !== '2026-10').every(m => __T.S.buckets[m].length === 0) }));
  ok('yedek mevcut verinin yerine geçti (3 işlem, 2 kart, diğer aylar boş)', k.n === 3 && k.kart === 2 && k.imp === 0 && k.bos, k);
  await page.reload(); await page.waitForFunction(() => window.__T && window.__T.S.ready);
  ok('yenilemeden sonra da öyle', (await txs()).length === 3);

  console.log('\n— sayfalar hatasız açılıyor —');
  for (const v of ['ozet', 'harcama', 'kartlar', 'odemeler', 'analiz', 'ayarlar']) { await E(x => __T.handleAct('go', { go: x }), v).catch(e => errs.push(v + ': ' + e)); await page.waitForTimeout(120); }
  await page.screenshot({ path: 'ayarlar.png', fullPage: true });
  ok('konsol temiz', errs.length === 0, errs.slice(0, 3));

  console.log('\n' + (n - bad) + '/' + n + ' geçti');
  await br.close(); srv.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); console.log('ERRS', global.__errs); process.exit(2); });
