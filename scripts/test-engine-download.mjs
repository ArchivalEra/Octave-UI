// scripts/test-engine-download.mjs
let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  ({ chromium } = await import('/mnt/hdd/octave-wasm-build/harness/node_modules/playwright-core/index.mjs'));
}

const URL = process.argv[2] || 'http://127.0.0.1:8894/repo/Octave/';
console.log(`==> Launching browser for engine download test at ${URL}...`);

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-proxy-server', '--no-sandbox', '--disable-dev-shm-usage'],
});

const context = await browser.newContext({ locale: 'zh-CN' });
const page = await context.newPage();
const pageErrors = [];
const alerts = [];

const t0 = Date.now();
const logT = (tag, ...args) => console.log(`  [+${Date.now() - t0}ms] [${tag}]`, ...args);

page.on('pageerror', (e) => {
  pageErrors.push(e.message || String(e));
  logT('PageError', e.message || e);
});
page.on('crash', () => logT('Page Crashed'));
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    logT('ConsoleError', msg.text());
  }
});
page.on('request', (req) => {
  if (req.url().includes('octave') || req.url().includes('lane')) {
    logT('Req', `${req.method()} ${req.url()}`);
  }
});
page.on('response', (res) => {
  if (res.url().includes('octave') || res.url().includes('lane')) {
    logT('Res', `${res.status()} ${res.url()}`);
  }
});
page.on('requestfailed', (req) => {
  logT('ReqFailed', `${req.url()}: ${req.failure()?.errorText}`);
});
page.on('dialog', async (dialog) => {
  alerts.push(dialog.message());
  logT('Dialog', `${dialog.type()}: ${dialog.message()}`);
  await dialog.accept();
});

logT('Nav', 'Navigating to URL');
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
logT('Nav', 'Navigation finished');

// 1. 打开引擎模式下拉框 (⋮ 菜单)
console.log('  [1] Opening menu via .menu-toggle-btn...');
const menuBtn = await page.waitForSelector('.menu-toggle-btn', { timeout: 10000 });
await menuBtn.click();
await page.waitForSelector('.menu-popover', { timeout: 5000 });

// 2. 找到 wasm32-final 对应的下载按钮
console.log('  [2] Finding wasm32-final download button...');
const downloadButtons = await page.$$('.btn-dl-action.download');
console.log(`  [3] Found ${downloadButtons.length} download buttons.`);
if (downloadButtons.length === 0) {
  // 检查是否已经显示为已下载
  const downloadedBadges = await page.$$('.dl-status.downloaded');
  console.log(`  [3b] Already downloaded badges: ${downloadedBadges.length}`);
} else {
  // 点击第一个下载按钮 (wasm32-final)
  console.log('  [4] Clicking wasm32-final download button...');
  await downloadButtons[0].click();

  // 等待下载状态变化
  console.log('  [5] Waiting for download completion...');
  await page.waitForFunction(() => {
    const el = document.querySelector('.dl-status.downloaded');
    return el && el.textContent.includes('已下载');
  }, null, { timeout: 60000 });
  console.log('  [6] Successfully saw "已下载" badge!');
}

await page.waitForTimeout(500);
await browser.close();

console.log(`  [Result] Alerts popped up: ${JSON.stringify(alerts)}`);
console.log(`  [Result] Page errors: ${JSON.stringify(pageErrors)}`);

if (alerts.length > 0) {
  console.error('FAILED: Dialog alert was triggered:', alerts);
  process.exit(1);
}
if (pageErrors.length > 0) {
  console.error('FAILED: Page errors encountered:', pageErrors);
  process.exit(1);
}

console.log('==> ENGINE DOWNLOAD TEST PASSED 100%!');
