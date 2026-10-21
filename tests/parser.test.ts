import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseNotebook, Reader } from '../src/parser';
import { decodeWolframString, textToTex } from '../src/strings';
import { LIMITS, type NotebookCell, type NotebookItem, type NotebookModel } from '../src/types';

export function model(source: string): NotebookModel {
  const r = parseNotebook(source);
  if (!r.ok) throw new Error(r.error.message);
  return r.model;
}
export function cells(items: NotebookItem[]): NotebookCell[] {
  return items.flatMap(item => item.kind === 'cell' ? [item] : cells(item.children));
}
describe('structural Notebook parser', () => {
  it('parses the independent demo, preserves Chinese code comments and CellLabel', () => {
    const source = readFileSync('tests/fixtures/demo.nb', 'utf8');
    const m = model(source), all = cells(m.items);
    expect(m.cellCount).toBe(10); expect(m.groupCount).toBe(2);
    expect(all.find(c => c.style === 'Input')?.text).toContain('中文教学注释');
    expect(all.find(c => c.style === 'Input')?.text).toContain('\n历史输出');
    expect(all.find(c => c.style === 'Input')?.label).toBe('In[1]:=');
    expect(m.items[2].kind).toBe('group');
    const g = m.items[2]; expect(g.kind === 'group' && g.open).toBe(false);
  });
  it('does not count inline Cells as separate document Cells', () => {
    const m = model('Notebook[{Cell[TextData[{"约束",Cell[BoxData[FractionBox["a","b"]]],"结束"}],"Text"]}]');
    expect(m.cellCount).toBe(1);
    expect(cells(m.items)[0].runs[1].tex).toBe('\\frac{a}{b}');
    expect(cells(m.items)[0].text).toBe('约束(a)/(b)结束');
  });
  it('accepts nested comments, cache comments, BOM, scientific precision and options', () => {
    const source = '\uFEFF(* x (* nested *) " *) Notebook[{Cell[BoxData["x"],"Input",CellChangeTimes->{3.99`*^9}]}] (*cache*)';
    expect(model(source).cellCount).toBe(1);
  });
  it('keeps exact UTF-16 source spans including options and comments', () => {
    const source = '(*head*)Notebook[{Cell["中文", "Text", CellLabel->"标签"]}](*tail*)';
    const c = cells(model(source).items)[0];
    expect(source.slice(c.from, c.to)).toBe('Cell["中文", "Text", CellLabel->"标签"]');
  });
  it.each([
    ['FractionBox["a","b"]', '\\frac{a}{b}'],
    ['SuperscriptBox["x","2"]', '{x}^{2}'],
    ['SubscriptBox["x","i"]', '{x}_{i}'],
    ['SubsuperscriptBox["x","i","2"]', '{x}_{i}^{2}'],
    ['SqrtBox["x"]', '\\sqrt{x}'],
    ['RadicalBox["x","3"]', '\\sqrt[3]{x}'],
    ['StyleBox[FormBox["x",TraditionalForm],FontColor->Red]', 'x'],
    ['InterpretationBox["x",Run["bad"]]', 'x'],
    ['TagBox["x",Function[Run["bad"]]]', 'x'],
  ])('converts %s using whitelisted constant TeX', (box, expected) => {
    const c = cells(model(`Notebook[{Cell[BoxData[${box}],"Output"]}]`).items)[0];
    expect(c.tex).toBe(expected); expect(c.warnings).toEqual([]);
  });
  it('converts small grids and falls back for dynamic/graphics/template boxes', () => {
    const grid = cells(model('Notebook[{Cell[BoxData[GridBox[{{"a","b"},{"c","d"}}]],"Output"]}]').items)[0];
    expect(grid.text).toBe('a\tb\nc\td'); expect(grid.runs[0].tex).toContain('\\begin{matrix}');
    for (const head of ['GraphicsBox', 'DynamicBox', 'TemplateBox', 'ButtonBox', 'UnknownBox']) {
      const c = cells(model(`Notebook[{Cell[BoxData[${head}["opaque"]],"Output"]}]`).items)[0];
      expect(c.text).toContain(`${head}["opaque"]`); expect(c.warnings).toContain(head); expect(c.tex).toBeUndefined();
    }
  });
  it('never interprets Cell options as a style or as additional document cells', () => {
    const c = cells(model('Notebook[{Cell[BoxData["x"],CellLabel->"Out[2]=",CellChangeTimes->{1}]}]').items)[0];
    expect(c.style).toBe('Unknown'); expect(c.label).toBe('Out[2]=');
  });
  it.each([
    '', 'Notebook[{Cell["x","Text"]}', 'Notebook[{Cell["x,"Text"]}]',
    'Notebook[{}] (*unclosed', 'Notebook[{Cell["x","Text"],}]',
    'Get["file"]', 'Run["bad"];Notebook[{}]', 'Notebook[{}]Run["bad"]', 'Notebook[{}]\0',
  ])('reports malformed/unsupported input without throwing into the view: %s', source => {
    const r = parseNotebook(source); expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message.length).toBeGreaterThan(0);
  });
  it('reports useful error coordinates', () => {
    const r = parseNotebook('Notebook[{\nCell["x", "Text"]');
    expect(r.ok).toBe(false); if (!r.ok) { expect(r.error.line).toBe(2); expect(r.error.offset).toBe(28); }
  });
  it('enforces node/depth/file/cell limits and truncates long strings', () => {
    expect(() => new Reader('Notebook[{Cell["x","Text"]}]', { ...LIMITS, nodes: 3 }).parse()).toThrow('节点');
    expect(parseNotebook('Notebook[{' + 'f['.repeat(200) + '"x"' + ']'.repeat(200) + '}]').ok).toBe(false);
    expect(parseNotebook(' '.repeat(LIMITS.sourceChars + 1)).ok).toBe(false);
    expect(parseNotebook('Notebook[{' + Array(10001).fill('Cell["x","Text"]').join(',') + '}]').ok).toBe(false);
    const c = cells(model(`Notebook[{Cell["${'a'.repeat(LIMITS.cellChars + 100)}","Text"]}]`).items)[0];
    expect(c.text.length).toBeLessThanOrEqual(LIMITS.cellChars); expect(c.warnings.length).toBeGreaterThan(0);
  });
  it('bounds wide TextData/RowBox expansion without losing the exact source span', () => {
    const list = Array(15000).fill('"abcd"').join(',');
    for (const box of [`TextData[{${list}}]`, `BoxData[RowBox[{${list}}]]`]) {
      const source = `Notebook[{Cell[${box},"Text"]}]`;
      const c = cells(model(source).items)[0];
      expect(c.runs.reduce((n, r) => n + r.text.length, 0)).toBeLessThanOrEqual(LIMITS.cellChars);
      expect(c.warnings.length).toBeGreaterThan(0);
      expect(source.slice(c.from, c.to)).toBe(`Cell[${box},"Text"]`);
    }
  });
});

describe('Wolfram string decoding and TeX escaping', () => {
  it('decodes Chinese hex, named Greek, octal and long-string line continuations', () => {
    expect(decodeWolframString('\\:4e2d\\:6587 \\[Gamma] \\|01f600 \\.41 \\101')).toBe('中文 γ 😀 A A');
    expect(decodeWolframString('\\<\\\r\nhello\\\r\nworld\\>')).toBe('helloworld');
    expect(decodeWolframString('x\\n\\t\\"y\\"\\\\')).toBe('x\n\t"y"\\');
    expect(decodeWolframString('\\[NotACharacter]')).toBe('\\[NotACharacter]');
  });
  it('does not admit attacker-supplied TeX commands or HTML', () => {
    expect(textToTex('\\href{javascript:alert(1)}{x}')).not.toContain('\\href');
    expect(textToTex('\\htmlClass{evil}{x}')).not.toContain('\\htmlClass');
    expect(textToTex('a_b&c%')).toBe('a\\_b\\&c\\%');
  });
});
