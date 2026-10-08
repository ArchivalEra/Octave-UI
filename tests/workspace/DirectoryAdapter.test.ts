import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  VirtualMemoryDirectoryAdapter,
  FSAccessDirectoryAdapter,
} from '../../src/modules/workspace/DirectoryAdapter';

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

describe('FSAccessDirectoryAdapter', () => {
  it('reports isSupported false in headless environment without showDirectoryPicker', () => {
    const adapter = new FSAccessDirectoryAdapter();
    expect(adapter.isSupported()).toBe(false);
    expect(adapter.isMounted).toBe(false);
    expect(adapter.directoryName).toBeNull();
  });

  it('interacts with mock showDirectoryPicker without Illegal Invocation', async () => {
    const fakeHandle = {
      name: 'SimulatedProject',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      requestPermission: vi.fn().mockResolvedValue('granted'),
      entries: async function* () {
        yield [
          'test.m',
          {
            name: 'test.m',
            kind: 'file',
            getFile: async () => ({
              text: async () => 'x = 42;',
              size: 7,
              lastModified: 1000,
            }),
          },
        ];
      },
      getFileHandle: vi.fn().mockImplementation(async (path: string) => ({
        getFile: async () => ({
          text: async () => 'x = 42;',
          size: 7,
          lastModified: 1000,
        }),
        createWritable: async () => ({
          write: vi.fn().mockResolvedValue(undefined),
          close: vi.fn().mockResolvedValue(undefined),
        }),
      })),
      removeEntry: vi.fn().mockResolvedValue(undefined),
    };

    const originalWindow = (globalThis as any).window;
    try {
      (globalThis as any).window = {
        showDirectoryPicker: vi.fn().mockResolvedValue(fakeHandle),
      };

      const adapter = new FSAccessDirectoryAdapter();
      expect(adapter.isSupported()).toBe(true);

      const mounted = await adapter.mount();
      expect(mounted).toBe(true);
      expect(adapter.isMounted).toBe(true);
      expect(adapter.directoryName).toBe('SimulatedProject');

      const files = await adapter.list();
      expect(files.length).toBe(1);
      expect(files[0].name).toBe('test.m');

      const text = await adapter.readText('test.m');
      expect(text).toBe('x = 42;');

      await adapter.writeText('test.m', 'x = 100;');
      await adapter.remove('test.m');
      expect(fakeHandle.removeEntry).toHaveBeenCalledWith('test.m');

      adapter.disconnect();
      expect(adapter.isMounted).toBe(false);
      expect(adapter.directoryName).toBeNull();
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('handles user cancellation (AbortError) cleanly', async () => {
    const originalWindow = (globalThis as any).window;
    try {
      const abortErr = new Error('The user aborted a request.');
      abortErr.name = 'AbortError';

      (globalThis as any).window = {
        showDirectoryPicker: vi.fn().mockRejectedValue(abortErr),
      };

      const adapter = new FSAccessDirectoryAdapter();
      const mounted = await adapter.mount();
      expect(mounted).toBe(false);
      expect(adapter.isMounted).toBe(false);
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });
});
