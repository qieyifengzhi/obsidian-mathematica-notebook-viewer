export class TFile {
  constructor(public path: string, public stat = { size: 100, mtime: 0, ctime: 0 }) {}
  get basename() { return this.path.split('/').pop()!.replace(/\.[^.]*$/, ''); }
  get extension() { return this.path.split('.').pop()!; }
}
class Component {
  cleanups: (() => void)[] = [];
  register(fn: () => void) { this.cleanups.push(fn); }
  registerEvent(ref: { off?: () => void }) { this.register(() => ref.off?.()); }
  unload() { for (const fn of this.cleanups.reverse()) fn(); }
}
export class FileView extends Component {
  contentEl = document.createElement('div');
  app: any;
  file: TFile | null = null;
  constructor(public leaf: any) { super(); this.app = leaf.app; }
  async onClose() {}
}
export class Notice {
  static messages: string[] = [];
  constructor(message: string) { Notice.messages.push(message); }
}
export class Plugin extends Component {
  commands: any[] = [];
  views = new Map<string, unknown>();
  constructor(public app: any) { super(); }
  registerView(type: string, creator: unknown) { this.views.set(type, creator); }
  registerExtensions(extensions: string[], type: string) { this.app.registerExtensions?.(extensions, type); }
  addCommand(command: any) { this.commands.push(command); }
}
export class FuzzySuggestModal<T> {
  opened = false;
  constructor(public app: any) {}
  setPlaceholder(_s: string) {}
  open() { this.opened = true; }
}
