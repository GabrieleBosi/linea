import type { Role } from '@/domain/types'
import type { Repo } from '@/repo/Repo'
import { createContext, realClock, type Clock } from '@/services/context'
import { PERSONAS, ScenarioAssertion, type AiMode, type ScenarioAi, type ScenarioContext } from './types'

export function createScenarioContext(repo: Repo, options: { clock?: Clock; ai?: AiMode | ScenarioAi; role?: Role } = {}): ScenarioContext {
  const clock = options.clock ?? realClock
  const ai: ScenarioAi = typeof options.ai === 'object' ? options.ai : { mode: options.ai ?? 'scripted' }
  const ctx: ScenarioContext = {
    repo,
    clock,
    role: options.role ?? 'sales',
    setRole: (role) => {
      ctx.role = role
    },
    as: (role) => createContext(repo, PERSONAS[role], clock),
    ai,
    state: {},
    customerIdByName: async (name) => {
      const c = (await repo.listCustomers()).find((x) => x.name === name)
      if (!c) throw new ScenarioAssertion(`Customer '${name}' is not seeded.`)
      return c.id
    },
  }
  return ctx
}
