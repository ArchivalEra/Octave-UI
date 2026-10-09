// tests/storage/PathValidation.test.ts
import { describe, it, expect } from 'vitest';
import {
  validatePath,
  joinPath,
  splitPath,
} from '../../src/modules/storage/types';

describe('POSIX Path Validation & Security Utilities', () => {
  it('normalizes standard POSIX relative paths', () => {
    expect(validatePath('script.m')).toBe('script.m');
    expect(validatePath('src/utils/math.m')).toBe('src/utils/math.m');
    expect(validatePath('data/2026/run_01.dat')).toBe('data/2026/run_01.dat');
  });

  it('converts Windows backslashes into standard POSIX slashes', () => {
    expect(validatePath('src\\utils\\helper.m')).toBe('src/utils/helper.m');
    expect(validatePath('data\\sub\\file.csv')).toBe('data/sub/file.csv');
  });

  it('strips leading and trailing slashes safely', () => {
    expect(validatePath('/home/workspace/script.m')).toBe('home/workspace/script.m');
    expect(validatePath('folder/sub/')).toBe('folder/sub');
    expect(validatePath('///test/file.m///')).toBe('test/file.m');
  });

  it('strictly rejects path traversal tokens (.. and .)', () => {
    expect(() => validatePath('../secret.env')).toThrowError(/traversal token/);
    expect(() => validatePath('foo/../../etc/passwd')).toThrowError(/traversal token/);
    expect(() => validatePath('sub/./file.m')).toThrowError(/traversal token/);
    expect(() => validatePath('..')).toThrowError(/traversal token/);
  });

  it('strictly rejects empty paths or whitespace/null characters', () => {
    expect(() => validatePath('')).toThrowError(/non-empty string/);
    expect(() => validatePath('/')).toThrowError(/empty relative path/);
    expect(() => validatePath('foo/\x00/bar')).toThrowError(/null or control/);
    expect(() => validatePath('file\x1b.m')).toThrowError(/null or control/);
  });

  it('strictly rejects Windows drive colon tokens', () => {
    expect(() => validatePath('C:/Windows/system32')).toThrowError(/illegal colon/);
    expect(() => validatePath('D:script.m')).toThrowError(/illegal colon/);
  });

  it('correctly joins path segments', () => {
    expect(joinPath('src', 'modules', 'test.m')).toBe('src/modules/test.m');
    expect(joinPath('/root/', '/child/', 'file.m')).toBe('root/child/file.m');
    expect(joinPath('folder', '')).toBe('folder');
  });

  it('correctly splits directory and basename', () => {
    expect(splitPath('script.m')).toEqual({ dir: '', name: 'script.m' });
    expect(splitPath('src/utils/math.m')).toEqual({ dir: 'src/utils', name: 'math.m' });
    expect(splitPath('a/b/c/')).toEqual({ dir: 'a/b', name: 'c' });
  });
});
