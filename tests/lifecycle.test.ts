import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotebookViewerPlugin, { NotebookView, VIEW_TYPE } from '../src/main';
import { TFile, Notice } from './obsidian-mock';
import { LIMITS } from '../src/types';

vi.mock('../src/parse-client', async () => {
  const { parseNotebook } = await import('../src/parser');
  return { ParseClient: class { cancel() {} async parse(source: string) { return parseNotebook(source); } } };
});

function fakeApp() {
  const handlers = new Map<string, Set<(...args: any[]) => void>>();
  const on = (name: string, callback: (...args: any[]) => void) => {
    if (!handlers.has(name)) handlers.set(name, new Set());
    handlers.get(name)!.add(callback);
    return { off: () => handlers.get(name)!.delete(callback) };
  };
  const write = vi.fn(() => { throw new Error('A read-only view must never write!'); });
  const state = vi.fn(async () => {});
  return {
    vault: { read: vi.fn(async () => 'Notebook[{Cell["initial","Text"]}]'), on, modify: write,
      create: write, delete: write, rename: write, process: write, adapter: { write }, getFiles: () => [] },
    workspace: { on, getLeavesOfType: () => [], getLeaf: () => ({ setViewState: state }), getActiveViewOfType: () => null },
    registerExtensions: vi.fn(),
    emit: (name: string, ...args: any[]) => handlers.get(name)?.forEach(cb => cb(...args)),
    write, state, handlers,
  };
}
describe('view lifecycle / read-only / conflict handling', () => {
  beforeEach(() => { Notice.messages = []; vi.useRealTimers(); });
  it('opens, refreshes, changes mode, unloads and closes without any writes', async () => {
    const app = fakeApp(), view = new NotebookView({ app } as any), f = new TFile('Reference_code/a.nb');
    await view.onLoadFile(f as any);
    expect(view.contentEl.textContent).toContain('initial');
    await view.reload();
    [...view.contentEl.querySelectorAll('button')].find(b => b.textContent === '原始源码')!.click();
    await view.onUnloadFile(f as any); await view.onClose(); view.unload();
    expect(app.write).not.toHaveBeenCalled();
    expect((view as any).save).toBeUndefined(); expect((view as any).requestSave).toBeUndefined();
    expect(app.handlers.get('modify')!.size).toBe(0);
  });
  it('reads the modified current file and ignores unrelated files', async () => {
    vi.useFakeTimers();
    const app = fakeApp(), view = new NotebookView({ app } as any), f = new TFile('a.nb');
    await view.onLoadFile(f as any);
    app.vault.read.mockResolvedValue('Notebook[{Cell["updated","Text"]}]');
    app.emit('modify', new TFile('other.nb')); await vi.advanceTimersByTimeAsync(300);
    expect(app.vault.read).toHaveBeenCalledTimes(1);
    app.emit('modify', f); app.emit('modify', f); await vi.advanceTimersByTimeAsync(300);
    expect(app.vault.read).toHaveBeenCalledTimes(2); expect(view.contentEl.textContent).toContain('updated');
    expect(app.write).not.toHaveBeenCalled(); view.unload();
  });
  it('prevents stale reads from overwriting a newer file', async () => {
    const app = fakeApp(), view = new NotebookView({ app } as any);
    let resolveOld: (s: string) => void = () => {};
    app.vault.read.mockImplementationOnce(() => new Promise(r => { resolveOld = r; }));
    const old = view.onLoadFile(new TFile('old.nb') as any);
    app.vault.read.mockResolvedValue('Notebook[{Cell["new file","Text"]}]');
    await view.onLoadFile(new TFile('new.nb') as any);
    resolveOld('Notebook[{Cell["stale file","Text"]}]'); await old;
    expect(view.contentEl.textContent).toContain('new file'); expect(view.contentEl.textContent).not.toContain('stale file');
    view.unload();
  });
  it('does not read oversized files and cancels pending refresh on close', async () => {
    vi.useFakeTimers();
    const app = fakeApp(), view = new NotebookView({ app } as any), f = new TFile('large.nb', { size: LIMITS.fileBytes + 1, mtime: 0, ctime: 0 });
    await view.onLoadFile(f as any); expect(app.vault.read).not.toHaveBeenCalled();
    expect(view.contentEl.textContent).toContain('12 MiB');
    app.emit('modify', f); await view.onClose(); await vi.advanceTimersByTimeAsync(1000);
    app.emit('modify', f); await vi.advanceTimersByTimeAsync(1000);
    expect(app.vault.read).not.toHaveBeenCalled(); view.unload();
  });
  it('shows read errors without writing or keeping stale source', async () => {
    const app = fakeApp(), view = new NotebookView({ app } as any);
    app.vault.read.mockRejectedValue(new Error('permission denied'));
    await view.onLoadFile(new TFile('a.nb') as any);
    expect(view.contentEl.textContent).toContain('permission denied'); expect(app.write).not.toHaveBeenCalled(); view.unload();
  });
  it('keeps an existing .nb association and provides explicit open actions', async () => {
    const app = fakeApp(); app.registerExtensions.mockImplementation(() => { throw new Error('already registered'); });
    const plugin = new NotebookViewerPlugin(app as any, {} as any);
    await plugin.onload();
    expect(Notice.messages[0]).toContain('保留原关联');
    expect((plugin as any).commands).toHaveLength(2);
    expect((plugin as any).views.has(VIEW_TYPE)).toBe(true);
    await plugin.openNotebook(new TFile('Reference_code/a.nb') as any);
    expect(app.state).toHaveBeenCalledWith({ type: VIEW_TYPE, state: { file: 'Reference_code/a.nb' }, active: true });
    const addItem = vi.fn(fn => fn({ setTitle() { return this; }, setIcon() { return this; }, onClick() { return this; } }));
    app.emit('file-menu', { addItem }, new TFile('a.nb')); expect(addItem).toHaveBeenCalledTimes(1);
    expect(app.write).not.toHaveBeenCalled(); plugin.unload();
  });
});
