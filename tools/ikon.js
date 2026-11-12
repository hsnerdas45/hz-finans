/* Uygulama simgelerini üretir (bir kez): node tools/ikon.js → ikon-180/192/512.png */
const { chromium } = require('playwright');
const path = require('path');
const svg = s => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 100 100">
<rect width="100" height="100" fill="#B07A1E"/>
<text x="50" y="69" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="58" fill="#FFF8EC">₺</text></svg>`;
(async () => {
  const br = await chromium.launch(); const p = await br.newPage();
  for (const s of [180, 192, 512]) {
    await p.setViewportSize({ width: s, height: s });
    await p.setContent('<html><body style="margin:0">' + svg(s) + '</body></html>');
    await p.screenshot({ path: path.join(__dirname, '..', 'ikon-' + s + '.png'), clip: { x: 0, y: 0, width: s, height: s } });
  }
  await br.close(); console.log('simgeler hazır');
})();
