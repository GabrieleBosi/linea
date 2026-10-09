// Lists the Gemini models the key can use. Spec 4.7. Run once at setup:
//   npx netlify dev:exec npm run list:models
// Prints the model ids and whether the pinned ids from src/config/models.ts are available.

import { DEFAULT_JUDGE_MODEL, DEFAULT_RUNTIME_MODEL, FALLBACK_JUDGE_MODEL, judgeModel, runtimeModel } from '../src/config/models'
import { listGeminiModels } from '../src/ai/gemini'

async function main(): Promise<void> {
  const key = process.env.GEMINI_API_KEY
  if (!key) {
    console.error('GEMINI_API_KEY is not set. Run: npx netlify dev:exec npm run list:models')
    process.exit(2)
  }
  const models = await listGeminiModels(key)
  const ids = models.map((m) => m.name.replace(/^models\//, ''))
  const gemini = ids.filter((id) => id.startsWith('gemini')).sort()
  console.log(`Models available to the key (${gemini.length} gemini ids):`)
  for (const id of gemini) console.log(`  ${id}`)
  const has = (id: string) => (ids.includes(id) ? 'available' : 'NOT available')
  console.log('')
  console.log(`Pinned runtime default ${DEFAULT_RUNTIME_MODEL}: ${has(DEFAULT_RUNTIME_MODEL)}`)
  console.log(`Pinned judge default ${DEFAULT_JUDGE_MODEL}: ${has(DEFAULT_JUDGE_MODEL)}`)
  console.log(`Judge fallback ${FALLBACK_JUDGE_MODEL}: ${has(FALLBACK_JUDGE_MODEL)}`)
  console.log(`Environment GEMINI_MODEL_RUNTIME → ${runtimeModel(process.env)}: ${has(runtimeModel(process.env))}`)
  console.log(`Environment GEMINI_MODEL_JUDGE → ${judgeModel(process.env)}: ${has(judgeModel(process.env))}`)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
