// Full seed. Run with `npx netlify dev:exec npm run seed` so the service-role key is injected.
// Generates the legacy quotations, writes the seed files, and upserts the reference data:
// catalog, materials, rules, customers, legacy quotes, and the recorded AI outputs of
// src/data/replay into ai_replay, so the Replay switch works on a fresh project.
// Transactional tables are untouched.

import { createClient } from '@supabase/supabase-js'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CATALOG_MATERIALS, CATALOG_PROFILES, FEASIBILITY_RULES } from '../src/domain/catalog'
import type { Database, Json } from '../src/repo/database.types'
import outputs from '../src/data/replay/outputs.json'
import { CUSTOMERS, generateLegacyQuotes, writeSeedFiles } from './generate-legacy'

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set. Run: npx netlify dev:exec npm run seed')
    process.exit(2)
  }
  const db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const files = writeSeedFiles(root)
  console.log(`Seed files written (${files.count} legacy quotations).`)

  const fail = (what: string, error: { message: string } | null) => {
    if (error) {
      console.error(`${what}: ${error.message}`)
      process.exit(1)
    }
  }

  fail('catalog_profiles', (await db.from('catalog_profiles').upsert([...CATALOG_PROFILES], { onConflict: 'family,size' })).error)
  fail('catalog_materials', (await db.from('catalog_materials').upsert([...CATALOG_MATERIALS], { onConflict: 'grade' })).error)
  fail('feasibility_rules', (await db.from('feasibility_rules').upsert([...FEASIBILITY_RULES], { onConflict: 'id' })).error)
  fail(
    'customers',
    (await db.from('customers').upsert(CUSTOMERS.map((c) => ({ name: c.name, segment: c.segment, country: c.country })), { onConflict: 'name' })).error,
  )

  const rows = generateLegacyQuotes()
  for (let i = 0; i < rows.length; i += 100) {
    fail(`legacy_quotes ${i}`, (await db.from('legacy_quotes').upsert(rows.slice(i, i + 100), { onConflict: 'quote_id' })).error)
  }

  // Remove generated rows from an earlier seed that the generator no longer produces.
  const ids = rows.map((r) => r.quote_id)
  const { data: existing, error: listError } = await db.from('legacy_quotes').select('quote_id')
  fail('legacy_quotes list', listError)
  const stale = (existing ?? []).map((r) => r.quote_id).filter((id) => !ids.includes(id))
  if (stale.length > 0) {
    fail('legacy_quotes stale', (await db.from('legacy_quotes').delete().in('quote_id', stale)).error)
  }

  const replay = (outputs as Array<{ step: string; input_hash: string; output: unknown }>).map((e) => ({ step: e.step, input_hash: e.input_hash, output: e.output as Json }))
  fail('ai_replay', (await db.from('ai_replay').upsert(replay, { onConflict: 'step,input_hash' })).error)

  const counts = await Promise.all(
    (['catalog_profiles', 'catalog_materials', 'feasibility_rules', 'customers', 'legacy_quotes', 'ai_replay'] as const).map(async (t) => {
      const { count } = await db.from(t).select('*', { count: 'exact', head: true })
      return `${t}: ${count ?? 0}`
    }),
  )
  console.log(counts.join(', '))
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
