// src/modules/plugins/webmcp/tools/octaveGetWorkspace.ts
// 逐字搬家（mail/062）：ws 优先 / isReady 三元 / `: []` 兜底全部原样。
// deps 顺序 [workspace, supervisor] 与旧实现的取值次序一致（booting ⇒ isReady=false
// ⇒ 直接 []，不调 sup.getWorkspace —— golden A9 用例盯）。

import { defineTool } from '../defineTool';
import { args } from '../schema';

export const octaveGetWorkspaceTool = defineTool({
  name: 'octave_get_workspace',
  description: 'Retrieve all current variables in the GNU Octave workspace (names, types, dimensions, bytes).',
  parameters: args().build().schema,
  deps: ['workspace', 'supervisor'],
  run: async (_args, ctx) => {
    const ws = ctx.workspace;
    const sup = ctx.supervisor;
    const vars = ws ? await ws.syncVariables() : sup?.isReady ? await sup.getWorkspace() : [];

    return {
      content: [
        {
          type: 'resource',
          mimeType: 'application/json',
          data: {
            count: vars.length,
            variables: vars.map((v) => ({
              name: v.name,
              type: v.type,
              dimensions: v.dimensions,
              bytes: v.bytes,
              valuePreview: v.valuePreview,
            })),
          },
        },
      ],
    };
  },
});
