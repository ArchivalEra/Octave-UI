// tests/integration/harness.ts
// 跨模块「调用频率」断言的公共台架（架构批次 #23 / grilling Q1-Q3）。
//
// 为什么需要它：两条自我放大环都是跨模块的——
//   ① D13 环 A：HeaderBar.subscribe → checkPhysicalStatus×4 → storage.list → refresh()
//      → _notify() → ProjectWorkspace.subscribe → 回到起点；
//   ② 候选 1 环 B：idle → syncToEngine → eval(addpath) → idle → syncToEngine → …
// 单测抓不到：HeaderBar 的测试把 resolver 打成替身，环就不存在了；resolver 的测试
// 根本不跑状态机。所以这里的台架必须**用真模块接线**，只在最外层（wasm 适配器 /
// 网络）放替身 —— 替身的位置决定了断言能证明什么。
//
// 计数面一律用**公开接口**（spy 公开方法），不读私有字段：接口是测试面。
//
// 复跑：CI=true npx vitest run tests/integration/

import { vi } from 'vitest';
import { WorkspaceStorageManager } from '../../src/modules/storage/WorkspaceStorageManager';
import { DownloadStore } from '../../src/modules/storage/DownloadStore';
import { ProjectWorkspace } from '../../src/modules/workspace/ProjectWorkspace';
import { EngineSupervisor } from '../../src/modules/engine/EngineSupervisor';
import { MockEmbedAdapter } from '../../src/modules/engine/MockEmbedAdapter';
import { MemoryStore } from '../../src/modules/storage/MemoryStore';
import { EngineAssetResolver } from '../../src/modules/engine/EngineAssetResolver';

export interface LiveApp {
  store: MemoryStore;
  storage: WorkspaceStorageManager;
  downloadStore: DownloadStore;
  supervisor: EngineSupervisor;
  workspace: ProjectWorkspace;
  /** 各计数器的读数（调用时取值，不是快照对象） */
  counts: () => Counts;
  /** 失控守卫是否被撞到（撞到 = 订阅链自我放大，环回来了） */
  runawayTripped: () => boolean;
  /** 解开台架接线（模拟组件卸载 / 页面销毁），供清理 */
  teardown: () => void;
}

export interface Counts {
  /** workspaceStorage.refresh 调用数（环 A 的载体） */
  refreshes: number;
  /** supervisor.eval 调用数（环 B 的载体） */
  evals: number;
  /** workspaceStorage 通知次数（订阅者被叫醒的次数） */
  notifies: number;
  /** resolver.checkPhysicalStatus 调用数（四车道对账 ×4/轮） */
  physicalChecks: number;
  /** storage.list 迭代次数（环 A 里最贵的那一步） */
  lists: number;
}

/**
 * 起一台**真接线**的迷你应用：真 WorkspaceStorageManager + 真 DownloadStore +
 * 真 ProjectWorkspace + 真 EngineSupervisor（只把 wasm 适配器换成 MockEmbedAdapter）。
 *
 * 接线与 appContext 的同形（这是关键）：storageManager.subscribe → refreshFiles、
 * supervisor.onStateChange(idle) → syncToEngine、download 事件 → 通知。
 * ⚠️ appContext 本身不能直接 import 进来：它是模块级单例，且装配了图形/主题/终端等
 * 与本断言无关的东西；这里复刻的是**接线形状**，不是它的实现细节。形状漂移由
 * 台账里的 gate 锚点 + 候选 6 的断言本身兜住（断言红了就说明形状变了）。
 */
