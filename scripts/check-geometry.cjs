/* Проверка: занимает ли game-canvas всё окно (геометрия DOM) */
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:3000/VARDLOKKUR/?debug', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(5000);

  const geo = await page.evaluate(() => {
    // Game canvas — первый большой canvas в хосте
    const canvases = [...document.querySelectorAll('canvas')];
    return canvases.map((c) => {
      const r = c.getBoundingClientRect();
      return {
        w: c.width, h: c.height,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        styleW: c.style.width || '(css class)',
      };
    });
  });
  console.log('CANVAS GEOMETRY:', JSON.stringify(geo, null, 1));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
