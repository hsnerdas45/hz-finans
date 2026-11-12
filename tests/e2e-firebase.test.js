/* GitHub sürümü: giriş ekranı, ilk yönetici, onay akışı, iki kişi aynı veri.
   tests/sahte-firebase.js ile çalışır (gerçek Firebase'e bağlanmaz). */
const { chromium } = require('playwright');
process.chdir(__dirname);
const http = require('http'), fs = require('fs'), path = require('path');
let n = 0, bad = 0;
const ok = (ad, c, ek) => { n++; if (!c) { bad++; console.log('  ✗ ' + ad + (ek !== undefined ? '   → ' + JSON.stringify(ek) : '')); } else console.log('  ✓ ' + ad); };
const srv = http.createServer((q, r) => {
  let u = q.url.split('?')[0];
  let f = u.startsWith('/vendor/') ? path.join(__dirname, '..', u)
    : u === '/sahte-firebase.js' ? path.join(__dirname, 'sahte-firebase.js')
    : path.join(__dirname, 'site-fb', u === '/' ? 'index.html' : u);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' }); r.end(b); });
});
(async () => {
  await new Promise(r => srv.listen(8126, r));
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  const yeni = async () => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e)));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await p.goto('http://localhost:8126/'); return p;
  };
  const metin = p => p.textContent('#giris').catch(() => '');
  const gorunur = p => p.evaluate(() => { const g = document.getElementById('giris'); return !!g && g.style.display !== 'none'; });

  console.log('\n— giriş ekranı —');
  const hasan = await yeni();
  await hasan.waitForSelector('#gForm');
  ok('açılışta giriş ekranı, uygulama kapalı', await gorunur(hasan) && /Giriş yap/.test(await metin(hasan)) && /Google ile giriş yap/.test(await metin(hasan)));
  ok('veri isteği gitmedi (Store bağlanmadı)', (await hasan.evaluate(() => __T.Store.mode)) !== 'cloud');
  await hasan.fill('#gEposta', 'hasan@ornek.com'); await hasan.fill('#gSifre', 'yanlis1');
  await hasan.click('#gForm button[type=submit]');
  await hasan.waitForSelector('#giris .msj.on');
  ok('olmayan hesapla giriş: Türkçe hata', /yanlış/.test(await metin(hasan)), await metin(hasan));
  await hasan.click('[data-k="unut"]'); await hasan.fill('#gEposta', 'hasan@ornek.com'); await hasan.click('#gForm button[type=submit]');
  await hasan.waitForSelector('#giris .msj.ok');
  ok('şifremi unuttum: bağlantı gönderildi', /gönderildi/.test(await metin(hasan)));

  console.log('\n— ilk kayıt yönetici olur —');
  await hasan.click('[data-k="giris"]'); await hasan.click('[data-k="kayit"]');
  await hasan.fill('#gAd', 'Hasan'); await hasan.fill('#gEposta', 'hasan@ornek.com'); await hasan.fill('#gSifre', '123');
  await hasan.click('#gForm button[type=submit]'); await hasan.waitForSelector('#giris .msj.on');
  ok('kısa şifre reddedildi', /en az 6/.test(await metin(hasan)));
  await hasan.fill('#gSifre', 'gizli123'); await hasan.click('#gForm button[type=submit]');
  await hasan.waitForFunction(() => __T.Store.mode === 'cloud' && __T.S.ready, null, { timeout: 10000 });
  ok('ilk kaydolan doğrudan uygulamaya girdi', !(await gorunur(hasan)));
  await hasan.screenshot({ path: 'fb-ozet.png' });

  /* yönetici kart ve harcama girer */
  await hasan.evaluate(async () => {
    const S = __T.S, St = __T.Store;
    S.cards = [{ id: 'ziraat', name: 'Ziraat', bank: 'Ziraat', owner: 'Hasan', limit: 5000000, statementDay: 23, dueDay: 3, openingBalance: 0, active: true }];
    await St.put('cards', 'ziraat', S.cards[0]);
    S.config.people = [{ name: 'Hasan', salaryDay: 31 }, { name: 'Zeynep', salaryDay: 5 }]; await St.saveConfig();
  });
  await hasan.evaluate(() => __T.handleAct('quickAdd', { card: 'ziraat' }));
  await hasan.fill('#qTutar', '450'); await hasan.fill('#qNote', 'market'); await hasan.fill('#qDate', '2026-11-13');
  await hasan.evaluate(() => __T.handleAct('quickSave', {})); await hasan.waitForFunction(() => !document.querySelector('.scrim'));
  ok('harcama kaydedildi', (await hasan.evaluate(() => __T.S.transactions.length)) === 1);

  console.log('\n— ikinci kişi: kayıt → onay bekler —');
  await hasan.evaluate(() => sessionStorage.setItem('sahteFB_oturum_hasan', '1'));
  const zeynep = await ctx.newPage();
  zeynep.on('pageerror', e => errs.push(String(e)));
  await zeynep.goto('http://localhost:8126/');
  await zeynep.evaluate(() => sessionStorage.removeItem('sahteFB_oturum'));
  await zeynep.reload();
  await zeynep.waitForSelector('#gForm');
  await zeynep.click('[data-k="kayit"]');
  await zeynep.fill('#gAd', 'Zeynep'); await zeynep.fill('#gEposta', 'zeynep@ornek.com'); await zeynep.fill('#gSifre', 'gizli456');
  await zeynep.click('#gForm button[type=submit]');
  await zeynep.waitForFunction(() => /Onay bekleniyor/.test(document.getElementById('giris').textContent));
  ok('onaysız kullanıcı "onay bekleniyor" ekranında', await gorunur(zeynep));
  const sizinti = await zeynep.evaluate(async () => {
    try { await window.firebase.initializeApp().firestore().doc('tx/2026-11').get(); return 'okundu'; } catch (e) { return e.code; }
  });
  ok('onaysız kullanıcı veriyi okuyamıyor (kural)', sizinti === 'permission-denied', sizinti);
  ok('onaysız kullanıcıya veri gelmedi', (await zeynep.evaluate(() => __T.S.transactions.length)) === 0);
  await zeynep.screenshot({ path: 'fb-bekle.png' });

  console.log('\n— yönetici onaylar —');
  await hasan.evaluate(() => __T.handleAct('go', { go: 'ayarlar' }));
  await hasan.waitForSelector('#hesapPanel [data-hk="onayla"]', { timeout: 5000 });
  const panel = await hasan.textContent('#hesapPanel');
  ok('Ayarlar: Zeynep "onay bekliyor" listede', /Zeynep/.test(panel) && /onay bekliyor/.test(panel) && /yönetici/.test(panel), panel.slice(0, 200));
  await hasan.screenshot({ path: 'fb-kullanicilar.png', fullPage: true });
  await hasan.click('#hesapPanel [data-hk="onayla"]');
  await zeynep.waitForFunction(() => __T.Store.mode === 'cloud' && __T.S.ready, null, { timeout: 8000 });
  ok('onaylanınca Zeynep\'in ekranı kendiliğinden açıldı', !(await gorunur(zeynep)));
  ok('Zeynep, Hasan\'ın girdiği harcamayı görüyor', (await zeynep.evaluate(() => __T.S.transactions.map(t => t.note).join())) === 'market');

  console.log('\n— anlık senkron —');
  await zeynep.evaluate(() => __T.handleAct('quickAdd', { method: 'CASH' }));
  await zeynep.fill('#qTutar', '120'); await zeynep.fill('#qNote', 'fırın'); await zeynep.fill('#qDate', '2026-11-13');
  await zeynep.evaluate(() => __T.handleAct('quickSave', {})); await zeynep.waitForFunction(() => !document.querySelector('.scrim'));
  await hasan.waitForFunction(() => __T.S.transactions.some(t => t.note === 'fırın'), null, { timeout: 5000 });
  ok('Zeynep\'in girdiği kayıt Hasan\'ın ekranına geldi', true);
  ok('aynı ay belgesine iki kişinin kaydı birlikte yazıldı', (await hasan.evaluate(() => __T.S.buckets['2026-11'].length)) === 2);

  console.log('\n— erişimi kaldır —');
  await hasan.evaluate(() => __T.handleAct('go', { go: 'ayarlar' }));
  await hasan.waitForSelector('#hesapPanel [data-hk="kaldir"]');
  await hasan.click('#hesapPanel [data-hk="kaldir"]');
  await zeynep.waitForFunction(() => { const g = document.getElementById('giris'); return g && g.style.display !== 'none' && /Onay bekleniyor/.test(g.textContent); }, null, { timeout: 8000 });
  ok('erişimi kaldırılan kullanıcı tekrar bekleme ekranına düştü', true);

  console.log('\n— çıkış ve tekrar giriş —');
  await hasan.click('#hesapPanel #hCikis');
  await hasan.waitForSelector('#gForm', { timeout: 8000 });
  ok('çıkış yapınca giriş ekranı', await gorunur(hasan));
  await hasan.fill('#gEposta', 'hasan@ornek.com'); await hasan.fill('#gSifre', 'gizli123'); await hasan.click('#gForm button[type=submit]');
  await hasan.waitForFunction(() => __T.Store.mode === 'cloud' && __T.S.ready && __T.S.transactions.length === 2, null, { timeout: 8000 });
  ok('tekrar giriş: veriler yerinde', true);

  console.log('\n— telefon boyutu —');
  const tel = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const tp = await tel.newPage(); await tp.goto('http://localhost:8126/'); await tp.waitForSelector('#gForm');
  const tasma = await tp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  ok('giriş ekranı telefonda taşmıyor', !tasma);
  await tp.screenshot({ path: 'fb-giris-telefon.png' });
  ok('konsol temiz', errs.length === 0, errs.slice(0, 3));
  console.log('\n' + (n - bad) + '/' + n + ' geçti'); await br.close(); srv.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
