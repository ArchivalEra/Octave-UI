#!/usr/bin/env python3
"""分发面许可合规闸门（2026-11-07 合规审查的防回潮锁）。

判据（全部来自「进了 dist 的第三方字节必须有声明随行」）：
  L1 仓根 THIRD-PARTY-NOTICES.md 存在，且覆盖 fzstd / fflate / svelte / astro
     四个随分发组件（名字逐字出现）；
  L2 public/lib/fzstd-0.1.1.mjs 文件头带版权 + MIT 声明（vendored 字节自身
     随行声明 —— minify 不能剥掉它）；
  L3 forge-catalog.json 每个包条目都有非空 license 字段（用户在市场目录
     可见每包许可；signal 缺目的教训）；
  L4 pyodide 载荷目录有随行 LICENSE（MPL-2.0 §3）；
  L5 package.json 有 license 字段。

反向断言：删 NOTICES / 删 fzstd 头 / catalog 有一条空 license / 空输入，都必须红。
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gate import finish, main_selftest_or, meta, off, repo  # noqa: E402

NAME = "分发面许可合规闸门"

NOTICES = os.path.join("public", "THIRD-PARTY-NOTICES.md")
FZSTD = os.path.join("public", "lib", "fzstd-0.1.1.mjs")
CATALOG = os.path.join("public", "bridge", "assets", "forge-catalog.json")
PYODIDE_DIR = os.path.join("public", "bridge", "assets", "pyodide", "pyodide")
PKG = "package.json"
COVERED = ("fzstd", "fflate", "svelte", "astro")
FZSTD_HEADER_RE = re.compile(r"Copyright \(c\) 2020 Arjun Barrett.*", re.S)


def _read(rel):
    p = repo(rel)
    if not os.path.isfile(p):
        return None
    with open(p, encoding="utf-8", errors="replace") as f:
        return f.read()


def problems_of(files):
    """纯函数。files = {相对路径: 文本 or None}。缺文件由调用方判。"""
    out = []
    notices = files.get(NOTICES)
    if notices is None:
        out.append("L1：%s 不存在 —— 随分发的第三方字节没有声明随行" % NOTICES)
    else:
        for name in COVERED:
            if name not in notices:
                out.append("L1：%s 未覆盖随分发组件 `%s`" % (NOTICES, name))

    fz = files.get(FZSTD)
    if fz is None:
        out.append("L2：%s 不存在（vendored 字节没了？）" % FZSTD)
    elif not (re.search(r"Copyright \(c\) 2020 Arjun Barrett", fz) and re.search(r"MIT", fz[:600])):
        out.append("L2：%s 文件头缺版权/MIT 声明（MIT 义务 = 声明随行，minify 不许剥）" % FZSTD)

    cat = files.get(CATALOG)
    if cat is None:
        out.append("L3：%s 不存在" % CATALOG)
    else:
        try:
            d = json.loads(cat)
            packs = d.get("packs") or []
            if not packs:
                out.append("L3：%s packs 为空 —— 空表不是通过（零值守卫）" % CATALOG)
            missing = [p.get("name") for p in packs if not (p.get("license") or "").strip()]
            if missing:
                out.append("L3：%s 里 %d 包缺 license 字段：%s"
                           % (CATALOG, len(missing), ", ".join(missing[:8])))
        except (ValueError, TypeError) as e:
            out.append("L3：%s 不是合法 JSON：%s" % (CATALOG, e))

    lic = files.get(os.path.join(PYODIDE_DIR, "LICENSE"))
    if lic is None:
        out.append("L4：pyodide 载荷目录无随行 LICENSE（MPL-2.0 §3）：%s" % PYODIDE_DIR)

    pkg = files.get(PKG)
    if pkg is None:
        out.append("L5：%s 不存在" % PKG)
    else:
        try:
            if not (json.loads(pkg).get("license") or "").strip():
                out.append("L5：%s 缺 license 字段" % PKG)
        except ValueError as e:
            out.append("L5：%s 不是合法 JSON：%s" % (PKG, e))
    return out


def collect():
    out = {}
    for rel in (NOTICES, FZSTD, CATALOG, PKG,
                os.path.join(PYODIDE_DIR, "LICENSE")):
        out[rel] = _read(rel)
    return out


def run(args):
    files = collect()
    if all(v is None for v in files.values()):
        # 可拔插件：别的仓（或跨仓库夹具）没有这些文件 ⇒ 明说未启用退 0，
        # 不把「输入不在」误报成「合规违约」。
        return off("未启用（NOTICES / catalog / pyodide 等输入均不存在 ⇒ 明说未启用）")
    return finish(NAME, problems_of(files),
                  "许可合规闸门：OK（NOTICES 覆盖 4 组件 / fzstd 头随行 / catalog 17/17 / pyodide 随行 / license 字段）")


def selftest_cases():
    good_notices = "covers fzstd fflate svelte astro"
    good_fz = "/*! Copyright (c) 2020 Arjun Barrett — MIT */\nvar x=1;"
    good_cat = json.dumps({"packs": [{"name": "a", "license": "MIT"},
                                     {"name": "b", "license": "GPL-3.0-or-later"}]})
    bad_cat = json.dumps({"packs": [{"name": "a", "license": "MIT"},
                                    {"name": "b"}]})
    empty_cat = json.dumps({"packs": []})
    good_pkg = json.dumps({"name": "x", "license": "AGPL-3.0-or-later"})
    bad_pkg = json.dumps({"name": "x"})

    def base(overrides=None):
        files = {
            NOTICES: good_notices,
            FZSTD: good_fz,
            CATALOG: good_cat,
            PKG: good_pkg,
            os.path.join(PYODIDE_DIR, "LICENSE"): "MPL-2.0",
        }
        if overrides:
            for k, v in overrides.items():
                if v is None:
                    files.pop(k, None)
                else:
                    files[k] = v
        return files

    return [
        ("正常不报：五件全齐", lambda: problems_of(base()) == []),
        ("该报的必须报：NOTICES 缺 svelte 覆盖", lambda: any(
            "svelte" in p for p in problems_of(base({NOTICES: "covers fzstd fflate astro"})))),
        ("该报的必须报：NOTICES 整个消失", lambda: any(
            "L1" in p for p in problems_of(base({NOTICES: None})))),
        ("该报的必须报：fzstd 头被 minify 剥掉", lambda: any(
            "L2" in p for p in problems_of(base({FZSTD: "var x=1;"})))),
        ("该报的必须报：catalog 一包缺 license", lambda: any(
            "L3" in p for p in problems_of(base({CATALOG: bad_cat})))),
        ("空输入必须报：catalog packs 空", lambda: any(
            "L3" in p for p in problems_of(base({CATALOG: empty_cat})))),
        ("空输入必须报：pyodide LICENSE 消失", lambda: any(
            "L4" in p for p in problems_of(base({os.path.join(PYODIDE_DIR, "LICENSE"): None})))),
        ("该报的必须报：package.json 缺 license 字段", lambda: any(
            "L5" in p for p in problems_of(base({PKG: bad_pkg})))),
    ]


GATE = meta("分发面许可合规闸门", "随分发的第三方字节必须有许可声明随行（NOTICES/fzstd 头/catalog license/pyodide/MPL）")

if __name__ == "__main__":
    sys.exit(main_selftest_or(sys.argv[1:], NAME, selftest_cases, run))
