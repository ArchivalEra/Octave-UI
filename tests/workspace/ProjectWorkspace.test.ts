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
    adapter = new MockEmbedAdapter();
    // 合法注入：生产路径已禁 Mock 回退，测试替身必须经 factory 显式进入
    supervisor = new EngineSupervisor({ adapter, adapterFactory: () => adapter, skipPreflight: true });
    dirAdapter = new VirtualMemoryDirectoryAdapter('TestWorkspace');
    workspace = new ProjectWorkspace(supervisor, dirAdapter);
  });

  it('initializes with default welcome cells in notebook mode', () => {
    expect(workspace.mode).toBe('notebook');
    expect(workspace.activeLane).toBe('wasm32-final');
    expect(workspace.cells.length).toBeGreaterThan(0);
    expect(workspace.cells[0].code).toContain('x = A \\ b');
  });

  it('synchronizes default script locale when pristine, preserves custom code if modified', () => {
    // Pristine state syncs to German
    workspace.syncLocale('de');
    expect(workspace.cells[0].title).toBe('Willkommen bei Octave Web');

    // Pristine state syncs to English
    workspace.syncLocale('en');
    expect(workspace.cells[0].title).toBe('Welcome to Octave Web');

    // User modifies code
    workspace.updateCellCode(workspace.cells[0].id, 'disp("hello world");');
    // Once modified, syncLocale synchronizes title/desc to zh-Hans while preserving user code
    workspace.syncLocale('zh-Hans');
    expect(workspace.cells[0].code).toBe('disp("hello world");');
    expect(workspace.cells[0].title).toBe('欢迎使用 Octave Web');
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
    // 本用例验证选档/锁定语义：使用独立 supervisor，不预注入适配器（保持 unloaded）
    const bareSupervisor = new EngineSupervisor({ adapterFactory: () => new MockEmbedAdapter(), skipPreflight: true });
    const ws = new ProjectWorkspace(bareSupervisor, new VirtualMemoryDirectoryAdapter('TestWorkspace'));
    expect(ws.activeLane).toBe('wasm32-final');
    expect(bareSupervisor.state).toBe('unloaded');

    // 切换引擎仅为选档，不触发启动，状态保持 unloaded
    await ws.switchLane('master');
    expect(ws.activeLane).toBe('master');
    expect(bareSupervisor.state).toBe('unloaded');

    await ws.switchLane('IllegalPerformance');
    expect(ws.activeLane).toBe('IllegalPerformance');
    expect(bareSupervisor.state).toBe('unloaded');

    // 开始计算后，锁定引擎切换
    await bareSupervisor.boot();
    expect(bareSupervisor.state).toBe('idle');

    // 计算开始后再切换应被拦截拒绝
    await ws.switchLane('wasm32-final');
    expect(ws.activeLane).toBe('IllegalPerformance');
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

  it('correctly captures multi-line output and parses semantic matrix results', async () => {
    const cell = workspace.cells[0];
    workspace.updateCellCode(cell.id, 'inv_w = magic(4);');

    const res = await workspace.executeCell(cell.id);
    expect(res.ok).toBe(true);
    expect(cell.status).toBe('success');
    expect(cell.result).toBeDefined();
    expect(cell.result?.kind).toBe('matrix');
    if (cell.result?.kind === 'matrix') {
      expect(cell.result.rows).toBe(4);
      expect(cell.result.cols).toBe(4);
      expect(cell.result.values[0]).toEqual([16, 2, 3, 13]);
    }
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

  it('supports re-selecting directory and cleans activeFile on disconnect', async () => {
    await workspace.mountLocalDirectory();
    expect(workspace.isDirectoryMounted).toBe(true);

    // Call reselectDirectory
    const switched = await workspace.reselectDirectory();
    expect(switched).toBe(true);
    expect(workspace.isDirectoryMounted).toBe(true);

    // Disconnect cleans up activeFile and files list
    workspace.disconnectDirectory();
    expect(workspace.isDirectoryMounted).toBe(false);
    expect(workspace.activeFile).toBeNull();
    expect(workspace.files).toEqual([]);
  });

  it('smartly synchronizes welcome cell title and description across languages when user edited code', () => {
    // Modify code from A \ b to A / b
    const cell = workspace.cells[0];
    workspace.updateCellCode(cell.id, 'A = [1, 2; 3, 4];\nb = [5; 6];\nx = A / b');

    // Switch to English
    workspace.syncLocale('en');
    expect(workspace.cells[0].title).toBe('Welcome to Octave Web');
    expect(workspace.cells[0].description).toContain('Client-side');
    // User modified code is preserved!
    expect(workspace.cells[0].code).toContain('x = A / b');

    // Switch to German
    workspace.syncLocale('de');
    expect(workspace.cells[0].title).toBe('Willkommen bei Octave Web');
    expect(workspace.cells[0].description).toContain('Clientseitige');
    expect(workspace.cells[0].code).toContain('x = A / b');

    // Switch back to Chinese
    workspace.syncLocale('zh-Hans');
    expect(workspace.cells[0].title).toBe('欢迎使用 Octave Web');
    expect(workspace.cells[0].description).toContain('纯客户端');
    expect(workspace.cells[0].code).toContain('x = A / b');
  });

  it('manages OpenModelica companion engine state independently from Octave lanes', async () => {
    // 选档/勾选语义要求引擎保持 unloaded：用独立 supervisor（惰性 factory，boot 前不注入）
    const bareSupervisor = new EngineSupervisor({ adapterFactory: () => new MockEmbedAdapter(), skipPreflight: true });
    const ws = new ProjectWorkspace(bareSupervisor, new VirtualMemoryDirectoryAdapter('TestWorkspace'));
    expect(ws.isOmcEnabled).toBe(false);
    expect(ws.activeLane).toBe('wasm32-final');

    // 独立开启 OpenModelica 伴随引擎（两边不干涉，各可打勾）
    ws.toggleOmc();
    expect(ws.isOmcEnabled).toBe(true);
    expect(ws.activeLane).toBe('wasm32-final');

    // 切换 Octave 档位不影响 OMC 状态
    await ws.switchLane('master');
    expect(ws.activeLane).toBe('master');
    expect(ws.isOmcEnabled).toBe(true);

    // 再次切换 OMC
    ws.toggleOmc();
    expect(ws.isOmcEnabled).toBe(false);
    expect(ws.activeLane).toBe('master');
  });

  it('passes enableOmc and activeLane during execution boot', async () => {
    // 执行期自动启动语义要求引擎保持 unloaded：用独立 supervisor（惰性 factory）
    const bareSupervisor = new EngineSupervisor({ adapterFactory: () => new MockEmbedAdapter(), skipPreflight: true });
    const ws = new ProjectWorkspace(bareSupervisor, new VirtualMemoryDirectoryAdapter('TestWorkspace'));
    const bootSpy = vi.spyOn(bareSupervisor, 'boot');
    ws.setOmcEnabled(true);
    await ws.switchLane('IllegalPerformance');

    // 执行单元格自动按当前勾选的 Octave 档位与 OMC 状态启动
    await ws.executeCell(ws.cells[0].id);

    expect(bootSpy).toHaveBeenCalledWith({
      lane: 'IllegalPerformance',
      enableOmc: true,
    });
  });
});
