<script lang="ts">
  import {
    projectWorkspace,
    filesystemStore,
    historyStore,
    supervisor,
    terminalController,
    variableInspectorStore,
    t,
  } from '../modules/appContext';
  import { ProjectWorkspace, type WorkspaceSnapshot } from '../modules/workspace/ProjectWorkspace';
  import type { FileEntry } from '../modules/workspace/DirectoryAdapter';
  import type { WorkspaceVariable, FsEntry } from '../modules/engine/types';

  type Tab = 'workspace' | 'files' | 'history' | 'docs';
  let activeTab = $state<Tab>('workspace');

  // Workspace State
  let variables = $state<WorkspaceVariable[]>(projectWorkspace.variables);
  let snapshots = $state<WorkspaceSnapshot[]>(projectWorkspace.snapshots);
  let activeWorkspaceId = $state<string>('default');
  let showSaveModal = $state(false);
  let snapshotNameInput = $state('');
  let snapshotDescInput = $state('');

  // Local Directory State
  let isLocalMounted = $state<boolean>(projectWorkspace.isDirectoryMounted);
  let localDirName = $state<string | null>(projectWorkspace.directoryName);
  let localFiles = $state<FileEntry[]>(projectWorkspace.files);
  let activeFile = $state<string | null>(projectWorkspace.activeFile);

  // Filesystem State (Virtual fallback)
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
    const unsubPw = projectWorkspace.subscribe(() => {
      variables = projectWorkspace.variables;
      snapshots = projectWorkspace.snapshots;
      isLocalMounted = projectWorkspace.isDirectoryMounted;
      localDirName = projectWorkspace.directoryName;
      localFiles = projectWorkspace.files;
      activeFile = projectWorkspace.activeFile;
    });
    const unsubFs = filesystemStore.subscribe((entries, dir) => {
      files = entries;
      currentDir = dir;
    });
    const unsubHist = historyStore.subscribe((items) => {
      historyList = items;
    });
    return () => {
      unsubPw();
      unsubFs();
      unsubHist();
    };
  });


  function refreshWorkspace() {
    projectWorkspace.syncVariables();
  }

  async function handleMountLocalDir() {
    try {
      await projectWorkspace.mountLocalDirectory();
    } catch (err: any) {
      alert(`无法打开本地目录: ${err?.message || err}`);
    }
  }

  function handleDisconnectDir() {
    projectWorkspace.disconnectDirectory();
  }

  async function handleOpenFile(filename: string) {
    if (filename.endsWith('.m')) {
      await projectWorkspace.openFile(filename);
    }
  }

  async function handleNewScript() {
    const name = prompt('请输入新脚本文件名 (例如: analysis.m):', 'script.m');
    if (name && name.trim()) {
      const filename = name.trim().endsWith('.m') ? name.trim() : `${name.trim()}.m`;
      await projectWorkspace.createFile(filename);
    }
  }

  async function handleDeleteLocalFile(filename: string) {
    if (confirm(`确定要删除文件 ${filename} 吗？`)) {
      await projectWorkspace.deleteFile(filename);
    }
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

  function handleSelectWorkspace(e: Event) {
    const target = e.currentTarget as HTMLSelectElement;
    const selectedId = target.value;
    if (selectedId === '__new__') {
      snapshotNameInput = `工作区 ${new Date().toLocaleTimeString()}`;
      snapshotDescInput = '';
      showSaveModal = true;
      target.value = activeWorkspaceId;
      return;
    }
    if (selectedId === 'default') {
      activeWorkspaceId = 'default';
      projectWorkspace.syncVariables();
    } else {
      projectWorkspace.loadSnapshot(selectedId);
      activeWorkspaceId = selectedId;
    }
  }

  function handleSaveSnapshot() {
    if (!snapshotNameInput.trim()) return;
    projectWorkspace.saveSnapshot(snapshotNameInput.trim(), snapshotDescInput.trim());
    showSaveModal = false;
    snapshotNameInput = '';
    snapshotDescInput = '';
  }

  function handleClearWorkspace() {
    projectWorkspace.clearWorkspace();
  }

  function handleDeleteSnapshot(id: string) {
    projectWorkspace.deleteSnapshot(id);
    activeWorkspaceId = 'default';
  }

  async function handleQueryDoc() {
    if (!docQuery.trim()) return;
    docLoading = true;
    try {
      docContent = await supervisor.queryDocumentation(docQuery.trim());
    } catch (err: any) {
      docContent = t('docs.error', { error: err.message || String(err) });
    } finally {
      docLoading = false;
    }
  }

  async function handleVarClick(v: WorkspaceVariable) {
    const detail = await variableInspectorStore.inspect(v, supervisor);
    variableInspectorStore.open(detail);
  }
</script>

<aside class="sidebar">
  <!-- 标签栏导航 -->
  <div class="tabs-header">
    <button
      class="tab-btn"
      class:active={activeTab === 'workspace'}
      title={t('sidebar.tab_workspace')}
      onclick={() => (activeTab = 'workspace')}
    >{t('sidebar.tab_workspace')}</button>
    <button
      class="tab-btn"
      class:active={activeTab === 'files'}
      title={t('sidebar.tab_files')}
      onclick={() => (activeTab = 'files')}
    >{t('sidebar.tab_files')}</button>
    <button
      class="tab-btn"
      class:active={activeTab === 'history'}
      title={t('sidebar.tab_history')}
      onclick={() => (activeTab = 'history')}
    >{t('sidebar.tab_history')}</button>
    <button
      class="tab-btn"
      class:active={activeTab === 'docs'}
      title={t('sidebar.tab_docs')}
      onclick={() => (activeTab = 'docs')}
    >{t('sidebar.tab_docs')}</button>
  </div>

  <div class="tab-content">
    <!-- 1. 工作区面板 -->
    {#if activeTab === 'workspace'}
      <div class="panel">
        <!-- 本地目录挂载概览 -->
        <div class="dir-overview-card">
          {#if !isLocalMounted}
            <div class="dir-overview-row">
              <span class="dir-overview-text">📁 本地目录: 未连接</span>
              <button class="btn btn-xs btn-primary" onclick={handleMountLocalDir}>连接目录</button>
            </div>
          {:else}
            <div class="dir-overview-row">
              <span class="dir-overview-text" title={localDirName}>📁 {localDirName} ({localFiles.length} 文件)</span>
              <div class="dir-overview-actions">
                <button class="btn btn-xs btn-outline" onclick={() => (activeTab = 'files')}>查看文件</button>
                <button class="btn btn-xs btn-ghost" onclick={handleDisconnectDir}>断开</button>
              </div>
            </div>
          {/if}
        </div>

        <!-- 选工作区 / 管理工具栏 -->
        <div class="workspace-selector-bar">
          <div class="selector-row">
            <span class="selector-label">工作区:</span>
            <select
              class="ws-select"
              value={activeWorkspaceId}
              onchange={handleSelectWorkspace}
              title="切换工作区会话"
            >
              <option value="default">活跃工作区 (当前)</option>
              {#each snapshots as s (s.id)}
                <option value={s.id}>💾 {s.name} ({s.variables.length} 变量)</option>
              {/each}
              <option value="__new__">+ 存为新快照...</option>
            </select>
          </div>
          <div class="selector-actions">
            <button
              class="btn btn-xs"
              onclick={() => { snapshotNameInput = `快照 ${new Date().toLocaleTimeString()}`; showSaveModal = true; }}
              title="保存当前变量快照"
            >
              💾 存快照
            </button>
            <button class="btn btn-xs btn-outline" onclick={refreshWorkspace} title="从引擎刷新变量">
              🔄 刷新
            </button>
            <button class="btn btn-xs btn-danger-outline" onclick={handleClearWorkspace} title="清空工作区变量 (clear)">
              🧹 清空
            </button>
          </div>
        </div>

        {#if showSaveModal}
          <div class="snapshot-inline-form">
            <div class="form-title">保存工作区快照</div>
            <input
              type="text"
              class="input-sm"
              placeholder="快照名称 (例如: 线性代数实验)"
              bind:value={snapshotNameInput}
            />
            <input
              type="text"
              class="input-sm"
              placeholder="可选说明"
              bind:value={snapshotDescInput}
            />
            <div class="form-btns">
              <button class="btn btn-xs btn-primary" onclick={handleSaveSnapshot}>确认保存</button>
              <button class="btn btn-xs btn-ghost" onclick={() => (showSaveModal = false)}>取消</button>
            </div>
          </div>
        {/if}

        <div class="panel-toolbar">
          <span class="panel-title">{t('workspace.title', { count: variables.length })}</span>
          {#if activeWorkspaceId !== 'default'}
            <button
              class="btn-delete-snap"
              onclick={() => handleDeleteSnapshot(activeWorkspaceId)}
              title="删除此快照"
            >
              删除快照
            </button>
          {/if}
        </div>

        <div class="table-container">
          {#if variables.length === 0}
            <div class="empty-state">{t('workspace.empty')}</div>
          {:else}
            <table class="data-table">
              <thead>
                <tr>
                  <th>{t('workspace.col_name')}</th>
                  <th>{t('workspace.col_type')}</th>
                  <th>{t('workspace.col_dimensions')}</th>
                  <th>{t('workspace.col_size')}</th>
                </tr>
              </thead>
              <tbody>
                {#each variables as v (v.name)}
                  <tr onclick={() => handleVarClick(v)} title="Click to inspect variable">
                    <td class="var-name">{v.name}</td>
                    <td>{v.class}</td>
                    <td>{ProjectWorkspace.formatSize(v.size)}</td>
                    <td>{ProjectWorkspace.formatBytes(v.bytes)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>
      </div>

    <!-- 2. 本地工作目录与文件面板 -->
    {:else if activeTab === 'files'}
      <div class="panel">
        <div class="local-mount-card">
          {#if !isLocalMounted}
            <div class="mount-prompt">
              <button class="btn btn-sm btn-primary w-full" onclick={handleMountLocalDir}>
                📁 选择本地工作目录
              </button>
              <div class="mount-tip">
                连接本地文件夹，直接读写本地磁盘标准 .m 脚本与数据，零网络上传。
              </div>
            </div>
          {:else}
            <div class="mounted-bar">
              <div class="mounted-info">
                <span class="mounted-name" title={localDirName}>📁 {localDirName}</span>
                <span class="badge-authorized">已连接</span>
              </div>
              <div class="mounted-btns">
                <button class="btn btn-xs btn-outline" onclick={handleNewScript} title="新建 .m 脚本">+ 脚本</button>
                <button class="btn btn-xs btn-ghost" onclick={handleDisconnectDir} title="断开本地目录">断开</button>
              </div>
            </div>
          {/if}
        </div>

        {#if isLocalMounted}
          <div class="panel-toolbar" style="margin-top: 8px;">
            <span class="panel-title">本地文件 ({localFiles.length})</span>
          </div>
          <div class="files-list">
            {#if localFiles.length === 0}
              <div class="empty-state">当前目录下无文件</div>
            {:else}
              {#each localFiles as f (f.name)}
                <div
                  class="file-item"
                  class:active-file={activeFile === f.name}
                  onclick={() => handleOpenFile(f.name)}
                  title={f.name.endsWith('.m') ? '点击在工作台中打开 .m 脚本' : f.name}
                >
                  <span class="file-icon">{f.kind === 'directory' ? '📁' : (f.name.endsWith('.m') ? '📜' : '📄')}</span>
                  <span class="file-name">{f.name}</span>
                  <div class="file-actions">
                    <button
                      class="btn-icon-xs"
                      title="删除本地文件"
                      onclick={(e) => { e.stopPropagation(); handleDeleteLocalFile(f.name); }}
                    >×</button>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        {/if}

        <details class="memfs-details" open={!isLocalMounted}>
          <summary class="memfs-summary">虚拟环境文件 (MEMFS: {currentDir})</summary>
          <div class="panel-toolbar" style="margin-top: 6px;">
            <button class="btn btn-xs" onclick={refreshFiles}>{t('files.refresh')}</button>
          </div>
          <div class="files-list">
            {#if files.length === 0}
              <div class="empty-state">{t('files.empty')}</div>
            {:else}
              {#each files as f (f.name)}
                <div class="file-item">
                  <span class="file-icon">{f.dir ? '📁' : '📄'}</span>
                  <span class="file-name" title={f.name}>{f.name}</span>
                  {#if !f.dir}
                    <div class="file-actions">
                      <button
                        class="btn-icon-xs"
                        title={t('files.download')}
                        onclick={() => handleFileDownload(f.name)}
                      >⬇</button>
                      <button
                        class="btn-icon-xs"
                        title={t('files.delete')}
                        onclick={() => handleFileDelete(f.name)}
                      >×</button>
                    </div>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>
        </details>
      </div>

    <!-- 3. 命令历史面板 -->
    {:else if activeTab === 'history'}
      <div class="panel">
        <div class="panel-toolbar">
          <input
            type="text"
            placeholder={t('history.search_placeholder')}
            class="input-sm"
            bind:value={historySearch}
          />
          <button class="btn btn-sm" onclick={handleHistoryClear}>{t('history.clear')}</button>
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
            placeholder={t('docs.search_placeholder')}
            class="input-sm"
            bind:value={docQuery}
            onkeydown={(e) => e.key === 'Enter' && handleQueryDoc()}
          />
          <button class="btn btn-sm" disabled={docLoading} onclick={handleQueryDoc}>
            {docLoading ? t('docs.querying') : t('docs.query')}
          </button>
        </div>
        <div class="doc-viewport">
          {#if docLoading}
            <div class="empty-state">{t('docs.loading_state')}</div>
          {:else if docContent}
            <pre class="doc-content">{docContent}</pre>
          {:else}
            <div class="empty-state">{t('docs.empty_state')}</div>
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
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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

  .dir-overview-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    padding: 6px 8px;
    margin-bottom: 8px;
  }

  .dir-overview-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .dir-overview-text {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dir-overview-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
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

  .workspace-selector-bar {
    background: var(--bg-canvas);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    padding: 6px 8px;
    margin-bottom: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .selector-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .selector-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .ws-select {
    flex: 1;
    min-width: 0;
    background: var(--bg-surface);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    font-size: 11px;
    padding: 2px 4px;
    outline: none;
    cursor: pointer;
  }

  .selector-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .btn-xs {
    font-size: 10.5px;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
    background: var(--bg-surface);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
    transition: all 0.15s ease;
  }

  .btn-xs:hover {
    background: var(--bg-surface-hover, rgba(255, 255, 255, 0.08));
    border-color: var(--accent-primary);
  }

  .btn-danger-outline {
    color: var(--accent-danger);
    border-color: rgba(239, 68, 68, 0.3);
  }

  .btn-danger-outline:hover {
    background: rgba(239, 68, 68, 0.15);
    border-color: var(--accent-danger);
  }

  .btn-delete-snap {
    font-size: 10px;
    background: transparent;
    color: var(--accent-danger);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 3px;
    padding: 1px 4px;
    cursor: pointer;
  }

  .btn-delete-snap:hover {
    background: rgba(239, 68, 68, 0.15);
  }

  .snapshot-inline-form {
    background: var(--bg-canvas);
    border: 1px solid var(--accent-primary);
    border-radius: 6px;
    padding: 8px;
    margin-bottom: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--accent-primary);
  }

  .form-btns {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }

  .local-mount-card {
    background: var(--bg-canvas);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    padding: 8px;
    margin-bottom: 4px;
  }

  .mount-prompt {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .w-full {
    width: 100%;
  }

  .mount-tip {
    font-size: 11px;
    color: var(--text-muted);
    line-height: 1.3;
  }

  .mounted-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .mounted-info {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .mounted-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--accent-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .badge-authorized {
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(166, 227, 161, 0.2);
    color: #a6e3a1;
  }

  .mounted-btns {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .active-file {
    border-color: var(--accent-primary) !important;
    background: var(--bg-surface-hover) !important;
  }

  .memfs-details {
    margin-top: 10px;
    border-top: 1px dashed var(--border-subtle);
    padding-top: 6px;
  }

  .memfs-summary {
    font-size: 11px;
    color: var(--text-muted);
    cursor: pointer;
  }
</style>

