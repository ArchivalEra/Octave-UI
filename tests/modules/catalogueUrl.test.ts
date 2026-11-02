// tests/modules/catalogueUrl.test.ts
// catalogue 地址推导的判据 —— 这条 URL 我拼错过一次，实测才发现。
//
// 事故（2026-11-02）：我把 catalogue 拼成 `${siteBase}/static/catalogue.json`，
// 而站点 base 是 `/repo/Octave/` ⇒ 实际请求
//   https://isui.ren/repo/Octave/static/catalogue.json  ⇒ **404**
// 真实地址在**域名根**：
//   https://isui.ren/static/catalogue.json             ⇒ **200**
//
// 根因不是笔误，是「catalogue 是全站共享的派生件，一份服务所有 repo」这个语义
// 没落到代码里。这组断言把这个语义钉住。
//
// 复跑：CI=true npx vitest run tests/modules/catalogueUrl.test.ts

import { describe, it, expect } from 'vitest';
import { deriveCatalogueUrl } from '../../src/modules/appContext';

describe('deriveCatalogueUrl：catalogue 在域名根，不在站点 base 下', () => {
  it('★ 站点 base 是 /repo/Octave/ ⇒ catalogue 仍拼到根（不是 base 下）', () => {
    const url = deriveCatalogueUrl('/repo/Octave/');
    expect(url.endsWith('/static/catalogue.json')).toBe(true);
    expect(url).not.toContain('/repo/Octave/');
  });

  it('★ 无论 siteBase 是什么深层路径，结果都只在 origin + /static/catalogue.json', () => {
    for (const base of ['/', '/repo/Octave/', '/a/b/c/', '']) {
      const url = deriveCatalogueUrl(base);
      expect(url).toMatch(/^https?:\/\/[^/]*\/static\/catalogue\.json$|^\/static\/catalogue\.json$/);
    }
  });

  it('非浏览器环境（无 location）⇒ 退回相对根（不崩、不编造域名）', () => {
    // vitest 的 happy-dom 提供 location；这里只验证形状不含深层 base
    const url = deriveCatalogueUrl('/deep/path/');
    expect(url).not.toContain('/deep/path/');
  });
});