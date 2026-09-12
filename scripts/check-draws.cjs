/* Счётчик WebGL draw calls через инъекцию перед загрузкой страницы */
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
  page.on('console', (msg) => errors.push(msg.type().toUpperCase() + ': ' + msg.text().slice(0, 200)));

  await page.addInitScript(() => {
    window.__draws = { arrays: 0, elements: 0, instanced: 0, hooked: [] };
    for (const name of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
      const proto = window[name] && window[name].prototype;
      if (!proto) continue;
      window.__draws.hooked.push(name);
      const wrap = (fn, key) => function (...a) { window.__draws[key]++; return fn.apply(this, a); };
      proto.drawArrays = wrap(proto.drawArrays, 'arrays');
      proto.drawElements = wrap(proto.drawElements, 'elements');
      proto.drawArraysInstanced = wrap(proto.drawArraysInstanced, 'instanced');
      proto.drawElementsInstanced = wrap(proto.drawElementsInstanced, 'instanced');
    }
  });

  await page.goto('http://localhost:3000/VARDLOKKUR/?debug', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(12000);

  const s1 = await page.evaluate(() => ({ ...window.__draws }));
  await page.waitForTimeout(2000);
  const s2 = await page.evaluate(() => ({ ...window.__draws }));

  console.log('DRAWS t=12s:', JSON.stringify(s1));
  console.log('DRAWS t=14s:', JSON.stringify(s2));
  console.log('CONSOLE (' + errors.length + '):');
  for (const l of [...new Set(errors)].slice(0, 40)) console.log(' ', l);
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
