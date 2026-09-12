/* Проверка HP игрока и причин мгновенной смерти */
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const logs = [];
  page.on('console', (msg) => logs.push(msg.text().slice(0, 250)));

  await page.goto('http://localhost:3000/VARDLOKKUR/?debug', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(4000); // До смерти

  // Через debug-server геттеры недоступны напрямую, но можно вызвать через window
  const state1 = await page.evaluate(() => {
    const eng = window.__ENGINE__ || window.engine;
    return { hasEngine: !!eng };
  });
  console.log('EARLY STATE:', JSON.stringify(state1));

  await page.waitForTimeout(6000); // После смерти
  const deathLogs = logs.filter((l) =>
    l.includes('PLAYER DIED') || l.includes('life') || l.includes('died') ||
    l.includes('hp=') || l.includes('Health') || l.includes('damage')
  );
  console.log('DEATH LOGS (' + deathLogs.length + '):');
  for (const l of [...new Set(deathLogs)].slice(0, 20)) console.log(' ', l);

  const allLogs = logs.filter((l) => l.includes('screen') || l.includes('state'));
  console.log('SCREEN LOGS:');
  for (const l of [...new Set(allLogs)].slice(0, 15)) console.log(' ', l);
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
