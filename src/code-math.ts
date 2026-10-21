import { textToTex } from './strings';
import { LIMITS, type CodeSegment } from './types';

type Expr = { kind: 'symbol' | 'number' | 'string' | 'group' | 'list' | 'call' | 'unary' | 'binary'; value: string; args: Expr[] };
type Token = { kind: 'symbol' | 'number' | 'string' | 'op' | 'end'; value: string };
const BINARY: Record<string, [number, boolean]> = {
  ';': [1, false], '=': [2, true], ':=': [2, true], '/.': [3, false], '//.': [3, false],
  '->': [4, true], ':>': [4, true], '||': [9, false], '&&': [10, false],
  '<': [20, false], '>': [20, false], '<=': [20, false], '>=': [20, false],
  '==': [20, false], '!=': [20, false], '===': [20, false], '=!=': [20, false],
  '∈': [20, false], '∉': [20, false],
  '+': [30, false], '-': [30, false], '*': [40, false], '/': [40, false], '^': [60, true],
};
const OPERATORS: Record<string, string> = {
  ';': ';\\quad ', '=': '\\mathrel{=}', ':=': '\\mathrel{:=}',
  '/.': '\\mathbin{/\\!.}', '//.': '\\mathbin{//\\!.}', '->': '\\to ', ':>': '\\mathrel{:>} ',
  '||': '\\lor ', '&&': '\\land ', '<': '<', '>': '>', '<=': '\\le ', '>=': '\\ge ',
  '==': '=', '!=': '\\ne ', '===': '\\equiv ', '=!=': '\\not\\equiv ', '+': '+', '-': '-', '*': '\\,',
  '∈': '\\in ', '∉': '\\notin ',
};

/** A small, bounded typesetter, not a Wolfram evaluator. No source is accepted as TeX. */
class MathReader {
  private at = 0;
  private count = 0;
  private token: Token = { kind: 'end', value: '' };
  constructor(private source: string) { this.advance(); }
  private node(kind: Expr['kind'], value: string, args: Expr[] = []): Expr {
    if (++this.count > 1500) throw new Error('formula node limit');
    return { kind, value, args };
  }
  private advance() {
    const s = this.source;
    while (/\s/.test(s[this.at] ?? '') && this.at < s.length) this.at++;
    if (this.at === s.length) { this.token = { kind: 'end', value: '' }; return; }
    const tail = s.slice(this.at);
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:\*\^[+-]?\d+)?/.exec(tail);
    if (number) { this.at += number[0].length; this.token = { kind: 'number', value: number[0] }; return; }
    if (tail[0] === '"') {
      let end = this.at + 1, value = '';
      for (; end < s.length; end++) {
        if (s[end] === '\\') {
          if (++end >= s.length) throw new Error('unterminated string');
          value += s[end] === 'n' ? '\n' : s[end] === 't' ? '\t' : s[end];
        } else if (s[end] === '"') break;
        else value += s[end];
      }
      if (end === s.length) throw new Error('unterminated string');
      this.at = end + 1; this.token = { kind: 'string', value }; return;
    }
    const symbol = /^[\p{L}$][\p{L}\p{N}$`]*/u.exec(tail);
    if (symbol) { this.at += symbol[0].length; this.token = { kind: 'symbol', value: symbol[0] }; return; }
    const op = /^(?:\/\/\.|===|=!=|&&|\|\||<=|>=|==|!=|->|:>|:=|\/\.|[+\-*/^<>=!;,()[\]{}]|[≤≥≠∧∨→∈∉])/.exec(tail);
    if (!op || tail.startsWith('(*')) throw new Error('unsupported code token');
    const normalized: Record<string, string> = { '≤': '<=', '≥': '>=', '≠': '!=', '∧': '&&', '∨': '||', '→': '->' };
    this.at += op[0].length; this.token = { kind: 'op', value: normalized[op[0]] ?? op[0] };
  }
  parse() {
    const result = this.expression(0, 0);
    if (this.token.kind !== 'end') throw new Error('unconsumed code');
    return result;
  }
  private is(value: string) { return this.token.value === value; }
  private expression(min: number, depth: number): Expr {
    if (depth > 64) throw new Error('formula depth limit');
    const token = this.token;
    let left: Expr;
    if (token.kind === 'symbol' || token.kind === 'number' || token.kind === 'string') {
      this.advance(); left = this.node(token.kind, token.value);
    } else if (['+', '-', '!'].includes(token.value)) {
      this.advance(); left = this.node('unary', token.value, [this.expression(50, depth + 1)]);
    } else if (this.is('(')) {
      this.advance(); left = this.node('group', '', [this.expression(0, depth + 1)]);
      if (!this.is(')')) throw new Error('unbalanced parentheses');
      this.advance();
    } else if (this.is('{')) {
      left = this.node('list', '', this.arguments('}', depth + 1));
    } else throw new Error('missing formula operand');
    while (true) {
      if (this.is('[') && 80 >= min) {
        left = this.node('call', '', [left, ...this.arguments(']', depth + 1)]);
        continue;
      }
      const implicit = this.token.kind === 'symbol' || this.token.kind === 'number' || this.is('(');
      const operator = implicit ? '*' : this.token.value;
      const entry = BINARY[operator];
      if (!entry || entry[0] < min) break;
      if (!implicit) this.advance();
      if (operator === ';' && (this.token.kind === 'end' || [']', ')', '}'].includes(this.token.value))) {
        left = this.node('unary', 'trailing-semicolon', [left]); continue;
      }
      const right = this.expression(entry[0] + (entry[1] ? 0 : 1), depth + 1);
      left = this.node('binary', operator, [left, right]);
    }
    return left;
  }
  private arguments(close: string, depth: number) {
    this.advance();
    const args: Expr[] = [];
    if (this.is(close)) { this.advance(); return args; }
    while (true) {
      args.push(this.expression(0, depth + 1));
      if (this.is(close)) { this.advance(); return args; }
      if (!this.is(',')) throw new Error('unbalanced function or list');
      this.advance();
    }
  }
}

const stripGroup = (n: Expr): Expr => n.kind === 'group' ? stripGroup(n.args[0]) : n;
function print(node: Expr): string {
  const arg = (n: number) => print(node.args[n]);
  switch (node.kind) {
    case 'symbol': {
      if (node.value === 'True' || node.value === 'False') return `\\mathrm{${node.value}}`;
      if (node.value === 'Infinity') return '\\infty';
      const escaped = textToTex(node.value);
      return /^[A-Za-z$][A-Za-z0-9$`]+$/.test(node.value) ? `\\mathrm{${escaped}}` : escaped;
    }
    case 'number': return node.value.replace(/\*\^([+-]?\d+)$/, '\\times 10^{$1}');
    case 'string': return `\\text{${textToTex(node.value)}}`;
    case 'group': return `\\left(${arg(0)}\\right)`;
    case 'list': return `\\left\\{${node.args.map(print).join(',\\,')}\\right\\}`;
    case 'call': {
      const head = node.args[0];
      const name = head.kind === 'symbol' && /^[A-Za-z]+$/.test(head.value)
        ? `\\operatorname{${head.value}}` : print(head);
      return `${name}\\left[${node.args.slice(1).map(print).join(',\\,')}\\right]`;
    }
    case 'unary': return node.value === 'trailing-semicolon' ? `${arg(0)};` : `${node.value === '!' ? '\\neg ' : node.value}${arg(0)}`;
    case 'binary': {
      if (node.value === '/') return `\\frac{${print(stripGroup(node.args[0]))}}{${print(stripGroup(node.args[1]))}}`;
      if (node.value === '^') return `{${arg(0)}}^{${print(stripGroup(node.args[1]))}}`;
      return `${arg(0)}${OPERATORS[node.value]}${arg(1)}`;
    }
  }
}

