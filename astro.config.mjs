import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLaneSizes } from './scripts/lane-sizes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 车道体量真源（fix/lane-sizes）：构建期从 public/lanes/*/octave.build.json 的
// measured.files 求和，经 vite define 注入 __LANE_SIZES__。真源裁定与降级契约
// 见 scripts/lane-sizes.mjs 头注——读不到 ⇒ 值 null ⇒ UI 显式降级，绝不编数。
const laneSizes = readLaneSizes(__dirname);

export default defineConfig({
  root: __dirname,
  outDir: path.resolve(__dirname, 'dist'),
  output: 'static',
  // 子路径部署（isui.ren/repo/Octave/）：所有站点资源 URL 均带上此前缀
  base: '/repo/Octave/',
  integrations: [svelte()],
  vite: {
    define: {
      __LANE_SIZES__: JSON.stringify(laneSizes),
    },
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
    preview: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
  },
});
