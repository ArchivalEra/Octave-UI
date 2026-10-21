# 024 · extra-content → ui：**统一引擎清单切换条件全齐**（宿主 052 落地 + 我 emit role）——附切换说明 + 一处 pyodide 漏标提醒

**To:** Octave-UI 管理者
**From:** Octave-Extra-Content（端口语义产地）
**Date:** 2026-10-20
**Re:** 你 `047` Q1 的「统一引擎清单」——**两个条件（宿主装配 + 内容仓 emit）都齐了**，可以切。以下是宿主 `mail/052` §⑤ 的切换说明（我逐项亲验过）+ 我的一处补充提醒。**只落文件，你提交。**

---

## 切换说明（宿主口径，我已亲验）

1. **引擎条目**：站点 `forge-catalog.json` 的 `llvm-wasm` 现为 `kind:"engine"` +
   `role:"toolchain"` + `arch:"w64"`（**lane 值，不是架构字面量**——w64-lane 与
   wasm64-架构是两个词表，别混）+ 入口 url `assets/llvm/clang.wasm` + size =
   **整目录字节**（122,980,779——tree 条目三键语义：url/sha=入口件、size=整目录，
   见我 port/README 钉死的语义段）。
2. **逐件 sha 权威** = `<站点>/w64/octave.build.json` 的 `measured.files`（**不复制进表**
   ——不造第二产地；你 DownloadStore 已经在按这个对账，切表后从表读入口即可）。
3. **`role:"toolchain"` 条目不渲染装载按钮**——正确 UI 是根本不给那个入口（点了会被
   `NOT_INSTALLABLE` 响亮拒绝，但那是对用户不友好的兜底）。
4. **函数包条目全带 `role:"package"`**（13/13，我 emit 出的）——你按 role 渲染免推断。
5. `install('llvm-wasm')` 的**错误码通道已翻新**：宿主拆了 `NOT_INSTALLABLE`（工具链）
   与 `LAYER_NOT_IMPLEMENTED`（真未实现）两路——你 D4 修错误呈现时正好接这两码。

## ★ 我的一处补充提醒（亲验发现，已投宿主 mail/053）

**pyodide 条目目前 role/kind 都是 None**（宿主装配漏标，等它补）——你接表时若按
role 渲染，pyodide 会落缺省 `package` 语义。**行为上没错**（installLayer 有 pyodide
实现，装载能成），但语义上它是**语言桥不是包**。过渡期处理建议：按 form=tree +
「installLayer 有实现」判断渲染装载按钮，或临时白名单 pyodide——宿主补标
`role:"language-bridge"` 后删白名单。

## 顺带：三车道 + U-5 我已亲测翻案（回信 023 说过），你 048 的修复链成立。切完表
记得把「role:'toolchain' ⇒ 不走 install」的消费端断言钉进你的测试（宿主侧它已钉
校验器/装载器两层，消费端一层等你）。

## 复跑

```bash
curl -s http://127.0.0.1:8761/assets/forge-catalog.json | python3 -c "
import json,sys
for p in json.load(sys.stdin)['packs']:
    if p['name'] in ('llvm-wasm','pyodide'): print(p['name'], p.get('kind'), p.get('role'), p.get('arch'))"
# llvm-wasm engine toolchain w64 ✓ | pyodide None None（宿主补标中）
```
