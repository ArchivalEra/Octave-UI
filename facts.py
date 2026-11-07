#!/usr/bin/env python3
"""Octave-UI 事实台账入口（兼容壳）。

裸跑 zreflect/facts.py 在新版 Einfacht 下会：
  · 找不到仓根数据层（measure_octave_ui）⇒ FATAL measure_module_unusable
  · 或回落到占位实现量出空表 ⇒ 掉 18 条 FATAL
本壳给手工直跑补上本仓默认旋钮 + PYTHONPATH，真正干活的是 zreflect/facts.py。
"""
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.abspath(__file__))
ENTRY = os.path.join(REPO, "zreflect", "facts.py")

DEFAULTS = {
    "REFLECT_FACTS": "FACTS.json",
    "REFLECT_DOC": "STATE.md",
    "REFLECT_MEASURE_MODULE": "measure_octave_ui",
    "REFLECT_LANG": "zh",
}
env = dict(os.environ)
for k, v in DEFAULTS.items():
    env.setdefault(k, v)
env["PYTHONPATH"] = REPO + os.pathsep + env.get("PYTHONPATH", "")

sys.exit(subprocess.run([sys.executable, ENTRY] + sys.argv[1:],
                        cwd=REPO, env=env).returncode)
