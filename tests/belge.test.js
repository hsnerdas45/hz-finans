/* HZBelge birim testleri — uydurma veriyle (OCR'sız: metin kaynağı) */
const B = require('../src/belge.js');
let n = 0, bad = 0;
const ok = (ad, c, ek) => { n++; if (!c) { bad++; console.log('  ✗ ' + ad + (ek !== undefined ? '   → ' + JSON.stringify(ek) : '')); } else console.log('  ✓ ' + ad); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('\n— sayı ve tarih —');
ok('1.400,00', B.sayiOku('1.400,00').v === 140000);
ok('-2.400.00 (OCR noktası)', B.sayiOku('-2.400.00').v === -240000);
ok('1141 14,39 (boşluk)', B.sayiOku('1141 14,39').v === 11411439);
ok('115.559.227 belirsiz', B.sayiOku('115.559.227').kesin === false);
ok('-4896,85', B.sayiOku('-4896,85').v === -489685 && B.sayiOku('-4896,85').kesin);
ok('O → 0', B.sayiOku('1.4O0,00').v === 140000);
ok('tarih + saat', eq(B.tarihOku('18.11.2026 14:32'), { date: '2026-11-18', saat: '14:32' }));
ok('ayraçsız tarih 18112026', B.tarihOku('18112026').date === '2026-11-18');
ok('18 Kasım 2026', B.tarihOku('18 Kasım 2026').date === '2026-11-18');
ok('geçersiz tarih', B.tarihOku('45.13.2026') === null);
ok('fiş: FO2910 → F02910', B.fisDuzelt('FO2910') === 'F02910');

console.log('\n— bakiye zinciri —');
/* yeniden eskiye; okuma hataları: 1 eksik tutar, 2 bozuk bakiye, 1 işaret düşmesi */
const satir = (d, t, b) => ({ date: d, desc: 'x', tutarYazi: t, bakiyeYazi: b });
const z = B.zincir([
  satir('2026-11-10', '700.00', '1822512'),
  satir('2026-11-07', '-19.587,38', '17.525,12'),
  satir('2026-11-05', '-4896,85', '3111250'),
  satir('2026-11-03', '', '42.00935'),
  satir('2026-11-03', '-750,00', '42.00972'),
  satir('2026-11-03', '22500,00', '4215912'),
  satir('2026-11-01', '-4.000,00', '65.259,72'),
  satir('2026-10-30', '66.922,10', '69.259,72'),
  satir('2026-10-23', '300,00', '2331.62'),
  satir('2026-10-22', '-1.400,00', '2.037,62'),
  satir('2026-10-21', '300,00', '3.437,62')
]);
ok('yön: yeniden eskiye', z.yon === 'azalan');
ok('tutarlar onarıldı', eq(z.satirlar.map(s => s.amount), [70000, -1958738, -489685, -37, -75000, -2250000, -400000, 6692210, 30000, -140000, 30000]), z.satirlar.map(s => s.amount));
ok('bakiyeler onarıldı', eq(z.satirlar.map(s => s.bakiye), [1822512, 1752512, 3711250, 4200935, 4200972, 4275972, 6525972, 6925972, 233762, 203762, 343762]), z.satirlar.map(s => s.bakiye));
ok('eksik tutar ve işaret "düzeltildi" olarak işaretli', z.satirlar[3].durum === 'duzeltildi' && z.satirlar[5].durum === 'duzeltildi');
ok('kontrol gereken satır yok', z.satirlar.every(s => s.durum !== 'kontrol'));

console.log('\n— metin PDF düzeni → satırlar —');
(async () => {
  const k = [];
  const w = (t, x0, y0, x1) => k.push({ t, x0, y0, x1: x1 || x0 + t.length * 5, y1: y0 + 9 });
  w('Halkbank', 40, 20); w('Ad Soyad : AYŞE ÖRNEK', 40, 40);
  w('İşlem Tarihi', 40, 80); w('Saat', 110, 80); w('Açıklama', 150, 80); w('Borç', 400, 80, 420); w('Alacak', 450, 80, 480); w('Bakiye', 510, 80, 540);
  const r = (y, d, s, a, borc, al, bk) => { w(d, 40, y); w(s, 110, y); w(a, 150, y); if (borc) w(borc, 425 - borc.length * 5, y, 420); if (al) w(al, 480 - al.length * 5, y, 480); w(bk, 540 - bk.length * 5, y, 540); };
  r(100, '01.11.2026', '09:15', 'MAAŞ ÖDEMESİ ÖRNEK A.Ş.', '', '30.000,00', '31.000,00');
  r(115, '02.11.2026', '12:01', 'ELEKTRIK FATURASI', '850,00', '', '30.150,00');
  r(130, '02.11.2026', '12:01', 'ELEKTRIK FATURASI', '850,00', '', '30.150,00');   /* aynı tarih + saat: tekrar */
  r(145, '03.11.2026', '18:40', 'KREDI KARTI ODEMESI 5555 **** **** 4321', '5.000,00', '', '25.150,00');
  const h = await B.hesapOku([B.metinKaynak(k)]);
  ok('3 satır (aynı tarih ve saatteki tekrar bir kez sayıldı)', h.satirlar.length === 3 && h.atilan.length === 1, h.satirlar.length);
  ok('borç/alacak sütunlarından işaretli tutar', eq(h.satirlar.map(s => s.amount), [3000000, -85000, -500000]), h.satirlar.map(s => s.amount));
  ok('eskiden yeniye sıralı belge', h.yon === 'artan', h.yon);
  ok('saat okundu', h.satirlar[1].saat === '12:01');
  ok('banka ve sahip üst bilgiden', h.bilgi.banka === 'halk' && h.bilgi.sahip === 'AYŞE ÖRNEK', h.bilgi);
  const ctx = { kartlar: [{ id: 'k1', name: 'Ayşe Halkbank', bank: 'Halkbank', last4: '4321', owner: 'Ayşe' }, { id: 'k2', name: 'Ayşe Bonus', bank: 'Garanti', owner: 'Ayşe' }], sahip: h.bilgi.sahip, banka: h.bilgi.banka };
  const o = h.satirlar.map(s => B.siniflandir(s, ctx));
  ok('maaş geliri, fatura gideri, kart ödemesi (son 4 haneyle)', eq(o.map(x => [x.kind, x.category, x.cardId]), [['INCOME', 'Maaş', null], ['EXPENSE', 'Fatura', null], ['CARD_PAYMENT', 'Kredi Kartı', 'k1']]), o.map(x => [x.kind, x.category, x.cardId]));
  const ids = B.kimlikVer(h.satirlar, h.bilgi.banka);
  ok('kimlik saatle: bh-halk-20261102-1201-85000-1', ids[1] === 'bh-halk-20261102-1201-85000-1', ids);

  console.log('\n— sınıflama ayrıntıları —');
  const c2 = { kartlar: [{ id: 'g', name: 'Garanti', bank: 'Garanti BBVA', owner: 'Hasan' }, { id: 'y1', name: 'Z YK', bank: 'Yapı Kredi', owner: 'Zeynep' }, { id: 'y2', name: 'Z World', bank: 'Yapı Kredi', owner: 'Zeynep' }], sahip: 'HASAN ÖRNEK', banka: 'ziraat' };
  const s = (desc, amount) => B.siniflandir({ desc, amount }, c2);
  ok('aynı adın başka soyadı (Hasan Ali Kaya) kendi hesabı sayılmaz', s('HASAN ALİ KAYA Ziraat Mobil Havale', -80000).kind === 'EXPENSE');
  ok('kendi adına Garanti FAST → kart ödemesi', s('Türkiye Garanti Bankası A.Ş./TR38-hasan örnek/FAST işlemi', -100000).cardId === 'g');
  ok('eşine Yapı Kredi FAST (iki kartı var) → havale', s('Yapı ve Kredi Bankası A.Ş./TR72-Zeynep Örnek/FAST işlemi', -100000).category === 'Havale');
  ok('kendi adından gelen → atla', s('Gönd: HASAN ÖRNEK 0062-Türkiye Garanti Bankası A.Ş. FAST işlemi', 50000).karar === 'atla');
  ok('Binance → Yatırım', s('BİNANCE TURKEY KRİPTO VARLIK ALIM SATIM', -140000).category === 'Yatırım');
  ok('aidat', s('melek apartman yönetimi daire 4 aidat FAST işlemi', -75000).category === 'Aidat');

  console.log('\n— kart ekranı satırları —');
  const ks = B.kartSatirlari(['Garanti BBVA', 'MIGROS MANISA', '18.11.2026 14:32', '1.250,40 TL', 'SHELL 17.11.2026 1.800,00 TL']);
  ok('tarih ve tutar ayrı satırda olsa da birleşir', ks.length === 2 && /^18\.11\.2026 .*1\.250,40$/.test(ks[0]) && /^17\.11\.2026 SHELL 1\.800,00$/.test(ks[1]), ks);
  console.log('\n' + (n - bad) + '/' + n + ' geçti'); process.exit(bad ? 1 : 0);
})();
