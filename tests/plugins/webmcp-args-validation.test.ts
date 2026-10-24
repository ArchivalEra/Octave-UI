// tests/plugins/webmcp-args-validation.test.ts
// ARGS_INVALID 子集校验的反向断言（spec v2 步骤 3 第 1 项 · 偏差表第 1 项勾销的证）。
//   该报的必须报：缺 required / 类型明确错 / enum 越界（含非字符串 enum 实参）。
//   不该报的必须放行：可强转值（number→string / 数值串→number / truthy→boolean）、
//   未知字段、无 required 工具的空 args、空串 code（走旧守卫非 ARGS_INVALID）。
//
// 复跑：CI=true npx vitest run tests/plugins/webmcp-args-validation.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { WebMcpPlugin } from '../../src/modules/plugins/webmcp/WebMcpPlugin';
import type { EngineSupervisor } from '../../src/modules/engine/EngineSupervisor';
import type { ProjectWorkspace } from '../../src/modules/workspace/ProjectWorkspace';
import type { PackageManagerPlugin } from '../../src/modules/plugins/package/PackageManagerPlugin';
import { validateArgs } from '../../src/modules/plugins/webmcp/validate';
import { args as argsBuilder } from '../../src/modules/plugins/webmcp/schema';

describe('ARGS_INVALID 子集校验（dispatcher 层，纯校验器直测）', () => {
  const schema = argsBuilder()
    .prop('name', 'string', { description: 'pkg name' })
    .prop('consumer', 'string', { enum: ['all', 'octave', 'omc'], description: 'ecosystem' })
    .prop('planOnly', 'boolean', { description: 'plan' })
    .prop('index', 'number', { description: 'cell index' })
    .required('name')
    .build().schema;

  it('★ 缺 required 必报（带字段名）', () => {
    const res = validateArgs(schema, {});
    expect(res?.isError).toBe(true);
    expect(res?.content[0]).toEqual({
      type: 'text',
      text: 'ARGS_INVALID: parameter "name" is required.',
    });
  });

  it('★ required 键显式 undefined 等同缺（必报）', () => {
    const res = validateArgs(schema, { name: undefined });
    expect(res?.isError).toBe(true);
    expect((res!.content[0] as any).text).toContain('"name" is required');
  });

  it('★ 类型明确错必报：string 目标收 object', () => {
    const res = validateArgs(schema, { name: { nested: true } });
    expect(res?.isError).toBe(true);
    expect((res!.content[0] as any).text).toContain('"name" must be of type string');
  });

  it('★ 类型明确错必报：string 目标收 null', () => {
    const res = validateArgs(schema, { name: null });
    expect((res!.content[0] as any).text).toContain('"name" must be of type string');
  });

  it('★ enum 越界必报（带字段名与成员表）', () => {
    const res = validateArgs(schema, { name: 'signal', consumer: 'rustlang' });
    expect(res?.isError).toBe(true);
    expect((res!.content[0] as any).text).toContain('"consumer" must be one of [all, octave, omc]');
  });

  it('★ 放行面：可强转值不报（number→string / 数值串→number / truthy→boolean）', () => {
    expect(validateArgs(schema, { name: 42, index: '7', planOnly: 'yes' })).toBeNull();
  });

  it('★ 放行面：未知字段不报（additionalProperties 不查）', () => {
    expect(validateArgs(schema, { name: 'signal', totallyUnknown: { deep: true } })).toBeNull();
  });

  it('★ 放行面：enum 目标收非串值不比成员（强转语义，类型关已过）', () => {
    expect(validateArgs(schema, { name: 'signal', consumer: 5 })).toBeNull();
  });

  it('★ 空串 string 合法（旧守卫的事，不是校验器的事）', () => {
    expect(validateArgs(schema, { name: '' })).toBeNull();
  });
});

describe('ARGS_INVALID 子集校验（经 callTool 全链，含旧守卫并存）', () => {
  let plugin: WebMcpPlugin;

  beforeEach(() => {
    const sup = {
      isReady: true,
      state: 'idle',
      currentLane: 'wasm32-final',
      eval: async () => ({ ok: true, rc: 0, output: 'ans = 42\n' }),
      getWorkspace: async () => [],
    };
    const ws: any = {
      mode: 'notebook', activeLane: 'wasm32-final', activeFile: null, files: [], variables: [], cells: [],
      syncVariables: async () => [],
    };
    const pm: any = { getCatalog: () => ({}), loadCatalog: async () => ({}), filterPackages: () => [], getStatus: () => ({}), planInstall: async () => ({ bytes: 1, layers: [] }), installPackage: async () => ({ state: 'ok' }) };
    plugin = new WebMcpPlugin({
      supervisor: sup as unknown as EngineSupervisor,
      projectWorkspace: ws as unknown as ProjectWorkspace,
      packageManagerPlugin: pm as unknown as PackageManagerPlugin,
    });
  });

  it('缺 code 键 ⇒ ARGS_INVALID（偏差面；旧快照已按偏差表更新）', async () => {
    const res = await plugin.callTool('octave_eval', {});
    expect(res.isError).toBe(true);
    expect((res.content[0] as any).text).toContain('ARGS_INVALID: parameter "code" is required');
  });

  it('空串 code ⇒ 旧守卫文案（非 ARGS_INVALID——校验器放行，run 内旧路径）', async () => {
    const res = await plugin.callTool('octave_eval', { code: '' });
    expect(res.isError).toBe(true);
    expect((res.content[0] as any).text).toContain('parameter "code" is required and cannot be empty');
    expect((res.content[0] as any).text).not.toContain('ARGS_INVALID');
  });

  it('code: 42（可强转）⇒ 放行成功（旧调用零误杀）', async () => {
    const res = await plugin.callTool('octave_eval', { code: 42 });
    expect(res.isError).toBeFalsy();
    expect((res.content[0] as any).text).toContain('ans = 42');
  });

  it('consumer: 5（enum 目标非串）⇒ 放行透传（旧路径原样）', async () => {
    const res = await plugin.callTool('octave_list_packages', { consumer: 5 });
    expect(res.isError).toBeFalsy();
  });

  it('未知字段 ⇒ 放行不影响结果', async () => {
    const res = await plugin.callTool('octave_get_workspace', { mystery: 'x' });
    expect(res.isError).toBeFalsy();
  });
});
