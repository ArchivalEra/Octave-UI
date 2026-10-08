// src/modules/terminal/TerminalController.ts
// 终端状态机：输入缓冲、光标管理、历史寻迹、ANSI 解析、16ms 合并更新与零双重回显
import { HistoryStore } from '../history/HistoryStore';
import type { EngineSessionLike } from '../engine/types';

export interface AnsiSpan {
  text: string;
  color?: string;
  background?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export type TerminalOutputListener = (lines: AnsiSpan[][]) => void;

export class TerminalController {
  private _history: HistoryStore;
  private _session: EngineSessionLike | null = null;
  private _inputBuffer = '';
  private _cursorPos = 0;
  private _outputLines: AnsiSpan[][] = [];
  private _pendingChunk = '';
  private _batchTimer: any = null;
  private _listeners: Set<TerminalOutputListener> = new Set();
  private _inputChangeListeners: Set<(input: string, cursor: number) => void> = new Set();

  constructor(history?: HistoryStore, session?: EngineSessionLike) {
    this._history = history || new HistoryStore();
    if (session) {
      this.attachSession(session);
    }
  }

  get history(): HistoryStore {
    return this._history;
  }

  get currentInput(): string {
    return this._inputBuffer;
  }

  get cursorPos(): number {
    return this._cursorPos;
  }

  get lines(): AnsiSpan[][] {
    return this._outputLines;
  }

  attachSession(session: EngineSessionLike) {
    this._session = session;
    session.onOutput((text) => {
      this.appendOutput(text);
    });
    session.onError((err) => {
      this.appendOutput(`\x1b[31m${err}\x1b[0m\n`);
    });
  }

  onOutputChange(cb: TerminalOutputListener): () => void {
    this._listeners.add(cb);
    cb(this._outputLines);
    return () => this._listeners.delete(cb);
  }

  onInputChange(cb: (input: string, cursor: number) => void): () => void {
    this._inputChangeListeners.add(cb);
    cb(this._inputBuffer, this._cursorPos);
    return () => this._inputChangeListeners.delete(cb);
  }

  private _notifyInput() {
    for (const cb of this._inputChangeListeners) {
      cb(this._inputBuffer, this._cursorPos);
    }
  }

  setInput(val: string, cursor?: number) {
    this._inputBuffer = val;
    this._cursorPos = cursor !== undefined ? Math.max(0, Math.min(val.length, cursor)) : val.length;
    this._notifyInput();
  }

  insertText(text: string) {
    const before = this._inputBuffer.slice(0, this._cursorPos);
    const after = this._inputBuffer.slice(this._cursorPos);
    this._inputBuffer = before + text + after;
    this._cursorPos += text.length;
    this._notifyInput();
  }

  handleBackspace() {
    if (this._cursorPos > 0) {
      const before = this._inputBuffer.slice(0, this._cursorPos - 1);
      const after = this._inputBuffer.slice(this._cursorPos);
      this._inputBuffer = before + after;
      this._cursorPos--;
      this._notifyInput();
    }
  }

  handleDelete() {
    if (this._cursorPos < this._inputBuffer.length) {
      const before = this._inputBuffer.slice(0, this._cursorPos);
      const after = this._inputBuffer.slice(this._cursorPos + 1);
      this._inputBuffer = before + after;
      this._notifyInput();
    }
  }

  moveCursorLeft() {
    if (this._cursorPos > 0) {
      this._cursorPos--;
      this._notifyInput();
    }
  }

  moveCursorRight() {
    if (this._cursorPos < this._inputBuffer.length) {
      this._cursorPos++;
      this._notifyInput();
    }
  }

  moveCursorHome() {
    this._cursorPos = 0;
    this._notifyInput();
  }

  moveCursorEnd() {
    this._cursorPos = this._inputBuffer.length;
    this._notifyInput();
  }

  navigateHistoryUp() {
    const prev = this._history.getPrevious(this._inputBuffer);
    this.setInput(prev);
  }

  navigateHistoryDown() {
    if (!this._history.isNavigating) return;
    const next = this._history.getNext(this._inputBuffer);
    this.setInput(next);
  }

  /**
   * 提交命令（零双重回显设计：绝不在本地输出区重复回显用户敲击的命令行，完全交由 stdout/引擎回显汇）
   */
  async submit(): Promise<string> {
    const cmd = this._inputBuffer;
    this._history.push(cmd);
    this.setInput('', 0);

    if (this._session && cmd.trim()) {
      await this._session.eval(cmd);
    }

    return cmd;
  }

