/* Bulut kipi: Artifact veritabanının davranışını taklit eden sahte db ile (anlık görüntüler dondurulmuş gelir
   ve her yazmadan HEMEN sonra, yazma dönmeden önce tetiklenir — çok aylı yazmalardaki yarışı yakalar). */
const { chromium } = require('playwright');
process.chdir(__dirname);
const http = require('http'), fs = require('fs'), path = require('path');
let n = 0, bad = 0;
const ok = (ad, c, ek) => { n++; if (!c) { bad++; console.log('  ✗ ' + ad + (ek !== undefined ? '   → ' + JSON.stringify(ek) : '')); } else console.log('  ✓ ' + ad); };
const src = fs.readFileSync('e2e.test.js', 'utf8');
const SEED = eval('(function(){' + src.slice(src.indexOf('const T = (id'), src.indexOf('(async () =>')) + ';return SEED;})()');
const srv = http.createServer((q, r) => { let u = q.url.split('?')[0]; let f = u.startsWith('/vendor/') ? path.join(__dirname, '..', u) : path.join(__dirname, 'site', u === '/' ? 'index.html' : u);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' }); r.end(b); }); });
(async () => {
  await new Promise(r => srv.listen(8124, r));
  const br = await chromium.launch(); const page = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.addInitScript(seed => {
    const clone = o => JSON.parse(JSON.stringify(o));
    const freeze = o => { if (o && typeof o === 'object') { Object.values(o).forEach(freeze); Object.freeze(o); } return o; };
    const docs = {}, subs = [];
    docs['config/app'] = seed.config; seed.cards.forEach(c => docs['cards/' + c.id] = c);
    Object.keys(seed.buckets).forEach(m => docs['tx/' + m] = { month: m, items: seed.buckets[m] });
    const snap = p => ({ exists: !!docs[p], id: p.split('/').pop(), data: () => freeze(clone(docs[p])) });
    const fire = () => subs.forEach(f => f());
    const wait = () => new Promise(r => setTimeout(r, 8));
    const db = {
      doc: p => ({
        set: async d => { if (JSON.stringify(d) === undefined) throw { code: 'bad' }; JSON.stringify(d, (k, v) => { if (v === undefined) throw { code: 'undefined-field' }; return v; }); docs[p] = clone(d); window.__writes = (window.__writes || 0) + 1; fire(); await wait(); },
        delete: async () => { delete docs[p]; fire(); await wait(); },
        onSnapshot: cb => { const f = () => cb(snap(p)); subs.push(f); setTimeout(f, 0); }
      }),
      collection: name => { const q = { orderBy: () => q, limit: () => q, onSnapshot: cb => { const f = () => cb({ docs: Object.keys(docs).filter(p => p.startsWith(name + '/')).map(snap) }); subs.push(f); setTimeout(f, 0); } }; return q; }
    };
    window.__docs = docs; window.claude = { use: async x => x === 'db' ? db : null };
  }, SEED);
  await page.goto('http://localhost:8124/'); await page.waitForFunction(() => window.__T && __T.S.ready && __T.S.cards.length === 3);
  const E = (fn, a) => page.evaluate(fn, a);
  ok('bulut kipi açıldı', (await E(() => __T.Store.mode)) === 'cloud');

  await E(() => __T.handleAct('quickAdd', { card: 'ziraat' }));
  await page.fill('#qTutar', '12000'); await page.fill('#qDate', '2026-08-12'); await page.fill('#qTaksit', '6'); await page.fill('#qNote', 'Teknosa TV');
  await E(() => __T.handleAct('quickSave', {})); await page.waitForFunction(() => !document.querySelector('.scrim'));
  await page.waitForTimeout(150);
  let d = await E(() => ({ s: __T.S.transactions.filter(t => t.installment).length, db: Object.keys(__docs).filter(p => p.startsWith('tx/')).reduce((a, p) => a + __docs[p].items.filter(t => t.installment).length, 0) }));
  ok('6 aya yayılan taksit: 6 kayıt hem ekranda hem veritabanında', d.s === 6 && d.db === 6, d);
  const once = await E(() => __T.S.transactions.length);

  await E(() => __T.handleAct('ekstre', {})); await page.selectOption('#xCard', 'ziraat');
  await page.setInputFiles('#xFile', 'fx/ziraat.pdf'); await page.waitForSelector('#xOk'); await page.click('#xOk');
  await page.waitForFunction(() => !document.querySelector('.scrim')); await page.waitForTimeout(150);
  d = await E(() => { const all = Object.keys(__docs).filter(p => p.startsWith('tx/')).reduce((a, p) => a.concat(__docs[p].items), []);
    return { s: __T.S.transactions.length, db: all.length, ikey: all.filter(t => t.ikey).length, m4: all.find(t => t.id === 'm4').amount, taksit3: !!all.find(t => t.installment && t.installment.no === 3).ikey,
      kart: __docs['cards/ziraat'].ekstre && __docs['cards/ziraat'].ekstre['2026-10'], imp: Object.keys(__docs).filter(p => p.startsWith('imports/')).length }; });
  ok('ekstre: 2 yeni kayıt, veritabanı ile ekran aynı', d.s === once + 2 && d.db === once + 2, d);
  ok('7 satırın hepsi veritabanında işaretli (farklı aylardaki taksit dahil)', d.ikey === 7 && d.taksit3, d);
  ok('tutar düzeltmesi, kart ekstre kaydı ve yükleme kaydı yazıldı', d.m4 === 25250 && d.kart && d.kart.close === '2026-10-26' && d.imp === 1, d);

  const id = await E(() => __T.S.imports[0].id);
  await E(i => __T.handleAct('impUndo', { id: i }), id); await page.click('[data-act="onayEvet"]');
  await page.waitForFunction(() => __T.S.imports.length === 0); await page.waitForTimeout(150);
  d = await E(() => { const all = Object.keys(__docs).filter(p => p.startsWith('tx/')).reduce((a, p) => a.concat(__docs[p].items), []);
    return { db: all.length, ikey: all.filter(t => t.ikey).length, m4: all.find(t => t.id === 'm4').amount, e: (__docs['cards/ziraat'].ekstre || {})['2026-10'] || null, imp: Object.keys(__docs).filter(p => p.startsWith('imports/')).length }; });
  ok('geri al: veritabanı eski hâlinde', d.db === once && d.ikey === 0 && d.m4 === 25000 && d.e === null && d.imp === 0, d);

  await E(() => { const b = __T.S.buckets['2026-10'].find(t => t.id === 'm2'); return __T.handleAct('txEdit', { id: 'm2' }); });
  await page.fill('#e2', '2026-11-02'); await E(() => __T.handleAct('txEditSave', { id: 'm2' })); await page.waitForFunction(() => !document.querySelector('.scrim')); await page.waitForTimeout(100);
  d = await E(() => ({ eki: __docs['tx/2026-10'].items.filter(t => t.id === 'm2').length, kas: __docs['tx/2026-11'].items.filter(t => t.id === 'm2').length, tak: __docs['tx/2026-11'].items.filter(t => t.installment).length }));
  ok('kaydı başka aya taşımak: eski aydan çıktı, yeni aya yazıldı, o aydaki taksit duruyor', d.eki === 0 && d.kas === 1 && d.tak === 1, d);
  ok('hata yok', errs.length === 0, errs.slice(0, 3));
  console.log('\n' + (n - bad) + '/' + n + ' geçti'); await br.close(); srv.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
