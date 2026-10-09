// Decomposition page. Spec 8.3.

import { createFileRoute } from '@tanstack/react-router'
import { AUTONOMY_LEVEL, AUTONOMY_SCALE, DECOMPOSITION, PATTERN_CHIPS, type Executor } from '@/design/decomposition'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/design/decomposition')({
  component: DecompositionPage,
})

const EXECUTOR_STYLE: Record<Executor, string> = {
  llm: 'bg-violet-100 text-violet-900',
  'llm+human': 'bg-violet-100 text-violet-900',
  'llm+checks': 'bg-violet-100 text-violet-900',
  code: 'bg-blue-50 text-blue-800',
  'code+llm': 'bg-blue-50 text-blue-800',
  human: 'bg-green-100 text-green-900',
  'human+code': 'bg-green-100 text-green-900',
}

function DecompositionPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Decomposition: steps, executors, autonomy</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every row is one step of the human process today. The executor column is a decision, and the rightmost column says why.</p>
      </header>

      <section className="rounded-md border bg-card p-4">
        <p className="mb-3 text-sm">
          <span className="font-medium">Lowest autonomy that passes the evals.</span> The model fills one structured output per step. A human approves. Code applies.
        </p>
        <ol className="grid grid-cols-4 gap-2" aria-label="Autonomy scale">
          {AUTONOMY_SCALE.map((l) => (
            <li key={l.level} className={cn('rounded-md border p-3 text-sm', l.level === AUTONOMY_LEVEL ? 'border-primary bg-accent' : 'opacity-70')}>
              <div className="font-medium">
                Level {l.level} · {l.label}
                {l.level === AUTONOMY_LEVEL && <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">Linea</span>}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{l.detail}</div>
            </li>
          ))}
        </ol>
      </section>

      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="border-b px-2 py-1.5 text-left font-medium">#</th>
              <th className="border-b px-2 py-1.5 text-left font-medium">Step (human process today)</th>
              <th className="border-b px-2 py-1.5 text-left font-medium">Executor</th>
              <th className="border-b px-2 py-1.5 text-left font-medium">Input → output</th>
              <th className="border-b px-2 py-1.5 text-left font-medium">Risk</th>
              <th className="border-b px-2 py-1.5 text-left font-medium">Why this executor</th>
            </tr>
          </thead>
          <tbody>
            {DECOMPOSITION.map((r) => (
              <tr key={r.n} className={r.scope === 'P2' ? 'text-muted-foreground' : ''}>
                <td className="border-b px-2 py-1.5 tabular-nums">{r.n}</td>
                <td className="border-b px-2 py-1.5">
                  {r.step}
                  {r.scope && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">{r.scope}</span>}
                </td>
                <td className="border-b px-2 py-1.5">
                  <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', EXECUTOR_STYLE[r.executorKind])}>{r.executor}</span>
                </td>
                <td className="border-b px-2 py-1.5">{r.io}</td>
                <td className="border-b px-2 py-1.5">{r.risk}</td>
                <td className="border-b px-2 py-1.5">{r.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section>
        <h2 className="mb-2 text-base font-semibold">Pattern choice</h2>
        <div className="flex flex-wrap gap-2">
          {PATTERN_CHIPS.map((c) => (
            <span key={c.label} className={cn('rounded-full border px-3 py-1 text-sm', c.used ? 'border-primary bg-accent' : 'border-dashed text-muted-foreground')}>
              {c.used ? '✓ ' : '— '}
              {c.label}
              {!c.used && ' (not used)'}
            </span>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">The sequence is fixed. The LLM does single steps with a schema. No planning, no tool selection by the model, no multi-agent.</p>
      </section>
    </div>
  )
}
