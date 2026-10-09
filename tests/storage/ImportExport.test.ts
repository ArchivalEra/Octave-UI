// tests/storage/ImportExport.test.ts
import { describe, it, expect } from 'vitest';
import { createZip } from '../../src/modules/storage/ExportService';
import {
  fromZip,
  shouldPrunePath,
  stripRootContainer,
} from '../../src/modules/storage/ImportSources';

describe('Import & Export Channels with fflate', () => {
  it('identifies and prunes unwanted directory segments', () => {
    expect(shouldPrunePath('.git/config')).toBe(true);
    expect(shouldPrunePath('node_modules/pkg/index.js')).toBe(true);
    expect(shouldPrunePath('.DS_Store')).toBe(true);
    expect(shouldPrunePath('__pycache__/mod.pyc')).toBe(true);

    expect(shouldPrunePath('src/main.m')).toBe(false);
    expect(shouldPrunePath('data/simulation_results.mat')).toBe(false);
    expect(shouldPrunePath('my.git.repo/script.m')).toBe(false);
  });

  it('strips common root container directory when all files reside inside it', () => {
    const paths = ['my_project/script.m', 'my_project/data/input.csv'];
    const transform = stripRootContainer(paths);

    expect(transform('my_project/script.m')).toBe('script.m');
    expect(transform('my_project/data/input.csv')).toBe('data/input.csv');
  });

  it('preserves top-level relative paths when there is no single root container', () => {
    const paths = ['script.m', 'data/input.csv'];
    const transform = stripRootContainer(paths);

    expect(transform('script.m')).toBe('script.m');
    expect(transform('data/input.csv')).toBe('data/input.csv');
  });

  it('performs full ZIP export and import roundtrip losslessly', async () => {
    const originalFiles = [
      { path: 'main.m', data: new TextEncoder().encode('disp("hello from octave");\nx = linspace(0, 1, 100);') },
      { path: 'data/matrix.dat', data: new Uint8Array([10, 20, 30, 40, 50, 255, 0, 128]) },
      { path: 'lib/helpers/calc.m', data: new TextEncoder().encode('function y = calc(x)\n  y = x * 2;\nendfunction') },
    ];

    // 1. 打包导出为 ZIP 字节流
    const zipBytes = await createZip(originalFiles);
    expect(zipBytes).toBeInstanceOf(Uint8Array);
    expect(zipBytes.byteLength).toBeGreaterThan(0);

    // 2. 解压恢复
    const imported = await fromZip(zipBytes);
    expect(imported.length).toBe(3);

    // 3. 校验每个文件路径及字节内容 100% 吻合
    const map = new Map(imported.map((f) => [f.path, f.data]));

    expect(map.has('main.m')).toBe(true);
    expect(new TextDecoder().decode(map.get('main.m')!)).toBe('disp("hello from octave");\nx = linspace(0, 1, 100);');

    expect(map.has('data/matrix.dat')).toBe(true);
    expect(map.get('data/matrix.dat')!).toEqual(new Uint8Array([10, 20, 30, 40, 50, 255, 0, 128]));

    expect(map.has('lib/helpers/calc.m')).toBe(true);
    expect(new TextDecoder().decode(map.get('lib/helpers/calc.m')!)).toContain('function y = calc(x)');
  });
});
