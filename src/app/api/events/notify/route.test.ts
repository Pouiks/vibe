import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeAdminMock } from '@/test/supabaseMock';

const { createServerSupabaseMock, createClientMock, sendNotificationMock } = vi.hoisted(() => ({
  createServerSupabaseMock: vi.fn(),
  createClientMock: vi.fn(),
  sendNotificationMock: vi.fn(),
}));

vi.mock('@/core/supabase/server', () => ({ createServerSupabase: createServerSupabaseMock }));
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));
vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: sendNotificationMock },
}));

import { POST } from './route';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';

function authAs(user: { id: string } | null) {
  createServerSupabaseMock.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user } }) },
  });
}

function post(body: unknown) {
  return POST(new Request('http://localhost/api/events/notify', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as never);
}

const baseEvent = (creatorId: string) => ({
  id: 'e1',
  title: '3vs3 Basket',
  start_time: new Date(Date.now() + 25 * 60_000).toISOString(),
  max_participants: 6,
  creator_id: creatorId,
  notified_at: null,
  venues: { id: 'v1', name: 'Terrain Central', slug: 'paris/centre/terrain' },
});

describe('POST /api/events/notify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendNotificationMock.mockResolvedValue(undefined);
  });

  it('rejects unauthenticated callers with 401', async () => {
    authAs(null);
    const res = await post({ event_id: 'e1' });
    expect(res.status).toBe(401);
  });

  it('rejects a missing event_id with 400', async () => {
    authAs({ id: 'u1' });
    createClientMock.mockReturnValue(makeAdminMock({}));
    const res = await post({});
    expect(res.status).toBe(400);
  });

  it('rejects a caller who is not the event creator with 403', async () => {
    authAs({ id: 'u1' });
    createClientMock.mockReturnValue(makeAdminMock({
      events: [{ data: baseEvent('someone-else') }],
    }));
    const res = await post({ event_id: 'e1' });
    expect(res.status).toBe(403);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it('sends nothing when the event was already notified (idempotence)', async () => {
    authAs({ id: 'u1' });
    const admin = makeAdminMock({
      events: [
        { data: baseEvent('u1') },
        { data: [] }, // claim update matched no row: already notified
      ],
    });
    createClientMock.mockReturnValue(admin);

    const res = await post({ event_id: 'e1' });
    const body = await res.json();

    expect(body.sent).toBe(0);
    expect(body.message).toMatch(/already/i);
    expect(sendNotificationMock).not.toHaveBeenCalled();
    // The claim must be conditional on notified_at IS NULL, keyed on the event.
    expect(admin.calls.events[1]).toContainEqual({ method: 'is', args: ['notified_at', null] });
    expect(admin.calls.events[1]).toContainEqual({ method: 'eq', args: ['id', 'e1'] });
    expect(admin.calls.events[1].some(c => c.method === 'update' && 'notified_at' in (c.args[0] as object))).toBe(true);
  });

  it('skips subscribers inside the 30 s cooldown window', async () => {
    authAs({ id: 'u1' });
    const admin = makeAdminMock({
      events: [
        { data: baseEvent('u1') },
        { data: [{ id: 'e1' }] },
      ],
      channel_subscriptions: [
        { data: [{ user_id: 'u2', muted: false, last_notified_at: new Date(Date.now() - 5_000).toISOString() }] },
      ],
    });
    createClientMock.mockReturnValue(admin);

    const res = await post({ event_id: 'e1' });
    const body = await res.json();

    expect(body.sent).toBe(0);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it('notifies venue subscribers once, then stamps the cooldown', async () => {
    authAs({ id: 'u1' });
    const admin = makeAdminMock({
      events: [
        { data: baseEvent('u1') },
        { data: [{ id: 'e1' }] }, // claim succeeded
      ],
      channel_subscriptions: [
        { data: [{ user_id: 'u2', muted: false, last_notified_at: null }] },
        { data: null }, // cooldown batch update
      ],
      push_subscriptions: [{ data: [{ endpoint: 'https://push/e2', auth: 'a', p256dh: 'p', user_id: 'u2' }] }],
    });
    createClientMock.mockReturnValue(admin);

    const res = await post({ event_id: 'e1' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    expect(body.sent).toBe(1);
    // Creator exclusion is a DB-side filter: it must actually be applied.
    expect(admin.calls.channel_subscriptions[0]).toContainEqual({ method: 'neq', args: ['user_id', 'u1'] });
    // The cooldown write must be recorded for the notified users.
    const cooldownChain = admin.calls.channel_subscriptions[1];
    expect(cooldownChain.some(c => c.method === 'update' && 'last_notified_at' in (c.args[0] as object))).toBe(true);
  });
});
