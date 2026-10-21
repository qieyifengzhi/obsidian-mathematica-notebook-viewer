import { LIMITS, type Span, type ParseResult } from './types';
import { buildNotebook } from './notebook';

export interface Expr extends Span {
  kind: 'string' | 'atom' | 'list' | 'call' | 'sequence' | 'paren';
  head?: string;
  args: Expr[];
}

export class NotebookParseError extends Error {
  constructor(message: string, public offset: number) { super(message); }
}

/** Structural reader, deliberately not a Wolfram evaluator or a precedence parser.
 * Infix expressions are opaque sequences. Only explicit, whitelisted heads are interpreted.
 * Every node keeps the original UTF-16 span for exact source fallback.
 */
export class Reader {
  private pos = 0;
  private count = 0;
  private checks = 0;
  private started = Date.now();
  constructor(readonly source: string, private limits = LIMITS) {}

  private check() {
    if ((++this.checks & 1023) === 0 && Date.now() - this.started > this.limits.parseMs)
      this.fail('解析时间超过限制，请使用原始源码视图');
  }
  private fail(message: string): never { throw new NotebookParseError(message, this.pos); }
  private node(kind: Expr['kind'], from: number, args: Expr[] = [], head?: string): Expr {
    if (++this.count > this.limits.nodes) this.fail('表达式节点过多，已停止解析');
    return { kind, from, to: this.pos, args, head };
  }
  private trivia() {
    const s = this.source;
    while (this.pos < s.length) {
      this.check();
      if (/\s|\uFEFF/.test(s[this.pos])) { this.pos++; continue; }
      // Nested Wolfram comments. Quotes inside a comment do not affect its boundaries.
      if (s.startsWith('(*', this.pos)) {
        this.pos += 2;
        let depth = 1;
        while (this.pos < s.length && depth) {
          this.check();
          if (s.startsWith('(*', this.pos)) { depth++; this.pos += 2; }
          else if (s.startsWith('*)', this.pos)) { depth--; this.pos += 2; }
          else this.pos++;
        }
        if (depth) this.fail('注释未闭合：缺少 *)');
        continue;
      }
      // Mathematica line continuation outside a string.
      if (s[this.pos] === '\\' && /[\r\n]/.test(s[this.pos + 1] ?? '')) {
        this.pos += s[this.pos + 1] === '\r' && s[this.pos + 2] === '\n' ? 3 : 2;
        continue;
      }
      break;
    }
  }
  parse(): Expr {
    if (this.source.length > this.limits.sourceChars) this.fail('文件超过解析字符上限');
    if (this.source.includes('\0')) this.fail('发现二进制或 UTF-16 数据；仅支持 UTF-8 文本 Notebook');
    this.trivia();
    if (this.pos === this.source.length) this.fail('文件为空，未找到 Notebook[...]');
    const root = this.expression(0);
    this.trivia();
    if (this.pos !== this.source.length) this.fail('Notebook 表达式后存在未识别内容');
    return root;
  }
  private expression(depth: number): Expr {
    if (depth > this.limits.depth) this.fail('嵌套层数超过限制');
    this.trivia();
    const start = this.pos, parts: Expr[] = [];
    const s = this.source;
    while (this.pos < s.length && !',]})'.includes(s[this.pos])) {
      this.check();
      const at = this.pos, ch = s[this.pos];
      if (ch === '"') {
        this.pos++;
        let closed = false;
        while (this.pos < s.length) {
          this.check();
          if (s[this.pos] === '\\') { this.pos += Math.min(2, s.length - this.pos); continue; }
          if (s[this.pos++] === '"') { closed = true; break; }
        }
        if (!closed) this.fail('字符串未闭合');
        parts.push(this.node('string', at));
      } else if (ch === '{' || ch === '(' || ch === '[') {
        this.pos++;
        const close = ch === '{' ? '}' : ch === '(' ? ')' : ']';
        const args: Expr[] = [];
        this.trivia();
        while (this.pos < s.length && s[this.pos] !== close) {
          args.push(this.expression(depth + 1));
          this.trivia();
          if (s[this.pos] === close) break;
          if (s[this.pos] !== ',') this.fail(`分隔符不匹配，期望 , 或 ${close}`);
          this.pos++;
          this.trivia();
          if (s[this.pos] === close) this.fail('尾随逗号或缺少表达式');
        }
        if (s[this.pos] !== close) this.fail(`表达式未闭合：缺少 ${close}`);
        this.pos++;
        if (ch === '[' && parts.at(-1)?.kind === 'atom') {
          const head = parts.pop()!;
          parts.push(this.node('call', head.from, args, s.slice(head.from, head.to)));
        } else {
          parts.push(this.node(ch === '{' ? 'list' : 'paren', at, args));
        }
      } else {
        while (this.pos < s.length && !/[\s,[\]{}()"]/.test(s[this.pos])) {
          this.check();
          if (s.startsWith('\\[', this.pos)) {
            const end = s.indexOf(']', this.pos + 2);
            if (end < 0) this.fail('命名字符未闭合');
            this.pos = end + 1;
          } else this.pos++;
        }
        if (this.pos === at) this.fail('无法识别表达式字符');
        parts.push(this.node('atom', at));
      }
      this.trivia();
    }
    if (!parts.length) this.fail('缺少表达式或出现意外的闭合符号');
    return parts.length === 1 ? parts[0] : this.node('sequence', start, parts);
  }
}

export function parseNotebook(source: string): ParseResult {
  const started = Date.now();
  try {
    const root = new Reader(source).parse();
    const model = buildNotebook(root, source);
    model.elapsedMs = Date.now() - started;
    return { ok: true, model };
  } catch (error) {
    const offset = error instanceof NotebookParseError ? error.offset : undefined;
    // Error coordinates are computed only once, rather than on each token.
    const prefix = offset === undefined ? '' : source.slice(0, offset);
    return { ok: false, error: {
      message: error instanceof Error ? error.message : '未知解析错误', offset,
      line: offset === undefined ? undefined : prefix.split('\n').length,
      column: offset === undefined ? undefined : offset - prefix.lastIndexOf('\n'),
    } };
  }
}
