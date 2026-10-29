// tests/plugins/webmcp-effects-nonwire.test.ts
// effects 元数据的「表内 vs wire 上」判据（spec v2 · B.3「新增 wire 面：不上 wire」）。
//
// spec 逐字：
//   「`effects` 只做表内元数据，**不进 `list()` 返回也不进 `ready` 载荷**——它没有
//    消费者；等第一个消费者（权限机制）出现再暴露上 wire。」
//
// 所以本文件钉两件事，缺一不可：
//   ① **表内**：七个在册工具都带 effects 标注（否则「先让标注在」这句就是空话）；
//   ② **wire 上零字节**：`listTools()` / `ready.detail.tools` 的 JSON 里一个 `effects`
//      字样都没有 —— golden master 的 88 条快照零变化是更强的一条（逐字节对旧实现），
//      本文件补的是「为什么零变化」的直接判据。
//
// 守卫纪律（AGENTS.md 七条纪律之 4：断言要能证伪）：反向用例喂**真实的误改形态**
// —— 名册行被 `{ ...tool }` 摊平进 wire（最像「顺手加个字段」的坏法）——检测器必须红。
// 检测器本身也在用例里被证红，不是「从来没有生效过」的那种守卫。
//
// 复跑：CI=true npx vitest run tests/plugins/webmcp-effects-nonwire.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { WebMcpPlugin } from '../../src/modules/plugins/webmcp/WebMcpPlugin';
import { octaveToolTable } from '../../src/modules/plugins/webmcp/tools';
import type { WebMcpToolSpec } from '../../src/modules/plugins/webmcp/defineTool';
import type { EngineSupervisor } from '../../src/modules/engine/EngineSupervisor';
import type { ProjectWorkspace } from '../../src/modules/workspace/ProjectWorkspace';
import type { PackageManagerPlugin } from '../../src/modules/plugins/package/PackageManagerPlugin';

const { readFileSync } = require('node:fs') as { readFileSync(path: string, encoding: string): string };
const webmcpDir = `${process.cwd()}/src/modules/plugins/webmcp/`;

/**
 * 检测器（纯函数）：wire 载荷里是否出现了 `effects` **字样**或 **键**。
 *   · 字样：spec 要求「JSON.stringify(listTools()) 里不出现 effects 字样」——最直接的
 *     判据，连 description 里写漏了也会被抓到；
 *   · 键：递归找对象键 `effects`（防「值改成别的字面量但键还在」这类半泄漏）。
 * 输入不是可序列化值时按「不含」处理（空输入必须安静，见用例）。
 */
function leaksEffects(payload: unknown): boolean {
  let json: string;
  try {
    json = JSON.stringify(payload) ?? '';
  } catch {
    return false;
  }
  if (json.includes('effects')) return true;
  const walk = (v: unknown): boolean => {
    if (!v || typeof v !== 'object') return false;
    if (Array.isArray(v)) return v.some(walk);
    return Object.entries(v as Record<string, unknown>).some(
      ([k, child]) => k === 'effects' || walk(child),
    );
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return false;
  }
  return walk(parsed);
}

/** 生产投影（server.ts 的三键 pick）的**参照实现** —— 用来给违规变体做对照。 */
function projectAsWire(tools: readonly WebMcpToolSpec[]) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

/** 违规变体：把名册行**整对象摊平**进 wire（`{ ...tool }`）—— 最像真实误改的形态。 */
function projectLeaky(tools: readonly WebMcpToolSpec[]) {
  return tools.map((tool) => ({ ...tool }));
}

/** 违规变体 2：显式多投影一个 effects 键（「反正加了字段就顺手暴露一下」）。 */
function projectExplicitLeak(tools: readonly WebMcpToolSpec[]) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    effects: tool.effects,
  }));
}

function makePlugin() {
  const sup = {
    isReady: true,
    state: 'idle',
    currentLane: 'wasm32-final',
    eval: async () => ({ ok: true, rc: 0, output: '' }),
    getWorkspace: async () => [],
  };
  const ws: any = {
    mode: 'notebook', activeLane: 'wasm32-final', activeFile: null, files: [], variables: [], cells: [],
    syncVariables: async () => [],
  };
  const pm: any = {
    getCatalog: () => ({}), loadCatalog: async () => ({}), filterPackages: () => [],
    getStatus: () => ({}), planInstall: async () => ({ bytes: 1, layers: [] }),
    installPackage: async () => ({ state: 'ok' }),
  };
  const plugin = new WebMcpPlugin({
    supervisor: sup as unknown as EngineSupervisor,
    projectWorkspace: ws as unknown as ProjectWorkspace,
    packageManagerPlugin: pm as unknown as PackageManagerPlugin,
    windowTarget: typeof window !== 'undefined' ? window : undefined,
    documentTarget: typeof document !== 'undefined' ? document : undefined,
  });
  return plugin;
}

