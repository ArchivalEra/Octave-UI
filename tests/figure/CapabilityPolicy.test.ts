// tests/figure/CapabilityPolicy.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CapabilityPolicy } from '../../src/modules/figure/CapabilityPolicy';

describe('CapabilityPolicy Input Module', () => {
  let policy: CapabilityPolicy;

  beforeEach(() => {
    policy = new CapabilityPolicy();
  });

  it('correctly identifies plot commands and extracts matched command', () => {
    expect(policy.isPlotCommand('x = 1:10;')).toEqual({ isPlot: false });
    expect(policy.isPlotCommand('disp("hello world");')).toEqual({ isPlot: false });

    const plotRes = policy.isPlotCommand('plot(x, y)');
    expect(plotRes.isPlot).toBe(true);
    expect(plotRes.matchedCommand?.toLowerCase()).toBe('plot');

    const surfRes = policy.isPlotCommand('surf(peaks)');
    expect(surfRes.isPlot).toBe(true);
    expect(surfRes.matchedCommand?.toLowerCase()).toBe('surf');

    const drawnowRes = policy.isPlotCommand('drawnow');
    expect(drawnowRes.isPlot).toBe(true);
    expect(drawnowRes.matchedCommand?.toLowerCase()).toBe('drawnow');
  });

  it('blocks plot commands at dequeue when WebGPU is unsupported', async () => {
    policy.setMockWebGpuSupport(false);
    const interceptSpy = vi.fn();
    policy.onIntercept(interceptSpy);

    const decision = await policy.evaluateAtDequeue('plot(1:5, 1:5)');
    expect(decision.allowed).toBe(false);
    expect(decision.isPlot).toBe(true);
    expect(decision.matchedCommand).toBe('plot');
    expect(decision.reason).toContain('E6 GL 边界');
    expect(interceptSpy).toHaveBeenCalledTimes(1);
    expect(interceptSpy).toHaveBeenCalledWith(decision);
  });

  it('allows non-plot commands regardless of WebGPU capability', async () => {
    policy.setMockWebGpuSupport(false);
    const decision = await policy.evaluateAtDequeue('A = rand(10); b = inv(A);');
    expect(decision.allowed).toBe(true);
    expect(decision.isPlot).toBe(false);
  });

  it('allows plot commands when WebGPU capability is available', async () => {
    policy.setMockWebGpuSupport(true);
    const interceptSpy = vi.fn();
    policy.onIntercept(interceptSpy);

    const decision = await policy.evaluateAtDequeue('subplot(2, 1, 1)');
    expect(decision.allowed).toBe(true);
    expect(decision.isPlot).toBe(true);
    expect(decision.matchedCommand).toBe('subplot');
    expect(interceptSpy).not.toHaveBeenCalled();
  });

  it('allows plot commands when allowOverride is true', async () => {
    policy.setMockWebGpuSupport(false);
    const decision = await policy.evaluateAtDequeue('plot(1, 2)', true);
    expect(decision.allowed).toBe(true);
  });

  it('handles case-insensitivity and substring safety', () => {
    expect(policy.isPlotCommand('PLOT(1, 2)').isPlot).toBe(true);
    expect(policy.isPlotCommand('plotter = [1, 2, 3];').isPlot).toBe(false);
    expect(policy.isPlotCommand('x = 10;\ny = 20;\nplot(x, y);').isPlot).toBe(true);
  });
});
