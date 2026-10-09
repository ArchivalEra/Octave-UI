// tests/engine/WasmEmbedAdapter.test.ts
import { describe, it, expect, vi } from 'vitest';
import { WasmEmbedAdapter } from '../../src/modules/engine/WasmEmbedAdapter';

describe('WasmEmbedAdapter alignDocstringsPaths', () => {
  it('safely handles null or undefined embed', () => {
    expect(() => WasmEmbedAdapter.alignDocstringsPaths(null)).not.toThrow();
    expect(() => WasmEmbedAdapter.alignDocstringsPaths(undefined)).not.toThrow();
    expect(() => WasmEmbedAdapter.alignDocstringsPaths({})).not.toThrow();
    expect(() => WasmEmbedAdapter.alignDocstringsPaths({ mod: {} })).not.toThrow();
  });

  it('mirrors built-in-docstrings and doc-cache from w64 path to canonical prefix', () => {
    const files: Record<string, Uint8Array> = {
      '/src/work/octave-install-w64/share/octave/11.3.0/etc/built-in-docstrings': new Uint8Array([1, 2, 3]),
      '/src/work/octave-install-w64/share/octave/11.3.0/etc/doc-cache': new Uint8Array([4, 5, 6]),
    };
    const createdDirs = new Set<string>();

    const mockFS = {
      stat: (path: string) => {
        if (files[path]) {
          return { size: files[path].length };
        }
        throw new Error('ENOENT');
      },
      mkdirTree: (dir: string) => {
        createdDirs.add(dir);
      },
      readFile: (path: string) => {
        if (files[path]) return files[path];
        throw new Error('ENOENT');
      },
      writeFile: (path: string, content: Uint8Array) => {
        files[path] = content;
      },
    };

    const mockEmbed = {
      mod: { FS: mockFS },
    };

    WasmEmbedAdapter.alignDocstringsPaths(mockEmbed);

    expect(createdDirs.has('/src/work/octave-install/share/octave/11.3.0/etc')).toBe(true);
    expect(files['/src/work/octave-install/share/octave/11.3.0/etc/built-in-docstrings']).toEqual(new Uint8Array([1, 2, 3]));
    expect(files['/src/work/octave-install/share/octave/11.3.0/etc/doc-cache']).toEqual(new Uint8Array([4, 5, 6]));
  });

  it('is idempotent and does not overwrite if target files already exist', () => {
    const files: Record<string, Uint8Array> = {
      '/src/work/octave-install-w64/share/octave/11.3.0/etc/built-in-docstrings': new Uint8Array([1, 2, 3]),
      '/src/work/octave-install/share/octave/11.3.0/etc/built-in-docstrings': new Uint8Array([9, 9, 9]),
    };

    const writeFileSpy = vi.fn();
    const mockFS = {
      stat: (path: string) => {
        if (files[path]) {
          return { size: files[path].length };
        }
        throw new Error('ENOENT');
      },
      mkdirTree: vi.fn(),
      readFile: (path: string) => files[path],
      writeFile: writeFileSpy,
    };

    const mockEmbed = { mod: { FS: mockFS } };
    WasmEmbedAdapter.alignDocstringsPaths(mockEmbed);

    expect(writeFileSpy).not.toHaveBeenCalledWith(
      '/src/work/octave-install/share/octave/11.3.0/etc/built-in-docstrings',
      expect.anything()
    );
  });
});
