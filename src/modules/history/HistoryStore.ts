// src/modules/history/HistoryStore.ts
// 历史记录自治仓储：1000 条上限硬截断、连续去重、localStorage 存取与上下翻找光标

export interface HistoryItem {
  id: number;
  command: string;
  timestamp: number;
}

export class HistoryStore {
  public static readonly STORAGE_KEY = 'octave_ui_history';
  public static readonly MAX_ITEMS = 1000;

  private _items: string[] = [];
  private _cursor = -1;
  private _stash = '';
  private _listeners: Set<(items: string[]) => void> = new Set();

  constructor(initialItems?: string[]) {
    if (initialItems) {
      this._items = initialItems.slice(-HistoryStore.MAX_ITEMS);
    } else {
      this.load();
    }
  }

  private _getStorage(): Storage | null {
    if (typeof window !== 'undefined') {
      try {
        return window.localStorage || null;
      } catch {
        return null;
      }
    }
    return null;
  }

  load(): void {
    const storage = this._getStorage();
    if (!storage) return;
    try {
      const raw = storage.getItem(HistoryStore.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this._items = parsed.filter(x => typeof x === 'string' && x.trim().length > 0).slice(-HistoryStore.MAX_ITEMS);
        }
      }
    } catch {
      // LocalStorage 不可用或损坏时降级
    }
  }

  save(): void {
    const storage = this._getStorage();
    if (!storage) return;
    try {
      storage.setItem(HistoryStore.STORAGE_KEY, JSON.stringify(this._items));
    } catch {
      // 配额超额等容错
    }
  }

  push(command: string): void {
    const trimmed = command.trim();
    if (!trimmed) return;

    // 连续重复命令去重
    if (this._items.length > 0 && this._items[this._items.length - 1] === trimmed) {
      this.resetCursor();
      return;
    }

    this._items.push(trimmed);

    // 1000 条上限截断
    if (this._items.length > HistoryStore.MAX_ITEMS) {
      this._items = this._items.slice(this._items.length - HistoryStore.MAX_ITEMS);
    }

    this.resetCursor();
    this.save();
    this._notify();
  }

  get isNavigating(): boolean {
    return this._cursor !== -1;
  }

  subscribe(cb: (items: string[]) => void): () => void {
    this._listeners.add(cb);
    cb(this.getAll());
    return () => this._listeners.delete(cb);
  }

  private _notify(): void {
    const all = this.getAll();
    for (const cb of this._listeners) {
      cb(all);
    }
  }

  resetCursor(): void {
    this._cursor = -1;
    this._stash = '';
  }

  /**
   * 向上查找更早的历史记录
   */
  getPrevious(currentInput: string): string {
    if (this._items.length === 0) return currentInput;

    if (this._cursor === -1) {
      this._stash = currentInput;
      this._cursor = this._items.length - 1;
      return this._items[this._cursor];
    }

    if (this._cursor > 0) {
      this._cursor--;
      return this._items[this._cursor];
    }

    return this._items[0];
  }

  /**
   * 向下查找较新的历史记录或恢复暂存草稿
   */
  getNext(currentInput?: string): string {
    if (this._cursor === -1) {
      return currentInput !== undefined ? currentInput : this._stash;
    }

    if (this._cursor < this._items.length - 1) {
      this._cursor++;
      return this._items[this._cursor];
    }

    // 已经回到底部，恢复暂存草稿
    const restored = this._stash;
    this.resetCursor();
    return restored;
  }

  getAll(): string[] {
    return [...this._items];
  }

  search(keyword: string): string[] {
    if (!keyword) return this.getAll();
    const lower = keyword.toLowerCase();
    return this._items.filter(item => item.toLowerCase().includes(lower));
  }

  clear(): void {
    this._items = [];
    this.resetCursor();
    this.save();
    this._notify();
  }

  get length(): number {
    return this._items.length;
  }
}
