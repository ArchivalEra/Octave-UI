// src/modules/storage/ExportService.ts
// 导出服务：将工作区文件结构通过 fflate 打包为标准 .zip 并触发浏览器本地下载

import { zip, type AsyncZippable } from 'fflate';

export async function createZip(
  entries: Array<{ path: string; data: Uint8Array }>
): Promise<Uint8Array> {
  const zippable: AsyncZippable = {};

  for (const entry of entries) {
    zippable[entry.path] = [entry.data, { level: 6 }];
  }

  return new Promise((resolve, reject) => {
    zip(zippable, (err, data) => {
      if (err) {
        return reject(new Error(`Failed to create ZIP package: ${err.message}`));
      }
      resolve(data);
    });
  });
}

/**
 * 触发浏览器本地无感下载
 */
export function downloadFile(
  data: Uint8Array | Blob,
  filename: string,
  mimeType = 'application/zip'
): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new Error('downloadFile requires a browser DOM environment');
  }

  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';

  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
