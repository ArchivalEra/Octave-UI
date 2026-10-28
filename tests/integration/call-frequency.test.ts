// tests/integration/call-frequency.test.ts
// 跨模块调用频率断言（架构批次 #23 / 候选 6；grilling Q1=C / Q2=C / Q3=C）。
//
// 为什么这三条、为什么是这个形状
// ─────────────────────────────────
// 两条自我放大环（D13 环 A、候选 1 环 B）的特征**不是「多调了几次」，而是不收敛**。
// 所以每条路径都配两个判据：
//   · 上界：正常路径的调用数 ≤ 常数（环是 200 次 / 39,803 次，与常数差两个数量级）
//   · 零增长：什么都没变时再来一轮，调用数**必须一字不增**（抓「查询有副作用」）
// 只有上界会漏掉「每轮多一点」的慢环；只有零增长会漏掉「一次性放大」。
//
// 三条路径选的是三类触发源（Q3）：空闲 / 用户动作 / 外部事件 —— 环必属其一。
//
// ★ 反向判据：这些断言对**旧实现**必须红。本文件末尾有一个 `-- 反向 --` 用例，
//   它把手写的旧行为（每次 refresh 无条件 _notify）装回台架，证明零增长断言真能红。
//
// 复跑：CI=true npx vitest run tests/integration/call-frequency.test.ts

import { describe, it, expect, afterEach } from 'vitest';
import { bootLiveApp, settle, type LiveApp } from './harness';
import { EngineAssetResolver } from '../../src/modules/engine/EngineAssetResolver';

let app: LiveApp | null = null;

afterEach(() => {
  app?.teardown();
  app = null;
  EngineAssetResolver.resetInstance();
});

describe('候选 6 · 路径一：boot 完成后的稳定期（空闲自激）', () => {
  // 环 A 的现场：引擎 idle 触发 syncToEngine → addpath eval → 状态机 busy→idle
  // → 又触发 syncToEngine。旧实现下这里每秒上百次。
  it('boot 到 idle 后闲置：sync/eval/refresh 都不许持续增长（零增长判据）', async () => {
    app = await bootLiveApp();
    await app.supervisor.boot();
    await settle(12); // 让 boot 引发的连锁反应跑完

    const afterBoot = app.counts();

    // 闲置：不给任何用户输入，只让事件循环转
    await settle(24);
    const afterIdle = app.counts();

    // ★ 首要判据：订阅链没有自我放大（撞到守卫 = 环回来了；这条先判，
    // 否则环会把后续断言拖成挂起/OOM，而不是一条可读的红）
    expect(app.runawayTripped()).toBe(false);

    // ★ 零增长：空闲期不许再有任何一次 sync 触发的 eval、也不许再 refresh
    expect(afterIdle.evals).toBe(afterBoot.evals);
    expect(afterIdle.refreshes).toBe(afterBoot.refreshes);
    expect(afterIdle.notifies).toBe(afterBoot.notifies);
  });

  it('boot 到 idle 全程：eval 次数有上界（环 B 是每轮一次，旧实现 2 秒 199 次）', async () => {
    app = await bootLiveApp();
    await app.supervisor.boot();
    await settle(24);

    expect(app.runawayTripped()).toBe(false);
    // 上界：boot 本身 + 至多一次 addpath。给到 4 是留出「一两次合法重试」的余量，
    // 但离环的量级（一次运行里 199 次）差两个数量级。
    expect(app.counts().evals).toBeLessThanOrEqual(4);
    // refresh 同理：boot 引发若干次是合法的，环是成千上万
    expect(app.counts().refreshes).toBeLessThanOrEqual(10);
  });
});

describe('候选 6 · 路径二：用户 eval 一次（一次动作放大成 N 次）', () => {
  it('用户 eval 一次 ⇒ addpath eval 不重复跑（路径没变就不再注册）', async () => {
    app = await bootLiveApp();
    await app.supervisor.boot();
    await settle(12);

    const before = app.counts();

    // 一次用户动作
    await app.supervisor.eval('disp(42)');
    await settle(12);
    const afterOne = app.counts();

    expect(app.runawayTripped()).toBe(false);
    // ★ 上界：一次用户 eval 之后，内部 addpath 不许被反复重跑。
    // 增量里最多一次 syncToEngine 引发的 addpath（工作区没变 ⇒ 指纹相同 ⇒ 应该 0 次）。
    expect(afterOne.evals - before.evals).toBeLessThanOrEqual(2);
    expect(afterOne.refreshes - before.refreshes).toBeLessThanOrEqual(2);

    // ★ 零增长：静下来以后再等一轮，调用数必须不再涨
    await settle(24);
    const afterSettle = app.counts();
    expect(afterSettle.evals).toBe(afterOne.evals);
    expect(afterSettle.refreshes).toBe(afterOne.refreshes);
  });
});

