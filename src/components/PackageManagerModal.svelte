<!-- src/components/PackageManagerModal.svelte -->
<script lang="ts">
  import { packageManagerPlugin, t } from '../modules/appContext';
  import type { ForgePackageItem, InstallPlan } from '../modules/plugins/package/types';

  let { isOpen, onClose } = $props<{
    isOpen: boolean;
    onClose: () => void;
  }>();

  let searchQuery = $state('');
  let selectedConsumer = $state<'all' | 'octave' | 'omc'>('all');
  let selectedForm = $state<'all' | 'pkg' | 'tree'>('all');
  let installedOnly = $state(false);

  let selectedVersions = $state<Record<string, string>>({});
  let packageStatuses = $state<Record<string, { compatible: boolean; fromSource: boolean; installed: boolean; detail?: any }>>({});
  let installingMap = $state<Record<string, boolean>>({});
  let activePlan = $state<InstallPlan | null>(null);
  let activePlanItem = $state<ForgePackageItem | null>(null);
  let planLoading = $state(false);
  let errorMsg = $state<string | null>(null);
  let catalogLoaded = $state(false);

  function refreshStatuses() {
    const packs = packageManagerPlugin.getAllPackages();
    const map: Record<string, any> = {};
    const instMap: Record<string, boolean> = {};
    for (const p of packs) {
      map[p.name] = packageManagerPlugin.getStatus(p.name);
      instMap[p.name] = packageManagerPlugin.isInstalling(p.name);
    }
    packageStatuses = map;
    installingMap = instMap;
  }

  $effect(() => {
    if (isOpen) {
      if (!packageManagerPlugin.getCatalog()) {
        packageManagerPlugin.loadCatalog()
          .then(() => {
            catalogLoaded = true;
            refreshStatuses();
          })
          .catch((err) => {
            errorMsg = err.message || 'Failed to load catalog';
          });
      } else {
        catalogLoaded = true;
        refreshStatuses();
      }

      const unsub = packageManagerPlugin.subscribe(() => {
        refreshStatuses();
      });

      function handleKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
          if (activePlan) {
            activePlan = null;
            activePlanItem = null;
          } else {
            onClose();
          }
        }
      }

      window.addEventListener('keydown', handleKeyDown);
      return () => {
        unsub();
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  });

  const filteredPackages = $derived.by(() => {
    if (!catalogLoaded) return [];
    return packageManagerPlugin.filterPackages({
      query: searchQuery,
      consumer: selectedConsumer,
      form: selectedForm,
      installedOnly: installedOnly,
    });
  });

  function formatBytes(bytes?: number): string {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function openPlanPreview(item: ForgePackageItem) {
    activePlanItem = item;
    planLoading = true;
    errorMsg = null;
    const version = selectedVersions[item.name] || item.version;
    try {
      activePlan = await packageManagerPlugin.planInstall(item.name, version);
    } catch (err: any) {
      errorMsg = err.message || 'Failed to compute install plan';
    } finally {
      planLoading = false;
    }
  }

  async function triggerInstall(item: ForgePackageItem) {
    const version = selectedVersions[item.name] || item.version;
    errorMsg = null;
    try {
      const res = await packageManagerPlugin.installPackage(item.name, { version });
      if (res.state !== 'ok') {
        errorMsg = res.message || `Installation failed: ${res.cause || res.state}`;
      } else {
        activePlan = null;
        activePlanItem = null;
        refreshStatuses();
      }
    } catch (err: any) {
      errorMsg = err.message || 'Installation encountered an error';
    }
  }
</script>

{#if isOpen}
  <div class="modal-overlay" onclick={onClose} role="dialog" aria-modal="true">
    <div class="modal-card" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <div class="title-group">
          <h2 class="title">包与扩展管理 (Packages & Extensions)</h2>
          <span class="subtitle">基于同源站点 Forge 货架与额外内容契约，支持 Octave Forge 扩展包与运行时能力层</span>
        </div>
        <button class="btn-close" onclick={onClose} aria-label="Close">✕</button>
      </div>

      <!-- 搜索与筛选工具栏 -->
      <div class="toolbar">
        <div class="search-box">
          <input
            type="text"
            class="input-search"
            placeholder="搜索扩展包名、描述或依赖..."
            bind:value={searchQuery}
          />
          {#if searchQuery}
            <button class="btn-clear" onclick={() => (searchQuery = '')}>✕</button>
          {/if}
        </div>

        <div class="filter-row">
          <div class="filter-group">
            <span class="filter-label">引擎:</span>
            <button
              class="filter-pill"
              class:active={selectedConsumer === 'all'}
              onclick={() => (selectedConsumer = 'all')}
            >全部</button>
            <button
              class="filter-pill"
              class:active={selectedConsumer === 'octave'}
              onclick={() => (selectedConsumer = 'octave')}
            >Octave</button>
            <button
              class="filter-pill"
              class:active={selectedConsumer === 'omc'}
              onclick={() => (selectedConsumer = 'omc')}
            >OMC</button>
          </div>

          <div class="filter-group">
            <span class="filter-label">形态:</span>
            <button
              class="filter-pill"
              class:active={selectedForm === 'all'}
              onclick={() => (selectedForm = 'all')}
            >全部</button>
            <button
              class="filter-pill"
              class:active={selectedForm === 'pkg'}
              onclick={() => (selectedForm = 'pkg')}
            >标准包</button>
            <button
              class="filter-pill"
              class:active={selectedForm === 'tree'}
              onclick={() => (selectedForm = 'tree')}
            >能力层</button>
          </div>

          <label class="checkbox-label">
            <input type="checkbox" bind:checked={installedOnly} />
            <span>仅看已安装</span>
          </label>
        </div>
      </div>

      {#if errorMsg}
        <div class="error-banner">
          <span>⚠️ {errorMsg}</span>
          <button class="btn-dismiss" onclick={() => (errorMsg = null)}>✕</button>
        </div>
      {/if}

      <!-- 包列表展示区 -->
      <div class="modal-body">
        {#if !catalogLoaded}
          <div class="loading-state">
            <span class="spinner"></span>
            <span>正在加载扩展货架目录 (assets/forge-catalog.json)...</span>
          </div>
        {:else if filteredPackages.length === 0}
          <div class="empty-state">
            <p>没有找到匹配的扩展包。</p>
          </div>
        {:else}
          <div class="package-grid">
            {#each filteredPackages as item (item.name)}
              {@const status = packageStatuses[item.name] || { compatible: true, fromSource: false, installed: false }}
              {@const isInst = installingMap[item.name] || false}
              {@const versions = packageManagerPlugin.getVersions(item.name)}
              {@const currentVer = selectedVersions[item.name] || item.version}
              {@const extraSize = packageManagerPlugin.estimateExtraDownload(item.name)}

              <div class="package-card" class:installed={status.installed}>
                <div class="card-header">
                  <div class="title-row">
                    <span class="package-name">{item.name}</span>
                    <span class="package-version">v{currentVer}</span>
                  </div>
                  <div class="badge-row">
                    <!-- consumer 分流标签 -->
                    <span class="badge consumer-badge" class:omc={item.consumer === 'omc'}>
                      {item.consumer || 'octave'}
                    </span>
                    <!-- 投送形态 -->
                    <span class="badge form-badge" class:tree={item.form === 'tree'}>
                      {item.form === 'tree' ? '能力层 (tree)' : '扩展包 (pkg)'}
                    </span>
                    <!-- 内容构成 -->
                    {#if item.form === 'tree'}
                      <span class="badge runtime-badge">运行时能力</span>
                    {:else if item.content && item.content.length > 0}
                      {#each item.content as c}
                        <span class="badge content-badge content-{c}">
                          {c === 'm' ? '纯 M' : c === 'src' ? '含源码' : '.oct 预编'}
                        </span>
                      {/each}
                    {/if}
                  </div>
                </div>

                <p class="package-desc">{item.description || '无详细描述'}</p>

                {#if item.deps && item.deps.length > 0}
                  <div class="deps-row">
                    <span class="deps-label">依赖:</span>
                    {#each item.deps as dep}
                      <span class="dep-pill">{dep}</span>
                    {/each}
                  </div>
                {/if}

                <!-- 版本选择与体积信息 -->
                <div class="version-select-row">
                  {#if versions.length > 1}
                    <label class="select-label">
                      <span>版本:</span>
                      <select
                        class="version-select"
                        bind:value={selectedVersions[item.name]}
                        disabled={isInst || status.installed}
                      >
                        {#each versions as v}
                          <option value={v.version} disabled={v.stage === 'withheld'}>
                            {v.version} {v.stage === 'withheld' ? '(未上架)' : ''}
                          </option>
                        {/each}
                      </select>
                    </label>
                  {/if}

                  <div class="size-info">
                    <span>体积: {formatBytes(item.size)}</span>
                    {#if extraSize > 0}
                      <span class="extra-size" title="依赖能力层需要的额外体积">+ 运行时 {formatBytes(extraSize)}</span>
                    {/if}
                  </div>
                </div>

                <!-- 底部操作按钮栏 -->
                <div class="card-footer">
                  {#if status.installed}
                    <button class="btn-action btn-installed" disabled>
                      ✓ 已安装
                    </button>
                  {:else if !status.compatible}
                    <button class="btn-action btn-incompatible" disabled title="架构或前置条件不满足">
                      ⊘ 架构不兼容
                    </button>
                  {:else if isInst}
                    <button class="btn-action btn-installing" disabled>
                      <span class="btn-spinner"></span> 安装中...
                    </button>
                  {:else}
                    <div class="btn-action-group">
                      <button class="btn-action btn-plan" onclick={() => openPlanPreview(item)}>
                        预演
                      </button>
                      <button class="btn-action btn-install" onclick={() => triggerInstall(item)}>
                        安装
                      </button>
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- 预演执行计划子弹窗 -->
      {#if activePlanItem}
        <div class="plan-submodal">
          <div class="plan-card">
            <div class="plan-header">
              <h3>安装计划预演: {activePlanItem.name}</h3>
              <button class="btn-close-sm" onclick={() => { activePlanItem = null; activePlan = null; }}>✕</button>
            </div>
            {#if planLoading}
              <div class="plan-loading">
                <span class="spinner"></span>
                <span>正在向引擎询问安装依赖与真算体积 (planOnly)...</span>
              </div>
            {:else if activePlan}
              <div class="plan-content">
                <div class="plan-metric">
                  <span class="metric-label">总传输预算:</span>
                  <span class="metric-value">{formatBytes(activePlan.bytes)}</span>
                </div>
                {#if activePlan.layers && activePlan.layers.length > 0}
                  <div class="plan-metric">
                    <span class="metric-label">包含能力层:</span>
                    <span class="metric-value">{activePlan.layers.join(', ')}</span>
                  </div>
                {/if}
                <p class="plan-note">
                  真算出口由宿主 <code>install(..., &#123;planOnly: true&#125;)</code> 权威测定，零网络请求预演完成。
                </p>
                <div class="plan-actions">
                  <button class="btn-cancel" onclick={() => { activePlanItem = null; activePlan = null; }}>取消</button>
                  <button class="btn-confirm-install" onclick={() => triggerInstall(activePlanItem!)}>确认安装</button>
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-card {
    background: var(--bg-primary, #ffffff);
    color: var(--text-primary, #1e293b);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 12px;
    width: 90vw;
    max-width: 960px;
    height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
    overflow: hidden;
    position: relative;
  }

  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
  }

  .title-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
  }

  .subtitle {
    font-size: 0.75rem;
    color: var(--text-secondary, #64748b);
  }

  .btn-close {
    background: none;
    border: none;
    font-size: 1.1rem;
    cursor: pointer;
    color: var(--text-secondary, #64748b);
    padding: 4px;
    border-radius: 4px;
  }
  .btn-close:hover {
    color: var(--text-primary, #0f172a);
    background: var(--bg-secondary, #f1f5f9);
  }

  .toolbar {
    padding: 12px 20px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    background: var(--bg-secondary, #f8fafc);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .search-box {
    position: relative;
    width: 100%;
  }

  .input-search {
    width: 100%;
    padding: 8px 12px;
    font-size: 0.85rem;
    border-radius: 6px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-primary, #ffffff);
    color: var(--text-primary, #1e293b);
    outline: none;
    box-sizing: border-box;
  }
  .input-search:focus {
    border-color: var(--accent-color, #0284c7);
  }

  .btn-clear {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--text-secondary, #94a3b8);
    cursor: pointer;
    font-size: 0.85rem;
  }

  .filter-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
    font-size: 0.8rem;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .filter-label {
    color: var(--text-secondary, #64748b);
    font-weight: 500;
  }

  .filter-pill {
    padding: 3px 10px;
    border-radius: 12px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-primary, #ffffff);
    color: var(--text-primary, #334155);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .filter-pill:hover {
    border-color: var(--accent-color, #0284c7);
  }
  .filter-pill.active {
    background: var(--accent-color, #0284c7);
    color: #ffffff;
    border-color: var(--accent-color, #0284c7);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    color: var(--text-secondary, #475569);
    user-select: none;
    margin-left: auto;
  }

  .error-banner {
    background: #fef2f2;
    color: #b91c1c;
    border-bottom: 1px solid #fecaca;
    padding: 8px 20px;
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .btn-dismiss {
    background: none;
    border: none;
    color: #b91c1c;
    cursor: pointer;
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
  }

  .loading-state, .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-secondary, #64748b);
    gap: 12px;
    font-size: 0.9rem;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid rgba(0, 0, 0, 0.1);
    border-top-color: var(--accent-color, #0284c7);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .package-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
  }

  .package-card {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .package-card:hover {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }
  .package-card.installed {
    border-left: 4px solid #10b981;
  }

  .title-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .package-name {
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--text-primary, #0f172a);
  }

  .package-version {
    font-size: 0.75rem;
    font-family: monospace;
    color: var(--text-secondary, #64748b);
  }

  .badge-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }

  .badge {
    font-size: 0.65rem;
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 500;
  }

  .consumer-badge {
    background: #e0f2fe;
    color: #0369a1;
  }
  .consumer-badge.omc {
    background: #f3e8ff;
    color: #7e22ce;
  }

  .form-badge {
    background: #f1f5f9;
    color: #475569;
  }
  .form-badge.tree {
    background: #ecfdf5;
    color: #047857;
  }

  .runtime-badge {
    background: #dcfce7;
    color: #15803d;
  }

  .content-badge.content-m {
    background: #e0e7ff;
    color: #4338ca;
  }
  .content-badge.content-src {
    background: #fef3c7;
    color: #b45309;
  }
  .content-badge.content-oct {
    background: #fee2e2;
    color: #b91c1c;
  }

  .package-desc {
    font-size: 0.8rem;
    color: var(--text-secondary, #475569);
    margin: 0;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .deps-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    font-size: 0.7rem;
  }
  .deps-label {
    color: var(--text-secondary, #64748b);
  }
  .dep-pill {
    background: var(--bg-secondary, #f1f5f9);
    color: var(--text-secondary, #475569);
    padding: 1px 5px;
    border-radius: 3px;
    font-family: monospace;
  }

  .version-select-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.75rem;
    margin-top: auto;
    padding-top: 6px;
    border-top: 1px dashed var(--border-color, #f1f5f9);
  }

  .select-label {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .version-select {
    padding: 2px 6px;
    font-size: 0.75rem;
    border-radius: 4px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-primary, #ffffff);
    color: var(--text-primary, #1e293b);
  }

  .size-info {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    color: var(--text-secondary, #64748b);
    font-size: 0.7rem;
  }
  .extra-size {
    color: #d97706;
    font-size: 0.65rem;
  }

  .card-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    margin-top: 4px;
  }

  .btn-action-group {
    display: flex;
    gap: 6px;
  }

  .btn-action {
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s ease;
  }

  .btn-install {
    background: var(--accent-color, #0284c7);
    color: #ffffff;
  }
  .btn-install:hover {
    background: #0369a1;
  }

  .btn-plan {
    background: var(--bg-secondary, #f1f5f9);
    color: var(--text-primary, #334155);
    border: 1px solid var(--border-color, #cbd5e1);
  }
  .btn-plan:hover {
    background: #e2e8f0;
  }

  .btn-installed {
    background: #ecfdf5;
    color: #047857;
    border: 1px solid #a7f3d0;
    cursor: default;
  }

  .btn-incompatible {
    background: #f1f5f9;
    color: #94a3b8;
    border: 1px solid #e2e8f0;
    cursor: not-allowed;
  }

  .btn-installing {
    background: #f8fafc;
    color: var(--accent-color, #0284c7);
    border: 1px solid var(--accent-color, #0284c7);
    cursor: wait;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .btn-spinner {
    width: 10px;
    height: 10px;
    border: 2px solid rgba(2, 132, 199, 0.2);
    border-top-color: #0284c7;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  /* Plan submodal */
  .plan-submodal {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
  }

  .plan-card {
    background: var(--bg-primary, #ffffff);
    color: var(--text-primary, #1e293b);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 8px;
    width: 420px;
    max-width: 90%;
    padding: 20px;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  }

  .plan-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    padding-bottom: 10px;
    margin-bottom: 14px;
  }
  .plan-header h3 {
    margin: 0;
    font-size: 0.95rem;
  }
  .btn-close-sm {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-secondary, #64748b);
  }

  .plan-metric {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 0.85rem;
  }
  .metric-label {
    color: var(--text-secondary, #64748b);
  }
  .metric-value {
    font-weight: 600;
  }

  .plan-note {
    font-size: 0.75rem;
    color: var(--text-secondary, #64748b);
    line-height: 1.4;
    background: var(--bg-secondary, #f8fafc);
    padding: 8px;
    border-radius: 4px;
    margin: 12px 0;
  }

  .plan-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .btn-cancel {
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: none;
    cursor: pointer;
    font-size: 0.8rem;
  }
  .btn-confirm-install {
    padding: 6px 14px;
    border-radius: 6px;
    background: var(--accent-color, #0284c7);
    color: #ffffff;
    border: none;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 500;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
