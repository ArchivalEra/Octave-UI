// src/modules/plugins/webmcp/tools/octaveEval.ts
// C 深模块半（spec v2）：octave_eval 的深实现住独立文件，名册里只占一行。
// **搬家不是重写**（mail/062）：空 code 守卫 / supervisor 缺席文案 / output 三元 /
// eval 后 syncVariables 全部逐字保留；不加 booting 分支（红线 3 —— 排队住在
// supervisor 内部，spec B.4）；`String(args.code || '')` 强转原样（红线 3）。
//
// 注：evalResult.output / 变量的 type/dimensions/valuePreview 在引擎类型面上本就
// 缺声明（旧 WebMcpPlugin.ts 同款 tsc 预存错误，随搬家原样携带 —— tsc 非本仓闸门，
// 运行期行为由 golden master 盯）。

import { defineTool } from '../defineTool';
import { args } from '../schema';

const evalArgs = args()
  .prop('code', 'string', {
    description: 'Octave/MATLAB code statement or script to execute (e.g. "A = magic(3); det(A)").',
  })
  .required('code')
  .build();

export const octaveEvalTool = defineTool({
  name: 'octave_eval',
  description: 'Evaluate GNU Octave code directly in WebAssembly engine and return execution output.',
  parameters: evalArgs.schema,
  deps: ['supervisor', 'workspace'],
  // effects = sandbox-escape（保守取最大档）：本工具执行**任意** Octave 代码，代码能做的
  // 一切都算它的副作用面 —— 改工作区只是最小项。宿主的 pkg shim 使 eval 内的
  // `pkg install` / `pkg load` 直接触发 OctaveAssets.install（下载/写盘/装包，与
  // octave_install_package 同等效应），`urlread` 经 webnet 桥出网（2026-10-23 spec
  // 「effects 修正」明文：eval 归 sandbox-escape，保守）。eval 之后还会 syncVariables
  // 回写工作区缓存。把它标 readonly 就是假装沙箱是围墙。
  effects: 'sandbox-escape',
  run: async (args, ctx) => {
    const code = String(args.code || '').trim();
    if (!code) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Error: parameter "code" is required and cannot be empty.' }],
      };
    }

    const sup = ctx.supervisor;
    if (!sup) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Error: EngineSupervisor service is not available.' }],
      };
    }

    const evalResult = await sup.eval(code);
    const ws = ctx.workspace;
    if (ws) {
      await ws.syncVariables();
    }

    return {
      isError: !evalResult.ok,
      content: [
        {
          type: 'text',
          text: evalResult.output || (evalResult.ok ? '(execution completed with no output)' : `Error (rc=${evalResult.rc})`),
        },
      ],
    };
  },
});
