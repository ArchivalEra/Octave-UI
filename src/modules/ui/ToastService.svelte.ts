// src/modules/ui/ToastService.svelte.ts
// 响应式轻量 Toast 通知服务：替换浏览器原生阻塞 alert()，结构化呈现 7 封闭错误码 [state, cause]

export interface ToastItem {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  message: string;
  code?: string;
  timeoutMs?: number;
}

export class ToastService {
  toasts = $state<ToastItem[]>([]);

  show(item: Omit<ToastItem, 'id'>): string {
    const id = 'toast_' + Math.random().toString(36).slice(2, 9);
    const toast: ToastItem = {
      id,
      timeoutMs: item.timeoutMs ?? (item.type === 'error' ? 8000 : 4000),
      ...item,
    };
    this.toasts.push(toast);

    if (toast.timeoutMs && toast.timeoutMs > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, toast.timeoutMs);
    }
    return id;
  }

  error(message: string, code?: string, title?: string): string {
    return this.show({ type: 'error', message, code, title });
  }

  success(message: string, title?: string): string {
    return this.show({ type: 'success', message, title });
  }

  info(message: string, title?: string): string {
    return this.show({ type: 'info', message, title });
  }

  warning(message: string, code?: string, title?: string): string {
    return this.show({ type: 'warning', message, code, title });
  }

  dismiss(id: string): void {
    const idx = this.toasts.findIndex((t) => t.id === id);
    if (idx !== -1) {
      this.toasts.splice(idx, 1);
    }
  }

  clear(): void {
    this.toasts = [];
  }
}

export const toastService = new ToastService();
