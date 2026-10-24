// tests/ui/HeaderBar.svelte.test.ts
// spec #19 红线 2：「⚠ 已损坏」徽标渲染态。
//
// 判据全部落在用户可见的 DOM 上（不复钓私有字段）：
//   · corrupted ⇒ 徽标含 ⚠ 与「已损坏」三语文案，且**不含 ✓**（056 复钓原始判据）；
//   · verified / unchecked+downloaded ⇒ ✓ 已下载；
//   · 未下载 ⇒ 下载按钮，无任何 dl-status 徽标。
//
// 手法与 PackageManagerModal.svelte.test.ts 同款：mock 组合根 appContext
// （真引擎/真 DownloadStore 在组件测试里只会拖入无关依赖），i18n 用真单例
// （三语本来就是被测对象）。EngineAssetResolver 走它自己公开的注入缝
// setInstance（tests/engine/OmcBridge.test.ts 的既有用法），不 mock 整个模块。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, tick } from 'svelte';

// ── mock 组合根（appContext）：HeaderBar 消费面全部替换为测试替身 ─────────────
// i18n 用真 I18nManager（三语 t() 是要测的对象），locale 由 setLocale 驱动。
const { i18n, t } = await import('../../src/modules/i18n/I18nManager.svelte');

const unsub = () => {};

vi.mock('../../src/modules/appContext', () => ({
  supervisor: {
    state: 'unloaded',
    onStateChange: () => unsub,
    abort: () => {},
    kill: () => {},
    recover: async () => {},
  },
  themeManager: {
    theme: 'dark',
    hue: 315,
    fontSize: 14,
    subscribe: () => unsub,
    setTheme: () => {},
    setHue: () => {},
    resetHue: () => {},
    setFontSize: () => {},
    resetFontSize: () => {},
  },
  downloadStore: {
    isEngineDownloading: () => false,
    downloadEngine: async () => ({}),
    removeEngine: async () => {},
  },
  projectWorkspace: {
    mode: 'notebook',
    activeLane: 'wasm32-final',
    // 关掉 OMC 勾选：勾选框里的 ✓ 与徽标 ✓ 不同源，避免反向断言被误伤
    isOmcEnabled: false,
    isDirectoryMounted: false,
    directoryName: null,
    subscribe: () => unsub,
    selectLane: () => {},
    toggleOmc: () => {},
    setMode: () => {},
    stopEngine: () => {},
    reselectDirectory: async () => {},
    disconnectDirectory: () => {},
  },
  i18n,
  t,
  toastService: {
    show: () => 'toast_mock_id',
    success: () => 'toast_mock_id',
    info: () => 'toast_mock_id',
    warning: () => 'toast_mock_id',
    error: () => 'toast_mock_id',
    dismiss: () => {},
    clear: () => {},
    toasts: [],
  },
}));

const HeaderBar = (await import('../../src/components/HeaderBar.svelte')).default;
const { EngineAssetResolver } = await import('../../src/modules/engine/EngineAssetResolver');

type Integrity = 'verified' | 'corrupted' | 'unchecked';

// 每个 lane 的对账结果：测试按需改写，resolver 替身只做搬运
let statusByLane: Record<string, { downloaded: boolean; integrity: Integrity }> = {};

const resolverDouble = {
  checkPhysicalStatus: async (lane: string) => {
    const s = statusByLane[lane] ?? { downloaded: false, integrity: 'unchecked' as Integrity };
    return {
      lane,
      downloaded: s.downloaded,
      integrity: s.integrity,
      variant: 'w32',
      totalBytes: 0,
      verifiedAt: 0,
    };
  },
};

function setAllLanes(downloaded: boolean, integrity: Integrity) {
  statusByLane = {};
  for (const lane of ['wasm32-final', 'master', 'IllegalPerformance', 'omc']) {
    statusByLane[lane] = { downloaded, integrity };
  }
}

function mountHeader() {
  const target = document.createElement('div');
  document.body.appendChild(target);
  let component: any;
  // 与 ToastContainer.svelte.test.ts 同款：mount 放进 effect root，卸载时一起清
  const cleanup = $effect.root(() => {
    component = mount(HeaderBar, {
      target,
      props: {
        onOpenBootModal: () => {},
        onOpenExamples: () => {},
        onOpenDiagnostics: () => {},
      },
    });
  });
  return { target, component, cleanup };
}

function teardown(ctx: ReturnType<typeof mountHeader>) {
  if (ctx.component) unmount(ctx.component);
  ctx.cleanup();
  ctx.target.remove();
}

// 排空 checkAllPhysicalStatus 的 4 个 promise + 渲染
async function flush() {
  await tick();
  await new Promise((r) => setTimeout(r, 0));
  await tick();
}

// 徽标只在 ⋮ 菜单展开时渲染
async function openMenu(target: HTMLElement) {
  const btn = target.querySelector('.menu-toggle-btn') as HTMLButtonElement;
  expect(btn).not.toBeNull();
  btn.click();
  await flush();
}