export function codeToTex(source: string): string | undefined {
  if (!source.trim() || source.length > LIMITS.mathChars) return undefined;
  // A top-level notebook newline may separate input statements. Do not silently turn it
  // into implicit multiplication; wrapped function arguments may still span lines.
  let depth = 0, quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted && ch === '\\') { i++; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if ((ch === '\n' || ch === '\r') && depth === 0 && source.slice(0, i).trim() && source.slice(i + 1).trim()) return undefined;
  }
  try {
    const tex = print(new MathReader(source).parse());
    return tex.length <= LIMITS.mathChars ? tex : undefined;
  } catch { return undefined; }
}

/** Leading Notebook teaching comments remain text. Inline comments trigger exact-text fallback,
 * so a comment between operands can never accidentally split one expression into two formulae.
 */
export function codeSegments(text: string, enabled: boolean): CodeSegment[] {
  if (!enabled) return [{ kind: 'code', text }];
  const segments: CodeSegment[] = [];
  let at = 0;
  while (at < text.length) {
    const start = at;
    while (/\s/.test(text[at] ?? '') && at < text.length) at++;
    if (!text.startsWith('(*', at)) { at = start; break; }
    const comment = at;
    at += 2;
    let depth = 1;
    while (at < text.length && depth) {
      if (text.startsWith('(*', at)) { depth++; at += 2; }
      else if (text.startsWith('*)', at)) { depth--; at += 2; }
      else at++;
    }
    if (depth) return [{ kind: 'code', text }];
    segments.push({ kind: 'comment', text: text.slice(comment, at) });
  }
  const code = text.slice(at).trim();
  if (code) {
    const tex = codeToTex(code);
    segments.push(tex ? { kind: 'formula', text: code, tex } : { kind: 'code', text: code });
  }
  return segments;
}
