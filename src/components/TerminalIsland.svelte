<!-- src/components/TerminalIsland.svelte -->
<script lang="ts">
  import { terminalController, engineSession } from '../modules/appContext';
  import { FigureBoundary } from '../modules/figure/FigureBoundary';
  import type { AnsiSpan } from '../modules/terminal/TerminalController';

  let { onInterceptPlot } = $props<{
    onInterceptPlot: (cmd: string, reason: string) => void;
  }>();

  let lines = $state<AnsiSpan[][]>(terminalController.lines);
  let inputVal = $state(terminalController.currentInput);
  let terminalContainer: HTMLDivElement | null = null;
  let inputEl: HTMLInputElement | null = null;
  let promptNum = $state(1);

  $effect(() => {
    const unsubOutput = terminalController.onOutputChange((newLines) => {
      lines = newLines;
      scrollBottom();
    });
    const unsubInput = terminalController.onInputChange((txt) => {
      inputVal = txt;
    });
    return () => {
      unsubOutput();
      unsubInput();
    };
  });

  function scrollBottom() {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        if (terminalContainer) {
          terminalContainer.scrollTop = terminalContainer.scrollHeight;
        }
      });
    }
  }

  function handleContainerClick() {
    inputEl?.focus();
  }

  async function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = inputVal;
      if (!code.trim()) return;

      // 检查引擎是否就绪
      if (!engineSession.isReady) {
        terminalController.appendOutput('\x1b[33m[提示] GNU Octave 引擎尚未启动，请点击右上角「启动引擎」按钮加载。\x1b[0m\n');
        terminalController.flushOutput();
        scrollBottom();
        return;
      }

      // E6 GL 安全屏障前置检测
      const intercept = FigureBoundary.intercept(code);
      if (intercept.blocked) {
        onInterceptPlot(intercept.matchedCommand || code, intercept.reason || '');
        return;
      }

      promptNum++;
      await terminalController.submit();
      scrollBottom();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      terminalController.navigateHistoryUp();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      terminalController.navigateHistoryDown();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      terminalController.clear();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      if (engineSession.state === 'busy') {
        engineSession.interrupt();
      } else {
        terminalController.setInput('');
      }
    }
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    terminalController.setInput(target.value, target.selectionStart || 0);
  }
</script>

<div
  class="terminal-wrapper"
  bind:this={terminalContainer}
  onclick={handleContainerClick}
  role="region"
  aria-label="Octave Terminal"
>
  <!-- 历史输出行渲染区 -->
  <div class="terminal-output">
    {#each lines as line, lIdx (lIdx)}
      <div class="terminal-line">
        {#each line as span, sIdx (sIdx)}
          <span
            style:color={span.color}
            style:background-color={span.background}
            style:font-weight={span.bold ? 'bold' : 'normal'}
            style:font-style={span.italic ? 'italic' : 'normal'}
            style:text-decoration={span.underline ? 'underline' : 'none'}
            style:opacity={span.dim ? '0.7' : '1'}
          >{span.text}</span>
        {/each}
      </div>
    {/each}
  </div>

  <!-- 当前输入提示行 -->
  <div class="terminal-prompt-line">
    <span class="prompt-text">octave:{promptNum}&gt;&nbsp;</span>
    <input
      type="text"
      class="terminal-input"
      bind:this={inputEl}
      value={inputVal}
      oninput={handleInput}
      onkeydown={handleKeyDown}
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
    />
  </div>
</div>

<style>
  .terminal-wrapper {
    flex: 1;
    height: 100%;
    background: var(--bg-terminal);
    color: var(--text-main);
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 13px;
    line-height: 1.45;
    padding: 12px;
    overflow-y: auto;
    cursor: text;
    display: flex;
    flex-direction: column;
  }

  .terminal-output {
    white-space: pre-wrap;
    word-break: break-all;
  }

  .terminal-line {
    min-height: 19px;
  }

  .terminal-prompt-line {
    display: flex;
    align-items: center;
    margin-top: 4px;
    min-height: 24px;
  }

  .prompt-text {
    color: var(--accent-success);
    font-weight: 600;
    user-select: none;
    flex-shrink: 0;
  }

  .terminal-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-main);
    font-family: inherit;
    font-size: inherit;
    padding: 0;
    margin: 0;
  }
</style>
