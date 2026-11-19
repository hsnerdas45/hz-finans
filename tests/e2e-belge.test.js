/* Belge yükleme (19.11.2026): hesap hareketleri fotoğrafı / metin PDF'i, kart uygulaması ekran görüntüsü.
   Bütün veriler uydurmadır. OCR yerel Tesseract ile (vendor/tesseract) çalışır. */
const { chromium } = require('playwright');
process.chdir(__dirname);
const http = require('http'), fs = require('fs'), path = require('path');
let n = 0, bad = 0;
const ok = (ad, c, ek) => { n++; if (!c) { bad++; console.log('  ✗ ' + ad + (ek !== undefined ? '   → ' + JSON.stringify(ek) : '')); } else console.log('  ✓ ' + ad); };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const f = u.startsWith('/vendor/') ? path.join(__dirname, '..', u) : path.join(__dirname, 'site', u === '/' ? 'index.html' : u);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); r.end(b); });
});
/* ── uydurma hesap hareketleri (yeniden eskiye, Ziraat düzeni: satır çizgisi yok, çok satırlı açıklama) ── */
const ESKI = [   // eskiden yeniye: tarih, fiş, açıklama, tutar (kuruş)
  ['21.10.2026', 'F01001', 'Gönd: MEHMET KARA 0062-Türkiye Garanti Bankası A.Ş. FAST işlemi', 60000],
  ['30.10.2026', 'Z01002', 'MAAŞ ÖDEMESİ ÖRNEK TARIM MAKİNALARI SANAYİ VE TİCARET', 5000000],
  ['01.11.2026', 'F01003', 'ATM QR ILE PARA ÇEKME', -200000],
  ['03.11.2026', 'F01004', '2026 kasım ayı daire 4 kira ödemesi AYŞE DEMİR Ziraat Mobil Havale', -1500000],
  ['03.11.2026', 'F01004', 'MESAJ ÜCRETİ TUTARI', -37],
  ['05.11.2026', 'F01006', 'KK TAHSİLAT KART NO: 4446 **** **** 1234 FİŞ NO:0001006', -725040],
  ['11.11.2026', 'F01007', 'Türkiye Garanti Bankası A.Ş./TR380006200011700000000001-ahmet yılmaz/FAST işlemi', -980000],
  ['11.11.2026', 'F01007', 'MESAJ ÜCRETİ TUTARI', -50],
  ['14.11.2026', 'F01008', 'VELİ ÇAKIR Ziraat Mobil Havale', -120000],
  ['18.11.2026', 'F01009', 'Gönd: ZEYNEP ŞAHİN 0064-Türkiye İş Bankası A.Ş. FAST işlemi', 30000]
];
const YENI = ESKI.concat([
  ['19.11.2026', 'F01010', 'Türkiye Vakıflar Bankası T.A.O./TR290001500158000000000002-ali veli/FAST işlemi', -50000],
  ['19.11.2026', 'F01010', 'MESAJ ÜCRETİ TUTARI', -37]
]);
const tl = k => (k < 0 ? '-' : '') + (Math.abs(k) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 });
function hesapHtml(rows) {
  let b = 500000; const satir = rows.map(r => { b += r[3]; return r.concat([b]); }).reverse();
  return '<meta charset="utf-8"><style>body{font:11pt Arial;margin:30px 40px;width:1100px;color:#111}table{border-collapse:collapse;width:100%}' +
    'th{text-align:left;border-bottom:2px solid #000;padding:6px}td{padding:7px 6px;vertical-align:middle}td.r,th.r{text-align:right;white-space:nowrap}' +
    'tr:nth-child(even) td{background:#f1f1f1}.ac{width:520px}.h{display:flex;justify-content:space-between;margin-bottom:24px}</style>' +
    '<div class="h"><div><b style="font-size:16pt">Ziraat Bankası</b><br><br>Sayın : AHMET YILMAZ<br>Adres : ÖRNEK MAH. 1 SK. MANİSA</div>' +
    '<div>Müşteri/Hesap No : 11111111-5001<br>IBAN : TR000001000000000000000001<br>Döviz Cinsi : TRY<br>Dönem : 18.10.2026-19.11.2026</div></div>' +
    '<table><tr><th>Tarih</th><th>Fiş No</th><th class="ac">Açıklama</th><th class="r">Tutar</th><th class="r">Bakiye</th></tr>' +
    satir.map(r => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td class="ac">' + r[2] + '</td><td class="r">' + tl(r[3]) + '</td><td class="r">' + tl(r[4]) + '</td></tr>').join('') +
    '</table><p style="font-size:8pt;margin-top:30px">Bu belge bilgi amaçlıdır.</p>';
}
const KART_APP = '<meta charset="utf-8"><style>body{font:15px Arial;margin:0;width:390px;background:#fff;color:#222}.u{background:#0a6;color:#fff;padding:18px}' +
  '.i{display:flex;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #ddd}.i small{color:#777;display:block;margin-top:4px}</style>' +
  '<div class="u"><b>Garanti BBVA Bonus</b><br>Kart **** 9999<br>Dönem içi işlemler</div>' +
  '<div class="i"><div>MIGROS MANISA<small>18.11.2026 14:32</small></div><b>1.250,40 TL</b></div>' +
  '<div class="i"><div>SHELL PETROL<small>17.11.2026 09:10</small></div><b>1.800,00 TL</b></div>' +
  '<div class="i"><div>NETFLIX.COM<small>15.11.2026 21:05</small></div><b>229,99 TL</b></div>';
const SEED = { v: 3, config: { people: [{ name: 'Ahmet', salaryDay: 31 }, { name: 'Elif', salaryDay: 5 }], defaultCardId: 'ziraat' },
  cards: [{ id: 'ziraat', name: 'Ahmet Ziraat', bank: 'Ziraat Bankası', owner: 'Ahmet', last4: '1234', limit: 5000000, statementDay: 23, dueDay: 3, openingBalance: 0, active: true },
    { id: 'garanti', name: 'Ahmet Garanti', bank: 'Garanti BBVA', owner: 'Ahmet', last4: '9999', limit: 5000000, statementDay: 26, dueDay: 5, openingBalance: 0, active: true },
    { id: 'yk', name: 'Elif Yapı Kredi', bank: 'Yapı Kredi', owner: 'Elif', last4: '', limit: 5000000, active: true }],
  recurring: [], plans: [], imports: [], buckets: {} };

(async () => {
  await new Promise(r => srv.listen(8127, r));
  const br = await chromium.launch();
  fs.mkdirSync('fx', { recursive: true });
  /* belgeleri üret: fotoğraf (PNG ~300 dpi), daha yeni belge (JPEG), metin PDF, kart uygulaması ekran görüntüsü */
  const uret = await br.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2.2 });
  await uret.setContent(hesapHtml(ESKI)); await uret.screenshot({ path: 'fx/hesap-foto.png', fullPage: true });
  await uret.pdf({ path: 'fx/hesap-metin.pdf', width: '1180px', height: '1000px', printBackground: true });
  const u2 = await br.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 1.8 });
  await u2.setContent(hesapHtml(YENI)); await u2.screenshot({ path: 'fx/hesap-yeni.jpg', type: 'jpeg', quality: 85, fullPage: true });
  const u3 = await br.newPage({ viewport: { width: 390, height: 500 }, deviceScaleFactor: 3 });
  await u3.setContent(KART_APP); await u3.screenshot({ path: 'fx/kart-ekran.png', fullPage: true });

  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errs.push(m.text()); });
  await page.addInitScript(seed => { if (!localStorage.getItem('hz_finans_v3')) localStorage.setItem('hz_finans_v3', seed); }, JSON.stringify(SEED));
  await page.goto('http://localhost:8127/');
  await page.waitForFunction(() => window.__T && window.__T.S.ready);
  const E = (fn, a) => page.evaluate(fn, a);

  console.log('\n— elle giriş artık nakit —');
  ok('hızlı çubukta ilk düğme "Nakit harcama", ikinci "Belge yükle"', await E(() => [...document.querySelectorAll('.quickbar .qbtn b')].slice(0, 2).map(b => b.textContent).join('|')) === 'Nakit harcama|Belge yükle');
  await page.click('#fab');
  ok('+ düğmesi nakit seçili açılıyor', await E(() => document.querySelector('#qMethod [data-m="CASH"]').getAttribute('aria-pressed')) === 'true');
  await E(() => __T.handleAct('closeModal', {}));

  const yukle = async (dosyalar, bekle) => {
    await E(() => __T.handleAct('ekstre', {}));
    const t0 = Date.now();
    await page.setInputFiles('#xFile', dosyalar.map(d => 'fx/' + d));
    await page.waitForSelector(bekle, { timeout: 120000 });
    return Date.now() - t0;
  };
  const hb = () => E(() => __T.HB ? __T.HB.satirlar.map(x => ({ date: x.s.date, tutar: x.tutar, isaret: Math.sign(x.s.amount), durum: x.durum, karar: x.karar, kat: x.kategori, not: x.o.note, sd: x.s.durum, id: x.id })) : null);

  console.log('\n— hesap hareketleri fotoğrafı (OCR) —');
  const sure = await yukle(['hesap-foto.png'], '#hbOk');
  let L = await hb();
  console.log('    (okuma ' + Math.round(sure / 1000) + ' sn)');
  ok('10 satır okundu', L.length === 10, L.length);
  const beklenen = ESKI.slice().reverse();
  ok('bütün tarih ve tutarlar doğru', L.every((x, i) => x.date === beklenen[i][0].split('.').reverse().join('-') && x.tutar === Math.abs(beklenen[i][3]) && x.isaret === Math.sign(beklenen[i][3])),
    L.map((x, i) => x.tutar === Math.abs(beklenen[i][3]) ? '' : i + ':' + x.tutar).filter(Boolean));
  ok('kimlikler fişle: zh-20261118-F01009-1', L[0].id === 'zh-20261118-F01009-1' && L.find(x => x.id === 'zh-20261111-F01007-2'), L.map(x => x.id).slice(0, 3));
  const k = d => L.find(x => x.date === d[0] && x.tutar === d[1]) || {};
  ok('maaş → gelir · Maaş', k(['2026-10-30', 5000000]).karar === 'INCOME' && k(['2026-10-30', 5000000]).kat === 'Maaş');
  ok('gelen FAST → Gelen havale (gönderen adıyla)', k(['2026-11-18', 30000]).kat === 'Gelen havale' && /Zeynep Şahin/.test(k(['2026-11-18', 30000]).not), k(['2026-11-18', 30000]));
  ok('ATM çekimi varsayılan olarak eklenmiyor', k(['2026-11-01', 200000]).karar === 'atla');
  ok('KK TAHSİLAT …1234 → Ziraat kartına ödeme', k(['2026-11-05', 725040]).karar === 'kart:ziraat');
  ok('kendi adına Garanti\'ye FAST → Garanti kartına ödeme', k(['2026-11-11', 980000]).karar === 'kart:garanti');
  ok('kira → Kira', k(['2026-11-03', 1500000]).kat === 'Kira');
  ok('SMS ücreti → Faiz & Ücret', k(['2026-11-03', 37]).kat === 'Faiz & Ücret');
  ok('başkasına havale → gider · Havale', k(['2026-11-14', 120000]).karar === 'EXPENSE' && k(['2026-11-14', 120000]).kat === 'Havale');
  const ozet = await page.textContent('.sheet');
  ok('önizleme: sağlama tuttu, 9 kayıt eklenecek', /Okuma sağlaması tuttu/.test(ozet) && /Onayla — 9 kayıt/.test(ozet), ozet.slice(0, 300));
  await page.screenshot({ path: 'belge-onizleme.png', fullPage: false });
  /* kullanıcı ATM'yi ekle diyebilir; bu testte vazgeçip olduğu gibi onaylıyoruz */
  await page.click('#hbOk');
  await page.waitForSelector('[data-act="belgeGeriAl"]');
  let T = await E(() => __T.S.transactions.map(t => ({ id: t.id, kind: t.kind, amount: t.amount, cardId: t.cardId || null, kaynak: t.kaynak, method: t.method, person: t.person, ay: __T.txAy(t) })));
  ok('9 kayıt yazıldı, hepsi banka hesabı, kişi Ahmet', T.length === 9 && T.every(t => t.method === 'BANK_ACCOUNT' && t.kaynak === 'ziraat-hesap' && t.person === 'Ahmet'), T.length);
  ok('kart ödemeleri doğru kartlarda', T.filter(t => t.kind === 'CARD_PAYMENT').map(t => t.cardId).sort().join() === 'garanti,ziraat');
  ok('banka kayıtları takvim ayına (kira Kasım, maaş Ekim)', T.find(t => t.amount === 1500000).ay === '2026-11' && T.find(t => t.amount === 5000000).ay === '2026-10');
  await E(() => __T.handleAct('closeModal', {}));

  console.log('\n— aynı belge metin PDF olarak (ikinci kez) —');
  await yukle(['hesap-metin.pdf'], '#hbOk');
  L = await hb();
  ok('metin PDF de hesap hareketi olarak tanındı, 10 satır', L.length === 10, L.length);
  ok('10 satırın hepsi "zaten var" ya da ATM — 0 yeni', (await page.textContent('#hbOk')).includes('0 kayıt') && L.filter(x => x.durum === 'VAR').length === 9, L.map(x => x.durum));
  ok('"daha önce yüklenmiş" uyarısı yok (ATM eklenmemişti) ama yeni kayıt da yok', !/Onayla — [1-9]/.test(await page.textContent('#hbOk')));
  await E(() => __T.handleAct('closeModal', {}));

  console.log('\n— ertesi gün daha yeni belge (JPEG, 2 yeni satır) —');
  await yukle(['hesap-yeni.jpg'], '#hbOk');
  L = await hb();
  ok('12 satır okundu', L.length === 12, L.length);
  ok('yalnızca 19.11\'deki 2 satır yeni', L.filter(x => x.durum !== 'VAR' && x.karar !== 'atla').map(x => x.date + ':' + x.tutar).sort().join() === '2026-11-19:37,2026-11-19:50000', L.filter(x => x.durum !== 'VAR').map(x => x.date + ':' + x.tutar + ':' + x.durum));
  await page.click('#hbOk'); await page.waitForSelector('[data-act="belgeGeriAl"]');
  ok('toplam 11 kayıt', (await E(() => __T.S.transactions.length)) === 11);
  console.log('\n— geri al —');
  await page.click('[data-act="belgeGeriAl"]');
  await page.waitForFunction(() => __T.S.transactions.length === 9);
  ok('son yükleme geri alındı (9 kayıt kaldı)', true);
  await E(() => __T.handleAct('closeModal', {}));

  console.log('\n— elle girilmiş kart ödemesi + belge —');
  await E(async () => { const t = { id: 'elle1', kind: 'CARD_PAYMENT', cardId: 'garanti', amount: 50000, date: '2026-11-19', person: 'Ahmet', method: 'BANK_ACCOUNT', note: 'elle', createdAt: new Date().toISOString() };
    __T.S.buckets['2026-11'] = (__T.S.buckets['2026-11'] || []).concat([t]); await __T.Store.putBuckets(['2026-11']); });
  await yukle(['hesap-yeni.jpg'], '#hbOk');
  L = await hb();
  const vk = L.find(x => x.tutar === 50000);
  ok('Vakıfbank FAST (başkasına) → gider; elle girilen Garanti ödemesiyle karıştırılmadı', vk.karar === 'EXPENSE' && vk.durum === 'YENI', vk);
  await E(() => __T.handleAct('closeModal', {}));

  console.log('\n— kart uygulaması ekran görüntüsü (ekstre kesilmemiş) —');
  await yukle(['kart-ekran.png'], '#xOk');
  const ex = await E(() => ({ kart: __T.EX.cardId, n: __T.EX.st.rows.length, rows: __T.EX.st.rows.map(r => r.date + ' ' + r.amount + ' ' + r.desc), yeni: __T.EX.res.counts.YENI, close: __T.EX.close }));
  ok('kart belgeden bulundu (…9999 → Garanti)', ex.kart === 'garanti', ex.kart);
  ok('3 harcama okundu, tutarlar doğru', ex.n === 3 && ex.rows.map(r => r.split(' ')[1]).sort().join() === '125040,180000,22999', ex.rows);
  ok('kesim tarihi tahmin edildi (26 Kasım dönemi)', ex.close === '2026-11-26', ex.close);
  await page.click('#xOk'); await page.waitForFunction(() => !document.querySelector('.scrim'));
  await yukle(['kart-ekran.png'], '#xOk');
  ok('aynı ekran görüntüsü ikinci kez: 0 yeni', (await E(() => __T.EX.res.counts.YENI)) === 0 && (await E(() => __T.EX.res.counts.VAR)) === 3);
  await E(() => __T.handleAct('closeModal', {}));

  console.log('\n— telefon —');
  const tel = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const tp = await tel.newPage(); await tp.addInitScript(s => localStorage.setItem('hz_finans_v3', s), JSON.stringify(SEED));
  await tp.goto('http://localhost:8127/'); await tp.waitForFunction(() => window.__T && window.__T.S.ready);
  await tp.evaluate(() => __T.handleAct('ekstre', {}));
  ok('belge yükle penceresi telefonda taşmıyor', !(await tp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
  await tp.screenshot({ path: 'belge-telefon.png' });
  ok('konsol temiz', errs.length === 0, errs.slice(0, 3));
  console.log('\n' + (n - bad) + '/' + n + ' geçti'); await br.close(); srv.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
