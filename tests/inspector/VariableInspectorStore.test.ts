// tests/inspector/VariableInspectorStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { VariableInspectorStore } from '../../src/modules/inspector/VariableInspectorStore';
import { EngineSupervisor } from '../../src/modules/engine/EngineSupervisor';
import { MockEmbedAdapter } from '../../src/modules/engine/MockEmbedAdapter';

describe('VariableInspectorStore', () => {
  let inspector: VariableInspectorStore;
  let supervisor: EngineSupervisor;
  let adapter: MockEmbedAdapter;

  beforeEach(async () => {
    inspector = new VariableInspectorStore();
    adapter = new MockEmbedAdapter();
    // 合法注入：生产路径已禁 Mock 回退，测试替身必须经 factory 显式进入
    supervisor = new EngineSupervisor({ adapter, adapterFactory: () => adapter, skipPreflight: true });
    await supervisor.boot();
  });

  it('correctly discriminates numeric vs non-numeric classes', () => {
    expect(VariableInspectorStore.isNumeric('double')).toBe(true);
    expect(VariableInspectorStore.isNumeric('single')).toBe(true);
    expect(VariableInspectorStore.isNumeric('int32')).toBe(true);
    expect(VariableInspectorStore.isNumeric('struct')).toBe(false);
    expect(VariableInspectorStore.isNumeric('cell')).toBe(false);
    expect(VariableInspectorStore.isNumeric('char')).toBe(false);
  });

  it('inspects numeric variables without error', async () => {
    const detail = await inspector.inspect(
      { name: 'ans', class: 'double', size: '1x1', bytes: 8 },
      supervisor
    );
    expect(detail.name).toBe('ans');
    expect(detail.isNumeric).toBe(true);
  });

  it('opens and closes inspector modal state', () => {
    expect(inspector.isOpen).toBe(false);
    inspector.open({
      name: 'M',
      class: 'double',
      size: '3x3',
      bytes: 72,
      isNumeric: true,
    });
    expect(inspector.isOpen).toBe(true);
    expect(inspector.selectedVar?.name).toBe('M');

    inspector.close();
    expect(inspector.isOpen).toBe(false);
    expect(inspector.selectedVar).toBeNull();
  });
});
