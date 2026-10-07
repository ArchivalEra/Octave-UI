// src/modules/inspector/VariableInspectorStore.ts
// 变量深层透视器：安全数值统计探测、矩阵网格切片提取与上下文操作

import type { VariableDetail, VariableStats } from './types';
import type { EngineSupervisor } from '../engine/EngineSupervisor';
import type { WorkspaceVariable } from '../engine/types';

export class VariableInspectorStore {
  private static readonly NUMERIC_CLASSES = new Set([
    'double',
    'single',
    'int8',
    'int16',
    'int32',
    'int64',
    'uint8',
    'uint16',
    'uint32',
    'uint64',
    'logical',
  ]);

  private _selectedVar: VariableDetail | null = null;
  private _isOpen = false;
  private _listeners: Set<() => void> = new Set();

  get selectedVar(): VariableDetail | null {
    return this._selectedVar;
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  open(detail: VariableDetail) {
    this._selectedVar = detail;
    this._isOpen = true;
    this._notify();
  }

  close() {
    this._isOpen = false;
    this._selectedVar = null;
    this._notify();
  }

  subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _notify() {
    for (const cb of this._listeners) {
      try {
        cb();
      } catch {}
    }
  }

  static isNumeric(cls: string): boolean {
    return this.NUMERIC_CLASSES.has(cls.toLowerCase());
  }

  async inspect(
    variable: WorkspaceVariable,
    supervisor: EngineSupervisor
  ): Promise<VariableDetail> {
    const isNum = VariableInspectorStore.isNumeric(variable.class);
    const detail: VariableDetail = {
      name: variable.name,
      class: variable.class,
      size: variable.size,
      bytes: variable.bytes,
      isNumeric: isNum,
    };

    if (!isNum || supervisor.state !== 'idle') {
      return detail;
    }

    // 1. 安全数值统计探测
    try {
      const statsExpr = `[double(min(${variable.name}(:))), double(max(${variable.name}(:))), double(mean(${variable.name}(:)))]`;
      const statsRes = await supervisor.evalJSON<number[]>(statsExpr);
      if (statsRes.ok && Array.isArray(statsRes.value) && statsRes.value.length >= 3) {
        detail.stats = {
          min: statsRes.value[0],
          max: statsRes.value[1],
          mean: statsRes.value[2],
        };
      }
    } catch {}

    // 2. 矩阵网格切片（提取前 10x10）
    try {
      const previewExpr = `${variable.name}(1:min(10, size(${variable.name}, 1)), 1:min(10, size(${variable.name}, 2)))`;
      const previewRes = await supervisor.evalJSON<any>(previewExpr);
      if (previewRes.ok && previewRes.value !== undefined) {
        if (Array.isArray(previewRes.value)) {
          // 如果是一维向量或二维数组
          if (Array.isArray(previewRes.value[0])) {
            detail.previewGrid = previewRes.value;
          } else {
            detail.previewGrid = [previewRes.value];
          }
        } else if (typeof previewRes.value === 'number') {
          detail.previewGrid = [[previewRes.value]];
        }
      }
    } catch {}

    return detail;
  }
}
