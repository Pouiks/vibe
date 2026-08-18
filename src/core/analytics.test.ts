import { describe, it, expect, vi, beforeEach } from 'vitest';

const { insertMock, fromMock } = vi.hoisted(() => {
  const insertMock = vi.fn();
  return { insertMock, fromMock: vi.fn(() => ({ insert: insertMock })) };
});

vi.mock('@/core/supabase/client', () => ({ supabase: { from: fromMock } }));

import { track, getAnonId } from './analytics';

function stubLocalStorage() {
  const store: Record<string, string> = {};
  globalThis.localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; },
    key: () => null,
    length: 0,
  } as Storage;
}

describe('analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockReturnValue({ then: (cb: (r: { error: null }) => void) => cb({ error: null }) });
    stubLocalStorage();
  });

  it('generates a stable anonymous id persisted on the device', () => {
    const first = getAnonId();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(getAnonId()).toBe(first);
  });

  it('logs the funnel event with venue, user and anon id', () => {
    const anonId = getAnonId();
    track('qr_visit', { venueId: 'v1', userId: 'u1' });

    expect(fromMock).toHaveBeenCalledWith('analytics_events');
    expect(insertMock).toHaveBeenCalledWith({
      event_type: 'qr_visit',
      venue_id: 'v1',
      user_id: 'u1',
      anon_id: anonId,
    });
  });

  it('logs anonymous visits with null user', () => {
    track('qr_visit', { venueId: 'v1' });
    expect(insertMock.mock.calls[0][0].user_id).toBeNull();
  });

  it('never throws when storage or network fail', () => {
    globalThis.localStorage = {
      getItem: () => { throw new Error('blocked'); },
    } as unknown as Storage;
    insertMock.mockImplementation(() => { throw new Error('offline'); });

    expect(() => track('scan_success', { venueId: 'v1' })).not.toThrow();
    expect(getAnonId()).toBe('unknown');
  });
});
