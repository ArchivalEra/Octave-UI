import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebMcpPlugin } from '../../src/modules/plugins/webmcp/WebMcpPlugin';
import { PluginRegistry } from '../../src/modules/plugins/PluginRegistry';
import type { EngineSupervisor } from '../../src/modules/engine/EngineSupervisor';
import type { ProjectWorkspace } from '../../src/modules/workspace/ProjectWorkspace';
import type { PackageManagerPlugin } from '../../src/modules/plugins/package/PackageManagerPlugin';

describe('WebMcpPlugin Deep Module', () => {
  let mockSupervisor: any;
  let mockWorkspace: any;
  let mockPackageManager: any;
  let plugin: WebMcpPlugin;

  beforeEach(() => {
    mockSupervisor = {
      isReady: true,
      state: 'idle',
      currentLane: 'wasm32-final',
      eval: vi.fn().mockResolvedValue({ ok: true, rc: 0, output: 'ans = 42\n' }),
      getWorkspace: vi.fn().mockResolvedValue([
        { name: 'ans', type: 'scalar', dimensions: '1x1', bytes: 8, valuePreview: '42' },
      ]),
    };

    mockWorkspace = {
      mode: 'notebook',
      activeLane: 'wasm32-final',
      activeFile: 'script.m',
      files: [{ name: 'script.m', kind: 'file', size: 120 }],
      variables: [
        { name: 'ans', type: 'scalar', dimensions: '1x1', bytes: 8, valuePreview: '42' },
        { name: 'x', type: 'scalar', dimensions: '1x1', bytes: 8, valuePreview: '10' },
      ],
      cells: [
        {
          id: 'cell-1',
          title: 'Section 1',
          code: 'x = 10',
          status: 'idle',
          executionCount: null,
          streamingOutput: '',
        },
      ],
      executeCell: vi.fn().mockResolvedValue({ ok: true, rc: 0, output: 'x = 10\n' }),
      syncVariables: vi.fn().mockResolvedValue([
        { name: 'ans', type: 'scalar', dimensions: '1x1', bytes: 8, valuePreview: '42' },
        { name: 'x', type: 'scalar', dimensions: '1x1', bytes: 8, valuePreview: '10' },
      ]),
    };

    mockPackageManager = {
      getCatalog: vi.fn().mockReturnValue({}),
      loadCatalog: vi.fn().mockResolvedValue({}),
      filterPackages: vi.fn().mockReturnValue([
        {
          name: 'signal',
          version: '1.4.5',
          description: 'Signal processing toolbox',
          consumer: 'octave',
          form: 'pkg',
          size: 1048576,
          deps: ['control'],
        },
      ]),
      getStatus: vi.fn().mockReturnValue({
        compatible: true,
        fromSource: false,
        installed: false,
      }),
      planInstall: vi.fn().mockResolvedValue({
        bytes: 1048576,
        layers: ['openblas'],
      }),
      installPackage: vi.fn().mockResolvedValue({
        state: 'ok',
        cause: null,
      }),
    };

    plugin = new WebMcpPlugin({
      supervisor: mockSupervisor as unknown as EngineSupervisor,
      projectWorkspace: mockWorkspace as unknown as ProjectWorkspace,
      packageManagerPlugin: mockPackageManager as unknown as PackageManagerPlugin,
    });
  });

  afterEach(() => {
    plugin.destroy();
  });

  describe('Plugin Registry & Lifecycle Integration', () => {
    it('registers in PluginRegistry with id webmcp', () => {
      const registry = new PluginRegistry();
      registry.register(plugin);
      expect(registry.has('webmcp')).toBe(true);
      expect(registry.get('webmcp')).toBe(plugin);
    });

    it('cleans up and unregisters cleanly', async () => {
      const registry = new PluginRegistry();
      registry.register(plugin);
      await registry.initAll();

      const removed = await registry.unregister('webmcp');
      expect(removed).toBe(true);
      expect(registry.has('webmcp')).toBe(false);
    });
  });

  describe('Tool Registry & Schemas', () => {
    // 7 条（内容仓 093 裁定 A：omc 工具族按 provision 自然生长；本工具经逐条显式确认）
    it('lists 7 tools (6 octave + omc_load_msl)', async () => {
      const tools = await plugin.listTools();
      expect(tools.length).toBe(7);
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual([
        'octave_eval',
        'octave_get_system_state',
        'octave_get_workspace',
        'octave_install_package',
        'octave_list_packages',
        'octave_run_cell',
        'omc_load_msl',
      ]);
    });

    it('each tool defines valid JSON schema parameters', async () => {
      const tools = await plugin.listTools();
      for (const t of tools) {
        expect(t.parameters.type).toBe('object');
        expect(t.description.length).toBeGreaterThan(10);
      }
    });
  });

  describe('DOM-Free Tool Executions', () => {
    it('octave_eval: runs code via supervisor and updates workspace variables', async () => {
      const res = await plugin.callTool('octave_eval', { code: 'ans = 42' });
      expect(res.isError).toBeFalsy();
      expect(res.content[0].type).toBe('text');
      expect((res.content[0] as any).text).toContain('ans = 42');
      expect(mockSupervisor.eval).toHaveBeenCalledWith('ans = 42');
      expect(mockWorkspace.syncVariables).toHaveBeenCalled();
    });

    it('octave_eval: rejects empty code with descriptive error', async () => {
      const res = await plugin.callTool('octave_eval', { code: '' });
      expect(res.isError).toBe(true);
      expect((res.content[0] as any).text).toContain('parameter "code" is required');
    });

    it('octave_run_cell: executes cell by index', async () => {
      const res = await plugin.callTool('octave_run_cell', { index: 0 });
      expect(res.isError).toBeFalsy();
      expect(mockWorkspace.executeCell).toHaveBeenCalledWith('cell-1');
      expect(res.content[0].type).toBe('resource');
      expect((res.content[0] as any).data.cellId).toBe('cell-1');
    });

    it('octave_run_cell: executes cell by cellId', async () => {
      const res = await plugin.callTool('octave_run_cell', { cellId: 'cell-1' });
      expect(res.isError).toBeFalsy();
      expect(mockWorkspace.executeCell).toHaveBeenCalledWith('cell-1');
    });

    it('octave_run_cell: errors if target cell is not found', async () => {
      const res = await plugin.callTool('octave_run_cell', { cellId: 'non-existent' });
      expect(res.isError).toBe(true);
      expect((res.content[0] as any).text).toContain('target cell not found');
    });

    it('octave_get_workspace: returns variables from workspace sync', async () => {
      const res = await plugin.callTool('octave_get_workspace');
      expect(res.isError).toBeFalsy();
      const data = (res.content[0] as any).data;
      expect(data.count).toBe(2);
      expect(data.variables[0].name).toBe('ans');
      expect(data.variables[1].name).toBe('x');
    });

    it('octave_list_packages: queries packages through package manager', async () => {
      const res = await plugin.callTool('octave_list_packages', {
        query: 'signal',
        consumer: 'octave',
      });
      expect(res.isError).toBeFalsy();
      const data = (res.content[0] as any).data;
      expect(data.total).toBe(1);
      expect(data.packages[0].name).toBe('signal');
      expect(mockPackageManager.filterPackages).toHaveBeenCalledWith({
        query: 'signal',
        consumer: 'octave',
        form: 'all',
        installedOnly: false,
      });
    });

    it('octave_install_package: supports planOnly pre-flight estimation', async () => {
      const res = await plugin.callTool('octave_install_package', {
        name: 'signal',
        planOnly: true,
      });
      expect(res.isError).toBeFalsy();
      const data = (res.content[0] as any).data;
      expect(data.planOnly).toBe(true);
      expect(data.bytes).toBe(1048576);
      expect(data.layers).toEqual(['openblas']);
      expect(mockPackageManager.planInstall).toHaveBeenCalledWith('signal', undefined);
      expect(mockPackageManager.installPackage).not.toHaveBeenCalled();
    });

    it('octave_install_package: performs real install when planOnly is false', async () => {
      const res = await plugin.callTool('octave_install_package', {
        name: 'signal',
        version: '1.4.5',
      });
      expect(res.isError).toBeFalsy();
      expect(mockPackageManager.installPackage).toHaveBeenCalledWith('signal', { version: '1.4.5' });
    });

    it('octave_install_package: errors on missing package name', async () => {
      const res = await plugin.callTool('octave_install_package', { name: '' });
      expect(res.isError).toBe(true);
      expect((res.content[0] as any).text).toContain('parameter "name" is required');
    });

    it('octave_get_system_state: returns state metrics without DOM inspection', async () => {
      const res = await plugin.callTool('octave_get_system_state');
      expect(res.isError).toBeFalsy();
      const data = (res.content[0] as any).data;
      expect(data.supervisorState).toBe('idle');
      expect(data.activeLane).toBe('wasm32-final');
      expect(data.activeFile).toBe('script.m');
      expect(data.filesCount).toBe(1);
      expect(data.variablesCount).toBe(2);
      expect(data.notebookCellsCount).toBe(1);
    });

    it('handles unknown tool gracefully', async () => {
      const res = await plugin.callTool('non_existent_tool');
      expect(res.isError).toBe(true);
      expect((res.content[0] as any).text).toContain('Unknown tool name');
    });
  });

  describe('Browser Handshake & Event-Driven Relay', () => {
    it('attaches modelContext to document and window on init', () => {
      plugin.init();
      expect((window as any).modelContext).toBe(plugin);
      expect((document as any).modelContext).toBe(plugin);
    });

    it('dispatches webmcp:ready event on init', async () => {
      let readyDetail: any = null;
      window.addEventListener('webmcp:ready', (e: any) => {
        readyDetail = e.detail;
      });

      plugin.init();
      // Allow microtask resolution
      await new Promise((r) => setTimeout(r, 10));

      expect(readyDetail).not.toBeNull();
      expect(readyDetail.pluginId).toBe('webmcp');
      expect(readyDetail.tools.length).toBe(7); // 6 octave + omc_load_msl（内容仓 093 裁定 A）
    });

    it('responds to webmcp:call events with webmcp:response', async () => {
      plugin.init();

      let responseDetail: any = null;
      window.addEventListener('webmcp:response', (e: any) => {
        responseDetail = e.detail;
      });

      window.dispatchEvent(
        new CustomEvent('webmcp:call', {
          detail: {
            id: 'call-101',
            name: 'octave_eval',
            arguments: { code: '2 + 2' },
          },
        })
      );

      await new Promise((r) => setTimeout(r, 20));

      expect(responseDetail).not.toBeNull();
      expect(responseDetail.id).toBe('call-101');
      expect(responseDetail.result.content[0].text).toContain('ans = 42');
    });

    it('cleans up event listeners and window/document attachments on destroy', () => {
      plugin.init();
      expect((window as any).modelContext).toBe(plugin);

      plugin.destroy();
      expect((window as any).modelContext).toBeUndefined();
      expect((document as any).modelContext).toBeUndefined();
    });
  });
});
