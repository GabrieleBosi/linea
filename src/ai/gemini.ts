// Gemini model client through @google/genai. Spec 4.7. Server side only: the key comes from
// the injected environment of a Netlify function or a script. Never import this from the UI.

import { GoogleGenAI, type ThinkingConfig } from '@google/genai'
import { isGemini3 } from '@/config/models'
import type { ModelClient, ThinkingLevel } from './types'

function thinkingConfig(model: string, level: ThinkingLevel): ThinkingConfig {
  if (isGemini3(model)) {
    // gemini-3.8-flash accepts LOW, MEDIUM and HIGH and rejects MINIMAL (probed during the build; docs/DESIGN.md, 4.1).
    // LOW spends no thinking tokens on a small task, so it is the spec's "minimal". Pro models take LOW and HIGH.
    const pro = /pro/.test(model)
    return { thinkingLevel: level === 'minimal' ? 'LOW' : pro ? 'LOW' : 'MEDIUM' } as ThinkingConfig
  }
  // Gemini 2.5 takes a token budget. Zero disables thinking.
  return { thinkingBudget: level === 'minimal' ? 0 : 2048 }
}

export function createGeminiClient(apiKey: string): ModelClient {
  const ai = new GoogleGenAI({ apiKey })
  return async (req) => {
    const response = await ai.models.generateContent({
      model: req.model,
      contents: req.user,
      config: {
        systemInstruction: req.system,
        temperature: req.temperature,
        responseMimeType: 'application/json',
        responseJsonSchema: req.jsonSchema,
        thinkingConfig: thinkingConfig(req.model, req.thinking),
        abortSignal: req.signal,
      },
    })
    const text = response.text
    if (typeof text !== 'string') {
      throw new Error('The model returned no text.')
    }
    const usage = response.usageMetadata
    // Output tokens including thoughts: total minus prompt.
    const out = usage && usage.totalTokenCount !== undefined ? usage.totalTokenCount - (usage.promptTokenCount ?? 0) : undefined
    return {
      text,
      tokens_in: usage?.promptTokenCount,
      tokens_out: out !== undefined && out > 0 ? out : undefined,
    }
  }
}

/** The models the key can use. For scripts/list-gemini-models.ts. */
export async function listGeminiModels(apiKey: string): Promise<Array<{ name: string; displayName?: string; supportedActions?: string[] }>> {
  const ai = new GoogleGenAI({ apiKey })
  const out: Array<{ name: string; displayName?: string; supportedActions?: string[] }> = []
  const pager = await ai.models.list()
  for await (const m of pager) {
    const entry: { name: string; displayName?: string; supportedActions?: string[] } = { name: m.name ?? '' }
    if (m.displayName !== undefined) entry.displayName = m.displayName
    if (m.supportedActions !== undefined) entry.supportedActions = m.supportedActions
    out.push(entry)
  }
  return out
}
