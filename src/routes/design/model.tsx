// Model page. Spec 8.2: entity diagram, the two tracks, the request status, the transition table, overrides.

import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { EntityDiagram, StateDiagram } from '@/components/design/Diagrams'
import { Markdown } from '@/components/Markdown'
import modelText from '@/design/content/model.md?raw'
import { COMMERCIAL_ROWS, REQUEST_ROWS, TECHNICAL_ROWS, TRANSITION_ROWS } from '@/domain/transitions'
import { backend } from '@/lib/backend'

export const Route = createFileRoute('/design/model')({
  component: ModelPage,
})

const COMMERCIAL_STATES = ['draft', 'quoted', 'negotiating', 'agreed', 'declined', 'withdrawn', 'superseded'] as const
const TECHNICAL_STATES = ['not_required', 'pending', 'feasible', 'not_feasible'] as const
const REQUEST_STATES = ['open', 'on_hold', 'rejected', 'converted'] as const

function ModelPage() {
  const overrides = useQuery({
    queryKey: ['override-count'],
    enabled: backend.ready,
    queryFn: async () => {
      const [overrides, waived] = await Promise.all([backend.repo.countEvents('override'), backend.repo.countEvents('check_waived')])
      return { overrides, waived }
    },
  })

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">The model</h1>
        <p className="mt-1 text-sm text-muted-foreground">Entities, the two tracks on a line, the request status, and the transition table rendered from `src/domain/transitions.ts`.</p>
      </header>

      <figure className="rounded-md border bg-card p-4">
        <EntityDiagram />
      </figure>

      <div className="grid gap-4">
        <StateDiagram title="Commercial track" states={COMMERCIAL_STATES} rows={COMMERCIAL_ROWS} />
        <StateDiagram title="Technical track" states={TECHNICAL_STATES} rows={TECHNICAL_ROWS} />
        <StateDiagram title="Request status" states={REQUEST_STATES} rows={REQUEST_ROWS} />
      </div>
      <p className="text-sm text-muted-foreground">Dashed arrows are P2 rows: they exist in the table and in the tests, not in the prototype UI.</p>

      <section>
        <h2 className="mb-2 text-base font-semibold">The transition table</h2>
        <p className="mb-2 text-sm">The process will change. Adding an exception is one row in this table and one test, not a rewrite.</p>
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="border-b px-2 py-1.5 text-left font-medium">Track</th>
                <th className="border-b px-2 py-1.5 text-left font-medium">From</th>
                <th className="border-b px-2 py-1.5 text-left font-medium">Event</th>
                <th className="border-b px-2 py-1.5 text-left font-medium">To</th>
                <th className="border-b px-2 py-1.5 text-left font-medium">Guard</th>
                <th className="border-b px-2 py-1.5 text-left font-medium">Role</th>
                <th className="border-b px-2 py-1.5 text-left font-medium">Timeline event</th>
              </tr>
            </thead>
            <tbody>
              {TRANSITION_ROWS.map((r, i) => (
                <tr key={i} className={r.p2 ? 'text-muted-foreground' : ''}>
                  <td className="border-b px-2 py-1.5">{r.track}</td>
                  <td className="border-b px-2 py-1.5">{(r.from as readonly string[]).map((s) => s.replace('_', ' ')).join(', ')}</td>
                  <td className="border-b px-2 py-1.5 font-mono text-xs">{r.event}</td>
                  <td className="border-b px-2 py-1.5">{String(r.to).replace('_', ' ')}</td>
                  <td className="border-b px-2 py-1.5">
                    {r.guard}
                    {r.p2 && <span className="ml-1 rounded bg-muted px-1 text-xs">P2</span>}
                  </td>
                  <td className="border-b px-2 py-1.5">{r.roles.join(', ')}</td>
                  <td className="border-b px-2 py-1.5 font-mono text-xs">{[r.eventType, ...(r.extraEventTypes ?? [])].join(' + ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{TRANSITION_ROWS.length} rows, one test each. Derived line state: executable = agreed and (feasible or not required); open = not declined, withdrawn or superseded. Conversion guard: at least one open line, every open line executable, latest sent revision not expired.</p>
      </section>

      <section>
        <Markdown source={modelText} />
        <p className="text-sm">
          Overrides recorded in this database so far: <span className="font-medium tabular-nums">{overrides.data ? overrides.data.overrides : '…'}</span>
          {overrides.data && overrides.data.waived > 0 && <span className="text-muted-foreground"> (of which {overrides.data.waived} waived checks)</span>}.
        </p>
      </section>
    </div>
  )
}
