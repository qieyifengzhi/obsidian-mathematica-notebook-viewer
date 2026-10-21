import { describe, expect, it } from 'vitest';
import katex from 'katex';
import { codeSegments, codeToTex } from '../src/code-math';
import { parseNotebook } from '../src/parser';
import { LIMITS } from '../src/types';

const example = 'Reduce[(1)/(2) (b-cr-2 qba γ)>0&&0<cr<b&&γ>0,qba]';
describe('safe code formula typesetting', () => {
  it('renders the requested Reduce expression as a fraction with logical conjunctions', () => {
    const tex = codeToTex(example)!;
    expect(tex).toContain('\\operatorname{Reduce}');
    expect(tex).toContain('\\frac{1}{2}');
    expect(tex).toContain('\\land '); expect(tex).toContain('\\mathrm{qba}');
    expect(tex).toContain('\\gamma'); expect(tex).not.toContain('\\&\\&');
    expect(() => katex.renderToString(tex, { throwOnError: true, trust: false })).not.toThrow();
  });
  it('separates multiline Chinese teaching comments before formula conversion', () => {
    const parts = codeSegments('(* 中文注释\n(* 嵌套说明 *) 结束 *)\n' + example, true);
    expect(parts.map(p => p.kind)).toEqual(['comment', 'formula']);
    expect(parts[0].text).toContain('嵌套说明');
    expect(parts[1].text).toBe(example);
  });
  it('passes an annotated RowBox through the full Notebook parser', () => {
    const comment = '(* 中文教学注释\n不求解，仅排版 *)';
    const source = `Notebook[{Cell[BoxData[RowBox[{${JSON.stringify(comment)},"\\[IndentingNewLine]",${JSON.stringify(example)}}]],"Input"]}]`;
    const result = parseNotebook(source);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const cell = result.model.items[0];
      if (cell.kind !== 'cell') throw new Error('missing cell');
      expect(cell.codeSegments[1].kind).toBe('formula');
      expect(source.slice(cell.from, cell.to)).toBe(source.slice(10, -2));
    }
  });
  it.each([
    'Simplify[(a+b)^2/(2 γ)]', 'Solve[{x^2==4,x>0},x]', 'D[Rb,qbm]',
    'a>=b||a!=c', 'x->a/b', 'x=1;y:=x+2;', '1.5*^9 + Sqrt[x]', '-x^2',
  ])('produces valid KaTeX for %s', expression => {
    const tex = codeToTex(expression);
    expect(tex).toBeTruthy();
    expect(() => katex.renderToString(tex!, { throwOnError: true, trust: false })).not.toThrow();
  });
  it('preserves explicit grouping and right-associative powers', () => {
    expect(codeToTex('a/(b+c)')).toBe('\\frac{a}{b+c}');
    expect(codeToTex('-x^2')).toBe('-{x}^{2}');
    expect(codeToTex('x^a^b')).toBe('{x}^{{a}^{b}}');
    expect(codeToTex('a*(b-c)')).toContain('\\left(b-c\\right)');
  });
  it('keeps unsupported syntax, inline comments and disabled formula mode as code', () => {
    for (const text of ['x_ /; x>0', 'x(* comment *)+y', 'x=1\ny=2', 'f[', '(* unclosed', '\\href{x}{y}'])
      expect(codeSegments(text, true).some(p => p.kind === 'formula')).toBe(false);
    expect(codeSegments(example, false)).toEqual([{ kind: 'code', text: example }]);
  });
  it('does not treat a comment-like string as an actual teaching comment', () => {
    const parts = codeSegments('Print["(* harmless string *)"]', true);
    expect(parts).toHaveLength(1); expect(parts[0].kind).toBe('formula');
  });
  it('does not accept raw TeX or executable HTML into mathematical output', () => {
    expect(codeToTex('\\htmlClass{evil}{x}')).toBeUndefined();
    const tex = codeToTex('Run["<img src=x onerror=alert(1)>"]')!;
    const html = katex.renderToString(tex, { throwOnError: true, trust: false });
    expect(html).not.toContain('<img'); expect(html).not.toContain('<script');
  });
  it('bounds formula length and nested expression depth', () => {
    expect(codeToTex('x'.repeat(LIMITS.mathChars + 1))).toBeUndefined();
    expect(codeToTex('f['.repeat(100) + 'x' + ']'.repeat(100))).toBeUndefined();
  });
});
