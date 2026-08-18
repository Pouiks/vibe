import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeAdminMock } from '@/test/supabaseMock';

const { createClientMock, sendNotificationMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  sendNotificationMock: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));
vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: sendNotificationMock },
}));

import { POST } from './route';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';

function post(secret?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret !== undefined) headers['x-cron-secret'] = secret;
  return POST(new Request('http://localhost/api/events/reminders', {
    method: 'POST',
    body: '{}',
    headers,
  }));
}

const dueEvent = {
  id: 'e1',
  title: '3vs3 Basket',
  start_time: new Date(Date.now() + 10 * 60_000).toISOString(),
  venues: { name: 'Terrain Central', slug: 'paris/centre/terrain' },
};

describe('POST /api/events/reminders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'cron-secret-test';
    sendNotificationMock.mockResolvedValue(undefined);
  });

  it('returns 503 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const res = await post('anything');
    expect(res.status).toBe(503);
  });

  it('rejects a missing or wrong secret with 401', async () => {
    expect((await post()).status).toBe(401);
    expect((await post('wrong')).status).toBe(401);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it('does nothing when no event is due', async () => {
    createClientMock.mockReturnValue(makeAdminMock({ events: [{ data: [] }] }));
    const res = await post('cron-secret-test');
    const body = await res.json();
    expect(body).toEqual({ due: 0, sent: 0 });
  });

  it('claims each due event atomically and skips already-claimed ones', async () => {
    const admin = makeAdminMock({
      events: [
        { data: [dueEvent] },
        { data: [] }, // claim lost: another tick already reminded it
      ],
    });
    createClientMock.mockReturnValue(admin);

    const res = await post('cron-secret-test');
    const body = await res.json();

    expect(body.sent).toBe(0);
    expect(sendNotificationMock).not.toHaveBeenCalled();
    expect(admin.calls.events[1]).toContainEqual({ method: 'is', args: ['reminded_at', null] });
    expect(admin.calls.events[1].some(c => c.method === 'update' && 'reminded_at' in (c.args[0] as object))).toBe(true);
  });

  it('reminds every participant of a due event, creator included', async () => {
    const admin = makeAdminMock({
      events: [
        { data: [dueEvent] },
        { data: [{ id: 'e1' }] }, // claim won
      ],
      event_participants: [{ data: [{ user_id: 'u1' }, { user_id: 'u2' }] }],
      push_subscriptions: [{
        data: [
          { endpoint: 'https://push/e1', p256dh: 'p', auth: 'a', user_id: 'u1' },
          { endpoint: 'https://push/e2', p256dh: 'p', auth: 'a', user_id: 'u2' },
        ],
      }],
    });
    createClientMock.mockReturnValue(admin);

    const res = await post('cron-secret-test');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ due: 1, sent: 2 });
    expect(sendNotificationMock).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(sendNotificationMock.mock.calls[0][1]);
    expect(payload.title).toContain('3vs3 Basket');
    expect(payload.data.url).toBe('/l/paris/centre/terrain?tab=events');
  });
});