describe('候选 6 · 路径三：一次下载完成（外部事件触发通知风暴）', () => {
  it('download 事件进来 ⇒ 通知有界，且之后不自激', async () => {
    app = await bootLiveApp();
    await app.supervisor.boot();
    await settle(12);

    const before = app.counts();

    // 外部事件：模拟一次下载完成（DownloadStore 的终态广播形状）
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('octave:download-changed', {
        detail: { ref: { kind: 'engine', name: 'octave', arch: 'master' }, record: null },
      }));
    }
    await settle(12);
    const afterEvent = app.counts();

    expect(app.runawayTripped()).toBe(false);
    // ★ 上界：一次事件只该引起少量刷新（refreshFiles 一次 + 可能的级联一轮）
    expect(afterEvent.refreshes - before.refreshes).toBeLessThanOrEqual(3);

    // ★ 零增长：事件处理完就停，不许自己再触发自己
    await settle(24);
    const afterSettle = app.counts();
    expect(afterSettle.refreshes).toBe(afterEvent.refreshes);
    expect(afterSettle.evals).toBe(afterEvent.evals);
    expect(afterSettle.notifies).toBe(afterEvent.notifies);
  });
});

describe('候选 6 · 反向：断言真能锁住环（对旧行为必须红）', () => {
  // 这一条证明上面三条不是恒真。做法：起台架后，把 refresh 的「只在变化时通知」
  // 换成旧行为（每次 refresh 无条件 _notify）—— 这正是 D13 的原始形状。
  // 若零增长断言抓不到它，那三条断言就是装饰。
  it('★ 把 refresh 改回「无条件通知」⇒ 通知链必须自我放大（环回来）', async () => {
    app = await bootLiveApp();
    await app.supervisor.boot();
    await settle(12);

    const countsAtStart = app.counts();

    // 装回旧行为：任何 refresh 都通知。环靠的是**已有的**链路：
    //   _notify → ProjectWorkspace.refreshFiles → storage.refresh → _notify → …
    // 不额外加订阅者——加了就变成「测我自己搭的环」，证明不了原链路会自激。
    const storageAny = app.storage as any;
    const realRefresh = storageAny.refresh.bind(storageAny);
    let spinning = 0;
    storageAny.refresh = async () => {
      // 上限只防跑飞（微任务递归），200 已足够说明「不收敛」；真环是无界的
      if (spinning++ > 200) return;
      const collected: any[] = [];
      for await (const item of app!.store.list()) {
        if (item.path === 'downloads' || item.path.startsWith('downloads/')) continue;
        collected.push(item);
      }
      storageAny._entries = collected;
      storageAny._notify(); // ★ 旧行为：无条件通知
    };

    // 踢第一脚（生产里这一脚来自 HeaderBar 的 subscribe → checkAllPhysicalStatus）
    await storageAny.refresh();
    await settle(30);

    const afterLoop = app.counts();

    // 环回来了：一次踢入放大成多次通知。相对于零增长的实现在同一窗口是 0 增量，
    // 这里的差距正是那三条断言的分辨力。
    expect(afterLoop.notifies - countsAtStart.notifies).toBeGreaterThan(1);

    // 复原，避免污染后续用例
    storageAny.refresh = realRefresh;
  });

  it('★ 对照：同一脚踢在**现行**实现上 ⇒ 只通知一次（证明断言抓的是增量差异）', async () => {
    app = await bootLiveApp();
    await app.supervisor.boot();
    await settle(12);

    const before = app.counts();
    // 同样的「一脚」：直接 refresh 一次（现行实现只在结果真变化时通知）
    await app.storage.refresh();
    await settle(30);
    const after = app.counts();

    // 现行实现：一次 refresh 最多一次通知，之后静默（这就是环被断掉的形状）
    expect(after.notifies - before.notifies).toBeLessThanOrEqual(1);
  });
});
