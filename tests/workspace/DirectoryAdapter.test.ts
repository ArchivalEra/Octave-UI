import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualMemoryDirectoryAdapter } from '../../src/modules/workspace/DirectoryAdapter';

describe('VirtualMemoryDirectoryAdapter', () => {
  let adapter: VirtualMemoryDirectoryAdapter;

  beforeEach(() => {
    adapter = new VirtualMemoryDirectoryAdapter('TestWorkspace');
  });

  it('starts unmounted with default directory name', () => {
    expect(adapter.isMounted).toBe(false);
    expect(adapter.directoryName).toBeNull();
  });

  it('mounts successfully and reflects directory name', async () => {
    const success = await adapter.mount();
    expect(success).toBe(true);
    expect(adapter.isMounted).toBe(true);
    expect(adapter.directoryName).toBe('TestWorkspace');
  });

  it('throws on operations before mounting', async () => {
    await expect(adapter.list()).rejects.toThrow('No directory mounted');
    await expect(adapter.readText('test.m')).rejects.toThrow('No directory mounted');
    await expect(adapter.writeText('test.m', 'a = 1;')).rejects.toThrow('No directory mounted');
    await expect(adapter.remove('test.m')).rejects.toThrow('No directory mounted');
  });

  it('supports writeText, readText, list, and remove', async () => {
    await adapter.mount();

    // 1. Write files
    await adapter.writeText('main.m', 'disp("hello");');
    await adapter.writeText('helper.m', 'function y = helper(x); y = x*2; endfunction');

    // 2. Read back
    const content = await adapter.readText('main.m');
    expect(content).toBe('disp("hello");');

    // 3. List
    const entries = await adapter.list();
    expect(entries.length).toBe(2);
    expect(entries.map((e) => e.name)).toEqual(['helper.m', 'main.m']);
    expect(entries[0].kind).toBe('file');

    // 4. Remove
    await adapter.remove('helper.m');
    const remaining = await adapter.list();
    expect(remaining.length).toBe(1);
    expect(remaining[0].name).toBe('main.m');

    // 5. Read deleted throws
    await expect(adapter.readText('helper.m')).rejects.toThrow('File not found: helper.m');
  });

  it('disconnects and resets mounted state', async () => {
    await adapter.mount();
    expect(adapter.isMounted).toBe(true);

    adapter.disconnect();
    expect(adapter.isMounted).toBe(false);
    expect(adapter.directoryName).toBeNull();
  });
});
