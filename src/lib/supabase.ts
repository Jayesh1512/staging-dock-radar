/**
 * Server-side Supabase client (service-role key).
 *
 * NEVER import this in client components — the service-role key has full DB access.
 * All Supabase calls happen inside API routes (server-side only).
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  // Allow build to succeed without env vars (e.g. CI, static pages).
  // Runtime calls will throw if env vars are missing.
  console.warn('[supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — DB calls will fail at runtime');
}

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseKey ?? 'placeholder',
  { auth: { persistSession: false } },
);

/** Throws a clear error if Supabase env vars are not configured */
export function requireSupabase() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables');
  }
  return supabase;
}
