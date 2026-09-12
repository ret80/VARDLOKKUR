/* Диагностика: почему draw calls = 0. Инструментируем батчеры и pipeline. */
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const logs = [];
  page.on('console', (msg) => logs.push(msg.text().slice(0, 220)));

  await page.goto('http://localhost:3000/VARDLOKKUR/?debug', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(10000);

  // Проверяем состояние изнутри: canvas, размер drawing buffer, screen state
  const diag = await page.evaluate(() => {
    const out = {};
    const canvases = [...document.querySelectorAll('canvas')];
    out.canvases = canvases.map((c) => ({
      w: c.width, h: c.height,
      styleW: c.style.width, styleH: c.style.height,
      visible: !!(c.offsetWidth && c.offsetHeight),
      inViewport: c.getBoundingClientRect().width > 0,
    }));
    return out;
  });
  console.log('DIAG:', JSON.stringify(diag, null, 1));

  // Фильтруем важные логи
  const interesting = logs.filter((l) =>
    l.includes('render') || l.includes('flush') || l.includes('batcher') ||
    l.includes('pipeline') || l.includes('screen') || l.includes('play') ||
    l.includes('tick') || l.includes('error') || l.includes('Error')
  );
  console.log('INTERESTING LOGS (' + interesting.length + '):');
  for (const l of [...new Set(interesting)].slice(0, 30)) console.log(' ', l);
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
