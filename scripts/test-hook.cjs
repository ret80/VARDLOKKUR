/* Проверка хука + прямого вызова drawArrays в странице */
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(() => {
    window.__draws = { arrays: 0, elements: 0, hooked: [] };
    for (const name of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
      const proto = window[name] && window[name].prototype;
      if (!proto) continue;
      window.__draws.hooked.push(name);
      const wrap = (fn, key) => function (...a) { window.__draws[key]++; return fn.apply(this, a); };
      proto.drawArrays = wrap(proto.drawArrays, 'arrays');
      proto.drawElements = wrap(proto.drawElements, 'elements');
    }
  });

  await page.goto('http://localhost:3000/VARDLOKKUR/?debug', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(6000);

  const res = await page.evaluate(() => {
    // Прямой тест: создаём свой контекст и рисуем
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const before = JSON.stringify(window.__draws);
    if (gl) {
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    const after = JSON.stringify(window.__draws);
    return { before, after, glType: gl ? gl.constructor.name : 'none' };
  });
  console.log('HOOK TEST:', JSON.stringify(res, null, 1));

  await page.waitForTimeout(2000);
  const s = await page.evaluate(() => window.__draws);
  console.log('DRAWS after 8s:', JSON.stringify(s));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
