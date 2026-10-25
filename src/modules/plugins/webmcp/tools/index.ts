// src/modules/plugins/webmcp/tools/index.ts
// 静态名册（spec B.2）：provision 在装配期一次性给定 —— **不能**靠 resolveCtx 的
// thunk 键存在性判断（否则服务晚构造时名册抖动）。顺序 = 旧 listTools 的声明序
// （golden master「C. protocol level」的 listTools 快照盯字节一致含键序）。
// 加新工具：本目录加一个 defineTool 文件 + 这里加一行（spec 用户故事 7）。

import type { WebMcpToolSpec } from '../defineTool';
import { octaveEvalTool } from './octaveEval';
import { octaveRunCellTool } from './octaveRunCell';
import { octaveGetWorkspaceTool } from './octaveGetWorkspace';
import { octaveListPackagesTool } from './octaveListPackages';
import { octaveInstallPackageTool } from './octaveInstallPackage';
import { octaveGetSystemStateTool } from './octaveGetSystemState';
import { omcLoadMslTool } from './omcLoadMsl';

export const octaveToolTable: readonly WebMcpToolSpec[] = [
  octaveEvalTool,
  octaveRunCellTool,
  octaveGetWorkspaceTool,
  octaveListPackagesTool,
  octaveInstallPackageTool,
  octaveGetSystemStateTool,
  // omc 车道工具族（内容仓 093 裁定 A：provision 自然生长，逐条显式确认）
  omcLoadMslTool,
];
