// src/modules/i18n/locales/zh-Hans.ts
// 简体中文语言字典
import type { LocaleDictionary, EnsureParity } from '../types';

const _zhHans = {
  // Brand / Header
  'header.title': 'GNU Octave 11.3.0',
  'header.badge_wasm64': 'Wasm64',
  'header.select_language': '语言',
  'header.theme_light': '☀️ 浅色',
  'header.theme_dark': '🌙 深色',
  'header.theme_tooltip': '切换浅色/深色主题',
  'header.sidebar_hide': '⇥ 隐藏侧栏',
  'header.sidebar_show': '⇤ 展开侧栏',
  'header.sidebar_tooltip': '切换侧边栏',

  // Status badges
  'status.unloaded': '未就绪',
  'status.booting': '启动中…',
  'status.idle': '就绪 (Idle)',
  'status.busy': '计算中…',
  'status.aborting': '中断中…',
  'status.crashed': '已崩溃 (Crashed)',
  'status.recovering': '恢复中…',
  'status.failed': '不可用 (Failed)',
  'status.error': '错误',

  // Actions
  'action.boot': '启动引擎 (Boot)',
  'action.boot_tooltip': '按需加载 WebAssembly 内核',
  'action.interrupt': '中断 (Interrupt)',
  'action.interrupt_tooltip': '协作式安全点中断',
  'action.kill': '强制杀死 (Kill)',
  'action.kill_tooltip': '强制杀死假死引擎',
  'action.recover': '原地恢复 (Recover)',
  'action.recover_tooltip': '原地自愈恢复引擎',

  // Terminal
  'terminal.aria_label': 'Octave 终端',
  'terminal.err_crashed': "\x1b[31m[错误] 引擎当前处于 '{state}' 状态。请先点击「原地恢复」自愈引擎。\x1b[0m\n",
  'terminal.warn_aborting': "\x1b[33m[提示] 引擎正在中断中，请等待中断完成或点击「强制杀死」。\x1b[0m\n",
  'terminal.warn_booting': "\x1b[33m[提示] 引擎正在启动中，请稍候…\x1b[0m\n",
  'terminal.warn_recovering': "\x1b[33m[提示] 引擎正在恢复中，请稍候…\x1b[0m\n",
  'terminal.warn_not_ready': "\x1b[33m[提示] GNU Octave 引擎尚未启动，请点击右上角「启动引擎」按钮加载。\x1b[0m\n",
  'terminal.banner_aborting': '⚠️ 正在尝试中断计算… 若引擎挂起死锁，可执行硬终止：',
  'terminal.banner_crashed': '💥 引擎已崩溃 (诱因: {cause})，命令历史与输出已保留。',
  'terminal.banner_failed': '🛑 熔断器已触发：连续恢复失败已达上限，引擎处于不可用终端态。',
  'terminal.retry_unstarted': '重新填入未启动命令: {code}',

  // Sidebar Tabs
  'sidebar.tab_workspace': '工作区',
  'sidebar.tab_files': '文件',
  'sidebar.tab_history': '历史',
  'sidebar.tab_docs': '文档',

  // Workspace
  'workspace.title': '变量表 ({count})',
  'workspace.refresh': '刷新',
  'workspace.empty': '当前工作区暂无变量',
  'workspace.col_name': '名称',
  'workspace.col_type': '类型',
  'workspace.col_dimensions': '尺寸',
  'workspace.col_size': '大小',

  // Files
  'files.path': '路径: {path}',
  'files.refresh': '刷新',
  'files.empty': '目录为空',
  'files.download': '下载',
  'files.delete': '删除',

  // History
  'history.search_placeholder': '搜索命令历史…',
  'history.clear': '清空',

  // Docs
  'docs.search_placeholder': '输入函数名 (例如 magic, svd)…',
  'docs.query': '查询',
  'docs.querying': '查询中…',
  'docs.loading_state': '正在通过带外通道静默查询…',
  'docs.empty_state': '输入 Octave 函数名以获取离线/内省帮助文档',
  'docs.error': '查询失败: {error}',

  // Boot Modal
  'boot.title': '启动 GNU Octave 引擎',
  'boot.desc': '本项目为 100% 纯客户端本地计算。所有矩阵运算与科学计算均在浏览器端直接执行，无需任何后端计算服务器。',
  'boot.engine_version_label': '引擎版本：',
  'boot.runtime_mode_label': '运行档位：',
  'boot.runtime_mode_val': 'Wasm64 多线程档 (Memory64 + Pthreads)',
  'boot.asset_size_label': '资产体量：',
  'boot.asset_size_val': '~40.6 MB (Wasm 30.9MB + Data 9.7MB，按需单次加载)',
  'boot.data_privacy_label': '数据隐私：',
  'boot.data_privacy_val': '代码与数据完全驻留本机内存与 IDBFS，不向云端外传',
  'boot.status_ready': '准备就绪，点击下方按钮开始按需加载。',
  'boot.status_checking': '正在校验跨源隔离 (COI) 与 Memory64 支持…',
  'boot.status_starting': '正在启动 64 位 WebAssembly 内核与初始化会话…',
  'boot.status_success': 'GNU Octave 11.3.0 就绪！',
  'boot.status_failed': '启动失败，请检查浏览器控制台或网络配置。',
  'boot.cancel': '取消',
  'boot.start': '立即启动引擎',
  'boot.starting': '正在启动…',

  // Figure Warning Modal
  'figure.title': '⚠️ E6 GL 绘图边界安全拦截',
  'figure.default_reason': '已拦截图形绘制调用以防止 WebAssembly 解释器崩溃。',
  'figure.details_title': '边界与能力策略背景（CapabilityPolicy）：',
  'figure.details_p1': '在 GNU Octave WebAssembly 的 Embed 架构中，OpenGL/WebGL 纹理管线处于 E6 边界阶段，当前运行环境尚未就绪 WebGPU 离屏图形管线。调用 plot() 或 drawnow 可能触发底层 WebGL 纹理容器空指针异常。',
  'figure.details_p2': 'EngineSupervisor 将为执行中异常提供自愈熔断保护，但建议在图形通道就绪前优先在脚本中输出数据或使用 GraphicsSink 安全离屏槽。',
  'figure.btn_cancel': '安全取消（推荐）',
  'figure.btn_force': '强制执行（高风险）',
} as const;

export const zhHans: EnsureParity<typeof _zhHans> & LocaleDictionary = _zhHans;
