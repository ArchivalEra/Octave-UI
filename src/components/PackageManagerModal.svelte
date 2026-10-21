<!-- src/components/PackageManagerModal.svelte -->
<script lang="ts">
  import { packageManagerPlugin, downloadStore, projectWorkspace, i18n, t } from '../modules/appContext';
  import type { ForgePackageItem, InstallPlan } from '../modules/plugins/package/types';
  import type { Locale } from '../modules/i18n/types';
  import type { DownloadRef } from '../modules/storage/downloadTypes';

  let { isOpen, onClose } = $props<{
    isOpen: boolean;
    onClose: () => void;
  }>();

  let searchQuery = $state('');
  let selectedConsumer = $state<'all' | 'octave' | 'omc'>('all');
  let selectedForm = $state<'all' | 'pkg' | 'tree'>('all');
  let installedOnly = $state(false);
  let currentLocale = $state<Locale>(i18n.currentLocale);

  let selectedVersions = $state<Record<string, string>>({});
  let packageStatuses = $state<Record<string, { compatible: boolean; fromSource: boolean; installed: boolean; detail?: any }>>({});
  let downloadedRecords = $state<Record<string, boolean>>({});
  let installingMap = $state<Record<string, boolean>>({});
  let downloadingState = $state<Record<string, { receivedBytes: number; totalBytes: number; phase?: string }>>({});
  let compilingMap = $state<Record<string, boolean>>({});
  let compiledMap = $state<Record<string, boolean>>({});

  let activePlan = $state<InstallPlan | null>(null);
  let activePlanItem = $state<ForgePackageItem | null>(null);
  let planLoading = $state(false);
  let errorMsg = $state<string | null>(null);
  let catalogLoaded = $state(false);
  let hasLLVM = $state(false);

  // A4 / A5 下载体量预演与配额确认
  let confirmDownloadItem = $state<ForgePackageItem | null>(null);
  let confirmDownloadBreakdown = $state<Array<{ name: string; size: number }>>([]);
  let confirmDownloadQuota = $state<{ available: number; remaining: number } | null>(null);
  let confirmDownloadError = $state<string | null>(null);

  // 裁决⑤ 前置拦截
  let llvmPromptOpen = $state(false);

  // 编译诊断实时抽屉
  let diagnosticsDrawerOpen = $state(false);
  let diagnosticsItemName = $state('');
  let diagnosticsLogs = $state<string[]>([]);
  let diagnosticsStatus = $state<'idle' | 'compiling' | 'success' | 'failed'>('idle');
  let copiedLogs = $state(false);

  async function refreshStatuses() {
    const packs = packageManagerPlugin.getAllPackages();
    const map: Record<string, any> = {};
    const instMap: Record<string, boolean> = {};
    for (const p of packs) {
      map[p.name] = packageManagerPlugin.getStatus(p.name);
      instMap[p.name] = packageManagerPlugin.isInstalling(p.name);
    }
    packageStatuses = map;
    installingMap = instMap;

    try {
      const snap = await downloadStore.index();
      const dlMap: Record<string, boolean> = {};
      for (const rec of Object.values(snap.manifest.items)) {
        dlMap[rec.ref.name] = true;
      }
      downloadedRecords = dlMap;
      hasLLVM = await packageManagerPlugin.hasLLVM();
    } catch {}
  }

  $effect(() => {
    const unsubI18n = i18n.subscribe((loc) => {
      currentLocale = loc;
    });

    if (isOpen) {
      if (!packageManagerPlugin.getCatalog()) {
        packageManagerPlugin.loadCatalog()
          .then(() => {
            catalogLoaded = true;
            refreshStatuses();
          })
          .catch((err) => {
            const errCode = err?.code;
            const codeKey = errCode ? `errors.${errCode}` : '';
            errorMsg = (codeKey && t(codeKey) !== codeKey)
              ? t(codeKey)
              : t('package_manager.err_load_catalog', { error: err?.message || String(err) });
          });
      } else {
        catalogLoaded = true;
        refreshStatuses();
      }

      const unsubPlugin = packageManagerPlugin.subscribe(() => {
        refreshStatuses();
      });

      function handleKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
          if (confirmDownloadItem) {
            confirmDownloadItem = null;
          } else if (llvmPromptOpen) {
            llvmPromptOpen = false;
          } else if (diagnosticsDrawerOpen) {
            diagnosticsDrawerOpen = false;
          } else if (activePlan) {
            activePlan = null;
            activePlanItem = null;
          } else {
            onClose();
          }
        }
      }

      window.addEventListener('keydown', handleKeyDown);
      return () => {
        unsubI18n();
        unsubPlugin();
        window.removeEventListener('keydown', handleKeyDown);
      };
    }

    return () => {
      unsubI18n();
    };
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

  function getPackageLinks(item: ForgePackageItem): Array<{ label: string; url: string; icon?: string }> {
    if (!item) return [];
    if (Array.isArray(item.links)) {
      return item.links.filter((l) => l && l.url && l.label);
    }
    if (item.links && typeof item.links === 'object') {
      return Object.entries(item.links).map(([label, url]) => ({
        label,
        url: typeof url === 'string' ? url : (url as any)?.url || String(url),
      }));
    }
    if (item.upstream_url) {
      return [{ label: 'Upstream', url: item.upstream_url }];
    }
    return [];
  }

  async function openDownloadConfirm(item: ForgePackageItem) {
    confirmDownloadItem = item;
    confirmDownloadError = null;
    const ver = selectedVersions[item.name] || item.version;
    const extra = packageManagerPlugin.estimateExtraDownload(item.name);
    const fileName = item.url ? item.url.split('/').pop()! : `${item.name}-${ver}.tar.gz`;
    const breakdown = [
      { name: fileName, size: item.size || 0 },
    ];
    if (extra > 0) {
      breakdown.push({ name: 'Runtime dependency', size: extra });
    }
    confirmDownloadBreakdown = breakdown;
    const totalBytes = breakdown.reduce((acc, f) => acc + f.size, 0);
    try {
      const quotaCheck = await downloadStore.checkQuota(totalBytes);
      confirmDownloadQuota = { available: quotaCheck.available, remaining: quotaCheck.remaining };
      if (!quotaCheck.ok) {
        confirmDownloadError = t('errors.STORAGE_QUOTA_EXHAUSTED');
      }
    } catch {
      confirmDownloadQuota = null;
    }
  }

  async function executeDownload(item: ForgePackageItem) {
    if (confirmDownloadError) return;
    const ver = selectedVersions[item.name] || item.version;
    const isTree = item.form === 'tree';
    const ref: DownloadRef = {
      name: item.name,
      version: ver,
      kind: isTree ? 'runtime' : 'src',
    };
    confirmDownloadItem = null;
    downloadingState = {
      ...downloadingState,
      [item.name]: { receivedBytes: 0, totalBytes: item.size || 0, phase: 'Downloading' },
    };

    try {
      await packageManagerPlugin.downloadPackage(ref, {
        onProgress: (p) => {
          downloadingState = {
            ...downloadingState,
            [item.name]: p,
          };
        },
      });
      const nextDl = { ...downloadingState };
      delete nextDl[item.name];
      downloadingState = nextDl;
      await refreshStatuses();
    } catch (err: any) {
      const nextDl = { ...downloadingState };
      delete nextDl[item.name];
      downloadingState = nextDl;
      errorMsg = err.message || String(err);
    }
  }

  async function downloadLLVM() {
    llvmPromptOpen = false;
    const llvmPkg = packageManagerPlugin.getPackage('llvm-wasm');
    const ver = llvmPkg?.version || '6.0.12';
    const totalBytes = llvmPkg?.size || 122922700;
    const ref: DownloadRef = {
      name: 'llvm-wasm',
      version: ver,
      kind: 'runtime',
    };
    downloadingState = {
      ...downloadingState,
      'llvm-wasm': { receivedBytes: 0, totalBytes, phase: 'Downloading LLVM' },
    };
    try {
      await packageManagerPlugin.downloadPackage(ref, {
        onProgress: (p) => {
          downloadingState = {
            ...downloadingState,
            'llvm-wasm': p,
          };
        },
      });
      const nextDl = { ...downloadingState };
      delete nextDl['llvm-wasm'];
      downloadingState = nextDl;
      await refreshStatuses();
    } catch (err: any) {
      const nextDl = { ...downloadingState };
      delete nextDl['llvm-wasm'];
      downloadingState = nextDl;
      errorMsg = err.message || String(err);
    }
  }

  async function openPlanPreview(item: ForgePackageItem) {
    activePlanItem = item;
    planLoading = true;
    errorMsg = null;
    const version = selectedVersions[item.name] || item.version;
    try {
      activePlan = await packageManagerPlugin.planInstall(item.name, version);
    } catch (err: any) {
      errorMsg = t('package_manager.err_compute_plan', { error: err.message || String(err) });
    } finally {
      planLoading = false;
    }
  }

  async function triggerInstall(item: ForgePackageItem) {
    const hasSrc = item.content && item.content.includes('src');
    if (hasSrc) {
      const llvmReady = await packageManagerPlugin.hasLLVM();
      if (!llvmReady) {
        llvmPromptOpen = true;
        return;
      }
    }
    const version = selectedVersions[item.name] || item.version;
    errorMsg = null;
    try {
      const res = await packageManagerPlugin.installPackage(item.name, { version });
      if (res.state !== 'ok') {
        errorMsg = t('package_manager.err_install_failed', { error: res.message || res.cause || res.state });
      } else {
        activePlan = null;
        activePlanItem = null;
        await refreshStatuses();
      }
    } catch (err: any) {
      errorMsg = t('package_manager.err_install_generic', { error: err.message || String(err) });
    }
  }

  async function handleLoadOrCompile(item: ForgePackageItem) {
    const hasSrc = item.content && item.content.includes('src');
    if (hasSrc) {
      const llvmReady = await packageManagerPlugin.hasLLVM();
      if (!llvmReady) {
        llvmPromptOpen = true;
        return;
      }
      diagnosticsItemName = item.name;
      diagnosticsLogs = [];
      diagnosticsStatus = 'compiling';
      diagnosticsDrawerOpen = true;
      compilingMap = { ...compilingMap, [item.name]: true };
      try {
        const res = await packageManagerPlugin.compilePackage(item.name, {
          onDiagnostic: (line) => {
            diagnosticsLogs = [...diagnosticsLogs, line];
          },
        });
        compilingMap = { ...compilingMap, [item.name]: false };
        if (res.state === 'compiled' || res.state === 'ok') {
          diagnosticsStatus = 'success';
          diagnosticsLogs = [
            ...diagnosticsLogs,
            `[compile] ${t('package_manager.compile_success')} ✓`,
            `[compile] ${t('package_manager.relink_pending_note')}`,
          ];
          compiledMap = { ...compiledMap, [item.name]: true };
          await refreshStatuses();
        } else if (res.state === 'm-only') {
          diagnosticsStatus = 'success';
          diagnosticsLogs = [
            ...diagnosticsLogs,
            `[compile] M-only: ${res.why || 'No compilable native src'}`,
          ];
          compiledMap = { ...compiledMap, [item.name]: true };
          await refreshStatuses();
        } else {
          diagnosticsStatus = 'failed';
          if (res.why && !diagnosticsLogs.some((l) => l.includes(res.why!))) {
            diagnosticsLogs = [...diagnosticsLogs, `[failed] ${res.why}`];
          }
        }
      } catch (err: any) {
        compilingMap = { ...compilingMap, [item.name]: false };
        diagnosticsStatus = 'failed';
        diagnosticsLogs = [...diagnosticsLogs, `[error] ${err.message || String(err)}`];
      }
    } else {
      await triggerInstall(item);
    }
  }

  function copyDiagnostics() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(diagnosticsLogs.join('\n'));
      copiedLogs = true;
      setTimeout(() => {
        copiedLogs = false;
      }, 2000);
    }
  }
