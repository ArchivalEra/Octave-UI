// tests/plugins/PluginRegistry.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginRegistry } from '../../src/modules/plugins/PluginRegistry';
import type { OctavePlugin } from '../../src/modules/plugins/types';

describe('PluginRegistry Core System', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  it('registers and retrieves a valid plugin', () => {
    const dummyPlugin: OctavePlugin = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      description: 'A test plugin instance',
      enabled: true,
    };

    const registered = registry.register(dummyPlugin);
    expect(registered).toBe(dummyPlugin);
    expect(registry.has('test-plugin')).toBe(true);
    expect(registry.get('test-plugin')).toBe(dummyPlugin);
    expect(registry.isEnabled('test-plugin')).toBe(true);
    expect(registry.getAll()).toHaveLength(1);
  });

  it('rejects plugins with missing or empty ids', () => {
    expect(() => registry.register({} as any)).toThrow(/valid non-empty id/);
    expect(() => registry.register({ id: '' } as any)).toThrow(/valid non-empty id/);
  });

  it('prevents duplicate plugin id registration', () => {
    const p1: OctavePlugin = {
      id: 'dup',
      name: 'Dup 1',
      version: '1.0',
      description: 'First',
    };
    const p2: OctavePlugin = {
      id: 'dup',
      name: 'Dup 2',
      version: '2.0',
      description: 'Second',
    };

    registry.register(p1);
    expect(() => registry.register(p2)).toThrow(/already registered/);
  });

  it('supports unregistering plugins and calling destroy lifecycle', async () => {
    const destroySpy = vi.fn();
    const plugin: OctavePlugin = {
      id: 'destroyable',
      name: 'Destroyable',
      version: '1.0',
      description: 'Clean up test',
      destroy: destroySpy,
    };

    registry.register(plugin);
    await registry.initAll();

    const removed = await registry.unregister('destroyable');
    expect(removed).toBe(true);
    expect(registry.has('destroyable')).toBe(false);
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it('manages plugin enable/disable state and filters getEnabled', () => {
    const p1: OctavePlugin = { id: 'p1', name: 'P1', version: '1.0', description: 'desc', enabled: true };
    const p2: OctavePlugin = { id: 'p2', name: 'P2', version: '1.0', description: 'desc', enabled: false };

    registry.register(p1);
    registry.register(p2);

    expect(registry.getEnabled()).toHaveLength(1);
    expect(registry.getEnabled()[0].id).toBe('p1');

    registry.disable('p1');
    expect(registry.isEnabled('p1')).toBe(false);
    expect(registry.getEnabled()).toHaveLength(0);

    registry.enable('p2');
    expect(registry.isEnabled('p2')).toBe(true);
    expect(registry.getEnabled()).toHaveLength(1);
  });

  it('initializes only enabled plugins with passed context', async () => {
    const init1 = vi.fn();
    const init2 = vi.fn();

    const p1: OctavePlugin = { id: 'p1', name: 'P1', version: '1.0', description: 'd', enabled: true, init: init1 };
    const p2: OctavePlugin = { id: 'p2', name: 'P2', version: '1.0', description: 'd', enabled: false, init: init2 };

    registry.register(p1);
    registry.register(p2);

    await registry.initAll({ appVersion: '0.1.0' });

    expect(init1).toHaveBeenCalledWith({ appVersion: '0.1.0' });
    expect(init2).not.toHaveBeenCalled();
  });

  it('notifies subscribers on registration changes', () => {
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);

    registry.register({ id: 'dyn', name: 'Dyn', version: '1.0', description: 'd' });
    expect(listener).toHaveBeenCalledTimes(1);

    registry.disable('dyn');
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    registry.enable('dyn');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('cleans up completely on reset()', () => {
    registry.register({ id: 'r1', name: 'R1', version: '1.0', description: 'd' });
    expect(registry.getAll()).toHaveLength(1);

    registry.reset();
    expect(registry.getAll()).toHaveLength(0);
    expect(registry.has('r1')).toBe(false);
  });
});
