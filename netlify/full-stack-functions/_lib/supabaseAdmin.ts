import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../src/repo/database.types'

/**
 * Service-role client for Netlify functions. Bypasses Row Level Security.
 * The key comes from the injected environment only. Never import this from src/.
 */
export function supabaseAdmin(): SupabaseClient<Database> {
  const url = Netlify.env.get('SUPABASE_URL')
  const key = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment.')
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
