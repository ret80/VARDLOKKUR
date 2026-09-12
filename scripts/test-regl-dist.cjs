/* Сравнение: regl из Vite-оптимизированных deps против чистого dist/regl.js */
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/VARDLOKKUR/', { waitUntil: 'load', timeout: 30000 });

  const result = await page.evaluate(async () => {
    const log = [];
    const VERT = [
      'precision mediump float;',
      'attribute vec2 p;',
      'uniform mat4 m;',
      'void main(){ gl_Position = m * vec4(p,0.0,1.0); }',
    ].join('\n');
    const FRAG = 'precision mediump float; void main(){ gl_FragColor = vec4(1.0); }';
    const TRI = new Float32Array([0, 0, 1, 0, 0, 1]);
    const M4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

    const testWith = (REGL, label) => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        document.body.appendChild(canvas);
        const regl = REGL({ canvas });
        const cmd = regl({
          vert: VERT, frag: FRAG,
          attributes: { p: new Float32Array(0) },
          count: 0,
          uniforms: { m: regl.prop('m') },
          depth: { enable: false },
        });
        cmd({ attributes: { p: TRI }, count: 3, props: { m: M4 } });
        log.push(label + ': OK');
      } catch (e) { log.push(label + ' FAIL: ' + e.message.slice(0, 140)); }
    };

    // 1. Чистый UMD dist/regl.js через script-тег
    await new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = '/VARDLOKKUR/node_modules/regl/dist/regl.js';
      s.onload = resolve;
      s.onerror = () => { log.push('dist script load FAILED'); resolve(); };
      document.head.appendChild(s);
    });
    if (window.createREGL) testWith(window.createREGL, 'DIST UMD');

    // 2. Vite-оптимизированные deps
    try {
      const mod = await import('/VARDLOKKUR/node_modules/.vite/deps/regl.js?v=f9b13b96');
      testWith(mod.default, 'VITE DEPS');
    } catch (e) { log.push('vite import failed: ' + e.message); }

    return log;
  });

  console.log(result.join('\n'));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
