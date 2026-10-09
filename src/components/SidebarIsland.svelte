<script lang="ts">
  import {
    projectWorkspace,
    workspaceStorage,
    filesystemStore,
    historyStore,
    supervisor,
    terminalController,
    variableInspectorStore,
    i18n,
    t,
  } from '../modules/appContext';
  import type { Locale } from '../modules/i18n/types';
  import { ProjectWorkspace, type WorkspaceSnapshot } from '../modules/workspace/ProjectWorkspace';
  import type { FileEntry } from '../modules/workspace/DirectoryAdapter';
  import type { WorkspaceVariable, FsEntry } from '../modules/engine/types';
  import type { FileTreeNode } from '../modules/storage/types';
  import { splitPath } from '../modules/storage/types';
  import { downloadFile } from '../modules/storage/ExportService';

  type Tab = 'workspace' | 'files' | 'history' | 'docs';
  let activeTab = $state<Tab>('workspace');
  let currentLocale = $state<Locale>(i18n.currentLocale);

  // Workspace State
  let variables = $state<WorkspaceVariable[]>(projectWorkspace.variables);
  let snapshots = $state<WorkspaceSnapshot[]>(projectWorkspace.snapshots);
  let activeWorkspaceId = $state<string>('default');
  let showSaveModal = $state(false);
  let snapshotNameInput = $state('');
  let snapshotDescInput = $state('');

  // Persistent Workspace Storage State (OPFS / Memory)
  let tree = $state<FileTreeNode[]>(workspaceStorage.tree);
  let storageType = $state<'opfs' | 'memory'>(workspaceStorage.storageType);
  let activeFile = $state<string | null>(projectWorkspace.activeFile);
  let collapsedDirs = $state<Set<string>>(new Set());
  let isDragging = $state(false);
  let storageStats = $state<{ filesCount: number; totalBytes: number }>({ filesCount: 0, totalBytes: 0 });

  // Legacy local files compatibility
  let isLocalMounted = $state<boolean>(projectWorkspace.isDirectoryMounted);
  let localDirName = $state<string | null>(projectWorkspace.directoryName);
  let localFiles = $state<FileEntry[]>(projectWorkspace.files);

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
    void workspaceStorage.init();

    const unsubStorage = workspaceStorage.subscribe(async () => {
      tree = workspaceStorage.tree;
      storageType = workspaceStorage.storageType;
      activeFile = projectWorkspace.activeFile;
      const stats = await workspaceStorage.getStats();
      storageStats = { filesCount: stats.filesCount, totalBytes: stats.totalBytes };
    });
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
    const unsubI18n = i18n.subscribe((loc) => {
      currentLocale = loc;
    });
    return () => {
      unsubStorage();
      unsubPw();
      unsubFs();
      unsubHist();
      unsubI18n();
    };
  });

  function formatBytes(bytes?: number): string {
    if (bytes === undefined || bytes === null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function toggleDir(path: string) {
    if (collapsedDirs.has(path)) {
      collapsedDirs.delete(path);
    } else {
      collapsedDirs.add(path);
    }
    collapsedDirs = new Set(collapsedDirs);
  }

  async function handlePickFolder() {
    try {
      const count = await workspaceStorage.importFromPicker();
      if (count > 0) {
        if (workspaceStorage.activeFile) {
          await projectWorkspace.openFile(workspaceStorage.activeFile);
        }
        await workspaceStorage.syncToEngine(supervisor);
      }
    } catch (err: any) {
      console.warn('[SidebarIsland] import folder error:', err);
    }
  }

  async function handlePickZip() {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.style.display = 'none';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) {
        try {
          const count = await workspaceStorage.importFromZip(file);
          if (count > 0) {
            if (workspaceStorage.activeFile) {
              await projectWorkspace.openFile(workspaceStorage.activeFile);
            }
            await workspaceStorage.syncToEngine(supervisor);
          }
        } catch (e: any) {
          alert('ZIP 导入失败: ' + (e?.message || e));
        }
      }
      if (input.parentNode) {
        document.body.removeChild(input);
      }
    };
    document.body.appendChild(input);
    input.click();
  }

  async function handleExportZip() {
    try {
      await workspaceStorage.exportAsZip('octave-workspace.zip');
    } catch (err: any) {
      alert('导出失败: ' + (err?.message || err));
    }
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    if (!e.dataTransfer) return;

    const files = Array.from(e.dataTransfer.files || []);
    const zipFile = files.find((f) => f.name.endsWith('.zip'));

    try {
      if (zipFile) {
        await workspaceStorage.importFromZip(zipFile);
      } else {
        await workspaceStorage.importFromDrop(e.dataTransfer);
      }
      if (workspaceStorage.activeFile) {
        await projectWorkspace.openFile(workspaceStorage.activeFile);
      }
      await workspaceStorage.syncToEngine(supervisor);
    } catch (err: any) {
      alert('拖拽导入失败: ' + (err?.message || err));
    }
  }

  async function handleNewScript() {
    const name = prompt('请输入新脚本文件名 (例如: script.m):', 'script.m');
    if (name && name.trim()) {
      const filename = name.trim().endsWith('.m') ? name.trim() : `${name.trim()}.m`;
      await workspaceStorage.writeFile(filename, `%% 主小节\n% 脚本: ${filename}\ndisp("正在运行 ${filename}");\n`);
      await projectWorkspace.openFile(filename);
      await workspaceStorage.syncToEngine(supervisor);
    }
  }

  async function handleNewFolder() {
    const name = prompt('请输入新目录名 (例如: utils 或 data/sub):', 'utils');
    if (name && name.trim()) {
      await workspaceStorage.createDirectory(name.trim());
    }
  }

  async function handleClearStorage() {
    if (confirm('确定要清空当前工作区中所有的文件和目录吗？')) {
      await workspaceStorage.clearWorkspace();
    }
  }

  async function handleFileClick(node: FileTreeNode) {
    if (node.kind === 'dir') {
      toggleDir(node.path);
      return;
    }
    if (node.name.endsWith('.m')) {
      await projectWorkspace.openFile(node.path);
      workspaceStorage.setActiveFile(node.path);
    }
  }

  async function handleDownloadFile(path: string) {
    try {
      const data = await workspaceStorage.readFile(path);
      const { name } = splitPath(path);
      downloadFile(data, name, 'application/octet-stream');
    } catch (err: any) {
      alert('下载文件失败: ' + (err?.message || err));
    }
  }

  async function handleDeleteEntry(path: string) {
    if (confirm(`确定要删除 ${path} 吗？`)) {
      await workspaceStorage.deleteEntry(path);
    }
  }

  function refreshWorkspace() {
    projectWorkspace.syncVariables();
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
              <span class="dir-overview-text">📁 {t('sidebar.local_dir_disconnected')}</span>
              <button class="btn btn-xs btn-primary" onclick={handleMountLocalDir}>{t('sidebar.connect_dir')}</button>
            </div>
          {:else}
            <div class="dir-overview-row">
              <span class="dir-overview-text" title={localDirName}>📁 {localDirName} ({localFiles.length} {t('sidebar.tab_files')})</span>
              <div class="dir-overview-actions">
                <button class="btn btn-xs btn-outline" onclick={handleReselectDir} title={t('sidebar.reselect_dir_tooltip')}>
                  🔄 {t('sidebar.reselect_dir')}
                </button>
                <button class="btn btn-xs btn-outline" onclick={() => (activeTab = 'files')}>{t('sidebar.view_files')}</button>
                <button class="btn btn-xs btn-ghost" onclick={handleDisconnectDir}>{t('sidebar.disconnect')}</button>
              </div>
            </div>
          {/if}
        </div>

        <!-- 选工作区 / 管理工具栏 -->
        <div class="workspace-selector-bar">
          <div class="selector-row">
            <span class="selector-label">{t('sidebar.workspace_label')}</span>
            <select
              class="ws-select"
              value={activeWorkspaceId}
              onchange={handleSelectWorkspace}
              title={t('sidebar.workspace_label')}
            >
              <option value="default">{t('sidebar.active_workspace')}</option>
              {#each snapshots as s (s.id)}
                <option value={s.id}>💾 {s.name} ({s.variables.length})</option>
              {/each}
              <option value="__new__">{t('sidebar.save_new_snapshot')}</option>
            </select>
          </div>
          <div class="selector-actions">
            <button
              class="btn btn-xs"
              onclick={() => { snapshotNameInput = `Snapshot ${new Date().toLocaleTimeString()}`; showSaveModal = true; }}
              title={t('sidebar.save_snapshot_tooltip')}
            >
              💾 {t('sidebar.save_snapshot')}
            </button>
            <button class="btn btn-xs btn-outline" onclick={refreshWorkspace} title={t('sidebar.refresh_tooltip')}>
              🔄 {t('workspace.refresh')}
            </button>
            <button class="btn btn-xs btn-danger-outline" onclick={handleClearWorkspace} title={t('sidebar.clear_workspace_tooltip')}>
              🧹 {t('sidebar.clear_workspace')}
            </button>
          </div>
        </div>

        {#if showSaveModal}
          <div class="snapshot-inline-form">
            <div class="form-title">{t('sidebar.save_snapshot_title')}</div>
            <input
              type="text"
              class="input-sm"
              placeholder={t('sidebar.snapshot_name_placeholder')}
              bind:value={snapshotNameInput}
            />
            <input
              type="text"
              class="input-sm"
              placeholder={t('sidebar.snapshot_desc_placeholder')}
              bind:value={snapshotDescInput}
            />
            <div class="form-btns">
              <button class="btn btn-xs btn-primary" onclick={handleSaveSnapshot}>{t('sidebar.btn_confirm')}</button>
              <button class="btn btn-xs btn-ghost" onclick={() => (showSaveModal = false)}>{t('sidebar.btn_cancel')}</button>
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

    <!-- 2. 工作区存储与文件面板 (OPFS / Memory + 三通道导入/导出) -->
    {:else if activeTab === 'files'}
      <div
        class="panel"
        class:drop-active={isDragging}
        ondragover={(e) => { e.preventDefault(); isDragging = true; }}
        ondragleave={() => { isDragging = false; }}
        ondrop={handleDrop}
      >
        <!-- 存储状态卡片 -->
        <div class="storage-card">
          <div class="storage-header">
            <span class="storage-title">
              {storageType === 'opfs' ? '📁 OPFS 持久沙箱' : '💾 纯内存工作区'}
            </span>
            <span class="storage-badge" class:badge-opfs={storageType === 'opfs'} class:badge-memory={storageType === 'memory'}>
              {storageType === 'opfs' ? '持久化' : '无持久化'}
            </span>
          </div>

          <div class="storage-meta">
            <span>文件: {storageStats.filesCount} 个</span>
            {#if storageStats.totalBytes > 0}
              <span>· 大小: {formatBytes(storageStats.totalBytes)}</span>
            {/if}
          </div>

          <!-- 通道操作栏 -->
          <div class="storage-actions">
            <button class="btn btn-xs btn-primary" onclick={handlePickFolder} title="通过文件夹选择器导入目录">
              📁 导入目录
            </button>
            <button class="btn btn-xs btn-outline" onclick={handlePickZip} title="导入 .zip 压缩包为项目">
              📦 导入 ZIP
            </button>
            <button class="btn btn-xs btn-outline" onclick={handleExportZip} title="将整个工作区导出下载为 .zip">
              💾 导出 ZIP
            </button>
          </div>

          <div class="storage-sub-actions">
            <button class="btn btn-xs" onclick={handleNewScript} title="新建 .m 脚本文件">
              + 脚本
            </button>
            <button class="btn btn-xs" onclick={handleNewFolder} title="新建子文件夹">
              + 目录
            </button>
            <button class="btn btn-xs btn-danger-outline" onclick={handleClearStorage} title="清空工作区中所有文件">
              清空
            </button>
          </div>
        </div>

        {#if isDragging}
          <div class="drag-overlay">
            <span>松开鼠标立即导入文件或 ZIP 压缩包</span>
          </div>
        {/if}

        <!-- 层级文件树 -->
        <div class="panel-toolbar" style="margin-top: 8px;">
          <span class="panel-title">工作区文件 ({storageStats.filesCount})</span>
          <button class="btn btn-xs" onclick={() => workspaceStorage.refresh()} title="刷新文件列表">
            🔄
          </button>
        </div>

        <div class="files-list">
          {#if tree.length === 0}
            <div class="empty-state">
              工作区为空<br />
              <span class="empty-sub">支持点击上方导入按钮，或直接拖拽文件夹/ZIP 压缩包至此处</span>
            </div>
          {:else}
            {#snippet renderTree(nodes: FileTreeNode[], depth: number)}
              {#each nodes as node (node.path)}
                {#if node.kind === 'dir'}
                  {@const isCollapsed = collapsedDirs.has(node.path)}
                  <div
                    class="file-item dir-item"
                    style="padding-left: {depth * 14 + 8}px;"
                    onclick={() => toggleDir(node.path)}
                    title={node.path}
                  >
                    <span class="dir-toggle">{isCollapsed ? '▶' : '▼'}</span>
                    <span class="file-icon">📁</span>
                    <span class="file-name">{node.name}</span>
                    <div class="file-actions">
                      <button
                        class="btn-icon-xs"
                        title="删除目录"
                        onclick={(e) => { e.stopPropagation(); handleDeleteEntry(node.path); }}
                      >×</button>
                    </div>
                  </div>
                  {#if !isCollapsed && node.children && node.children.length > 0}
                    {@render renderTree(node.children, depth + 1)}
                  {/if}
                {:else}
                  <div
                    class="file-item"
                    class:active-file={activeFile === node.path}
                    style="padding-left: {depth * 14 + 8}px;"
                    onclick={() => handleFileClick(node)}
                    title={node.name.endsWith('.m') ? '点击在编辑器中打开 .m 脚本' : node.name}
                  >
                    <span class="dir-toggle spacer"></span>
                    <span class="file-icon">
                      {node.name.endsWith('.m') ? '📜' : (node.name.endsWith('.mat') ? '📊' : '📄')}
                    </span>
                    <span class="file-name">{node.name}</span>
                    {#if node.size !== undefined}
                      <span class="file-size-tag">{formatBytes(node.size)}</span>
                    {/if}
                    <div class="file-actions">
                      <button
                        class="btn-icon-xs"
                        title="下载"
                        onclick={(e) => { e.stopPropagation(); handleDownloadFile(node.path); }}
                      >⬇</button>
                      <button
                        class="btn-icon-xs"
                        title="删除"
                        onclick={(e) => { e.stopPropagation(); handleDeleteEntry(node.path); }}
                      >×</button>
                    </div>
                  </div>
                {/if}
              {/each}
            {/snippet}

            {@render renderTree(tree, 0)}
          {/if}
        </div>

        <!-- 底层虚拟环境查看 (可折叠调试视图) -->
        <details class="memfs-details">
          <summary class="memfs-summary">Octave MEMFS 镜像 (调试: {currentDir})</summary>
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
    width: 100%;
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

  /* 存储卡片与操作 */
  .storage-card {
    background: var(--bg-canvas);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    padding: 8px;
    margin-bottom: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .storage-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .storage-title {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--text-main);
  }

  .storage-badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 999px;
    font-weight: 500;
  }

  .badge-opfs {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  .badge-memory {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
    border: 1px solid rgba(245, 158, 11, 0.3);
  }

  .storage-meta {
    font-size: 11px;
    color: var(--text-muted);
  }

  .storage-actions,
  .storage-sub-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }

  .drop-active {
    outline: 2px dashed var(--accent-primary);
    outline-offset: -2px;
    background: rgba(14, 165, 233, 0.05);
  }

  .drag-overlay {
    margin-top: 6px;
    padding: 12px;
    border: 2px dashed var(--accent-primary);
    border-radius: 6px;
    background: var(--bg-surface-hover);
    color: var(--accent-primary);
    font-size: 12px;
    text-align: center;
    font-weight: 500;
  }

  .dir-item {
    font-weight: 500;
    color: var(--text-main);
  }

  .dir-toggle {
    display: inline-block;
    width: 14px;
    font-size: 9px;
    color: var(--text-muted);
    user-select: none;
  }

  .dir-toggle.spacer {
    visibility: hidden;
  }

  .file-size-tag {
    font-size: 10px;
    color: var(--text-muted);
    margin-left: 6px;
    margin-right: 6px;
  }

  .empty-sub {
    font-size: 11px;
    color: var(--text-muted);
    display: inline-block;
    margin-top: 4px;
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
    background: var(--md-sys-color-primary-container);
    color: var(--md-sys-color-on-primary-container);
    font-weight: 500;
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