  /**
   * 追加原始文本并进行 16ms 批量合并更新
   */
  appendOutput(text: string) {
    this._pendingChunk += text;
    if (!this._batchTimer) {
      this._batchTimer = setTimeout(() => {
        this.flushOutput();
      }, 16);
    }
  }

  flushOutput() {
    if (this._batchTimer) {
      clearTimeout(this._batchTimer);
      this._batchTimer = null;
    }
    if (!this._pendingChunk) return;

    const chunk = this._pendingChunk;
    this._pendingChunk = '';

    const newParsedLines = this.parseAnsi(chunk);

    if (this._outputLines.length === 0) {
      this._outputLines = newParsedLines;
    } else {
      // 合并第一行到现有最后一行的末尾
      const firstNew = newParsedLines[0] || [];
      const lastCur = this._outputLines[this._outputLines.length - 1] || [];
      this._outputLines[this._outputLines.length - 1] = [...lastCur, ...firstNew];

      for (let i = 1; i < newParsedLines.length; i++) {
        this._outputLines.push(newParsedLines[i]);
      }
    }

    // 维持终端最大行数限制（例如 5000 行），防止内存泄露
    if (this._outputLines.length > 5000) {
      this._outputLines = this._outputLines.slice(this._outputLines.length - 5000);
    }

    for (const cb of this._listeners) {
      cb(this._outputLines);
    }
  }

  clear() {
    this._outputLines = [];
    this._pendingChunk = '';
    if (this._batchTimer) {
      clearTimeout(this._batchTimer);
      this._batchTimer = null;
    }
    for (const cb of this._listeners) {
      cb(this._outputLines);
    }
  }

  /**
   * 轻量 ANSI 状态机：将包含 ANSI 转义序列的文本解析为按行切分的 AnsiSpan 数组
   */
  parseAnsi(input: string): AnsiSpan[][] {
    const rawLines = input.split('\n');
    const result: AnsiSpan[][] = [];

    const ANSI_COLORS: Record<number, string> = {
      30: 'var(--term-black, #000)',
      31: 'var(--term-red, #e06c75)',
      32: 'var(--term-green, #98c379)',
      33: 'var(--term-yellow, #e5c07b)',
      34: 'var(--term-blue, #61afef)',
      35: 'var(--term-magenta, #c678dd)',
      36: 'var(--term-cyan, #56b6c2)',
      37: 'var(--term-white, #abb2bf)',
      90: 'var(--term-bright-black, #5c6370)',
      91: 'var(--term-bright-red, #e06c75)',
      92: 'var(--term-bright-green, #98c379)',
      93: 'var(--term-bright-yellow, #e5c07b)',
      94: 'var(--term-bright-blue, #61afef)',
      95: 'var(--term-bright-magenta, #c678dd)',
      96: 'var(--term-bright-cyan, #56b6c2)',
      97: 'var(--term-bright-white, #ffffff)',
    };

    let currentColor: string | undefined;
    let currentBg: string | undefined;
    let isBold = false;
    let isDim = false;
    let isItalic = false;
    let isUnderline = false;

    for (const line of rawLines) {
      const lineSpans: AnsiSpan[] = [];
      const regex = /\x1b\[([0-9;]*)m/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(line)) !== null) {
        if (match.index > lastIndex) {
          const txt = line.slice(lastIndex, match.index);
          lineSpans.push({
            text: txt,
            color: currentColor,
            background: currentBg,
            bold: isBold,
            dim: isDim,
            italic: isItalic,
            underline: isUnderline,
          });
        }

        const codes = (match[1] || '0').split(';').map(x => parseInt(x, 10) || 0);
        for (const code of codes) {
          if (code === 0) {
            currentColor = undefined;
            currentBg = undefined;
            isBold = false;
            isDim = false;
            isItalic = false;
            isUnderline = false;
          } else if (code === 1) {
            isBold = true;
          } else if (code === 2) {
            isDim = true;
          } else if (code === 3) {
            isItalic = true;
          } else if (code === 4) {
            isUnderline = true;
          } else if (ANSI_COLORS[code]) {
            currentColor = ANSI_COLORS[code];
          } else if (code >= 40 && code <= 47) {
            currentBg = ANSI_COLORS[code - 10];
          }
        }

        lastIndex = regex.lastIndex;
      }

      if (lastIndex < line.length) {
        lineSpans.push({
          text: line.slice(lastIndex),
          color: currentColor,
          background: currentBg,
          bold: isBold,
          dim: isDim,
          italic: isItalic,
          underline: isUnderline,
        });
      }

      result.push(lineSpans);
    }

    return result;
  }
}
