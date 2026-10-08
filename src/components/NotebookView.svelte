<script lang="ts">
  import { projectWorkspace, supervisor, themeManager, i18n, t } from '../modules/appContext';
  import type { Locale } from '../modules/i18n/types';
  import type { ProjectCell } from '../modules/workspace/ProjectWorkspace';
  import type {
    PlotSemanticResult,
    MatrixSemanticResult,
    ScalarSemanticResult,
    ErrorSemanticResult,
  } from '../modules/semantic/SemanticResultRenderer';
  import { ErrorSanitizer } from '../modules/semantic/ErrorSanitizer';

  let { onOpenExamples } = $props<{
    onOpenExamples?: () => void;
  }>();

  let currentLocale = $state<Locale>(i18n.currentLocale);
  let cells = $state<ProjectCell[]>(projectWorkspace.cells);
  let isRunning = $state(projectWorkspace.isRunning);
  let activeFile = $state<string | null>(projectWorkspace.activeFile);
  let isMounted = $state<boolean>(projectWorkspace.isDirectoryMounted);
  let directoryName = $state<string | null>(projectWorkspace.directoryName);

  // 追踪所有挂载的文本框重算回调，以便全站字号缩放或窗口变化时即时响应
  const activeTextareaResizers = new Set<() => void>();

  $effect(() => {
    const unsubPw = projectWorkspace.subscribe(() => {
      cells = projectWorkspace.cells;
      isRunning = projectWorkspace.isRunning;
      activeFile = projectWorkspace.activeFile;
      isMounted = projectWorkspace.isDirectoryMounted;
      directoryName = projectWorkspace.directoryName;
    });
    const unsubI18n = i18n.subscribe((loc) => {
      currentLocale = loc;
    });
    // 当调色板修改全站字号或主题时，通知所有文本框重新测量高度
    const unsubTheme = themeManager.subscribe(() => {
      requestAnimationFrame(() => {
        activeTextareaResizers.forEach((resize) => resize());
      });
    });
    return () => {
      unsubPw();
      unsubI18n();
      unsubTheme();
    };
  });

  function autoResize(node: HTMLTextAreaElement, _dep?: any) {
    function resize() {
      node.style.height = 'auto';
      const borderOffset = node.offsetHeight - node.clientHeight;
      const targetHeight = Math.ceil(node.scrollHeight + borderOffset + 2);
      node.style.height = `${targetHeight}px`;
    }

    activeTextareaResizers.add(resize);
    resize();
    requestAnimationFrame(resize);

    const observer = new ResizeObserver(() => {
      resize();
    });
    observer.observe(node);

    node.addEventListener('input', resize);
    window.addEventListener('resize', resize);

    return {
      update() {
        resize();
        requestAnimationFrame(resize);
      },
      destroy() {
        activeTextareaResizers.delete(resize);
        observer.disconnect();
        node.removeEventListener('input', resize);
        window.removeEventListener('resize', resize);
      },
    };
  }

  async function handleMountLocalDir() {
    try {
      await projectWorkspace.mountLocalDirectory();
    } catch (err: any) {
      alert(t('workbench.mount_error', { error: err?.message || err }));
    }
  }

  async function handleReselectDir() {
    try {
      await projectWorkspace.reselectDirectory();
    } catch (err: any) {
      alert(t('workbench.mount_error', { error: err?.message || err }));
    }
  }

  function handleDisconnectDir() {
    projectWorkspace.disconnectDirectory();
  }

  function handleRun(id: string) {
    projectWorkspace.executeCell(id);
  }

  function handleRunAll() {
    projectWorkspace.executeAll();
  }

  function handleAddCell(afterId?: string) {
    projectWorkspace.addCell('', '', afterId);
  }

  function handleDeleteCell(id: string) {
    projectWorkspace.deleteCell(id);
  }

  function handleClear() {
    projectWorkspace.clearCells();
  }

  function handleSave() {
    projectWorkspace.saveActiveFile();
  }

  function handleKeyDown(e: KeyboardEvent, cell: ProjectCell) {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      handleRun(cell.id);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const val = target.value;
      target.value = val.substring(0, start) + '  ' + val.substring(end);
      target.selectionStart = target.selectionEnd = start + 2;
      projectWorkspace.updateCellCode(cell.id, target.value);
    }
  }

  // 计算高质量 SVG 折线路径
  function computePlotPath(x: number[], y: number[], width = 500, height = 240) {
    if (x.length < 2 || y.length < 2) return { path: '', minX: 0, maxX: 1, minY: 0, maxY: 1 };

    let minX = Math.min(...x);
    let maxX = Math.max(...x);
    let minY = Math.min(...y);
    let maxY = Math.max(...y);

    if (minX === maxX) maxX += 1;
    if (minY === maxY) {
      minY -= 1;
      maxY += 1;
    }

    const padding = { top: 20, right: 30, bottom: 30, left: 50 };
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;

    const points = x.map((xi, idx) => {
      const yi = y[idx] ?? 0;
      const px = padding.left + ((xi - minX) / (maxX - minX)) * plotW;
      const py = padding.top + (1 - (yi - minY) / (maxY - minY)) * plotH;
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    });

    return {
      path: `M ${points.join(' L ')}`,
      minX,
      maxX,
      minY,
      maxY,
      padding,
      plotW,
      plotH,
    };
  }
