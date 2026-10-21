import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { Worker as ThreadWorker } from 'node:worker_threads';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { installDomHelpers } from '../tests/dom-helpers.mjs';

// Exercise the actual distributable main.js, not its TypeScript entry point.
// Obsidian's host API is simulated; DOM, KaTeX and the embedded worker run for real.
const dom = new JSDOM('<!doctype html><body></body>');
installDomHelpers(dom.window);
const blobs = new Map();
let serial = 0, workerCount = 0, terminated = 0, lastModel;
class BrowserWorkerBridge {
  constructor(url) {
    this.pending = [];
    this.stopped = false;
    workerCount++;
    this.ready = blobs.get(url).text().then(code => {
      if (this.stopped) return;
      const prelude = `const {parentPort}=require('node:worker_threads');
        globalThis.self=globalThis;
        globalThis.postMessage=data=>parentPort.postMessage(data);
        parentPort.on('message',data=>globalThis.onmessage({data}));\n`;
      this.worker = new ThreadWorker(prelude + code, { eval: true });
      this.worker.on('message', data => { lastModel = data; this.onmessage?.({ data }); });
      this.worker.on('error', () => this.onerror?.({ preventDefault() {} }));
      for (const data of this.pending) this.worker.postMessage(data);
      this.pending = [];
    });
  }
  postMessage(data) { if (this.worker) this.worker.postMessage(data); else this.pending.push(data); }
  terminate() { if (this.stopped) return; this.stopped = true; terminated++; void this.worker?.terminate(); }
}
const module = { exports: {} };
const context = vm.createContext({
  module, exports: module.exports, console, document: dom.window.document, window: dom.window,
  setTimeout, clearTimeout, Blob, Worker: BrowserWorkerBridge,
  URL: { createObjectURL(blob) { const url = `blob:smoke-${++serial}`; blobs.set(url, blob); return url; }, revokeObjectURL(url) { blobs.delete(url); } },
});
const mock = await build({ entryPoints: ['tests/obsidian-mock.ts'], bundle: true, write: false, format: 'cjs', platform: 'node' });
vm.runInContext(mock.outputFiles[0].text, context);
const obsidian = context.module.exports;
const mainModule = { exports: {} };
context.module = mainModule; context.exports = mainModule.exports;
context.require = id => { assert.equal(id, 'obsidian', 'Runtime dependency must be only Obsidian'); return obsidian; };
vm.runInContext(await readFile('main.js', 'utf8'), context, { filename: 'main.js' });
const Plugin = mainModule.exports.default;
const source = await readFile('tests/fixtures/demo.nb', 'utf8');
const handlers = new Map();
const on = (name, callback) => { handlers.set(name, callback); return { off() { handlers.delete(name); } }; };
let currentSource = source;
const write = () => { throw new Error('Read-only boundary violated'); };
const app = {
  vault: { on, read: async () => currentSource, modify: write, rename: write, create: write, delete: write },
  workspace: { on, getLeavesOfType: () => [], getActiveViewOfType: () => null },
  registerExtensions(extensions, type) { assert.deepEqual(Array.from(extensions), ['nb']); assert.equal(type, 'mathematica-notebook-viewer'); },
};
const plugin = new Plugin(app);
await plugin.onload();
const view = plugin.views.get('mathematica-notebook-viewer')({ app });
const file = new obsidian.TFile('Reference_code/demo.nb', { size: Buffer.byteLength(source) });
await view.onLoadFile(file);
assert.equal(lastModel.ok, true);
assert.equal(lastModel.model.cellCount, 10);
assert.equal(lastModel.model.groupCount, 2);
assert.match(view.contentEl.textContent, /中文教学注释/);
assert.ok(view.contentEl.querySelector('.katex'), 'KaTeX must render in the built bundle');
assert.ok(view.contentEl.querySelector('.mnb-code-cell .mnb-comment'), 'Teaching comments must remain separate text');
assert.ok(view.contentEl.querySelector('.mnb-code-cell .mnb-code-formula .mfrac'), 'Reduce must render its fraction directly in the built bundle');
assert.equal(view.contentEl.querySelector('textarea,[contenteditable],script,img'), null);
const rawButton = Array.from(view.contentEl.querySelectorAll('button')).find(b => b.textContent === '原始源码');
rawButton.click();
assert.equal(view.contentEl.querySelector('code').textContent, source);
// Regression for the reported Out[3]: a standard Reals TemplateBox must no longer
// force the whole output into raw-source fallback.
currentSource = 'Notebook[{Cell[BoxData[RowBox[{RowBox[{"qba","\\[Element]",TemplateBox[{},"Reals"]}],"&&",RowBox[{"cr",">","0"}],"&&",RowBox[{"b",">","cr"}],"&&",RowBox[{"\\[Gamma]",">","0"}]}]],"Output",CellLabel->"Out[3]="]}]';
await view.reload();
Array.from(view.contentEl.querySelectorAll('button')).find(b => b.textContent === '渲染视图').click();
assert.equal(lastModel.ok, true);
assert.equal(lastModel.model.items[0].warnings.length, 0);
assert.match(lastModel.model.items[0].codeSegments[0].tex, /\\mathbb\{R\}/);
assert.ok(view.contentEl.querySelector('.mnb-code-formula .katex'));
assert.equal(view.contentEl.querySelector('.mnb-warning'), null);
currentSource = 'Notebook[{Cell["外部文件已更新", "Text"]}]';
handlers.get('modify')(file);
await new Promise((resolve, reject) => {
  const end = Date.now() + 9000;
  const check = () => {
    if (view.contentEl.textContent.includes('外部文件已更新') && lastModel.ok && lastModel.model.cellCount === 1) resolve();
    else if (Date.now() > end) reject(new Error('Modify event did not refresh the bundled view'));
    else setTimeout(check, 30);
  }; check();
});
await view.onUnloadFile(file); await view.onClose(); view.unload(); plugin.unload();
assert.equal(workerCount, terminated);
assert.equal(blobs.size, 0);
const styles = await readFile('styles.css', 'utf8');
assert.match(styles, /data:font\/woff2;base64,/);
assert.match(styles, /MNB_KaTeX_Main/);
assert.doesNotMatch(styles, /url\((?!data:)[^)]+\)/, 'Fonts must work without external paths/network');
console.log(JSON.stringify({ passed: true, builtBundle: true, host: 'simulated Obsidian API + JSDOM',
  actualEmbeddedWorkers: workerCount, workersTerminated: terminated, blobUrlsRemaining: blobs.size,
  checks: ['registration', 'embedded-worker', 'Chinese-comments', 'direct-Reduce-formula', 'Reals-TemplateBox-output', 'KaTeX-DOM', 'exact-source', 'modify-refresh', 'read-only-close', 'offline-fonts'] }, null, 2));
dom.window.close();
