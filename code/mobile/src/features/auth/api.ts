import { supabase } from '../../lib/supabaseClient';
import type { SendOtpResult, VerifyOtpResult } from './types';

/** Sends a 6-digit OTP to the given college email, creating the account if new. */
export async function sendOtp(email: string): Promise<SendOtpResult> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  return { error: error?.message ?? null };
}

/** Exchanges the emailed code for a real session (stored via AsyncStorage). */
export async function verifyOtp(email: string, token: string): Promise<VerifyOtpResult> {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });
  return { error: error?.message ?? null, success: !!data.session };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
