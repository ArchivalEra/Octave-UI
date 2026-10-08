// tests/filesystem/FilesystemStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { FilesystemStore } from '../../src/modules/filesystem/FilesystemStore';
import { EngineSupervisor } from '../../src/modules/engine/EngineSupervisor';
import { MockEmbedAdapter } from '../../src/modules/engine/MockEmbedAdapter';

describe('FilesystemStore Deep Module', () => {
  let supervisor: EngineSupervisor;
  let store: FilesystemStore;

  beforeEach(async () => {
    const adapter = new MockEmbedAdapter();
    supervisor = new EngineSupervisor({ adapter, skipPreflight: true });
    await supervisor.boot();
    store = new FilesystemStore(supervisor, '/home/web_user');
  });

  it('lists directory files in MEMFS', () => {
    const files = store.refresh();
    expect(files.length).toBeGreaterThan(0);
    expect(files.some(f => f.name === 'welcome.m')).toBe(true);
  });

  it('writes, reads and removes a virtual file', () => {
    const filename = 'test_script.m';
    const content = 'disp("hello virtual fs");';

    const writeOk = store.writeFile(filename, content);
    expect(writeOk).toBe(true);

    const readBack = store.readFile(filename);
    expect(readBack).toBe(content);

    const rmOk = store.removeFile(filename);
    expect(rmOk).toBe(true);
  });

  it('handles file download check without throwing', () => {
    const ok = store.downloadFile('welcome.m');
    expect(ok).toBe(true);
  });
});
