// Supabase-backed replay store and AI run writer. Server side only (service role):
// Netlify functions and scripts. Never import from the UI.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/repo/database.types'
import type { AiRunInsert, ReplayStore, StepName } from './types'

export function createSupabaseReplayStore(db: SupabaseClient<Database>): ReplayStore {
  return {
    async get(step: StepName, key: string) {
      const { data, error } = await db.from('ai_replay').select('output').eq('step', step).eq('input_hash', key).maybeSingle()
      if (error) throw new Error(`ai_replay read: ${error.message}`)
      return data ? data.output : null
    },
    async put(step: StepName, key: string, output: unknown) {
      const { error } = await db.from('ai_replay').upsert({ step, input_hash: key, output: output as Json }, { onConflict: 'step,input_hash' })
      if (error) throw new Error(`ai_replay write: ${error.message}`)
    },
  }
}

export async function insertAiRun(db: SupabaseClient<Database>, run: AiRunInsert): Promise<string> {
  const { data, error } = await db
    .from('ai_runs')
    .insert({
      step: run.step,
      mode: run.mode,
      model: run.model,
      request_id: run.request_id,
      line_id: run.line_id,
      input: run.input as Json,
      raw_output: run.raw_output,
      output: run.output as Json,
      checks: run.checks as unknown as Json,
      latency_ms: run.latency_ms,
      tokens_in: run.tokens_in,
      tokens_out: run.tokens_out,
    })
    .select('id')
    .single()
  if (error) throw new Error(`ai_runs write: ${error.message}`)
  return data.id
}

export async function recordDecision(db: SupabaseClient<Database>, ai_run_id: string, accepted: boolean, edited: boolean): Promise<void> {
  const { error } = await db.from('ai_runs').update({ accepted, edited }).eq('id', ai_run_id)
  if (error) throw new Error(`ai_runs update: ${error.message}`)
}
