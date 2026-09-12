/* Перебор вариантов API regl prop */
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
    const mod = await import('/VARDLOKKUR/node_modules/.vite/deps/regl.js?v=f9b13b96');
    const REGL = mod.default;
    const log = [];
    const mk = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64;
      document.body.appendChild(canvas);
      return REGL({ canvas });
    };
    const VERT = [
      'precision mediump float;',
      'attribute vec2 p;',
      'uniform mat4 m;',
      'void main(){ gl_Position = m * vec4(p,0.0,1.0); }',
    ].join('\n');
    const FRAG = 'precision mediump float; void main(){ gl_FragColor = vec4(1.0); }';
    const TRI = new Float32Array([0, 0, 1, 0, 0, 1]);
    const M4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

    // A: prop в uniforms, БЕЗ начальных attributes/count
    try {
      const regl = mk();
      const cmd = regl({
        vert: VERT, frag: FRAG,
        uniforms: { m: regl.prop('m') },
        depth: { enable: false },
      });
      cmd({ attributes: { p: TRI }, count: 3, props: { m: M4 } });
      log.push('A (prop, no initial attrs): OK');
    } catch (e) { log.push('A FAIL: ' + e.message.slice(0, 120)); }

    // B: prop + начальные attributes как массивы + count:0 (как в примитив-батчере)
    try {
      const regl = mk();
      const cmd = regl({
        vert: VERT, frag: FRAG,
        attributes: { p: new Float32Array(0) },
        count: 0,
        uniforms: { m: regl.prop('m') },
        depth: { enable: false },
      });
      cmd({ attributes: { p: TRI }, count: 3, props: { m: M4 } });
      log.push('B (prop, initial empty attrs + count:0): OK');
    } catch (e) { log.push('B FAIL: ' + e.message.slice(0, 120)); }

    // C: uniforms как функция
    try {
      const regl = mk();
      const cmd = regl({
        vert: VERT, frag: FRAG,
        attributes: { p: new Float32Array(0) },
        count: 0,
        uniforms: { m: (ctx, props) => props.m },
        depth: { enable: false },
      });
      cmd({ attributes: { p: TRI }, count: 3, props: { m: M4 } });
      log.push('C (uniform fn): OK');
    } catch (e) { log.push('C FAIL: ' + e.message.slice(0, 120)); }

    // D: prop, начальные attributes, БЕЗ count в определении
    try {
      const regl = mk();
      const cmd = regl({
        vert: VERT, frag: FRAG,
        attributes: { p: new Float32Array(0) },
        uniforms: { m: regl.prop('m') },
        depth: { enable: false },
      });
      cmd({ attributes: { p: TRI }, count: 3, props: { m: M4 } });
      log.push('D (initial attrs, no count in def): OK');
    } catch (e) { log.push('D FAIL: ' + e.message.slice(0, 120)); }

    return log;
  });

  console.log(result.join('\n'));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