export async function bootLiveApp(options?: { files?: Record<string, string> }): Promise<LiveApp> {
  const store = new MemoryStore();
  await store.init();

  // 引擎：真 supervisor + 真状态机，只把 wasm 换成 MockEmbedAdapter。
  // 用 adapterFactory 而不是构造期 attachAdapter：boot() 走 attachAdapter 才会
  // 让 _setState('idle') 发出**首次**状态迁移（构造期 attach 的初始 idle 会被
  // _setState 的同态短路吃掉，boot 后再设 idle 也是同态 ⇒ 订阅者一次都收不到）。
  const supervisor = new EngineSupervisor({
    adapterFactory: () => new MockEmbedAdapter('integration-mock'),
    skipPreflight: true,
  });

  const storage = new WorkspaceStorageManager(store);
  await storage.init();

  const downloadStore = new DownloadStore({
    storage: store,
    baseUrl: 'https://octave.test',
    catalogProvider: () => ({ schema: 2, packs: [] }),
  });
  await downloadStore.init();

  // 消费侧共享单例绑到同一份盘（候选 3 的前置条件；否则对账与写路径不同盘）
  EngineAssetResolver.getInstance(store);

  // 工作区：放一个 .m 文件（环 B 需要「有文件才会 addpath」这个前提）
  for (const [path, content] of Object.entries(options?.files ?? { 'demo.m': 'x = 1;' })) {
    await storage.writeFile(path, content);
  }
  await storage.refresh();

  const workspace = new ProjectWorkspace(supervisor, undefined, storage, downloadStore);

  // ── 计数面：全部挂在**公开方法**上 ──
  let refreshes = 0;
  let evals = 0;
  let notifies = 0;
  let physicalChecks = 0;
  let lists = 0;

  // 失控守卫：自我放大环的特征是**不收敛**；在测试里它表现为微任务无限递归
  // （revert 掉环 A 的修复后实测：worker 4GB heap OOM，而不是给出一条失败断言）。
  // OOM/挂起不是可读的红——它既不像断言那样指出哪条路径坏了，也可能拖垮整轮。
  //
  // 守卫必须挂在**环体本身**（refresh），不能挂某一个订阅者：环的参与者是复数
  // （harness 的订阅者 + ProjectWorkspace 自己的 storage 订阅），只掐掉自己的那份，
  // 环仍然从 ProjectWorkspace 那边转下去（实测仍 OOM）。
  //
  // 撞线后的动作是**停止再通知**（直接返回，不做 refresh）——环因此断在测试台架里，
  // 断言随后读到超限的计数并红。这是「让环变成一条可读的红」而不是「让它跑完」。
  const RUNAWAY_LIMIT = 2000;
  let loopGuardTripped = false;

  const realRefresh = storage.refresh.bind(storage);
  vi.spyOn(storage, 'refresh').mockImplementation(async () => {
    refreshes++;
    if (refreshes > RUNAWAY_LIMIT) {
      loopGuardTripped = true;
      return; // 断环：不再 refresh ⇒ 不再 _notify ⇒ 递归终止
    }
    return realRefresh();
  });

  const realEval = supervisor.eval.bind(supervisor);
  vi.spyOn(supervisor, 'eval').mockImplementation(async (code: string) => {
    evals++;
    return realEval(code);
  });

  const realNotify = (storage as any)._notify.bind(storage);
  vi.spyOn(storage as any, '_notify').mockImplementation(() => {
    notifies++;
    return realNotify();
  });

  const resolver = EngineAssetResolver.getInstance();
  const realCheck = resolver.checkPhysicalStatus.bind(resolver);
  vi.spyOn(resolver, 'checkPhysicalStatus').mockImplementation(async (lane, variant) => {
    physicalChecks++;
    return realCheck(lane, variant);
  });

  const realList = store.list.bind(store);
  vi.spyOn(store, 'list').mockImplementation(async function* () {
    lists++;
    yield* realList();
  } as any);

  // ── 接线（与 appContext 同形）──
  // 失控守卫：自我放大环的特征是**不收敛**，它在测试里表现为微任务无限递归
  // （revert 掉环 A 的修复后实测：worker 直接 OOM，而不是给出一条失败断言）。
  // OOM/挂起不是可读的红——它既不像断言那样指出哪条路径坏了，也可能拖垮整轮。
  //
  // ⚠️ 不能靠「超限就 throw」：`WorkspaceStorageManager._notify` 用 try/catch 包住
  // 每个监听器（监听器报错不许打断别人），throw 会被吞掉、环照转。所以改成
  // **不再往下递归 + 记账**，由断言消费这条账 —— 环让断言红，而不是让进程挂。
  const unsubStorage = storage.subscribe(() => {
    void workspace.refreshFiles();
  });
  const unsubState = supervisor.onStateChange((state) => {
    if (state === 'idle') {
      void storage.syncToEngine(supervisor);
    }
  });
  const onDownloadChanged = () => {
    void workspace.refreshFiles();
  };
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('octave:download-changed', onDownloadChanged);
  }

  return {
    store,
    storage,
    downloadStore,
    supervisor,
    workspace,
    counts: () => ({ refreshes, evals, notifies, physicalChecks, lists }),
    runawayTripped: () => loopGuardTripped,
    teardown: () => {
      unsubStorage();
      unsubState();
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('octave:download-changed', onDownloadChanged);
      }
      vi.restoreAllMocks();
    },
  };
}

/** 让事件循环把已排队的微任务/定时器跑完（不含墙上时钟假设：只让出若干轮） */
export async function settle(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
}
