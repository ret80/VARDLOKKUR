/* Проверка: синий ли экран (clear работает?) */
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:3000/VARDLOKKUR/?debug', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(8000);

  const res = await page.evaluate(() => {
    const regl = window.__REGL_DEBUG;
    if (!regl) return { error: 'no regl' };
    const gl = regl._gl;
    // Читаем пиксель из центра drawing buffer
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(4);
    // preserveDrawingBuffer=false — читаем сразу после кадра через regl.draw
    // Проще: читаем через 2D-снимок canvas нельзя (WebGL). Используем gl.readPixels сразу после clear
    regl.clear({ color: [0.1, 0.3, 1.0, 1.0], depth: 1 });
    gl.readPixels(w >> 1, h >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { pixel: [...px], size: [w, h] };
  });
  console.log('CLEAR TEST:', JSON.stringify(res));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
