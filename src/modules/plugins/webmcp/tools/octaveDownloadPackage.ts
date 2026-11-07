// src/modules/plugins/webmcp/tools/octaveDownloadPackage.ts
// ★ 2026-11-07 三路同轴 C2（排查②矩阵空格）：包下载(OPFS)在 MCP 车道此前无工具
//   ⇒ `omc_load_msl` 的 NOT_DOWNLOADED 前置在 MCP 车道是死路（agent 无从触发
//   那个「独立下载动作」）。本工具把 UI executeDownload 走的**同一条 seam**
//   （packageManagerPlugin.downloadPackage → DownloadStore → release 分片装配
//   → 落盘 OPFS → 记账）暴露给 MCP——零新取字节路径（README.md:28 下载/装载
//   解耦的「下载」半条）。

import { defineTool } from '../defineTool';
import { args } from '../schema';
import { isTreeForm } from '../../../storage/catalogueReleaseSource';
import type { DownloadRef } from '../../../storage/downloadTypes';

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
  // 与 octave_install_package 同档标注（调用面最大档）。
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
    // 目录条目必须在场（ref 的 version/shape 从货架来，不猜）
    if (!pm.getCatalog()) {
      await pm.loadCatalog();
    }
    const item = pm.getPackage(name);
    if (!item) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error: package "${name}" is not in the catalog.` }],
      };
    }

    const version = typeof args.version === 'string' && args.version ? args.version : item.version;
    // ref 构造与 PackageManagerModal.executeDownload 同一条产地下游：
    // isTreeForm 是 tree 判定唯一产地（Standards 审查第 5 条）
    const ref: DownloadRef = {
      name,
      version,
      kind: isTreeForm(item, version) ? 'runtime' : 'src',
      arch: null,
    } as DownloadRef;

    try {
      const rec = await pm.downloadPackage(ref);
      return {
        isError: false,
        content: [
          {
            type: 'resource',
            mimeType: 'application/json',
            data: {
              packageName: name,
              version,
              downloaded: true,
              // 记账证据面：落盘路径 + 逐件 sha（不托管的证据链：release base 在
              // DownloadRecord.provenanceUrl，这里不重复）
              files: rec.files.map((f) => ({ path: f.path, sha256: f.sha256, bytes: f.bytes })),
              bytes: rec.bytes,
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
