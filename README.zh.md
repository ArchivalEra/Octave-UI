# Octave-UI（中文）

**Languages / 语言 / Sprachen**: [English](README.md) · [中文](README.zh.md) · [Deutsch](README.de.md)

本文件与 `README.md`（英语，默认）、`README.de.md`（德语）是**同一条断言的三份拷贝**。
三语同步由 `zreflect/check_readme_sync.py` 在每次推送时判死：任何一份改动集缺另外两份即拒推。

> 💡 **开发者 / AI 开工指引**：请先阅读 [maintaince.md](maintaince.md) 了解项目地图与开发方向；
> 测出来的现状由事实系统承载（`STATE.md` + `FACTS.json`），使用方法看 `README.md`，
> 契约边界看 `CONTEXT.md`。

## 核心特性与架构原则（与英文版逐条对应）

- **纯客户端计算与静态交付**：不引入任何后端计算服务或代理；交付物仅为纯静态文件与预压缩包。
- **上游引擎绝对只读**：`ArchivalEra/Octave-Full-Wasm` 保持绝对只读，接口需求与技术建议一律走 GitHub Issues 提单。
- **双契约分工**：引擎契约（上游 ↔ UI）与内容契约（`Octave-Extra-Content` ↔ UI，经 `mail/` 通道）严格区分；
  机器表由宿主装配至同源站点货架。
- **下载与装载彻底解耦**（站点特色）：下载（写 OPFS 沙箱）与装载（载入运行时）是两个独立动作，
  装载期只读盘、零网络；多档引擎可预下载而不实例化。
- **市场零手写选项**：版本 / 形态 / 架构 / 消费者 / 依赖 / 校验 / 路径 / 编码 / 包列表全部由
  内容契约、分发契约、引擎契约投影，市场代码不出现任何选项字面量。
- **两个互不影响深模块**：市场（投影与决策）与 OPFS（落盘、记账、物理对账）之间零类型依赖、
  零注入谓词，只经一个由契约投影的冻结值对象在组合根串联。
- **三路同轴**：用户按钮、WebMCP 一次调用、测试断言走同一条「一次直达」缝；
  引擎 lazy-boot 唯一产地，不要求用户先点「开始计算」。
- **深模块架构**：会话队列、终端零双重回显、图形边界防崩屏障各自把复杂度藏在窄接口后。
- **OPFS 工业标准持久沙箱工作区**：导入 → OPFS 持久工作区 → 导出；三通道导入与 MEMFS 双向二进制桥接，
  `Uint8Array` 透传防止数据损坏；纯内存回落。
- **可插拔插件与包管理**：插件注册架构、算术排版、画廊检索、图形外挂、包管理面板均按契约接线；
  编译诊断抽屉与配额预演沿用四态 verdict，不塌陷失败。

## 验收与纪律

仓级铁律、七条纪律、提交前闸门与发现式名录见 [AGENTS.md](AGENTS.md)。
数字只认实测、只生产一次；断言必须可证伪并配反向断言；活状态文档只写实测；
改任何一份 README 必须三份同批（pre-push 与 CI 同判据）。

**2026-11-07「额叶切除」**：机制层整层换成上游 Einfacht `b580052`（`zreflect/` 33 个 py + `lang/` 语言包 + 钩子入口 `gate.py` / `install.py` + `harness.py`）。本仓 22 道领域判据因新版 `check_i18n` 本体零语言制度移到 `gates/`，由混合 `pre-commit` 壳逐道执行；事实数据层移到仓根 `measure_octave_ui.py`（`FACTS.json` 22 条事实 / 14 条 witness 零改动），`facts.py` 壳负责分派与 PYTHONPATH。三语 README 同步判据、`[[键名]]`、`AUTO:` 机器块全部保留。提交前先跑 `python3 zreflect/registry.py --run commit`，再跑 `./reflect-hooks/pre-commit`。详见 `questions/03-einfacht-b580052-lobotomy.md`。

完整英文正文（默认）见 [README.md](README.md)，德文见 [README.de.md](README.de.md)。
