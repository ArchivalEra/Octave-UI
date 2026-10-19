import { describe, it, expect, beforeEach } from 'vitest';
import { mount, unmount } from 'svelte';
import SidebarIsland from '../../src/components/SidebarIsland.svelte';

describe('SidebarIsland Component', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('mounts cleanly without throwing runtime reference errors', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    let component: any;
    const cleanup = $effect.root(() => {
      component = mount(SidebarIsland, { target });
    });

    expect(target.querySelector('.sidebar')).not.toBeNull();
    expect(target.querySelectorAll('.tab-btn').length).toBe(4);

    if (component) {
      unmount(component);
    }
    cleanup();
  });
});
