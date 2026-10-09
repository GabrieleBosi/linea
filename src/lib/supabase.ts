import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/repo/database.types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True when the build received the Supabase variables. The UI shows a setup message otherwise. */
export const supabaseConfigured = Boolean(url && anonKey)

/** Browser client with the anon key only. Never put another key here. */
export const supabase = createClient<Database>(url ?? 'http://localhost:54321', anonKey ?? 'missing', {
  auth: { persistSession: false, autoRefreshToken: false },
})
