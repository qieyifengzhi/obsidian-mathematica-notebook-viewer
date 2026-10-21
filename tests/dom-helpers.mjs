// Minimal host helper used by tests; creates nodes in the parent's own document.
export function installDomHelpers(win) {
  win.HTMLElement.prototype.createEl = function(tag) {
    const child = this.ownerDocument.createElement(tag);
    this.appendChild(child);
    return child;
  };
}
