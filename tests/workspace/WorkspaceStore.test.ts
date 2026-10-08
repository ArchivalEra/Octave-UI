// tests/workspace/WorkspaceStore.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceStore } from '../../src/modules/workspace/WorkspaceStore';
import { EngineSupervisor } from '../../src/modules/engine/EngineSupervisor';
import { MockEmbedAdapter } from '../../src/modules/engine/MockEmbedAdapter';

describe('WorkspaceStore Deep Module', () => {
  let supervisor: EngineSupervisor;
  let store: WorkspaceStore;

  beforeEach(async () => {
    const adapter = new MockEmbedAdapter();
    supervisor = new EngineSupervisor({ adapter, skipPreflight: true });
    await supervisor.boot();
    store = new WorkspaceStore(supervisor);
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

  it('saves, loads, and manages workspace snapshots', () => {
    store.setVariables([
      { name: 'X', class: 'double', size: '2x2', bytes: 32 },
    ]);

    const snapshot = store.saveSnapshot('My Workspace 1', 'Testing snapshots');
    expect(snapshot.name).toBe('My Workspace 1');
    expect(store.snapshots.length).toBe(1);
    expect(store.activeWorkspaceId).toBe(snapshot.id);

    // 清空变量后加载快照
    store.clearVariables();
    expect(store.variables.length).toBe(0);

    const loaded = store.loadSnapshot(snapshot.id);
    expect(loaded?.length).toBe(1);
    expect(loaded?.[0].name).toBe('X');
    expect(store.variables[0].name).toBe('X');

    // 导出与导入
    const jsonStr = store.exportSnapshotJson(snapshot.id);
    expect(jsonStr).toContain('My Workspace 1');

    const imported = store.importSnapshotJson(jsonStr!);
    expect(imported).not.toBeNull();
    expect(imported?.name).toBe('My Workspace 1');

    // 删除快照
    const deleted = store.deleteSnapshot(snapshot.id);
    expect(deleted).toBe(true);
  });
});

