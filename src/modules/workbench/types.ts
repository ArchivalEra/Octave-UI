// src/modules/workbench/types.ts
// 工作台领域模型与多态编辑状态机类型契约

import type { SemanticResult } from '../semantic/SemanticResultRenderer';

export type WorkbenchMode = 'notebook' | 'script' | 'console';

export type CellStatus = 'idle' | 'running' | 'success' | 'error' | 'aborted';

export interface NotebookCell {
  id: string;
  code: string;
  status: CellStatus;
  executionCount: number | null;
  streamingOutput: string;
  result?: SemanticResult;
  durationMs?: number;
}

export type WorkbenchListener = () => void;
