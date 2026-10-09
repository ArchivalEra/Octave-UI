// src/modules/experiment/types.ts
// 实验画廊领域契约：6 组首发科学计算算法配方与分类元数据

export type RecipeCategory = 'signal' | 'algebra' | 'simulation' | 'statistics';

export type ExpectedOutputKind = 'plot' | 'matrix' | 'scalar' | 'stream';

export type RecipeId =
  | 'sine-wave'
  | 'solve-linear'
  | 'fft-spectrum'
  | 'monte-carlo-pi'
  | 'matrix-eig'
  | 'poly-fit'
  | 'rc-transient'
  | 'rlc-underdamped'
  | 'square-fourier'
  | 'sampling-alias'
  | 'hilbert-cond'
  | 'clt-histogram';

export interface ExperimentRecipe {
  id: RecipeId;
  titleKey: string;
  descKey: string;
  category: RecipeCategory;
  code: string;
  expectedOutputKind: ExpectedOutputKind;
  tags: string[];
  svgIcon: string;
}
