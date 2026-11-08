// src/modules/plugins/webmcp/tools/octaveListPackages.ts
// ★ 2026-11-07 零手写选项：enum 值全部由契约投影层的 facets 生成，
//   consumer / form 的新值自动出现在 MCP schema，零手写、零改代码。

import { defineTool } from '../defineTool';
import { args } from '../schema';
// enum 数组是**可变引用**：组合根 bindProjection() 后由 bindContractEnums()
// 就地灌入契约实测值。这样工具名册的静态 import 不依赖绑定顺序，
// 且 wire schema 的键序（type → enum → description）逐字不变。
const consumerEnum: string[] = [];
const formEnum: string[] = [];

const listPackagesArgs = args()
  .prop('query', 'string', { description: 'Optional search keyword for package name, description, or dependencies.' })
  .prop('consumer', 'string', {
    enum: consumerEnum,
    description: 'Filter by consumer ecosystem target (values come from the content contract).',
  })
  .prop('form', 'string', {
    enum: formEnum,
    description: 'Filter by delivery form (values come from the content contract).',
  })
  .prop('installedOnly', 'boolean', {
    description: 'Whether to restrict results to already-installed packages only.',
  })
  .build();

/** 组合根在 bindProjection() 之后调用：从契约投影就地灌入 enum 值（零手写）。 */
export function bindContractEnums(consumer: readonly string[], form: readonly string[]): void {
  consumerEnum.splice(0, consumerEnum.length, ...consumer);
  formEnum.splice(0, formEnum.length, ...form);
}

export const octaveListPackagesTool = defineTool({
  name: 'octave_list_packages',
  description: 'Query available, compatible, and installed Octave Forge packages and runtime layers in the catalog.',
  parameters: listPackagesArgs.schema,
  deps: ['packageManager'],
  // effects = read：只查目录（catalog），不做装包/下载/写盘。
  effects: 'read',
  run: async (args, ctx) => {
    const pm = ctx.packageManager;
    if (!pm) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Error: PackageManagerPlugin is not available.' }],
      };
    }

    if (!pm.getCatalog()) {
      // spec §2.2 / S5：不许 `.catch(() => {})` 把 CATALOG_UNREADABLE 吞成假绿。
      await pm.loadCatalog();
    }

    const query = typeof args.query === 'string' ? args.query : '';
    // 值直接透传给投影驱动的 filterPackages；非法值由轴值集合在插件侧过滤，
    // 不再有手写类型断言 / 'all' 缺省（哨兵 = 不在轴值集合里的任意值）。
    const consumer = typeof args.consumer === 'string' ? args.consumer : '';
    const form = typeof args.form === 'string' ? args.form : '';
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
  },
});
