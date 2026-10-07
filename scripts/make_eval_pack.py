#!/usr/bin/env python3
"""scripts/make_eval_pack.py — 生成给 ChatGPT 评审的单文件 HTML 与完整 ZIP 压缩包。"""
import os
import shutil
import zipfile

def main():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    pack_dir = "/tmp/octave-ui-gpt-pack"
    if os.path.exists(pack_dir):
        shutil.rmtree(pack_dir)
    os.makedirs(f"{pack_dir}/screenshots", exist_ok=True)

    # 1. 复制真实渲染截图
    screenshots = [
        "01-initial-dark.png",
        "02-boot-modal.png",
        "03-active-session.png",
        "04-light-theme.png"
    ]
    for s in screenshots:
        src = f"/tmp/octave-ui-preview/screenshots/{s}"
        if os.path.exists(src):
            shutil.copy(src, f"{pack_dir}/screenshots/{s}")
            print(f"Copied screenshot: {s}")

    # 2. 读取整合 CSS
    css_content = ""
    with open(f"{repo_root}/src/styles/theme.css", "r", encoding="utf-8") as f:
        css_content += f.read() + "\n"
    with open(f"{repo_root}/dist/_astro/index.Bklrdtbx.css", "r", encoding="utf-8") as f:
        css_content += f.read() + "\n"

    # 3. 生成无需任何外部请求的独立静态 HTML 演示页
    html_content = f"""<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GNU Octave 11.3.0 WebAssembly UI - 设计评估原型</title>
  <style>
{css_content}

/* Evaluation Banner Overlay */
.eval-banner {{
  background: linear-gradient(90deg, #1f2937, #111827);
  border-bottom: 1px solid #374151;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: #f3f4f6;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
}}
.eval-badge {{
  background: #3b82f6;
  color: #fff;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  margin-right: 8px;
}}
.eval-actions {{
  display: flex;
  gap: 8px;
}}
.eval-btn {{
  background: #374151;
  color: #e5e7eb;
  border: 1px solid #4b5563;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}}
.eval-btn:hover {{
  background: #4b5563;
}}
.eval-btn.primary {{
  background: #2563eb;
  border-color: #3b82f6;
}}
.eval-btn.primary:hover {{
  background: #1d4ed8;
}}
  </style>
</head>
<body>
  <!-- 顶部设计评估说明条（供 ChatGPT / 审阅者快速理解） -->
  <div class="eval-banner" id="evalBanner">
    <div>
      <span class="eval-badge">ChatGPT 评审原型</span>
      <strong>GNU Octave WebAssembly UI 真实交互还原包</strong>（零外部网络依赖，所有样式与图标均内联）
    </div>
    <div class="eval-actions">
      <button class="eval-btn primary" onclick="toggleModal()">预览启动弹窗</button>
      <button class="eval-btn" onclick="toggleTheme()">切换深浅主题</button>
      <button class="eval-btn" onclick="toggleEvalBanner()">收起此栏 ✕</button>
    </div>
  </div>

  <div class="app-container svelte-nejbyb">
    <!-- 顶栏 HeaderBar -->
    <header class="header-bar svelte-1v09by2">
      <div class="brand svelte-1v09by2">
        <svg class="logo" viewBox="0 0 100 100" width="24" height="24">
          <rect width="100" height="100" rx="20" fill="#005f87"></rect>
          <circle cx="35" cy="50" r="16" fill="#f57900"></circle>
          <circle cx="65" cy="50" r="16" fill="#73d216"></circle>
          <circle cx="50" cy="50" r="10" fill="#ffffff"></circle>
        </svg>
        <span class="title svelte-1v09by2">
          GNU Octave 11.3.0
          <span class="badge-lane svelte-1v09by2">IllegalPerformance</span>
        </span>
        <nav class="lane-nav svelte-1v09by2" aria-label="Lane selector">
          <span class="lane-tag svelte-1v09by2">wasm32-final</span>
          <span class="lane-tag svelte-1v09by2">master</span>
          <span class="lane-tag active svelte-1v09by2">IllegalPerformance</span>
        </nav>
      </div>

      <div class="actions svelte-1v09by2">
        <div class="status-badge status-idle svelte-1v09by2">
          <span class="status-dot svelte-1v09by2"></span>
          <span class="status-text svelte-1v09by2">Ready (Idle)</span>
        </div>

        <button class="btn btn-secondary svelte-1v09by2" onclick="toggleModal()" title="Load WebAssembly kernel">
          Boot Engine
        </button>

        <button class="btn btn-secondary svelte-1v09by2" onclick="clearTerminal()" title="Clear terminal">
          Clear
        </button>

        <div class="lang-selector svelte-1v09by2">
          <select class="lang-select svelte-1v09by2" aria-label="Language">
            <option value="en" selected>🌐 English</option>
            <option value="zh-Hans">🇨🇳 简体中文</option>
            <option value="de">🇩🇪 Deutsch</option>
          </select>
        </div>

        <button class="btn btn-icon svelte-1v09by2" onclick="toggleTheme()" id="themeToggleBtn" title="Toggle theme">
          ☀️ Light
        </button>

        <button class="btn btn-icon svelte-1v09by2" onclick="toggleSidebar()" title="Toggle sidebar">
          ⇥ Hide Sidebar
        </button>
      </div>
    </header>

    <!-- 工作区主体 -->
    <main class="workspace-area svelte-nejbyb">
      <!-- 终端区域 -->
      <div class="terminal-wrapper svelte-j8zfnj" role="region" aria-label="Octave Terminal">
        <div class="terminal-output svelte-j8zfnj" id="terminalOutput">
          <div class="terminal-line line-stdout svelte-j8zfnj" style="color: #7ee787;">GNU Octave, version 11.3.0 (x86_64-pc-linux-gnu / Wasm64-pthreads)</div>
          <div class="terminal-line line-stdout svelte-j8zfnj" style="color: #8b949e;">Copyright (C) 2026 The Octave Project Developers. Pure client-side computation.</div>
          <div class="terminal-line line-stdout svelte-j8zfnj">&nbsp;</div>
          <div class="terminal-line line-echo svelte-j8zfnj">octave:1&gt; A = [16 2 3 13; 5 11 10 8; 9 7 6 12; 4 14 15 1]</div>
          <div class="terminal-line line-stdout svelte-j8zfnj">A =</div>
          <div class="terminal-line line-stdout svelte-j8zfnj">&nbsp;&nbsp;16&nbsp;&nbsp;&nbsp;2&nbsp;&nbsp;&nbsp;3&nbsp;&nbsp;13</div>
          <div class="terminal-line line-stdout svelte-j8zfnj">&nbsp;&nbsp;&nbsp;5&nbsp;&nbsp;11&nbsp;&nbsp;10&nbsp;&nbsp;&nbsp;8</div>
          <div class="terminal-line line-stdout svelte-j8zfnj">&nbsp;&nbsp;&nbsp;9&nbsp;&nbsp;&nbsp;7&nbsp;&nbsp;&nbsp;6&nbsp;&nbsp;12</div>
          <div class="terminal-line line-stdout svelte-j8zfnj">&nbsp;&nbsp;&nbsp;4&nbsp;&nbsp;14&nbsp;&nbsp;15&nbsp;&nbsp;&nbsp;1</div>
          <div class="terminal-line line-echo svelte-j8zfnj">octave:2&gt; d = det(A)</div>
          <div class="terminal-line line-stdout svelte-j8zfnj">d = 0</div>
          <div class="terminal-line line-echo svelte-j8zfnj">octave:3&gt; x = A \\ [1; 2; 3; 4]</div>
          <div class="terminal-line line-stderr svelte-j8zfnj" style="color: #ff7b72;">warning: matrix singular to machine precision, rcond = 1.30614e-18</div>
          <div class="terminal-line line-stdout svelte-j8zfnj">x =</div>
          <div class="terminal-line line-stdout svelte-j8zfnj">&nbsp;&nbsp;&nbsp;NaN</div>
          <div class="terminal-line line-stdout svelte-j8zfnj">&nbsp;&nbsp;&nbsp;NaN</div>
          <div class="terminal-line line-stdout svelte-j8zfnj">&nbsp;&nbsp;&nbsp;NaN</div>
          <div class="terminal-line line-stdout svelte-j8zfnj">&nbsp;&nbsp;&nbsp;NaN</div>
        </div>

        <div class="terminal-prompt-line svelte-j8zfnj">
          <span class="prompt-text svelte-j8zfnj">octave:4&gt;&nbsp;</span>
          <input type="text" class="terminal-input svelte-j8zfnj" id="termInput" placeholder="Type Octave expression, e.g. magic(5) or eig(rand(3))" autocomplete="off" autofocus>
        </div>
      </div>

      <!-- 右侧侧边栏 -->
      <aside class="sidebar svelte-rsmyjl" id="sidebar">
        <div class="tabs-header svelte-rsmyjl">
          <button class="tab-btn active svelte-rsmyjl" onclick="switchTab('workspace')">Workspace</button>
          <button class="tab-btn svelte-rsmyjl" onclick="switchTab('files')">Files</button>
          <button class="tab-btn svelte-rsmyjl" onclick="switchTab('history')">History</button>
          <button class="tab-btn svelte-rsmyjl" onclick="switchTab('docs')">Docs</button>
        </div>

        <div class="tab-content svelte-rsmyjl" id="tabWorkspace">
          <div class="panel svelte-rsmyjl">
            <div class="panel-toolbar svelte-rsmyjl">
              <span class="panel-title svelte-rsmyjl">Variables (3)</span>
              <button class="btn btn-sm svelte-rsmyjl">Refresh</button>
            </div>
            <div class="table-container svelte-rsmyjl">
              <table class="data-table svelte-rsmyjl">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Bytes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="var-name svelte-rsmyjl">A</td>
                    <td>double</td>
                    <td>4x4</td>
                    <td>128 B</td>
                  </tr>
                  <tr>
                    <td class="var-name svelte-rsmyjl">d</td>
                    <td>double</td>
                    <td>1x1</td>
                    <td>8 B</td>
                  </tr>
                  <tr>
                    <td class="var-name svelte-rsmyjl">x</td>
                    <td>double</td>
                    <td>4x1</td>
                    <td>32 B</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="tab-content svelte-rsmyjl" id="tabFiles" style="display: none;">
          <div class="panel svelte-rsmyjl">
            <div class="panel-toolbar svelte-rsmyjl">
              <span class="panel-title svelte-rsmyjl">Virtual MEMFS (/home/web_user)</span>
            </div>
            <div class="files-list svelte-rsmyjl">
              <div class="file-item svelte-rsmyjl"><span class="file-icon">📁</span><span class="file-name">scripts/</span></div>
              <div class="file-item svelte-rsmyjl"><span class="file-icon">📄</span><span class="file-name">run_simulation.m</span></div>
              <div class="file-item svelte-rsmyjl"><span class="file-icon">📊</span><span class="file-name">data_matrix.mat</span></div>
            </div>
          </div>
        </div>

        <div class="tab-content svelte-rsmyjl" id="tabHistory" style="display: none;">
          <div class="panel svelte-rsmyjl">
            <div class="panel-toolbar svelte-rsmyjl">
              <span class="panel-title svelte-rsmyjl">Command History</span>
            </div>
            <div class="history-list svelte-rsmyjl">
              <div class="history-item svelte-rsmyjl"><span class="history-cmd">A = [16 2 3 13; 5 11 10 8; 9 7 6 12; 4 14 15 1]</span></div>
              <div class="history-item svelte-rsmyjl"><span class="history-cmd">d = det(A)</span></div>
              <div class="history-item svelte-rsmyjl"><span class="history-cmd">x = A \\ [1; 2; 3; 4]</span></div>
            </div>
          </div>
        </div>

        <div class="tab-content svelte-rsmyjl" id="tabDocs" style="display: none;">
          <div class="panel svelte-rsmyjl">
            <div class="panel-toolbar svelte-rsmyjl">
              <span class="panel-title svelte-rsmyjl">Function Documentation</span>
            </div>
            <div class="doc-viewport svelte-rsmyjl">
              <div class="doc-content svelte-rsmyjl">-- Function File: det (A)
    Compute the determinant of matrix A.

    See also: inv, rcond, cond, eig.</div>
            </div>
          </div>
        </div>
      </aside>
    </main>

    <!-- 启动模态框 BootModal (默认隐藏，点击可展示) -->
    <div class="modal-backdrop svelte-5ud48x" id="bootModal" style="display: none;">
      <div class="modal-card svelte-5ud48x">
        <div class="modal-header svelte-5ud48x">
          <h3 class="modal-title svelte-5ud48x">Boot GNU Octave Engine</h3>
          <button class="btn-close svelte-5ud48x" onclick="toggleModal()">×</button>
        </div>
        <div class="modal-body svelte-5ud48x">
          <p class="desc svelte-5ud48x">This project runs 100% client-side local computation. All matrix operations and scientific computations execute directly in your browser without any backend server.</p>
          <div class="info-box svelte-5ud48x">
            <div class="info-item svelte-5ud48x"><span class="label svelte-5ud48x">Engine Version:</span><span class="val svelte-5ud48x">GNU Octave 11.3.0</span></div>
            <div class="info-item svelte-5ud48x"><span class="label svelte-5ud48x">Runtime Mode:</span><span class="val svelte-5ud48x">Wasm64 Multi-threaded (Memory64 + Pthreads)</span></div>
            <div class="info-item svelte-5ud48x"><span class="label svelte-5ud48x">Asset Size:</span><span class="val svelte-5ud48x">~40.6 MB (Wasm 30.9MB + Data 9.7MB, on-demand single load)</span></div>
            <div class="info-item svelte-5ud48x"><span class="label svelte-5ud48x">Data Privacy:</span><span class="val svelte-5ud48x">Code and data stay strictly in local memory and IDBFS, never uploaded to cloud</span></div>
          </div>
          <div class="status-box svelte-5ud48x">
            <div class="status-indicator svelte-5ud48x"></div>
            <span class="status-info svelte-5ud48x">Ready. Click the button below to start on-demand loading.</span>
          </div>
        </div>
        <div class="modal-footer svelte-5ud48x">
          <button class="btn svelte-5ud48x" onclick="toggleModal()">Cancel</button>
          <button class="btn btn-primary svelte-5ud48x" onclick="toggleModal()">Start Engine Now</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    function toggleModal() {{
      var m = document.getElementById('bootModal');
      m.style.display = m.style.display === 'none' ? 'flex' : 'none';
    }}
    function toggleSidebar() {{
      var s = document.getElementById('sidebar');
      s.style.display = s.style.display === 'none' ? 'flex' : 'none';
    }}
    function toggleTheme() {{
      var cur = document.documentElement.getAttribute('data-theme');
      var next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      document.getElementById('themeToggleBtn').innerText = next === 'dark' ? '☀️ Light' : '🌙 Dark';
    }}
    function toggleEvalBanner() {{
      document.getElementById('evalBanner').style.display = 'none';
    }}
    function switchTab(tab) {{
      var tabs = ['workspace', 'files', 'history', 'docs'];
      var btns = document.querySelectorAll('.tabs-header .tab-btn');
      tabs.forEach(function(t, i) {{
        var cap = t.charAt(0).toUpperCase() + t.slice(1);
        var el = document.getElementById('tab' + cap);
        if (el) el.style.display = t === tab ? 'flex' : 'none';
        if (btns[i]) {{
          if (t === tab) btns[i].classList.add('active');
          else btns[i].classList.remove('active');
        }}
      }});
    }}
    function clearTerminal() {{
      document.getElementById('terminalOutput').innerHTML = '<div class="terminal-line line-stdout" style="color:#8b949e;">Terminal cleared.</div>';
    }}
    document.getElementById('termInput').addEventListener('keydown', function(e) {{
      if (e.key === 'Enter' && this.value.trim()) {{
        var val = this.value.trim();
        var out = document.getElementById('terminalOutput');
        out.innerHTML += '<div class="terminal-line line-echo">octave:5&gt; ' + val + '</div>' +
          '<div class="terminal-line line-stdout">ans = [Mock Evaluation Output for ' + val + ']</div>';
        this.value = '';
        out.scrollTop = out.scrollHeight;
      }}
    }});
  </script>
</body>
</html>"""

    index_html_path = f"{pack_dir}/index.html"
    with open(index_html_path, "w", encoding="utf-8") as f:
        f.write(html_content)
    print("Wrote index.html")

    # 4. 生成单独交付的单文件 HTML
    single_html_path = f"{repo_root}/octave-ui-gpt-eval.html"
    shutil.copy(index_html_path, single_html_path)
    print(f"Copied standalone HTML to: {single_html_path}")

    # 5. 撰写提示词 PROMPT_FOR_CHATGPT.md
    prompt_md = """# GNU Octave WebAssembly UI — 评审指南与设计提问

## 一、项目背景（Background）
GNU Octave 是一款对标 MATLAB 的老牌高级开源科学计算工具（擅长矩阵运算、解方程组、信号处理等）。
本项目 **Octave-UI** 是一个全球首个将 **GNU Octave 11.3.0（30MB+ 原生 C++ 内核）** 通过 WebAssembly（Wasm64 + POSIX 多线程）完整搬到现代浏览器里的纯客户端 Web IDE。

## 二、当前现状与痛点（The Problem: "太工科小子了"）
打开目前的原型，你会发现一个严重问题：**长相极度硬核，简直是把 90 年代的 Linux TTY / 原生桌面 Qt 端生硬地搬到了网页上**：
1. **大黑屏冷启动门槛极高**：首屏是一个巨大的黑底色终端窗口，左上角闪烁着一个孤零零的 `octave:1>`。如果用户不是资深工科博士或 MATLAB 老手，**完全不知道该敲什么，也没有任何可以点击探索的按钮**。
2. **缺乏视觉反馈与新手引导（Zero Onboarding）**：没有任何预设示例、没有快速运行按钮、没有教学模板。
3. **右侧工作区割裂冷清**：右侧一列白色的变量表在没有运行变量时完全空置，功能单一。
4. **整体调性缺乏现代 Web 工具的亲和力**：不像 JupyterLab、Observable、Cursor 或现代数学实验室那样优雅温和。

## 三、请 ChatGPT 重点评估与回答的 4 个问题

### 1. 视觉调性（Visual Vibe & Tone）
- 如何在保持专业数值计算严谨感的前提下，弱化这种冷冰冰的“工科男纯命令行”压迫感？
- 请推荐 1~2 套适合科学计算/数据分析的现代 UI 配色与字体排版规范（类似 VS Code、Observable、Linear、GitHub Next）。

### 2. 首屏破冰与即点即跑（Zero-Friction Onboarding）
- 用户刚打开页面、还没有启动重型引擎时，首屏应该展示什么？
- 是否应该在终端上方或首屏卡片中放置 **「即点即跑的预设算法画廊（Quick Presets / CheatSheet）」**？
  （例如：① 求解方程组 Ax=b；② 快速傅里叶变换 FFT 频谱；③ 蒙特卡洛求 π 模拟；④ 1000阶随机矩阵乘法测速）
- 点击示例卡片后，交互应该如何流畅串联到终端与变量表？

### 3. 多模态工作区与编辑体验（IDE vs Notebook vs Calculator）
- 单行输入框敲代码体验很差（尤其涉及 for 循环和自定义函数时）。是否应该增加类似 MATLAB Online 的 **多行脚本编辑器 Tab** 或 **交互式 Notebook 单元格**？
- 右侧 Workspace 变量表如何做得更有用？（例如：支持像 Excel 一样点击查看二维矩阵数据、快速绘制分布直方图等）。

### 4. 具体改造方案与线框建议
- 请给出一套详细的布局改造建议（例如：三栏布局 vs 上下分栏、顶部动作条与示例托盘的安放位置）。
- 如果有具体的 HTML/CSS 结构或组件伪代码建议，请直接提供！
"""
    with open(f"{pack_dir}/PROMPT_FOR_CHATGPT.md", "w", encoding="utf-8") as f:
        f.write(prompt_md)

    # 6. 生成 ZIP 压缩包
    zip_path = f"{repo_root}/octave-ui-gpt-eval.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(pack_dir):
            for file in files:
                full = os.path.join(root, file)
                rel = os.path.relpath(full, pack_dir)
                z.write(full, rel)
    print(f"SUCCESS! Zip generated at: {zip_path} (size: {os.path.getsize(zip_path)} bytes)")

if __name__ == "__main__":
    main()
