import type { Expr } from './parser';
import { decodeWolframString, textToTex } from './strings';
import { codeSegments } from './code-math';
import { LIMITS, type Fragment, type NotebookCell, type NotebookItem, type NotebookModel } from './types';

interface Context { source: string; visits: number; chars: number; unsupported: Set<string> }
const plain = (text: string, supported = true): Fragment => ({ text, math: false, supported });
const NUMBER_SET_TEMPLATES = new Map([
  ['Reals', 'ℝ'], ['Integers', 'ℤ'], ['Rationals', 'ℚ'], ['Complexes', 'ℂ'],
]);
function boundedRaw(node: Expr, ctx: Context): string {
  const text = ctx.source.slice(node.from, Math.min(node.to, node.from + LIMITS.cellChars));
  return text + (node.to - node.from > LIMITS.cellChars ? '\n…（显示已截断；完整内容请查看原始源码）' : '');
}
function scalar(node: Expr | undefined, source: string): string {
  if (!node) return '';
  const raw = source.slice(node.from, Math.min(node.to, node.from + LIMITS.cellChars));
  return node.kind === 'string' ? decodeWolframString(raw.slice(1, raw.endsWith('"') ? -1 : undefined)) : raw;
}
function combine(parts: Fragment[], sep = ''): Fragment {
  const text = parts.map(p => p.text).join(sep);
  const tex = parts.every(p => p.tex !== undefined) ? parts.map(p => p.tex).join(sep ? '\\quad ' : '') : undefined;
  return { text, tex, math: parts.some(p => p.math), supported: parts.every(p => p.supported) };
}

function convertChildren(nodes: Expr[], ctx: Context, depth: number): Fragment[] {
  const parts: Fragment[] = [];
  for (const node of nodes) {
    if (ctx.visits >= LIMITS.boxNodes || ctx.chars >= LIMITS.cellChars) {
      ctx.unsupported.add('单元显示上限');
      parts.push(plain('…（单元显示已达上限；完整内容请查看原始源码）', false));
      break;
    }
    parts.push(convert(node, ctx, depth));
  }
  return parts;
}

function convert(node: Expr | undefined, ctx: Context, depth = 0): Fragment {
  if (!node) return plain('');
  if (++ctx.visits > LIMITS.boxNodes || depth > 96 || ctx.chars > LIMITS.cellChars) {
    ctx.unsupported.add('单元显示上限');
    return plain('…（单元显示已达上限；完整内容请查看原始源码）', false);
  }
  const next = (n: Expr | undefined) => convert(n, ctx, depth + 1);
  if (node.kind === 'string' || node.kind === 'atom') {
    const text = scalar(node, ctx.source);
    ctx.chars += text.length;
    if (node.to - node.from > LIMITS.cellChars) ctx.unsupported.add('长字符串截断');
    return { text, tex: textToTex(text), math: false, supported: node.to - node.from <= LIMITS.cellChars };
  }
  if (node.kind === 'list') return combine(convertChildren(node.args, ctx, depth + 1), ', ');
  const a = node.args;
  switch (node.head) {
    case 'TextData': return a[0]?.kind === 'list' ? combine(convertChildren(a[0].args, ctx, depth + 1)) : next(a[0]);
    case 'Cell': return next(a[0]); // Inline Cell inside TextData; never count it as a document cell.
    case 'BoxData': { const f = next(a[0]); return { ...f, math: true }; }
    case 'RowBox': return a[0]?.kind === 'list' ? combine(convertChildren(a[0].args, ctx, depth + 1)) : fallback();
    case 'FractionBox': return binary('/', (x, y) => `\\frac{${x}}{${y}}`, (x, y) => `(${x})/(${y})`);
    case 'SuperscriptBox': return binary('^', (x, y) => `{${x}}^{${y}}`);
    case 'SubscriptBox': return binary('_', (x, y) => `{${x}}_{${y}}`);
    case 'SubsuperscriptBox': {
      if (a.length < 3) return fallback();
      const p = a.slice(0, 3).map(next);
      return { text: `${p[0].text}_(${p[1].text})^(${p[2].text})`,
        tex: p.every(x => x.tex !== undefined) ? `{${p[0].tex}}_{${p[1].tex}}^{${p[2].tex}}` : undefined,
        math: true, supported: p.every(x => x.supported) };
    }
    case 'SqrtBox': {
      if (!a.length) return fallback();
      const p = next(a[0]);
      return { ...p, text: `Sqrt[${p.text}]`, tex: p.tex === undefined ? undefined : `\\sqrt{${p.tex}}`, math: true };
    }
    case 'RadicalBox': return binary('', (x, y) => `\\sqrt[${y}]{${x}}`, (x, y) => `Surd[${x}, ${y}]`);
    case 'TemplateBox': {
      // Only unmodified, zero-argument standard number-set templates. Custom templates
      // and DisplayFunction/InterpretationFunction options remain opaque source.
      if (a.length !== 2 || a[0]?.kind !== 'list' || a[0].args.length || a[1]?.kind !== 'string') return fallback();
      const text = NUMBER_SET_TEMPLATES.get(scalar(a[1], ctx.source));
      if (!text) return fallback();
      ctx.chars += text.length;
      return { text, tex: textToTex(text), math: true, supported: true };
    }
    // Visual wrappers only: arbitrary style options, tags, executable interpretations are ignored.
    case 'StyleBox': case 'FormBox': case 'TagBox': case 'InterpretationBox':
    case 'PaneBox': case 'FrameBox': case 'ItemBox': case 'TooltipBox':
      return a.length ? next(a[0]) : fallback();
    case 'GridBox': {
      if (a[0]?.kind !== 'list' || a[0].args.length > 20) return fallback();
      const rows = a[0].args;
      if (!rows.every(r => r.kind === 'list' && r.args.length <= 20)) return fallback();
      const cells = rows.map(r => r.args.map(next));
      return { text: cells.map(r => r.map(p => p.text).join('\t')).join('\n'),
        tex: cells.flat().every(p => p.tex !== undefined)
          ? `\\begin{matrix}${cells.map(r => r.map(p => p.tex).join(' & ')).join(' \\\\ ')}\\end{matrix}` : undefined,
        math: true, supported: cells.flat().every(p => p.supported) };
    }
    default: return fallback();
  }
  function binary(op: string, texFn: (x: string, y: string) => string,
    textFn = (x: string, y: string) => `${x}${op}(${y})`): Fragment {
    if (a.length < 2) return fallback();
    const x = next(a[0]), y = next(a[1]);
    return { text: textFn(x.text, y.text), tex: x.tex !== undefined && y.tex !== undefined ? texFn(x.tex, y.tex) : undefined,
      math: true, supported: x.supported && y.supported };
  }
  function fallback(): Fragment {
    ctx.unsupported.add(node!.head ?? '非标准表达式');
    const text = boundedRaw(node!, ctx);
    ctx.chars += text.length;
    return plain(text, false);
  }
}

