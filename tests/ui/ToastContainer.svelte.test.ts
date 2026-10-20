import { describe, it, expect, beforeEach } from 'vitest';
import { mount, unmount, tick } from 'svelte';
import ToastContainer from '../../src/components/ToastContainer.svelte';
import { toastService } from '../../src/modules/ui/ToastService.svelte';

describe('ToastContainer Component', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    toastService.clear();
  });

  it('renders nothing when there are no toasts', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    let component: any;
    const cleanup = $effect.root(() => {
      component = mount(ToastContainer, { target });
    });

    expect(target.querySelector('.toast-container')).toBeNull();

    if (component) unmount(component);
    cleanup();
  });

  it('renders error toast with structured error code badge and dismisses cleanly', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    let component: any;
    const cleanup = $effect.root(() => {
      component = mount(ToastContainer, { target });
    });

    toastService.error('Storage quota exceeded', 'STORAGE_QUOTA_EXHAUSTED', 'Disk Warning');
    await tick();

    expect(target.querySelector('.toast-container')).not.toBeNull();
    const card = target.querySelector('.toast-card.error');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain('Disk Warning');
    expect(card?.textContent).toContain('Storage quota exceeded');
    expect(card?.querySelector('.toast-code-badge')?.textContent).toBe('STORAGE_QUOTA_EXHAUSTED');

    const closeBtn = card?.querySelector('.toast-close-btn') as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();
    closeBtn.click();
    await tick();

    expect(target.querySelector('.toast-card')).toBeNull();

    if (component) unmount(component);
    cleanup();
  });
});
