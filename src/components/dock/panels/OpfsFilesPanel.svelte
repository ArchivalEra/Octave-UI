<!-- src/components/dock/panels/OpfsFilesPanel.svelte -->
<script lang="ts">
  import { workspaceStorage, projectWorkspace, supervisor, t } from '../../../modules/appContext';
  import type { FileTreeNode } from '../../../modules/storage/types';
  import { splitPath } from '../../../modules/storage/types';
  import { downloadFile } from '../../../modules/storage/ExportService';

  let tree = $state<FileTreeNode[]>(workspaceStorage.tree);
  let storageType = $state<'opfs' | 'memory'>(workspaceStorage.storageType);
  let activeFile = $state<string | null>(projectWorkspace.activeFile);
  let collapsedDirs = $state<Set<string>>(new Set());
  let isDragging = $state(false);
  let storageStats = $state<{ filesCount: number; totalBytes: number }>({ filesCount: 0, totalBytes: 0 });

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
      activeFile = projectWorkspace.activeFile;
    });

    return () => {
      unsubStorage();
      unsubPw();
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
      console.warn('[OpfsFilesPanel] import folder error:', err);
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
          alert(t('sidebar.err_import_zip', { error: e?.message || String(e) }));
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
      alert(t('sidebar.err_export_zip', { error: err?.message || String(err) }));
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
      alert(t('sidebar.err_drag_drop', { error: err?.message || String(err) }));
    }
  }

  async function handleNewScript() {
    const name = prompt(t('sidebar.prompt_new_script'), 'script.m');
    if (name && name.trim()) {
      const filename = name.trim().endsWith('.m') ? name.trim() : `${name.trim()}.m`;
      await workspaceStorage.writeFile(filename, t('sidebar.default_script_content', { filename }));
      await projectWorkspace.openFile(filename);
      await workspaceStorage.syncToEngine(supervisor);
    }
  }

  async function handleNewFolder() {
    const name = prompt(t('sidebar.prompt_new_folder'), 'utils');
    if (name && name.trim()) {
      await workspaceStorage.createDirectory(name.trim());
    }
  }

  async function handleClearStorage() {
    if (confirm(t('sidebar.confirm_clear_storage'))) {
      await workspaceStorage.clearWorkspace();
    }
  }

  async function handleFileClick(node: FileTreeNode) {
    if (node.kind === 'dir') {
      toggleDir(node.path);
      return;
    }
    if (node.name.endsWith('.m') || node.name.endsWith('.mo')) {
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
      alert(t('sidebar.err_download_file', { error: err?.message || String(err) }));
    }
  }

  async function handleDeleteEntry(path: string) {
    if (confirm(t('sidebar.confirm_delete_path', { path }))) {
      await workspaceStorage.deleteEntry(path);
    }
  }
</script>

<div
  class="opfs-files-panel"
  class:drop-active={isDragging}
  ondragover={(e) => { e.preventDefault(); isDragging = true; }}
  ondragleave={() => { isDragging = false; }}
  ondrop={handleDrop}
  role="region"
  aria-label={t('dock.panel_files')}
