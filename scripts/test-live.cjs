/* Скриншот живой игры: синий экран = цикл работает */
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const logs = [];
  page.on('console', (msg) => logs.push(msg.text().slice(0, 150)));

  await page.goto('http://localhost:3000/VARDLOKKUR/?debug', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(6000);

  // Читаем пиксели canvas напрямую каждый раз после clear внутри rAF-цикла
  const samples = await page.evaluate(async () => {
    const regl = window.__REGL_DEBUG;
    if (!regl) return { error: 'no regl' };
    const gl = regl._gl;
    const px = new Uint8Array(4);
    const out = [];
    // Сэмплируем 5 раз с интервалом 300мс прямо из drawing buffer
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 300));
      gl.readPixels(gl.drawingBufferWidth >> 1, gl.drawingBufferHeight >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      out.push([...px]);
    }
    return out;
  });
  console.log('PIXEL SAMPLES:', JSON.stringify(samples));

  const flushCount = logs.filter((l) => l.includes('flush')).length;
  const diedCount = logs.filter((l) => l.includes('DIED')).length;
  console.log('flush logs:', flushCount, '| DIED logs:', diedCount);
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
