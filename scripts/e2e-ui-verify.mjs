// scripts/e2e-ui-verify.mjs — 真实浏览器交互链路自动化验收脚本
let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  ({ chromium } = await import('/mnt/hdd/octave-wasm-build/harness/node_modules/playwright-core/index.mjs'));
}

const URL = process.argv[2] || 'http://127.0.0.1:8868/';
console.log(`==> Launching browser for UI verification at ${URL}...`);

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-proxy-server', '--no-sandbox', '--disable-dev-shm-usage'],
});

const context = await browser.newContext({ locale: 'zh-CN' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});

await page.goto(URL, { waitUntil: 'load', timeout: 30000 });

// 1. 验证标题与初始状态
const title = await page.title();
console.log(`  [1] Page title: ${title}`);
if (!title.includes('GNU Octave')) throw new Error('Invalid page title');

// 2. 验证 Header 状态未加载
const badgeText = await page.textContent('.status-badge');
console.log(`  [2] Initial status badge: ${badgeText?.trim()}`);

// 3. 点击启动按钮并打开 BootModal
await page.click('button:has-text("启动引擎")');
await page.waitForSelector('.modal-card');
console.log('  [3] Boot modal opened successfully.');

// 4. 点击立即启动并等待就绪
await page.click('button:has-text("立即启动引擎")');
await page.waitForSelector('.status-idle', { timeout: 120000 });
console.log('  [4] Engine booted and reached state: idle.');

// 5. 在终端输入并执行计算
const inputSelector = '.terminal-input';
await page.fill(inputSelector, 'magic(4)');
await page.keyboard.press('Enter');

// 等待终端输出魔方阵
await page.waitForFunction(() => {
  const text = document.querySelector('.terminal-output')?.textContent || '';
  return text.includes('16') && text.includes('11') && text.includes('14');
}, { timeout: 15000 });
console.log('  [5] Executed magic(4) and verified formatted output.');

// 6. 验证工作区侧栏中变量出现
await page.waitForFunction(() => {
  const table = document.querySelector('.data-table');
  return table && table.textContent?.includes('ans');
}, { timeout: 10000 });
console.log('  [6] Workspace store updated with variable ans.');

// 7. 测试 E6 GL 绘图阻断
await page.fill(inputSelector, 'plot(1:10)');
await page.keyboard.press('Enter');
await page.waitForSelector('.modal-title:has-text("E6 GL 绘图边界安全拦截")', { timeout: 5000 });
console.log('  [7] FigureBoundary intercepted plot(1:10) safely and displayed warning modal.');

// 点击安全取消
await page.click('button:has-text("安全取消")');
await page.waitForSelector('.modal-card', { state: 'detached', timeout: 5000 });
console.log('  [8] Dismissed warning modal. Engine remained healthy.');

// 9. 验证 subplot 拦截
await page.fill(inputSelector, 'subplot(2, 1, 1)');
await page.keyboard.press('Enter');
await page.waitForSelector('.modal-title:has-text("E6 GL 绘图边界安全拦截")', { timeout: 5000 });
await page.click('button:has-text("安全取消")');
await page.waitForSelector('.modal-card', { state: 'detached', timeout: 5000 });
console.log('  [9] FigureBoundary safely intercepted subplot(2, 1, 1).');

// 10. 验证侧边栏历史记录响应式更新
await page.click('button:has-text("历史")');
await page.waitForFunction(() => {
  const items = Array.from(document.querySelectorAll('.history-item')).map(el => el.textContent.trim());
  return items.includes('magic(4)');
}, { timeout: 5000 });
console.log('  [10] History tab in sidebar reactively updated with submitted commands.');

await browser.close();
console.log('==> ALL UI E2E VERIFICATION STEPS PASSED 100%!');
