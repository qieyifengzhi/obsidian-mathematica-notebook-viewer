import katex from 'katex';
import { LIMITS, type NotebookCell, type NotebookItem, type NotebookModel, type ParseResult } from './types';

export interface VisibleRow { item: NotebookItem; depth: number }
export function visibleRows(items: NotebookItem[], collapsed: Set<number>): VisibleRow[] {
  const rows: VisibleRow[] = [];
  const walk = (items: NotebookItem[], depth: number) => {
    for (const item of items) {
      rows.push({ item, depth });
      if (item.kind === 'group' && !collapsed.has(item.id)) walk(item.children, depth + 1);
    }
  };
  walk(items, 0);
  return rows;
}

/** All Notebook-derived text uses textContent. Only KaTeX creates mathematical DOM. */
export class NotebookPane {
  private source = '';
  private model?: NotebookModel;
  private problem = '';
  private busy = false;
  private mode: 'rendered' | 'source' = 'rendered';
  private page = 0;
  private sourcePage = 0;
  private collapsed = new Set<number>();
  private path = '';
  private math = true;
  private readonly doc: Document;

  constructor(private root: HTMLElement) {
    this.doc = root.ownerDocument;
    root.classList.add('mnb-viewer');
    root.setAttribute('aria-label', 'Mathematica Notebook 只读查看器');
  }
  clear() { this.source = ''; this.model = undefined; this.problem = ''; this.busy = false; this.root.replaceChildren(); }
  loading(path: string) {
    this.path = path;
    this.busy = true;
    this.model = undefined;
    this.problem = '';
    this.render();
  }
  setSource(source: string, path: string, reset = false) {
    this.source = source;
    this.path = path;
    if (reset) { this.page = 0; this.sourcePage = 0; this.collapsed.clear(); }
    this.render();
  }
  result(result: ParseResult) {
    this.busy = false;
    this.problem = result.ok ? '' : result.error.message + (result.error.line ? `（第 ${result.error.line} 行，第 ${result.error.column} 列）` : '');
    if (result.ok) {
      this.model = result.model;
      this.collapsed.clear();
      const walk = (items: NotebookItem[]) => {
        for (const item of items) if (item.kind === 'group') {
          if (!item.open) this.collapsed.add(item.id);
          walk(item.children);
        }
      };
      walk(this.model.items);
    } else this.model = undefined;
    this.render();
  }
  private el<K extends keyof HTMLElementTagNameMap>(tag: K, parent: Node, text?: string, cls?: string): HTMLElementTagNameMap[K] {
    const node = this.doc.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    parent.appendChild(node);
    return node;
  }
  private button(parent: Node, text: string, click: () => void, disabled = false) {
    const button = this.el('button', parent, text);
    button.type = 'button'; button.disabled = disabled;
    button.addEventListener('click', click);
    return button;
  }
  private render() {
    const scrollTop = this.root.scrollTop;
    this.root.replaceChildren();
    const toolbar = this.el('div', this.root, undefined, 'mnb-toolbar');
    toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', 'Notebook 显示方式');
    const rendered = this.button(toolbar, '渲染视图', () => { this.mode = 'rendered'; this.render(); });
    rendered.setAttribute('aria-pressed', String(this.mode === 'rendered'));
    const raw = this.button(toolbar, '原始源码', () => { this.mode = 'source'; this.render(); });
    raw.setAttribute('aria-pressed', String(this.mode === 'source'));
    const toggle = this.button(toolbar, this.math ? '数学预览：开' : '数学预览：关', () => { this.math = !this.math; this.render(); });
    toggle.setAttribute('aria-pressed', String(this.math));
    this.el('span', toolbar, '只读 · 不执行代码', 'mnb-readonly');
    this.el('div', this.root, this.path, 'mnb-path');
    const status = this.el('div', this.root, undefined, 'mnb-status');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    if (this.busy) status.textContent = '正在后台读取 / 解析 Notebook…';
    else if (this.problem) { status.textContent = `无法完整解析：${this.problem}。可切换“原始源码”。`; status.classList.add('mnb-warning'); }
    else if (this.model) status.textContent = `${this.model.cellCount} 个单元 · ${this.model.groupCount} 个分组 · 解析 ${this.model.elapsedMs} ms · Output 为文件中保存的历史结果`;
    if (this.mode === 'source') this.sourceView(this.root, this.source, false);
    else if (this.model) this.renderNotebook(this.model);
    else if (this.problem && this.source) this.el('p', this.root, '源码仍可安全查看；此错误不会修改文件。');
    this.root.scrollTop = scrollTop;
  }
  private pager(parent: Node, page: number, pages: number, set: (n: number) => void, label: string) {
    const nav = this.el('div', parent, undefined, 'mnb-pager');
    nav.setAttribute('aria-label', label);
    this.button(nav, '上一页', () => set(page - 1), page === 0);
    this.el('span', nav, `第 ${page + 1} / ${pages} 页`);
    this.button(nav, '下一页', () => set(page + 1), page >= pages - 1);
  }
  private sourceView(parent: Node, source: string, local: boolean) {
    const pages = Math.max(1, Math.ceil(source.length / LIMITS.sourcePageChars));
    let page = local ? 0 : Math.min(this.sourcePage, pages - 1);
    const host = this.el('div', parent, undefined, 'mnb-source-host');
    const draw = () => {
      host.replaceChildren();
      this.pager(host, page, pages, n => { page = n; if (!local) this.sourcePage = n; draw(); }, '源码分页');
      const from = page * LIMITS.sourcePageChars, to = Math.min(source.length, from + LIMITS.sourcePageChars);
      this.el('div', host, `字符 ${from + (source.length ? 1 : 0)}–${to} / ${source.length}（UTF-16 位置；分页可能切开一行）`, 'mnb-source-position');
      const pre = this.el('pre', host, undefined, 'mnb-source'); pre.tabIndex = 0;
      this.el('code', pre, source.slice(from, to));
    };
    draw();
  }
  private renderNotebook(model: NotebookModel) {
    for (const warning of model.warnings) this.el('p', this.root, warning, 'mnb-warning');
    const controls = this.el('div', this.root, undefined, 'mnb-group-controls');
    this.button(controls, '展开全部分组', () => { this.collapsed.clear(); this.page = 0; this.render(); });
    this.button(controls, '折叠全部分组', () => {
      const visit = (items: NotebookItem[]) => items.forEach(item => {
        if (item.kind === 'group') { this.collapsed.add(item.id); visit(item.children); }
      });
      visit(model.items); this.page = 0; this.render();
    });
    const rows = visibleRows(model.items, this.collapsed);
    const pages = Math.max(1, Math.ceil(rows.length / LIMITS.pageCells));
    this.page = Math.min(this.page, pages - 1);
    const setPage = (n: number) => { this.page = n; this.render(); this.root.scrollTop = 0; };
    this.pager(this.root, this.page, pages, setPage, '单元分页');
    const body = this.el('div', this.root, undefined, 'mnb-notebook');
    if (!rows.length) this.el('p', body, '此 Notebook 没有单元。');
    for (const { item, depth } of rows.slice(this.page * LIMITS.pageCells, (this.page + 1) * LIMITS.pageCells)) {
      const article = this.el('article', body, undefined, 'mnb-row');
      article.style.setProperty('--mnb-depth', String(Math.min(depth, 8)));
      if (item.kind === 'group') {
        article.classList.add('mnb-group');
        const closed = this.collapsed.has(item.id);
        const button = this.button(article, `${closed ? '▸' : '▾'} ${item.title || '单元组'} · ${item.children.length} 项`, () => {
          if (closed) this.collapsed.delete(item.id); else this.collapsed.add(item.id);
          this.render();
        });
        button.setAttribute('aria-expanded', String(!closed));
      } else this.renderCell(article, item);
    }
    this.pager(this.root, this.page, pages, setPage, '单元分页');
  }
  private renderCell(parent: HTMLElement, cell: NotebookCell) {
    const isCode = ['Input', 'Output', 'Code', 'Print', 'Message'].includes(cell.style);
    parent.classList.add(isCode ? 'mnb-code-cell' : 'mnb-text-cell');
    const header = this.el('div', parent, undefined, 'mnb-cell-header');
    this.el('span', header, `${cell.style}${cell.label ? ` · ${cell.label}` : ''}`);
    const headingLevel: Record<string, 'h1' | 'h2' | 'h3' | 'h4' | 'h5'> = {
      Title: 'h1', Subtitle: 'h2', Chapter: 'h2', Section: 'h2', Subsection: 'h3', Subsubsection: 'h4', Subsubsubsection: 'h5',
    };
    if (isCode) {
      const automatic = this.math && cell.codeSegments.some(s => s.kind === 'formula');
      if (automatic) {
        for (const segment of cell.codeSegments) {
          if (segment.kind === 'comment') this.el('div', parent, segment.text, 'mnb-comment');
          else if (segment.kind === 'formula') {
            const box = this.el('div', parent, undefined, 'mnb-code-formula');
            this.renderMath(box, segment.tex, true, segment.text);
          } else {
            const pre = this.el('pre', parent, undefined, 'mnb-code');
            this.el('code', pre, segment.text);
          }
        }
        const codeDetails = this.el('details', parent, undefined, 'mnb-code-text');
        this.el('summary', codeDetails, '查看代码文本');
        const pre = this.el('pre', codeDetails, undefined, 'mnb-code');
        this.el('code', pre, cell.text);
      } else {
        const pre = this.el('pre', parent, undefined, 'mnb-code');
        this.el('code', pre, cell.text || '（空单元）');
      }
      if (!automatic && this.math && cell.tex && !cell.warnings.length) {
        const details = this.el('details', parent, undefined, 'mnb-math-preview');
        this.el('summary', details, '公式排版预览（以代码及原始源码为准）');
        details.addEventListener('toggle', () => {
          if (details.open && !details.querySelector('.mnb-formula')) this.renderMath(details, cell.tex!, true);
        });
      }
    } else {
      const text = this.el(headingLevel[cell.style] ?? 'div', parent, undefined, 'mnb-text');
      for (const run of cell.runs) {
        if (this.math && run.math && run.supported && run.tex && !run.text.includes('\n') && !run.text.includes('(*'))
          this.renderMath(text, run.tex, false);
        else this.el('span', text, run.text);
      }
      if (!cell.runs.length) text.textContent = cell.text;
    }
    if (cell.warnings.length) this.el('p', parent, `源码回退：${cell.warnings.join('、')}。`, 'mnb-warning');
    const details = this.el('details', parent, undefined, 'mnb-cell-source');
    this.el('summary', details, '查看本单元原始源码');
    details.addEventListener('toggle', () => {
      if (details.open && !details.querySelector('.mnb-source-host'))
        this.sourceView(details, this.source.slice(cell.from, cell.to), true);
    });
  }
  private renderMath(parent: Node, tex: string, display: boolean, fallback?: string) {
    const host = this.el('span', parent, undefined, 'mnb-formula');
    try {
      katex.render(tex, host, {
        displayMode: display, throwOnError: true, trust: false, strict: 'ignore',
        maxExpand: 200, maxSize: 10, output: 'htmlAndMathml', macros: {},
      });
    } catch {
      host.textContent = fallback ?? '（公式预览失败，请查看文本或本单元源码）';
      host.classList.add('mnb-warning');
    }
  }
}
