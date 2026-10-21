import { describe, expect, it } from 'vitest';
import katex from 'katex';
import { parseNotebook } from '../src/parser';
import { codeToTex } from '../src/code-math';
import { NotebookPane } from '../src/renderer';

const output = 'Cell[BoxData[RowBox[{RowBox[{"qba","\\[Element]",TemplateBox[{},"Reals"]}],"&&",RowBox[{"cr",">","0"}],"&&",RowBox[{"b",">","cr"}],"&&",RowBox[{"\\[Gamma]",">","0"}]}]],"Output",CellLabel->"Out[3]="]';
function getCell(expression: string) {
  const result = parseNotebook(`Notebook[{${expression}}]`);
  if (!result.ok) throw new Error(result.error.message);
  const cell = result.model.items[0];
  if (cell.kind !== 'cell') throw new Error('missing cell');
  return cell;
}
describe('standard set TemplateBox regression', () => {
  it('renders the exact screenshot output as one formula without a fallback warning', () => {
    const cell = getCell(output);
    expect(cell.text).toBe('qba∈ℝ&&cr>0&&b>cr&&γ>0');
    expect(cell.warnings).toEqual([]);
    const segment = cell.codeSegments[0];
    expect(segment.kind).toBe('formula');
    if (segment.kind === 'formula') {
      expect(segment.tex).toContain('\\in '); expect(segment.tex).toContain('\\mathbb{R}');
      expect(segment.tex).toContain('\\land ');
      expect(() => katex.renderToString(segment.tex, { throwOnError: true, trust: false })).not.toThrow();
    }
    const source = `Notebook[{${output}}]`, root = document.createElement('div'), pane = new NotebookPane(root);
    pane.setSource(source, 'demo.nb'); pane.result(parseNotebook(source));
    expect(root.querySelector('.mnb-code-formula .katex')).toBeTruthy();
    expect(root.querySelector('.mnb-warning')).toBeNull();
    expect(root.querySelector('.mnb-code-text code')?.textContent).toBe(cell.text);
    expect(source.slice(cell.from, cell.to)).toBe(output);
  });
  it.each([['Reals', 'ℝ', 'R'], ['Integers', 'ℤ', 'Z'], ['Rationals', 'ℚ', 'Q'], ['Complexes', 'ℂ', 'C']])('supports the unmodified %s template', (name, text, letter) => {
    const cell = getCell(`Cell[BoxData[TemplateBox[{},"${name}"]],"Output"]`);
    expect(cell.text).toBe(text); expect(cell.warnings).toEqual([]);
    expect(cell.tex).toContain(`\\mathbb{${letter}}`);
  });
  it.each([
    'TemplateBox[{},"UnknownSet"]', 'TemplateBox[{"x"},"Reals"]',
    'TemplateBox[{},"Reals",DisplayFunction->Run["bad"]]',
    'TemplateBox[{},"Reals",InterpretationFunction->Run["bad"]]',
    'TemplateBox[{},"constructor"]', 'TemplateBox[{},Run["bad"]]',
  ])('keeps custom or unknown templates as source: %s', box => {
    const cell = getCell(`Cell[BoxData[${box}],"Output"]`);
    expect(cell.text).toBe(box); expect(cell.warnings).toContain('TemplateBox');
    expect(cell.codeSegments.some(s => s.kind === 'formula')).toBe(false);
  });
  it('recognizes membership and non-membership without changing logical precedence', () => {
    const tex = codeToTex('x∈ℝ&&y∉ℤ||z>0');
    expect(tex).toContain('\\in '); expect(tex).toContain('\\notin ');
    expect(tex).toContain('\\land '); expect(tex).toContain('\\lor ');
    expect(() => katex.renderToString(tex!, { throwOnError: true, trust: false })).not.toThrow();
  });
});
