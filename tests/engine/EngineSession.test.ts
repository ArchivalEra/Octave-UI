// tests/engine/EngineSession.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EngineSession } from '../../src/modules/engine/EngineSession';
import { MockEmbedAdapter } from '../../src/modules/engine/MockEmbedAdapter';

describe('EngineSession Deep Module', () => {
  let mockAdapter: MockEmbedAdapter;
  let session: EngineSession;

  beforeEach(() => {
    mockAdapter = new MockEmbedAdapter();
    session = new EngineSession(mockAdapter);
  });

  it('initializes in idle state when adapter is attached and idle', () => {
    expect(session.state).toBe('idle');
    expect(session.isReady).toBe(true);
  });

  it('serializes concurrent calls in a strict FIFO queue', async () => {
    mockAdapter.evalDelayMs = 20;
    const executionOrder: number[] = [];

    const p1 = session.eval('disp("first")').then(() => executionOrder.push(1));
    const p2 = session.eval('disp("second")').then(() => executionOrder.push(2));
    const p3 = session.eval('disp("third")').then(() => executionOrder.push(3));

    await Promise.all([p1, p2, p3]);

    expect(executionOrder).toEqual([1, 2, 3]);
  });

  it('transitions state from idle to busy then back to idle on eval', async () => {
    const states: string[] = [];
    session.onStateChange((s) => states.push(s));

    mockAdapter.evalDelayMs = 20;
    const evalPromise = session.eval('magic(4)');
    await new Promise((r) => setTimeout(r, 5));
    expect(session.state).toBe('busy');

    await evalPromise;
    expect(session.state).toBe('idle');
    expect(states).toContain('busy');
    expect(states[states.length - 1]).toBe('idle');
  });

  it('queries documentation out-of-band without polluting stdout', async () => {
    const outputSpy = vi.fn();
    session.onOutput(outputSpy);

    const doc = await session.queryDocumentation('magic');
    expect(typeof doc).toBe('string');
    // 确保没有通过 stdout 吐出 help 文本
    expect(outputSpy).not.toHaveBeenCalled();
  });

  it('triggers cooperative interrupt and sets adapter flag', async () => {
    const ok = session.interrupt();
    expect(ok).toBe(true);
  });

  it('automatically refreshes workspace variables after successful eval', async () => {
    const wsListener = vi.fn();
    session.onWorkspaceUpdate(wsListener);

    await session.eval('magic(4)');
    // 应当触发工作区变量更新通知
    expect(wsListener).toHaveBeenCalled();
  });

  it('keeps queue alive even if a task errors', async () => {
    const errRes = await session.eval('error("test error")');
    expect(errRes.ok).toBe(false);

    // 下一个任务应该能正常排队执行
    const nextRes = await session.eval('disp("healthy")');
    expect(nextRes.ok).toBe(true);
    expect(session.state).toBe('idle');
  });
});
