/** Reads Supabase credentials from .env — service role key is backend-only. */
export const supabaseConfig = () => ({
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  idCardBucket: process.env.SUPABASE_ID_CARD_BUCKET ?? 'id-cards',
});
