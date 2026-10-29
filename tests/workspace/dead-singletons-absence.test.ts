// tests/workspace/dead-singletons-absence.test.ts
// 静态防回潮锁（cleanup ticket C1；先例：wayfinder #10「删壳后配静态断言」）。
//
// 本票删掉的面，任何一条复活都意味着组合根重新长出「活着但断链」的形状：
//   · appContext 四个死单例/别名（workspaceStore / filesystemStore / workbenchController /
//     engineSession）—— 全仓 0 import，却让读者以为这些 store 都接好了；
//   · WorkbenchController 整类（305 行平行 Notebook，与 ProjectWorkspace 逐功能对应）；
//   · workbench 领域类型模块（唯一消费者是上面的类）；
//   · workspace/WorkspaceStore 整类（唯二消费者是 appContext 单例与它自己的测试）；
//   · `octave_workbench_cells` 死存储键；
//   · WorkspaceStore 与 ProjectWorkspace 共用一个快照 key 的两套 schema
//     （WorkspaceStore 删除后 key 只剩 ProjectWorkspace 一个产地）。
//
// 判据全部是**文件读取**（vitest cwd = 仓根，与 zreflect 闸门 repo() 同源），不 import
// 被测模块：本票删的就是「有人 import 它」这件事，import 出来再断言等于要求它存在。
//
// 守卫纪律（AGENTS.md 七条纪律之 4）：检测器是纯函数，★ 反向断言喂构造的违规输入，
// 它必须报；空扫描面必须抛（空输入 = 扫描面失效，不是「干净」）。
//
// 复跑：CI=true npx vitest run tests/workspace/dead-singletons-absence.test.ts

import { describe, it, expect } from 'vitest';

// 仓内无 @types/node 且 tsc 非闸门：按 tests/plugins/webmcp-bridge-isolation.test.ts 的先例，
// 裸 require + 结构类型断言取 node:fs（只声明本测试用到的面）。
const { readFileSync, existsSync, readdirSync } = require('node:fs') as {
  readFileSync(path: string, encoding: string): string;
  existsSync(path: string): boolean;
  readdirSync(path: string, options: { withFileTypes: true }): Array<{
    name: string;
    isFile(): boolean;
    isDirectory(): boolean;
  }>;
};

const ROOT = process.cwd();

// 自排除（写明的有界缺口）：本文件必须**写出**被删符号的名字才能断言它们不在，
// 不排除自己就是「扫自己 = 必然红」。排除面只有这一条路径，且下面
// 「扫描面自证」用例保证被扫的 src/ 面确实非空 —— 不靠「文件少读了几个」蒙混。
const SELF = 'tests/workspace/dead-singletons-absence.test.ts';

