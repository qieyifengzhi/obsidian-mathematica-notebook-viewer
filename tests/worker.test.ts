import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParseClient } from '../src/parse-client';
import { LIMITS } from '../src/types';
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage?: (e: { data: unknown }) => void;
  onerror?: (e: { preventDefault: () => void }) => void;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor(public url: string) { FakeWorker.instances.push(this); }
}
function setup() {
  const revoke = vi.fn();
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: revoke });
  return { client: new ParseClient(), revoke };
}
describe('worker lifetime and timeout', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); FakeWorker.instances = []; });
  it('terminates and revokes the Blob after success', async () => {
    const { client, revoke } = setup(), promise = client.parse('Notebook[{}]'), worker = FakeWorker.instances[0];
    worker.onmessage!({ data: { ok: true, model: {} } }); expect((await promise).ok).toBe(true);
    expect(worker.terminate).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledWith('blob:test');
  });
  it('cancels obsolete parses and ignores late worker replies', async () => {
    const { client } = setup(), old = client.parse('old'), worker = FakeWorker.instances[0];
    const next = client.parse('new'); worker.onmessage!({ data: { ok: true } });
    expect((await old).ok).toBe(false); client.cancel(); expect((await next).ok).toBe(false);
  });
  it('terminates a hung worker after the deadline', async () => {
    vi.useFakeTimers(); const { client, revoke } = setup(), promise = client.parse('slow');
    await vi.advanceTimersByTimeAsync(LIMITS.workerMs + 1);
    expect((await promise).ok).toBe(false); expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledOnce();
  });
  it('retains a source fallback when Worker creation is unavailable', async () => {
    const { client, revoke } = setup(); vi.stubGlobal('Worker', class { constructor() { throw new Error('CSP'); } });
    const result = await client.parse('source'); expect(result.ok).toBe(false); expect(revoke).toHaveBeenCalledOnce();
  });
});
