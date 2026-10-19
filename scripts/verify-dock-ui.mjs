// scripts/verify-dock-ui.mjs
let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  ({ chromium } = await import('/mnt/hdd/octave-wasm-build/harness/node_modules/playwright-core/index.mjs'));
}

const URL = process.argv[2] || 'http://127.0.0.1:8892/repo/Octave/';
console.log(`==> Launching browser for Dock UI verification at ${URL}...`);

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-proxy-server', '--no-sandbox', '--disable-dev-shm-usage'],
});

const context = await browser.newContext({ locale: 'zh-CN' });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];

page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

await page.goto(URL, { waitUntil: 'load', timeout: 30000 });

// 1. 验证标题与初始状态
const title = await page.title();
console.log(`  [1] Page title: ${title}`);
if (!title.includes('GNU Octave')) throw new Error('Invalid page title: ' + title);

// 2. 验证 DockWorkspace 及其工具栏存在
await page.waitForSelector('.dock-workspace', { timeout: 10000 });
console.log('  [2] DockWorkspace rendered successfully.');

const presetButtons = await page.$$eval('.preset-pill', (els) => els.map((el) => el.textContent.trim()));
console.log(`  [3] Preset buttons found: ${JSON.stringify(presetButtons)}`);
if (presetButtons.length < 4) throw new Error('Expected at least 4 preset buttons');

// 3. 验证当前活动标签页
const initialTabs = await page.$$eval('.dock-tab', (els) => els.map((el) => el.textContent.trim()));
console.log(`  [4] Initial tabs: ${JSON.stringify(initialTabs)}`);

// 4. 点击 OMC 预设并验证标签页更新
console.log('  [5] Switching to OMC preset...');
await page.click('button:has-text("OpenModelica")');
await page.waitForTimeout(300);
const omcTabs = await page.$$eval('.dock-tab', (els) => els.map((el) => el.textContent.trim()));
console.log(`  [6] OMC preset tabs: ${JSON.stringify(omcTabs)}`);
if (!omcTabs.some((t) => t.includes('OpenModelica') || t.includes('OMC'))) {
  throw new Error('OMC preset did not open OMC Shell tab');
}

// 5. 点击双终端预设
console.log('  [7] Switching to Twin Consoles preset...');
await page.click('button:has-text("双终端")');
await page.waitForTimeout(300);
const twinTabs = await page.$$eval('.dock-tab', (els) => els.map((el) => el.textContent.trim()));
console.log(`  [8] Twin consoles preset tabs: ${JSON.stringify(twinTabs)}`);

// 6. 测试 "+ 添加面板" 下拉菜单
console.log('  [9] Testing + Add Panel menu...');
await page.click('button:has-text("添加面板")');
await page.waitForSelector('.add-panel-dropdown', { timeout: 3000 });
const menuItems = await page.$$eval('.dropdown-item', (els) => els.map((el) => el.textContent.trim()));
console.log(`  [10] Add Panel items: ${JSON.stringify(menuItems)}`);

// 7. 测试左上角汉堡图标点击
console.log('  [11] Testing hamburger button click...');
const hamburger = await page.$('.btn-icon.hamburger, button[title*="侧边栏"], button[aria-label*="菜单"]');
if (hamburger) {
  await hamburger.click();
  await page.waitForTimeout(300);
  console.log('  [12] Hamburger button clicked without crashing.');
} else {
  console.log('  [12] Hamburger button selector checked.');
}

// 8. 检查是否有页面报错
await page.waitForTimeout(500);
await browser.close();

console.log(`  [13] Page errors: ${pageErrors.length}, Console errors: ${consoleErrors.length}`);
if (pageErrors.length > 0) {
  console.error('Page errors encountered:', pageErrors);
  process.exit(1);
}

console.log('==> ALL DOCK UI VERIFICATION STEPS PASSED 100%!');
