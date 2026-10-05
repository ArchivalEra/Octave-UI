<!-- src/components/TerminalIsland.svelte -->
<script lang="ts">
  import { terminalController, supervisor, capabilityPolicy } from '../modules/appContext';
  import type { SupervisorState, CrashCause } from '../modules/engine/types';
  import { EngineCrashedError } from '../modules/engine/types';
  import type { AnsiSpan } from '../modules/terminal/TerminalController';

  let { onInterceptPlot } = $props<{
    onInterceptPlot: (cmd: string, reason: string) => void;
  }>();

  let lines = $state<AnsiSpan[][]>(terminalController.lines);
  let inputVal = $state(terminalController.currentInput);
  let supervisorState = $state<SupervisorState>(supervisor.state);
  let crashCause = $state<CrashCause | null>(supervisor.crashCause);
  let unstartedCode = $state<string | null>(null);

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
    const unsubState = supervisor.onStateTransition((evt) => {
      supervisorState = evt.to;
      if (evt.to === 'crashed') {
        crashCause = evt.cause || supervisor.crashCause || 'trap';
      } else if (evt.to === 'idle') {
        crashCause = null;
      }
    });
    return () => {
      unsubOutput();
      unsubInput();
      unsubState();
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

      // 检查引擎状态
      if (supervisorState === 'crashed' || supervisorState === 'failed') {
        terminalController.appendOutput(`\x1b[31m[错误] 引擎当前处于 '${supervisorState}' 状态。请先点击「原地恢复」自愈引擎。\x1b[0m\n`);
        terminalController.flushOutput();
        scrollBottom();
        return;
      }

      if (supervisorState === 'aborting') {
        terminalController.appendOutput('\x1b[33m[提示] 引擎正在中断中，请等待中断完成或点击「强制杀死」。\x1b[0m\n');
        terminalController.flushOutput();
        scrollBottom();
        return;
      }

      if (supervisorState === 'recovering' || supervisorState === 'booting') {
        terminalController.appendOutput(`\x1b[33m[提示] 引擎正在${supervisorState === 'recovering' ? '恢复' : '启动'}中，请稍候…\x1b[0m\n`);
        terminalController.flushOutput();
        scrollBottom();
        return;
      }

      if (!supervisor.isReady) {
        terminalController.appendOutput('\x1b[33m[提示] GNU Octave 引擎尚未启动，请点击右上角「启动引擎」按钮加载。\x1b[0m\n');
        terminalController.flushOutput();
        scrollBottom();
        return;
      }

      // 出队执行时能力核验（Time-of-Dequeue）
      const decision = await capabilityPolicy.evaluateAtDequeue(code);
      if (!decision.allowed) {
        onInterceptPlot(decision.matchedCommand || code, decision.reason || '');
        return;
      }

      promptNum++;
      try {
        await terminalController.submit();
      } catch (err: any) {
        if (err instanceof EngineCrashedError && !err.started) {
          unstartedCode = code;
        }
      }
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
      if (supervisor.state === 'busy') {
        supervisor.abort(1500);
      } else {
        terminalController.setInput('');
      }
    }
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    terminalController.setInput(target.value, target.selectionStart || 0);
  }

  function handleRecover() {
    supervisor.recover().catch(() => {});
  }

  function handleKill() {
    supervisor.kill('user-kill');
  }

  function handleRetryUnstarted() {
    if (unstartedCode) {
      terminalController.setInput(unstartedCode);
      unstartedCode = null;
      inputEl?.focus();
    }
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

  <!-- 状态异常通知与自愈操作区 -->
  {#if supervisorState === 'aborting'}
    <div class="status-banner banner-aborting">
      <span>⚠️ 正在尝试中断计算… 若引擎挂起死锁，可执行硬终止：</span>
      <button class="btn btn-sm btn-danger" onclick={handleKill}>强制杀死 (Kill)</button>
    </div>
  {:else if supervisorState === 'crashed'}
    <div class="status-banner banner-crashed">
      <span>💥 引擎已崩溃 (诱因: {crashCause || 'trap'})，命令历史与输出已保留。</span>
      <div class="banner-actions">
        <button class="btn btn-sm btn-warning" onclick={handleRecover}>原地恢复 (Recover)</button>
        {#if unstartedCode}
          <button class="btn btn-sm btn-secondary" onclick={handleRetryUnstarted}>
            重新填入未启动命令: {unstartedCode}
          </button>
        {/if}
      </div>
    </div>
  {:else if supervisorState === 'failed'}
    <div class="status-banner banner-failed">
      <span>🛑 熔断器已触发：连续恢复失败已达上限，引擎处于不可用终端态。</span>
    </div>
  {/if}

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
      disabled={supervisorState === 'crashed' || supervisorState === 'failed' || supervisorState === 'aborting' || supervisorState === 'recovering'}
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

  .status-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 6px;
    margin: 8px 0;
    font-size: 12px;
  }

  .banner-aborting {
    background: rgba(220, 53, 69, 0.15);
    border: 1px solid var(--accent-danger);
    color: var(--accent-danger);
  }

  .banner-crashed {
    background: rgba(210, 153, 34, 0.15);
    border: 1px solid var(--accent-warning);
    color: var(--accent-warning);
  }

  .banner-failed {
    background: rgba(220, 53, 69, 0.2);
    border: 1px solid var(--accent-danger);
    color: var(--accent-danger);
  }

  .banner-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-sm {
    padding: 2px 8px;
    font-size: 12px;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid transparent;
  }

  .btn-danger {
    background: var(--accent-danger);
    color: #fff;
  }

  .btn-warning {
    background: var(--accent-warning);
    color: #fff;
  }

  .btn-secondary {
    background: var(--bg-surface);
    color: var(--text-main);
    border-color: var(--border-subtle);
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
