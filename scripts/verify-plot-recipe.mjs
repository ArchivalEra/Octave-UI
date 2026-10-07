// scripts/verify-plot-recipe.mjs
let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  ({ chromium } = await import('/mnt/hdd/octave-wasm-build/harness/node_modules/playwright-core/index.mjs'));
}

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-proxy-server', '--no-sandbox', '--disable-dev-shm-usage'],
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  locale: 'zh-CN',
});
const page = await context.newPage();

page.on('console', (msg) => {
  console.log(`[BROWSER ${msg.type()}]:`, msg.text());
});
page.on('pageerror', (err) => {
  console.error('[BROWSER PAGE ERROR]:', err);
});

try {
  await page.goto('http://127.0.0.1:8883/', { waitUntil: 'networkidle' });

  console.log('==> Opening Examples Gallery...');
  await page.click('button:has-text("示例画廊")');
  await page.waitForSelector('.gallery-modal');

  console.log('==> Launching Sine Wave Recipe...');
  const tryBtn = page.locator('.recipe-card:has-text("正弦波") button:has-text("加载并运行")');
  await tryBtn.click();

  console.log('==> Waiting for gallery modal to close...');
  await page.waitForSelector('.gallery-modal', { state: 'detached', timeout: 10000 });

  console.log('==> Waiting for plot card to render (up to 45s)...');
  await page.waitForSelector('.plot-card', { timeout: 45000 });

  const pathD = await page.getAttribute('.plot-svg path', 'd');
  console.log('==> SVG Path d attribute starts with:', pathD?.slice(0, 30));

  const warningExists = await page.locator('.modal-title:has-text("E6 GL 绘图边界安全拦截")').count();
  console.log('==> E6 GL Warning Modal count (should be 0):', warningExists);

  await page.screenshot({ path: 'scratch/05-sine-wave-plot.png' });
  console.log('==> Captured scratch/05-sine-wave-plot.png successfully!');
} catch (err) {
  console.error('FAILED during verification:', err);
  await page.screenshot({ path: 'scratch/verify-failure.png' });
} finally {
  await browser.close();
}

