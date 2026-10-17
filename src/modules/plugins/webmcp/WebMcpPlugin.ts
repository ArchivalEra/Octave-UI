// src/modules/plugins/webmcp/WebMcpPlugin.ts
// WebMCP 自主智能体标准网桥：100% DOM-free 纯服务调度，双通道挂载与静默握手

import type { OctavePlugin } from '../types';
import type {
  WebMcpToolDefinition,
  WebMcpToolCallResult,
  WebMcpContextApi,
} from './types';
import type { ProjectWorkspace } from '../../workspace/ProjectWorkspace';
import type { PackageManagerPlugin } from '../package/PackageManagerPlugin';
import type { EngineSupervisor } from '../../engine/EngineSupervisor';

export interface WebMcpPluginServices {
  projectWorkspace?: ProjectWorkspace;
  packageManagerPlugin?: PackageManagerPlugin;
  supervisor?: EngineSupervisor;
  windowTarget?: Window;
  documentTarget?: Document;
}

export class WebMcpPlugin implements OctavePlugin<WebMcpPluginServices>, WebMcpContextApi {
  readonly id = 'webmcp';
  readonly name = 'WebMCP Autonomous Agent Bridge';
  readonly version = '1.0.0';
  readonly description = 'DOM-free WebMCP interface exposing Octave engine, notebook, workspace, and packages to AI agents.';
  enabled = true;
  options?: WebMcpPluginServices;

  private _boundEventListener: ((e: Event) => void) | null = null;
  private _targetWindow: Window | null = null;
  private _targetDocument: Document | null = null;

  constructor(services?: WebMcpPluginServices) {
    this.options = services;
  }

  private get workspace(): ProjectWorkspace | undefined {
    if (this.options?.projectWorkspace) return this.options.projectWorkspace;
    try {
      // 允许从全局环境惰性解析
      const ctx = require('../../appContext');
      return ctx.projectWorkspace;
    } catch {
      return undefined;
    }
  }

  private get packageManager(): PackageManagerPlugin | undefined {
    if (this.options?.packageManagerPlugin) return this.options.packageManagerPlugin;
    try {
      const ctx = require('../../appContext');
      return ctx.packageManagerPlugin;
    } catch {
      return undefined;
    }
  }

  private get supervisor(): EngineSupervisor | undefined {
    if (this.options?.supervisor) return this.options.supervisor;
    try {
      const ctx = require('../../appContext');
      return ctx.supervisor;
    } catch {
      return undefined;
    }
  }

  // --- WebMCP 工具名册 ---

