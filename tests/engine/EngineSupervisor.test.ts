// tests/engine/EngineSupervisor.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EngineSupervisor } from '../../src/modules/engine/EngineSupervisor';
import { MockEmbedAdapter } from '../../src/modules/engine/MockEmbedAdapter';
import { EngineCrashedError } from '../../src/modules/engine/types';

describe('EngineSupervisor Deep Module', () => {
  let mockAdapter: MockEmbedAdapter;
  let supervisor: EngineSupervisor;

  beforeEach(() => {
    mockAdapter = new MockEmbedAdapter();
    supervisor = new EngineSupervisor({ adapter: mockAdapter, skipPreflight: true });
  });

  it('initializes in idle state with epoch 1 when adapter is provided', () => {
    expect(supervisor.state).toBe('idle');
    expect(supervisor.epoch).toBe(1);
    expect(supervisor.isReady).toBe(true);
    expect(supervisor.pendingCount).toBe(0);
  });

  it('serializes concurrent tasks in strict FIFO order', async () => {
    mockAdapter.evalDelayMs = 25;
    const executionOrder: number[] = [];

    const p1 = supervisor.eval('disp("first")').then(() => executionOrder.push(1));
    const p2 = supervisor.eval('disp("second")').then(() => executionOrder.push(2));
    const p3 = supervisor.eval('disp("third")').then(() => executionOrder.push(3));

    await Promise.all([p1, p2, p3]);
    expect(executionOrder).toEqual([1, 2, 3]);
    expect(supervisor.pendingCount).toBe(0);
  });

  it('transitions state from idle to busy then back to idle on eval', async () => {
    const states: string[] = [];
    supervisor.onStateChange((s) => states.push(s));

    mockAdapter.evalDelayMs = 20;
    const p = supervisor.eval('magic(4)');
    await new Promise((r) => setTimeout(r, 5));
    expect(supervisor.state).toBe('busy');

    await p;
    expect(supervisor.state).toBe('idle');
    expect(states).toContain('busy');
    expect(states[states.length - 1]).toBe('idle');
  });

  it('fails preflight check when crossOriginIsolated or SharedArrayBuffer is missing', async () => {
    // Mock browser window lacking crossOriginIsolated
    const originalWindow = (globalThis as any).window;
    try {
      (globalThis as any).window = { crossOriginIsolated: false };
      const sup = new EngineSupervisor({ skipPreflight: false });

      await expect(sup.boot()).rejects.toThrow(/crossOriginIsolated/);
      expect(sup.state).toBe('failed');
    } finally {
      if (originalWindow !== undefined) {
        (globalThis as any).window = originalWindow;
      } else {
        delete (globalThis as any).window;
      }
    }
  });

  it('flushes stdout BEFORE rejecting crashed in-flight and queued tasks on Wasm trap', async () => {
    let outputReceived: string[] = [];
    supervisor.onOutput((txt) => outputReceived.push(txt));

    // 创建一个慢速任务并在执行中触发 trap，同时排队一个未启动任务
    mockAdapter.eval = vi.fn().mockImplementation(async (code: string) => {
      if (code === 'crash_cmd') {
        mockAdapter.on.output.bind(mockAdapter); // emit partial output
        (supervisor as any)._bufferStdout('[PARTIAL STDOUT OUTPUT BEFORE CRASH]');
        throw new WebAssembly.RuntimeError('unreachable executed');
      }
      return { ok: true, rc: 0 };
    });

    const events: string[] = [];
    supervisor.onOutput((txt) => {
      events.push(`output:${txt}`);
    });

    const p1 = supervisor.eval('crash_cmd').catch((err) => {
      events.push(`p1_reject:${err.name}:${err.cause}:${err.started}`);
      return err;
    });

    const p2 = supervisor.eval('queued_cmd').catch((err) => {
      events.push(`p2_reject:${err.name}:${err.cause}:${err.started}`);
      return err;
    });

    const [err1, err2] = await Promise.all([p1, p2]);

    expect(err1).toBeInstanceOf(EngineCrashedError);
    expect(err1.cause).toBe('trap');
    expect(err1.started).toBe(true);

    expect(err2).toBeInstanceOf(EngineCrashedError);
    expect(err2.cause).toBe('trap');
    expect(err2.started).toBe(false);

    // 验证输出事件发生在 reject 之前
    const outputIdx = events.findIndex((e) => e.includes('output:[PARTIAL STDOUT OUTPUT BEFORE CRASH]'));
    const rejectIdx = events.findIndex((e) => e.includes('p1_reject'));
    expect(outputIdx).toBeGreaterThanOrEqual(0);
    expect(rejectIdx).toBeGreaterThan(outputIdx);

    expect(supervisor.state).toBe('crashed');
  });

  it('executes kill ladder for hangs: enters aborting, then hard kills on timeout with hang cause', async () => {
    // 模拟不响应中断的死锁/死循环 eval
    mockAdapter.eval = vi.fn().mockImplementation(() => new Promise(() => {}));
    mockAdapter.interrupt = vi.fn().mockReturnValue(true);
    mockAdapter.terminate = vi.fn();

    const evalPromise = supervisor.eval('infinite_loop();').catch((err) => err);

    // 等待任务启动进入 busy
    await new Promise((r) => setTimeout(r, 5));
    expect(supervisor.state).toBe('busy');

    // 触发 abort，超时设置为 50ms
    const abortPromise = supervisor.abort(50);
    expect(supervisor.state).toBe('aborting');
    expect(mockAdapter.interrupt).toHaveBeenCalled();

    await abortPromise;
    const err = await evalPromise;

    expect(mockAdapter.terminate).toHaveBeenCalled();
    expect(supervisor.state).toBe('crashed');
    expect(err).toBeInstanceOf(EngineCrashedError);
    expect(err.cause).toBe('hang');
    expect(err.started).toBe(true);
  });

  it('cancels abort timer if execution finishes before grace timeout', async () => {
    mockAdapter.evalDelayMs = 30;
    mockAdapter.interrupt = vi.fn().mockImplementation(() => {
      // 模拟协作式中断成功提前让 eval 退出
      mockAdapter.evalDelayMs = 0;
      return true;
    });

    const evalPromise = supervisor.eval('cooperative_work();');
    await new Promise((r) => setTimeout(r, 5));

    // 超时为 100ms，在 30ms 结束
    const abortPromise = supervisor.abort(100);
    expect(supervisor.state).toBe('aborting');

    await Promise.all([evalPromise, abortPromise]);
    expect(supervisor.state).toBe('idle');
  });

  it('drops stale messages and events from previous epochs', async () => {
    const outputs: string[] = [];
    supervisor.onOutput((txt) => outputs.push(txt));

    const oldEpoch = supervisor.epoch;
    // 触发崩溃转移到 crashed
    supervisor.onEngineDeath(oldEpoch, 'trap');
    expect(supervisor.state).toBe('crashed');

    // 恢复进入新代际 epoch 2
    const newMock = new MockEmbedAdapter();
    supervisor.attachAdapter(newMock);
    expect(supervisor.epoch).toBe(oldEpoch + 1);

    // 模拟旧 mockAdapter 延迟投递消息
    mockAdapter.input('stale text');
    await new Promise((r) => setTimeout(r, 20));

    expect(outputs).not.toContain('stale text\n');

    // 验证新代际正常响应
    newMock.input('fresh text');
    await new Promise((r) => setTimeout(r, 20));
    expect(outputs).toContain('fresh text\n');
  });

  it('recovers successfully via recover() and increments epoch', async () => {
    const factoryMock = new MockEmbedAdapter();
    const sup = new EngineSupervisor({
      adapter: mockAdapter,
      adapterFactory: () => factoryMock,
      skipPreflight: true,
    });

    sup.onEngineDeath(sup.epoch, 'oom');
    expect(sup.state).toBe('crashed');
    const oldEpoch = sup.epoch;

    await sup.recover();
    expect(sup.state).toBe('idle');
    expect(sup.epoch).toBe(oldEpoch + 1);

    // 验证新适配器能正常接受 eval
    const res = await sup.eval('disp("healed")');
    expect(res.ok).toBe(true);
  });

  it('trips circuit breaker after 3 recovery failures within 30s and enters failed state', async () => {
    let failCount = 0;
    const sup = new EngineSupervisor({
      adapter: mockAdapter,
      adapterFactory: async () => {
        failCount++;
        throw new Error(`Factory boot error #${failCount}`);
      },
      skipPreflight: true,
    });

    sup.onEngineDeath(sup.epoch, 'trap');
    expect(sup.state).toBe('crashed');

    // 第一次尝试恢复：失败 -> 仍为 crashed
    await expect(sup.recover()).rejects.toThrow(/Factory boot error #1/);
    expect(sup.state).toBe('crashed');

    // 第二次尝试恢复：失败 -> 仍为 crashed
    await expect(sup.recover()).rejects.toThrow(/Factory boot error #2/);
    expect(sup.state).toBe('crashed');

    // 第三次尝试恢复：达到 3 次失败阈值 -> 熔断进入 failed 终端态
    await expect(sup.recover()).rejects.toThrow(/Factory boot error #3/);
    expect(sup.state).toBe('failed');

    // 再次调用 recover 应该直接被熔断器阻断
    await expect(sup.recover()).rejects.toThrow(/Circuit breaker tripped/);
    expect(sup.state).toBe('failed');

    // 再次调用 eval 应该直接抛出 EngineCrashedError
    await expect(sup.eval('1+1')).rejects.toThrow(EngineCrashedError);
  });

  it('handles immediate kill() and recovers idempotently', async () => {
    supervisor.kill('user-kill');
    expect(supervisor.state).toBe('crashed');
    expect(supervisor.crashCause).toBe('user-kill');

    // 在不是 crashed 时 recover 是幂等安全无操作的
    const supIdle = new EngineSupervisor({ adapter: mockAdapter, skipPreflight: true });
    await supIdle.recover();
    expect(supIdle.state).toBe('idle');

    // settle 不存在的 id 不会抛出异常
    expect(() => supervisor.settle('non-existent-id', { ok: true, value: 123 })).not.toThrow();
  });

  it('unblocks execution queue and allows subsequent eval after hang kill and recovery', async () => {
    // 模拟死锁/死循环 eval，底层 Promise 永久不决议
    mockAdapter.eval = vi.fn().mockImplementation(() => new Promise(() => {}));
    mockAdapter.terminate = vi.fn();

    const hungPromise = supervisor.eval('while(1) end').catch((err) => err);
    await new Promise((r) => setTimeout(r, 5));
    expect(supervisor.state).toBe('busy');

    // 硬杀死假死任务
    supervisor.kill('hang');
    const err = await hungPromise;
    expect(err).toBeInstanceOf(EngineCrashedError);
    expect(supervisor.state).toBe('crashed');
    expect(supervisor.crashCause).toBe('hang');

    // 恢复引擎
    const workingAdapter = new MockEmbedAdapter();
    supervisor.attachAdapter(workingAdapter);
    expect(supervisor.state).toBe('idle');
    expect(supervisor.crashCause).toBeNull();

    // 验证后续任务队列未被旧任务永久卡死，能够顺利执行
    const nextRes = await supervisor.eval('2 + 2');
    expect(nextRes.ok).toBe(true);
    expect(supervisor.state).toBe('idle');
  });

  it('drops zombie task completions and errors from old epochs without corrupting state or crashing new epoch', async () => {
    let zombieResolve: (val: any) => void = () => {};
    let zombieReject: (err: any) => void = () => {};
    mockAdapter.eval = vi.fn().mockImplementation(() => new Promise((res, rej) => {
      zombieResolve = res;
      zombieReject = rej;
    }));

    const oldEval = supervisor.eval('slow_task').catch((e) => e);
    await new Promise((r) => setTimeout(r, 5));

    // 在慢任务执行中杀死引擎
    supervisor.kill('user-kill');
    await oldEval;
    expect(supervisor.state).toBe('crashed');

    // 恢复到新 epoch
    const healthyAdapter = new MockEmbedAdapter();
    supervisor.attachAdapter(healthyAdapter);
    expect(supervisor.epoch).toBe(2);
    expect(supervisor.state).toBe('idle');

    // 模拟健康代际正在执行任务 (busy)
    healthyAdapter.evalDelayMs = 50;
    const freshEval = supervisor.eval('fresh_task');
    await new Promise((r) => setTimeout(r, 5));
    expect(supervisor.state).toBe('busy');

    // 模拟旧代际的僵尸任务此时决议并试图将状态重置为 idle
    zombieResolve({ ok: true, rc: 0 });
    await new Promise((r) => setTimeout(r, 10));
    // 状态必须保持 busy，不能被旧代际冲掉
    expect(supervisor.state).toBe('busy');

    // 模拟旧代际再次抛出 Wasm RuntimeError 致命崩溃
    zombieReject(new WebAssembly.RuntimeError('zombie crash'));
    await new Promise((r) => setTimeout(r, 10));
    // 新代际引擎绝对不能被旧代际的致命错误误杀
    expect(supervisor.state).toBe('busy');

    await freshEval;
    expect(supervisor.state).toBe('idle');
  });

  it('triggers onEngineDeath when adapter.on.error emits an asynchronous Wasm crash', async () => {
    expect(supervisor.state).toBe('idle');

    // 模拟 Worker 线程异步抛出 WebAssembly.RuntimeError
    mockAdapter.emitError(new WebAssembly.RuntimeError('unreachable executed in worker pthread'));

    expect(supervisor.state).toBe('crashed');
    expect(supervisor.crashCause).toBe('trap');
  });

  it('boots cleanly via boot() with MockEmbedAdapter when window.OctaveEmbed is not available', async () => {
    const sup = new EngineSupervisor({ skipPreflight: true });
    expect(sup.state).toBe('unloaded');

    await sup.boot();
    expect(sup.state).toBe('idle');
    expect(sup.isReady).toBe(true);

    const res = await sup.eval('1 + 1');
    expect(res.ok).toBe(true);
  });

  it('allows lane selection when unloaded and forbids lane switching after boot', async () => {
    const sup = new EngineSupervisor({ skipPreflight: true });
    expect(sup.state).toBe('unloaded');
    expect(sup.currentLane).toBe('wasm32-final');

    // 选档仅改变 currentLane，不触发 boot，状态保持 unloaded
    sup.setLane('master');
    expect(sup.currentLane).toBe('master');
    expect(sup.state).toBe('unloaded');

    await sup.switchLane('IllegalPerformance');
    expect(sup.currentLane).toBe('IllegalPerformance');
    expect(sup.state).toBe('unloaded');

    // 启动引擎
    await sup.boot();
    expect(sup.state).toBe('idle');

    // 启动后切换引擎必须抛出明确错误
    expect(() => sup.setLane('wasm32-final')).toThrow(/Cannot switch engine lane after computation has started/);
    await expect(sup.switchLane('wasm32-final')).rejects.toThrow(/Cannot switch engine lane after computation has started/);
  });
});
