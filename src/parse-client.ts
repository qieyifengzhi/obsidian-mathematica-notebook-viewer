import { LIMITS, type ParseResult } from './types';
declare const __PARSER_WORKER__: string;

/** One worker per open view; cancel/refresh/unload terminate it and release its Blob URL. */
export class ParseClient {
  private active?: { cancel: () => void };
  cancel() { this.active?.cancel(); }
  parse(source: string): Promise<ParseResult> {
    this.cancel();
    return new Promise(resolve => {
      let worker: Worker | undefined, url: string | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      const finish = (result: ParseResult) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        worker?.terminate();
        if (url) URL.revokeObjectURL(url);
        this.active = undefined;
        resolve(result);
      };
      this.active = { cancel: () => finish({ ok: false, error: { message: '解析已取消' } }) };
      try {
        url = URL.createObjectURL(new Blob([__PARSER_WORKER__], { type: 'text/javascript' }));
        worker = new Worker(url);
        timer = setTimeout(() => finish({ ok: false, error: { message: '解析超过 7 秒，已终止；请查看原始源码' } }), LIMITS.workerMs);
        worker.onmessage = event => finish(event.data as ParseResult);
        worker.onerror = event => {
          event.preventDefault();
          finish({ ok: false, error: { message: '后台解析器启动或运行失败；可查看原始源码。请检查 Obsidian 的 Worker 限制' } });
        };
        worker.postMessage(source);
      } catch {
        finish({ ok: false, error: { message: '无法创建后台解析器，已保留原始源码视图' } });
      }
    });
  }
}
