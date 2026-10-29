// src/modules/plugins/webmcp/tools/octaveInstallPackage.ts
// 逐字搬家（mail/062）：缺 name 守卫 / `String(args.name || '')` 强转 /
// `Boolean(args.planOnly)` 强转 / planOnly 双分支（plan 的投影键序、install 的
// `data: installResult` 整对象直放）全部原样。

import { defineTool } from '../defineTool';
import { args } from '../schema';

const installPackageArgs = args()
  .prop('name', 'string', { description: 'Exact package identifier (e.g. "signal", "optim", "linear-algebra").' })
  .prop('version', 'string', { description: 'Optional package version string. Defaults to latest release.' })
  .prop('planOnly', 'boolean', {
    description: 'If true, simulates dependency tree and calculates download budget with zero network cost.',
  })
  .required('name')
  .build();

export const octaveInstallPackageTool = defineTool({
  name: 'octave_install_package',
  description: 'Pre-plan or execute installation of an Octave Forge package or runtime extension layer.',
  parameters: installPackageArgs.schema,
  deps: ['packageManager'],
  // effects = sandbox-escape（按调用面**最大档**标注，不按 planOnly 分支）：
  // 非 planOnly 分支走 pm.installPackage → 资产 port.install → 宿主 OctaveAssets.install
  // —— 真下载、写盘、把包装进运行时（沙箱外的持久效应）。planOnly 分支虽然只推演预算
  // （planInstall 的 port 调用带 planOnly:true），但同一工具的**其他参数**能触发完整安装，
  // 权限机制按工具收窄 —— 若这里标 read，一次带 planOnly:false 的调用就会被当只读放行。
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

    const version = typeof args.version === 'string' ? args.version : undefined;
    const planOnly = Boolean(args.planOnly);

    if (planOnly) {
      const plan = await pm.planInstall(name, version);
      return {
        content: [
          {
            type: 'resource',
            mimeType: 'application/json',
            data: {
              packageName: name,
              planOnly: true,
              bytes: plan.bytes,
              layers: plan.layers,
            },
          },
        ],
      };
    }

    const installResult = await pm.installPackage(name, { version });
    return {
      isError: installResult.state !== 'ok',
      content: [
        {
          type: 'resource',
          mimeType: 'application/json',
          data: installResult,
        },
      ],
    };
  },
});
