// src/modules/plugins/webmcp/tools/omcLoadMsl.ts
// MSL 装载工具（内容仓 086 裁定 #4：按 spec 用户故事 13 自然生长——provision 加前缀、
// deps + capability 门，不预猜泛化）。
//
// 挂载语义权威 = 内容仓 `recipes/msl.md`（OM mail/016 实测）：
//   · 挂载点 `/.openmodelica/libraries`（omc 默认库目录）
//   · 调用 `omc_vfs_load_zip('/.openmodelica/libraries', zipBytes)` —— 一次调用即装
//     （recipes 原文的「一次 fetch」是下载侧的事，本工具只读 OPFS，见下）
//   · ★ 反例：`MODELICAPATH` 经 `omc_set_env` 传不进 loader（勿按 .d.ts 契约实现）
//   · 装后判据：loadModel(Modelica)=true / getVersion(Modelica)="4.1.0" /
//     反向 loadModel(NoSuchPackageXYZ) 必败
//
// ★ 2026-11-06 票 C 真浏览器实测（站侧 CORS 修好后依然 FAIL）：
//   原实现 `fetch(站点 assets/msl/msl-4.1.0-maint.om.zip)` 在净化 dist 里 404。
//   「下载」已由 DownloadStore 走分发契约（产物名 + sha 双确认 → catalogue 全表扫 →
//   manifest → 分片装配 → 落盘 OPFS），本工具不再碰网络。
//   「下载」（downloadStore.download → OPFS downloads/）与「装载」（本工具）是
//   **两个独立动作**（README.md:28-29 / 回信 018）：本工具只读已落盘字节，
//   绝不现场去拉 release。没下载就明确报 NOT_DOWNLOADED，不偷偷代劳。

import { defineTool } from '../defineTool';
import { args } from '../schema';
import type { ForgePackageItem } from '../../package/types';

/** 装载侧证据面：字节来自哪个已下载文件、以及它的 sha（不记 URL，因为没发网络请求）。 */
export interface MslDownloadedAsset {
  bytes: Uint8Array;
  path: string;
  sha256: string;
}

/**
 * 由组合根注入：从 OPFS 读**已下载**的 MSL 字节。
 * 返回 null = 尚未下载（或记账/文件缺失）⇒ 工具必须显式报「请先下载」。
 */
export type MslDownloadedAssetFn = (pkg: ForgePackageItem) => Promise<MslDownloadedAsset | null>;

/** 注入挂点：默认 null = 未接线（能力门会报，而不是假装能装）。 */
let mslDownloadedAsset: MslDownloadedAssetFn | null = null;
export function setMslDownloadedAsset(fn: MslDownloadedAssetFn | null): void {
  mslDownloadedAsset = fn;
}


const loadMslArgs = args().build();

/** MSL 的 catalog 名（内容仓 086 §3：按全称名筛，不是缩写 msl） */
export const MSL_PACKAGE_NAME = 'modelica-standard-library';
/** omc 默认库目录（recipes/msl.md 挂载点） */
export const MSL_MOUNT_PATH = '/.openmodelica/libraries';

