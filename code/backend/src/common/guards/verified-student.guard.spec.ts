import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { vi } from 'vitest';

// A tiny fake of the two Supabase calls the guard makes.
const state: {
  user: { id: string; email: string } | null;
  profile: { id_verified: string; role: string } | null;
} = { user: null, profile: null };

vi.mock('../../database/supabase.client.js', () => ({
  getSupabaseAdmin: () => ({
    auth: {
      getUser: async () =>
        state.user ? { data: { user: state.user }, error: null } : { data: { user: null }, error: { message: 'bad' } },
    },
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: state.profile, error: null }) }),
      }),
    }),
  }),
}));

const { VerifiedStudentGuard } = await import('./verified-student.guard.js');

function contextWith(authorization?: string) {
  const request: { headers: Record<string, string>; user?: unknown } = {
    headers: authorization ? { authorization } : {},
  };
  const ctx = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  return { ctx, request };
}

describe('VerifiedStudentGuard', () => {
  const guard = new VerifiedStudentGuard();

  beforeEach(() => {
    state.user = { id: 'u1', email: 'a@thapar.edu' };
    state.profile = { id_verified: 'verified', role: 'student' };
  });

  it('rejects a request with no token', async () => {
    const { ctx } = contextWith();
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an invalid session', async () => {
    state.user = null;
    const { ctx } = contextWith('Bearer nope');
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('blocks a student whose ID is still pending', async () => {
    state.profile = { id_verified: 'pending', role: 'student' };
    const { ctx } = contextWith('Bearer t');
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks a student whose ID was rejected, with a re-upload hint', async () => {
    state.profile = { id_verified: 'rejected', role: 'student' };
    const { ctx } = contextWith('Bearer t');
    await expect(guard.canActivate(ctx)).rejects.toThrow(/rejected/i);
  });

  it('lets a verified student through and attaches the user', async () => {
    const { ctx, request } = contextWith('Bearer t');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'u1', email: 'a@thapar.edu' });
  });

  it('lets an admin through even without a verified ID', async () => {
    state.profile = { id_verified: 'pending', role: 'admin' };
    const { ctx } = contextWith('Bearer t');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