</script>

{#if isOpen}
  <div class="modal-overlay" onclick={onClose} role="dialog" aria-modal="true" data-testid="package-manager-modal">
    <div class="modal-card" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <div class="title-group">
          <h2 class="title">{t('package_manager.title')}</h2>
          <span class="subtitle">{t('package_manager.subtitle')}</span>
        </div>
        <button class="btn-close" onclick={onClose} aria-label={t('package_manager.plan_btn_cancel')} data-action="close">✕</button>
      </div>

      <!-- 搜索与筛选工具栏 -->
      <div class="toolbar">
        <div class="search-box">
          <input
            type="text"
            class="input-search"
            placeholder={t('package_manager.search_placeholder')}
            bind:value={searchQuery}
            data-action="search"
          />
          {#if searchQuery}
            <button class="btn-clear" onclick={() => (searchQuery = '')} aria-label="Clear search">✕</button>
          {/if}
        </div>

        <div class="filter-row">
          <div class="filter-group">
            <span class="filter-label">{t('package_manager.filter_engine')}</span>
            <button
              class="filter-pill"
              class:active={selectedConsumer === 'all'}
              onclick={() => (selectedConsumer = 'all')}
              data-action="filter-consumer"
              data-consumer="all"
            >{t('package_manager.filter_all')}</button>
            <button
              class="filter-pill"
              class:active={selectedConsumer === 'octave'}
              onclick={() => (selectedConsumer = 'octave')}
              data-action="filter-consumer"
              data-consumer="octave"
            >{t('package_manager.filter_octave')}</button>
            <button
              class="filter-pill"
              class:active={selectedConsumer === 'omc'}
              onclick={() => (selectedConsumer = 'omc')}
              data-action="filter-consumer"
              data-consumer="omc"
            >{t('package_manager.filter_omc')}</button>
          </div>

          <div class="filter-group">
            <span class="filter-label">{t('package_manager.filter_form')}</span>
            <button
              class="filter-pill"
              class:active={selectedForm === 'all'}
              onclick={() => (selectedForm = 'all')}
              data-action="filter-form"
              data-form="all"
            >{t('package_manager.filter_all')}</button>
            <button
              class="filter-pill"
              class:active={selectedForm === 'pkg'}
              onclick={() => (selectedForm = 'pkg')}
              data-action="filter-form"
              data-form="pkg"
            >{t('package_manager.filter_pkg')}</button>
            <button
              class="filter-pill"
              class:active={selectedForm === 'tree'}
              onclick={() => (selectedForm = 'tree')}
              data-action="filter-form"
              data-form="tree"
            >{t('package_manager.filter_tree')}</button>
          </div>

          <label class="checkbox-label">
            <input type="checkbox" bind:checked={installedOnly} data-action="filter-installed-only" />
            <span>{t('package_manager.filter_installed_only')}</span>
          </label>
        </div>
      </div>

      {#if errorMsg}
        <div class="error-banner">
          <span>⚠️ {errorMsg}</span>
          <button class="btn-dismiss" onclick={() => (errorMsg = null)} aria-label="Dismiss error">✕</button>
        </div>
      {/if}

      <!-- 包列表展示区 -->
      <div class="modal-body">
        {#if !catalogLoaded}
          <div class="loading-state">
            <span class="spinner"></span>
            <span>{t('package_manager.loading_catalog')}</span>
          </div>
        {:else if filteredPackages.length === 0}
          <div class="empty-state">
            <p>{t('package_manager.empty')}</p>
          </div>
        {:else}
          <div class="package-grid">
            {#each filteredPackages as item (item.name)}
              {@const status = packageStatuses[item.name] || { compatible: true, fromSource: false, installed: false }}
              {@const isInst = installingMap[item.name] || false}
              {@const versions = packageManagerPlugin.getVersions(item.name)}
              {@const currentVer = selectedVersions[item.name] || item.version}
              {@const extraSize = packageManagerPlugin.estimateExtraDownload(item.name)}
              {@const links = getPackageLinks(item)}

              <div class="package-card" class:installed={status.installed || compiledMap[item.name]} data-package={item.name}>
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
                      {item.form === 'tree' ? t('package_manager.tag_tree') : t('package_manager.tag_pkg')}
                    </span>
                    <!-- 内容构成 -->
                    {#if item.form === 'tree'}
                      <span class="badge runtime-badge">{t('package_manager.tag_runtime')}</span>
                    {:else if item.content && item.content.length > 0}
                      {#each item.content as c}
                        <span class="badge content-badge content-{c}">
                          {c === 'm' ? t('package_manager.content_m') : c === 'src' ? t('package_manager.content_src') : t('package_manager.content_oct')}
                        </span>
                      {/each}
                    {/if}

                    <!-- 已下载徽章 -->
                    {#if downloadedRecords[item.name]}
                      <span class="badge downloaded-badge">{t('package_manager.btn_downloaded')}</span>
                    {/if}

                    <!-- 活跃会话徽章 -->
                    {#if status.installed}
                      <span class="badge active-badge">● Active</span>
                    {/if}

                    <!-- 其他架构徽章 (A3) -->
                    {#if item.arch && item.arch !== projectWorkspace.activeLane}
                      <span class="badge arch-badge" title={t('package_manager.other_arch_tip', { arch: item.arch, currentArch: projectWorkspace.activeLane })}>
                        {t('package_manager.other_arch')}
                      </span>
                    {/if}
                  </div>
                </div>

                <p class="package-desc">{item.description || t('package_manager.no_desc')}</p>

                {#if links.length > 0}
                  <div class="package-links-row">
                    {#each links as link}
                      <a href={link.url} target="_blank" rel="noopener noreferrer" class="package-link-pill">
                        {link.label} ↗
                      </a>
                    {/each}
                  </div>
                {/if}

                {#if item.deps && item.deps.length > 0}
                  <div class="deps-row">
                    <span class="deps-label">{t('package_manager.deps_label')}</span>
                    {#each item.deps as dep}
                      <span class="dep-pill">{dep}</span>
                    {/each}
                  </div>
                {/if}

                <!-- 版本选择与体积信息 -->
                <div class="version-select-row">
                  {#if versions.length > 1}
                    <label class="select-label">
                      <span>{t('package_manager.version_label')}</span>
                      <select
                        class="version-select"
                        bind:value={selectedVersions[item.name]}
                        disabled={isInst || status.installed}
                        data-action="select-version"
                        data-package={item.name}
                      >
                        {#each versions as v}
                          <option value={v.version} disabled={v.stage === 'withheld'}>
                            {v.version} {v.stage === 'withheld' ? t('package_manager.stage_withheld') : ''}
                          </option>
                        {/each}
                      </select>
                    </label>
                  {/if}

                  <div class="size-info">
                    <span>{t('package_manager.size_label', { size: formatBytes(item.size) })}</span>
                    {#if extraSize > 0}
                      <span class="extra-size" title={t('package_manager.runtime_extra_tooltip')}>
                        {t('package_manager.runtime_extra_size', { size: formatBytes(extraSize) })}
                      </span>
                    {/if}
                  </div>
                </div>

                <!-- 底部操作按钮栏 -->
                <div class="card-footer">
                  {#if downloadingState[item.name]}
                    {@const dl = downloadingState[item.name]}
                    {@const pct = dl.totalBytes > 0 ? Math.min(100, Math.round((dl.receivedBytes / dl.totalBytes) * 100)) : 0}
                    <div class="download-progress-wrap" title={dl.phase || t('package_manager.btn_downloading')}>
                      <div class="progress-bar-track">
                        {#if dl.totalBytes > 0}
                          <div class="progress-bar-fill" style="width: {pct}%"></div>
                        {:else}
                          <div class="progress-bar-wave"></div>
                        {/if}
                      </div>
                      <span class="progress-label">
                        {#if dl.totalBytes > 0}
                          {pct}%
                        {:else}
                          {t('package_manager.btn_downloading')}
                        {/if}
                      </span>
                    </div>
                  {:else}
                    <div class="btn-action-group">
                      <!-- 双动作一：下载 (未下载提供下载，已下载展示对勾状态) -->
                      {#if downloadedRecords[item.name]}
                        <button class="btn-action btn-downloaded" disabled title={t('package_manager.btn_downloaded')}>
                          {t('package_manager.btn_downloaded')}
                        </button>
                      {:else}
                        <button class="btn-action btn-download" onclick={() => openDownloadConfirm(item)} data-action="download" data-package={item.name}>
                          {t('package_manager.btn_download')}
                        </button>
                      {/if}

                      <!-- 双动作二：装载 / 编译 / 活跃状态 -->
                      {#if status.installed || compiledMap[item.name]}
                        <button class="btn-action btn-installed" disabled data-action="installed" data-package={item.name}>
                          {t('package_manager.btn_installed')}
                        </button>
                      {:else if !status.compatible}
                        <button class="btn-action btn-incompatible" disabled title={t('package_manager.btn_incompatible_tooltip')} data-action="incompatible" data-package={item.name}>
                          {t('package_manager.btn_incompatible')}
                        </button>
                      {:else if compilingMap[item.name]}
                        <button class="btn-action btn-installing" disabled data-action="compiling" data-package={item.name}>
                          <span class="btn-spinner"></span> {t('package_manager.btn_compiling')}
                        </button>
                      {:else if isInst}
                        <button class="btn-action btn-installing" disabled data-action="installing" data-package={item.name}>
                          <span class="btn-spinner"></span> {t('package_manager.btn_loading')}
                        </button>
                      {:else if item.content && item.content.includes('src')}
                        <button class="btn-action btn-compile" onclick={() => handleLoadOrCompile(item)} data-action="compile" data-package={item.name}>
                          {t('package_manager.btn_compile')}
                        </button>
                      {:else if item.role === 'toolchain' || item.name === 'llvm-wasm'}
                        <!-- 编译工具链由 DownloadStore 管理，不走解释器装载 (mail/024) -->
                      {:else}
                        <button class="btn-action btn-install" onclick={() => handleLoadOrCompile(item)} data-action="install" data-package={item.name}>
                          {t('package_manager.btn_load')}
                        </button>
                      {/if}
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
              <h3>{t('package_manager.plan_title', { name: activePlanItem.name })}</h3>
              <button class="btn-close-sm" onclick={() => { activePlanItem = null; activePlan = null; }} aria-label="Close" data-action="cancel-plan">✕</button>
            </div>
            {#if planLoading}
              <div class="plan-loading">
                <span class="spinner"></span>
                <span>{t('package_manager.plan_loading')}</span>
              </div>
            {:else if activePlan}
              <div class="plan-content">
                <div class="plan-metric">
                  <span class="metric-label">{t('package_manager.plan_budget')}</span>
                  <span class="metric-value">{formatBytes(activePlan.bytes)}</span>
                </div>
                {#if activePlan.layers && activePlan.layers.length > 0}
                  <div class="plan-metric">
                    <span class="metric-label">{t('package_manager.plan_layers')}</span>
                    <span class="metric-value">{activePlan.layers.join(', ')}</span>
                  </div>
                {/if}
                <p class="plan-note">
                  {t('package_manager.plan_note')}
                </p>
                <div class="plan-actions">
                  <button class="btn-cancel" onclick={() => { activePlanItem = null; activePlan = null; }} data-action="cancel-plan">
                    {t('package_manager.plan_btn_cancel')}
                  </button>
                  <button class="btn-confirm-install" onclick={() => triggerInstall(activePlanItem!)} data-action="confirm-install" data-package={activePlanItem.name}>
                    {t('package_manager.plan_btn_confirm')}
                  </button>
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- 体量预演弹窗 (A4) 与存储配额预检 (A5) -->
      {#if confirmDownloadItem}
        <div class="plan-submodal">
          <div class="plan-card">
            <div class="plan-header">
              <h3>{t('package_manager.confirm_download_title', { name: confirmDownloadItem.name })}</h3>
              <button class="btn-close-sm" onclick={() => { confirmDownloadItem = null; }} aria-label="Close" data-action="cancel-download">✕</button>
            </div>
            <div class="plan-content">
              <div class="plan-metric">
                <span class="metric-label">{t('package_manager.file_breakdown')}</span>
              </div>
              <div class="breakdown-list">
                {#each confirmDownloadBreakdown as f}
                  <div class="breakdown-item">
                    <span class="breakdown-name">{f.name}</span>
                    <span class="breakdown-size">{formatBytes(f.size)}</span>
                  </div>
                {/each}
              </div>
              {#if confirmDownloadQuota}
                <div class="plan-metric quota-metric">
                  <span class="metric-label">{t('package_manager.quota_available', { quota: formatBytes(confirmDownloadQuota.remaining) })}</span>
                </div>
              {/if}
              {#if confirmDownloadError}
                <div class="error-banner in-card">
                  <span>⚠️ {confirmDownloadError}</span>
                </div>
              {/if}
              <div class="plan-actions">
                <button class="btn-cancel" onclick={() => { confirmDownloadItem = null; }} data-action="cancel-download">
                  {t('package_manager.plan_btn_cancel')}
                </button>
                <button
                  class="btn-confirm-install"
                  disabled={!!confirmDownloadError}
                  onclick={() => executeDownload(confirmDownloadItem!)}
                  data-action="confirm-download"
                  data-package={confirmDownloadItem.name}
                >
                  {t('package_manager.btn_download')}
                </button>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- 裁决⑤ 前置依赖拦截弹窗 -->
      {#if llvmPromptOpen}
        <div class="plan-submodal">
          <div class="plan-card">
            <div class="plan-header">
              <h3>{t('package_manager.llvm_required_title')}</h3>
              <button class="btn-close-sm" onclick={() => { llvmPromptOpen = false; }} aria-label="Close" data-action="cancel-llvm">✕</button>
            </div>
            <div class="plan-content">
              <p class="plan-note">
                {t('package_manager.llvm_required_desc')}
              </p>
              <div class="plan-actions">
                <button class="btn-cancel" onclick={() => { llvmPromptOpen = false; }} data-action="cancel-llvm">
                  {t('package_manager.plan_btn_cancel')}
                </button>
                <button class="btn-confirm-install" onclick={downloadLLVM} data-action="confirm-llvm">
                  {t('package_manager.btn_download_llvm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- 编译诊断实时抽屉 (host-008 & 契约) -->
      {#if diagnosticsDrawerOpen}
        <div class="diagnostics-drawer">
          <div class="drawer-header">
            <div class="drawer-title-group">
              <h4>{t('package_manager.diagnostics_title')} — {diagnosticsItemName}</h4>
              {#if diagnosticsStatus === 'success'}
                <span class="compile-badge success">✓ {t('package_manager.compile_success')}</span>
              {:else if diagnosticsStatus === 'failed'}
                <span class="compile-badge failed">✕ Failed</span>
              {:else if diagnosticsStatus === 'compiling'}
                <span class="compile-badge running"><span class="btn-spinner"></span> {t('package_manager.btn_compiling')}</span>
              {/if}
            </div>
            <button class="btn-close-sm" onclick={() => { diagnosticsDrawerOpen = false; }} aria-label="Close">✕</button>
          </div>

          {#if diagnosticsStatus === 'success'}
            <div class="relink-banner">
              <span>ℹ️ {t('package_manager.relink_pending_note')}</span>
            </div>
          {/if}

          <div class="diagnostics-console">
            {#if diagnosticsLogs.length === 0}
              <span class="console-empty">Waiting for compilation diagnostics...</span>
            {:else}
              {#each diagnosticsLogs as log}
                <div class="console-line">{log}</div>
              {/each}
            {/if}
          </div>

          <div class="drawer-footer">
            <button class="btn-cancel" onclick={copyDiagnostics} data-action="copy-diagnostics">
              {copiedLogs ? t('package_manager.copied_diagnostics') : t('package_manager.copy_diagnostics')}
            </button>
            <button class="btn-cancel" onclick={() => { diagnosticsDrawerOpen = false; }}>
              {t('package_manager.plan_btn_cancel')}
            </button>
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
    background: var(--bg-overlay);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-card {
    background: var(--bg-surface);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    width: 90vw;
    max-width: 960px;
    height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-3);
    overflow: hidden;
    position: relative;
  }

  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-subtle);
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
    color: var(--text-main);
  }

  .subtitle {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .btn-close {
    background: none;
    border: none;
    font-size: 1.1rem;
    cursor: pointer;
    color: var(--text-muted);
    padding: 4px;
    border-radius: 4px;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .btn-close:hover {
    color: var(--text-main);
    background: var(--bg-surface-hover);
  }

  .toolbar {
    padding: 12px 20px;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--bg-canvas);
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
    border: 1px solid var(--border-subtle);
    background: var(--bg-surface);
    color: var(--text-main);
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s ease;
  }
  .input-search:focus {
    border-color: var(--accent-primary);
  }

  .btn-clear {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--text-dim);
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
    color: var(--text-muted);
    font-weight: 500;
  }

  .filter-pill {
    padding: 3px 10px;
    border-radius: 12px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-surface);
    color: var(--text-main);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .filter-pill:hover {
    border-color: var(--accent-primary);
  }
  .filter-pill.active {
    background: var(--accent-primary);
    color: var(--accent-primary-text);
    border-color: var(--accent-primary);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    color: var(--text-muted);
    user-select: none;
    margin-left: auto;
  }

  .error-banner {
    background: var(--bg-surface);
    color: var(--accent-danger);
    border-bottom: 1px solid var(--accent-danger);
    padding: 8px 20px;
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .btn-dismiss {
    background: none;
    border: none;
    color: var(--accent-danger);
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
    color: var(--text-muted);
    gap: 12px;
    font-size: 0.9rem;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid var(--border-subtle);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .package-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
  }

  .package-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-shadow: var(--shadow-1);
    transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  }
  .package-card:hover {
    box-shadow: var(--shadow-2);
    border-color: var(--accent-primary);
  }
  .package-card.installed {
    border-left: 4px solid var(--accent-success);
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
    color: var(--text-main);
  }

  .package-version {
    font-size: 0.75rem;
    font-family: monospace;
    color: var(--text-muted);
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
    background: var(--bg-surface-hover);
    color: var(--accent-primary);
    border: 1px solid var(--border-subtle);
  }
  .consumer-badge.omc {
    background: var(--bg-surface-hover);
    color: var(--md-sys-color-tertiary);
    border: 1px solid var(--border-subtle);
  }

  .form-badge {
    background: var(--bg-surface-hover);
    color: var(--text-muted);
    border: 1px solid var(--border-subtle);
  }
  .form-badge.tree {
    background: var(--bg-surface-hover);
    color: var(--accent-success);
    border: 1px solid var(--border-subtle);
  }

  .runtime-badge {
    background: var(--bg-surface-hover);
    color: var(--accent-success);
    border: 1px solid var(--border-subtle);
  }

  .content-badge {
    background: var(--bg-surface-hover);
    color: var(--text-muted);
    border: 1px solid var(--border-subtle);
  }
  .content-badge.content-m {
    color: var(--accent-primary);
  }
  .content-badge.content-src {
    color: var(--accent-warning);
  }
  .content-badge.content-oct {
    color: var(--accent-danger);
  }

  .package-desc {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin: 0;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .package-links-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 2px;
  }

  .package-link-pill {
    font-size: 0.7rem;
    color: var(--accent-primary);
    background: var(--bg-surface-hover);
    padding: 2px 6px;
    border-radius: 4px;
    text-decoration: none;
    border: 1px solid var(--border-subtle);
    transition: all 0.15s ease;
  }
  .package-link-pill:hover {
    background: var(--accent-primary);
    color: var(--accent-primary-text);
    text-decoration: none;
  }

  .deps-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    font-size: 0.7rem;
  }
  .deps-label {
    color: var(--text-dim);
  }
  .dep-pill {
    background: var(--bg-canvas);
    color: var(--text-muted);
    padding: 1px 5px;
    border-radius: 3px;
    font-family: monospace;
    border: 1px solid var(--border-subtle);
  }

  .version-select-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.75rem;
    margin-top: auto;
    padding-top: 6px;
    border-top: 1px dashed var(--border-subtle);
  }

  .select-label {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--text-muted);
  }

  .version-select {
    padding: 2px 6px;
    font-size: 0.75rem;
    border-radius: 4px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-surface);
    color: var(--text-main);
  }

  .size-info {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    color: var(--text-dim);
    font-size: 0.7rem;
  }
  .extra-size {
    color: var(--accent-warning);
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
    background: var(--accent-primary);
    color: var(--accent-primary-text);
  }
  .btn-install:hover {
    background: var(--accent-primary-hover);
  }

  .btn-plan {
    background: var(--bg-surface-hover);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
  }
  .btn-plan:hover {
    background: var(--border-subtle);
  }

  .btn-installed {
    background: var(--bg-surface-hover);
    color: var(--accent-success);
    border: 1px solid var(--accent-success);
    cursor: default;
  }

  .btn-incompatible {
    background: var(--bg-canvas);
    color: var(--text-dim);
    border: 1px solid var(--border-subtle);
    cursor: not-allowed;
  }

  .btn-installing {
    background: var(--bg-surface-hover);
    color: var(--accent-primary);
    border: 1px solid var(--accent-primary);
    cursor: wait;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .btn-spinner {
    width: 10px;
    height: 10px;
    border: 2px solid var(--border-subtle);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  /* Plan submodal */
  .plan-submodal {
    position: absolute;
    inset: 0;
    background: var(--bg-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
  }

  .plan-card {
    background: var(--bg-surface);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    width: 420px;
    max-width: 90%;
    padding: 20px;
    box-shadow: var(--shadow-3);
  }

  .plan-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 10px;
    margin-bottom: 14px;
  }
  .plan-header h3 {
    margin: 0;
    font-size: 0.95rem;
    color: var(--text-main);
  }
  .btn-close-sm {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    font-size: 1rem;
    transition: color 0.15s ease;
  }
  .btn-close-sm:hover {
    color: var(--text-main);
  }

  .plan-metric {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 0.85rem;
  }
  .metric-label {
    color: var(--text-muted);
  }
  .metric-value {
    font-weight: 600;
    color: var(--text-main);
  }

  .plan-note {
    font-size: 0.75rem;
    color: var(--text-muted);
    line-height: 1.4;
    background: var(--bg-canvas);
    border: 1px solid var(--border-subtle);
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
    border: 1px solid var(--border-subtle);
    background: var(--bg-surface);
    color: var(--text-main);
    cursor: pointer;
    font-size: 0.8rem;
    transition: background 0.15s ease;
  }
  .btn-cancel:hover {
    background: var(--bg-surface-hover);
  }
  .btn-confirm-install {
    padding: 6px 14px;
    border-radius: 6px;
    background: var(--accent-primary);
    color: var(--accent-primary-text);
    border: none;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 500;
    transition: background 0.15s ease;
  }
  .btn-confirm-install:hover {
    background: var(--accent-primary-hover);
  }

  /* Dual-action download and compile buttons */
  .btn-download {
    background: var(--bg-surface-hover);
    color: var(--accent-primary);
    border: 1px solid var(--accent-primary);
  }
  .btn-download:hover {
    background: var(--border-subtle);
  }

  .btn-downloaded {
    background: var(--bg-canvas);
    color: var(--accent-success);
    border: 1px solid var(--accent-success);
    cursor: default;
  }

  .btn-compile {
    background: var(--accent-warning);
    color: var(--text-main);
    border: 1px solid transparent;
  }
  .btn-compile:hover {
    filter: brightness(1.08);
  }

  .downloaded-badge {
    background: var(--bg-surface-hover);
    color: var(--accent-success);
    border: 1px solid var(--border-subtle);
  }

  .active-badge {
    background: var(--bg-surface-hover);
    color: var(--accent-success);
    border: 1px solid var(--accent-success);
    font-weight: 600;
  }

  .arch-badge {
    background: var(--bg-canvas);
    color: var(--text-dim);
    border: 1px dashed var(--border-subtle);
  }

  /* Download progress bar & wave */
  .download-progress-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-width: 120px;
  }

  .progress-bar-track {
    flex: 1;
    height: 8px;
    background: var(--bg-canvas);
    border-radius: 4px;
    overflow: hidden;
    position: relative;
    border: 1px solid var(--border-subtle);
  }

  .progress-bar-fill {
    height: 100%;
    background: var(--accent-primary);
    transition: width 0.2s ease;
  }

  .progress-bar-wave {
    height: 100%;
    width: 40%;
    background: linear-gradient(90deg, transparent, var(--accent-primary), transparent);
    animation: waveShimmer 1.5s infinite ease-in-out;
  }

  .progress-label {
    font-size: 0.7rem;
    font-family: monospace;
    color: var(--text-muted);
  }

  @keyframes waveShimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(250%); }
  }

  /* File breakdown & quota */
  .breakdown-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 8px 0 12px;
  }

  .breakdown-item {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    color: var(--text-muted);
    background: var(--bg-canvas);
    padding: 5px 8px;
    border-radius: 4px;
    border: 1px solid var(--border-subtle);
  }

  .breakdown-name {
    font-family: monospace;
  }

  .breakdown-size {
    font-weight: 500;
    color: var(--text-main);
  }

  .quota-metric {
    margin-top: 6px;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .error-banner.in-card {
    margin: 10px 0;
    border-radius: 4px;
    border: 1px solid var(--accent-danger);
  }

  /* Diagnostics Drawer */
  .diagnostics-drawer {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 50vh;
    background: var(--bg-surface);
    border-top: 2px solid var(--accent-primary);
    display: flex;
    flex-direction: column;
    z-index: 20;
    box-shadow: var(--shadow-3);
  }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .drawer-title-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .drawer-title-group h4 {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-main);
  }

  .compile-badge {
    font-size: 0.7rem;
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 600;
  }

  .compile-badge.success {
    background: var(--bg-surface-hover);
    color: var(--accent-success);
    border: 1px solid var(--accent-success);
  }

  .compile-badge.failed {
    background: var(--bg-surface-hover);
    color: var(--accent-danger);
    border: 1px solid var(--accent-danger);
  }

  .compile-badge.running {
    background: var(--bg-surface-hover);
    color: var(--accent-primary);
    border: 1px solid var(--accent-primary);
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .relink-banner {
    background: var(--bg-canvas);
    color: var(--text-muted);
    font-size: 0.72rem;
    padding: 6px 16px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .diagnostics-console {
    flex: 1;
    min-height: 120px;
    max-height: 220px;
    overflow-y: auto;
    background: var(--bg-canvas);
    color: var(--text-main);
    font-family: monospace;
    font-size: 0.75rem;
    padding: 10px 16px;
    line-height: 1.4;
    border-bottom: 1px solid var(--border-subtle);
  }

  .console-empty {
    color: var(--text-dim);
    font-style: italic;
  }

  .console-line {
    white-space: pre-wrap;
    word-break: break-all;
  }

  .drawer-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 8px 16px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
