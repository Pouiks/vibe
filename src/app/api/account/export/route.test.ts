import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeAdminMock } from '@/test/supabaseMock';

const { createServerSupabaseMock, createClientMock } = vi.hoisted(() => ({
  createServerSupabaseMock: vi.fn(),
  createClientMock: vi.fn(),
}));

vi.mock('@/core/supabase/server', () => ({ createServerSupabase: createServerSupabaseMock }));
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

import { GET } from './route';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';

function authAs(user: { id: string; email?: string; created_at?: string } | null) {
  createServerSupabaseMock.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user } }) },
  });
}

describe('GET /api/account/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated callers with 401', async () => {
    authAs(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns a downloadable JSON scoped to the authenticated user', async () => {
    authAs({ id: 'u1', email: 'v@test.fr', created_at: '2026-01-01T00:00:00Z' });
    const admin = makeAdminMock({
      profiles: [{ data: { username: 'CosmicPanda42', first_name: '', age: null, gender: '', bio: '', created_at: '2026-01-01' } }],
      channel_subscriptions: [{ data: [{ venue_id: 'v1', muted: false, created_at: '2026-02-01', venues: { name: 'Le Spot', slug: 's' } }] }],
      messages: [{ data: [{ content: 'salut', created_at: '2026-02-02', venue_id: 'v1', event_id: null, is_on_site: true }] }],
      events: [{ data: [] }],
      event_participants: [{ data: [] }],
      push_subscriptions: [{ data: [] }],
    });
    createClientMock.mockReturnValue(admin);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain('vibespot-mes-donnees.json');

    const body = JSON.parse(await res.text());
    expect(body.account.email).toBe('v@test.fr');
    expect(body.profile.username).toBe('CosmicPanda42');
    expect(body.messages).toHaveLength(1);
    expect(body.spots_rejoints).toHaveLength(1);

    // Every table query must be scoped to the authenticated user's id.
    for (const table of ['profiles', 'channel_subscriptions', 'messages', 'events', 'event_participants', 'push_subscriptions']) {
      const chain = admin.calls[table][0];
      const scoped = chain.some(c => c.method === 'eq' && (c.args[0] === 'user_id' || c.args[0] === 'id' || c.args[0] === 'creator_id') && c.args[1] === 'u1');
      expect(scoped, `${table} query not scoped to user`).toBe(true);
    }
  });
});
