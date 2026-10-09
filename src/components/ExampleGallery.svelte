<!-- src/components/ExampleGallery.svelte -->
<script lang="ts">
  import { ExampleRegistry } from '../modules/experiment/ExampleRegistry';
  import { ExperimentStore } from '../modules/experiment/ExperimentStore';
  import type { RecipeCategory, RecipeId, ExperimentRecipe } from '../modules/experiment/types';
  import {
    supervisor,
    projectWorkspace,
    t,
    pluginRegistry,
    pretextPlugin,
    searchPlugin,
  } from '../modules/appContext';
  import {
    escapeHtml,
    type PretextLayoutPlugin,
    type GallerySearchPlugin,
    type SearchHit,
  } from '../modules/plugins';

  let { isOpen, onClose } = $props<{
    isOpen: boolean;
    onClose: () => void;
  }>();

  let activeCategory = $state<'all' | RecipeCategory>('all');
  let launchingId = $state<RecipeId | null>(null);
  let searchQuery = $state<string>('');
  let debouncedQuery = $state<string>('');
  let activeIndex = $state<number>(0);
  let copiedId = $state<string | null>(null);
  let containerWidth = $state<number>(960);
  let searchInput = $state<HTMLInputElement | null>(null);
  let galleryBody = $state<HTMLElement | null>(null);
  let registryVersion = $state<number>(0);

  const recipes = ExampleRegistry.getAll();

  // 严格响应插件注册表生命周期与启闭开关（插件可热插拔、热启闭）
  $effect(() => {
    const unsubscribe = pluginRegistry.subscribe(() => {
      registryVersion += 1;
    });
    return () => unsubscribe();
  });

  const activeSearchPlugin = $derived.by(() => {
    void registryVersion;
    return pluginRegistry.get<GallerySearchPlugin>('gallery-search') ?? searchPlugin;
  });

  const activePretextPlugin = $derived.by(() => {
    void registryVersion;
    return pluginRegistry.get<PretextLayoutPlugin>('gallery-pretext') ?? pretextPlugin;
  });

  // 100ms 防抖更新搜索关键词（与 S26-1 搜索平滑度一致）
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const q = searchQuery;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debouncedQuery = q;
      activeIndex = 0;
    }, 100);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  });

  // 分类与全文检索双重过滤（通过已注册搜索插件能力执行）
  const categoryFiltered = $derived(
    activeCategory === 'all'
      ? recipes
      : recipes.filter((r) => r.category === activeCategory)
  );

  const searchHits = $derived(
    activeSearchPlugin.searchRecipes(categoryFiltered, debouncedQuery, (key) => t(key))
  );

  // 扁平化列表用于键盘箭头导航与回车启动
  const flatHits = $derived(searchHits.map((h) => h.recipe));

  // Pretext 纯算术瀑布流分列（卡片大小不一、零 forced reflow）
  const columnCount = $derived(
    activePretextPlugin.computeColumnCount(containerWidth, 300, 460)
  );

  const masonryColumns = $derived.by(() => {
    const hits = searchHits;
    const colW = Math.max(260, Math.floor((containerWidth - (columnCount - 1) * 16) / columnCount));
    const itemsWithMetrics = hits.map((hit) => {
      const metrics = activePretextPlugin.predictCardHeight(
        {
          title: t(hit.recipe.titleKey),
          desc: t(hit.recipe.descKey),
          code: hit.recipe.code,
          tags: hit.recipe.tags,
        },
        colW
      );
      return {
        item: { hit, metrics },
        height: metrics.totalHeight,
      };
    });

    return activePretextPlugin.distributeCards(itemsWithMetrics, columnCount);
  });

  async function handleLaunch(recipe: ExperimentRecipe) {
    launchingId = recipe.id;
    try {
      await ExperimentStore.launch(recipe.id, supervisor, projectWorkspace);
      onClose();
    } catch (err) {
      console.error('Failed to launch recipe:', err);
    } finally {
      launchingId = null;
    }
  }

  async function handleCopyCode(code: string, id: string) {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(code.trim());
      } else {
        // 降级兼容：无 clipboard API 环境
        const textArea = document.createElement('textarea');
        textArea.value = code.trim();
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      copiedId = id;
      setTimeout(() => {
        if (copiedId === id) copiedId = null;
      }, 1800);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  }

  function getHighlightedLine(highlightedCode: string, lineIndex: number, fallback: string): string {
    if (!highlightedCode) return escapeHtml(fallback);
    const lines = highlightedCode.split('\n');
    return lines[lineIndex] ?? escapeHtml(fallback);
  }

  // 尺寸监听器：防回流抖动
  $effect(() => {
    if (!isOpen || !galleryBody) return;
    const updateWidth = () => {
      if (galleryBody) {
        const w = galleryBody.clientWidth;
        if (Math.abs(w - containerWidth) >= 4) {
          containerWidth = w;
        }
      }
    };
    updateWidth();

    const ro = new ResizeObserver(() => updateWidth());
    ro.observe(galleryBody);
    return () => ro.disconnect();
  });

  // 打开模态窗时自动聚焦搜索框
  $effect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (searchInput) searchInput.focus();
      }, 80);
    }
  });

  // 借鉴 S26-1 site-search.js: 键盘上下键切换时自动将激活卡片滚入可视区
  $effect(() => {
    if (isOpen && activeIndex >= 0 && galleryBody) {
      const selectedEl = galleryBody.querySelector('.recipe-card.selected') as HTMLElement | null;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) return;

    if ((e.key === '/' && document.activeElement !== searchInput) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
      e.preventDefault();
      searchInput?.focus();
      return;
    }

    if (e.key === 'Escape') {
      if (searchQuery) {
        e.preventDefault();
        searchQuery = '';
      } else {
        onClose();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flatHits.length > 0) {
        activeIndex = (activeIndex + 1) % flatHits.length;
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flatHits.length > 0) {
        activeIndex = (activeIndex - 1 + flatHits.length) % flatHits.length;
      }
      return;
    }

    if (e.key === 'Enter') {
      if (flatHits.length > 0 && activeIndex >= 0 && activeIndex < flatHits.length) {
        // 如果焦点在输入框或未选择特定按钮，回车启动当前选中的卡片
        e.preventDefault();
        handleLaunch(flatHits[activeIndex]);
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div class="gallery-overlay" onclick={onClose} role="dialog" aria-modal="true">
    <div class="gallery-modal" onclick={(e) => e.stopPropagation()}>
      <!-- 头部：标题与关闭按钮 -->
      <div class="gallery-header">
        <div class="header-titles">
          <div class="header-badge-row">
            <h2 class="title">{t('examples.drawer_title')}</h2>
            <span class="plugin-badge" title="Powered by Pretext & S26-1 Search Engine">
              Pretext & Search Plugin
            </span>
          </div>
          <p class="subtitle">{t('examples.drawer_subtitle')}</p>
        </div>
        <button class="btn-close" onclick={onClose} aria-label="Close">✕</button>
      </div>

      <!-- 搜索工具条：优雅集成搜索输入、快捷键提示与计数 -->
      <div class="search-toolbar">
        <div class="search-input-wrapper">
          <svg class="search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="M12.5 12.5L17 17" stroke-linecap="round" />
          </svg>
          <input
            bind:this={searchInput}
            type="text"
            class="search-input"
            placeholder={t('examples.search_placeholder')}
            bind:value={searchQuery}
          />
          {#if searchQuery}
            <button class="btn-clear-search" onclick={() => (searchQuery = '')} aria-label="Clear query">
              ✕
            </button>
          {/if}
          <div class="search-hint-kbd">
            <kbd>/</kbd>
          </div>
        </div>

        <div class="search-stat">
          <span class="count-badge">
            {searchHits.length} {searchHits.length === 1 ? 'recipe' : 'recipes'}
          </span>
        </div>
      </div>

      <!-- 分类标签过滤器 -->
      <div class="category-tabs">
        <button
          class="tab-btn"
          class:active={activeCategory === 'all'}
          onclick={() => (activeCategory = 'all')}
        >
          All
        </button>
        <button
          class="tab-btn"
          class:active={activeCategory === 'signal'}
          onclick={() => (activeCategory = 'signal')}
        >
          Signal & DSP
        </button>
        <button
          class="tab-btn"
          class:active={activeCategory === 'algebra'}
          onclick={() => (activeCategory = 'algebra')}
        >
          Linear Algebra
        </button>
        <button
          class="tab-btn"
          class:active={activeCategory === 'simulation'}
          onclick={() => (activeCategory = 'simulation')}
        >
          Simulation
        </button>
        <button
          class="tab-btn"
          class:active={activeCategory === 'statistics'}
          onclick={() => (activeCategory = 'statistics')}
        >
          Statistics
        </button>
      </div>

      <!-- 画廊主体：Pretext 算术瀑布流布局容器 -->
      <div class="gallery-body" bind:this={galleryBody}>
        {#if searchHits.length === 0}
          <div class="empty-search-state">
            <div class="empty-icon">🔍</div>
            <h3 class="empty-title">{t('examples.no_results')}</h3>
            <p class="empty-desc">
              没有找到与 "<strong>{searchQuery}</strong>" 相关的配方。尝试搜索其他关键词如 <em>fft</em>、<em>eig</em>、<em>sin</em> 或 <em>pi</em>。
            </p>
            <button class="btn-reset-search" onclick={() => { searchQuery = ''; activeCategory = 'all'; }}>
              {t('examples.clear_search')}
            </button>
          </div>
        {:else}
          <div class="masonry-grid" style="--col-count: {columnCount};">
            {#each masonryColumns as column, colIdx}
              <div class="masonry-column" data-col={colIdx}>
                {#each column as item (item.hit.recipe.id)}
                  {@const recipe = item.hit.recipe}
                  {@const hit = item.hit}
                  {@const isSelected = flatHits[activeIndex]?.id === recipe.id}
                  {@const typesetLines = pretextPlugin.formatCodeLines(recipe.code)}

                  <div
                    class="recipe-card"
                    class:selected={isSelected}
                    onclick={() => {
                      const idx = flatHits.findIndex((h) => h.id === recipe.id);
                      if (idx >= 0) activeIndex = idx;
                    }}
                  >
                    <!-- 卡片顶部：图标与标题/标签 -->
                    <div class="card-top">
                      <div class="recipe-icon">
                        {@html recipe.svgIcon}
                      </div>
                      <div class="recipe-meta">
                        <h3 class="recipe-title">
                          {@html hit.highlightedTitle}
                        </h3>
                        <div class="tags-row">
                          {#each recipe.tags as tag}
                            {@const isTagMatched = hit.tagMatches.includes(tag)}
                            <span class="recipe-tag" class:tag-hit={isTagMatched}>
                              {tag}
                            </span>
                          {/each}
                        </div>
                      </div>
                    </div>

                    <!-- 描述区：自动排版 -->
                    <div class="recipe-desc">
                      {@html hit.highlightedDesc}
                    </div>

                    <!-- 代码预览文本框：自动排版、无截断、高亮注释与行号 -->
                    <div class="code-preview-box">
                      <div class="code-box-header">
                        <span class="code-lang-label">Octave / MATLAB</span>
                        <button
                          class="btn-copy-code"
                          onclick={(e) => {
                            e.stopPropagation();
                            handleCopyCode(recipe.code, recipe.id);
                          }}
                          title={t('examples.copy_code')}
                        >
                          {#if copiedId === recipe.id}
                            <span class="copied-indicator">✓ {t('examples.copied')}</span>
                          {:else}
                            <svg class="copy-icon" viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                              <path d="M4 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H4zm0 1h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>
                              <path d="M2 5a1 1 0 0 1 1-1h1V3H3a2 2 0 0 0-2 2v7h1V5z"/>
                            </svg>
                            <span>{t('examples.copy_code')}</span>
                          {/if}
                        </button>
                      </div>

                      <div class="code-lines-container">
                        {#each typesetLines as line}
                          <div class="code-line" class:comment-line={line.isComment}>
                            <span class="line-number">{line.lineNumber}</span>
                            <span class="line-content">
                              {#if debouncedQuery}
                                {@html getHighlightedLine(hit.highlightedCode, line.lineNumber - 1, line.content)}
                              {:else}
                                {line.content}
                              {/if}
                            </span>
                          </div>
                        {/each}
                      </div>
                    </div>

                    <!-- 卡片底部操作按钮 -->
                    <div class="card-footer">
                      <button
                        class="btn-try"
                        disabled={launchingId === recipe.id}
                        onclick={(e) => {
                          e.stopPropagation();
                          handleLaunch(recipe);
                        }}
                      >
                        {#if launchingId === recipe.id}
                          Launching...
                        {:else}
                          {t('examples.try_button')} →
                        {/if}
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .gallery-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .gallery-modal {
    width: 92vw;
    max-width: 1140px;
    height: 88vh;
    max-height: 860px;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
  }

  .gallery-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 18px 24px 14px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .header-titles .title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-main);
  }

  .header-badge-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .plugin-badge {
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    padding: 2px 8px;
    border-radius: 9999px;
    background: rgba(99, 102, 241, 0.15);
    color: #818cf8;
    border: 1px solid rgba(99, 102, 241, 0.3);
  }

  .header-titles .subtitle {
    margin: 4px 0 0;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .btn-close {
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 1.25rem;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
    transition: all 0.15s;
  }

  .btn-close:hover {
    color: var(--text-main);
    background: var(--bg-surface-hover);
  }

  /* 搜索工具栏 */
  .search-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 24px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-subtle);
  }

  .search-input-wrapper {
    position: relative;
    flex: 1;
    max-width: 600px;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 12px;
    width: 16px;
    height: 16px;
    color: var(--text-muted);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    height: 38px;
    padding: 0 68px 0 38px;
    background: var(--bg-terminal);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    color: var(--text-main);
    font-size: 0.875rem;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .search-input:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
  }

  .btn-clear-search {
    position: absolute;
    right: 38px;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 2px 6px;
    font-size: 0.85rem;
    border-radius: 4px;
  }

  .btn-clear-search:hover {
    color: var(--text-main);
  }

  .search-hint-kbd {
    position: absolute;
    right: 12px;
    pointer-events: none;
  }

  .search-hint-kbd kbd {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    color: var(--text-muted);
    font-size: 0.7rem;
    padding: 2px 5px;
    border-radius: 4px;
    font-family: inherit;
  }

  .search-stat .count-badge {
    font-size: 0.75rem;
    color: var(--text-muted);
    background: var(--bg-surface-hover);
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid var(--border-subtle);
  }

  /* 分类标签栏 */
  .category-tabs {
    display: flex;
    gap: 8px;
    padding: 10px 24px;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--bg-surface-hover);
    overflow-x: auto;
  }

  .tab-btn {
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-muted);
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 0.825rem;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .tab-btn:hover {
    background: var(--bg-surface);
    color: var(--text-main);
  }

  .tab-btn.active {
    background: var(--accent-primary);
    color: #ffffff;
    font-weight: 600;
  }

  /* 画廊主体与瀑布流 */
  .gallery-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
  }

  .masonry-grid {
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }

  .masonry-column {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* 配方卡片（大小不一、自然撑开、平滑过渡） */
  .recipe-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
    cursor: pointer;
  }

  .recipe-card:hover {
    border-color: var(--accent-primary);
    transform: translateY(-2px);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
  }

  .recipe-card.selected {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px var(--accent-primary), 0 8px 24px rgba(99, 102, 241, 0.2);
  }

  .card-top {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .recipe-icon {
    width: 42px;
    height: 42px;
    flex-shrink: 0;
    border-radius: 8px;
    background: var(--bg-surface-hover);
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border-subtle);
  }

  .recipe-meta {
    flex: 1;
    min-width: 0;
  }

  .recipe-title {
    margin: 0;
    font-size: 0.975rem;
    font-weight: 600;
    color: var(--text-main);
    line-height: 1.35;
  }

  .tags-row {
    display: flex;
    gap: 6px;
    margin-top: 5px;
    flex-wrap: wrap;
  }

  .recipe-tag {
    font-size: 0.7rem;
    padding: 2px 7px;
    border-radius: 4px;
    background: var(--bg-surface-hover);
    color: var(--text-muted);
    border: 1px solid var(--border-subtle);
    transition: all 0.15s;
  }

  .recipe-tag.tag-hit {
    background: rgba(99, 102, 241, 0.15);
    color: #a5b4fc;
    border-color: rgba(99, 102, 241, 0.4);
    font-weight: 600;
  }

  .recipe-desc {
    margin: 0;
    font-size: 0.825rem;
    color: var(--text-muted);
    line-height: 1.45;
  }

  /* 代码框自动排版与语法呈现 */
  .code-preview-box {
    background: var(--bg-terminal);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .code-box-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 10px;
    background: rgba(0, 0, 0, 0.2);
    border-bottom: 1px solid var(--border-subtle);
  }

  .code-lang-label {
    font-size: 0.675rem;
    font-family: var(--font-mono, monospace);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .btn-copy-code {
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 0.7rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;
  }

  .btn-copy-code:hover {
    color: var(--text-main);
    background: var(--bg-surface-hover);
  }

  .copied-indicator {
    color: #4ade80;
    font-weight: 600;
  }

  .code-lines-container {
    padding: 8px 0;
    overflow-x: auto;
    font-family: var(--font-mono, monospace);
    font-size: 0.75rem;
    line-height: 1.4;
  }

  .code-line {
    display: flex;
    padding: 0 10px;
  }

  .line-number {
    width: 24px;
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.25);
    user-select: none;
    text-align: right;
    margin-right: 12px;
    font-size: 0.7rem;
  }

  .line-content {
    flex: 1;
    color: var(--text-main);
    white-space: pre;
    min-height: 1.35em;
  }

  .comment-line .line-content {
    color: #94a3b8;
    font-style: italic;
  }

  /* 搜索高亮标记 */
  :global(.search-highlight) {
    background-color: rgba(250, 204, 21, 0.35);
    color: inherit;
    padding: 0 2px;
    border-radius: 2px;
  }

  .card-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 4px;
  }

  .btn-try {
    background: var(--accent-primary);
    color: #ffffff;
    border: none;
    padding: 7px 16px;
    border-radius: 6px;
    font-size: 0.825rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.1s;
  }

  .btn-try:hover:not(:disabled) {
    opacity: 0.92;
    transform: translateY(-1px);
  }

  .btn-try:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* 空搜索状态 */
  .empty-search-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    text-align: center;
  }

  .empty-icon {
    font-size: 2.5rem;
    margin-bottom: 12px;
  }

  .empty-title {
    margin: 0 0 8px;
    font-size: 1.15rem;
    color: var(--text-main);
  }

  .empty-desc {
    margin: 0 0 20px;
    font-size: 0.875rem;
    color: var(--text-muted);
    max-width: 480px;
    line-height: 1.5;
  }

  .btn-reset-search {
    background: var(--bg-surface-hover);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
    padding: 7px 18px;
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-reset-search:hover {
    background: var(--accent-primary);
    color: #ffffff;
  }
</style>
