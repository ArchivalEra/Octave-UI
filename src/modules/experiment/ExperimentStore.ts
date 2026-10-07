// src/modules/experiment/ExperimentStore.ts
// 实验画廊动作调度器：串联引擎预热、影子绘图安装、Notebook 模式切换与首个单元格执行

import type { RecipeId, ExperimentRecipe } from './types';
import { ExampleRegistry } from './ExampleRegistry';
import type { EngineSupervisor } from '../engine/EngineSupervisor';
import type { WorkbenchController } from '../workbench/WorkbenchController';
import { SafePlotSinkPolyfill } from '../semantic/SafePlotSinkPolyfill';

export class ExperimentStore {
  static getRecipes(): ExperimentRecipe[] {
    return ExampleRegistry.getAll();
  }

  static getRecipe(id: RecipeId): ExperimentRecipe | undefined {
    return ExampleRegistry.getById(id);
  }

  static async launch(
    id: RecipeId,
    supervisor: EngineSupervisor,
    workbench: WorkbenchController
  ): Promise<boolean> {
    const recipe = ExampleRegistry.getById(id);
    if (!recipe) return false;

    // 1. 切换到 Notebook 工作台模式
    workbench.setMode('notebook');

    // 2. 引擎按需预热与 Safe Plot 影子安装
    if (supervisor.state === 'unloaded') {
      try {
        await supervisor.boot();
      } catch (err) {
        console.error('Failed to boot engine for experiment:', err);
        return false;
      }
    }
    SafePlotSinkPolyfill.install(supervisor);

    // 3. 填充单元格：如果当前仅有一个且内容为空/默认，直接复用，否则追加新单元格
    let targetCell = workbench.cells[0];
    if (
      workbench.cells.length === 1 &&
      (targetCell.status === 'idle' || targetCell.code.trim().length === 0)
    ) {
      workbench.updateCellCode(targetCell.id, recipe.code);
    } else {
      targetCell = workbench.addCell(recipe.code);
    }

    // 4. 执行该单元格
    await workbench.executeCell(targetCell.id, supervisor);
    return true;
  }
}
