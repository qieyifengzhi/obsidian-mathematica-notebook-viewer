export const LIMITS = Object.freeze({
  fileBytes: 12 * 1024 * 1024,
  sourceChars: 12 * 1024 * 1024,
  depth: 192,
  nodes: 400_000,
  cells: 10_000,
  parseMs: 5000,
  workerMs: 7000,
  cellChars: 32_000,
  boxNodes: 12_000,
  totalTextChars: 2_000_000,
  mathChars: 4000,
  pageCells: 40,
  sourcePageChars: 60_000,
});

export interface Span { from: number; to: number }
export interface Fragment {
  text: string;
  tex?: string;
  math: boolean;
  supported: boolean;
}
export type CodeSegment = { kind: 'comment' | 'code'; text: string } | { kind: 'formula'; text: string; tex: string };
export interface NotebookCell extends Span {
  kind: 'cell';
  id: number;
  style: string;
  label: string;
  text: string;
  tex?: string;
  runs: Fragment[];
  codeSegments: CodeSegment[];
  warnings: string[];
}
export interface NotebookGroup extends Span {
  kind: 'group';
  id: number;
  open: boolean;
  title: string;
  children: NotebookItem[];
}
export type NotebookItem = NotebookCell | NotebookGroup;
export interface NotebookModel {
  items: NotebookItem[];
  cellCount: number;
  groupCount: number;
  warnings: string[];
  elapsedMs: number;
}
export interface ParseFailure {
  message: string;
  offset?: number;
  line?: number;
  column?: number;
}
export type ParseResult = { ok: true; model: NotebookModel } | { ok: false; error: ParseFailure };
