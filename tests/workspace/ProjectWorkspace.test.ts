import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectWorkspace } from '../../src/modules/workspace/ProjectWorkspace';
import { EngineSupervisor } from '../../src/modules/engine/EngineSupervisor';
import { MockEmbedAdapter } from '../../src/modules/engine/MockEmbedAdapter';
import { VirtualMemoryDirectoryAdapter } from '../../src/modules/workspace/DirectoryAdapter';

describe('ProjectWorkspace Deep Module', () => {
  let supervisor: EngineSupervisor;
  let adapter: MockEmbedAdapter;
  let dirAdapter: VirtualMemoryDirectoryAdapter;
  let workspace: ProjectWorkspace;

  beforeEach(() => {
    supervisor = new EngineSupervisor({ skipPreflight: true });
    dirAdapter = new VirtualMemoryDirectoryAdapter('TestWorkspace');
    workspace = new ProjectWorkspace(supervisor, dirAdapter);
  });

  it('initializes with default welcome cells in notebook mode', () => {
    expect(workspace.mode).toBe('notebook');
    expect(workspace.activeLane).toBe('wasm32-final');
    expect(workspace.cells.length).toBeGreaterThan(0);
    expect(workspace.cells[0].code).toContain('x = A \\ b');
  });

  it('switches mode cleanly', () => {
    const listener = vi.fn();
    workspace.subscribe(listener);

    workspace.setMode('terminal');
    expect(workspace.mode).toBe('terminal');
    expect(listener).toHaveBeenCalled();

    workspace.setMode('notebook');
    expect(workspace.mode).toBe('notebook');
  });

  it('switches engine lane before boot and forbids switching after computation starts', async () => {
    expect(workspace.activeLane).toBe('wasm32-final');
    expect(supervisor.state).toBe('unloaded');

    // 切换引擎仅为选档，不触发启动，状态保持 unloaded
    await workspace.switchLane('master');
    expect(workspace.activeLane).toBe('master');
    expect(supervisor.state).toBe('unloaded');

    await workspace.switchLane('IllegalPerformance');
    expect(workspace.activeLane).toBe('IllegalPerformance');
    expect(supervisor.state).toBe('unloaded');

    // 开始计算后，锁定引擎切换
    await supervisor.boot();
    expect(supervisor.state).toBe('idle');

    // 计算开始后再切换应被拦截拒绝
    await workspace.switchLane('wasm32-final');
    expect(workspace.activeLane).toBe('IllegalPerformance');
  });

  it('mounts directory and manages standard .m files', async () => {
    await dirAdapter.mount();
    await dirAdapter.writeText(
      'simulation.m',
      '%% Setup\nx = 1:5;\n\n%% Compute\ny = x .^ 2;\n'
    );

    const mounted = await workspace.mountLocalDirectory();
    expect(mounted).toBe(true);
    expect(workspace.isDirectoryMounted).toBe(true);
    expect(workspace.directoryName).toBe('TestWorkspace');
    expect(workspace.files.some((f) => f.name === 'simulation.m')).toBe(true);

    // Verify it automatically opened simulation.m and parsed %% cells
    expect(workspace.activeFile).toBe('simulation.m');
    expect(workspace.cells.length).toBe(2);
    expect(workspace.cells[0].title).toBe('Setup');
    expect(workspace.cells[0].code).toBe('x = 1:5;');
    expect(workspace.cells[1].title).toBe('Compute');
    expect(workspace.cells[1].code).toBe('y = x .^ 2;');
  });

  it('modifies cells and auto-saves to mounted directory', async () => {
    await dirAdapter.mount();
    await workspace.mountLocalDirectory();

    // Create a new file
    await workspace.createFile('my_script.m');
    expect(workspace.activeFile).toBe('my_script.m');

    // Add a cell and update code
    const cell2 = workspace.addCell('v = [10, 20, 30];', 'Vector Init');
    expect(workspace.cells.length).toBe(2);

    // Check disk content in adapter
    const savedContent = await dirAdapter.readText('my_script.m');
    expect(savedContent).toContain('Vector Init');
    expect(savedContent).toContain('v = [10, 20, 30];');
  });

  it('executes cell and synchronizes variables with engine', async () => {
    const cell = workspace.cells[0];
    workspace.updateCellCode(cell.id, 'alpha = 42;');

    const res = await workspace.executeCell(cell.id);
    expect(res.ok).toBe(true);
    expect(cell.status).toBe('success');
    expect(cell.executionCount).toBe(1);

    // Verify workspace variables were synchronized from engine
    expect(workspace.variables.some((v) => v.name === 'alpha')).toBe(true);
  });

  it('executes REPL command and synchronizes variables', async () => {
    const res = await workspace.executeCommand('beta = 100;');
    expect(res.ok).toBe(true);
    expect(workspace.variables.some((v) => v.name === 'beta')).toBe(true);
  });

  it('clears workspace atomically', async () => {
    await workspace.executeCommand('temp = 123;');
    expect(workspace.variables.some((v) => v.name === 'temp')).toBe(true);

    await workspace.clearWorkspace();
    expect(workspace.variables.some((v) => v.name === 'temp')).toBe(false);
  });

  it('manages workspace snapshots', () => {
    const snap = workspace.saveSnapshot('Check 1', 'Test note');
    expect(snap.name).toBe('Check 1');
    expect(workspace.snapshots.length).toBe(1);

    const loaded = workspace.loadSnapshot(snap.id);
    expect(loaded).not.toBeNull();

    const deleted = workspace.deleteSnapshot(snap.id);
    expect(deleted).toBe(true);
    expect(workspace.snapshots.length).toBe(0);
  });
});
