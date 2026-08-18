import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createServerSupabaseMock, createClientMock, deleteUserMock } = vi.hoisted(() => ({
  createServerSupabaseMock: vi.fn(),
  createClientMock: vi.fn(),
  deleteUserMock: vi.fn(),
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

describe('POST /api/account/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockReturnValue({ auth: { admin: { deleteUser: deleteUserMock } } });
  });

  it('rejects unauthenticated callers with 401', async () => {
    authAs(null);
    const res = await POST();
    expect(res.status).toBe(401);
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('deletes exactly the authenticated user', async () => {
    authAs({ id: 'u1' });
    deleteUserMock.mockResolvedValue({ error: null });
    const res = await POST();
    expect(res.status).toBe(200);
    expect(deleteUserMock).toHaveBeenCalledTimes(1);
    expect(deleteUserMock).toHaveBeenCalledWith('u1');
  });

  it('reports a deletion failure as 500', async () => {
    authAs({ id: 'u1' });
    deleteUserMock.mockResolvedValue({ error: { message: 'boom' } });
    const res = await POST();
    expect(res.status).toBe(500);
  });
});
