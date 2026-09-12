/* Финальная проверка: скриншот через CDP (захватывает WebGL корректно) */
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message.slice(0, 300)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text().slice(0, 300)); });

  await page.goto('http://localhost:3000/VARDLOKKUR/?debug', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(3000); // Раньше смерти игрока

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.enable');
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  require('fs').writeFileSync('/tmp/game-final.png', Buffer.from(data, 'base64'));

  // Анализ пикселей скриншота в браузере
  const stats = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await new Promise((r) => { img.onload = r; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let nonBg = 0;
    const total = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      // фон ~ [5,8,13]; считаем пиксели заметно светлее
      if (d[i] + d[i + 1] + d[i + 2] > 60) nonBg++;
    }
    return { w: img.width, h: img.height, nonBg, total, pct: ((nonBg / total) * 100).toFixed(2) + '%' };
  }, data);
  console.log('SCREENSHOT:', JSON.stringify(stats));
  console.log('ERRORS:', errors.length ? [...new Set(errors)].slice(0, 3).join(' | ') : 'none');
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
