/* Borçları kapat: 12.11.2026 itibarıyla her şey ödendi */
const { chromium } = require('playwright');
process.chdir(__dirname);
const http = require('http'), fs = require('fs'), path = require('path');
let n = 0, bad = 0;
const ok = (ad, c, ek) => { n++; if (!c) { bad++; console.log('  ✗ ' + ad + (ek !== undefined ? '   → ' + JSON.stringify(ek) : '')); } else console.log('  ✓ ' + ad); };
const src = fs.readFileSync('e2e.test.js', 'utf8');
const SEED = eval('(function(){' + src.slice(src.indexOf('const T = (id'), src.indexOf('(async () =>')) + ';return SEED;})()');
SEED.cards[0].openingBalance = 5000000;           /* eski açılış borcu */
SEED.recurring = [{ id: 'kira', name: 'Ev kirası', amount: 2250000, dueDay: 5, frequency: 'MONTHLY', priority: 'CRITICAL', category: 'Kira', owner: 'Hasan', active: true },
                  { id: 'aidat', name: 'Aidat', amount: 150000, dueDay: 10, frequency: 'MONTHLY', priority: 'HIGH', category: 'Aidat', owner: 'Hasan', active: true }];
const srv = http.createServer((q, r) => { let u = q.url.split('?')[0]; let f = u.startsWith('/vendor/') ? path.join(__dirname, '..', u) : path.join(__dirname, 'site', u === '/' ? 'index.html' : u);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' }); r.end(b); }); });
(async () => {
  await new Promise(r => srv.listen(8125, r));
  const br = await chromium.launch(); const page = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.addInitScript(s => { if (!localStorage.getItem('hz_finans_v3')) localStorage.setItem('hz_finans_v3', s); }, JSON.stringify(SEED));
  await page.goto('http://localhost:8125/'); await page.waitForFunction(() => window.__T && __T.S.ready);
  const E = (fn, a) => page.evaluate(fn, a);
  const BUGUN = await E(() => HZ.D.todayISO());
  console.log('  (bugün ' + BUGUN + ')');
  const durum = () => E(() => {
    const st = { config: __T.S.config, cards: __T.S.cards, recurring: __T.S.recurring, transactions: __T.S.transactions };
    const t = HZ.D.todayISO();
    const plan = HZ.Planner.plan(st, t);
    return {
      borc: Object.fromEntries(__T.S.cards.map(c => [c.id, HZ.Cards.currentBalance(c, __T.S.transactions, t)])),
      acik: plan.items.filter(i => i.status !== 'PAID' && i.status !== 'NONE' && HZ.D.lte(i.dueDate, '2026-11-12')).map(i => i.name + ' ' + i.dueDate + ' ' + i.status),
      taksit: __T.S.transactions.filter(x => x.installment).length,
      plan: __T.S.plans.map(p => p.kapandi || null),
      ekim: __T.S.cards.map(c => { const sp = HZ.StatementPeriod.build(2026, 9, c); return c.statementDay ? HZ.Cards.statement(c, __T.S.transactions, sp, t).status : 'x'; })
    };
  });

  await E(() => __T.handleAct('quickAdd', { card: 'ziraat' }));
  await page.fill('#qTutar', '12000'); await page.fill('#qDate', '2026-08-12'); await page.fill('#qTaksit', '6'); await page.fill('#qNote', 'Teknosa TV');
  await E(() => __T.handleAct('quickSave', {})); await page.waitForFunction(() => __T.S.plans.length === 1 && !document.querySelector('.scrim'));
  let d0 = await durum();
  ok('önce: Ziraat borçlu, açık ödemeler var', d0.borc.ziraat > 5000000 && d0.acik.length > 0, d0);

  console.log('\n— Ayarlar → Borçları kapat —');
  await E(() => __T.handleAct('go', { go: 'ayarlar' }));
  await page.click('[data-act="kapanis"]');
  await page.fill('#kTarih', '2026-11-12'); await page.dispatchEvent('#kTarih', 'change');
  const on = await page.textContent('#kOn');
  ok('önizleme: kart borçları ve kaldırılacak 2 gelecek taksit', /Hasan Ziraat/.test(on) && /2 gelecek taksit/.test(on), on.slice(0, 200));
  await page.screenshot({ path: 'kapanis.png' });
  await page.click('.sheet [data-act="kapanisUygula"]'); await page.waitForFunction(() => !document.querySelector('.scrim'));
  let d1 = await durum();
  ok('tüm kart borçları 0', Object.values(d1.borc).every(v => v === 0), d1.borc);
  ok('12.11\'e kadar açık ödeme kalmadı (kira, aidat, ekstreler)', d1.acik.length === 0, d1.acik);
  ok('eski ekstreler ödendi', d1.ekim.every(s => s === 'PAID' || s === 'NONE' || s === 'x'), d1.ekim);
  ok('12.11 sonrasındaki 2 taksit kaldırıldı, plan erken kapatıldı', d1.taksit === 4 && d1.plan[0] === '2026-11-12', d1);
  ok('bu ayın kaydı açıldı', await E(() => Array.isArray(__T.S.buckets['2026-11'])));
  ok('geçmiş kayıtlar silinmedi', (await E(() => __T.S.transactions.filter(t => !t.installment).length)) === 6);
  await E(() => __T.handleAct('go', { go: 'ozet' }));
  const kalan = await E(() => document.querySelector('#v-ozet').textContent);
  ok('Özet: kapanmış borçlar bu ayın kalanından düşülmüyor (kalan ≥ 0 değilse yalnızca nakit gider kadar)', /AY BORCU\s*0 ₺|ay borcu\s*0 ₺/i.test(kalan), kalan.slice(0, 600));
  ok('Özet: "tüm borçlar kapatıldı" şeridi', /12\.11\.2026 itibarıyla tüm borçlar kapatıldı/.test(await page.textContent('#v-ozet')));
  await page.screenshot({ path: 'kapanis-ozet.png' });
  await E(() => __T.handleAct('go', { go: 'odemeler' }));
  const od = await page.textContent('#v-odemeler');
  ok('Ödemeler sayfasında gecikmiş yok', !/[Gg]ecikmi/.test(od), od.slice(0, 300));
  await page.screenshot({ path: 'kapanis-odemeler.png', fullPage: true });

  console.log('\n— yeni dönem —');
  await E(() => __T.handleAct('quickAdd', { card: 'ziraat' }));
  await page.fill('#qTutar', '350'); await page.fill('#qDate', '2026-11-13'); await page.fill('#qNote', 'market');
  await E(() => __T.handleAct('quickSave', {})); await page.waitForFunction(() => !document.querySelector('.scrim'));
  ok('kapanıştan sonraki harcama yeni borç olarak sayılıyor', (await E(() => HZ.Cards.currentBalance(__T.S.cards[0], __T.S.transactions, '2026-11-20'))) === 35000);
  ok('Kasım ayına yazıldı', (await E(() => __T.txAy(__T.S.transactions.find(t => t.note === 'market' && t.date === '2026-11-13')))) === '2026-11');

  console.log('\n— eski uygulamanın yedeği sonradan yüklenirse —');
  const yedek = JSON.stringify({ v: 3, config: { people: SEED.config.people, primarySalaryDay: 31, categories: SEED.config.categories }, cards: SEED.cards, recurring: SEED.recurring, plans: [], buckets: SEED.buckets });
  await E(() => __T.handleAct('importJson', {})); await page.fill('#jsonIn', yedek);
  await E(() => __T.handleAct('importJsonRun', {})); await page.waitForFunction(() => !document.querySelector('.scrim'));
  let d2 = await durum();
  ok('yedek yüklendikten sonra da borçlar kapalı', Object.values(d2.borc).every(v => v === 0) && d2.acik.length === 0, d2);

  console.log('\n— geri al —');
  await E(() => __T.handleAct('go', { go: 'ayarlar' })); await page.click('[data-act="kapanisGeriAl"]'); await page.click('[data-act="onayEvet"]');
  await page.waitForFunction(() => !__T.S.config.kapanis);
  let d3 = await durum();
  ok('geri alınca eski borç geri geldi', d3.borc.ziraat === d0.borc.ziraat - 800000 /* yedek taksit planını içermiyordu */, d3.borc);
  ok('konsol temiz', errs.length === 0, errs.slice(0, 3));
  console.log('\n' + (n - bad) + '/' + n + ' geçti'); await br.close(); srv.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
