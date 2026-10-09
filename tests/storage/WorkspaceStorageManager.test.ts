// tests/storage/WorkspaceStorageManager.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { WorkspaceStorageManager } from '../../src/modules/storage/WorkspaceStorageManager';
import { MemoryStore } from '../../src/modules/storage/MemoryStore';
import { EngineSupervisor } from '../../src/modules/engine/EngineSupervisor';
import { MockEmbedAdapter } from '../../src/modules/engine/MockEmbedAdapter';

describe('WorkspaceStorageManager Deep Module', () => {
  let manager: WorkspaceStorageManager;
  let supervisor: EngineSupervisor;
  let mockAdapter: MockEmbedAdapter;

  beforeEach(async () => {
    manager = new WorkspaceStorageManager(new MemoryStore());
    await manager.init();

    mockAdapter = new MockEmbedAdapter();
    supervisor = new EngineSupervisor({
      createAdapter: () => mockAdapter,
    });
    await supervisor.boot();
  });

  it('initializes with empty tree and memory storage type', async () => {
    expect(manager.storageType).toBe('memory');
    expect(manager.tree).toEqual([]);
    expect(manager.activeFile).toBeNull();
  });

  it('imports files, builds nested tree, and picks initial .m active file', async () => {
    const files = [
      { path: 'test_script.m', data: new TextEncoder().encode('x = 42;') },
      { path: 'data/input.dat', data: new Uint8Array([1, 2, 3]) },
      { path: 'data/sub/config.json', data: new TextEncoder().encode('{}') },
      { path: 'utils/helper.m', data: new TextEncoder().encode('y = 1;') },
    ];

    const count = await manager.importFiles(files);
    expect(count).toBe(4);
    expect(manager.entries.length).toBeGreaterThanOrEqual(4);

    // 默认激活第一个 .m 脚本
    expect(manager.activeFile).toBe('test_script.m');

    // 检验树层级：根节点应包含 data、utils 目录及 test_script.m 文件
    const rootTree = manager.tree;
    const dirNames = rootTree.filter((n) => n.kind === 'dir').map((n) => n.name);
    const fileNames = rootTree.filter((n) => n.kind === 'file').map((n) => n.name);

    expect(dirNames).toContain('data');
    expect(dirNames).toContain('utils');
    expect(fileNames).toContain('test_script.m');

    // 目录优先排序：dir 节点应排在 file 节点之前
    const firstDirIdx = rootTree.findIndex((n) => n.kind === 'dir');
    const firstFileIdx = rootTree.findIndex((n) => n.kind === 'file');
    expect(firstDirIdx).toBeLessThan(firstFileIdx);

    // 检查子目录嵌套结构
    const dataNode = rootTree.find((n) => n.name === 'data');
    expect(dataNode?.children).toBeDefined();
    expect(dataNode?.children?.some((c) => c.name === 'input.dat')).toBe(true);
    expect(dataNode?.children?.some((c) => c.name === 'sub')).toBe(true);
  });

  it('performs file CRUD and maintains reactivity', async () => {
    let notifyCount = 0;
    const unsub = manager.subscribe(() => {
      notifyCount++;
    });

    await manager.writeFile('app.m', 'disp("hello");');
    expect(notifyCount).toBeGreaterThan(0);

    const text = await manager.readText('app.m');
    expect(text).toBe('disp("hello");');

    await manager.deleteEntry('app.m');
    expect(manager.tree.some((n) => n.name === 'app.m')).toBe(false);

    unsub();
  });

  it('mirrors workspace files to Engine Wasm MEMFS (syncToEngine)', async () => {
    await manager.writeFile('script1.m', 'a = 1;');
    await manager.writeFile('data/input.bin', new Uint8Array([5, 6, 7]));

    const synced = await manager.syncToEngine(supervisor);
    expect(synced).toBe(2);

    // 检查 MEMFS 中是否已存在
    const readScript = supervisor.fsRead('/home/web_user/workspace/script1.m');
    expect(readScript).toBe('a = 1;');

    const readRootScript = supervisor.fsRead('/home/web_user/script1.m');
    expect(readRootScript).toBe('a = 1;');
  });

  it('captures new output files created by Octave (syncFromEngine)', async () => {
    // 模拟 Octave 执行中生成了一个输出文件
    supervisor.fsWrite('/home/web_user/workspace/output_result.txt', 'computed 123');

    const recovered = await manager.syncFromEngine(supervisor);
    expect(recovered).toBe(1);

    const text = await manager.readText('output_result.txt');
    expect(text).toBe('computed 123');
  });
});
