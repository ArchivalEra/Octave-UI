<!-- src/components/SidebarIsland.svelte -->
<script lang="ts">
  import {
    workspaceStore,
    filesystemStore,
    historyStore,
    supervisor,
    terminalController,
  } from '../modules/appContext';
  import { WorkspaceStore } from '../modules/workspace/WorkspaceStore';
  import type { WorkspaceVariable, FsEntry } from '../modules/engine/types';

  type Tab = 'workspace' | 'files' | 'history' | 'docs';
  let activeTab = $state<Tab>('workspace');

  // Workspace State
  let variables = $state<WorkspaceVariable[]>(workspaceStore.variables);

  // Filesystem State
  let currentDir = $state<string>(filesystemStore.currentDir);
  let files = $state<FsEntry[]>(filesystemStore.entries);

  // History State
  let historySearch = $state('');
  let historyList = $state<string[]>(historyStore.getAll());
  let filteredHistory = $derived(
    historySearch.trim()
      ? historyList.filter((item) => item.toLowerCase().includes(historySearch.toLowerCase()))
      : historyList
  );

  // Docs State
  let docQuery = $state('');
  let docContent = $state('');
  let docLoading = $state(false);

  $effect(() => {
    const unsubWs = workspaceStore.subscribe((vars) => {
      variables = vars;
    });
    const unsubFs = filesystemStore.subscribe((entries, dir) => {
      files = entries;
      currentDir = dir;
    });
    const unsubHist = historyStore.subscribe((items) => {
      historyList = items;
    });
    return () => {
      unsubWs();
      unsubFs();
      unsubHist();
    };
  });

  function refreshWorkspace() {
    workspaceStore.refresh();
  }

  function refreshFiles() {
    filesystemStore.refresh();
  }

  function handleFileDownload(name: string) {
    filesystemStore.downloadFile(name);
  }

  function handleFileDelete(name: string) {
    filesystemStore.removeFile(name);
  }

  function handleHistoryClick(cmd: string) {
    terminalController.setInput(cmd);
  }

  function handleHistoryClear() {
    historyStore.clear();
    historyList = [];
  }

  async function handleQueryDoc() {
    if (!docQuery.trim()) return;
    docLoading = true;
    try {
      docContent = await supervisor.queryDocumentation(docQuery.trim());
    } catch (err: any) {
      docContent = `查询失败: ${err.message || String(err)}`;
    } finally {
      docLoading = false;
    }
  }
</script>

