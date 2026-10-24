// tests/plugins/webmcp-bridge-isolation.test.ts
// 网桥零 import 服务断言（spec v2 · 用户故事 10）：dispatcher / defineTool / tools/*
// 是纯桥件 —— 不得 import 任何领域服务**值**（appContext / EngineSupervisor /
// ProjectWorkspace / PackageManagerPlugin）。服务只允许两种进法：
//   ① `import type ...`（类型面，擦除后无运行期依赖）；
//   ② 装配根注入：ctx.ts 的 resolveCtx（require 惰性回退的**被批准豁免地**，
//      mail/062 红线 1）与 server.ts / WebMcpPlugin.ts 的装配代码。
//
// 守卫纪律（AGENTS.md 七条纪律之 4）：反向断言内置 —— 喂给检测器一条构造的违规
// import 行，它必须被检出（该报的必须报）。
//
// 复跑：CI=true npx vitest run tests/plugins/webmcp-bridge-isolation.test.ts

import { describe, it, expect } from 'vitest';

// 仓内无 @types/node 且 tsc 非闸门：按 PackageManagerPlugin.test.ts:465 的先例，
// 裸 require + 结构类型断言取 node:fs（只声明本测试用到的那两个函数的面）。
const { readFileSync, readdirSync, statSync } = require('node:fs') as {
  readFileSync(path: string, encoding: string): string;
  readdirSync(path: string, options: { withFileTypes: true }): Array<{
    name: string;
    isFile(): boolean;
    isDirectory(): boolean;
  }>;
  statSync(path: string): { isFile(): boolean; isDirectory(): boolean };
};

// happy-dom 环境的 import.meta.url 不含真实挂载点（实测解析成 /src/... 且丢尾斜杠）
// ——用 process.cwd() 拼路径（vitest 以仓根为 cwd，与 zreflect 闸门的 repo() 同源）。
const webmcpDir = `${process.cwd()}/src/modules/plugins/webmcp/`;

// 受检面：分发机 / 工具工厂 / 六个工具实现（+ 名册）。
// 刻意不含 ctx.ts（require 回退豁免地）、server.ts 与 WebMcpPlugin.ts（装配根）、
// channels/（只碰 DOM 面、不碰服务面——但它们同样干净，顺手一并盯住）。
const SCANNED_ENTRIES = ['dispatcher.ts', 'defineTool.ts', 'tools', 'schema.ts', 'channels'];

// 服务模块的 import 说明符特征（路径段/符号名里可辨识的服务面）
const SERVICE_MARKERS = ['appContext', 'EngineSupervisor', 'ProjectWorkspace', 'PackageManagerPlugin'];

/** 检测器（纯函数）：返回源码里所有「非 type 的服务 import」行（一行至多一命中） */
function findServiceImports(source: string): string[] {
  const hits: string[] = [];
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('import')) continue;
    // import type {...} 是类型面（擦除后无运行期依赖）——放行
    if (/^import\s+type\b/.test(trimmed)) continue;
    const matched = SERVICE_MARKERS.filter((marker) => trimmed.includes(marker));
    if (matched.length > 0) {
      hits.push(`[${matched.join(', ')}] ${trimmed}`);
    }
  }
  return hits;
}

/** 递归收集 entry（文件或目录）下全部 .ts 文件 */
function collectTsFiles(entry: string): string[] {
  const full = `${webmcpDir}${entry}`;
  // entry 可能是文件（dispatcher.ts）也可能是目录（tools/）——先 stat 分流。
  // statSync 的 Dirent 不带 name（那是 readdirSync 的字段），名字从 entry 自身取。
  const stats = statSync(full);
  if (stats.isFile()) {
    return entry.endsWith('.ts') ? [entry] : [];
  }
  const files: string[] = [];
  for (const s of readdirSync(full, { withFileTypes: true })) {
    const child = `${entry}/${s.name}`;
    if (s.isDirectory()) {
      files.push(...collectTsFiles(child));
    } else if (s.isFile() && s.name.endsWith('.ts')) {
      files.push(child);
    }
  }
  return files;
}

describe('webmcp bridge isolation: dispatcher/defineTool/tools import no service values', () => {
  it('受检文件（含 tools/、channels/ 递归）没有非 type 的服务 import', () => {
    const offenders: string[] = [];
    for (const entry of SCANNED_ENTRIES) {
      for (const file of collectTsFiles(entry)) {
        const src = readFileSync(`${webmcpDir}${file}`, 'utf8');
        for (const hit of findServiceImports(src)) {
          offenders.push(`${file}: ${hit}`);
        }
      }
    }
    // 一条都不许有 —— 有就把文件、服务名、import 行全抖出来
    expect(offenders).toEqual([]);
  });

  it('反向断言：检测器对构造的违规 import 必须报（守卫必须会红）', () => {
    // 三个形态各喂一条：值 import / 混合 import（值+type 同行也算值 import）/ type-only（放行）
    const badValueImport = "import { EngineSupervisor } from '../../engine/EngineSupervisor';";
    const badMixedImport = "import { supervisor, type ProjectWorkspace } from '../../appContext';";
    const okTypeImport = "import type { EngineSupervisor } from '../../engine/EngineSupervisor';";

    expect(findServiceImports(badValueImport)).toHaveLength(1);
    expect(findServiceImports(badMixedImport)).toHaveLength(1); // 值+type 混同行 = 值 import ⇒ 命中
    expect(findServiceImports(okTypeImport)).toHaveLength(0);
  });

  it('空输入必须不报（纯函数对空源码安静）', () => {
    expect(findServiceImports('')).toHaveLength(0);
  });
});
