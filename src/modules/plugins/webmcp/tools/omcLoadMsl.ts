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
  // effects = sandbox-escape：真 fetch MSL zip（出网 + 字节进内存）、omc_vfs_load_zip
  // 把库写进运行时 VFS 的 `/.openmodelica/libraries`（沙箱外的持久加载态），再加三条
  // 自检 eval。这是「装载运行库」——与装包同族的下载/写面，且它改的是 omc 引擎自己的
  // 库目录，不是工作区变量。保守记逃逸档。
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

    // 3) 取字节：走站点同源 url（条目自带 url+size+sha256，三件齐；DownloadStore 的
    //    form:"file" 分支负责持久化下载，本工具只做「装进运行时」这一步）
    let zipBytes: Uint8Array;
    // 条目缺 url 就如实报（内容仓 096 §4.2：不猜文件名——`modelica-standard-library.zip`
    // 是编的，真实资产是 `msl-4.1.0-maint.om.zip`）
    if (!entry.url) {
      return {
        isError: true,
        content: [
          { type: 'text', text: `Error: catalog entry "${MSL_PACKAGE_NAME}" has no url (cannot locate the asset).` },
        ],
      };
    }
    try {
      const url = entry.url;
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
            selfCheck: checks,
          },
        },
      ],
    };
  },
});
