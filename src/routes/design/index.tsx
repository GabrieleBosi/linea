// Design overview. Spec 8.1.

import { createFileRoute, Link } from '@tanstack/react-router'
import overview from '@/design/content/overview.md?raw'
import { AUTOMATION_SUMMARY } from '@/design/decomposition'
import { Markdown } from '@/components/Markdown'
import { OneModelDiagram } from '@/components/design/Diagrams'

export const Route = createFileRoute('/design/')({
  component: DesignOverview,
})

type PageTo = '/design' | '/design/model' | '/design/decomposition' | '/design/data' | '/design/ai' | '/design/verification' | '/design/releases' | '/design/assumptions' | '/design/architecture'

const PAGE_LIST: Array<{ to: PageTo | 'scenario-a' | 'scenario-b'; label: string }> = [
  { to: '/design/model', label: 'Model: entities, the two tracks, the transition table, overrides' },
  { to: '/design/decomposition', label: 'Decomposition: who does each step and why' },
  { to: 'scenario-a', label: 'Scenario A: Ebrecht Fabrication, partial acceptance, one revision' },
  { to: 'scenario-b', label: 'Scenario B: Torvane Structures, feasibility fails after the quotation' },
  { to: '/design/data', label: 'Data: what the history lacks, the scoring rule, the generator' },
  { to: '/design/ai', label: 'AI and evals: steps, results, error analysis, traces, cost' },
  { to: '/design/verification', label: 'Verification: does the model match reality?' },
  { to: '/design/releases', label: 'Release plan: three releases and their signals' },
  { to: '/design/assumptions', label: 'Assumptions and open questions' },
  { to: '/design/architecture', label: 'Architecture: browser, Netlify, Supabase, Gemini' },
]

function PageLink({ to, children }: { to: PageTo | 'scenario-a' | 'scenario-b'; children: React.ReactNode }) {
  if (to === 'scenario-a') {
    return (
      <Link to="/design/scenarios/$id" params={{ id: 'a' }} className="text-primary underline">
        {children}
      </Link>
    )
  }
  if (to === 'scenario-b') {
    return (
      <Link to="/design/scenarios/$id" params={{ id: 'b' }} className="text-primary underline">
        {children}
      </Link>
    )
  }
  return (
    <Link to={to} className="text-primary underline">
      {children}
    </Link>
  )
}

function DesignOverview() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Linea — from customer request to executable order</h1>
        <p className="mt-1 text-sm text-muted-foreground">A product prototype for Ferralba Steel, a fictional producer of configurable steel products. Design pages, rendered from the same code and data as the product.</p>
      </header>

      <Markdown source={overview} />

      <figure className="rounded-md border bg-card p-4">
        <OneModelDiagram />
        <figcaption className="mt-2 text-xs text-muted-foreground">Request → lines. Each line carries a commercial track and a technical track. A line is executable when both are complete; the request converts when every open line is executable.</figcaption>
      </figure>

      <section>
        <h2 className="mb-2 text-base font-semibold">What the product does and does not automate</h2>
        <ul className="list-disc space-y-1 pl-5 text-[15px]">
          {AUTOMATION_SUMMARY.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Pages</h2>
        <ul className="grid grid-cols-2 gap-1 text-sm">
          {PAGE_LIST.map((p) => (
            <li key={p.to}>
              <PageLink to={p.to}>{p.label}</PageLink>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
