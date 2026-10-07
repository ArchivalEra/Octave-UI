// tests/experiment/ExperimentStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ExampleRegistry } from '../../src/modules/experiment/ExampleRegistry';
import { ExperimentStore } from '../../src/modules/experiment/ExperimentStore';
import { WorkbenchController } from '../../src/modules/workbench/WorkbenchController';
import { EngineSupervisor } from '../../src/modules/engine/EngineSupervisor';
import { MockEmbedAdapter } from '../../src/modules/engine/MockEmbedAdapter';

describe('ExperimentStore & ExampleRegistry', () => {
  let workbench: WorkbenchController;
  let supervisor: EngineSupervisor;
  let adapter: MockEmbedAdapter;

  beforeEach(() => {
    workbench = new WorkbenchController();
    adapter = new MockEmbedAdapter();
    supervisor = new EngineSupervisor({ adapter, skipPreflight: true });
  });

  it('provides all 6 scientific recipes with valid code and metadata', () => {
    const recipes = ExampleRegistry.getAll();
    expect(recipes.length).toBe(6);

    const ids = recipes.map((r) => r.id);
    expect(ids).toContain('sine-wave');
    expect(ids).toContain('solve-linear');
    expect(ids).toContain('fft-spectrum');
    expect(ids).toContain('monte-carlo-pi');
    expect(ids).toContain('matrix-eig');
    expect(ids).toContain('poly-fit');

    for (const r of recipes) {
      expect(r.code.length).toBeGreaterThan(10);
      expect(r.svgIcon).toContain('<svg');
    }
  });

  it('launches recipe by booting engine, filling cell, and executing it', async () => {
    const launched = await ExperimentStore.launch('solve-linear', supervisor, workbench);
    expect(launched).toBe(true);
    expect(workbench.mode).toBe('notebook');
    expect(supervisor.state).toBe('idle');

    const cell = workbench.cells[0];
    expect(cell.code).toContain('求解线性方程组');
    expect(cell.status).toBe('success');
  });
});
