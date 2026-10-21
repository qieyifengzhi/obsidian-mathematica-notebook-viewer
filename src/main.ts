import { FileView, FuzzySuggestModal, Notice, Plugin, TFile, type WorkspaceLeaf } from 'obsidian';
import { ParseClient } from './parse-client';
import { NotebookPane } from './renderer';
import { LIMITS } from './types';

export const VIEW_TYPE = 'mathematica-notebook-viewer';

/** FileView intentionally avoids TextFileView/EditableFileView's save and rename lifecycle. */
export class NotebookView extends FileView {
  private parser: ParseClient;
  private readonly hostWindow: Window;
  private pane: NotebookPane;
  private target: TFile | null = null;
  private revision = 0;
  private debounce?: number;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.hostWindow = this.contentEl.ownerDocument.defaultView ?? window;
    this.parser = new ParseClient(this.hostWindow);
    this.pane = new NotebookPane(this.contentEl);
    this.registerEvent(this.app.vault.on('modify', file => {
      if (file !== this.target) return;
      // Invalidate a read/parse immediately, before the debounce window.
      this.revision++;
      this.parser.cancel();
      if (this.debounce) this.hostWindow.clearTimeout(this.debounce);
      this.debounce = this.hostWindow.setTimeout(() => { void this.reload(false); }, 250);
    }));
    this.register(() => this.dispose());
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return this.target?.basename ?? 'Mathematica Notebook'; }
  getIcon() { return 'file-code'; }
  canAcceptExtension(extension: string) { return extension.toLowerCase() === 'nb'; }

  async onLoadFile(file: TFile): Promise<void> {
    this.target = file;
    await this.reload(true);
  }
  async onUnloadFile(_file: TFile): Promise<void> {
    this.target = null;
    this.dispose();
    this.pane.clear();
  }
  async onClose(): Promise<void> { this.target = null; this.dispose(); this.pane.clear(); }
  private dispose() {
    this.revision++;
    if (this.debounce) this.hostWindow.clearTimeout(this.debounce);
    this.debounce = undefined;
    this.parser.cancel();
  }
  async reload(reset = false): Promise<void> {
    const file = this.target;
    if (!file) return;
    const token = ++this.revision;
    this.parser.cancel();
    if (reset) this.pane.setSource('', file.path, true);
    this.pane.loading(file.path);
    if (file.stat.size > LIMITS.fileBytes) {
      this.pane.setSource('', file.path);
      this.pane.result({ ok: false, error: { message: '文件超过 12 MiB，未读取；请使用外部文本编辑器或 Mathematica 查看' } });
      return;
    }
    try {
      // read(), never cachedRead(): a modify event must reflect the latest disk data.
      const source = await this.app.vault.read(file);
      if (token !== this.revision || file !== this.target) return;
      this.pane.setSource(source, file.path, reset);
      const result = await this.parser.parse(source);
      if (token !== this.revision || file !== this.target) return;
      this.pane.result(result);
    } catch (error) {
      if (token !== this.revision) return;
      this.pane.setSource('', file.path);
      this.pane.result({ ok: false, error: { message: `读取失败：${error instanceof Error ? error.message : String(error)}` } });
    }
  }
}

class NotebookPicker extends FuzzySuggestModal<TFile> {
  constructor(private owner: NotebookViewerPlugin) { super(owner.app); this.setPlaceholder('选择 .nb 文件（优先显示 Reference_code）'); }
  getItems() {
    return this.app.vault.getFiles().filter(file => file.extension.toLowerCase() === 'nb')
      .sort((a, b) => Number(!a.path.startsWith('Reference_code/')) - Number(!b.path.startsWith('Reference_code/')) || a.path.localeCompare(b.path));
  }
  getItemText(file: TFile) { return file.path; }
  onChooseItem(file: TFile) { void this.owner.openNotebook(file); }
}

export default class NotebookViewerPlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE, leaf => new NotebookView(leaf));
    try {
      // Public registration owns its cleanup. Never unregister another plugin's extension.
      this.registerExtensions(['nb'], VIEW_TYPE);
    } catch {
      new Notice('.nb 已被其他视图注册。Notebook Viewer 保留原关联；请用命令或右键“只读查看 Notebook”打开。', 10000);
    }
    this.addCommand({ id: 'open-notebook', name: '打开 Notebook（只读）', callback: () => new NotebookPicker(this).open() });
    this.addCommand({ id: 'refresh-notebook', name: '刷新当前 Notebook', checkCallback: checking => {
      const view = this.app.workspace.getActiveViewOfType(NotebookView);
      if (!view) return false;
      if (!checking) void view.reload();
      return true;
    } });
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (!(file instanceof TFile) || file.extension.toLowerCase() !== 'nb') return;
      menu.addItem(item => item.setTitle('只读查看 Notebook').setIcon('file-code').onClick(() => { void this.openNotebook(file); }));
    }));
    this.register(() => {
      // Release Blob workers even if the host keeps a leaf alive while disabling the plugin.
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
        if (leaf.view instanceof NotebookView) void leaf.view.onClose();
      }
    });
  }
  async openNotebook(file: TFile) {
    try {
      const leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE, state: { file: file.path }, active: true });
    } catch (error) {
      new Notice(`无法打开 Notebook：${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