export function buildNotebook(root: Expr, source: string): NotebookModel {
  if (root.kind !== 'call' || root.head !== 'Notebook' || root.args[0]?.kind !== 'list')
    throw new Error('未找到文本形式的 Notebook[{…}]。二进制 Notebook、脚本和包装执行表达式不受支持');
  let cells = 0, groups = 0, ids = 0, totalText = 0;
  const warnings = new Set<string>();
  const walk = (node: Expr, depth: number): NotebookItem => {
    if (depth > 96) throw new Error('单元分组嵌套超过限制');
    const body = node.head === 'Cell' ? node.args[0] : node;
    if (body?.head === 'CellGroupData' && body.args[0]?.kind === 'list') {
      if (++groups > LIMITS.cells) throw new Error('单元分组数量超过限制');
      const id = ++ids;
      const children = body.args[0].args.map(n => walk(n, depth + 1));
      const first = children[0];
      return { kind: 'group', id, from: node.from, to: node.to,
        open: scalar(body.args[1], source).trim() !== 'Closed', children,
        title: first?.kind === 'cell' ? first.text.slice(0, 80).split('\n')[0] : `单元组 ${groups}` };
    }
    if (++cells > LIMITS.cells) throw new Error('单元数量超过 10000，已停止解析；请使用源码视图');
    const ctx: Context = { source, visits: 0, chars: 0, unsupported: new Set() };
    const actualCell = node.kind === 'call' && node.head === 'Cell';
    const content = actualCell ? node.args[0] : node;
    // Cell[BoxData[…], CellLabel->…] has no positional style. Do not mistake an option for one.
    const style = actualCell && node.args[1]?.kind === 'string' ? scalar(node.args[1], source).slice(0, 80) : 'Unknown';
    const runs = content?.head === 'TextData' && content.args[0]?.kind === 'list'
      ? convertChildren(content.args[0].args, ctx, 0) : [convert(content, ctx)];
    const all = combine(runs);
    if (ctx.visits > LIMITS.boxNodes || ctx.chars > LIMITS.cellChars) ctx.unsupported.add('单元显示上限');
    const labelOption = actualCell ? node.args.find(arg => arg.kind === 'sequence' && /^CellLabel\s*->/.test(source.slice(arg.from, arg.to))) : undefined;
    const labelString = labelOption?.args.find(arg => arg.kind === 'string');
    const cellWarnings = Array.from(ctx.unsupported).slice(0, 12);
    if (cellWarnings.length) warnings.add('部分单元含不支持的 box 或超过显示限制，已保留源码入口');
    const displaySegments = codeSegments(all.text.slice(0, LIMITS.cellChars),
      ['Input', 'Output', 'Code'].includes(style) && all.supported && !cellWarnings.length);
    totalText += all.text.length + (all.tex?.length ?? 0) + displaySegments.reduce((n, s) => n + s.text.length + (s.kind === 'formula' ? s.tex.length : 0), 0);
    if (totalText > LIMITS.totalTextChars) throw new Error('渲染文本总量超过限制，请使用分页源码视图');
    let remaining = LIMITS.cellChars;
    const boundedRuns = runs.map(r => {
      const text = r.text.slice(0, remaining);
      remaining -= text.length;
      return { ...r, text, tex: text.length === r.text.length && r.tex && r.tex.length <= LIMITS.mathChars ? r.tex : undefined };
    }).filter(r => r.text.length > 0);
    const cell: NotebookCell = { kind: 'cell', id: ++ids, from: node.from, to: node.to, style,
      label: scalar(labelString, source).slice(0, 120),
      text: all.text.slice(0, LIMITS.cellChars),
      tex: all.supported && all.tex && all.tex.length <= LIMITS.mathChars && !all.text.includes('(*') && !all.text.includes('\n')
        ? all.tex : undefined,
      runs: boundedRuns, codeSegments: displaySegments, warnings: cellWarnings };
    return cell;
  };
  const items = root.args[0].args.map(n => walk(n, 0));
  return { items, cellCount: cells, groupCount: groups, warnings: Array.from(warnings), elapsedMs: 0 };
}