</script>

<div class="notebook-container">
  <!-- 工作台控制顶栏 -->
  <div class="notebook-toolbar">
    <div class="toolbar-left">
      <!-- 本地工程目录挂载 / 状态 -->
      {#if !isMounted}
        <button class="btn-action" onclick={handleMountLocalDir} title={t('workbench.mount_local_dir_tooltip')}>
          📁 {t('workbench.mount_local_dir')}
        </button>
      {:else}
        <div class="dir-badge" title={t('workbench.mounted_dir_prefix', { dir: directoryName || '' })}>
          <span class="dir-icon">📁</span>
          <span class="dir-name">{directoryName || t('workbench.local_dir_fallback')}</span>
          <button class="btn-switch-dir" onclick={handleReselectDir} title={t('workbench.reselect_dir_tooltip')}>
            🔄 {t('workbench.reselect_dir')}
          </button>
          <button class="btn-disconnect" onclick={handleDisconnectDir} title={t('workbench.disconnect_dir')}>✕</button>
        </div>
      {/if}

      <div class="file-badge" title={t('workbench.file_tooltip')}>
        <span class="file-icon">📜</span>
        <span class="file-name">{activeFile || t('workbench.file_untitled')}</span>
        {#if isMounted}
          <span class="file-mount-tag">{t('workbench.file_mount_tag')}</span>
        {/if}
      </div>
      <button class="btn-action primary" onclick={handleSave} title={t('workbench.save_tooltip')}>
        💾 {t('workbench.save')}
      </button>
      <button class="btn-action" onclick={() => handleAddCell()} title={t('workbench.add_cell')}>
        + {t('workbench.add_cell')}
      </button>
      <button
        class="btn-action"
        onclick={handleRunAll}
        disabled={isRunning}
        title={t('workbench.run_all')}
      >
        ▶ {t('workbench.run_all')}
      </button>
      <button class="btn-action" onclick={handleClear} title={t('workbench.clear')}>
        🗑 {t('workbench.clear')}
      </button>
    </div>
  </div>

  <!-- 单元格流 -->
  <div class="cells-list">
    {#each cells as cell, idx (cell.id)}
      <div class="cell-wrapper" class:running={cell.status === 'running'}>
        <!-- 单元格头部信息 -->
        <div class="cell-gutter">
          <span class="execution-badge">
            {#if cell.status === 'running'}
              <span class="spinner"></span>
            {:else if cell.executionCount !== null}
              [{cell.executionCount}]
            {:else}
              [ ]
            {/if}
          </span>
        </div>

        <div class="cell-main">
          <!-- 小节标题 (%% Section) -->
          <div class="cell-section-header">
            <span class="section-marker">%%</span>
            <input
              type="text"
              class="section-title-input"
              value={cell.title}
              placeholder={t('workbench.section_title_placeholder')}
              oninput={(e) => projectWorkspace.updateCellTitle(cell.id, (e.target as HTMLInputElement).value)}
            />
          </div>

          <!-- 小节注释 (% Comments) -->
          {#if cell.description || cell.status === 'idle'}
            <textarea
              use:autoResize={cell.description}
              class="section-desc-input"
              value={cell.description}
              placeholder={t('workbench.section_desc_placeholder')}
              oninput={(e) => projectWorkspace.updateCellDescription(cell.id, (e.target as HTMLTextAreaElement).value)}
            ></textarea>
          {/if}

          <!-- 代码输入区 -->
          <div class="cell-editor-box">
            <textarea
              use:autoResize={cell.code}
              class="code-input"
              value={cell.code}
              placeholder={t('workbench.empty_placeholder')}
              oninput={(e) =>
                projectWorkspace.updateCellCode(
                  cell.id,
                  (e.target as HTMLTextAreaElement).value
                )}
              onkeydown={(e) => handleKeyDown(e, cell)}
            ></textarea>

            <div class="editor-actions">
              <button
                class="btn-run"
                onclick={() => handleRun(cell.id)}
                disabled={cell.status === 'running'}
                title={t('workbench.run_cell')}
              >
                {#if cell.status === 'running'}
                  ⏳
                {:else}
                  ▶
                {/if}
              </button>
              <button
                class="btn-subaction"
                onclick={() => handleAddCell(cell.id)}
                title={t('workbench.add_cell')}
              >
                +
              </button>
              <button
                class="btn-subaction"
                onclick={() => handleDeleteCell(cell.id)}
                title={t('workbench.delete_cell')}
              >
                ✕
              </button>
            </div>
          </div>

          <!-- 结果呈现区 -->
          {#if cell.status === 'running'}
            <div class="cell-output running-state">
              <span class="spinner"></span>
              <span class="text">{t('workbench.computing_kernel')}</span>
            </div>
          {:else if cell.result}
            <div class="cell-output">
              <!-- 1. 绘图卡片 -->
              {#if cell.result.kind === 'plot'}
                {@const plot = cell.result as PlotSemanticResult}
                {@const meta = computePlotPath(plot.data.x, plot.data.y)}
                <div class="result-card plot-card">
                  <div class="card-header">
                    <span class="card-title">
                      📈 {t('workbench.plot_title', { count: plot.data.count })}
                    </span>
                    <span class="card-stats">
                      X: [{meta.minX.toFixed(2)}, {meta.maxX.toFixed(2)}] · Y: [{meta.minY.toFixed(2)}, {meta.maxY.toFixed(2)}]
                    </span>
                  </div>
                  <div class="plot-canvas-wrapper">
                    <svg
                      viewBox="0 0 500 240"
                      class="plot-svg"
                      preserveAspectRatio="xMidYMid meet"
                    >
                      <!-- 坐标系背景网格 -->
                      <rect
                        x={meta.padding?.left || 50}
                        y={meta.padding?.top || 20}
                        width={meta.plotW || 420}
                        height={meta.plotH || 190}
                        fill="rgba(0,0,0,0.2)"
                        stroke="rgba(255,255,255,0.1)"
                      />
                      <!-- 折线 -->
                      <path
                        d={meta.path}
                        fill="none"
                        stroke="#38bdf8"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </div>
                </div>

              <!-- 2. 矩阵卡片 -->
              {:else if cell.result.kind === 'matrix'}
                {@const mat = cell.result as MatrixSemanticResult}
                <div class="result-card matrix-card">
                  <div class="card-header">
                    <span class="card-title">
                      🔢 {t('workbench.matrix_title', {
                        name: mat.name || 'ans',
                        rows: mat.rows,
                        cols: mat.cols,
                      })}
                    </span>
                  </div>
                  <div class="matrix-table-wrapper">
                    <table class="matrix-table">
                      <tbody>
                        {#each mat.values as row}
                          <tr>
                            {#each row as val}
                              <td>{typeof val === 'number' ? val.toFixed(4) : val}</td>
                            {/each}
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                </div>

              <!-- 3. 标量卡片 -->
              {:else if cell.result.kind === 'scalar'}
                {@const sc = cell.result as ScalarSemanticResult}
                <div class="result-card scalar-card">
                  <div class="scalar-label">{t('workbench.scalar_title', { name: sc.name || 'ans' })}</div>
                  <div class="scalar-value">{sc.value}</div>
                </div>

              <!-- 4. 净化错误卡片 -->
              {:else if cell.result.kind === 'sanitized_error'}
                {@const err = cell.result as ErrorSemanticResult}
                {@const formatted = ErrorSanitizer.format(err.error, currentLocale)}
                <div class="result-card error-card">
                  <div class="error-header">
                    <span class="error-badge">⚠️ {formatted.badge}</span>
                    <span class="error-summary">{formatted.summary}</span>
                  </div>
                  {#if formatted.suggestion}
                    <div class="error-suggestion">
                      💡 <strong>{t('workbench.suggestion')}</strong> {formatted.suggestion}
                    </div>
                  {/if}
                  <details class="raw-error-details">
                    <summary>{t('workbench.raw_error_details')}</summary>
                    <pre><code>{err.error.raw}</code></pre>
                  </details>
                </div>

              <!-- 5. 纯文本流 -->
              {:else if cell.result.kind === 'stream'}
                {#if (cell.streamingOutput || cell.result.text).trim()}
                  <div class="result-card stream-card">
                    <pre><code>{cell.streamingOutput || cell.result.text}</code></pre>
                  </div>
                {/if}
              {/if}

              <!-- 执行耗时指示 -->
              {#if cell.durationMs !== undefined}
                <div class="cell-duration">
                  {t('workbench.execution_time', { ms: cell.durationMs })}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .notebook-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-canvas);
  }

  .notebook-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--bg-surface);
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    gap: 8px;
    scrollbar-width: none;
  }

  .notebook-toolbar::-webkit-scrollbar {
    display: none;
  }

  .toolbar-left,
  .toolbar-right {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
  }

  .btn-action {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    color: var(--text-main);
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-action:hover:not(:disabled) {
    background: var(--bg-surface-hover);
  }

  .btn-action.primary {
    background: var(--accent-primary);
    color: #ffffff;
    font-weight: 600;
    border-color: transparent;
  }

  .btn-action:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-examples {
    background: rgba(56, 139, 253, 0.1);
    border: 1px solid var(--accent-primary);
    color: var(--accent-primary);
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-examples:hover {
    background: rgba(56, 139, 253, 0.2);
  }

  .cells-list {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px 60px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .cell-wrapper {
    display: flex;
    gap: 12px;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 14px;
    transition: border-color 0.2s;
  }

  .cell-wrapper:hover {
    border-color: var(--accent-primary);
  }

  .cell-wrapper.running {
    border-color: var(--accent-primary);
  }

  .cell-gutter {
    width: 36px;
    padding-top: 6px;
    text-align: right;
  }

  .execution-badge {
    font-family: var(--font-mono, monospace);
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .cell-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  .cell-editor-box {
    display: flex;
    gap: 8px;
    position: relative;
  }

  .code-input {
    flex: 1;
    box-sizing: border-box;
    background: var(--bg-surface-hover);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    padding: 10px 12px;
    font-family: var(--font-mono, monospace);
    font-size: 0.875rem;
    color: var(--text-main);
    outline: none;
    line-height: 1.5;
    resize: none;
    min-height: 3.5rem;
    overflow-y: hidden;
  }

  .code-input:focus {
    border-color: var(--accent-primary);
  }

  .editor-actions {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .btn-run {
    background: var(--accent-primary);
    color: #ffffff;
    border: none;
    border-radius: 6px;
    width: 32px;
    height: 32px;
    font-size: 0.9rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-run:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-subaction {
    background: transparent;
    border: 1px solid var(--border-subtle);
    color: var(--text-muted);
    border-radius: 6px;
    width: 32px;
    height: 28px;
    font-size: 0.8rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-subaction:hover {
    background: var(--bg-surface-hover);
    color: var(--text-main);
  }

  .cell-output {
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-top: 1px dashed var(--border-subtle);
    padding-top: 10px;
  }

  .running-state {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--accent-primary);
    font-size: 0.85rem;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(56, 139, 253, 0.3);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    display: inline-block;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .result-card {
    background: var(--bg-surface-hover);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    padding: 12px;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .card-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-main);
  }

  .card-stats {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-family: var(--font-mono, monospace);
  }

  .plot-canvas-wrapper {
    background: var(--bg-terminal);
    border-radius: 6px;
    padding: 8px;
  }

  .plot-svg {
    width: 100%;
    height: auto;
    max-height: 240px;
  }

  .matrix-table-wrapper {
    overflow-x: auto;
  }

  .matrix-table {
    border-collapse: collapse;
    font-family: var(--font-mono, monospace);
    font-size: 0.85rem;
  }

  .matrix-table td {
    border: 1px solid var(--border-subtle);
    padding: 6px 12px;
    color: var(--text-main);
    text-align: right;
  }

  .scalar-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 16px;
    background: rgba(56, 139, 253, 0.08);
    border-color: var(--border-subtle);
  }

  .scalar-label {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-family: var(--font-mono, monospace);
  }

  .scalar-value {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--accent-primary);
    font-family: var(--font-mono, monospace);
  }

  .error-card {
    background: rgba(248, 81, 73, 0.1);
    border-color: var(--accent-danger);
  }

  .error-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .error-badge {
    background: var(--accent-danger);
    color: #ffffff;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 700;
  }

  .error-summary {
    color: var(--accent-danger);
    font-size: 0.85rem;
    font-weight: 600;
  }

  .error-suggestion {
    font-size: 0.825rem;
    color: var(--text-main);
    margin-bottom: 8px;
  }

  .raw-error-details summary {
    font-size: 0.75rem;
    color: var(--text-muted);
    cursor: pointer;
  }

  .raw-error-details pre {
    margin: 4px 0 0;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .stream-card pre {
    margin: 0;
    font-family: var(--font-mono, monospace);
    font-size: 0.825rem;
    color: var(--text-main);
  }

  .cell-duration {
    font-size: 0.7rem;
    color: var(--text-muted);
    text-align: right;
  }

  .dir-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(137, 180, 250, 0.15);
    border: 1px solid rgba(137, 180, 250, 0.4);
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 12px;
    color: var(--accent-primary, #89b4fa);
    font-weight: 500;
  }

  .dir-name {
    font-family: var(--font-mono, monospace);
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btn-switch-dir {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(137, 180, 250, 0.3);
    color: var(--accent-primary, #89b4fa);
    cursor: pointer;
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    transition: all 0.15s ease;
  }

  .btn-switch-dir:hover {
    background: rgba(137, 180, 250, 0.25);
    color: var(--text-main);
  }

  .btn-disconnect {
    background: transparent;
    border: none;
    color: var(--text-muted, #a6adc8);
    cursor: pointer;
    font-size: 11px;
    padding: 0 2px;
    border-radius: 3px;
  }

  .btn-disconnect:hover {
    color: var(--accent-danger, #f38ba8);
  }

  .file-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--bg-canvas);
    border: 1px solid var(--border-subtle);
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 0.825rem;
    color: var(--text-main);
  }

  .file-name {
    font-family: var(--font-mono, monospace);
    font-weight: 600;
  }

  .file-mount-tag {
    font-size: 10px;
    background: rgba(166, 227, 161, 0.2);
    color: #a6e3a1;
    padding: 1px 4px;
    border-radius: 3px;
  }

  .cell-section-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .section-marker {
    color: var(--accent-primary);
    font-family: var(--font-mono, monospace);
    font-weight: 700;
    font-size: 0.95rem;
  }

  .section-title-input {
    flex: 1;
    background: transparent;
    border: none;
    border-bottom: 1px dashed var(--border-subtle);
    color: var(--text-main);
    font-weight: 600;
    font-size: 0.9rem;
    padding: 2px 4px;
    outline: none;
  }

  .section-title-input:focus {
    border-bottom-color: var(--accent-primary);
  }

  .section-desc-input {
    box-sizing: border-box;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    color: var(--text-muted);
    font-size: 0.85rem;
    padding: 8px 10px;
    line-height: 1.5;
    outline: none;
    resize: none;
    min-height: 2.2rem;
    overflow-y: hidden;
  }

  .section-desc-input:focus {
    border-color: var(--accent-primary);
    color: var(--text-main);
  }

  @media (max-width: 768px) {
    .cells-list {
      padding: 12px 10px 60px;
      gap: 12px;
    }

    .cell-wrapper {
      padding: 10px;
      gap: 8px;
    }

    .cell-gutter {
      width: 24px;
      padding-top: 4px;
    }

    .cell-editor-box {
      flex-direction: column;
      gap: 8px;
    }

    .editor-actions {
      flex-direction: row;
      justify-content: flex-end;
      align-items: center;
      gap: 8px;
    }

    .btn-run {
      width: 36px;
      height: 32px;
    }

    .btn-subaction {
      width: 32px;
      height: 32px;
    }
  }
</style>