// 所有 dl-status 徽标的可见文本（3 个 Octave 档 + OMC 档）
function badgeTexts(target: HTMLElement): string[] {
  return Array.from(target.querySelectorAll('.lane-meta-row .dl-status')).map(
    (el) => (el.textContent || '').trim()
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
  i18n.setLocale('en');
  statusByLane = {};
  EngineAssetResolver.setInstance(resolverDouble as any);
});

afterEach(() => {
  EngineAssetResolver.resetInstance();
});

describe('HeaderBar 引擎徽标三态（spec #19 红线 2）', () => {
  it('verified ⇒ 每档都是 ✓ 已下载，无 ⚠', async () => {
    setAllLanes(true, 'verified');
    const ctx = mountHeader();
    await flush();
    await openMenu(ctx.target);

    const badges = badgeTexts(ctx.target);
    expect(badges.length).toBe(4); // 3 Octave lanes + OMC
    for (const text of badges) {
      expect(text).toContain('✓');
      expect(text).toContain('Downloaded');
      expect(text).not.toContain('⚠');
    }
    expect(ctx.target.querySelector('.dl-status.damaged')).toBeNull();

    teardown(ctx);
  });

  it('corrupted ⇒ ⚠ Corrupted，且不含 ✓（056 复钓原始判据）', async () => {
    setAllLanes(true, 'corrupted');
    const ctx = mountHeader();
    await flush();
    await openMenu(ctx.target);

    const badges = badgeTexts(ctx.target);
    expect(badges.length).toBe(4);
    for (const text of badges) {
      expect(text).toContain('⚠');
      expect(text).toContain('Corrupted');
      // 反向断言：布尔塌缩回归（只取 downloaded）会让这条立刻红
      expect(text).not.toContain('✓');
    }
    expect(ctx.target.querySelectorAll('.dl-status.damaged').length).toBe(4);
    expect(ctx.target.querySelector('.dl-status.downloaded')).toBeNull();
    // 可访问性：文字不能被 aria-hidden 包住（状态不能只靠字形/颜色传达）
    for (const el of Array.from(ctx.target.querySelectorAll('.dl-status.damaged'))) {
      expect(el.closest('[aria-hidden="true"]')).toBeNull();
      expect(el.getAttribute('aria-hidden')).toBeNull();
    }

    teardown(ctx);
  });

  it('未下载 ⇒ 下载按钮，无任何徽标', async () => {
    setAllLanes(false, 'unchecked');
    const ctx = mountHeader();
    await flush();
    await openMenu(ctx.target);

    expect(badgeTexts(ctx.target)).toEqual([]);
    expect(ctx.target.querySelectorAll('.btn-dl-action.download').length).toBe(4);
    expect(ctx.target.querySelector('.dl-status.damaged')).toBeNull();

    teardown(ctx);
  });

  it('unchecked + downloaded（存在但无账可对）⇒ 仍显示 ✓，不误报损坏', async () => {
    setAllLanes(true, 'unchecked');
    const ctx = mountHeader();
    await flush();
    await openMenu(ctx.target);

    const badges = badgeTexts(ctx.target);
    expect(badges.length).toBe(4);
    for (const text of badges) {
      expect(text).toContain('✓');
      expect(text).not.toContain('⚠');
    }
    expect(ctx.target.querySelector('.dl-status.damaged')).toBeNull();

    teardown(ctx);
  });

  it('downloaded:false + integrity:corrupted（防御态）⇒ 仍以 integrity 为准显示 ⚠', async () => {
    // 引擎层不会产出这个组合（未下载 ⇒ integrity 必为 unchecked）；这里钉的是
    // 「徽标以 integrity 为唯一真源」——若 UI 又把判断塌缩回 downloaded 布尔，这条即红。
    setAllLanes(false, 'corrupted');
    const ctx = mountHeader();
    await flush();
    await openMenu(ctx.target);

    const badges = badgeTexts(ctx.target);
    expect(badges.length).toBe(4);
    for (const text of badges) {
      expect(text).toContain('⚠');
      expect(text).not.toContain('✓');
    }

    teardown(ctx);
  });

  it('三语：corrupted 徽标随 locale 切换（zh-Hans / en / de）', async () => {
    setAllLanes(true, 'corrupted');
    const ctx = mountHeader();
    await flush();
    await openMenu(ctx.target);

    const expected: Array<['zh-Hans' | 'en' | 'de', string]> = [
      ['zh-Hans', '已损坏'],
      ['en', 'Corrupted'],
      ['de', 'Beschädigt'],
    ];
    for (const [locale, word] of expected) {
      i18n.setLocale(locale);
      await flush();
      const badges = badgeTexts(ctx.target);
      expect(badges.length).toBe(4);
      for (const text of badges) {
        expect(text).toContain('⚠');
        expect(text).toContain(word);
        expect(text).not.toContain('✓');
      }
    }

    teardown(ctx);
  });
});
