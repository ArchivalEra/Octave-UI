import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TerminalController } from '../../src/modules/terminal/TerminalController';
import { HistoryStore } from '../../src/modules/history/HistoryStore';
import { EngineSupervisor } from '../../src/modules/engine/EngineSupervisor';
import { MockEmbedAdapter } from '../../src/modules/engine/MockEmbedAdapter';

describe('TerminalController Deep Module', () => {
  let history: HistoryStore;
  let adapter: MockEmbedAdapter;
  let supervisor: EngineSupervisor;
  let controller: TerminalController;

  beforeEach(async () => {
    history = new HistoryStore([]);
    adapter = new MockEmbedAdapter();
    // 合法注入：生产路径已禁 Mock 回退，测试替身必须经 factory 显式进入
    supervisor = new EngineSupervisor({ adapter, adapterFactory: () => adapter, skipPreflight: true });
    await supervisor.boot();
    controller = new TerminalController(history, supervisor);
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

  it('automatically flushes plot commands with drawnow on submit (D10)', async () => {
    let evaledCode = '';
    const spyAdapter = new MockEmbedAdapter();
    const origEval = spyAdapter.eval.bind(spyAdapter);
    spyAdapter.eval = async (code: string) => {
      evaledCode = code;
      return origEval(code);
    };
    const spySupervisor = new EngineSupervisor({ adapterFactory: () => spyAdapter, skipPreflight: true });
    await spySupervisor.boot();

    const term = new TerminalController(new HistoryStore(), spySupervisor);
    term.setInput('plot(1:10);');
    await term.submit();

    expect(evaledCode).toBe('plot(1:10);\ndrawnow;');
  });

  // ── R1（wayfinder #14，自 #11 移入）：终端 onError 通道接 ErrorSanitizer ──────
  // 上游 octave-embed.js:157 的硬编码中文（「eval 失败 rc=…（Octave 错误文本走
  // on.output 通道）」）是 bridge 文件不动；净化器在消费端拦——bridge 噪音剥掉、
  // 语义分类、按 locale 渲染。判据：终端错误输出无裸中文旁路（三语各测）。
  describe('R1: onError channel runs through ErrorSanitizer', () => {
    const rawBridgeError = "eval 失败 rc=2（Octave 错误文本走 on.output 通道）";

    function flattenedOf(ctrl: TerminalController): string {
      ctrl.flushOutput();
      return ctrl.lines.map(line => line.map(s => s.text).join('')).join('\n');
    }

    it('strips bridge noise (octave-embed.js:157 hard-coded Chinese bypass) from terminal error output', () => {
      adapter.emitError(rawBridgeError);
      const text = flattenedOf(controller);
      // bridge 噪音前缀必须被剥掉——不许「eval 失败 rc=2」裸出现在终端面
      expect(text).not.toContain('eval 失败 rc=2');
      expect(text).not.toContain('Octave 错误文本走 on.output 通道');
      // 净化器按 locale 渲染的人读文案必须在（zh-Hans 缺省：未知错误第一行）
      expect(text.trim().length).toBeGreaterThan(0);
    });

    it('classifies semantic errors per locale (zh-Hans / en / de 各测)', () => {
      const cases: Array<{ locale: 'zh-Hans' | 'en' | 'de'; expectText: string }> = [
        { locale: 'zh-Hans', expectText: '变量或函数' },
        { locale: 'en', expectText: 'is undefined' },
        { locale: 'de', expectText: 'ist nicht definiert' },
      ];
      for (const { locale, expectText } of cases) {
        controller.clear();
        controller.setLocale(locale);
        adapter.emitError("error: 'foo' undefined");
        const text = flattenedOf(controller);
        expect(text).toContain(expectText);
        // 原始英文错误串也已被分类渲染替换（不是原文直通）
        expect(text).not.toContain("error: 'foo' undefined");
      }
      controller.setLocale('zh-Hans');
    });

    it('renders singular-matrix errors with localized suggestion path (sanitizer format consumed)', () => {
      controller.clear();
      controller.setLocale('en');
      adapter.emitError('warning: matrix singular to machine precision');
      const text = flattenedOf(controller);
      expect(text).toContain('Matrix is singular');
      controller.setLocale('zh-Hans');
    });

    it('keeps unknown-family errors as first-line passthrough without bridge noise (反向：无中生有的分类不许出现)', () => {
      controller.clear();
      adapter.emitError('some totally unknown failure xyz');
      const text = flattenedOf(controller);
      // 未知族：净化器取第一行原样（zh-Hans 缺省路径）——不许编造分类徽标串
      expect(text).toContain('some totally unknown failure xyz');
      expect(text).not.toContain('SINGULAR_MATRIX');
      expect(text).not.toContain('UNDEFINED_VARIABLE');
    });
  });
});
