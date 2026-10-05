// tests/i18n/reactivityHelper.svelte.ts
import { tick } from 'svelte';
import type { I18nManager } from '../../src/modules/i18n/I18nManager.svelte';

export function observeI18nReactivity(manager: I18nManager) {
  let observedText = '';
  const cleanup = $effect.root(() => {
    $effect.pre(() => {
      observedText = manager.t('action.boot');
    });
  });

  return {
    get text() {
      return observedText;
    },
    tick: async () => {
      await tick();
    },
    cleanup,
  };
}
