// tests/terminal/TerminalController.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TerminalController } from '../../src/modules/terminal/TerminalController';
import { HistoryStore } from '../../src/modules/history/HistoryStore';
import { EngineSession } from '../../src/modules/engine/EngineSession';
import { MockEmbedAdapter } from '../../src/modules/engine/MockEmbedAdapter';

describe('TerminalController Deep Module', () => {
  let history: HistoryStore;
  let adapter: MockEmbedAdapter;
  let session: EngineSession;
  let controller: TerminalController;

  beforeEach(() => {
    history = new HistoryStore([]);
    adapter = new MockEmbedAdapter();
    session = new EngineSession(adapter);
    controller = new TerminalController(history, session);
  });

  it('guarantees zero double-echo on submit', async () => {
    controller.setInput('a = 42;');
    await controller.submit();

    // 立即清空了输入框
    expect(controller.currentInput).toBe('');

    controller.flushOutput();

    // 检查 outputLines：只有引擎通过 on.output 汇出的内容，绝不包含客户端私自追加的 "a = 42;"
    const flattenedText = controller.lines.map(line => line.map(s => s.text).join('')).join('\n');
    expect(flattenedText).not.toContain('octave:1> a = 42;');
  });

  it('parses ANSI escape colors and bold styling accurately', () => {
    const raw = '\x1b[31mRed Alert\x1b[0m and \x1b[1;32mBold Green\x1b[0m';
    const parsed = controller.parseAnsi(raw);

    expect(parsed.length).toBe(1);
    const spans = parsed[0];
    expect(spans.length).toBe(3);

    expect(spans[0].text).toBe('Red Alert');
    expect(spans[0].color).toBe('var(--term-red, #e06c75)');

    expect(spans[1].text).toBe(' and ');
    expect(spans[1].color).toBeUndefined();

    expect(spans[2].text).toBe('Bold Green');
    expect(spans[2].color).toBe('var(--term-green, #98c379)');
    expect(spans[2].bold).toBe(true);
  });

  it('handles cursor movement, text insertion and backspace', () => {
    controller.setInput('hello');
    expect(controller.cursorPos).toBe(5);

    controller.moveCursorLeft();
    controller.moveCursorLeft();
    expect(controller.cursorPos).toBe(3);

    controller.insertText('X');
    expect(controller.currentInput).toBe('helXlo');
    expect(controller.cursorPos).toBe(4);

    controller.handleBackspace();
    expect(controller.currentInput).toBe('hello');
    expect(controller.cursorPos).toBe(3);

    controller.moveCursorHome();
    expect(controller.cursorPos).toBe(0);

    controller.moveCursorEnd();
    expect(controller.cursorPos).toBe(5);
  });

  it('navigates command history up and down with draft preservation', () => {
    history.push('cmd1');
    history.push('cmd2');

    controller.setInput('in-progress draft');

    controller.navigateHistoryUp();
    expect(controller.currentInput).toBe('cmd2');

    controller.navigateHistoryUp();
    expect(controller.currentInput).toBe('cmd1');

    controller.navigateHistoryDown();
    expect(controller.currentInput).toBe('cmd2');

    // 恢复原来的未提交草稿
    controller.navigateHistoryDown();
    expect(controller.currentInput).toBe('in-progress draft');
  });

  it('flushes pending chunks when clear is called', () => {
    controller.appendOutput('some text');
    controller.clear();
    expect(controller.lines.length).toBe(0);
  });
});
