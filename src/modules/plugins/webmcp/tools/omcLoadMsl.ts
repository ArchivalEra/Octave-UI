// src/modules/plugins/webmcp/tools/omcLoadMsl.ts
// MSL 装载工具（内容仓 086 裁定 #4：按 spec 用户故事 13 自然生长——provision 加前缀、
// deps + capability 门，不预猜泛化）。
//
// 挂载语义权威 = 内容仓 `recipes/msl.md`（OM mail/016 实测）：
//   · 挂载点 `/.openmodelica/libraries`（omc 默认库目录）
//   · 调用 `omc_vfs_load_zip('/.openmodelica/libraries', zipBytes)` —— 一次 fetch + 一个调用
//   · ★ 反例：`MODELICAPATH` 经 `omc_set_env` 传不进 loader（勿按 .d.ts 契约实现）
//   · 装后判据：loadModel(Modelica)=true / getVersion(Modelica)="4.1.0" /
//     反向 loadModel(NoSuchPackageXYZ) 必败
//
// 下载走既有 OPFS 通道（DownloadStore 的 form:"file" 分支，086 裁定的 url+size+sha 三件），
// 本工具不自己拼 URL/预算——那是下载层的活。

import { defineTool } from '../defineTool';
import { args } from '../schema';


const loadMslArgs = args().build();

/** MSL 的 catalog 名（内容仓 086 §3：按全称名筛，不是缩写 msl） */
export const MSL_PACKAGE_NAME = 'modelica-standard-library';
/** omc 默认库目录（recipes/msl.md 挂载点） */
export const MSL_MOUNT_PATH = '/.openmodelica/libraries';

export const omcLoadMslTool = defineTool<'packageManager'>({
  name: 'omc_load_msl',
  description:
    'Load the Modelica Standard Library into the running OpenModelica runtime (fetch the catalog asset, then omc_vfs_load_zip into the default library directory).',
  parameters: loadMslArgs.schema,
  deps: ['packageManager'],
  // 能力门（spec 步骤 3 第 3 项）：provision 在册但运行期不可得 ⇒ CAPABILITY_UNAVAILABLE。
  // MSL 服务 omc 车道——packageManager 缺席即不可给。
  capability: (ctx) => (ctx.packageManager ? null : 'the package manager service (needed to resolve the MSL catalog asset)'),
  run: async (_args, ctx) => {
    const pm = ctx.packageManager!;
    // 1) 从供给面按**全称名**取条目（consumer:"omc" 的包含语义由 filterPackages 保证）
    if (!pm.getCatalog()) {
      await pm.loadCatalog().catch(() => {});
    }
    const entry = pm.getPackage(MSL_PACKAGE_NAME);
    if (!entry) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error: catalog entry "${MSL_PACKAGE_NAME}" not found (is the omc consumer provisioned?)`,
          },
        ],
      };
    }

    // 2) omc 运行时是否在场（window.__omc 由 OmcBridge 装配；不在即能力不可得）
    const omc = typeof window !== 'undefined' ? (window as any).__omc : null;
    if (!omc || typeof omc.omc_vfs_load_zip !== 'function') {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'CAPABILITY_UNAVAILABLE: the OpenModelica runtime (window.__omc) is not loaded — load the omc engine first.',
          },
        ],
      };
    }

    // 3) 取字节：走站点同源 url（条目自带 url+size+sha256，三件齐；DownloadStore 的
    //    form:"file" 分支负责持久化下载，本工具只做「装进运行时」这一步）
    let zipBytes: Uint8Array;
    try {
      const url = entry.url || `assets/msl/${MSL_PACKAGE_NAME}.zip`;
      const base = (typeof document !== 'undefined' && document.querySelector('meta[name="site-base"]')?.getAttribute('content')) || '';
      const res = await fetch(`${base}${url.startsWith('/') ? url.slice(1) : url}`);
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      zipBytes = new Uint8Array(await res.arrayBuffer());
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error: failed to fetch the MSL asset: ${err?.message || err}` }],
      };
    }

    // 4) 挂载（recipes/msl.md 权威形状：一次调用，直接落默认库目录）
    try {
      await omc.omc_vfs_load_zip(MSL_MOUNT_PATH, zipBytes);
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error: omc_vfs_load_zip failed: ${err?.message || err}` }],
      };
    }

    // 5) 装后自检（recipes/msl.md 三条判据）
    const checks: Record<string, unknown> = {};
    try {
      checks.loadModel = await omc.omc_loadModel('Modelica');
      checks.version = await omc.omc_getVersion?.('Modelica');
      checks.negative = await omc.omc_loadModel('NoSuchPackageXYZ');
    } catch (err: any) {
      checks.error = String(err?.message || err);
    }

    // 配方三条判据全参与（内容仓 095 §四建议：version 也在判据里——版本不符不该算成功）
    const ok = checks.loadModel === true && checks.negative === false && checks.version === '4.1.0';
    return {
      isError: !ok,
      content: [
        {
          type: 'resource',
          mimeType: 'application/json',
          data: {
            name: MSL_PACKAGE_NAME,
            version: entry.version,
            mountPath: MSL_MOUNT_PATH,
            bytes: zipBytes.length,
            selfCheck: checks,
          },
        },
      ],
    };
  },
});
