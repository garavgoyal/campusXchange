import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { getSupabaseAdmin } from '../../database/supabase.client.js';
import type { AuthedUser } from './supabase-auth.guard.js';

/**
 * Never rejects. Attaches the user when a valid token is present, leaves
 * request.user undefined otherwise — used by guest-browsable routes so they can
 * decide how much of a row to reveal.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers?.authorization;

    if (!authHeader?.startsWith('Bearer ')) return true;

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) return true;

    const { data, error } = await getSupabaseAdmin().auth.getUser(token);
    if (!error && data.user) {
      request.user = { id: data.user.id, email: data.user.email ?? '' } satisfies AuthedUser;
    }
    return true;
  }
}
