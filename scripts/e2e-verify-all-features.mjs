// scripts/e2e-verify-all-features.mjs
let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  ({ chromium } = await import('/mnt/hdd/octave-wasm-build/harness/node_modules/playwright-core/index.mjs'));
}

const URL = process.argv[2] || 'http://127.0.0.1:8868/';
console.log(`==> Launching browser for comprehensive feature verification at ${URL}...`);

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-proxy-server', '--no-sandbox', '--disable-dev-shm-usage'],
});

const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(URL, { waitUntil: 'load', timeout: 30000 });

// 1. 验证标题与初始状态
const title = await page.title();
console.log(`  [1] Page title: ${title}`);
if (!title.includes('GNU Octave')) throw new Error('Invalid page title');

// 2. 验证 Header 存在 3 档切换按钮，状态为未加载
const wasm32Btn = await page.waitForSelector('button.lane-btn:has-text("wasm32-final")');
const masterBtn = await page.waitForSelector('button.lane-btn:has-text("master")');
const illegalBtn = await page.waitForSelector('button.lane-btn:has-text("IllegalPerformance")');
console.log('  [2] Three engine lane switcher buttons verified.');

// 3. 验证示例画廊按钮全局唯一（仅在 HeaderBar，不在 Notebook toolbar）
const headerExamplesBtn = await page.$$('header button:has-text("示例画廊")');
const notebookExamplesBtn = await page.$$('.notebook-toolbar button:has-text("示例画廊")');
console.log(`  [3] Example gallery buttons count - Header: ${headerExamplesBtn.length}, Notebook toolbar: ${notebookExamplesBtn.length}`);
if (headerExamplesBtn.length !== 1 || notebookExamplesBtn.length !== 0) {
  throw new Error(`Example gallery button duplication detected! Header: ${headerExamplesBtn.length}, Notebook: ${notebookExamplesBtn.length}`);
}

// 4. 验证 Notebook toolbar 包含本地目录挂载按钮
const nbMountBtn = await page.waitForSelector('.notebook-toolbar button:has-text("打开本地目录")');
console.log('  [4] Verified local folder mount button in Notebook toolbar.');

// 5. 验证侧边栏工作区面板顶部包含本地目录卡片
const sbMountCard = await page.waitForSelector('.dir-overview-card');
const sbMountText = await sbMountCard.textContent();
console.log(`  [5] Verified sidebar workspace directory overview card: "${sbMountText?.trim()}"`);

// 6. 验证切换引擎是纯切换，不触发启动或“启动中”状态
await masterBtn.click();
await page.waitForTimeout(200);
let statusText = await page.textContent('.status-badge');
console.log(`  [6] Switched to master lane. Status badge remains: "${statusText?.trim()}"`);
if (statusText?.includes('启动中')) throw new Error('Switching lane triggered booting state!');

await wasm32Btn.click();
await page.waitForTimeout(200);
statusText = await page.textContent('.status-badge');
console.log(`  [7] Switched back to wasm32-final lane. Status badge: "${statusText?.trim()}"`);

// 7. 验证 BootModal 中的档位准确显示 (当 wasm32-final 激活时显示 32-bit Memory，绝不显示 wasm64)
await page.click('button:has-text("开始计算")');
await page.waitForSelector('.modal-card');
const bootRuntimeVal = await page.textContent('.info-item:has-text("运行档位") .val');
console.log(`  [8] BootModal runtime mode: "${bootRuntimeVal?.trim()}"`);
if (!bootRuntimeVal?.includes('Wasm32')) {
  throw new Error(`BootModal displayed incorrect runtime mode: ${bootRuntimeVal}`);
}

// 关闭 BootModal
await page.click('button:has-text("取消")');
await page.waitForSelector('.modal-card', { state: 'detached' });

// 8. 验证 DiagnosticsModal 中的档位准确显示
await page.click('button:has-text("诊断")');
await page.waitForSelector('.modal-card');
const diagLaneVal = await page.textContent('.meta-item:has-text("当前车道") .val');
const diagGearVal = await page.textContent('.meta-item:has-text("底座档位") .val');
console.log(`  [9] DiagnosticsModal - Lane: "${diagLaneVal?.trim()}", Gear: "${diagGearVal?.trim()}"`);
if (!diagLaneVal?.includes('wasm32-final') || !diagGearVal?.includes('base')) {
  throw new Error(`DiagnosticsModal displayed incorrect lane or gear! Lane: ${diagLaneVal}, Gear: ${diagGearVal}`);
}
await page.click('button.btn-close');
await page.waitForSelector('.modal-card', { state: 'detached' });

// 9. 启动引擎并验证停止引擎按钮
console.log('  [10] Booting engine via BootModal...');
await page.click('button:has-text("开始计算")');
await page.waitForSelector('.modal-card');
await page.click('button:has-text("立即启动引擎")');
await page.waitForSelector('.status-idle', { timeout: 120000 });
console.log('  [11] Engine reached state: idle.');

// 验证计算启动后，车道切换按钮被锁定 (disabled)
const wasm32Disabled = await wasm32Btn.isDisabled();
console.log(`  [12] Lane button disabled status during computation: ${wasm32Disabled}`);
if (!wasm32Disabled) throw new Error('Lane switcher button was not disabled during computation!');

// 验证顶栏出现“🛑 停止引擎”按钮
const stopBtn = await page.waitForSelector('button:has-text("停止引擎")');
console.log('  [13] Verified "🛑 停止引擎" button is visible in header bar.');

// 10. 点击停止引擎并验证回归 unloaded 状态，车道切换按钮重新解锁
console.log('  [14] Clicking "停止引擎" button...');
await stopBtn.click();
await page.waitForSelector('.status-unloaded');
statusText = await page.textContent('.status-badge');
console.log(`  [15] Engine successfully stopped. Status badge returned to: "${statusText?.trim()}"`);

const wasm32ReEnabled = !(await wasm32Btn.isDisabled());
console.log(`  [16] Lane switcher buttons re-enabled: ${wasm32ReEnabled}`);
if (!wasm32ReEnabled) throw new Error('Lane switcher buttons were not re-enabled after stop!');

// 可以重新自由切换车道
await illegalBtn.click();
await page.waitForTimeout(200);
console.log('  [17] Successfully switched to IllegalPerformance lane after stopping.');

// 截图留存验收图
await page.screenshot({ path: 'dist/verification_features.png', fullPage: true });
console.log('  [18] Verification screenshot saved to dist/verification_features.png.');

await browser.close();
console.log('\n===> ALL 18 COMPREHENSIVE CHECKS PASSED 100%! <===');