/** 收集目录下所有 .ts / .svelte 源文件（递归） */
function collectSources(dir: string): string[] {
  const out: string[] = [];
  const walk = (p: string) => {
    for (const entry of readdirSync(p, { withFileTypes: true })) {
      const full = `${p}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && /\.(ts|svelte)$/.test(entry.name)) out.push(full);
    }
  };
  walk(dir);
  return out.filter((f) => f.replace(`${ROOT}/`, '') !== SELF);
}

/** 扫描单位：仓相对路径 + 全文（分离读取与判定，纯函数才能被反向断言喂构造输入） */
interface Source {
  path: string;
  text: string;
}

function loadSources(files: string[]): Source[] {
  if (files.length === 0) throw new Error('扫描面为空：没有源文件可读');
  return files.map((f) => ({ path: f.replace(`${ROOT}/`, ''), text: readFileSync(f, 'utf8') }));
}

const SRC = loadSources(collectSources(`${ROOT}/src`));
const TESTS = loadSources(collectSources(`${ROOT}/tests`));
const ALL = [...SRC, ...TESTS];

/** 检测器（纯函数）：返回仍出现被删符号的 路径:行 清单 */
function findSymbol(labels: Record<string, string>, sources: Source[]): string[] {
  if (sources.length === 0) throw new Error('扫描面为空：没有源文件可读');
  const hits: string[] = [];
  for (const { path, text } of sources) {
    text.split('\n').forEach((line, i) => {
      for (const [sym, why] of Object.entries(labels)) {
        if (new RegExp(`\\b${sym}\\b`).test(line)) hits.push(`${path}:${i + 1} ${sym}（${why}）`);
      }
    });
  }
  return hits;
}

/** 检测器（纯函数）：返回含某字面量的文件清单 */
function findLiteral(literal: string, sources: Source[]): string[] {
  if (sources.length === 0) throw new Error('扫描面为空：没有源文件可读');
  return sources.filter((s) => s.text.includes(literal)).map((s) => s.path);
}

const DEAD_SINGLETONS = {
  workspaceStore: '死单例，appContext 已删',
  filesystemStore: '死单例，appContext 已删',
  workbenchController: '死单例，随 WorkbenchController 类删除',
  engineSession: '死别名，appContext 已删',
};

const DEAD_CLASSES = {
  WorkbenchController: '整类已删（平行 Notebook，无产品消费者）',
  WorkspaceStore: '整类已删（唯二消费者是 appContext 单例与自身测试）',
};

describe('C1 静态防回潮：死单例与死类不得复活', () => {
  it('src/ 与 tests/ 中不再出现四个死单例的名字', () => {
    expect(findSymbol(DEAD_SINGLETONS, SRC)).toEqual([]);
    expect(findSymbol(DEAD_SINGLETONS, TESTS)).toEqual([]);
  });

  it('src/ 与 tests/ 中不再出现两个已删类名', () => {
    expect(findSymbol(DEAD_CLASSES, SRC)).toEqual([]);
    expect(findSymbol(DEAD_CLASSES, TESTS)).toEqual([]);
  });

  it('已删文件与目录不在工作树里', () => {
    for (const gone of [
      'src/modules/workbench/WorkbenchController.ts',
      'src/modules/workbench/types.ts',
      'src/modules/workspace/WorkspaceStore.ts',
      'tests/workbench/WorkbenchController.test.ts',
      'tests/workspace/WorkspaceStore.test.ts',
    ]) {
      expect(existsSync(`${ROOT}/${gone}`), `${gone} 应已删除`).toBe(false);
    }
  });

  it('octave_workbench_cells 死存储键零命中', () => {
    expect(findLiteral('octave_workbench_cells', ALL)).toEqual([]);
  });

  it("'octave_workspace_snapshots' 只剩一个 schema 产地（ProjectWorkspace）", () => {
    // 两套 schema 共用一个 key = 接回即互写脏数据（审计双路径 #2）。
    expect(findLiteral("'octave_workspace_snapshots'", SRC)).toEqual([
      'src/modules/workspace/ProjectWorkspace.ts',
    ]);
  });

  it('_flushBufferedOutput 下划线私有名不再出现；真名 flushBufferedOutput 在跨模块调用', () => {
    expect(findLiteral('_flushBufferedOutput', SRC)).toEqual([]);
    // 正向腿：否则上面那条在「方法压根不存在」时也会空转通过。
    const supervisor = SRC.find((s) => s.path === 'src/modules/engine/EngineSupervisor.ts');
    const projectWorkspace = SRC.find((s) => s.path === 'src/modules/workspace/ProjectWorkspace.ts');
    expect(supervisor?.text).toMatch(/public flushBufferedOutput\(\)/);
    expect(projectWorkspace?.text).toContain('this._supervisor.flushBufferedOutput()');
  });

  // ★ 反向断言：检测器本身必须能报（该报的必须报 —— 没有反向断言的守卫等于没有守卫）
  it('★ 反向：检测器对构造的违规输入必须报', () => {
    const fixture: Source = {
      path: 'fixture.ts',
      text: 'export const workspaceStore = 1;\nexport class WorkbenchController {}\n',
    };
    const hits = findSymbol(DEAD_SINGLETONS, [fixture]);
    expect(hits.length).toBe(1);
    expect(hits[0]).toContain('workspaceStore');
    expect(findSymbol(DEAD_CLASSES, [fixture]).length).toBe(1);
    expect(findLiteral('octave_workbench_cells', [fixture])).toEqual([]);
    expect(
      findLiteral('octave_workbench_cells', [
        { path: 'fixture2.ts', text: "localStorage.setItem('octave_workbench_cells', '[]')" },
      ])
    ).toEqual(['fixture2.ts']);
  });

  it('★ 反向：空扫描面必须抛（不能把「没扫到」当成「干净」）', () => {
    expect(() => findSymbol(DEAD_SINGLETONS, [])).toThrow(/扫描面为空/);
    expect(() => findLiteral('x', [])).toThrow(/扫描面为空/);
  });
});

describe('C1 静态防回潮：扫描面自证', () => {
  it('扫描面确实覆盖到 appContext 与 ProjectWorkspace（否则上面的空结果无意义）', () => {
    const rel = SRC.map((s) => s.path);
    expect(rel).toContain('src/modules/appContext.ts');
    expect(rel).toContain('src/modules/workspace/ProjectWorkspace.ts');
    expect(SRC.length).toBeGreaterThan(80);
  });

  it("ProjectWorkspace 里 octave_workspace_snapshots 仍在其唯一快照读写面内", () => {
    const pw = SRC.find((s) => s.path === 'src/modules/workspace/ProjectWorkspace.ts');
    expect(pw).toBeTruthy();
    expect(pw!.text).toContain('localStorage.setItem(STORAGE_KEY_SNAPSHOTS');
  });
});
