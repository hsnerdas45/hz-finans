/* H&Z Finans derleme — node tools/build.js [--test]

   index.html            GitHub Pages sayfası (depo kökünden yayınlanır; betikler src/ içinden okunur)
   dist/claude-sayfa.html  aynı uygulamanın Claude sayfası sürümü (tek dosya)
   vendor/               PDF, Excel ve Firebase kitaplıklarının yerel kopyası (npm install sonrası;
                         yayında CDN kullanılır, burası yerel geliştirme ve testler içindir)
   --test                tests/site (yerel kip) ve tests/site-fb (sahte Firebase) de üretilir
*/
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const W = (f, s) => { fs.mkdirSync(path.dirname(path.join(ROOT, f)), { recursive: true }); fs.writeFileSync(path.join(ROOT, f), s); };
const VAR = f => fs.existsSync(path.join(ROOT, f));
const TEST = process.argv.includes('--test');
const pkg = JSON.parse(R('package.json'));
const SURUM = pkg.version + '-' + new Date().toISOString().slice(0, 10);
const FIREBASE = '10.14.1';

const shell = R('src/shell.html');
const kes = shell.indexOf('</style>') + '</style>'.length;
const bas = shell.slice(0, kes), govde = shell.slice(kes);
const CEKIRDEK = ['engine.js', 'ekstre.js', 'charts.js'];
const HOOK_A = "buildNav();\nif (!S.config.categories";
const HOOK_B = "window.__T = { S: S, Store: Store, handleAct: handleAct, txAy: txAy, aktifAy: aktifAy, ayRapor: ayRapor, " +
  "ekstreDosyaOku: ekstreDosyaOku, get EX() { return EX; } };\n" + HOOK_A;

function ust(pages) {
  return '<!doctype html>\n<html lang="tr">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' +
    '<meta name="theme-color" content="#B07A1E">\n<meta name="hz-surum" content="' + SURUM + '">\n' +
    (pages ? '<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="ikon-192.png">\n' +
      '<link rel="apple-touch-icon" href="ikon-180.png">\n<meta name="apple-mobile-web-app-capable" content="yes">\n' : '') +
    bas + '\n</head>\n<body>';
}
const alt = sc => govde + '\n' + sc.join('\n') + '\n</body>\n</html>\n';

/* 1) GitHub Pages: index.html (kök) */
const fb = ['app', 'auth', 'firestore'].map(m =>
  '<script src="https://www.gstatic.com/firebasejs/' + FIREBASE + '/firebase-' + m + '-compat.js"></script>');
W('index.html', ust(true) + alt(fb.concat(['<script src="firebase-config.js"></script>'],
  CEKIRDEK.concat(['firebase-giris.js', 'app.js']).map(f => '<script src="src/' + f + '"></script>'))));
W('manifest.webmanifest', JSON.stringify({
  name: 'H&Z Finans', short_name: 'H&Z Finans', lang: 'tr', start_url: './', scope: './', display: 'standalone',
  background_color: '#FAF7F2', theme_color: '#B07A1E',
  icons: [{ src: 'ikon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'ikon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'ikon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
}, null, 2) + '\n');
if (!VAR('.nojekyll')) W('.nojekyll', '');

/* 2) yerel kitaplıklar (npm install yapıldıysa) */
const KITAP = { 'pdf.min.js': 'pdfjs-dist/build/pdf.min.js', 'pdf.worker.min.js': 'pdfjs-dist/build/pdf.worker.min.js',
  'xlsx.full.min.js': 'xlsx/dist/xlsx.full.min.js', 'firebase-app-compat.js': 'firebase/firebase-app-compat.js',
  'firebase-auth-compat.js': 'firebase/firebase-auth-compat.js', 'firebase-firestore-compat.js': 'firebase/firebase-firestore-compat.js' };
for (const [ad, kaynak] of Object.entries(KITAP)) {
  const k = path.join(ROOT, 'node_modules', kaynak);
  if (fs.existsSync(k)) W('vendor/' + ad, fs.readFileSync(k, 'utf8').replace(/\/\/# sourceMappingURL=.*$/m, ''));
}

/* 3) Claude sayfası */
const tek = CEKIRDEK.concat(['app.js']).map(f => {
  const s = R('src/' + f); if (s.includes('</script')) throw new Error(f + ' içinde </script var');
  return '/* ==== ' + f + ' ==== */\n' + s;
}).join('\n');
W('dist/claude-sayfa.html', shell + '\n<script>\n' + tek + '\n</script>\n');

/* 4) test siteleri */
if (TEST) {
  const kanca = s => { if (!s.includes(HOOK_A)) throw new Error('test kancası yerleşmedi'); return s.replace(HOOK_A, HOOK_B); };
  const site = (dir, sc, js) => {
    js.forEach(f => W(dir + '/js/' + f, f === 'app.js' ? kanca(R('src/app.js')) : R('src/' + f)));
    W(dir + '/index.html', ust(false) + alt(['<script>window.HZ_YEREL_KITAPLIK = true;</script>'].concat(sc,
      js.map(f => '<script src="js/' + f + '"></script>'))));
  };
  site('tests/site', [], CEKIRDEK.concat(['app.js']));
  site('tests/site-fb', ['<script src="../sahte-firebase.js"></script>',
    '<script>window.HZ_FIREBASE = { apiKey: "test-key", authDomain: "demo-hz.firebaseapp.com", projectId: "demo-hz", appId: "1:1:web:1" };</script>'],
    CEKIRDEK.concat(['firebase-giris.js', 'app.js']));
}
console.log('derlendi · sürüm ' + SURUM + ' · index.html · dist/claude-sayfa.html' + (TEST ? ' · tests/site*' : ''));
