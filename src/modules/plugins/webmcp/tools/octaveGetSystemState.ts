// src/modules/plugins/webmcp/tools/octaveGetSystemState.ts
// 逐字搬家（mail/062）：纯同步读取（无 awaited 服务调用）/ 全部默认值兜底
// （`sup?.state || 'unloaded'` 等七键原样）。deps 顺序 [supervisor, workspace]
// 与旧实现取值次序一致 —— throwing getter 注入经 catch-all 的路径（golden A2-A5）不变。

import { defineTool } from '../defineTool';
import { args } from '../schema';

export const octaveGetSystemStateTool = defineTool({
  name: 'octave_get_system_state',
  description: 'Get engine supervisor state, active computation lane, open file, mode, and workspace metrics.',
  parameters: args().build().schema,
  deps: ['supervisor', 'workspace'],
  run: async (_args, ctx) => {
    const sup = ctx.supervisor;
    const ws = ctx.workspace;

    return {
      content: [
        {
          type: 'resource',
          mimeType: 'application/json',
          data: {
            supervisorState: sup?.state || 'unloaded',
            activeLane: ws?.activeLane || sup?.currentLane || 'wasm32-final',
            activeMode: ws?.mode || 'notebook',
            activeFile: ws?.activeFile || null,
            filesCount: (ws?.files || []).length,
            variablesCount: (ws?.variables || []).length,
            notebookCellsCount: (ws?.cells || []).length,
          },
        },
      ],
    };
  },
});
