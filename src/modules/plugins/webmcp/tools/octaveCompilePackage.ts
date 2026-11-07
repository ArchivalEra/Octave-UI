// src/modules/plugins/webmcp/tools/octaveCompilePackage.ts
// ★ 2026-11-07 三路同轴 C2（排查②矩阵空格）：编译在 MCP 车道此前无工具
//   （spec Out of Scope 记过，本轮补齐）。走 UI handleLoadOrCompile 的**同一条缝**：
//   packageManagerPlugin.compilePackage → port.compileExtension → bridge
//   compileExtension（toolchainWorker：clang + sysroot 分片懒加载 → .oct 落盘）。
//   裁决⑤ LLVM 前置由 compilePackage 内部把守（PackageManagerPlugin.ts:401-415），
//   MCP 调用与 UI 点击同门。

import { defineTool } from '../defineTool';
import { args } from '../schema';

const compilePackageArgs = args()
  .prop('name', 'string', { description: 'Exact package identifier of a source package (content includes "src").' })
  .required('name')
  .build();

export const octaveCompilePackageTool = defineTool({
  name: 'octave_compile_package',
  description:
    'Compile a source package (content includes "src") into a .oct inside the browser via the LLVM-wasm toolchain. Requires the llvm-wasm toolchain to be downloaded first.',
  parameters: compilePackageArgs.schema,
  deps: ['packageManager'],
  // effects = sandbox-escape：真网络（toolchain/源码分片）、写引擎 FS/OPFS（持久 .oct）。
  effects: 'sandbox-escape',
  run: async (args, ctx) => {
    const pm = ctx.packageManager;
    if (!pm) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Error: PackageManagerPlugin is not available.' }],
      };
    }

    const name = String(args.name || '').trim();
    if (!name) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Error: parameter "name" is required.' }],
      };
    }

    // ★ 三路同轴：编译走同一条 ensure 缝（Market 内部按契约 needsCompile
    //   标志自动决定编译），不再有第二条 compile 实现。
    const verdict = await pm.ensurePackage(name);
    return {
      isError: verdict.state !== 'ok',
      content: [
        {
          type: 'resource',
          mimeType: 'application/json',
          data: {
            state: verdict.state === 'ok' ? 'compiled' : verdict.state,
            name,
            diagnostics: verdict.evidence.compiled,
            why: verdict.cause,
          },
        },
      ],
    };
  },
});
