// tests/ui/BootModal.svelte.test.ts — 车道体量显示 = 真源的函数（fix/lane-sizes）
//
// 判据全部落在用户可见的 DOM 上（.info-box 的 Asset Size 行）：
//   · 注入真源变 ⇒ 显示跟着变（显示不是常量——对修复前写死 ~39.3/~40.7 MB 的代码必红）；
//   · 真源缺失 ⇒ 显式降级文案，不出现任何编造数字（无 MB / 无 ~）。
// 手法与 HeaderBar.svelte.test.ts 同款：mock 组合根 appContext，i18n 用真单例。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, tick } from 'svelte';

const { i18n, t } = await import('../../src/modules/i18n/I18nManager.svelte');

const unsub = () => {};
// 活动车道可变（per-lane 断言要换档）
let mockLane = 'wasm32-final';

vi.mock('../../src/modules/appContext', () => ({
  supervisor: {
    state: 'unloaded',
    boot: async () => {},
    onStateChange: () => unsub,
  },
  projectWorkspace: {
    get activeLane() {
      return mockLane;
    },
    isOmcEnabled: false,
    subscribe: () => unsub,
    selectLane: () => {},
  },
  i18n,
  t,
}));

const BootModal = (await import('../../src/components/BootModal.svelte')).default;
const { setLaneSizeBytes } = await import('../../src/modules/engine/laneSizes');

function mountBoot() {
  const target = document.createElement('div');
  document.body.appendChild(target);
  let component: any;
  const cleanup = $effect.root(() => {
    component = mount(BootModal, { target, props: { isOpen: true, onClose: () => {} } });
  });
  return { target, component, cleanup };
}

function teardown(ctx: ReturnType<typeof mountBoot>) {
  if (ctx.component) unmount(ctx.component);
  ctx.cleanup();
  ctx.target.remove();
}

// Asset Size 行的显示值（label 三语形：Asset Size: / 资产体量： / Asset-Größe:）
function sizeValue(target: HTMLElement): string {
  const items = Array.from(target.querySelectorAll('.info-item'));
  const item = items.find((el) =>
    /Asset Size|资产体量|Asset-Größe/.test(el.querySelector('.label')?.textContent || '')
  );
  expect(item, 'Asset Size 行必须存在').toBeDefined();
  return (item!.querySelector('.val')?.textContent || '').trim();
}

beforeEach(() => {
  document.body.innerHTML = '';
  i18n.setLocale('en');
  mockLane = 'wasm32-final';
  setLaneSizeBytes({});
});

afterEach(() => {
  setLaneSizeBytes({});
});

describe('BootModal 车道体量显示（fix/lane-sizes）', () => {
  it('真源变 ⇒ 显示跟着变（同一车道两次注入两次渲染）', async () => {
    setLaneSizeBytes({ 'wasm32-final': 39807224 }); // 实测真值
    let ctx = mountBoot();
    expect(sizeValue(ctx.target)).toBe('~38.0 MB');
    teardown(ctx);

    setLaneSizeBytes({ 'wasm32-final': 5 * 1024 * 1024 }); // 真源换数
    ctx = mountBoot();
    expect(sizeValue(ctx.target)).toBe('~5.0 MB');
    teardown(ctx);
  });

  it('不同车道各自取自己的真源（per-lane 映射，不是单值糊墙）', async () => {
    setLaneSizeBytes({
      'wasm32-final': 1024 * 1024,
      master: 2 * 1024 * 1024,
      IllegalPerformance: 3 * 1024 * 1024,
    });
    for (const [lane, expected] of [
      ['wasm32-final', '~1.0 MB'],
      ['master', '~2.0 MB'],
      ['IllegalPerformance', '~3.0 MB'],
    ] as const) {
      mockLane = lane;
      const ctx = mountBoot();
      expect(sizeValue(ctx.target)).toBe(expected);
      teardown(ctx);
    }
  });

  it('真源缺失 ⇒ 显式降级文案，不编一个数（无 MB、无 ~）', async () => {
    setLaneSizeBytes({}); // 裸构建：什么都没注入
    const ctx = mountBoot();
    const s = sizeValue(ctx.target);
    expect(s).toBe(t('common.asset_size_unavailable'));
    expect(s).not.toMatch(/MB/);
    expect(s).not.toContain('~');
    teardown(ctx);
  });

  it('真源里有该车道但值为 null ⇒ 同样显式降级（不显示 0、不显示 undefined）', async () => {
    setLaneSizeBytes({ 'wasm32-final': null, master: 1024 * 1024 });
    mockLane = 'wasm32-final';
    const ctx = mountBoot();
    const s = sizeValue(ctx.target);
    expect(s).toBe(t('common.asset_size_unavailable'));
    expect(s).not.toBe('~0.0 MB');
    teardown(ctx);
  });

  it('降级文案三语（en / zh-Hans / de）', async () => {
    setLaneSizeBytes({});
    const ctx = mountBoot();
    expect(sizeValue(ctx.target)).toBe('Size data not available');
    i18n.setLocale('zh-Hans');
    await tick();
    expect(sizeValue(ctx.target)).toBe('体量数据缺失');
    i18n.setLocale('de');
    await tick();
    expect(sizeValue(ctx.target)).toBe('Größendaten nicht verfügbar');
    teardown(ctx);
  });
});
