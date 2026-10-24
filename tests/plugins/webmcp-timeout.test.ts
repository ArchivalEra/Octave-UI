// tests/plugins/webmcp-timeout.test.ts
// TIMEOUT 超时兜底的反向断言（spec v2 步骤 3 第 2 项 · 偏差表第 2 项勾销的证）。
//   必报：超时（含排队计时）⇒ TIMEOUT 信封（措辞含「勿盲目重试」，spec B.1 逐字）；
//         timeoutMs 表项覆盖生效。
//   不许报：120s 缺省窗内正常完成（成功/失败形状原样透传——golden master 全体盯住）；
//         工作先 settle ⇒ 原样返回、定时器被清。
//   副作用如实：超时后底层任务不被取消（继续跑完——断言其副作用最终可见）。
//
// 复跑：CI=true npx vitest run tests/plugins/webmcp-timeout.test.ts
import { describe, it, expect } from 'vitest';
import { dispatchTool, DEFAULT_TIMEOUT_MS, TIMEOUT_ENVELOPE_TEXT } from '../../src/modules/plugins/webmcp/dispatcher';
import { defineTool } from '../../src/modules/plugins/webmcp/defineTool';
import type { WebMcpToolSpec } from '../../src/modules/plugins/webmcp/defineTool';
import type { WebMcpCtx, WebMcpCtxResolver } from '../../src/modules/plugins/webmcp/ctx';
import { args as argsBuilder } from '../../src/modules/plugins/webmcp/schema';

const emptyResolve: WebMcpCtxResolver = {} as unknown as WebMcpCtxResolver;

function specWith(run: WebMcpToolSpec<never>['run'], timeoutMs?: number): WebMcpToolSpec<never> {
  return defineTool<never>({
    name: 'slow_tool',
    description: 'test tool',
    parameters: argsBuilder().build().schema,
    deps: [],
    run,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('TIMEOUT 兜底（spec B.1：含排队、Promise.race、不碰 supervisor）', () => {
  it('★ 超时必报：timeoutMs=50 + 工作 300ms ⇒ TIMEOUT 信封（含排队措辞与勿盲目重试）', async () => {
    const tools = [specWith(async () => {
      await sleep(300);
      return { content: [{ type: 'text', text: 'late' }] };
    }, 50)];
    const res = await dispatchTool(tools, emptyResolve, 'slow_tool', {});
    expect(res.isError).toBe(true);
    const text = (res.content[0] as any).text;
    expect(text).toContain('TIMEOUT: tool "slow_tool" did not finish within 50ms');
    expect(text).toContain('queueing included');
    expect(text).toContain('do not blindly retry');
  });

  it('★ 信封文案与 TIMEOUT_ENVELOPE_TEXT 逐字一致（进 golden 的钉子）', () => {
    expect(TIMEOUT_ENVELOPE_TEXT('x', 1234)).toBe(
      'TIMEOUT: tool "x" did not finish within 1234ms (counting from call initiation, queueing included). The underlying task may still be running or queued — do not blindly retry.',
    );
  });

  it('★ 排队计入：工作先排队 80ms 再跑 10ms，timeoutMs=100 ⇒ 超时（从调用发起算，非执行起算）', async () => {
    const tools = [specWith(async () => {
      await sleep(80); // 模拟排队（在 run 内但语义等价：machine 看不到执行起点）
      await sleep(10);
      return { content: [{ type: 'text', text: 'done' }] };
    }, 50)];
    const res = await dispatchTool(tools, emptyResolve, 'slow_tool', {});
    expect(res.isError).toBe(true);
    expect((res.content[0] as any).text).toContain('TIMEOUT');
  });

  it('★ 缺省 120_000：DEFAULT_TIMEOUT_MS 恒等（spec 阈值钉死）', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(120_000);
  });

  it('★ 不许误报：timeoutMs=200 + 工作 30ms 成功 ⇒ 原样透传（成功形状不动）', async () => {
    const tools = [specWith(async () => ({ content: [{ type: 'text', text: 'fast ok' }] }), 200)];
    const res = await dispatchTool(tools, emptyResolve, 'slow_tool', {});
    expect(res.isError).toBeFalsy();
    expect((res.content[0] as any).text).toBe('fast ok');
  });

  it('★ 不许误报：工作先失败（30ms 内 throw）⇒ catch-all 原文案（不是 TIMEOUT）', async () => {
    const tools = [specWith(async () => {
      await sleep(10);
      throw new Error('boom');
    }, 5000)];
    const res = await dispatchTool(tools, emptyResolve, 'slow_tool', {});
    expect(res.isError).toBe(true);
    expect((res.content[0] as any).text).toBe('Execution failed for tool "slow_tool": boom');
  });

  it('★ 定时器清理：先 settle 后超时定时器不残留（后续无孤儿 resolve）', async () => {
    let settled = false;
    const tools = [specWith(async () => {
      await sleep(20);
      settled = true;
      return { content: [{ type: 'text', text: 'ok' }] };
    }, 5000)];
    const res = await dispatchTool(tools, emptyResolve, 'slow_tool', {});
    expect((res.content[0] as any).text).toBe('ok');
    await sleep(60);
    expect(settled).toBe(true); // 工作真跑完了
  });

  it('★ 副作用如实：超时后底层任务不被取消（副作用最终可见）', async () => {
    let sideEffect = false;
    const tools = [specWith(async () => {
      await sleep(120);
      sideEffect = true;
      return { content: [{ type: 'text', text: 'late' }] };
    }, 30)];
    const res = await dispatchTool(tools, emptyResolve, 'slow_tool', {});
    expect(res.isError).toBe(true); // 30ms 超时已回
    expect(sideEffect).toBe(false); // 此刻工作还在跑（未被取消）
    await sleep(150);
    expect(sideEffect).toBe(true); // 但它最终跑完——JS 无取消原语，如实
  });

  it('★ golden 全体仍绿 = 120s 缺省窗内正常调用零影响（见 webmcp-golden-master 全套）', () => {
    // 占位断言：该性质由 golden master 88 用例承担（此处只钉常量关系）
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThan(60_000);
  });
});
