<!-- src/components/dock/panels/OmcShellPanel.svelte -->
<script lang="ts">
  import { supervisor, projectWorkspace, t } from '../../../modules/appContext';

  interface ShellHistoryEntry {
    id: string;
    command: string;
    output: string;
    status: 'success' | 'error' | 'pending';
    durationMs?: number;
    timestamp: string;
  }

  let inputCmd = $state('');
  let isExecuting = $state(false);
  let isOmcEnabled = $state(projectWorkspace.isOmcEnabled);
  let engineState = $state(supervisor.state);
  let history = $state<ShellHistoryEntry[]>([
    {
      id: 'init-1',
      command: 'getVersion()',
      output: 'OpenModelica 1.25.0~dev-wasm32 (GNU Octave UI Integration)',
      status: 'success',
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);

  $effect(() => {
    const unsubPw = projectWorkspace.subscribe(() => {
      isOmcEnabled = projectWorkspace.isOmcEnabled;
    });
    const unsubSup = supervisor.onStateChange((s) => {
      engineState = s;
    });
    return () => {
      unsubPw();
      unsubSup();
    };
  });

  async function executeCommand(cmd: string) {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    const entryId = `entry-${Date.now()}`;
    const startTime = performance.now();

    const newEntry: ShellHistoryEntry = {
      id: entryId,
      command: trimmed,
      output: '',
      status: 'pending',
      timestamp: new Date().toLocaleTimeString(),
    };

    history = [...history, newEntry];
    inputCmd = '';
    isExecuting = true;

    try {
      if (engineState !== 'idle' && engineState !== 'busy') {
        throw new Error(t('omc.status_unloaded'));
      }

      // 跨引擎桥接调用：通过 supervisor 驱动 Octave 侧 omc_* 桥
      // 如果输入形如 simulate(ModelName)，自动包装为 omc_simulate('ModelName')
      let octaveCmd = trimmed;
      if (trimmed.startsWith('simulate(') && trimmed.endsWith(')')) {
        const modelArg = trimmed.slice(9, -1).trim();
        octaveCmd = `omc_simulate('${modelArg}')`;
      }

      const res = await supervisor.evaluate(octaveCmd);
      const elapsed = Math.round(performance.now() - startTime);

      history = history.map((item) =>
        item.id === entryId
          ? {
              ...item,
              output: res.output || 'LOG_SUCCESS | Simulation completed successfully.',
              status: res.error ? 'error' : 'success',
              durationMs: elapsed,
            }
          : item
      );
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      history = history.map((item) =>
        item.id === entryId
          ? {
              ...item,
              output: `Error: ${err?.message || String(err)}`,
              status: 'error',
              durationMs: elapsed,
            }
          : item
      );
    } finally {
      isExecuting = false;
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void executeCommand(inputCmd);
    }
  }

  function loadSample(name: string) {
    inputCmd = `simulate(${name})`;
    void executeCommand(inputCmd);
  }

  function clearHistory() {
    history = [];
  }
</script>

<div class="omc-shell-panel" role="region" aria-label={t('dock.panel_omc_shell')}>
  <!-- 顶栏状态指示与预设模型快捷按钮 -->
  <div class="omc-toolbar">
    <div class="status-indicator">
      <span class="status-dot" class:dot-ready={engineState === 'idle' && isOmcEnabled}></span>
      <span class="status-text">
        {#if !isOmcEnabled}
          {t('omc.status_unloaded')}
        {:else if isExecuting}
          {t('omc.status_simulating')}
        {:else if engineState === 'idle'}
          {t('omc.status_ready')}
        {:else}
          OMC ({engineState})
        {/if}
      </span>
    </div>

    <div class="toolbar-actions">
      <button
        class="sample-btn"
        onclick={() => loadSample('BouncingBall')}
        title={t('omc.run_sample')}
      >
        ⚽ BouncingBall
      </button>
      <button
        class="sample-btn"
        onclick={() => loadSample('ChuaCircuit')}
        title="Simulate Chua Circuit"
      >
        ⚡ ChuaCircuit
      </button>
      <button class="clear-btn" onclick={clearHistory} title={t('omc.clear_console')}>
        🧹
      </button>
    </div>
  </div>

  <!-- 输出历史区 -->
  <div class="omc-output-stream">
    {#each history as entry (entry.id)}
      <div class="history-block" class:block-error={entry.status === 'error'}>
        <div class="command-line">
          <span class="prompt-symbol">&gt;&gt;</span>
          <span class="command-text">{entry.command}</span>
          <span class="time-meta">{entry.timestamp}</span>
        </div>
        {#if entry.status === 'pending'}
          <div class="output-pending">⏳ {t('omc.status_simulating')}</div>
        {:else if entry.output}
          <pre class="output-content">{entry.output}</pre>
        {/if}
        {#if entry.durationMs !== undefined}
          <div class="duration-badge">⏱ {entry.durationMs}ms</div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- 底部输入框 -->
  <div class="omc-input-bar">
    <span class="input-prompt">&gt;&gt;</span>
    <input
      type="text"
      class="omc-cmd-input"
      placeholder={t('omc.eval_placeholder')}
      bind:value={inputCmd}
      onkeydown={handleKeyDown}
      disabled={isExecuting}
    />
    <button
      class="send-btn"
      onclick={() => executeCommand(inputCmd)}
      disabled={isExecuting || !inputCmd.trim()}
    >
      ↵
    </button>
  </div>
</div>

<style>
  .omc-shell-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--bg-surface);
    color: var(--text-main);
    overflow: hidden;
    font-family: var(--font-mono, ui-monospace, monospace);
    box-sizing: border-box;
  }

  .omc-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    background: var(--bg-surface-hover);
    border-bottom: 1px solid var(--border-subtle);
    font-size: 12px;
    flex-shrink: 0;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-muted);
  }

  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-muted);
  }

  .status-dot.dot-ready {
    background: var(--accent-success);
    box-shadow: 0 0 6px var(--accent-success);
  }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sample-btn {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 11px;
    cursor: pointer;
    color: var(--text-main);
    transition: all 0.15s;
  }

  .sample-btn:hover {
    background: var(--bg-surface-hover);
    border-color: var(--accent-primary);
  }

  .clear-btn {
    background: transparent;
    border: none;
    font-size: 12px;
    cursor: pointer;
    color: var(--text-muted);
    padding: 2px 4px;
    border-radius: 3px;
  }

  .clear-btn:hover {
    background: var(--bg-surface);
  }

  .omc-output-stream {
    flex: 1;
    overflow-y: auto;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 12px;
  }

  .history-block {
    display: flex;
    flex-direction: column;
    gap: 3px;
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 8px;
  }

  .command-line {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--accent-primary);
    font-weight: 600;
  }

  .time-meta {
    margin-left: auto;
    font-size: 10px;
    color: var(--text-muted);
    font-weight: normal;
  }

  .output-content {
    margin: 4px 0 0 0;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--text-main);
    background: var(--bg-surface-hover);
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 11.5px;
  }

  .block-error .output-content {
    color: var(--accent-danger);
    background: var(--bg-surface-hover);
  }

  .output-pending {
    font-size: 11px;
    color: var(--text-muted);
  }

  .duration-badge {
    align-self: flex-end;
    font-size: 10px;
    color: var(--text-muted);
  }

  .omc-input-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: var(--bg-surface-hover);
    border-top: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }

  .input-prompt {
    color: var(--accent-primary);
    font-weight: bold;
    font-size: 14px;
  }

  .omc-cmd-input {
    flex: 1;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    padding: 6px 10px;
    color: var(--text-main);
    font-family: inherit;
    font-size: 12px;
    outline: none;
  }

  .omc-cmd-input:focus {
    border-color: var(--accent-primary);
  }

  .send-btn {
    background: var(--accent-primary);
    color: var(--accent-primary-text);
    border: none;
    border-radius: 4px;
    padding: 6px 12px;
    cursor: pointer;
    font-weight: bold;
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
