import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { getSupabaseAdmin } from '../../database/supabase.client.js';
import type { AuthedUser } from './supabase-auth.guard.js';

/**
 * Validates the session, then requires users.role = 'admin'.
 * Make yourself an admin in Supabase: Table Editor -> users -> set role = 'admin'.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers?.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('Invalid or expired session');

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', data.user.id)
      .single();

    if (profile?.role !== 'admin') {
      throw new ForbiddenException('Admins only');
    }

    request.user = { id: data.user.id, email: data.user.email ?? '' } satisfies AuthedUser;
    return true;
  }
}
