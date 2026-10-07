<!-- src/components/ExampleGallery.svelte -->
<script lang="ts">
  import { ExampleRegistry } from '../modules/experiment/ExampleRegistry';
  import { ExperimentStore } from '../modules/experiment/ExperimentStore';
  import type { RecipeCategory, RecipeId, ExperimentRecipe } from '../modules/experiment/types';
  import { supervisor, workbenchController, t } from '../modules/appContext';

  let { isOpen, onClose } = $props<{
    isOpen: boolean;
    onClose: () => void;
  }>();

  let activeCategory = $state<'all' | RecipeCategory>('all');
  let launchingId = $state<RecipeId | null>(null);

  const recipes = ExampleRegistry.getAll();

  const filteredRecipes = $derived(
    activeCategory === 'all'
      ? recipes
      : recipes.filter((r) => r.category === activeCategory)
  );

  async function handleLaunch(recipe: ExperimentRecipe) {
    launchingId = recipe.id;
    try {
      await ExperimentStore.launch(recipe.id, supervisor, workbenchController);
      onClose();
    } catch (err) {
      console.error('Failed to launch recipe:', err);
    } finally {
      launchingId = null;
    }
  }
</script>

{#if isOpen}
  <div class="gallery-overlay" onclick={onClose} role="dialog" aria-modal="true">
    <div class="gallery-modal" onclick={(e) => e.stopPropagation()}>
      <div class="gallery-header">
        <div class="header-titles">
          <h2 class="title">{t('examples.drawer_title')}</h2>
          <p class="subtitle">{t('examples.drawer_subtitle')}</p>
        </div>
        <button class="btn-close" onclick={onClose} aria-label="Close">✕</button>
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

      <!-- 卡片网格 -->
      <div class="recipes-grid">
        {#each filteredRecipes as recipe (recipe.id)}
          <div class="recipe-card">
            <div class="card-top">
              <div class="recipe-icon">
                {@html recipe.svgIcon}
              </div>
              <div class="recipe-meta">
                <h3 class="recipe-title">{t(recipe.titleKey)}</h3>
                <div class="tags-row">
                  {#each recipe.tags as tag}
                    <span class="recipe-tag">{tag}</span>
                  {/each}
                </div>
              </div>
            </div>

            <p class="recipe-desc">{t(recipe.descKey)}</p>

            <div class="code-preview">
              <pre><code>{recipe.code.trim()}</code></pre>
            </div>

            <div class="card-footer">
              <button
                class="btn-try"
                disabled={launchingId === recipe.id}
                onclick={() => handleLaunch(recipe)}
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
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .gallery-modal {
    width: 90vw;
    max-width: 1080px;
    max-height: 85vh;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
  }

  .gallery-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 20px 24px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .header-titles .title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-main);
  }

  .header-titles .subtitle {
    margin: 4px 0 0;
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .btn-close {
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 1.25rem;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .btn-close:hover {
    color: var(--text-main);
    background: var(--bg-surface-hover);
  }

  .category-tabs {
    display: flex;
    gap: 8px;
    padding: 12px 24px;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--bg-surface-hover);
  }

  .tab-btn {
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-muted);
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.15s ease;
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

  .recipes-grid {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 20px;
  }

  .recipe-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    transition: border-color 0.2s, transform 0.2s;
  }

  .recipe-card:hover {
    border-color: var(--accent-primary);
    transform: translateY(-2px);
  }

  .card-top {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .recipe-icon {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background: var(--bg-surface-hover);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .recipe-meta {
    flex: 1;
  }

  .recipe-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-main);
  }

  .tags-row {
    display: flex;
    gap: 6px;
    margin-top: 4px;
    flex-wrap: wrap;
  }

  .recipe-tag {
    font-size: 0.7rem;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--bg-surface-hover);
    color: var(--text-muted);
    border: 1px solid var(--border-subtle);
  }

  .recipe-desc {
    margin: 0;
    font-size: 0.825rem;
    color: var(--text-muted);
    line-height: 1.4;
    min-height: 36px;
  }

  .code-preview {
    background: var(--bg-terminal);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    padding: 10px;
    max-height: 120px;
    overflow-y: hidden;
    position: relative;
  }

  .code-preview pre {
    margin: 0;
    font-family: var(--font-mono, monospace);
    font-size: 0.75rem;
    color: var(--text-main);
    line-height: 1.35;
  }

  .card-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: auto;
  }

  .btn-try {
    background: var(--accent-primary);
    color: #ffffff;
    border: none;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 0.825rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .btn-try:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-try:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
