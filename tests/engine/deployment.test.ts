// tests/engine/deployment.test.ts
// 统一站点资产接缝 spec §2.3：base 只有一个产地，组合根一次解析并冻结。
// 复跑：CI=true npx vitest run tests/engine/deployment.test.ts
import { describe, it, expect, afterEach, vi } from 'vitest';

const MOD = '../../src/modules/engine/deployment';

function setMeta(content: string | null) {
  const existing = document.querySelector('meta[name="site-base"]');
  if (existing) existing.remove();
  if (content !== null) {
    const m = document.createElement('meta');
    m.setAttribute('name', 'site-base');
    m.setAttribute('content', content);
    document.head.appendChild(m);
  }
}

afterEach(() => {
  setMeta(null);
  delete (window as any).__siteBase;
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('resolveDeployment（唯一 base 产地）', () => {
  it('★ 从 meta 解析 siteBase，冻结；laneBase 是按 EngineLane 的纯函数', async () => {
    setMeta('/repo/Octave/');
    const { resolveDeployment, laneBaseOf } = await import(MOD);
    const d = resolveDeployment();
    expect(d.siteBase).toBe('/repo/Octave/');
    expect(d.laneBase).toBe('/repo/Octave/lanes/wasm32-final/'); // 默认车道，boot 时 bindHost 覆盖
    expect(Object.isFrozen(d)).toBe(true);
    expect(laneBaseOf(d, 'wasm32-final')).toBe('/repo/Octave/lanes/wasm32-final/');
    expect(laneBaseOf(d, 'master')).toBe('/repo/Octave/lanes/master/');
    expect(laneBaseOf(d, 'omc')).toBe('/repo/Octave/lanes/wasm32-final/'); // 与 WasmEmbedAdapter 同款
  });

  it('★ meta 尾斜杠补全：/repo/Octave ⇒ /repo/Octave/', async () => {
    setMeta('/repo/Octave');
    const { resolveDeployment } = await import(MOD);
    expect(resolveDeployment().siteBase).toBe('/repo/Octave/');
  });

  it('★ 反向：meta 与 __siteBase 都缺 ⇒ DEPLOYMENT_UNRESOLVED（不静默 /）', async () => {
    setMeta(null);
    const { resolveDeployment } = await import(MOD);
    expect(() => resolveDeployment()).toThrowError(/DEPLOYMENT_UNRESOLVED/);
  });

  it('★ 空输入：meta 内容为空串 ⇒ 同样拒，不当作根路径', async () => {
    setMeta('   ');
    const { resolveDeployment } = await import(MOD);
    expect(() => resolveDeployment()).toThrowError(/DEPLOYMENT_UNRESOLVED/);
  });

  it('★ 同类肯定：__siteBase 作为构建期兜底仍可用（证探针读得到"存在"）', async () => {
    setMeta(null);
    (window as any).__siteBase = '/from-window/';
    const { resolveDeployment } = await import(MOD);
    expect(resolveDeployment().siteBase).toBe('/from-window/');
  });
});
