// tests/plugins/webmcp-compile-gates.test.ts
// 类型层能力门（spec v2 · 用户故事 8）：dep key 写错 / 访问未声明 ctx 键 ⇒ 编译期报错。
//
// ⚠️ 两条核心断言是 **tsc 断言**（@ts-expect-error），vitest 本身不做类型检查。
// 核验复跑方式（与断言同在，本仓 tsc 有预存错误、非闸门，故按文件名定点看）：
//
//   npx tsc --noEmit 2>&1 | grep 'webmcp-compile-gates'
//
// 期望：**零输出** —— 两条 @ts-expect-error 处的错误被指令吃掉（门在咬合）。
// 若输出「Unused '@ts-expect-error' directive」⇒ 门坏了（该红不红）：
//   - dep key 门坏 = WebMcpDepKey 被放宽成 string；
//   - ctx 键门坏 = Pick<WebMcpCtx, D> 被换成整个 WebMcpCtx。
//
// 运行期部分（vitest 跑得到的）：正常路径的 defineTool 在运行期可调用、可执行。

import { describe, it, expect } from 'vitest';
import { defineTool } from '../../src/modules/plugins/webmcp/defineTool';
import { args } from '../../src/modules/plugins/webmcp/schema';

describe('WebMCP compile gates: deps 能力门在类型层咬合', () => {
  it('正常路径：声明了的 dep 可访问，运行期行为不受类型门影响', async () => {
    const probe = defineTool({
      name: 'probe_ok',
      description: 'compile-gate probe: declared dep is accessible',
      parameters: args().build().schema,
      deps: ['supervisor'],
      run: async (_args, ctx) => {
        // ctx 在此被窄化为 Pick<WebMcpCtx, 'supervisor'> —— supervisor 可访问
        const sup = ctx.supervisor;
        return {
          isError: false,
          content: [{ type: 'text', text: sup ? 'has-supervisor' : 'no-supervisor' }],
        };
      },
    });

    const res = await probe.run({}, { supervisor: undefined });
    expect((res.content[0] as { text?: string }).text).toBe('no-supervisor');
  });

  it('dep key 写错 ⇒ 编译期报错（@ts-expect-error 咬合）', () => {
    // 'superviser' 不是 WebMcpCtx 的键 —— D 推导失败，泛型约束当场红。
    // 单行书写：@ts-expect-error 只压制**下一行**的错误，对象字面量必须与调用同行。
    // @ts-expect-error dep key 门：'"superviser"' 不可赋给 WebMcpDepKey（keyof WebMcpCtx）
    defineTool({ name: 'probe_bad_dep_key', description: 'probe', parameters: args().build().schema, deps: ['superviser'], run: async () => ({ isError: true, content: [{ type: 'text', text: 'unreachable' }] }) });
  });

  it('访问未声明 ctx 键 ⇒ 编译期报错（@ts-expect-error 咬合）', () => {
    defineTool({
      name: 'probe_undeclared_ctx_key',
      description: 'probe',
      parameters: args().build().schema,
      deps: ['supervisor'],
      run: async (_args, ctx) => {
        // deps 只声明了 supervisor —— Pick 面上没有 workspace，越权访问当场红
        // @ts-expect-error ctx 键门：'workspace' does not exist on type 'Pick<WebMcpCtx, "supervisor">'
        const leaked = ctx.workspace;
        return { isError: Boolean(leaked), content: [{ type: 'text', text: 'unreachable' }] };
      },
    });
  });
});
