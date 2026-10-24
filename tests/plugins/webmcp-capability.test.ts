// tests/plugins/webmcp-capability.test.ts
// CAPABILITY_UNAVAILABLE 运行期能力门的反向断言（spec v2 步骤 3 第 3 项 · 偏差表第 3 项）。
//
// 适用面（spec B.2 钉死，验收方 068 复述）：
//   报 CAPABILITY_UNAVAILABLE —— **provision 在册**但运行期不可给：懒加载引擎装载
//   失败 / 服务 boot 中且该工具选择不排队（模拟：omc 软依赖路径——catalog 尚无 omc
//   条目前用 KNOWN_METADATA 软依赖模拟，即本文件的 supervisor 软依赖模拟同构）。
//   不报的三条红线：
//     · provision 缺失（未在名册）⇒ Unknown tool **原文案**（零偏差——golden F 面盯住）；
//     · 六个旧工具不声明 capability ⇒ 服务缺席走**旧守卫文案**（一字不变）；
//     · 排队语义的工具不声明（booting 排队走旧路径不报——spec B.4）。
//
// 复跑：CI=true npx vitest run tests/plugins/webmcp-capability.test.ts
import { describe, it, expect } from 'vitest';
import { dispatchTool, CAPABILITY_ENVELOPE_TEXT } from '../../src/modules/plugins/webmcp/dispatcher';
import { defineTool } from '../../src/modules/plugins/webmcp/defineTool';
import type { WebMcpToolSpec } from '../../src/modules/plugins/webmcp/defineTool';
import type { WebMcpCtxResolver } from '../../src/modules/plugins/webmcp/ctx';
import type { WebMcpCtx } from '../../src/modules/plugins/webmcp/ctx';
import { args as argsBuilder } from '../../src/modules/plugins/webmcp/schema';

/** 软依赖模拟（验收方 068 提示的路径）：resolver 里某服务缺席 ⇒ capability 门报不可给 */
function resolverWith(overrides: Partial<WebMcpCtx>): WebMcpCtxResolver {
  const base: WebMcpCtx = { supervisor: undefined, workspace: undefined, packageManager: undefined };
  const merged = { ...base, ...overrides };
  return {
    supervisor: () => merged.supervisor,
    workspace: () => merged.workspace,
    packageManager: () => merged.packageManager,
  };
}

/** 测试工具：声明 capability（模拟 omc 软依赖——supervisor 缺席即「懒加载失败/未装配」） */
const lazyEngineTool: WebMcpToolSpec<'supervisor'> = defineTool<'supervisor'>({
  name: 'omc_simulate',
  description: 'simulated lazy-load tool for the capability gate',
  parameters: argsBuilder().build().schema,
  deps: ['supervisor'],
  capability: (ctx) => (ctx.supervisor ? null : 'the omc engine runtime (lazy-load failed or not assembled)'),
  run: async () => ({ content: [{ type: 'text', text: 'simulated' }] }),
});

const plainTool: WebMcpToolSpec<never> = defineTool<never>({
  name: 'plain_tool',
  description: 'no capability declared',
  parameters: argsBuilder().build().schema,
  deps: [],
  run: async () => ({ content: [{ type: 'text', text: 'ran' }] }),
});

describe('CAPABILITY_UNAVAILABLE 能力门（spec B.2 新路径）', () => {
  it('★ provision 在册 + 运行期不可给 ⇒ CAPABILITY_UNAVAILABLE 信封（带原因）', async () => {
    const res = await dispatchTool([lazyEngineTool], resolverWith({}), 'omc_simulate', {});
    expect(res.isError).toBe(true);
    const text = (res.content[0] as any).text;
    expect(text).toContain('CAPABILITY_UNAVAILABLE: tool "omc_simulate" requires');
    expect(text).toContain('lazy-load failed or not assembled');
    expect(text).toContain('provisioned but its runtime capability is missing');
  });

  it('★ 信封文案与 CAPABILITY_ENVELOPE_TEXT 逐字一致（将来进 golden 的钉子）', () => {
    expect(CAPABILITY_ENVELOPE_TEXT('x', 'the omc engine')).toBe(
      'CAPABILITY_UNAVAILABLE: tool "x" requires the omc engine, which is not currently available (the tool is provisioned but its runtime capability is missing — e.g., lazy engine load failed, or the service is still booting on a non-queuing path).',
    );
  });

  it('★ 同一工具运行期可给后 ⇒ capability 返回 null 放行进 run（软依赖恢复路径）', async () => {
    const res = await dispatchTool(
      [lazyEngineTool],
      resolverWith({ supervisor: { state: 'idle' } as any }),
      'omc_simulate',
      {},
    );
    expect(res.isError).toBeFalsy();
    expect((res.content[0] as any).text).toBe('simulated');
  });

  it('★ provision 缺失（未在名册）⇒ Unknown tool 原文案（零偏差红线，不是 CAPABILITY）', async () => {
    const res = await dispatchTool([lazyEngineTool], resolverWith({}), 'not_in_roster', {});
    expect(res.isError).toBe(true);
    expect((res.content[0] as any).text).toBe(
      'Unknown tool name: "not_in_roster". Use listTools() to see available tools.',
    );
    expect((res.content[0] as any).text).not.toContain('CAPABILITY');
  });

  it('★ 不声明 capability 的工具 ⇒ 门不介入，照常 run（六个旧工具的形状）', async () => {
    const res = await dispatchTool([plainTool], resolverWith({}), 'plain_tool', {});
    expect((res.content[0] as any).text).toBe('ran');
  });

  it('★ capability 检查抛错 ⇒ 落 catch-all 原文案（代码缺陷路，不吞成信封）', async () => {
    const throwing: WebMcpToolSpec<never> = defineTool<never>({
      name: 'bad_gate',
      description: 'capability throws',
      parameters: argsBuilder().build().schema,
      deps: [],
      capability: () => {
        throw new Error('gate bug');
      },
      run: async () => ({ content: [{ type: 'text', text: 'never' }] }),
    });
    const res = await dispatchTool([throwing], resolverWith({}), 'bad_gate', {});
    expect((res.content[0] as any).text).toBe('Execution failed for tool "bad_gate": gate bug');
  });

  it('★ 门在 ARGS_INVALID 之后（校验先拦明确违规——层次不互换）', async () => {
    const withRequired: WebMcpToolSpec<'supervisor'> = defineTool<'supervisor'>({
      name: 'gated_required',
      description: 'capability + required arg',
      parameters: argsBuilder().prop('code', 'string').required('code').build().schema,
      deps: ['supervisor'],
      capability: (ctx) => (ctx.supervisor ? null : 'engine'),
      run: async () => ({ content: [{ type: 'text', text: 'x' }] }),
    });
    const res = await dispatchTool([withRequired], resolverWith({}), 'gated_required', {});
    // 缺 code 是明确违规 ⇒ ARGS_INVALID（不是 CAPABILITY——校验在门之前）
    expect((res.content[0] as any).text).toContain('ARGS_INVALID: parameter "code" is required');
  });
});
