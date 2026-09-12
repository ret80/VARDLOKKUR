/* Временный скрипт: открыть игру в headless Chrome и собрать консольные ошибки */
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') errors.push(text);
  });
  page.on('pageerror', (err) => {
    errors.push('PAGEERROR: ' + err.message + '\n' + (err.stack || '').split('\n').slice(0, 8).join('\n'));
  });

  await page.goto('http://localhost:3000/VARDLOKKUR/?debug', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(15000);

  const uniq = [...new Set(errors)];
  console.log('=== UNIQUE ERRORS (' + uniq.length + ') ===');
  for (const e of uniq.slice(0, 20)) {
    console.log('---');
    console.log(e.slice(0, 2000));
  }
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
