import { vi } from 'vitest';

export interface RecordedCall { method: string; args: unknown[] }

// Chainable thenable standing in for the supabase-js query builder: any method
// call is RECORDED (name + args) and returns the proxy itself; awaiting it
// resolves to the queued result. Recording makes filters and writes assertable
// - a test can verify that `.is('notified_at', null)` was really applied.
function makeChain(result: unknown, calls: RecordedCall[]) {
  const promise = Promise.resolve(result);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proxy: any = new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === 'then') return promise.then.bind(promise);
      if (prop === 'catch') return promise.catch.bind(promise);
      if (prop === 'finally') return promise.finally.bind(promise);
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args });
        return proxy;
      };
    },
  });
  return proxy;
}

// Results are consumed per table in call order; a single entry is reused for
// every call on that table. `calls[table][i]` holds the recorded chain of the
// i-th from(table) invocation.
export function makeAdminMock(tableResults: Record<string, unknown[]>) {
  const calls: Record<string, RecordedCall[][]> = {};
  const from = vi.fn((table: string) => {
    const queue = tableResults[table] ?? [];
    const result = queue.length > 1 ? queue.shift() : queue[0] ?? { data: null, error: null };
    const rec: RecordedCall[] = [];
    (calls[table] ??= []).push(rec);
    return makeChain(result, rec);
  });
  return { from, calls };
}
