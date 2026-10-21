import { parseNotebook } from './parser';
// Compiled into a Blob Worker string by esbuild; never contains source generated from a Notebook.
const scope = globalThis as unknown as { onmessage: (event: MessageEvent<string>) => void; postMessage: (value: unknown) => void };
scope.onmessage = event => scope.postMessage(parseNotebook(event.data));
