// Demo reset. Spec 6.9: deletes all transactional rows and keeps the reference data.
// Needs the DEMO_RESET_TOKEN header. Runs with the service role.

import type { Config } from '@netlify/functions'
import { jsonError } from './_lib/aiStep'
import { supabaseAdmin } from './_lib/supabaseAdmin'

/** Delete order respects the foreign keys. Cascades from requests cover the rest, but every table is listed for the counts. */
const TRANSACTIONAL = ['events', 'orders', 'feasibility_checks', 'customer_responses', 'quotation_lines', 'lines', 'quotations', 'requests', 'ai_runs'] as const

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return jsonError(405, 'Use POST.', 'Send the reset as a POST request.')
  const expected = Netlify.env.get('DEMO_RESET_TOKEN')
  if (!expected) return jsonError(500, 'The reset token is not configured on the server.', 'Tell the administrator.')
  const given = req.headers.get('x-demo-reset-token') ?? ''
  if (given !== expected) return jsonError(403, 'The reset token is wrong.', 'Ask the administrator for the token and try again.')

  const db = supabaseAdmin()
  const deleted: Record<string, number> = {}
  for (const table of TRANSACTIONAL) {
    // Clear the self reference before deleting orders, then delete everything.
    if (table === 'orders') {
      const { error: unlink } = await db.from('requests').update({ order_id: null }).not('order_id', 'is', null)
      if (unlink) return jsonError(500, `requests unlink: ${unlink.message}`, 'Try again.')
    }
    const { count, error } = await db.from(table).delete({ count: 'exact' }).not('id', 'is', null)
    if (error) return jsonError(500, `${table}: ${error.message}`, 'Try again. If it happens twice, tell the administrator.')
    deleted[table] = count ?? 0
  }
  return Response.json({ ok: true, deleted, kept: ['customers', 'catalog_profiles', 'catalog_materials', 'feasibility_rules', 'legacy_quotes', 'ai_replay'] })
}

export const config: Config = {
  path: '/api/demo/reset',
}
