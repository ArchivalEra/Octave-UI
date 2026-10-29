// src/modules/plugins/webmcp/tools/octaveListPackages.ts
// 逐字搬家（mail/062）：catalog 兜底（loadCatalog 的 rejection 被 `.catch(() => {})`
// 吞掉）/ 类型强转（consumer 非法值**原样透传**给 filterPackages）/ filterPackages
// **同步调用不 await**（旧实现真行为 —— 返回 Promise 时当场 `.map` TypeError 落
// catch-all，golden A-extra 用例盯）全部原样，不许顺手改好。

import { defineTool } from '../defineTool';
import { args } from '../schema';

const listPackagesArgs = args()
  .prop('query', 'string', { description: 'Optional search keyword for package name, description, or dependencies.' })
  .prop('consumer', 'string', {
    enum: ['all', 'octave', 'omc'],
    description: 'Filter by consumer ecosystem target.',
  })
  .prop('form', 'string', {
    enum: ['all', 'pkg', 'tree'],
    description: 'Filter by delivery form (pkg: standard package, tree: runtime layer).',
  })
  .prop('installedOnly', 'boolean', {
    description: 'Whether to restrict results to already-installed packages only.',
  })
  .build();

export const octaveListPackagesTool = defineTool({
  name: 'octave_list_packages',
  description: 'Query available, compatible, and installed Octave Forge packages and runtime layers in the catalog.',
  parameters: listPackagesArgs.schema,
  deps: ['packageManager'],
  // effects = read：只查目录（catalog），不做装包/下载/写盘。`loadCatalog()`
  // 会发一次 catalog JSON 的 GET 并在插件内缓存（之后 getCatalog 直接命中），
  // 但那是对静态目录的**读取**，不触发 OctaveAssets.install（那才是下载/写盘面，
  // 归 octave_install_package）。filterPackages/getStatus 都是纯查询。
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
  },
});
