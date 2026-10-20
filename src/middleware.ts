// src/middleware.ts
// 为 Astro 开发服务器与 SSR 页面注入 COOP/COEP 隔离标头，确保 crossOriginIsolated 成立
import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  return response;
});
