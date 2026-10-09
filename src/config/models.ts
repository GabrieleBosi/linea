// Model ids. Spec 4.7. Pinned after scripts/list-gemini-models.ts was run against the key
// during the build. The environment can override the runtime and judge ids.

/** Newest stable Flash-class model. Spec 4.7. The site variable GEMINI_MODEL_RUNTIME carries the same id. */
export const DEFAULT_RUNTIME_MODEL = 'gemini-3.8-flash'
/** Judge for the P1 evals. */
export const DEFAULT_JUDGE_MODEL = 'gemini-3.1-pro-preview'
/** Only when the preview judge is unavailable to the key. Log the fallback. */
export const FALLBACK_JUDGE_MODEL = 'gemini-2.5-pro'

export type Env = Record<string, string | undefined>

export function runtimeModel(env: Env): string {
  return env.GEMINI_MODEL_RUNTIME?.trim() || DEFAULT_RUNTIME_MODEL
}

export function judgeModel(env: Env): string {
  return env.GEMINI_MODEL_JUDGE?.trim() || DEFAULT_JUDGE_MODEL
}

/** Gemini 3 takes a thinking level. Older models take a token budget. */
export function isGemini3(model: string): boolean {
  return /gemini-3/.test(model)
}
