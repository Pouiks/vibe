import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeAdminMock } from '@/test/supabaseMock';

const { createServerSupabaseMock, createClientMock } = vi.hoisted(() => ({
  createServerSupabaseMock: vi.fn(),
  createClientMock: vi.fn(),
}));

vi.mock('@/core/supabase/server', () => ({ createServerSupabase: createServerSupabaseMock }));
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

import { POST } from './route';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';

function authAs(user: { id: string } | null) {
  createServerSupabaseMock.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user } }) },
  });
}

function post(body: unknown) {
  return POST(new Request('http://localhost/api/admin/venues', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }));
}

const validBody = {
  name: 'Terrain de Basket Montcalm',
  city: 'Bordeaux',
  neighborhood: 'Saint-Émilion',
  category: 'sport',
  lat: '44.8295',
  lng: '-0.5950',
};

const adminProfile = { data: { is_admin: true } };
const regularProfile = { data: { is_admin: false } };

describe('POST /api/admin/venues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated callers with 401', async () => {
    authAs(null);
    const res = await post(validBody);
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin account with 403 without creating anything', async () => {
    authAs({ id: 'u1' });
    const admin = makeAdminMock({ profiles: [regularProfile] });
    createClientMock.mockReturnValue(admin);
    const res = await post(validBody);
    expect(res.status).toBe(403);
    expect(admin.calls.venues).toBeUndefined();
  });

  it('rejects an invalid category with 400', async () => {
    authAs({ id: 'u1' });
    createClientMock.mockReturnValue(makeAdminMock({ profiles: [adminProfile] }));
    const res = await post({ ...validBody, category: 'foot' });
    expect(res.status).toBe(400);
  });

  it('rejects out-of-range coordinates with 400', async () => {
    authAs({ id: 'u1' });
    createClientMock.mockReturnValue(makeAdminMock({ profiles: [adminProfile] }));
    const res = await post({ ...validBody, lng: '200' });
    expect(res.status).toBe(400);
  });

  it('rejects a photo URL outside our storage bucket', async () => {
    authAs({ id: 'u1' });
    createClientMock.mockReturnValue(makeAdminMock({ profiles: [adminProfile] }));
    const res = await post({ ...validBody, photo_url: 'https://evil.com/fake.jpg' });
    expect(res.status).toBe(400);
  });

  it('accepts a photo URL from our bucket and stores it', async () => {
    authAs({ id: 'admin-1' });
    const admin = makeAdminMock({
      profiles: [adminProfile],
      venues: [
        { data: null, error: null },
        { data: { id: 'v1', slug: 'bordeaux/saint-emilion/terrain-de-basket-montcalm', venue_secrets: { scan_token: 'tok123' } } },
      ],
    });
    createClientMock.mockReturnValue(admin);

    const photoUrl = 'https://test.supabase.co/storage/v1/object/public/venue-photos/abc.jpg';
    const res = await post({ ...validBody, photo_url: photoUrl });
    expect(res.status).toBe(201);

    const insertCall = admin.calls.venues[0].find(c => c.method === 'insert');
    expect((insertCall!.args[0] as Record<string, unknown>).photo_url).toBe(photoUrl);
  });

  it('returns 409 when the slug already exists', async () => {
    authAs({ id: 'u1' });
    createClientMock.mockReturnValue(makeAdminMock({
      profiles: [adminProfile],
      venues: [{ data: null, error: { code: '23505', message: 'duplicate' } }],
    }));
    const res = await post(validBody);
    expect(res.status).toBe(409);
  });

  it('creates the venue with a slugified path, EWKT location and the admin as owner', async () => {
    authAs({ id: 'admin-1' });
    const admin = makeAdminMock({
      profiles: [adminProfile],
      venues: [
        { data: null, error: null }, // insert
        { data: { id: 'v1', slug: 'bordeaux/saint-emilion/terrain-de-basket-montcalm', venue_secrets: { scan_token: 'tok123' } } },
      ],
    });
    createClientMock.mockReturnValue(admin);

    const res = await post(validBody);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.slug).toBe('bordeaux/saint-emilion/terrain-de-basket-montcalm');
    expect(body.qr_url).toBe('/l/bordeaux/saint-emilion/terrain-de-basket-montcalm?t=tok123');

    const insertCall = admin.calls.venues[0].find(c => c.method === 'insert');
    expect(insertCall).toBeDefined();
    const row = insertCall!.args[0] as Record<string, unknown>;
    expect(row.slug).toBe('bordeaux/saint-emilion/terrain-de-basket-montcalm');
    expect(row.location).toBe('SRID=4326;POINT(-0.595 44.8295)'); // longitude d'abord
    expect(row.owner_id).toBe('admin-1');
  });

  it('reports a missing scan token as a migration problem', async () => {
    authAs({ id: 'admin-1' });
    createClientMock.mockReturnValue(makeAdminMock({
      profiles: [adminProfile],
      venues: [
        { data: null, error: null },
        { data: { id: 'v1', slug: 'x/y/z', venue_secrets: null } },
      ],
    }));
    const res = await post(validBody);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/migration/i);
  });
});