export const omcLoadMslTool = defineTool<'packageManager'>({
  name: 'omc_load_msl',
  description:
    'Load the Modelica Standard Library from the already-downloaded OPFS asset into the running OpenModelica runtime (omc_vfs_load_zip into the default library directory). Download is a separate action; if the asset is not downloaded yet, this tool fails loudly.',
  parameters: loadMslArgs.schema,
  deps: ['packageManager'],
  // 能力门（spec 步骤 3 第 3 项）：provision 在册但运行期不可得 ⇒ CAPABILITY_UNAVAILABLE。
  // MSL 服务 omc 车道——packageManager 缺席即不可给。
  capability: (ctx) => {
    if (!ctx.packageManager) return 'the package manager service (needed to read the MSL catalog entry)';
    if (!mslDownloadedAsset) return 'the downloaded-asset reader (download/load decoupling not wired)';
    return null;
  },
  // effects = sandbox-escape：从 OPFS 读已下载字节进内存、omc_vfs_load_zip
  // 把库写进运行时 VFS 的 `/.openmodelica/libraries`（沙箱外的持久加载态），再加三条
  // 自检 eval。它改的是 omc 引擎自己的库目录，不是工作区变量 ⇒ 保守记逃逸档。
  // 注意：这里**没有下载/写盘面**（那是独立动作 DownloadStore 的职责），
  // 定档依据是「改运行时 VFS」而不是「出网」。
  effects: 'sandbox-escape',
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

    // 市场条目形状守卫：url 是内容契约的必填身份面（产物名产地）。
    // 装载本身不拼 url、不做双确认——那是下载侧 releaseSource.resolve 的职责；
    // 但缺 url 说明目录条目坏了，早报比让 stat 给出莫名其妙的 NOT_DOWNLOADED 清楚。
    if (!entry.url) {
      return {
        isError: true,
        content: [
          { type: 'text', text: `Error: catalog entry "${MSL_PACKAGE_NAME}" has no url (cannot derive the artifact name).` },
        ],
      };
    }

    // 3) 取字节：从 **OPFS 已下载资产**读（不落盘、不现场取 release）。
    //    下载是独立动作（PackageManagerModal → downloadStore.download → releaseSource
    //    分片装配 → 落盘 downloads/src/... → 记账），本工具只读盘 + 装载。
    //    没下载/物理缺件 ⇒ 显式 NOT_DOWNLOADED，绝不偷偷代劳、不静默回落站内路径。
    const asset = await mslDownloadedAsset!(entry);
    if (!asset) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text:
              `NOT_DOWNLOADED: the MSL asset for "${MSL_PACKAGE_NAME}" is not in OPFS. ` +
              `Download it first (the package manager's download action); loading never fetches bytes itself.`,
          },
        ],
      };
    }
    const zipBytes: Uint8Array = asset.bytes;

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
    //
    // ★ D12（内容仓 096）：此前用 `omc.omc_loadModel(...)` / `omc.omc_getVersion(...)`——
    // **这两个函数在产物里不存在**（`.d.ts` 导出面实测只有 omc_eval / omc_vfs_load_zip /
    // omc_init / omc_set_* / omc_sim_*；OM 探针 site-omc/msl-local.html:44-52 的权威用法是
    // `omc_eval('loadModel(Modelica)')`）。调用不存在的 API ⇒ TypeError 被 catch 吞成
    // checks.error ⇒ ok 恒 false ⇒ **装成功也报失败**，且「装载真失败」与「自检代码坏了」
    // 无法区分（与 D11「装配缺陷伪装成能力降级」同一种反噬形态）。
    //
    // 现在分三层（内容仓 096 §3 要求）：
    //   · 自检 API 存在性**先验**：omc_eval 不是函数 ⇒ 明确报「运行时 API 缺口」，
    //     不冒充装载失败；
    //   · 三条判据各自独立求值，单条异常不污染其它条；
    //   · checks.probeError 记自检自身异常——与「装载失败」在返回体里分开。
    const checks: Record<string, unknown> = {};
    const probeErrors: string[] = [];
    if (typeof omc.omc_eval !== 'function') {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text:
              'CAPABILITY_UNAVAILABLE: the OpenModelica runtime exposes no omc_eval — ' +
              'post-load self-check cannot run (runtime API gap, not a load failure).',
          },
        ],
      };
    }
    const evalStr = async (expr: string): Promise<string> => String(await omc.omc_eval(expr)).trim();
    try {
      checks.loadModel = (await evalStr('loadModel(Modelica)')) === 'true';
    } catch (err: any) {
      probeErrors.push(`loadModel: ${err?.message || err}`);
    }
    try {
      // getVersion 返回带引号（实测 `"4.1.0"`）——去引号后比配方版本
      checks.version = (await evalStr('getVersion(Modelica)')).replace(/"/g, '');
    } catch (err: any) {
      probeErrors.push(`getVersion: ${err?.message || err}`);
    }
    try {
      // 反向判据：不存在的包必须 loadModel=false（返回 true 才是异常）
      checks.negative = (await evalStr('loadModel(NoSuchPackageXYZ)')) === 'true';
    } catch (err: any) {
      probeErrors.push(`negative: ${err?.message || err}`);
    }
    if (probeErrors.length) checks.probeError = probeErrors.join('; ');

    // 配方三条判据全参与（内容仓 095 §四 + 096：version 也在判据里，版本不符不算成功）
    const ok =
      checks.loadModel === true &&
      checks.negative === false &&
      typeof checks.version === 'string' &&
      (checks.version as string).includes('4.1.0');
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
            // 证据面：装载零网络，字节来自 OPFS 已下载资产（下载侧 provenance 另记在 DownloadRecord）
            source: 'opfs-download',
            opfsPath: asset.path,
            sha256: asset.sha256,
            selfCheck: checks,
          },
        },
      ],
    };
  },
});
