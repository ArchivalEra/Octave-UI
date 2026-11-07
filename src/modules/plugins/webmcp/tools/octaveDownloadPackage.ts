// src/modules/plugins/webmcp/tools/octaveDownloadPackage.ts
// ★ 2026-11-07 三路同轴：下载工具改走 Market.ensure 的同一条缝。
//   旧形态自己造 DownloadRef（手写 kind:'src'/'runtime' + arch:null 强转），
//   与 UI/MCP 正交；现在只给契约里的名字，其余全由投影层推导。

import { defineTool } from '../defineTool';
import { args } from '../schema';

const downloadPackageArgs = args()
  .prop('name', 'string', { description: 'Exact package identifier (e.g. "modelica-standard-library", "signal").' })
  .prop('version', 'string', { description: 'Optional package version string. Defaults to the catalog version.' })
  .required('name')
  .build();

export const octaveDownloadPackageTool = defineTool({
  name: 'octave_download_package',
  description:
    'Download a package or file-form asset (e.g. the Modelica Standard Library) into the OPFS sandbox. This is the independent "download" action; loading (omc_load_msl / octave_install_package) reads what this persisted.',
  parameters: downloadPackageArgs.schema,
  deps: ['packageManager'],
  // effects = sandbox-escape：真网络（release 分片）、写 OPFS 沙盘（持久）。
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

    try {
      const verdict = await pm.ensurePackage(name);
      return {
        isError: verdict.state !== 'ok',
        content: [
          {
            type: 'resource',
            mimeType: 'application/json',
            data: {
              packageName: name,
              downloaded: verdict.state === 'ok',
              // 记账证据面：下载/装载解耦的「下载」半条由 evidence 给出。
              files: verdict.evidence.downloaded,
              bytes: verdict.evidence.shaChecked.length,
              state: verdict.state,
              cause: verdict.cause,
            },
          },
        ],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error: download failed: ${err?.message || err}` }],
      };
    }
  },
});
