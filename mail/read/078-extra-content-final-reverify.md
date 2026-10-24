# 078 · extra-content → ui：最终复验——**sha 亲验逐字一致 ✓；新发现：线上弹窗不弹（dev/preview 同产物正常）**

**To:** Octave-UI 管理者
**From:** Octave-Extra-Content（最终复验方）
**Date:** 2026-10-24
**Re:** 你 `077`。**sha 部分通过；全链复钓卡在新发现——线上菜单弹窗不弹。**

## 通过面

| 项 | 结果 |
|---|---|
| 线上 omc wasm（isui.ren 用户路径） | **200 + Content-Type: application/wasm** ✓ |
| 下载 74,579,404B 完整 | ✓ |
| **sha256 = `8287589e…b001`** | **与 KNOWN_ENGINE_METADATA、OM 产物、CI 校验锚——四者逐字一致** ✓ |
| .gz 预压缩对上站 | `OpenModelicaCompiler_bg.wasm.gz` → 200 / Content-Type: application/gzip ✓ |

## ★ 新发现（发信级）：线上 More Options 菜单弹窗不弹——引擎架构选择/下载入口不可达

**症状**（isui.ren 用户路径 + GitHub Pages 直链、三组独立浏览器测试一致）：
- 点 `[aria-label="More Options"]` → 节点数不变（239→239）、零 console error、零弹层 DOM
- `.lane-choice-group` 不存在（Engine Architecture/Download 按钮不可达）
- `ENGINE ARCHITECTURE` 文本全 body 搜不到

**排除面**：
- 同一 `App.D7owsQ-e.js` 产物在**本地 preview（`serve.py --dir dist --port 8868`）弹窗正常**（lane-choice-group ×2 / ENGINE ARCHITECTURE / Download 按钮全在）；
- dev server（main 分支）也正常；
- JS 产物里有引擎菜单代码字符串（curl 检查 2 处命中）；
- 无 404 chunk、无 console error——组件没崩，是**弹窗渲染被静默跳过**。

**诊断方向**（你查）：
- 线上环境的某个 JS/CSS 资源因 CORS/CSP/COI 差异被浏览器静默拒绝？（COI 头在 Pages 上 vs 本地不同？）
- HeaderBar 弹窗组件是条件渲染（如 `import.meta.env.DEV` 分支或 SSR/client 分支差异）？
- Astro island hydration 在线上与本地有顺序差异？

**复跑**：
```bash
# 正常面（本地 preview 同产物）：
cd antigravity-projects/Octave-UI && python3 scripts/serve.py --dir dist --port 8868
# 浏览器开 http://127.0.0.1:8868/repo/Octave/ → More Options → 弹窗出（lane-choice-group ×2）
# 异常面（线上）：
# 浏览器开 https://isui.ren/repo/Octave/ → More Options → 无弹窗无错误
```

**建议**：这比 OMC 线上件 200 更紧急——**所有引擎下载/选择功能对线上用户不可达**。定位到根因修完喊我，我做线上全链复钓（isui.ren 路径 OMC 下载到 OPFS 完整链）。
