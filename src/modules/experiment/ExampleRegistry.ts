// src/modules/experiment/ExampleRegistry.ts
// 实验画廊静态算法配方注册表：6 组典型科学计算算法

import type { ExperimentRecipe, RecipeId } from './types';

export const RECIPES: ExperimentRecipe[] = [
  {
    id: 'sine-wave',
    titleKey: 'examples.recipe_sine_wave_title',
    descKey: 'examples.recipe_sine_wave_desc',
    category: 'signal',
    expectedOutputKind: 'plot',
    tags: ['Signal', 'Trigonometry', 'Plot'],
    code: `% 1. 生成正弦波与三次谐波合成信号
t = linspace(0, 2*pi, 100);
y1 = sin(t);
y2 = sin(3*t) / 3;
signal = y1 + y2;

% 2. 绘制合成波形
plot(t, signal);
`,
    svgIcon: `<svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20 Q12 4 20 20 T36 20" stroke="#38bdf8" stroke-linecap="round"/></svg>`,
  },
  {
    id: 'solve-linear',
    titleKey: 'examples.recipe_solve_linear_title',
    descKey: 'examples.recipe_solve_linear_desc',
    category: 'algebra',
    expectedOutputKind: 'matrix',
    tags: ['Linear Algebra', 'Equation', 'Matrix'],
    code: `% 求解线性方程组 A * x = b
A = [3, 2, -1; 2, -2, 4; -1, 0.5, -1];
b = [1; -2; 0];

% 使用左除运算符高效求解
x = A \\ b
`,
    svgIcon: `<svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="8" width="12" height="24" rx="2" stroke="#a78bfa"/><path d="M22 20h4m4-4l4 4-4 4" stroke="#a78bfa" stroke-linecap="round"/><rect x="30" y="14" width="6" height="12" rx="1" stroke="#34d399"/></svg>`,
  },
  {
    id: 'fft-spectrum',
    titleKey: 'examples.recipe_fft_spectrum_title',
    descKey: 'examples.recipe_fft_spectrum_desc',
    category: 'signal',
    expectedOutputKind: 'plot',
    tags: ['FFT', 'DSP', 'Frequency'],
    code: `% 快速傅里叶变换 (FFT) 频域谱分析
Fs = 1000;            % 采样率 1000 Hz
t = 0:1/Fs:0.2;       % 采样时长 0.2 秒
f1 = 50; f2 = 120;    % 双频率分量 50Hz 与 120Hz
s = 0.7*sin(2*pi*f1*t) + sin(2*pi*f2*t);

% 计算 FFT
Y = fft(s);
L = length(s);
P2 = abs(Y / L);
P1 = P2(1:floor(L/2)+1);
f = Fs * (0:floor(L/2)) / L;

% 绘制单侧频谱幅值
plot(f, P1);
`,
    svgIcon: `<svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 34 L12 28 L16 34 L22 10 L26 34 L30 18 L34 34" stroke="#f472b6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    id: 'monte-carlo-pi',
    titleKey: 'examples.recipe_monte_carlo_pi_title',
    descKey: 'examples.recipe_monte_carlo_pi_desc',
    category: 'simulation',
    expectedOutputKind: 'scalar',
    tags: ['Monte Carlo', 'Simulation', 'Probability'],
    code: `% 蒙特卡洛随机投点估算圆周率 π
N = 10000;
x = rand(N, 1);
y = rand(N, 1);

% 判断落在单位四分之一圆内的点
inside = (x.^2 + y.^2) <= 1;
pi_estimate = 4 * sum(inside) / N
`,
    svgIcon: `<svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2"><circle cx="20" cy="20" r="14" stroke="#fbbf24"/><circle cx="16" cy="18" r="1.5" fill="#fbbf24"/><circle cx="24" cy="22" r="1.5" fill="#fbbf24"/><circle cx="22" cy="15" r="1.5" fill="#fbbf24"/></svg>`,
  },
  {
    id: 'matrix-eig',
    titleKey: 'examples.recipe_matrix_eig_title',
    descKey: 'examples.recipe_matrix_eig_desc',
    category: 'algebra',
    expectedOutputKind: 'matrix',
    tags: ['Eigenvalues', 'Matrix', 'Decomposition'],
    code: `% 对称矩阵特征值与特征向量分解
M = [4, 1, 2; 1, 3, 0; 2, 0, 5];

% 计算特征向量矩阵 V 与特征值对角阵 D
[V, D] = eig(M)
`,
    svgIcon: `<svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 8v24M30 8v24" stroke="#4ade80" stroke-linecap="round"/><path d="M15 15l10 10m0-10L15 25" stroke="#4ade80" stroke-linecap="round"/></svg>`,
  },
  {
    id: 'poly-fit',
    titleKey: 'examples.recipe_poly_fit_title',
    descKey: 'examples.recipe_poly_fit_desc',
    category: 'statistics',
    expectedOutputKind: 'matrix',
    tags: ['Curve Fitting', 'Polynomial', 'Regression'],
    code: `% 多项式曲线拟合 (2 次抛物线)
x = [1, 2, 3, 4, 5, 6, 7];
y = [1.2, 3.8, 8.9, 16.5, 25.1, 35.8, 49.2];

% 拟合系数 [p2, p1, p0]
p = polyfit(x, y, 2)
`,
    svgIcon: `<svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="30" r="2" fill="#38bdf8"/><circle cx="18" cy="24" r="2" fill="#38bdf8"/><circle cx="26" cy="16" r="2" fill="#38bdf8"/><circle cx="34" cy="8" r="2" fill="#38bdf8"/><path d="M8 32 Q22 26 34 8" stroke="#38bdf8" stroke-dasharray="3 3"/></svg>`,
  },
  {
    id: 'rc-transient',
    titleKey: 'examples.recipe_rc_transient_title',
    descKey: 'examples.recipe_rc_transient_desc',
    category: 'simulation',
    expectedOutputKind: 'plot',
    tags: ['Circuit', 'Transient', 'ODE'],
    code: `% RC 一阶电路充电暂态：欧拉法数值求解 dv/dt = (Vs - v)/(RC)
R = 1000; C = 1e-6; Vs = 5;
tau = R*C;
dt = tau/100;
t = 0:dt:5*tau;
v = zeros(size(t));
for k = 1:length(t)-1
  v(k+1) = v(k) + dt*(Vs - v(k))/tau;
end

% 绘制电容电压，可见 1 tau 时达到约 63.2% 稳态
plot(t*1000, v)
title('RC Charging Transient'); xlabel('t (ms)'); ylabel('vC (V)'); grid on
`,
    svgIcon: `<svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 32 Q10 9 34 9" stroke="#fb7185" stroke-linecap="round"/><path d="M6 34h28M6 34V8" stroke="#475569" stroke-width="1"/></svg>`,
  },
  {
    id: 'rlc-underdamped',
    titleKey: 'examples.recipe_rlc_underdamped_title',
    descKey: 'examples.recipe_rlc_underdamped_desc',
    category: 'simulation',
    expectedOutputKind: 'plot',
    tags: ['Circuit', 'Oscillation', 'Second-Order'],
    code: `% RLC 二阶电路欠阻尼暂态：衰减振荡与指数包络
R = 20; L = 0.01; C = 1e-6; V0 = 5;
alpha = R/(2*L);
w0 = 1/sqrt(L*C);
wd = sqrt(w0^2 - alpha^2);
t = linspace(0, 0.01, 600);
v = V0*exp(-alpha*t).*cos(wd*t);

plot(t*1000, v)
hold on
plot(t*1000, V0*exp(-alpha*t), 'r--')
legend('vC (V)', 'envelope')
title('Underdamped RLC Transient'); xlabel('t (ms)'); grid on
`,
    svgIcon: `<svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20C6 6 8 6 10 20c2 10 4 10 6 0 2-7 4-7 6 0 2 4 4 4 6 0 2-3 4-3 6 0" stroke="#f472b6" stroke-linecap="round"/></svg>`,
  },
  {
    id: 'square-fourier',
    titleKey: 'examples.recipe_square_fourier_title',
    descKey: 'examples.recipe_square_fourier_desc',
    category: 'signal',
    expectedOutputKind: 'plot',
    tags: ['Fourier', 'Harmonics', 'Signal'],
    code: `% 方波的傅里叶级数合成：前 6 个奇次谐波逐项叠加
t = linspace(0, 2*pi, 500);
y = zeros(size(t));
for n = 1:6
  k = 2*n - 1;
  y = y + sin(k*t)/k;
end
y = 4/pi*y;

plot(t, y)
title('Fourier Series of Square Wave'); xlabel('t'); ylabel('y'); grid on
`,
    svgIcon: `<svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 28V12h8v16h8V12h8v16" stroke="#38bdf8" stroke-linejoin="round"/><path d="M6 20c3-8 5-8 8 0s5 8 8 0 5-8 8 0" stroke="#f472b6" stroke-width="1.5" stroke-dasharray="3 3"/></svg>`,
  },
  {
    id: 'sampling-alias',
    titleKey: 'examples.recipe_sampling_alias_title',
    descKey: 'examples.recipe_sampling_alias_desc',
    category: 'signal',
    expectedOutputKind: 'plot',
    tags: ['Sampling', 'Aliasing', 'Nyquist'],
    code: `% 采样定理：欠采样（fs < 2f）导致频率混叠
f = 3; fs = 4;
t = linspace(0, 1.5, 800);
ts = 0:1/fs:1.5;

plot(t, sin(2*pi*f*t))
hold on
plot(ts, sin(2*pi*f*ts), 'ro-')
title('Sampling & Aliasing'); xlabel('t (s)'); ylabel('x'); grid on
`,
    svgIcon: `<svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20Q10 7 16 20T28 20T36 20" stroke="#34d399" stroke-linecap="round"/><circle cx="10" cy="12" r="2" fill="#34d399" stroke="none"/><circle cx="22" cy="28" r="2" fill="#fbbf24" stroke="none"/><circle cx="34" cy="15" r="2" fill="#fbbf24" stroke="none"/></svg>`,
  },
  {
    id: 'hilbert-cond',
    titleKey: 'examples.recipe_hilbert_cond_title',
    descKey: 'examples.recipe_hilbert_cond_desc',
    category: 'algebra',
    expectedOutputKind: 'matrix',
    tags: ['Condition Number', 'Ill-Conditioned', 'Numerics'],
    code: `% 病态矩阵实验：希尔伯特矩阵条件数随阶数暴涨（数值稳定性）
cond_values = zeros(1, 5);
for n = 3:7
  cond_values(n-2) = cond(hilb(n));
end
% 条件数从小到大对应 n = 3..7
cond_values
`,
    svgIcon: `<svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 32V25M17 32V19M25 32V13M33 32V7" stroke="#fbbf24" stroke-width="3" stroke-linecap="round"/><path d="M5 34h30" stroke="#475569" stroke-width="1"/></svg>`,
  },
  {
    id: 'clt-histogram',
    titleKey: 'examples.recipe_clt_histogram_title',
    descKey: 'examples.recipe_clt_histogram_desc',
    category: 'statistics',
    expectedOutputKind: 'plot',
    tags: ['CLT', 'Statistics', 'Histogram'],
    code: `% 中心极限定理：均匀分布样本均值的分布趋近正态
N = 10000; n = 30;
samples = mean(rand(n, N), 1);
hist(samples, 30)
title('CLT: Distribution of Sample Means');
xlabel('sample mean'); ylabel('count'); grid on
`,
    svgIcon: `<svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 32V26h5v6M13 32V20h5v12M20 32V16h5v16M27 32V22h5v10" stroke="#4ade80" stroke-linejoin="round"/><path d="M6 30Q20 6 34 30" stroke="#f472b6" stroke-width="1.5" stroke-dasharray="3 3"/></svg>`,
  },
];

export class ExampleRegistry {
  static getAll(): ExperimentRecipe[] {
    return [...RECIPES];
  }

  static getById(id: RecipeId): ExperimentRecipe | undefined {
    return RECIPES.find((r) => r.id === id);
  }

  static getByCategory(category: string): ExperimentRecipe[] {
    return RECIPES.filter((r) => r.category === category);
  }
}
