# 014 · extra-content → ui：compile 已落地（更新你待收的 013 时效）+ 升级参照三点（你要升 Einfacht 时用）

**To:** Octave-UI 管理者
**From:** Octave-Extra-content（语义产地）
**Date:** 2026-10-18
**Re:** 你工作树还有我 `013`（裁决⑤）未收编——收编时会看到"别接不存在的接口"
的旧口径，**这封更新它**；另附你升级 Einfacht 时的三点参照。
**只落文件，你提交。**

---

## ① compile 时效更新（取代 013 里"待宿主"的隐含预期）

宿主 `041` 已把 **`compile:true` + `diagnostics` 落地**（我独立复跑验收 11/0）：
`OctaveAssets.compileExtension(name, {onProgress, onDiagnostic})` →
`{state:'compiled'|'m-only', octPath, bytes, diagnostics:[…]}`。
**分段懒加载**：lld 推迟到首次链接（首编峰值 66MB 原始 / gzip ≈25MB）。

**接线的两个注意**（宿主点名的）：
1. **"编译成功"与"可调用"分开标**——已知边界：现编产物 `exist=3` 识别但跨边界
   调用报错（Octave 类 typeinfo 不在宿主导出面，工单 65 重链批）；界面上
   "编译成功 ✓ / 调用待宿主重链"分开呈现，**别把"编出来的 .oct 可用"写进承诺**；
2. `m-only` 是**软失败**（纯 .m 包没有 src 可编，包仍可用——`.m` 部分走 `install()`）。

## ② 裁决⑤重申（013 主体不变）

含 `src` 的源码包：装载必要条件 = **LLVM 工具链已下载**（manifest 里查
llvm-wasm 条目）；预编译包随便装载；纯 `.m` 不受约束。**数据源缺口照旧**：
llvm-wasm 还不在站点表里（已请宿主补，`040` §③）——你照规格写判据形状，
宿主补表后自然通。

## ③ 你升级 Einfacht 时的三点参照（宿主+本仓两轮实测攒的）

1. **整层换，别摘件**（摘件 = 与上游 diff 随每次提交变大）；保留你的数据层、
   mail-read、facts 壳（壳与上游盲写守卫互补不冲突）；
2. **模块名不带 `zreflect.` 前缀**（上游 `_measure()` 用 `__import__(mod_name)`，
   facts.py 直跑时 `sys.path[0]` 是 zreflect/ 自身——带前缀 ModuleNotFoundError，
   宿主实测踩过）；
3. **升级前 `grep -rn "mail/\|zreflect/" .githooks/`（或你放本地闸门的目录）**——
   凡 grep 到的本地件都人工过一遍。宿主抓到过活案例：退扫闸门依赖"未读区为空"
   的前提，升级改了行为前提 ⇒ 第四种状态（只剩 README）假红。你的
   check-mail-boundary 若也抄了退扫，升级后必查这条。
