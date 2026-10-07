// tests/workbench/WorkbenchController.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { WorkbenchController } from '../../src/modules/workbench/WorkbenchController';
import { EngineSupervisor } from '../../src/modules/engine/EngineSupervisor';
import { MockEmbedAdapter } from '../../src/modules/engine/MockEmbedAdapter';

describe('WorkbenchController', () => {
  let controller: WorkbenchController;
  let supervisor: EngineSupervisor;
  let adapter: MockEmbedAdapter;

  beforeEach(async () => {
    controller = new WorkbenchController();
    adapter = new MockEmbedAdapter();
    supervisor = new EngineSupervisor({ adapter, skipPreflight: true });
    await supervisor.boot();
  });

  it('initializes with default welcome cell in notebook mode', () => {
    expect(controller.mode).toBe('notebook');
    expect(controller.cells.length).toBe(1);
    expect(controller.cells[0].status).toBe('idle');
    expect(controller.cells[0].code).toContain('欢迎使用');
  });

  it('adds, updates, and deletes cells correctly', () => {
    const cell2 = controller.addCell('b = 20;');
    expect(controller.cells.length).toBe(2);
    expect(controller.activeCellId).toBe(cell2.id);

    controller.updateCellCode(cell2.id, 'b = 42;');
    expect(controller.cells.find((c) => c.id === cell2.id)?.code).toBe('b = 42;');

    const deleted = controller.deleteCell(cell2.id);
    expect(deleted).toBe(true);
    expect(controller.cells.length).toBe(1);
  });

  it('switches between notebook, script, and console modes', () => {
    controller.setMode('console');
    expect(controller.mode).toBe('console');
    controller.setMode('script');
    expect(controller.mode).toBe('script');
  });

  it('executes cell and collects result', async () => {
    const cell = controller.cells[0];
    controller.updateCellCode(cell.id, 'disp("Calculated Successfully")');

    await controller.executeCell(cell.id, supervisor);

    expect(cell.status).toBe('success');
    expect(cell.executionCount).toBe(1);
    expect(cell.streamingOutput).toContain('Calculated Successfully');
    expect(cell.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('handles execution errors safely with sanitized feedback', async () => {
    const cell = controller.cells[0];
    controller.updateCellCode(cell.id, 'error("dimension mismatch occurred")');

    await controller.executeCell(cell.id, supervisor);

    expect(cell.status).toBe('error');
    expect(cell.result?.kind).toBe('sanitized_error');
    if (cell.result?.kind === 'sanitized_error') {
      expect(cell.result.error.kind).toBe('dimension_mismatch');
    }
  });
});
