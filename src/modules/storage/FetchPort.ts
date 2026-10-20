// src/modules/storage/FetchPort.ts
// 网络抓取端口与适配器（Seam 架构：解耦实际浏览器 HTTP 流与内存自动化测试）

import type { DownloadProgressCallback } from './downloadTypes';

export interface FetchOptions {
  onProgress?: DownloadProgressCallback;
  signal?: AbortSignal;
}

export interface FetchResult {
  ok: boolean;
  status: number;
  data: Uint8Array;
  sha256: string;
  totalBytes: number | null;
}

export interface FetchPort {
  fetchBytes(url: string, options?: FetchOptions): Promise<FetchResult>;
  fetchJSON<T = any>(url: string, options?: FetchOptions): Promise<T>;
}

export async function computeSha256(data: Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data as ArrayBufferView);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // 简易退化环境或极旧环境兜底
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = (hash << 5) - hash + data[i];
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

export class BrowserFetchAdapter implements FetchPort {
  async fetchBytes(url: string, options?: FetchOptions): Promise<FetchResult> {
    const res = await fetch(url, { signal: options?.signal });
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data: new Uint8Array(0),
        sha256: '',
        totalBytes: null,
      };
    }

    const contentLength = res.headers.get('content-length');
    const totalBytes = contentLength ? parseInt(contentLength, 10) : null;

    if (!res.body) {
      const buf = await res.arrayBuffer();
      const data = new Uint8Array(buf);
      const sha256 = await computeSha256(data);
      options?.onProgress?.({ receivedBytes: data.length, totalBytes });
      return { ok: true, status: res.status, data, sha256, totalBytes };
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      if (options?.signal?.aborted) {
        reader.cancel();
        throw new DOMException('Download aborted by user', 'AbortError');
      }

      const { done, value } = await reader.read();
      if (done) break;

      if (value) {
        chunks.push(value);
        receivedBytes += value.length;
        options?.onProgress?.({ receivedBytes, totalBytes });
      }
    }

    const merged = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const sha256 = await computeSha256(merged);
    return {
      ok: true,
      status: res.status,
      data: merged,
      sha256,
      totalBytes,
    };
  }

  async fetchJSON<T = any>(url: string, options?: FetchOptions): Promise<T> {
    const res = await fetch(url, { signal: options?.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`);
    }
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    const trimmed = text.trim();
    if (trimmed.startsWith('<') || (contentType && !contentType.includes('json') && !url.endsWith('.json'))) {
      throw new Error(
        `Expected JSON response from ${url}, received HTML/non-JSON content (Content-Type: ${contentType || 'unknown'})`
      );
    }
    try {
      return JSON.parse(text) as T;
    } catch (e: any) {
      throw new Error(`Invalid JSON received from ${url}: ${e?.message || e}`);
    }
  }
}

export class MockFetchAdapter implements FetchPort {
  private files = new Map<string, { data: Uint8Array; sha256: string; status?: number }>();
  private jsonStore = new Map<string, any>();
  private injectErrorOnUrl = new Map<string, Error>();

  setFile(url: string, content: string | Uint8Array, sha256Override?: string): void {
    const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    // 默认或指定 sha256
    let sha = sha256Override;
    if (!sha) {
      let hash = 0;
      for (let i = 0; i < data.length; i++) {
        hash = (hash << 5) - hash + data[i];
        hash |= 0;
      }
      sha = Math.abs(hash).toString(16).padStart(64, '0');
    }
    this.files.set(url, { data, sha256: sha });
  }

  setJSON(url: string, value: any): void {
    this.jsonStore.set(url, value);
  }

  setError(url: string, err: Error): void {
    this.injectErrorOnUrl.set(url, err);
  }

  async fetchBytes(url: string, options?: FetchOptions): Promise<FetchResult> {
    if (this.injectErrorOnUrl.has(url)) {
      throw this.injectErrorOnUrl.get(url)!;
    }

    if (options?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const entry = this.files.get(url);
    if (!entry) {
      return {
        ok: false,
        status: 404,
        data: new Uint8Array(0),
        sha256: '',
        totalBytes: null,
      };
    }

    const total = entry.data.length;
    options?.onProgress?.({ receivedBytes: total, totalBytes: total });

    return {
      ok: true,
      status: 200,
      data: entry.data,
      sha256: entry.sha256,
      totalBytes: total,
    };
  }

  async fetchJSON<T = any>(url: string, options?: FetchOptions): Promise<T> {
    if (this.injectErrorOnUrl.has(url)) {
      throw this.injectErrorOnUrl.get(url)!;
    }
    if (this.jsonStore.has(url)) {
      return this.jsonStore.get(url);
    }
    throw new Error(`404: Not found in mock: ${url}`);
  }
}
