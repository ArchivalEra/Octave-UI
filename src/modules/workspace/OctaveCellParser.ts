// src/modules/workspace/OctaveCellParser.ts
// 严格遵循 GNU Octave / MATLAB 官方标准分节格式 (%% 语法)
// 绝不使用私有 JSON，输入输出均为 100% 合法且可直接由 Octave 解释执行的 .m 脚本

export interface ParsedCell {
  id: string;
  title: string;
  description: string;
  code: string;
}

export class OctaveCellParser {
  private static _seq = 0;

  /**
   * 将标准 .m 脚本按 %% 分节符解析为交互式单元格列表
   */
  static parse(mContent: string): ParsedCell[] {
    const lines = mContent.split(/\r?\n/);
    const cells: ParsedCell[] = [];

    let currentTitle = 'Section 1';
    let currentDescLines: string[] = [];
    let currentCodeLines: string[] = [];
    let inHeaderComments = true;
    let hasEncounteredSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 匹配 %% 开头的小节分割线
      if (/^%%\s*/.test(line)) {
        if (hasEncounteredSection || currentCodeLines.length > 0 || currentDescLines.length > 0) {
          cells.push({
            id: `cell_${++this._seq}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
            title: currentTitle,
            description: currentDescLines.join('\n').trim(),
            code: currentCodeLines.join('\n').trim(),
          });
        }

        hasEncounteredSection = true;
        currentTitle = line.replace(/^%%\s*/, '').trim() || `Section ${cells.length + 1}`;
        currentDescLines = [];
        currentCodeLines = [];
        inHeaderComments = true;
        continue;
      }

      // 如果紧随 %% 之后以单个 % 开头，提取为单元格文档描述
      if (inHeaderComments && /^%\s?(.*)$/.test(line)) {
        const match = line.match(/^%\s?(.*)$/);
        currentDescLines.push(match ? match[1] : '');
        continue;
      }

      // 遇到非注释行，说明进入代码段
      inHeaderComments = false;
      currentCodeLines.push(line);
    }

    // 压入最后一个单元格
    if (hasEncounteredSection || currentCodeLines.length > 0 || currentDescLines.length > 0) {
      cells.push({
        id: `cell_${++this._seq}_${Date.now().toString(36)}`,
        title: currentTitle,
        description: currentDescLines.join('\n').trim(),
        code: currentCodeLines.join('\n').trim(),
      });
    }

    // 若内容完全为空，提供默认单元格
    if (cells.length === 0) {
      cells.push({
        id: `cell_${++this._seq}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        title: 'Section 1',
        description: '',
        code: '',
      });
    }

    return cells;
  }

  /**
   * 将单元格列表无损序列化回标准 Octave .m 脚本
   */
  static serialize(cells: ParsedCell[]): string {
    const sections: string[] = [];

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const parts: string[] = [];

      // 1. 小节标题 %%
      const title = cell.title.trim() || `Section ${i + 1}`;
      parts.push(`%% ${title}`);

      // 2. 小节说明注释 %
      if (cell.description.trim()) {
        const descLines = cell.description.split(/\r?\n/);
        for (const line of descLines) {
          parts.push(`% ${line}`);
        }
      }

      // 3. 代码正文
      if (cell.code.trim()) {
        parts.push(cell.code.trim());
      }

      sections.push(parts.join('\n'));
    }

    return sections.join('\n\n') + '\n';
  }
}
