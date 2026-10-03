// tests/history/HistoryStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { HistoryStore } from '../../src/modules/history/HistoryStore';

describe('HistoryStore Deep Module', () => {
  let store: HistoryStore;

  beforeEach(() => {
    window.localStorage.clear();
    store = new HistoryStore([]);
  });

  it('enforces a strict 1000-item maximum capacity', () => {
    for (let i = 0; i < 1100; i++) {
      store.push(`cmd_${i}`);
    }

    expect(store.length).toBe(1000);
    const all = store.getAll();
    expect(all[0]).toBe('cmd_100');
    expect(all[999]).toBe('cmd_1099');
  });

  it('deduplicates consecutive identical commands', () => {
    store.push('disp("hello")');
    store.push('disp("hello")');
    store.push('disp("hello")');

    expect(store.length).toBe(1);

    store.push('disp("world")');
    expect(store.length).toBe(2);

    store.push('disp("hello")');
    expect(store.length).toBe(3);
  });

  it('navigates history using getPrevious and getNext with stashed draft', () => {
    store.push('first');
    store.push('second');

    expect(store.getPrevious('my current line')).toBe('second');
    expect(store.getPrevious('my current line')).toBe('first');
    // 已经到顶，保持在最旧的一条
    expect(store.getPrevious('my current line')).toBe('first');

    expect(store.getNext()).toBe('second');
    // 到底部，返回暂存的草稿
    expect(store.getNext()).toBe('my current line');
  });

  it('filters history via case-insensitive search', () => {
    store.push('A = magic(4);');
    store.push('B = svd(A);');
    store.push('disp(B);');

    expect(store.search('svd')).toEqual(['B = svd(A);']);
    expect(store.search('MAGIC')).toEqual(['A = magic(4);']);
    expect(store.search('x')).toEqual([]);
  });

  it('persists commands into localStorage and reloads them', () => {
    store.push('x = 10;');
    store.push('y = 20;');

    const reloaded = new HistoryStore();
    expect(reloaded.length).toBe(2);
    expect(reloaded.getAll()).toEqual(['x = 10;', 'y = 20;']);
  });

  it('notifies subscribers reactively on push and clear', () => {
    const states: string[][] = [];
    const unsub = store.subscribe((items) => states.push(items));

    store.push('z = 30;');
    store.push('w = 40;');
    store.clear();

    expect(states.length).toBe(4); // initial + push1 + push2 + clear
    expect(states[states.length - 1]).toEqual([]);
    unsub();
  });

  it('protects against clearing input when pressing Down Arrow at bottom', () => {
    expect(store.isNavigating).toBe(false);
    expect(store.getNext('active draft')).toBe('active draft');

    store.push('echo 1');
    expect(store.getPrevious('my draft')).toBe('echo 1');
    expect(store.isNavigating).toBe(true);

    expect(store.getNext('my draft')).toBe('my draft');
    expect(store.isNavigating).toBe(false);
    // 再次调用 getNext 不清空草稿
    expect(store.getNext('my draft')).toBe('my draft');
  });
});
