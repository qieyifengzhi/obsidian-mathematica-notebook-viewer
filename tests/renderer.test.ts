import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseNotebook } from '../src/parser';
import { NotebookPane } from '../src/renderer';
import { LIMITS } from '../src/types';
import { installDomHelpers } from './dom-helpers.mjs';

function pane(source: string) {
  const root = document.createElement('div');
  const p = new NotebookPane(root);
  p.setSource(source, 'Reference_code/demo.nb', true); p.result(parseNotebook(source));
  return { root, p };
}
function click(root: HTMLElement, label: string) {
  const button = [...root.querySelectorAll('button')].find(b => b.textContent === label);
  expect(button, label).toBeTruthy(); button!.click();
}
describe('safe read-only DOM rendering', () => {
  it('creates all notebook DOM in the owning document of a separate window', () => {
    const frame = document.createElement('iframe'); document.body.appendChild(frame);
    try {
      const win = frame.contentWindow!;
      installDomHelpers(win);
      const root = win.document.createElement('div'), p = new NotebookPane(root);
      p.setSource('Notebook[{Cell["separate window", "Text"]}]', 'demo.nb');
      p.result(parseNotebook('Notebook[{Cell["separate window", "Text"]}]'));
      expect(root.textContent).toContain('separate window');
      expect([...root.querySelectorAll('*')].every(el => el.ownerDocument === win.document)).toBe(true);
      expect(root.querySelector('button')).toBeInstanceOf((win as any).HTMLButtonElement);
    } finally { frame.remove(); }
  });
  it('shows Chinese input comments, inline KaTeX and collapsed groups', () => {
    const { root } = pane(readFileSync('tests/fixtures/demo.nb', 'utf8'));
    expect(root.textContent).toContain('中文教学注释');
    expect(root.querySelector('.katex')).toBeTruthy();
    expect(root.querySelector('button[aria-expanded="false"]')).toBeTruthy();
    expect(root.querySelector('textarea,input,[contenteditable]')).toBeNull();
  });
  it('never turns Notebook HTML, Markdown, links, styles or raw TeX into active DOM', () => {
    const attack = '<img src=x onerror=alert(1)><script>window.pwned=1</script> [[link]] ![](https://evil.test/x)';
    const source = `Notebook[{Cell[${JSON.stringify(attack)},"Text"],Cell[BoxData[StyleBox["\\\\href{https://evil.test}{x}",FontSize->99999]],"Output"]}]`;
    const { root } = pane(source);
    expect(root.textContent).toContain(attack);
    expect(root.querySelector('img,script,a,iframe,object,style')).toBeNull();
    const preview = root.querySelector('.mnb-math-preview') as HTMLDetailsElement;
    preview.open = true; preview.dispatchEvent(new Event('toggle'));
    expect(root.querySelector('a,[href],[onerror]')).toBeNull();
    expect(root.querySelector('.mnb-code-cell')?.getAttribute('style')).not.toContain('99999');
  });
  it('preserves the exact entire source across source/render toggles', () => {
    const source = '(*中文*)Notebook[{Cell["a", "Text"]}]\n';
    const { root } = pane(source);
    click(root, '原始源码'); expect(root.querySelector('.mnb-source code')?.textContent).toBe(source);
    click(root, '渲染视图'); expect(root.textContent).toContain('Text');
    click(root, '原始源码'); expect(root.querySelector('.mnb-source code')?.textContent).toBe(source);
  });
  it('paginates source without dropping characters and retains it after a parse error', () => {
    const source = 'x'.repeat(LIMITS.sourcePageChars) + '<script>tail</script>';
    const { root } = pane(source);
    expect(root.textContent).toContain('无法完整解析');
    click(root, '原始源码');
    const first = root.querySelector('.mnb-source code')!.textContent!;
    click(root, '下一页'); const second = root.querySelector('.mnb-source code')!.textContent!;
    expect(first + second).toBe(source); expect(root.querySelector('script')).toBeNull();
  });
  it('bounds visible DOM rows and lazily attaches cell source', () => {
    const { root } = pane('Notebook[{' + Array.from({ length: 100 }, (_, i) => `Cell["cell ${i}","Text"]`).join(',') + '}]');
    expect(root.querySelectorAll('.mnb-row').length).toBe(LIMITS.pageCells);
    expect(root.querySelector('.mnb-source')).toBeNull();
    const details = root.querySelector('.mnb-cell-source') as HTMLDetailsElement;
    details.open = true; details.dispatchEvent(new Event('toggle'));
    expect(details.querySelector('code')?.textContent).toBe('Cell["cell 0","Text"]');
    click(root, '下一页'); expect(root.textContent).toContain('cell 40');
  });
  it('can expand groups and clears all source on close', () => {
    const { root, p } = pane('Notebook[{Cell[CellGroupData[{Cell["hidden","Text"]},Closed]]}]');
    expect(root.querySelectorAll('.mnb-text-cell').length).toBe(0);
    click(root, '展开全部分组'); expect(root.querySelectorAll('.mnb-text-cell').length).toBe(1);
    p.clear(); expect(root.childNodes.length).toBe(0);
  });
  it('shows annotated Reduce directly as a formula and can restore the code text', () => {
    const input = '(* 中文注释\n解释保持文本 *)\nReduce[(1)/(2) (b-cr-2 qba γ)>0&&0<cr<b&&γ>0,qba]';
    const source = `Notebook[{Cell[BoxData[${JSON.stringify(input)}],"Input"]}]`;
    const { root } = pane(source);
    expect(root.querySelector('.mnb-comment')?.textContent).toContain('中文注释');
    expect(root.querySelector('.mnb-code-formula .katex .mfrac')).toBeTruthy();
    expect(root.querySelector('.mnb-code-text code')?.textContent).toBe(input);
    expect(root.querySelector('.mnb-code-formula .katex-error')).toBeNull();
    click(root, '数学预览：开');
    expect(root.querySelector('.mnb-code-formula')).toBeNull();
    expect(root.querySelector('.mnb-code code')?.textContent).toBe(input);
  });
});
