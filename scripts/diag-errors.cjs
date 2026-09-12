/* Полный дамп ошибок после фикса uniform */
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (err) => errs.push('PAGEERROR: ' + err.stack));
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') errs.push(msg.type().toUpperCase() + ': ' + msg.text());
  });

  await page.goto('http://localhost:3000/VARDLOKKUR/?debug', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(10000);

  console.log('ERRORS (' + errs.length + '):');
  for (const e of [...new Set(errs)].slice(0, 10)) console.log('---\n' + e.slice(0, 1500));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
