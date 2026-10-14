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
 * Validates the session, then requires the caller to be a *Verified Student*:
 * an account whose ID card an admin has approved (users.id_verified = 'verified').
 *
 * This is the use case diagram's privilege gate. Signing up only proves you own
 * an @thapar.edu mailbox; listing, chatting, offering and transacting need an
 * approved ID card too. Admins always pass so moderators can test the app.
 *
 * Browsing, your own profile and the ID-card upload stay on SupabaseAuthGuard,
 * because an unverified student needs those to *become* verified.
 */
@Injectable()
export class VerifiedStudentGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers?.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) throw new UnauthorizedException('Empty bearer token');

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('Invalid or expired session');

    // Re-read from the database on every request: a verification that is later
    // revoked takes effect immediately, and nothing the client sends can fake it.
    const { data: profile } = await supabase
      .from('users')
      .select('id_verified, role')
      .eq('id', data.user.id)
      .single();

    if (profile?.role !== 'admin' && profile?.id_verified !== 'verified') {
      throw new ForbiddenException(
        profile?.id_verified === 'rejected'
          ? 'Your student ID was rejected. Upload a clearer photo from your profile to continue.'
          : 'Your student ID must be verified by an admin before you can do this.',
      );
    }

    request.user = { id: data.user.id, email: data.user.email ?? '' } satisfies AuthedUser;
    return true;
  }
}
