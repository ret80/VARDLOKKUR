/* Скриншот игры + проверка пикселей canvas */
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const logs = [];
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('[render]') || msg.type() === 'error') logs.push(t.slice(0, 200));
  });

  await page.goto('http://localhost:3000/VARDLOKKUR/?debug', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(15000);
  const shot = await page.screenshot({ encoding: 'base64', clip: { x: 100, y: 100, width: 400, height: 400 }, timeout: 20000 });

  // Анализ скриншота внутри браузера (WebGL canvas нельзя читать напрямую)
  const stats = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await new Promise((r) => { img.onload = r; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let nonBlack = 0, sum = 0;
    const total = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] + d[i + 1] + d[i + 2];
      sum += v;
      if (v > 30) nonBlack++;
    }
    const canvases = [...document.querySelectorAll('canvas')].map((cv) => ({
      w: cv.width, h: cv.height, id: cv.id || cv.className.slice(0, 40),
    }));
    return { imgW: img.width, imgH: img.height, nonBlack, total, avgBrightness: (sum / total).toFixed(1), canvases };
  }, shot);

  console.log('SCREENSHOT:', JSON.stringify(stats, null, 1));
  const uniq = [...new Set(logs)];
  console.log('LOGS (' + uniq.length + '):');
  for (const l of uniq.slice(0, 12)) console.log(' ', l);
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
