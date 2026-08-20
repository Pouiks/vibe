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
  return POST(new Request('http://localhost/api/webhooks/push', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }));
}

const freshMessage = (userId: string) => ({
  id: 'm1',
  venue_id: 'v1',
  event_id: null,
  content: 'salut',
  user_id: userId,
  created_at: new Date().toISOString(),
});

describe('POST /api/webhooks/push', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendNotificationMock.mockResolvedValue(undefined);
  });

  it('rejects unauthenticated callers with 401', async () => {
    authAs(null);
    const res = await post({ message_id: 'm1' });
    expect(res.status).toBe(401);
  });

  it('rejects a missing message_id with 400', async () => {
    authAs({ id: 'u1' });
    createClientMock.mockReturnValue(makeAdminMock({}));
    const res = await post({});
    expect(res.status).toBe(400);
  });

  it("rejects a caller who is not the message author with 403", async () => {
    authAs({ id: 'u1' });
    createClientMock.mockReturnValue(makeAdminMock({
      messages: [{ data: freshMessage('someone-else') }],
    }));
    const res = await post({ message_id: 'm1' });
    expect(res.status).toBe(403);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it('skips messages older than the freshness window', async () => {
    authAs({ id: 'u1' });
    createClientMock.mockReturnValue(makeAdminMock({
      messages: [{ data: { ...freshMessage('u1'), created_at: new Date(Date.now() - 10 * 60_000).toISOString() } }],
    }));
    const res = await post({ message_id: 'm1' });
    expect(res.status).toBe(200);
    expect((await res.json()).message).toMatch(/too old/i);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it('sends nothing when the message was already notified (replay protection)', async () => {
    authAs({ id: 'u1' });
    const admin = makeAdminMock({
      messages: [
        { data: freshMessage('u1') },
        { data: [] }, // claim matched no row: already notified
      ],
    });
    createClientMock.mockReturnValue(admin);

    const res = await post({ message_id: 'm1' });
    const body = await res.json();

    expect(body.sent).toBe(0);
    expect(body.message).toMatch(/already/i);
    expect(sendNotificationMock).not.toHaveBeenCalled();
    // The claim must be conditional on notified_at IS NULL, keyed on the message.
    expect(admin.calls.messages[1]).toContainEqual({ method: 'is', args: ['notified_at', null] });
    expect(admin.calls.messages[1]).toContainEqual({ method: 'eq', args: ['id', 'm1'] });
    expect(admin.calls.messages[1].some(c => c.method === 'update' && 'notified_at' in (c.args[0] as object))).toBe(true);
  });

  it('notifies only unmuted subscribers outside the cooldown, never the sender, then stamps the cooldown', async () => {
    authAs({ id: 'u1' });
    const admin = makeAdminMock({
      messages: [
        { data: freshMessage('u1') },
        { data: [{ id: 'm1' }] }, // claim succeeded
      ],
      venues: [{ data: { slug: 'paris/centre/spot', name: 'Le Spot' } }],
      channel_subscriptions: [
        {
          data: [
            { user_id: 'u2', muted: false, last_notified_at: null },
            { user_id: 'u3', muted: true, last_notified_at: null },
            { user_id: 'u4', muted: false, last_notified_at: new Date(Date.now() - 10_000).toISOString() },
          ],
        },
        { data: null }, // cooldown batch update
      ],
      push_subscriptions: [
        { data: [{ endpoint: 'https://push/e2', p256dh: 'p', auth: 'a', user_id: 'u2' }] },
      ],
    });
    createClientMock.mockReturnValue(admin);

    const res = await post({ message_id: 'm1' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendNotificationMock.mock.calls[0][0].endpoint).toBe('https://push/e2');
    expect(body.sent).toBe(1);
    expect(body.skipped).toBe(2);
    // Sender exclusion is a DB-side filter: it must actually be applied.
    expect(admin.calls.channel_subscriptions[0]).toContainEqual({ method: 'neq', args: ['user_id', 'u1'] });
    // The cooldown write must happen after sending, scoped to the venue.
    const cooldownChain = admin.calls.channel_subscriptions[1];
    expect(cooldownChain.some(c => c.method === 'update' && 'last_notified_at' in (c.args[0] as object))).toBe(true);
    expect(cooldownChain).toContainEqual({ method: 'eq', args: ['venue_id', 'v1'] });
    expect(cooldownChain).toContainEqual({ method: 'in', args: ['user_id', ['u2']] });
  });

  it('notifies only the event participants for an event-chat message', async () => {
    authAs({ id: 'u1' });
    const admin = makeAdminMock({
      messages: [
        { data: { ...freshMessage('u1'), event_id: 'e1' } },
        { data: [{ id: 'm1' }] }, // claim succeeded
      ],
      venues: [{ data: { slug: 'paris/centre/spot', name: 'Le Spot' } }],
      events: [{ data: { title: '3vs3 Basket' } }],
      event_participants: [{ data: [{ user_id: 'u2' }] }],
      push_subscriptions: [
        { data: [{ endpoint: 'https://push/e2', p256dh: 'p', auth: 'a', user_id: 'u2' }] },
      ],
    });
    createClientMock.mockReturnValue(admin);

    const res = await post({ message_id: 'm1' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sent).toBe(1);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(sendNotificationMock.mock.calls[0][1]);
    expect(payload.title).toContain('3vs3 Basket');
    expect(payload.data.url).toBe('/l/paris/centre/spot?tab=events');
    // Participants query must exclude the sender; participation explicite =
    // pas de filtre muted ni de cooldown de spot pour les chats d'events.
    expect(admin.calls.event_participants[0]).toContainEqual({ method: 'neq', args: ['user_id', 'u1'] });
    expect(admin.calls.channel_subscriptions).toBeUndefined();
  });
});
