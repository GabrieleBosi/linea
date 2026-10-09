// The step runner. Spec 4.1: schema, code checks, one revision round where allowed,
// timeouts, retry once on a fast network error, replay fallback. No browser, no Netlify imports.
// The Gemini call itself lives in gemini.ts so that tests can inject a fake client.

import { replayKey } from './replayKey'
import type { Check, ModelClient, ModelResponse, ReplayStore, StepDefinition, StepFailure, StepOutcome, StepResult } from './types'

export type RunOptions = {
  model: string
  client: ModelClient
  replay: ReplayStore | null
  /** 'replay' reads the cache first. 'live' calls the model and falls back to the cache on failure. */
  mode: 'live' | 'replay'
  /** For tests. */
  now?: () => number
}

export class ModelCallError extends Error {
  readonly kind: 'timeout' | 'network' | 'api' | 'aborted'

  constructor(kind: 'timeout' | 'network' | 'api' | 'aborted', message: string) {
    super(message)
    this.name = 'ModelCallError'
    this.kind = kind
  }
}

const FAST_FAILURE_MS = 10_000

function classify(e: unknown): ModelCallError {
  if (e instanceof ModelCallError) return e
  const msg = e instanceof Error ? e.message : String(e)
  if (/abort/i.test(msg)) return new ModelCallError('timeout', 'The model did not answer within the budget.')
  if (/fetch failed|ENOTFOUND|ECONNRESET|ECONNREFUSED|network|socket|EAI_AGAIN/i.test(msg)) return new ModelCallError('network', `Network error: ${msg}`)
  return new ModelCallError('api', msg)
}

async function callWithBudget(client: ModelClient, req: Omit<Parameters<ModelClient>[0], 'signal'>, budget_ms: number): Promise<ModelResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), budget_ms)
  try {
    return await client({ ...req, signal: controller.signal })
  } catch (e) {
    throw classify(e)
  } finally {
    clearTimeout(timer)
  }
}

function parseJson(text: string): { value: unknown; error: string | null } {
  try {
    return { value: JSON.parse(text), error: null }
  } catch (e) {
    return { value: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export function validateOutput<O>(def: StepDefinition<unknown, O>, text: string): { output: O | null; check: Check } {
  const parsed = parseJson(text)
  if (parsed.error) {
    return { output: null, check: { name: 'schema_valid', pass: false, detail: `The output is not JSON: ${parsed.error}` } }
  }
  const r = def.schema.safeParse(parsed.value)
  if (!r.success) {
    const issues = r.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    return { output: null, check: { name: 'schema_valid', pass: false, detail: `The output does not match the schema: ${issues}` } }
  }
  return { output: r.data, check: { name: 'schema_valid', pass: true, detail: 'Output matches the schema.' } }
}

/** Runs one step end to end. Never throws for model or schema problems: it returns a failure with a next action. */
export async function runStep<I, O>(def: StepDefinition<I, O>, input: I, opts: RunOptions): Promise<StepOutcome<O>> {
  const now = opts.now ?? (() => Date.now())
  const started = now()
  const key = await replayKey(def.name, def.replayFields(input))
  const latency = () => now() - started

  const fromReplay = async (): Promise<StepOutcome<O> | null> => {
    if (!opts.replay) return null
    // A failed cache read is a miss, not a crash: replay is also the fallback when the model fails.
    let cached: unknown
    try {
      cached = await opts.replay.get(def.name, key)
    } catch {
      return null
    }
    if (cached === null || cached === undefined) return null
    const v = validateOutput(def as StepDefinition<unknown, O>, JSON.stringify(cached))
    if (!v.output) return null
    return {
      ok: true,
      replay_key: key,
      result: { output: v.output, checks: [v.check, ...def.checks(input, v.output)], mode: 'replay', model: opts.model, latency_ms: latency() },
    }
  }

  if (opts.mode === 'replay') {
    const hit = await fromReplay()
    if (hit) return hit
  }

  const req = { model: opts.model, system: def.systemPrompt, user: def.userPrompt(input), jsonSchema: def.jsonSchema, temperature: def.temperature, thinking: def.thinking }

  // Live call with one retry on a fast network error.
  let response: ModelResponse | null = null
  let lastError: ModelCallError | null = null
  for (let attempt = 0; attempt < 2 && response === null; attempt++) {
    const t0 = now()
    try {
      response = await callWithBudget(opts.client, req, def.budget_ms)
    } catch (e) {
      lastError = classify(e)
      const fast = now() - t0 < FAST_FAILURE_MS
      if (!(lastError.kind === 'network' && fast && attempt === 0)) break
    }
  }

  if (response === null) {
    const hit = await fromReplay()
    if (hit) return hit
    const err = lastError ?? new ModelCallError('api', 'No response.')
    const failure: StepFailure = {
      error: err.kind === 'timeout' ? `The AI step did not answer within ${Math.round(def.budget_ms / 1000)} seconds.` : `The AI step failed: ${err.message}`,
      next: def.name === 'intake_extract' ? 'Add the lines manually.' : 'Set the decisions by hand.',
      checks: [],
      model: opts.model,
      latency_ms: latency(),
    }
    return { ok: false, failure, replay_key: key }
  }

  const first = validateOutput(def as StepDefinition<unknown, O>, response.text)
  let output = first.output
  let checks: Check[] = output ? [first.check, ...def.checks(input, output)] : [first.check]
  let mode: StepResult<O>['mode'] = 'live'
  let raw: string | undefined
  let tokens_in = response.tokens_in
  let tokens_out = response.tokens_out

  // One revision round with the failure list. Cap: one. Spec 4.1 rule 3.
  if (def.allowRevision && checks.some((c) => !c.pass)) {
    const failures = checks.filter((c) => !c.pass).map((c) => `- ${c.name}: ${c.detail}`).join('\n')
    const revisionUser = `${req.user}\n\nYour previous output failed these checks. Return a corrected output that passes them:\n${failures}\n\nPrevious output:\n${response.text}`
    try {
      const second = await callWithBudget(opts.client, { ...req, user: revisionUser }, def.budget_ms)
      const v = validateOutput(def as StepDefinition<unknown, O>, second.text)
      if (v.output) {
        raw = response.text
        output = v.output
        checks = [v.check, ...def.checks(input, v.output)]
        mode = 'revised'
        tokens_in = (tokens_in ?? 0) + (second.tokens_in ?? 0)
        tokens_out = (tokens_out ?? 0) + (second.tokens_out ?? 0)
      }
    } catch {
      // Keep the first output and its checks.
    }
  }

  if (!output) {
    const failure: StepFailure = {
      error: first.check.detail,
      next: def.name === 'intake_extract' ? 'Add the lines manually.' : 'Set the decisions by hand.',
      checks,
      model: opts.model,
      latency_ms: latency(),
      raw: response.text,
    }
    return { ok: false, failure, replay_key: key }
  }

  const result: StepResult<O> = { output, checks, mode, model: opts.model, latency_ms: latency() }
  if (tokens_in !== undefined) result.tokens_in = tokens_in
  if (tokens_out !== undefined) result.tokens_out = tokens_out
  if (raw !== undefined) result.raw = raw
  return { ok: true, result, replay_key: key }
}
