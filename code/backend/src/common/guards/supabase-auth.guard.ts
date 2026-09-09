import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { getSupabaseAdmin } from '../../database/supabase.client.js';

export type AuthedUser = { id: string; email: string };

/**
 * Validates the Supabase access token the mobile app sends as
 * `Authorization: Bearer <token>` and attaches the user to the request.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers?.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) throw new UnauthorizedException('Empty bearer token');

    const { data, error } = await getSupabaseAdmin().auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    request.user = { id: data.user.id, email: data.user.email ?? '' } satisfies AuthedUser;
    return true;
  }
}
