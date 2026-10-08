import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  outDir: path.resolve(__dirname, 'dist'),
  output: 'static',
  // 子路径部署（isui.ren/repo/Octave/）：所有站点资源 URL 均带上此前缀
  base: '/repo/Octave/',
  integrations: [svelte()],
  vite: {
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
