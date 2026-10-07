// scripts/capture-workbench-ui.mjs
let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  ({ chromium } = await import('/mnt/hdd/octave-wasm-build/harness/node_modules/playwright-core/index.mjs'));
}

const URL = process.argv[2] || 'http://127.0.0.1:8883/';
console.log(`==> Launching browser for Workbench verification at ${URL}...`);

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-proxy-server', '--no-sandbox', '--disable-dev-shm-usage'],
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  locale: 'zh-CN',
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});

await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });

// 1. 截图：工作台默认首页 (Notebook 首屏)
console.log('==> Capturing 01-workbench-default.png...');
await page.screenshot({ path: 'scratch/01-workbench-default.png' });

// 2. 打开算法示例画廊
console.log('==> Opening Examples Gallery...');
await page.click('button:has-text("示例画廊")');
await page.waitForSelector('.gallery-modal');
await page.screenshot({ path: 'scratch/02-examples-gallery.png' });

// 关闭画廊
await page.click('.gallery-modal .btn-close');
await page.waitForSelector('.gallery-modal', { state: 'detached' });

// 3. 打开开发诊断弹窗
console.log('==> Opening Diagnostics Modal...');
await page.click('button:has-text("开发诊断")');
await page.waitForSelector('.modal-card');
await page.screenshot({ path: 'scratch/03-diagnostics-modal.png' });

// 关闭诊断弹窗
await page.click('.modal-card .btn-close');
await page.waitForSelector('.modal-card', { state: 'detached' });

// 4. 运行默认单元格并捕获结果
console.log('==> Executing cell...');
await page.click('.btn-run');
// 等待状态变为就绪并产生结果
await page.waitForTimeout(3000);
await page.screenshot({ path: 'scratch/04-workbench-execution.png' });

await browser.close();
console.log('==> Workbench screenshots captured successfully in scratch/!');
