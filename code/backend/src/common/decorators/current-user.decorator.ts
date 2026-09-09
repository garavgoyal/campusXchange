import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthedUser } from '../guards/supabase-auth.guard.js';

/** Pulls the user that SupabaseAuthGuard attached to the request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthedUser => {
    return ctx.switchToHttp().getRequest().user as AuthedUser;
  },
);
