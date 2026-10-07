// src/modules/inspector/types.ts
// 变量检视器领域模型与上下文动作类型契约

export interface VariableStats {
  min: number;
  max: number;
  mean: number;
  std?: number;
}

export interface VariableDetail {
  name: string;
  class: string;
  size: string;
  bytes: number;
  isNumeric: boolean;
  stats?: VariableStats;
  previewGrid?: (number | string)[][];
  isTruncated?: boolean;
}

export type InspectorActionType = 'plot' | 'copy' | 'transpose' | 'insert';