describe('effects：表内元数据（spec B.3），wire 上零字节', () => {
  let plugin: WebMcpPlugin;

  beforeEach(() => {
    delete (window as any).__webmcp_debug;
    plugin = makePlugin();
  });

  it('★① 表内：七个在册工具**全部**带 effects 标注（且取值在允许集内）', () => {
    expect(octaveToolTable.length).toBe(7);
    const legal = new Set(['read', 'mutates-workspace', 'sandbox-escape']);
    const missing = octaveToolTable.filter((t) => !t.effects).map((t) => t.name);
    expect(missing).toEqual([]);
    for (const tool of octaveToolTable) {
      expect(legal.has(tool.effects as string)).toBe(true);
    }
  });

  it('★② 语义抽查：只读工具标 read，执行/下载类标 sandbox-escape', () => {
    const byName = new Map(octaveToolTable.map((t) => [t.name, t.effects]));
    expect(byName.get('octave_get_system_state')).toBe('read');
    expect(byName.get('octave_get_workspace')).toBe('read');
    expect(byName.get('octave_list_packages')).toBe('read');
    // eval 内的 pkg install / urlread ⇒ 保守记逃逸档（spec「effects 修正」）
    expect(byName.get('octave_eval')).toBe('sandbox-escape');
    expect(byName.get('octave_run_cell')).toBe('sandbox-escape');
    expect(byName.get('octave_install_package')).toBe('sandbox-escape');
    expect(byName.get('omc_load_msl')).toBe('sandbox-escape');
  });

  it('★③ listTools() 的 JSON 里**不出现** effects 字样（核心反向判据的正向面）', async () => {
    const tools = await plugin.listTools();
    const json = JSON.stringify(tools);
    expect(json).not.toContain('effects');
    expect(leaksEffects(tools)).toBe(false);
  });

  it('★④ 每个 wire 定义**只有** name/description/parameters 三键（键序含）', async () => {
    const tools = await plugin.listTools();
    for (const def of tools) {
      expect(Object.keys(def)).toEqual(['name', 'description', 'parameters']);
    }
  });

  it('★⑤ ready 载荷同样不含 effects，且 tool 面与 listTools 逐字一致', async () => {
    let readyDetail: { pluginId: string; tools: unknown[] } | null = null;
    const onReady = (e: Event) => {
      readyDetail = (e as CustomEvent<{ pluginId: string; tools: unknown[] }>).detail;
    };
    window.addEventListener('webmcp:ready', onReady);
    plugin.init();
    await new Promise((r) => setTimeout(r, 20));
    window.removeEventListener('webmcp:ready', onReady);

    expect(readyDetail).not.toBeNull();
    expect(leaksEffects(readyDetail)).toBe(false);
    expect(JSON.stringify(readyDetail!.tools)).not.toContain('effects');
    expect(JSON.stringify(readyDetail!.tools)).toBe(JSON.stringify(await plugin.listTools()));
  });

  it('★⑥ 零运行期消费者：server/dispatcher/channels 源码不出现 `.effects`', () => {
    // 这是「不上 wire 且无权限检查」的另一半：一旦有人在这些文件里读 effects，
    // 就意味着出现了消费者（spec 要求那一刻之前不暴露）——应当先改 spec 再改这里。
    const scanned = [
      'server.ts',
      'dispatcher.ts',
      'channels/eventChannel.ts',
      'channels/globalHandle.ts',
      'channels/types.ts',
      'types.ts',
    ];
    const offenders = scanned.filter((f) => readFileSync(`${webmcpDir}${f}`, 'utf8').includes('.effects'));
    expect(offenders).toEqual([]);
  });

  it('★⑦ 反向自证：`{ ...tool }` 摊平进 wire 的违规实现必须被判红', async () => {
    // 真实误改形态一：server.ts 把 map 体改成 `{ ...tool }`
    const leakySpread = projectLeaky(octaveToolTable);
    expect(leaksEffects(leakySpread)).toBe(true);
    expect(JSON.stringify(leakySpread)).toContain('effects');

    // 真实误改形态二：显式多投影 effects 键
    const leakyExplicit = projectExplicitLeak(octaveToolTable);
    expect(leaksEffects(leakyExplicit)).toBe(true);

    // 对照：生产投影（三键 pick）不红 —— 证明上面的红是载荷差异造成的，不是检测器恒红
    expect(leaksEffects(projectAsWire(octaveToolTable))).toBe(false);
  });

  it('★⑧ 检测器对空输入安静（空数组 / 空串 / undefined 都不报）', () => {
    expect(leaksEffects([])).toBe(false);
    expect(leaksEffects('')).toBe(false);
    expect(leaksEffects(undefined)).toBe(false);
  });
});
