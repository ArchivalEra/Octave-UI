# CONTRIBUTING · 工具面贡献规矩

本文件只讲两件事：**什么时候不该加工具**（剪枝判据），以及**决定要加时怎么加**（步骤与硬门）。
它不抄会漂的数字（名册条数、测试数等）——那些由事实系统承载（`FACTS.json` 台账 /
`STATE.md` 机器块），需要引用就查台账，不要在这里手抄。

适用面：`src/modules/plugins/webmcp/`（WebMCP 网桥）的工具面。其他模块的贡献流程不在此文。

---

## 一、先判：这个能力该不该成为一个工具

Spec 用户故事 14 逐字：

> As a 贡献者, I want「新工具能否被 eval 一行表达」作为剪枝审查判据（写在贡献文档）, so that 工具面不无谓生长。

判据一句话：**新工具能否被 `octave_eval` 一行表达？**

四个自检问题：第 1 问是**正面条件**（答「是」= 一行能表达），第 2/3/4 问是**反面条件**（答「是」= 表达不了）。

1. 它是不是**一条 Octave 语句/表达式**，`octave_eval` 现有签名能直接吃下，返回引擎文本输出就够用？
2. 是否需要**跨模块编排**——引擎之外还要动工作区、包管理、OpenModelica 运行时、DOM 状态中的任何一样？
3. 是否需要**多步状态**（例如先解析目录、再下载、再装载、再自检），或需要返回结构化的 `resource` / `application/json` 而不是引擎文本？
4. 是否是**引擎能力之外**的东西（宿主侧服务、文件系统、UI 状态）？

判定：

| 四问结果 | 做法 |
| --- | --- |
| 只有第 1 问答「是」，2/3/4 全「否」 | **不加工具**。调用方直接 `callTool('octave_eval', { code })`。 |
| 2/3/4 中有任一答「是」（即第 1 问已不成立） | 才考虑加工具，进入第二节。 |

两条要钉住的边界：

- **「能强转成一条 eval」不等于「一行能表达」**。如果调用方必须先拿到结构化数据再决定，返回面就不是引擎文本——那是工具的理由，不是 eval 的理由。
- **加工具的正当理由永远是「eval 表达不了」，不是「调用更方便」**。方便是 wire 面的膨胀，代价是所有外部 agent 的工具发现面多一条。

对照现有工具读（按代码实际形状，不是发明）：

- `octave_eval` 是「一行 eval」的落点本身——它的深实现住 `tools/octaveEval.ts`，名册里只占一行；其余能力若也能被它表达，就不该另立工具。
- `octave_get_workspace` / `octave_get_system_state` / `octave_list_packages` 返回 `resource` + `application/json` 结构体，数据来自服务读取（工作区、supervisor 状态、包目录）而非引擎文本——第 3 问答「是」。
- `octave_install_package` 委托包管理服务做 plan/install 并回结构化结果——第 2、3 问答「是」。
- `omc_load_msl` 跨包管理服务、站点同源下载与 omc 运行时编排，还要装后自检——第 2、3、4 问全「是」。

---

## 二、决定要加：加一个新工具的正确形状

Spec 用户故事 7 逐字：

> As a 工具维护者, I want 加一个新工具只动一处（表里加对象+同目录测试）, so that 无须触碰分发/协议/装配代码。

本仓的实际动作面（已按代码数过，不是口号）：

1. **新建工具文件** `src/modules/plugins/webmcp/tools/<toolName>.ts`——一个 `defineTool({ ... })`。
2. **名册加两行** `src/modules/plugins/webmcp/tools/index.ts`——`import { xxxTool } from './xxx';` 一行 + `octaveToolTable` 数组里一项一行。数组顺序 = 旧 `listTools()` 的声明序（它直接映射到 wire 上的顺序，见第四节）。
3. **加测试**——本仓测试统一住 `tests/plugins/`，按工具名族就近放 `tests/plugins/webmcp-<tool>.test.ts`（spec 说的「同目录测试」在本仓的落点就是网桥的测试目录）。

**不需要碰**：`dispatcher.ts`（分发机）、`server.ts`（装配根）、`WebMcpPlugin.ts`（插件壳）、`channels/`（通道实现）、`validate.ts`（参数校验规则从表 schema 生成）。`schema.ts` 只在现有 `args()` builder 表达不了参数形状时才动。

最小骨架：

```ts
// src/modules/plugins/webmcp/tools/myTool.ts
import { defineTool } from '../defineTool';
import { args } from '../schema';

export const myTool = defineTool({
  name: 'my_tool',                // wire 主键（分发机按它查找）
  description: '...',             // wire 描述（listTools 的 description，逐字进 golden）
  parameters: args().build().schema,
  deps: ['supervisor'],           // 运行期要解析的 ctx 键（见第三节）
  run: async (_args, ctx) => {
    return { content: [{ type: 'text', text: '...' }] };
  },
});
```

写 `run` 时的硬约束：

- **`args` 保持 `Record<string, unknown>` 原始面**，类型强转（如 `String(args.code || '')`）在工具体内逐字保留——旧调用零误杀。
- **`ctx` 只暴露 `deps` 声明过的键**（`Pick<WebMcpCtx, D>`）。
- **工具体不 import 领域服务的值**（见第五节）。

---

## 三、deps 能力门：写错在编译期红

`defineTool<D extends keyof WebMcpCtx>`：

- `deps` 声明运行期要解析哪些 ctx 键；
- `run` 收到的 ctx 是 `Pick<WebMcpCtx, D>`——只含声明过的键。

两道门在类型层咬合：

