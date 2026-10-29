// tests/storage/test-only-surface-absence.test.ts
// 静态防回潮锁（cleanup ticket C5；先例：C1 tests/workspace/dead-singletons-absence.test.ts、
// wayfinder #10「删壳后配静态断言」）。
//
// 本票删掉的面（判据 = 产品侧不可达，详见提交信息）：
//   · FilesystemStore 整类（src/modules/filesystem/FilesystemStore.ts）—— 消费者只有
//     appContext 的死单例（C1 已删）与它自己的测试；产品 MEMFS 面走 ProjectWorkspace →
//     WorkspaceStorageManager / supervisor.fs*，该类零产品调用链。
//   · types.joinPath（src/modules/storage/types.ts）—— 除自身测试外全仓 0 引用；
//     产品路径拼接走 validatePath + 各调用点；保留 splitPath（产品在用）。
//   · ProjectWorkspace.switchLane —— 与产品在用的 selectLane 逐字同形的 async 双胞胎
//     （同 body、同告警、同 setLane），唯一调用者是 ProjectWorkspace 自己的测试。
//   · ProjectWorkspace.supervisor getter —— 全仓 0 读取（测试里的 app.supervisor 是
//     appContext 的导出，不是这个 getter）。
//
// 判据全部是**文件读取**（vitest cwd = 仓根，与 zreflect 闸门 repo() 同源），不 import
// 被测模块：本票删的就是「有人 import 它」这件事，import 出来再断言等于要求它存在。
//
// 守卫纪律（AGENTS.md 七条纪律之 4）：检测器是纯函数，★ 反向断言喂构造的违规输入，
// 它必须报；空扫描面必须抛（空输入 = 扫描面失效，不是「干净」）。
//
// 复跑：CI=true npx vitest run tests/storage/test-only-surface-absence.test.ts

import { describe, it, expect } from 'vitest';

// 仓内无 @types/node 且 tsc 非闸门：按 tests/plugins/webmcp-bridge-isolation.test.ts 与
// tests/workspace/dead-singletons-absence.test.ts 的先例，裸 require + 结构类型断言取 node:fs
// （只声明本测试用到的面）。
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
const SELF = 'tests/storage/test-only-surface-absence.test.ts';

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

/** 检测器（纯函数）：返回仍出现被删 符号/片段 的 路径:行 清单 */
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

describe('C5 静态防回潮：仅测试消费面不得复活', () => {
  it('src/ 中不再出现 FilesystemStore 类（整类已删，无产品调用链）', () => {
    expect(findSymbol({ FilesystemStore: '整类已删（产品 MEMFS 面走 ProjectWorkspace）' }, SRC)).toEqual([]);
    expect(findSymbol({ FilesystemStore: '整类已删' }, TESTS)).toEqual([]);
  });

  it('src/ 中不再出现 joinPath（测试独家消费的死导出）', () => {
    // 负向前瞻排除 splitPath 之类的同前缀名（\bjoinPath\b 已足够，仍显式写清意图）
    expect(findSymbol({ joinPath: '死导出，产品零引用' }, SRC)).toEqual([]);
    expect(findSymbol({ joinPath: '死导出' }, TESTS)).toEqual([]);
  });

  it('ProjectWorkspace.switchLane 双胞胎不再出现（产品走 selectLane）', () => {
    const pw = SRC.find((s) => s.path === 'src/modules/workspace/ProjectWorkspace.ts');
    expect(pw).toBeTruthy();
    expect(pw!.text).not.toMatch(/switchLane\s*\(/);
    // 正向腿：selectLane 必须在（否则上一条在「方法压根不存在」时空转通过）
    expect(pw!.text).toMatch(/\bselectLane\s*\(/);
  });

  it('ProjectWorkspace 不再暴露 supervisor getter（全仓 0 读取）', () => {
    const pw = SRC.find((s) => s.path === 'src/modules/workspace/ProjectWorkspace.ts');
    expect(pw).toBeTruthy();
    expect(pw!.text).not.toMatch(/get\s+supervisor\s*\(\s*\)/);
    // 正向腿：_supervisor 字段仍在（getter 删的是外观，不是引擎引用本体）
    expect(pw!.text).toContain('this._supervisor');
  });

  it('已删文件不在工作树里', () => {
    for (const gone of [
      'src/modules/filesystem/FilesystemStore.ts',
      'tests/filesystem/FilesystemStore.test.ts',
    ]) {
      expect(existsSync(`${ROOT}/${gone}`), `${gone} 应已删除`).toBe(false);
    }
  });

  // ★ 反向断言：检测器本身必须能报（该报的必须报 —— 没有反向断言的守卫等于没有守卫）
  it('★ 反向：检测器对构造的违规输入必须报', () => {
    const fixture: Source = {
      path: 'fixture.ts',
      text: 'export class FilesystemStore {}\nexport function joinPath() {}\nget supervisor() {}\n',
    };
    expect(findSymbol({ FilesystemStore: 'x' }, [fixture]).length).toBe(1);
    expect(findSymbol({ joinPath: 'x' }, [fixture]).length).toBe(1);
    expect(findSymbol({ FilesystemStore: 'x' }, [
      { path: 'fixture2.ts', text: "import { FilesystemStore } from './x'" },
    ])).toEqual(['fixture2.ts:1 FilesystemStore（x）']);
    // 正向腿反向：switchLane 正则必须能命中构造的违规行
    expect(/switchLane\s*\(/.test('async switchLane(lane) {}')).toBe(true);
    expect(/get\s+supervisor\s*\(\s*\)/.test('  get supervisor(): EngineSupervisor {')).toBe(true);
  });

  it('★ 反向：空扫描面必须抛（不能把「没扫到」当成「干净」）', () => {
    expect(() => findSymbol({ FilesystemStore: 'x' }, [])).toThrow(/扫描面为空/);
  });
});

describe('C5 静态防回潮：扫描面自证', () => {
  it('扫描面确实覆盖到 ProjectWorkspace / types.ts（否则上面的空结果无意义）', () => {
    const rel = SRC.map((s) => s.path);
    expect(rel).toContain('src/modules/workspace/ProjectWorkspace.ts');
    expect(rel).toContain('src/modules/storage/types.ts');
    expect(SRC.length).toBeGreaterThan(80);
  });

  it('splitPath 仍在（本票只删 joinPath，不许误伤同模块活面）', () => {
    const types = SRC.find((s) => s.path === 'src/modules/storage/types.ts');
    expect(types).toBeTruthy();
    expect(types!.text).toMatch(/\bexport function splitPath\b/);
    // 且 splitPath 真有产品消费者（OpfsFilesPanel / WorkspaceStorageManager / MemoryStore）
    const users = ALL.filter((s) => /\bsplitPath\b/.test(s.text) && s.path !== 'src/modules/storage/types.ts');
    expect(users.length).toBeGreaterThan(0);
  });
});