>
  <!-- 存储头卡片 -->
  <div class="storage-card">
    <div class="storage-header">
      <div class="storage-brand">
        <span class="storage-icon">💾</span>
        <span class="storage-title">
          {storageType === 'opfs' ? t('sidebar.storage_opfs') : t('sidebar.storage_memory')}
        </span>
      </div>
      <span class="storage-badge" class:badge-opfs={storageType === 'opfs'}>
        {storageType === 'opfs' ? t('sidebar.storage_persisted') : t('sidebar.storage_ephemeral')}
      </span>
    </div>

    <div class="storage-meta">
      <span>{t('sidebar.storage_files_stat', { count: storageStats.filesCount })}</span>
      {#if storageStats.totalBytes > 0}
        <span>· {formatBytes(storageStats.totalBytes)}</span>
      {/if}
    </div>

    <!-- 通道操作栏 -->
    <div class="storage-actions">
      <button class="btn btn-xs btn-primary" onclick={handlePickFolder} title={t('sidebar.btn_import_folder_tooltip')}>
        {t('sidebar.btn_import_folder')}
      </button>
      <button class="btn btn-xs btn-outline" onclick={handlePickZip} title={t('sidebar.btn_import_zip_tooltip')}>
        {t('sidebar.btn_import_zip')}
      </button>
      <button class="btn btn-xs btn-outline" onclick={handleExportZip} title={t('sidebar.btn_export_zip_tooltip')}>
        {t('sidebar.btn_export_zip')}
      </button>
    </div>

    <div class="storage-sub-actions">
      <button class="btn btn-xs" onclick={handleNewScript} title={t('sidebar.btn_new_script_tooltip')}>
        {t('sidebar.btn_new_script')}
      </button>
      <button class="btn btn-xs" onclick={handleNewFolder} title={t('sidebar.btn_new_folder_tooltip')}>
        {t('sidebar.btn_new_folder')}
      </button>
      <button class="btn btn-xs btn-danger-outline" onclick={handleClearStorage} title={t('sidebar.btn_clear_storage_tooltip')}>
        {t('sidebar.btn_clear_storage')}
      </button>
    </div>
  </div>

  {#if isDragging}
    <div class="drag-overlay">
      <span>{t('sidebar.drag_overlay')}</span>
    </div>
  {/if}

  <!-- 文件树 -->
  <div class="files-tree-container">
    {#if tree.length === 0}
      <div class="empty-state">
        {t('sidebar.workspace_empty_title')}<br />
        <span class="empty-sub">{t('sidebar.workspace_empty_sub')}</span>
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
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleDir(node.path); }}
              title={node.path}
              role="button"
              tabindex="0"
            >
              <span class="dir-toggle">{isCollapsed ? '▶' : '▼'}</span>
              <span class="file-icon">📁</span>
              <span class="file-name">{node.name}</span>
              <div class="file-actions">
                <button
                  class="action-btn danger"
                  title={t('sidebar.action_delete')}
                  onclick={(e) => { e.stopPropagation(); handleDeleteEntry(node.path); }}
                >✕</button>
              </div>
            </div>
            {#if !isCollapsed && node.children}
              {@render renderTree(node.children, depth + 1)}
            {/if}
          {:else}
            <div
              class="file-item"
              class:active={activeFile === node.path}
              style="padding-left: {depth * 14 + 20}px;"
              onclick={() => handleFileClick(node)}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleFileClick(node); }}
              title={node.path}
              role="button"
              tabindex="0"
            >
              <span class="file-icon">
                {#if node.name.endsWith('.mo')}
                  ⚙️
                {:else if node.name.endsWith('.m')}
                  📜
                {:else if node.name.endsWith('.mat')}
                  📊
                {:else}
                  📄
                {/if}
              </span>
              <span class="file-name">{node.name}</span>
              <span class="file-size">{formatBytes(node.size)}</span>
              <div class="file-actions">
                <button
                  class="action-btn"
                  title={t('sidebar.action_download')}
                  onclick={(e) => { e.stopPropagation(); handleDownloadFile(node.path); }}
                >⬇</button>
                <button
                  class="action-btn danger"
                  title={t('sidebar.action_delete')}
                  onclick={(e) => { e.stopPropagation(); handleDeleteEntry(node.path); }}
                >✕</button>
              </div>
            </div>
          {/if}
        {/each}
      {/snippet}

      {@render renderTree(tree, 0)}
    {/if}
  </div>
</div>

<style>
  .opfs-files-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--bg-surface);
    overflow: hidden;
    position: relative;
    box-sizing: border-box;
  }

  .drop-active {
    outline: 2px dashed var(--accent-primary);
  }

  .storage-card {
    padding: 10px 12px;
    background: var(--bg-surface-hover);
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
  }

  .storage-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .storage-brand {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    font-size: 13px;
    color: var(--text-main);
  }

  .storage-badge {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 9999px;
    background: var(--bg-surface);
    color: var(--text-muted);
    border: 1px solid var(--border-subtle);
  }

  .badge-opfs {
    background: var(--bg-surface-hover);
    color: var(--accent-primary);
    border-color: var(--accent-primary);
  }

  .storage-meta {
    font-size: 11px;
    color: var(--text-muted);
  }

  .storage-actions,
  .storage-sub-actions {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .btn {
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid var(--border-subtle);
    background: var(--bg-surface);
    color: var(--text-main);
    display: inline-flex;
    align-items: center;
    transition: all 0.15s;
  }

  .btn:hover {
    background: var(--bg-surface-hover);
  }

  .btn-primary {
    background: var(--accent-primary);
    color: var(--accent-primary-text);
    border-color: var(--accent-primary);
  }

  .btn-outline {
    background: transparent;
  }

  .btn-danger-outline {
    background: transparent;
    color: var(--accent-danger);
    border-color: var(--border-subtle);
  }

  .btn-danger-outline:hover {
    background: var(--bg-surface-hover);
  }

  .drag-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--bg-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    color: var(--accent-primary-text);
    font-weight: 600;
    backdrop-filter: blur(2px);
  }

  .files-tree-container {
    flex: 1;
    overflow-y: auto;
    padding: 6px 0;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    font-size: 12px;
    cursor: pointer;
    color: var(--text-main);
    user-select: none;
    transition: background 0.1s;
  }

  .file-item:hover {
    background: var(--bg-surface-hover);
  }

  .file-item.active {
    background: var(--bg-surface-hover);
    color: var(--accent-primary);
    font-weight: 600;
  }

  .dir-item {
    font-weight: 500;
  }

  .dir-toggle {
    font-size: 9px;
    color: var(--text-muted);
    width: 12px;
  }

  .file-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-size {
    font-size: 10px;
    color: var(--text-muted);
    margin-right: 4px;
  }

  .file-actions {
    display: none;
    gap: 2px;
  }

  .file-item:hover .file-actions {
    display: flex;
  }

  .action-btn {
    padding: 1px 4px;
    font-size: 10px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 2px;
  }

  .action-btn:hover {
    background: var(--bg-surface);
    color: var(--text-main);
  }

  .action-btn.danger:hover {
    color: var(--accent-danger);
  }

  .empty-state {
    padding: 24px 16px;
    text-align: center;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.6;
  }

  .empty-sub {
    font-size: 11px;
    opacity: 0.8;
  }
</style>
