// src/modules/storage/ImportSources.ts
// 三大导入通道：目录选择器（同步手势穿透）、拖拽导入（递归剪枝）、ZIP 包解压

import { unzip, type UnzipFileFilter } from 'fflate';
import { type ImportedFile, validatePath } from './types';

/**
 * 忽略的垃圾目录或系统隐藏文件
 */
const PRUNED_SEGMENTS = new Set([
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  '.DS_Store',
  'Thumbs.db',
  '.vscode',
  '.idea',
  '__pycache__',
]);

export function shouldPrunePath(path: string): boolean {
  const segments = path.replace(/\\/g, '/').split('/').filter(Boolean);
  return segments.some((seg) => PRUNED_SEGMENTS.has(seg));
}

/**
 * 剥除外层包裹目录（例如打开 my_repo 目录，其子项为 my_repo/test.m 时，剥除 my_repo 变为 test.m）
 */
export function stripRootContainer(paths: string[]): (path: string) => string {
  if (paths.length === 0) return (p) => p;

  const firstSegs = paths.map((p) => {
    const idx = p.indexOf('/');
    return idx !== -1 ? p.slice(0, idx) : null;
  });

  // 如果所有路径都以同一个目录开头且无顶层裸文件，则可以剥离该公共根目录
  const commonPrefix = firstSegs[0];
  const allMatch = commonPrefix && firstSegs.every((s) => s === commonPrefix);

  if (allMatch) {
    const prefixLen = commonPrefix.length + 1;
    return (p: string) => {
      if (p.startsWith(commonPrefix + '/')) {
        return p.slice(prefixLen);
      }
      return p;
    };
  }

  return (p) => p;
}

/**
 * 通道 1：文件夹选择（同步手势保证）
 * 必须在点击事件的第一行同步触发 input.click()，严禁任何前置 await
 */
export function pickFolder(): Promise<ImportedFile[]> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      return reject(new Error('pickFolder requires a browser DOM environment'));
    }

    const input = document.createElement('input');
    input.type = 'file';
    // @ts-ignore
    input.webkitdirectory = true;
    // @ts-ignore
    input.directory = true;
    input.multiple = true;
    input.style.display = 'none';

    let resolved = false;

    input.onchange = async () => {
      resolved = true;
      try {
        const fileList = Array.from(input.files || []);
        if (fileList.length === 0) {
          cleanup();
          resolve([]);
          return;
        }

        // 收集有效路径并计算剥离映射
        const rawPaths = fileList
          .map((f) => f.webkitRelativePath || f.name)
          .filter((p) => !shouldPrunePath(p));

        const transformPath = stripRootContainer(rawPaths);
        const results: ImportedFile[] = [];

        for (const file of fileList) {
          const rawRel = file.webkitRelativePath || file.name;
          if (shouldPrunePath(rawRel)) continue;

          const transformed = transformPath(rawRel);
          if (!transformed) continue;

          try {
            const valid = validatePath(transformed);
            const arrayBuf = await file.arrayBuffer();
            results.push({
              path: valid,
              data: new Uint8Array(arrayBuf),
            });
          } catch (e) {
            console.warn('[ImportSources] Skip invalid file path:', rawRel, e);
          }
        }

        cleanup();
        resolve(results);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    input.oncancel = () => {
      resolved = true;
      cleanup();
      resolve([]);
    };

    function cleanup() {
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
    }

    // 同步挂载并点击，保留用户手势 Token
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * 通道 2：拖拽文件与目录导入（带多级递归解析与剪枝）
 */
export async function fromDroppedEntries(dataTransfer: DataTransfer): Promise<ImportedFile[]> {
  const results: ImportedFile[] = [];

  // 1. 尝试使用现代 webkitGetAsEntry (支持多级目录遍历)
  const items = Array.from(dataTransfer.items || []);
  const entries: any[] = [];
  for (const item of items) {
    if (typeof item.webkitGetAsEntry === 'function') {
      const entry = item.webkitGetAsEntry();
      if (entry) entries.push(entry);
    }
  }

  if (entries.length > 0) {
    async function scanEntry(entry: any, currentPath: string): Promise<void> {
      if (shouldPrunePath(entry.name)) {
        return;
      }

      if (entry.isFile) {
        const file = await new Promise<File>((res, rej) => entry.file(res, rej));
        const relPath = currentPath ? `${currentPath}/${file.name}` : file.name;
        const valid = validatePath(relPath);
        const buf = await file.arrayBuffer();
        results.push({
          path: valid,
          data: new Uint8Array(buf),
        });
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const readBatch = async (): Promise<any[]> => {
          return new Promise((res, rej) => dirReader.readEntries(res, rej));
        };

        const dirPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

        // 根据标准规范，readEntries 需循环读取直到返回空数组
        while (true) {
          const batch = await readBatch();
          if (!batch || batch.length === 0) break;
          for (const child of batch) {
            await scanEntry(child, dirPath);
          }
        }
      }
    }

    for (const topEntry of entries) {
      await scanEntry(topEntry, '');
    }

    // 检查是否需要剥离外层唯一根目录
    if (results.length > 0) {
      const allPaths = results.map((r) => r.path);
      const transform = stripRootContainer(allPaths);
      return results.map((r) => ({
        path: validatePath(transform(r.path)),
        data: r.data,
      }));
    }

    return results;
  }

  // 2. 降级：仅普通文件平铺列表
  const files = Array.from(dataTransfer.files || []);
  for (const file of files) {
    if (shouldPrunePath(file.name)) continue;
    try {
      const valid = validatePath(file.name);
      const buf = await file.arrayBuffer();
      results.push({
        path: valid,
        data: new Uint8Array(buf),
      });
    } catch {}
  }

  return results;
}

/**
 * 通道 3：ZIP 压缩包解压导入（纯客户端 fflate 解包，防 zip-slip）
 */
export async function fromZip(
  source: Uint8Array | ArrayBuffer | File | Blob
): Promise<ImportedFile[]> {
  let bytes: Uint8Array;
  if (source instanceof Uint8Array) {
    bytes = source;
  } else if (source instanceof ArrayBuffer) {
    bytes = new Uint8Array(source);
  } else {
    const buf = await source.arrayBuffer();
    bytes = new Uint8Array(buf);
  }

  return new Promise((resolve, reject) => {
    unzip(bytes, (err, unzipped) => {
      if (err) {
        return reject(new Error(`Failed to decompress ZIP archive: ${err.message}`));
      }

      const results: ImportedFile[] = [];
      const rawPaths = Object.keys(unzipped).filter(
        (p) => !p.endsWith('/') && !shouldPrunePath(p)
      );

      const transform = stripRootContainer(rawPaths);

      for (const p of rawPaths) {
        const transformed = transform(p);
        if (!transformed) continue;

        try {
          const valid = validatePath(transformed);
          results.push({
            path: valid,
            data: unzipped[p],
          });
        } catch (e) {
          console.warn('[ImportSources] Reject invalid path in zip:', p, e);
        }
      }

      resolve(results);
    });
  });
}