- **dep key 写错**（如 `'superviser'`）⇒ `D` 不满足 `keyof WebMcpCtx` ⇒ 编译期报错；
- **访问未声明的 ctx 键** ⇒ `Pick` 面上没有该键 ⇒ 编译期报错。

活体断言在 `tests/plugins/webmcp-compile-gates.test.ts`（两条 `@ts-expect-error`——门坏了会退化成 "Unused '@ts-expect-error' directive"）。vitest 本身不做类型检查，复跑按文件名定点看 tsc：

```bash
npx tsc --noEmit 2>&1 | grep 'webmcp-compile-gates'
```

期望：**零输出**（两条错误被指令吃掉 = 门在咬合）。

两个可选字段，只在确有必要时声明：

- **`timeoutMs`**：覆盖缺省超时（见第六节）。
- **`capability(ctx) => string | null`**：provision 在册但运行期不可得时返回短原因串 ⇒ `CAPABILITY_UNAVAILABLE` 信封。**适用面只限新路径**（懒加载引擎装载失败 / 服务 boot 中且该工具选择不排队）；既有 octave 工具都不声明它，服务缺席的旧守卫文案一字不变；排队语义的工具同样不声明（booting 排队走旧路径，不报错）。

---

## 四、wire 面变化要登记：名册变化 = wire 变化

`listTools()` 是外部 agent 的工具发现面。**名册加一行 = wire 变化**，按 `src/modules/plugins/webmcp/DEVIATIONS.md` 的流程逐条走，**不许悄悄改 golden**：

1. **在 `DEVIATIONS.md` 增/改条目**：写清适用面、信封（若有）、golden 快照变化清单、反向断言、确认来源。
2. **golden 快照更新与工具注册同一提交**：不许留「工具已在名册、快照还是旧的」窗口期。
3. **逐条显式确认**：一次确认只覆盖该条目列出的工具；名册再变（后续成员、任何新工具族）仍需逐条登记，不是「以后生长免确认」。
4. **反向断言是工具体的一部分**：不可用路径必须响亮失败（不许静默缺席、不许静默成功）。
5. **改口径要引裁定来源**：口径变化要写清是哪条裁定/来信改的，不许自己发明。

判据：`listTools()` 与 `ready.detail.tools` 必须逐字一致（含键序），现有 golden master 测试盯住这一点——加工具后它会红，红了就说明你确实改了 wire 面。

---

## 五、网桥零 import 服务（用户故事 10）

Spec 用户故事 10 逐字：

> As an 架构维护者, I want 网桥目录零 import 具体服务且该规则有 lint/依赖检查钉住, so that 服务依赖全部显式注入可审计。

**工具文件不得 import 领域服务的值。** 服务只允许两种进法：

1. `import type { ... }`——类型面，擦除后无运行期依赖；
2. **经 ctx 注入**——`ctx.supervisor` / `ctx.workspace` / `ctx.packageManager`（在 `deps` 里声明后于 `run` 内取用）。

服务引用的**值面豁免地**只有组合根：`ctx.ts` 的 `resolveCtx`（注入 + `require` 惰性回退）与 `server.ts` / `WebMcpPlugin.ts` 的装配代码。

守卫生效于 `tests/plugins/webmcp-bridge-isolation.test.ts`：递归扫 `dispatcher.ts` / `defineTool.ts` / `tools/` / `schema.ts` / `channels/`，检出任何非 `import type` 的服务 import；检测器自带反向断言（喂一条构造的违规 import 必须被检出）。

**加新服务**：`ctx.ts` 的 `WebMcpCtx` 加一个键 + `resolveCtx` 加一个同名 thunk，工具侧才可以在 `deps` 里声明它。

---

## 六、超时计时：当前含排队，以及未实现的升级路径

当前实现（`dispatcher.ts` 的 `Promise.race` 超时壳）：

- 计时**从调用发起算，含排队**——分发机在 supervisor 之上，看不到「开始执行」的时刻，首版如实承认这一点。
- 缺省 `120_000` 毫秒，表项 `timeoutMs` 可覆盖。
- 超时后底层任务**不被取消**（JS 无取消原语），仍在跑/排着。

超时信封原文（`dispatcher.ts` 的 `TIMEOUT_ENVELOPE_TEXT(name, ms)`，逐字引用，不许自己重写）：

```text
TIMEOUT: tool "${name}" did not finish within ${ms}ms (counting from call initiation, queueing included). The underlying task may still be running or queued — do not blindly retry.
```

信封面含「仍在排队或执行中，勿盲目重试」这层语义，就是这一句的后半段——**超时后底层任务不被取消，调用方不得盲目重试**。

**升级路径（spec B.1 明示「记入贡献文档但不本轮实现」）**：若将来需要「从开始执行计时」，走端口 adapter 暴露「已开始」回调——**动 adapter，不动 supervisor**。

理由（实施仓归属纪律）：`ArchivalEra/Octave-Full-Wasm` 绝对只读，supervisor 的实现归上游；接口需求一律走 GitHub Issue 提单，不在本仓改引擎侧。

---

## 七、提交前

改完工具面后，至少跑：

```bash
# 网桥相关测试（含 golden / 隔离 / 编译门 / 参数校验 / 超时 / 能力门）
CI=true npx vitest run tests/plugins

# 类型门（注意看 webmcp-compile-gates 是否零输出）
npx tsc --noEmit 2>&1 | grep 'webmcp-compile-gates'

# 全量闸门（发现式名录，新增 check_*.py 自动被吃到）
source Einfacht.env && for g in zreflect/check_*.py; do python3 "$g" || exit 1; done
sh gates-selftest.sh
```

提交规范与活状态文档纪律见 [`AGENTS.md`](AGENTS.md)；架构契约与语义边界见 [`CONTEXT.md`](CONTEXT.md)。
