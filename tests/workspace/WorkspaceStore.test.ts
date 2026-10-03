// tests/workspace/WorkspaceStore.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceStore } from '../../src/modules/workspace/WorkspaceStore';
import { EngineSession } from '../../src/modules/engine/EngineSession';
import { MockEmbedAdapter } from '../../src/modules/engine/MockEmbedAdapter';

describe('WorkspaceStore Deep Module', () => {
  let session: EngineSession;
  let store: WorkspaceStore;

  beforeEach(() => {
    const adapter = new MockEmbedAdapter();
    session = new EngineSession(adapter);
    store = new WorkspaceStore(session);
  });

  it('formats variable sizes cleanly', () => {
    expect(WorkspaceStore.formatSize([4, 4])).toBe('4x4');
    expect(WorkspaceStore.formatSize([1, 100, 2])).toBe('1x100x2');
    expect(WorkspaceStore.formatSize('1x1')).toBe('1x1');
    expect(WorkspaceStore.formatSize(null)).toBe('-');
    expect(WorkspaceStore.formatSize(undefined)).toBe('-');
  });

  it('formats bytes into human readable formats', () => {
    expect(WorkspaceStore.formatBytes(512)).toBe('512 B');
    expect(WorkspaceStore.formatBytes(2048)).toBe('2.0 KB');
    expect(WorkspaceStore.formatBytes(1048576 * 3)).toBe('3.0 MB');
    expect(WorkspaceStore.formatBytes(null)).toBe('0 B');
    expect(WorkspaceStore.formatBytes(undefined)).toBe('0 B');
  });

  it('notifies listeners when variables change', () => {
    const listener = vi.fn();
    store.subscribe(listener);

    store.setVariables([
      { name: 'A', class: 'double', size: '4x4', bytes: 128 },
    ]);

    expect(listener).toHaveBeenCalled();
    expect(store.variables.length).toBe(1);
    expect(store.variables[0].name).toBe('A');
  });

  it('refreshes variables from session', async () => {
    const vars = await store.refresh();
    expect(vars.length).toBeGreaterThan(0);
    expect(vars.some(v => v.name === 'ans')).toBe(true);
  });
});
