#!/usr/bin/env python3
"""主题变量与硬编码颜色闸门（Einfacht 质量闸门）。

全站样式严格遵守 `src/styles/theme.css` 定义的语义化 Design Tokens。
本闸门防止两类回归：
  1. 幻影变量泄漏（Ghost Variables）：如 `--bg-primary`、`--text-primary`、
     `--border-color` 等未在 `theme.css` 中声明的幽灵变量。此类变量在明暗主题
     切换时会静默退回硬编码回退值甚至透明，导致严重的可读性 bug；
  2. 裸十六进制颜色（Naked Hex）：禁止在组件 `<style>` 中使用裸 `#rrggbb` 颜色，
     确保所有颜色都经由主题系统调度。

零值守卫：组件清单为空 ⇒ 报（空输入不是通过）。
自证：--selftest 包含正常不报 / 幻影变量必须报 / 裸色必须报 / 空输入必须报。

用法（直接跑，cwd=仓库根）：
    python3 zreflect/check_theme_tokens.py [--selftest]
退出码：0=绿 / 1=发现问题 / 2=配置坏或零值守卫触发。
"""
from __future__ import annotations

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gate import fatal, finish, main_selftest_or, meta, off, repo, require_nonempty, selftest  # noqa: E402

STYLE_BLOCK_RE = re.compile(r"<style[^>]*>(.*?)</style>", re.DOTALL)
CSS_COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)
HEX_COLOR_RE = re.compile(r"(#[0-9a-fA-F]{3,8})\b")
VAR_USAGE_RE = re.compile(r"var\((--[a-zA-Z0-9_-]+)")
VAR_DECL_RE = re.compile(r"(--[a-zA-Z0-9_-]+)\s*:")

KNOWN_GHOST_VARS = {
    "--bg-primary",
    "--bg-secondary",
    "--bg-card",
    "--border-color",
    "--text-primary",
    "--text-secondary",
    "--accent-color",
}


def extract_declared_vars(theme_css_content: str) -> set[str]:
    """从 theme.css 提取所有已声明的 CSS 自定义属性名。"""
    return set(VAR_DECL_RE.findall(theme_css_content))


def problems(files: dict[str, str], declared_vars: set[str] | None = None) -> list[str]:
    """纯函数：返回问题清单（空 = 绿）。自证期间不许 print。"""
    if not files:
        return ["组件清单为空 —— 空清单不是通过（零值守卫）"]

    out = []
    for rel_path, content in sorted(files.items()):
        # 1. 扫描使用的 CSS 变量（全文件扫描）
        used_vars = set(VAR_USAGE_RE.findall(content))
        # 检查是否使用了已知幽灵变量
        used_ghosts = sorted(used_vars & KNOWN_GHOST_VARS)
        if used_ghosts:
            out.append(
                "DRIFT: %s 使用了被禁用的幽灵变量（未在 theme.css 声明）：%s"
                % (rel_path, ", ".join(used_ghosts))
            )

        # 若提供了 declared_vars，进行完备性核对
        if declared_vars is not None:
            undeclared = sorted(v for v in used_vars if v not in declared_vars)
            if undeclared:
                out.append(
                    "DRIFT: %s 使用了未在 theme.css 中声明的变量：%s"
                    % (rel_path, ", ".join(undeclared))
                )

        # 2. 检查 <style> 块中的裸十六进制颜色
        style_blocks = STYLE_BLOCK_RE.findall(content)
        for s in style_blocks:
            s_clean = CSS_COMMENT_RE.sub("", s)
            hex_matches = sorted(set(HEX_COLOR_RE.findall(s_clean)))
            if hex_matches:
                out.append(
                    "DRIFT: %s <style> 包含未受主题管理的裸十六进制颜色：%s"
                    % (rel_path, ", ".join(hex_matches))
                )

    return out


def _cases():
    declared = {"--bg-canvas", "--bg-surface", "--text-main", "--text-muted", "--accent-primary"}
    good_svelte = (
        "<script>\nlet x = 1;\n</script>\n"
        "<div class=\"btn\">{#each items as item}<span>{item}</span>{/each}</div>\n"
        "<style>\n"
        "  /* 注释里的 #ffffff 应该被忽略 */\n"
        "  .btn { background: var(--bg-surface); color: var(--text-main); }\n"
        "</style>"
    )
    bad_ghost = (
        "<style>\n"
        "  .btn { background: var(--bg-primary); }\n"
        "</style>"
    )
    bad_hex = (
        "<style>\n"
        "  .btn { color: #ff0000; }\n"
        "</style>"
    )
    bad_undeclared = (
        "<style>\n"
        "  .btn { color: var(--some-random-unknown-token); }\n"
        "</style>"
    )

    return [
        # ① 正常不报
        ("标准主题变量且注释含 hex ⇒ 不报",
         lambda: problems({"Good.svelte": good_svelte}, declared) == []),
        # ② 该报的必须报
        ("★ 包含已知幽灵变量 --bg-primary ⇒ 必须报",
         lambda: any("--bg-primary" in p for p in problems({"Ghost.svelte": bad_ghost}, declared))),
        ("★ <style> 包含裸 hex 颜色 #ff0000 ⇒ 必须报",
         lambda: any("#ff0000" in p for p in problems({"Hex.svelte": bad_hex}, declared))),
        ("★ 使用未声明的未知变量 ⇒ 必须报",
         lambda: any("--some-random-unknown-token" in p for p in problems({"Undec.svelte": bad_undeclared}, declared))),
        # ③ 空输入必须报
        ("★ 组件清单为空 ⇒ 必须报（零值守卫）",
         lambda: problems({}, declared) != []),
    ]


def run(argv):
    comp_dir = repo("src", "components")
    theme_file = repo("src", "styles", "theme.css")

    if not os.path.isdir(comp_dir):
        return off("未启用（src/components 目录不存在）")

    if not os.path.isfile(theme_file):
        return fatal("主题文件 %s 不存在" % theme_file)

    try:
        theme_content = open(theme_file, encoding="utf-8").read()
    except OSError as e:
        return fatal("读取 theme.css 失败：%s" % e)

    declared = extract_declared_vars(theme_content)

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
        require_nonempty("主题变量与硬编码颜色闸门", files.keys(), "Svelte 组件清单")
    except SystemExit as e:
        return fatal(str(e))

    probs = problems(files, declared)
    return finish(
        "主题变量与硬编码颜色闸门",
        probs,
        "主题变量与硬编码颜色闸门：OK（%d 个组件无幽灵变量与裸色泄漏）" % len(files)
    )


GATE = meta(
    "主题变量与硬编码颜色闸门",
    "检查 Svelte 组件中的 CSS 变量合法性与禁止硬编码十六进制颜色",
    knobs=(),
)

if __name__ == "__main__":
    sys.exit(main_selftest_or(sys.argv, "check_theme_tokens", _cases, run))
