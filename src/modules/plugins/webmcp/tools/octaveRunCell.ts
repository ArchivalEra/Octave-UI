// src/modules/plugins/webmcp/tools/octaveRunCell.ts
// 逐字搬家（mail/062）：cell 定位的 typeof 路由 / not-found 文案 / resource 投影
// 全部原样；`typeof args.index === 'number'` 的窄化路由就是旧行为（字符串 "0"
// 落 not-found 是**旧路径**，不许顺手改好 —— ARGS_INVALID 是步骤 3 的事）。

import { defineTool } from '../defineTool';
import { args } from '../schema';

const runCellArgs = args()
  .prop('cellId', 'string', { description: 'The unique ID of the target notebook cell to run.' })
  .prop('index', 'number', { description: 'The 0-based index of the cell in the notebook cell list.' })
  .build();

export const octaveRunCellTool = defineTool({
  name: 'octave_run_cell',
  description: 'Execute a specific notebook cell by cell ID or 0-based cell index.',
  parameters: runCellArgs.schema,
  deps: ['workspace'],
  // effects = sandbox-escape（与 octave_eval 同档理由）：跑 cell 就是执行那段任意
  // Octave 代码（executeCell → supervisor.eval），代码能做的它都能做。额外的写面还有：
  // cell 运行态（status / streamingOutput / executionCount / durationMs）、引擎未 boot
  // 时顺手 boot、结束后的 syncVariables + _autoSave（有活动文件时写盘）。效应面只增不减。
  effects: 'sandbox-escape',
  run: async (args, ctx) => {
    const ws = ctx.workspace;
    if (!ws) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Error: ProjectWorkspace service is not available.' }],
      };
    }

    const cells = ws.cells || [];
    let targetCell = typeof args.cellId === 'string'
      ? cells.find((c) => c.id === args.cellId)
      : typeof args.index === 'number'
      ? cells[args.index]
      : null;

    if (!targetCell) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Error: target cell not found. Provide a valid cellId or index.' }],
      };
    }

    const targetCellId = targetCell.id;
    const cellRes = await ws.executeCell(targetCellId);
    const updatedCell = (ws.cells || []).find((c) => c.id === targetCellId);

    return {
      isError: !cellRes.ok,
      content: [
        {
          type: 'resource',
          mimeType: 'application/json',
          data: {
            cellId: targetCellId,
            status: updatedCell?.status || (cellRes.ok ? 'success' : 'error'),
            executionCount: updatedCell?.executionCount ?? null,
            durationMs: updatedCell?.durationMs ?? null,
            output: updatedCell?.streamingOutput || cellRes.output || '',
          },
        },
      ],
    };
  },
});
