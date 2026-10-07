// src/modules/workbench/WorkbenchController.ts
// 工作台多态控制器：管理 Notebook 单元格生命周期、执行队列与流式结果收集

import type { NotebookCell, WorkbenchMode, WorkbenchListener } from './types';
import type { EngineSupervisor } from '../engine/EngineSupervisor';
import { SafePlotSinkPolyfill } from '../semantic/SafePlotSinkPolyfill';
import { SemanticResultRenderer } from '../semantic/SemanticResultRenderer';

export class WorkbenchController {
  private _mode: WorkbenchMode = 'notebook';
  private _cells: NotebookCell[] = [];
  private _activeCellId: string | null = null;
  private _executionCounter = 0;
  private _isRunning = false;
  private _listeners: Set<WorkbenchListener> = new Set();
  private _cellSeq = 0;

  constructor() {
    this.resetToDefault();
  }

  get mode(): WorkbenchMode {
    return this._mode;
  }

  get cells(): NotebookCell[] {
    return [...this._cells];
  }

  get activeCellId(): string | null {
    return this._activeCellId;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  setMode(mode: WorkbenchMode) {
    if (this._mode !== mode) {
      this._mode = mode;
      this._notify();
    }
  }

  setActiveCell(id: string | null) {
    this._activeCellId = id;
    this._notify();
  }

  subscribe(listener: WorkbenchListener): () => void {
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

  private _generateId(): string {
    return `cell_${++this._cellSeq}_${Date.now().toString(36)}`;
  }

  resetToDefault() {
    this._cells = [
      {
        id: this._generateId(),
        code: `% 欢迎使用 Octave Web 科学计算工作台
% 在此输入 Octave / MATLAB 语法代码，按 Shift+Enter 或点击运行
A = [1, 2; 3, 4];
b = [5; 6];
x = A \\ b
`,
        status: 'idle',
        executionCount: null,
        streamingOutput: '',
      },
    ];
    this._activeCellId = this._cells[0].id;
    this._notify();
  }

  addCell(code = '', afterId?: string): NotebookCell {
    const newCell: NotebookCell = {
      id: this._generateId(),
      code,
      status: 'idle',
      executionCount: null,
      streamingOutput: '',
    };

    if (!afterId) {
      this._cells.push(newCell);
    } else {
      const idx = this._cells.findIndex((c) => c.id === afterId);
      if (idx === -1) {
        this._cells.push(newCell);
      } else {
        this._cells.splice(idx + 1, 0, newCell);
      }
    }

    this._activeCellId = newCell.id;
    this._notify();
    return newCell;
  }

  deleteCell(id: string): boolean {
    if (this._cells.length <= 1) {
      // 至少保留一个单元格，清空内容即可
      const cell = this._cells[0];
      cell.code = '';
      cell.status = 'idle';
      cell.executionCount = null;
      cell.streamingOutput = '';
      cell.result = undefined;
      this._notify();
      return true;
    }

    const idx = this._cells.findIndex((c) => c.id === id);
    if (idx === -1) return false;

    this._cells.splice(idx, 1);
    if (this._activeCellId === id) {
      const nextIdx = Math.max(0, idx - 1);
      this._activeCellId = this._cells[nextIdx]?.id || null;
    }

    this._notify();
    return true;
  }

  updateCellCode(id: string, code: string) {
    const cell = this._cells.find((c) => c.id === id);
    if (cell && cell.code !== code) {
      cell.code = code;
      this._notify();
    }
  }

  clearCells() {
    this.resetToDefault();
  }

  async executeCell(id: string, supervisor: EngineSupervisor): Promise<void> {
    const cell = this._cells.find((c) => c.id === id);
    if (!cell) return;

    if (this._isRunning) {
      return; // 严格单任务互斥保护
    }

    this._isRunning = true;
    cell.status = 'running';
    cell.streamingOutput = '';
    cell.result = undefined;
    this._notify();

    const startTime = Date.now();

    // 引擎就绪保障
    if (supervisor.state === 'unloaded') {
      try {
        await supervisor.boot();
      } catch (err: any) {
        cell.status = 'error';
        cell.streamingOutput = `引擎启动失败: ${err?.message || err}`;
        cell.result = SemanticResultRenderer.parse(cell.streamingOutput, { ok: false });
        this._isRunning = false;
        this._notify();
        return;
      }
    }

    // 自动部署 Safe Plot 影子管线
    SafePlotSinkPolyfill.install(supervisor);

    // 挂接流式输出与错误收集
    const unsubOutput = supervisor.onOutput((chunk: string) => {
      cell.streamingOutput += chunk;
      this._notify();
    });
    const unsubError = supervisor.onError((err: string) => {
      cell.streamingOutput += (cell.streamingOutput ? '\n' : '') + err;
      this._notify();
    });

    try {
      const evalRes = await supervisor.eval(cell.code);
      // 等待 DOM MutationObserver 异步任务交付与缓冲池合并
      await new Promise((r) => setTimeout(r, 60));
      if (typeof (supervisor as any)._flushBufferedOutput === 'function') {
        (supervisor as any)._flushBufferedOutput();
      }
      const durationMs = Date.now() - startTime;

      // 提取绘图数据（若代码包含 plot 相关指令或输出触发标记）
      let plotData = null;
      if (
        cell.code.includes('plot') ||
        cell.streamingOutput.includes('[OCTAVE_WEB_PLOT:')
      ) {
        plotData = await SafePlotSinkPolyfill.extractPlotData(supervisor);
      }

      cell.executionCount = ++this._executionCounter;
      cell.durationMs = durationMs;
      cell.status = evalRes.ok ? 'success' : 'error';
      cell.result = SemanticResultRenderer.parse(cell.streamingOutput, {
        ok: evalRes.ok,
        rc: evalRes.rc,
        plotData,
      });
    } catch (err: any) {
      cell.status = 'error';
      const errMsg = err?.message || String(err);
      if (!cell.streamingOutput) {
        cell.streamingOutput = errMsg;
      }
      cell.result = SemanticResultRenderer.parse(cell.streamingOutput, { ok: false });
    } finally {
      if (typeof (supervisor as any)._flushBufferedOutput === 'function') {
        (supervisor as any)._flushBufferedOutput();
      }
      unsubOutput();
      unsubError();
      this._isRunning = false;
      this._notify();
    }
  }

  async executeAll(supervisor: EngineSupervisor): Promise<void> {
    for (const cell of this._cells) {
      if (cell.code.trim()) {
        await this.executeCell(cell.id, supervisor);
      }
    }
  }
}
