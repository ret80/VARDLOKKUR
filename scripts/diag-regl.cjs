/* Глубокая диагностика regl: stats, gl state, ручной flush */
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const logs = [];
  page.on('console', (msg) => logs.push(msg.text().slice(0, 200)));
  page.on('pageerror', (err) => logs.push('PAGEERROR: ' + err.message));

  await page.goto('http://localhost:3000/VARDLOKKUR/?debug', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(8000);

  const res = await page.evaluate(() => {
    const regl = window.__REGL_DEBUG;
    if (!regl) return { error: 'no regl exposed' };
    const gl = regl._gl;
    // Оборачиваем методы прямо на инстансе контекста
    window.__inst = { arrays: 0, elements: 0 };
    const oa = gl.drawArrays.bind(gl), oe = gl.drawElements.bind(gl);
    gl.drawArrays = function (...a) { window.__inst.arrays++; return oa(...a); };
    gl.drawElements = function (...a) { window.__inst.elements++; return oe(...a); };
    return {
      hasGl: !!gl,
      drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      protoHasHook: gl.drawArrays.toString().includes('__inst'),
    };
  });
  console.log('WRAPPED:', JSON.stringify(res));
  await page.waitForTimeout(3000);
  const counts = await page.evaluate(() => window.__inst);
  console.log('INSTANCE DRAWS after 3s:', JSON.stringify(counts));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
