// src/modules/plugins/webmcp/ctx.ts
// WebMCP 网桥 · 依赖解析半（spec v2 步骤 2）：WebMcpCtx 类型面 + resolveCtx 工厂。
//
// 红线 1（mail/062）：旧实现三个服务 getter 的 require('../../appContext') 惰性回退
// **逐字不动**地搬进本文件 —— deps 注入（options）与全局回退（require）**并存**，
// 不是替换；两者收敛要等升级触发条件，步骤 2 不碰。
//
// 解析语义保持点：
//   - 每次「访问」都重跑一遍：先看注入的 options，缺席才走 require 回退 ——
//     旧 getter 是 this.options 动态读取（构造后替换 options 也能生效），
//     这里用 getServices 闭包保持同一语义；
//   - require 回退包在 try/catch 里：测试环境 / 全局上下文未装配时静默落 undefined
//     （golden master F 组「服务缺席」用例盯这个行为）。
//
// 本文件是**被批准的组合根豁免地**：网桥其余部分（dispatcher/defineTool/tools）
// 零 import 服务值（tests/plugins/webmcp-bridge-isolation.test.ts 盯住），
// 服务引用只允许两种进法 —— import type（类型面）与本文件的注入/回退（值面）。

import type { ProjectWorkspace } from '../../workspace/ProjectWorkspace';
import type { PackageManagerPlugin } from '../package/PackageManagerPlugin';
import type { EngineSupervisor } from '../../engine/EngineSupervisor';

/** 与旧 WebMcpPlugin 同形的注入面（window/document target 供通道挂载用） */
export interface WebMcpPluginServices {
  projectWorkspace?: ProjectWorkspace;
  packageManagerPlugin?: PackageManagerPlugin;
  supervisor?: EngineSupervisor;
  windowTarget?: Window;
  documentTarget?: Document;
}

/**
 * 工具可声明的全部依赖（能力门的主键面）。
 * 加新服务 ⇒ 这里加一个键 + resolveCtx 加一个同名 thunk，工具侧 deps 即可声明。
 */
export interface WebMcpCtx {
  supervisor: EngineSupervisor | undefined;
  workspace: ProjectWorkspace | undefined;
  packageManager: PackageManagerPlugin | undefined;
}

/** 解析器：每个 ctx 键一个零参 thunk（惰性 —— 访问时机由工具体内的取值顺序决定） */
export type WebMcpCtxResolver = { readonly [K in keyof WebMcpCtx]: () => WebMcpCtx[K] };

/**
 * 构造依赖解析器。
 * @param getServices 注入面读取器（传 `() => this.options` 以保持旧 getter 的动态读取语义）
 */
export function resolveCtx(getServices: () => WebMcpPluginServices | undefined): WebMcpCtxResolver {
  return {
    supervisor: () => {
      const services = getServices();
      if (services?.supervisor) return services.supervisor;
      try {
        // 允许从全局环境惰性解析（旧 getter 逐字搬迁，mail/062 红线 1）
        const ctx = require('../../appContext');
        return ctx.supervisor;
      } catch {
        return undefined;
      }
    },
    workspace: () => {
      const services = getServices();
      if (services?.projectWorkspace) return services.projectWorkspace;
      try {
        // 允许从全局环境惰性解析（旧 getter 逐字搬迁，mail/062 红线 1）
        const ctx = require('../../appContext');
        return ctx.projectWorkspace;
      } catch {
        return undefined;
      }
    },
    packageManager: () => {
      const services = getServices();
      if (services?.packageManagerPlugin) return services.packageManagerPlugin;
      try {
        // 允许从全局环境惰性解析（旧 getter 逐字搬迁，mail/062 红线 1）
        const ctx = require('../../appContext');
        return ctx.packageManagerPlugin;
      } catch {
        return undefined;
      }
    },
  };
}
