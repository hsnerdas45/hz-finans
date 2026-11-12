/* Yerel önizleme: npm run serve  →  http://localhost:5173 */
const http = require('http'), fs = require('fs'), path = require('path');
const KOK = path.join(__dirname, '..', process.argv[2] || '.'), PORT = +process.env.PORT || 5173;
const TUR = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' };
http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
  const f = path.join(KOK, path.normalize(u).replace(/^(\.\.[\/\\])+/, ''));
  if (!f.startsWith(KOK)) { r.writeHead(403); return r.end(); }
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end('yok'); }
    r.writeHead(200, { 'content-type': TUR[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
}).listen(PORT, () => console.log('H&Z Finans → http://localhost:' + PORT + '  (' + path.relative(process.cwd(), KOK) + ')'));