  async listTools(): Promise<WebMcpToolDefinition[]> {
    return [
      {
        name: 'octave_eval',
        description: 'Evaluate GNU Octave code directly in WebAssembly engine and return execution output.',
        parameters: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'Octave/MATLAB code statement or script to execute (e.g. "A = magic(3); det(A)").',
            },
          },
          required: ['code'],
        },
      },
      {
        name: 'octave_run_cell',
        description: 'Execute a specific notebook cell by cell ID or 0-based cell index.',
        parameters: {
          type: 'object',
          properties: {
            cellId: {
              type: 'string',
              description: 'The unique ID of the target notebook cell to run.',
            },
            index: {
              type: 'number',
              description: 'The 0-based index of the cell in the notebook cell list.',
            },
          },
        },
      },
      {
        name: 'octave_get_workspace',
        description: 'Retrieve all current variables in the GNU Octave workspace (names, types, dimensions, bytes).',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'octave_list_packages',
        description: 'Query available, compatible, and installed Octave Forge packages and runtime layers in the catalog.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Optional search keyword for package name, description, or dependencies.',
            },
            consumer: {
              type: 'string',
              enum: ['all', 'octave', 'omc'],
              description: 'Filter by consumer ecosystem target.',
            },
            form: {
              type: 'string',
              enum: ['all', 'pkg', 'tree'],
              description: 'Filter by delivery form (pkg: standard package, tree: runtime layer).',
            },
            installedOnly: {
              type: 'boolean',
              description: 'Whether to restrict results to already-installed packages only.',
            },
          },
        },
      },
      {
        name: 'octave_install_package',
        description: 'Pre-plan or execute installation of an Octave Forge package or runtime extension layer.',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Exact package identifier (e.g. "signal", "optim", "linear-algebra").',
            },
            version: {
              type: 'string',
              description: 'Optional package version string. Defaults to latest release.',
            },
            planOnly: {
              type: 'boolean',
              description: 'If true, simulates dependency tree and calculates download budget with zero network cost.',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'octave_get_system_state',
        description: 'Get engine supervisor state, active computation lane, open file, mode, and workspace metrics.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  // --- WebMCP 工具调用执行器 (DOM-free) ---

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<WebMcpToolCallResult> {
    try {
      switch (name) {
        case 'octave_eval': {
          const code = String(args.code || '').trim();
          if (!code) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: parameter "code" is required and cannot be empty.' }],
            };
          }

          const sup = this.supervisor;
          if (!sup) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: EngineSupervisor service is not available.' }],
            };
          }

          const evalResult = await sup.eval(code);
          const ws = this.workspace;
          if (ws) {
            await ws.syncVariables();
          }

          return {
            isError: !evalResult.ok,
            content: [
              {
                type: 'text',
                text: evalResult.output || (evalResult.ok ? '(execution completed with no output)' : `Error (rc=${evalResult.rc})`),
              },
            ],
          };
        }

        case 'octave_run_cell': {
          const ws = this.workspace;
          if (!ws) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: ProjectWorkspace service is not available.' }],
            };
          }

          const cells = ws.cells || [];
          let targetCell = typeof args.cellId === 'string'
            ? cells.find((c) => c.id === args.cellId)
            : typeof args.index === 'number'
            ? cells[args.index]
            : null;

          if (!targetCell) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: target cell not found. Provide a valid cellId or index.' }],
            };
          }

          const targetCellId = targetCell.id;
          const cellRes = await ws.executeCell(targetCellId);
          const updatedCell = (ws.cells || []).find((c) => c.id === targetCellId);

          return {
            isError: !cellRes.ok,
            content: [
              {
                type: 'resource',
                mimeType: 'application/json',
                data: {
                  cellId: targetCellId,
                  status: updatedCell?.status || (cellRes.ok ? 'success' : 'error'),
                  executionCount: updatedCell?.executionCount ?? null,
                  durationMs: updatedCell?.durationMs ?? null,
                  output: updatedCell?.streamingOutput || cellRes.output || '',
                },
              },
            ],
          };
        }

        case 'octave_get_workspace': {
          const ws = this.workspace;
          const sup = this.supervisor;
          const vars = ws ? await ws.syncVariables() : sup?.isReady ? await sup.getWorkspace() : [];

          return {
            content: [
              {
                type: 'resource',
                mimeType: 'application/json',
                data: {
                  count: vars.length,
                  variables: vars.map((v) => ({
                    name: v.name,
                    type: v.type,
                    dimensions: v.dimensions,
                    bytes: v.bytes,
                    valuePreview: v.valuePreview,
                  })),
                },
              },
            ],
          };
        }

        case 'octave_list_packages': {
          const pm = this.packageManager;
          if (!pm) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: PackageManagerPlugin is not available.' }],
            };
          }

          if (!pm.getCatalog()) {
            await pm.loadCatalog().catch(() => {});
          }

          const query = typeof args.query === 'string' ? args.query : '';
          const consumer = (args.consumer as 'all' | 'octave' | 'omc') || 'all';
          const form = (args.form as 'all' | 'pkg' | 'tree') || 'all';
          const installedOnly = Boolean(args.installedOnly);

          const list = pm.filterPackages({ query, consumer, form, installedOnly });

          return {
            content: [
              {
                type: 'resource',
                mimeType: 'application/json',
                data: {
                  total: list.length,
                  packages: list.map((pkg) => {
                    const status = pm.getStatus(pkg.name);
                    return {
                      name: pkg.name,
                      version: pkg.version,
                      description: pkg.description,
                      consumer: pkg.consumer,
                      form: pkg.form,
                      size: pkg.size,
                      status,
                      deps: pkg.deps || [],
                    };
                  }),
                },
              },
            ],
          };
        }

        case 'octave_install_package': {
          const pm = this.packageManager;
          if (!pm) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: PackageManagerPlugin is not available.' }],
            };
          }

          const name = String(args.name || '').trim();
          if (!name) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: parameter "name" is required.' }],
            };
          }

          const version = typeof args.version === 'string' ? args.version : undefined;
          const planOnly = Boolean(args.planOnly);

          if (planOnly) {
            const plan = await pm.planInstall(name, version);
            return {
              content: [
                {
                  type: 'resource',
                  mimeType: 'application/json',
                  data: {
                    packageName: name,
                    planOnly: true,
                    bytes: plan.bytes,
                    layers: plan.layers,
                  },
                },
              ],
            };
          }

          const installResult = await pm.installPackage(name, { version });
          return {
            isError: installResult.state !== 'ok',
            content: [
              {
                type: 'resource',
                mimeType: 'application/json',
                data: installResult,
              },
            ],
          };
        }

        case 'octave_get_system_state': {
          const sup = this.supervisor;
          const ws = this.workspace;

          return {
            content: [
              {
                type: 'resource',
                mimeType: 'application/json',
                data: {
                  supervisorState: sup?.state || 'unloaded',
                  activeLane: ws?.activeLane || sup?.currentLane || 'wasm32-final',
                  activeMode: ws?.mode || 'notebook',
                  activeFile: ws?.activeFile || null,
                  filesCount: (ws?.files || []).length,
                  variablesCount: (ws?.variables || []).length,
                  notebookCellsCount: (ws?.cells || []).length,
                },
              },
            ],
          };
        }

        default:
          return {
            isError: true,
            content: [{ type: 'text', text: `Unknown tool name: "${name}". Use listTools() to see available tools.` }],
          };
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: 'text', text: `Execution failed for tool "${name}": ${errorMsg}` }],
      };
    }
  }

  // --- 插件生命周期与浏览器双通道握手 ---

  init(): void {
    const win = this.options?.windowTarget ?? (typeof window !== 'undefined' ? window : null);
    const doc = this.options?.documentTarget ?? (typeof document !== 'undefined' ? document : null);

    this._targetWindow = win;
    this._targetDocument = doc;

    if (doc) {
      (doc as unknown as { modelContext: WebMcpContextApi }).modelContext = this;
    }

    if (win) {
      (win as unknown as { modelContext: WebMcpContextApi }).modelContext = this;
      if (typeof navigator !== 'undefined') {
        try {
          (navigator as unknown as { modelContext: WebMcpContextApi }).modelContext = this;
        } catch {
          // Navigator might be non-extensible in some engines
        }
      }

      this._boundEventListener = (e: Event) => {
        const customEvent = e as CustomEvent<{
          id?: string;
          name: string;
          arguments?: Record<string, unknown>;
        }>;
        if (!customEvent.detail || !customEvent.detail.name) return;

        void this.callTool(customEvent.detail.name, customEvent.detail.arguments).then((res) => {
          win.dispatchEvent(
            new CustomEvent('webmcp:response', {
              detail: { id: customEvent.detail.id, result: res },
            })
          );
        });
      };

      win.addEventListener('webmcp:call', this._boundEventListener);

      // 静默握手信标：声明 WebMCP 工具已就绪
      void this.listTools().then((tools) => {
        win.dispatchEvent(
          new CustomEvent('webmcp:ready', {
            detail: { pluginId: this.id, tools },
          })
        );
      });
    }
  }

  destroy(): void {
    if (this._targetWindow && this._boundEventListener) {
      this._targetWindow.removeEventListener('webmcp:call', this._boundEventListener);
      this._boundEventListener = null;
    }

    if (this._targetDocument && (this._targetDocument as unknown as { modelContext: unknown }).modelContext === this) {
      delete (this._targetDocument as unknown as { modelContext?: unknown }).modelContext;
    }

    if (this._targetWindow && (this._targetWindow as unknown as { modelContext: unknown }).modelContext === this) {
      delete (this._targetWindow as unknown as { modelContext?: unknown }).modelContext;
    }

    if (typeof navigator !== 'undefined' && (navigator as unknown as { modelContext?: unknown }).modelContext === this) {
      try {
        delete (navigator as unknown as { modelContext?: unknown }).modelContext;
      } catch {}
    }

    if (this._targetWindow) {
      this._targetWindow.dispatchEvent(
        new CustomEvent('webmcp:unloaded', {
          detail: { pluginId: this.id },
        })
      );
    }

    this._targetWindow = null;
    this._targetDocument = null;
  }
}