<aside class="sidebar">
  <!-- 标签栏导航 -->
  <div class="tabs-header">
    <button
      class="tab-btn"
      class:active={activeTab === 'workspace'}
      onclick={() => (activeTab = 'workspace')}
    >工作区</button>
    <button
      class="tab-btn"
      class:active={activeTab === 'files'}
      onclick={() => (activeTab = 'files')}
    >文件</button>
    <button
      class="tab-btn"
      class:active={activeTab === 'history'}
      onclick={() => (activeTab = 'history')}
    >历史</button>
    <button
      class="tab-btn"
      class:active={activeTab === 'docs'}
      onclick={() => (activeTab = 'docs')}
    >文档</button>
  </div>

  <div class="tab-content">
    <!-- 1. 工作区面板 -->
    {#if activeTab === 'workspace'}
      <div class="panel">
        <div class="panel-toolbar">
          <span class="panel-title">变量表 ({variables.length})</span>
          <button class="btn btn-sm" onclick={refreshWorkspace}>刷新</button>
        </div>
        <div class="table-container">
          {#if variables.length === 0}
            <div class="empty-state">当前工作区暂无变量</div>
          {:else}
            <table class="data-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>类型</th>
                  <th>尺寸</th>
                  <th>大小</th>
                </tr>
              </thead>
              <tbody>
                {#each variables as v (v.name)}
                  <tr onclick={() => terminalController.insertText(v.name)}>
                    <td class="var-name">{v.name}</td>
                    <td>{v.class}</td>
                    <td>{WorkspaceStore.formatSize(v.size)}</td>
                    <td>{WorkspaceStore.formatBytes(v.bytes)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>
      </div>

    <!-- 2. 虚拟文件系统面板 -->
    {:else if activeTab === 'files'}
      <div class="panel">
        <div class="panel-toolbar">
          <span class="panel-title">路径: {currentDir}</span>
          <button class="btn btn-sm" onclick={refreshFiles}>刷新</button>
        </div>
        <div class="files-list">
          {#if files.length === 0}
            <div class="empty-state">目录为空</div>
          {:else}
            {#each files as f (f.name)}
              <div class="file-item">
                <span class="file-icon">{f.dir ? '📁' : '📄'}</span>
                <span class="file-name" title={f.name}>{f.name}</span>
                {#if !f.dir}
                  <div class="file-actions">
                    <button
                      class="btn-icon-xs"
                      title="下载"
                      onclick={() => handleFileDownload(f.name)}
                    >⬇</button>
                    <button
                      class="btn-icon-xs"
                      title="删除"
                      onclick={() => handleFileDelete(f.name)}
                    >×</button>
                  </div>
                {/if}
              </div>
            {/each}
          {/if}
        </div>
      </div>

    <!-- 3. 命令历史面板 -->
    {:else if activeTab === 'history'}
      <div class="panel">
        <div class="panel-toolbar">
          <input
            type="text"
            placeholder="搜索命令历史…"
            class="input-sm"
            bind:value={historySearch}
          />
          <button class="btn btn-sm" onclick={handleHistoryClear}>清空</button>
        </div>
        <div class="history-list">
          {#each filteredHistory as cmd, idx (idx)}
            <div
              class="history-item"
              role="button"
              tabindex="0"
              onclick={() => handleHistoryClick(cmd)}
              onkeydown={(e) => e.key === 'Enter' && handleHistoryClick(cmd)}
            >
              <span class="history-cmd">{cmd}</span>
            </div>
          {/each}
        </div>
      </div>

    <!-- 4. 符号文档面板 -->
    {:else if activeTab === 'docs'}
      <div class="panel">
        <div class="panel-toolbar">
          <input
            type="text"
            placeholder="输入函数名 (例如 magic, svd)…"
            class="input-sm"
            bind:value={docQuery}
            onkeydown={(e) => e.key === 'Enter' && handleQueryDoc()}
          />
          <button class="btn btn-sm" disabled={docLoading} onclick={handleQueryDoc}>
            {docLoading ? '查询中…' : '查询'}
          </button>
        </div>
        <div class="doc-viewport">
          {#if docLoading}
            <div class="empty-state">正在通过带外通道静默查询…</div>
          {:else if docContent}
            <pre class="doc-content">{docContent}</pre>
          {:else}
            <div class="empty-state">输入 Octave 函数名以获取离线/内省帮助文档</div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</aside>

<style>
  .sidebar {
    width: 320px;
    height: 100%;
    background: var(--bg-surface);
    border-left: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    overflow: hidden;
  }

  .tabs-header {
    display: flex;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--bg-canvas);
  }

  .tab-btn {
    flex: 1;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    padding: 8px 4px;
    font-size: 13px;
    color: var(--text-muted);
  }

  .tab-btn.active {
    color: var(--text-main);
    border-bottom-color: var(--accent-primary);
    background: var(--bg-surface);
    font-weight: 600;
  }

  .tab-content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 8px;
  }

  .panel-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }

  .panel-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
  }

  .btn-sm {
    font-size: 11px;
    padding: 2px 6px;
  }

  .input-sm {
    flex: 1;
    font-size: 12px;
    padding: 3px 6px;
  }

  .table-container {
    flex: 1;
    overflow-y: auto;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .data-table th, .data-table td {
    padding: 4px 6px;
    text-align: left;
    border-bottom: 1px solid var(--border-muted);
  }

  .data-table tr:hover td {
    background: var(--bg-surface-hover);
    cursor: pointer;
  }

  .var-name {
    font-family: monospace;
    color: var(--accent-primary);
  }

  .files-list, .history-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .file-item, .history-item {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    background: var(--bg-canvas);
    border: 1px solid var(--border-muted);
  }

  .file-item:hover, .history-item:hover {
    background: var(--bg-surface-hover);
    cursor: pointer;
  }

  .file-icon {
    margin-right: 6px;
  }

  .file-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: monospace;
  }

  .file-actions {
    display: flex;
    gap: 4px;
  }

  .btn-icon-xs {
    padding: 1px 4px;
    font-size: 10px;
    border-radius: 3px;
  }

  .history-cmd {
    font-family: monospace;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .doc-viewport {
    flex: 1;
    overflow-y: auto;
    padding: 6px;
    background: var(--bg-canvas);
    border: 1px solid var(--border-muted);
    border-radius: 4px;
  }

  .doc-content {
    font-family: monospace;
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .empty-state {
    color: var(--text-dim);
    font-size: 12px;
    text-align: center;
    margin-top: 24px;
  }
</style>
