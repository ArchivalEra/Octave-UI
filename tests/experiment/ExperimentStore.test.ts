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

  it('provides all 12 scientific recipes with valid code and metadata', () => {
    const recipes = ExampleRegistry.getAll();
    expect(recipes.length).toBe(12);

    const ids = recipes.map((r) => r.id);
    expect(ids).toContain('sine-wave');
    expect(ids).toContain('solve-linear');
    expect(ids).toContain('fft-spectrum');
    expect(ids).toContain('monte-carlo-pi');
    expect(ids).toContain('matrix-eig');
    expect(ids).toContain('poly-fit');
    expect(ids).toContain('rc-transient');
    expect(ids).toContain('rlc-underdamped');
    expect(ids).toContain('square-fourier');
    expect(ids).toContain('sampling-alias');
    expect(ids).toContain('hilbert-cond');
    expect(ids).toContain('clt-histogram');

    for (const r of recipes) {
      expect(r.code.length).toBeGreaterThan(10);
      expect(r.svgIcon).toContain('<svg');
      // 确保配方代码块中不含任何 % 或 # 注释字符
      expect(r.code).not.toMatch(/%|#/);
    }
  });

  it('launches recipe by booting engine, creating dedicated cell, and executing it', async () => {
    const initialCellId = workbench.cells[0].id;
    const launched = await ExperimentStore.launch('solve-linear', supervisor, workbench);
    expect(launched).toBe(true);
    expect(workbench.mode).toBe('notebook');
    expect(supervisor.state).toBe('idle');

    // 验证不再覆盖 1 号默认单元格，而是追加新单元格
    expect(workbench.cells.length).toBe(2);
    expect(workbench.cells[0].id).toBe(initialCellId);
    expect(workbench.cells[0].code).toContain('A \\ b'); // 默认模板代码不受破坏覆盖

    const targetCell = workbench.cells[1];
    expect(targetCell.code).toContain('x = A \\ b');
    expect(targetCell.code).not.toMatch(/%|#/);
    expect(targetCell.status).toBe('success');
  });

  it('launches recipe into ProjectWorkspace by appending dedicated cell', async () => {
    const { ProjectWorkspace } = await import('../../src/modules/workspace/ProjectWorkspace');
    const { VirtualMemoryDirectoryAdapter } = await import('../../src/modules/workspace/DirectoryAdapter');
    const pw = new ProjectWorkspace(supervisor, new VirtualMemoryDirectoryAdapter());
    const initialCellId = pw.cells[0].id;
    const launched = await ExperimentStore.launch('monte-carlo-pi', supervisor, pw);
    expect(launched).toBe(true);
    expect(pw.mode).toBe('notebook');

    // 验证 ProjectWorkspace 同样追加新单元格
    expect(pw.cells.length).toBe(2);
    expect(pw.cells[0].id).toBe(initialCellId);

    const targetCell = pw.cells[1];
    expect(targetCell.code).toContain('pi_estimate');
    expect(targetCell.code).not.toMatch(/%|#/);
    expect(targetCell.status).toBe('success');
  });
});
