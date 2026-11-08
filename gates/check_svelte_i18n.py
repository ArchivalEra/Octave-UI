#!/usr/bin/env python3
"""i18n 硬编码闸门（Einfacht 质量闸门）。

防止全站界面文字出现未随语言选项变化的硬编码中文字符串。
所有用户可见文本必须经由 `$i18n.t('...')` / `t('...')` 国际化系统调度，
支持英语（en）、简体中文（zh-Hans）和德语（de）。

规则：
  - 扫描 `src/components/` 下所有 `.svelte` 组件源码；
  - 过滤代码注释（HTML 注释 `<!-- ... -->`、JS/TS 注释 `//` 与 `/* ... */`）；
  - 严禁在模板正文或脚本逻辑中遗留硬编码中文字符；
  - 零值守卫：组件清单为空 ⇒ 报（空输入不是通过）。

用法（直接跑，cwd=仓库根）：
    python3 zreflect/check_i18n.py [--selftest]
退出码：0=绿 / 1=发现问题 / 2=配置坏或零值守卫触发。
"""
from __future__ import annotations

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gate import fatal, finish, main_selftest_or, meta, off, repo, require_nonempty, selftest  # noqa: E402

CHINESE_CHAR_RE = re.compile(r"[\u4e00-\u9fff]")
BLOCK_COMMENT_RE = re.compile(r"<!--.*?-->|/\*.*?\*/", re.DOTALL)
LINE_COMMENT_RE = re.compile(r"//.*$")


def strip_comments(text: str) -> list[tuple[int, str]]:
    """去除块注释和行注释，返回 (行号, 清洗后文本) 清单（1-based）。"""
    # 替换块注释为等量换行符以保持行号一致
    def repl(match):
        return "\n" * match.group(0).count("\n")

    cleaned_text = BLOCK_COMMENT_RE.sub(repl, text)
    result = []
    for line_idx, line in enumerate(cleaned_text.splitlines(), start=1):
        line_clean = LINE_COMMENT_RE.sub("", line).strip()
        result.append((line_idx, line_clean))
    return result


def problems(files: dict[str, str]) -> list[str]:
    """纯函数：返回问题清单（空 = 绿）。自证期间不许 print。"""
    if not files:
        return ["组件清单为空 —— 空清单不是通过（零值守卫）"]

    out = []
    for rel_path, content in sorted(files.items()):
        lines = strip_comments(content)
        for line_no, line_text in lines:
            if not line_text:
                continue
            matched = CHINESE_CHAR_RE.findall(line_text)
            if matched:
                sample = "".join(matched[:8])
                out.append(
                    "DRIFT: %s:%d 包含未国际化的硬编码中文（如 %r）：%s"
                    % (rel_path, line_no, sample, line_text[:60])
                )

    return out


def _cases():
    good_svelte = (
        "<script>\n"
        "  // 这是中文注释，应当被豁免\n"
        "  /* 这也是中文块注释，\n"
        "     跨行也应当被豁免 */\n"
        "  import { t } from '../modules/i18n';\n"
        "</script>\n"
        "<!-- HTML 模板中的中文注释也豁免 -->\n"
        "<div class=\"title\">{t('app.title')}</div>\n"
    )
    bad_template = (
        "<div class=\"card\">\n"
        "  <span>确定</span>\n"
        "</div>\n"
    )
    bad_script = (
        "<script>\n"
        "  const msg = '操作失败';\n"
        "</script>\n"
    )

    return [
        # ① 正常不报
        ("标准 i18n 引用且注释含中文 ⇒ 不报",
         lambda: problems({"Good.svelte": good_svelte}) == []),
        # ② 该报的必须报
        ("★ 模板中出现硬编码中文 <span>确定</span> ⇒ 必须报",
         lambda: any("确定" in p for p in problems({"BadTpl.svelte": bad_template}))),
        ("★ 脚本逻辑中出现硬编码中文 '操作失败' ⇒ 必须报",
         lambda: any("操作失败" in p for p in problems({"BadScript.svelte": bad_script}))),
        # ③ 空输入必须报
        ("★ 组件清单为空 ⇒ 必须报（零值守卫）",
         lambda: problems({}) != []),
    ]


def run(argv):
    comp_dir = repo("src", "components")

    if not os.path.isdir(comp_dir):
        return off("未启用（src/components 目录不存在）")

    files = {}
    for root, _, filenames in os.walk(comp_dir):
        for f in filenames:
            if f.endswith(".svelte"):
                full_p = os.path.join(root, f)
                rel_p = os.path.relpath(full_p, repo())
                try:
                    files[rel_p] = open(full_p, encoding="utf-8").read()
                except OSError as e:
                    return fatal("读取组件文件 %s 失败：%s" % (rel_p, e))

    try:
        require_nonempty("i18n 硬编码闸门", files.keys(), "Svelte 组件清单")
    except SystemExit as e:
        return fatal(str(e))

    probs = problems(files)
    return finish(
        "i18n 硬编码闸门",
        probs,
        "i18n 硬编码闸门：OK（%d 个组件无硬编码中文）" % len(files)
    )


GATE = meta(
    "i18n 硬编码闸门",
    "检查 Svelte 组件中未国际化的硬编码中文字符串",
    knobs=(),
)

if __name__ == "__main__":
    sys.exit(main_selftest_or(sys.argv, "check_i18n", _cases, run))
