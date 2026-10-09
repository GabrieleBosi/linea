// Landing page: the case study in one page, then the way into the demo and the design.

import { createFileRoute, Link } from '@tanstack/react-router'
import type { EvalResults, MetricStats } from '@/ai/evals/types'
import { OneModelDiagram } from '@/components/design/Diagrams'
import { Button } from '@/components/ui/button'
import { PUBLIC_REPO_URL } from '@/config/demo'
import { isStaticBuild } from '@/lib/mode'
import latestJson from '../../evals/results/latest.json'

export const Route = createFileRoute('/')({
  component: Landing,
})

const latest = latestJson as unknown as EvalResults

function pct(m: MetricStats | undefined): string {
  if (!m) return '—'
  const f = (v: number) => `${Math.round(v * 100)}%`
  return m.min === m.max ? f(m.mean) : `${f(m.mean)} (${f(m.min)}–${f(m.max)})`
}

const EVAL_ROWS = [
  { step: 'intake_extract', label: 'Read a customer request into lines', cases: '20 quality, 15 attacks, 6 controls' },
  { step: 'reply_interpret', label: 'Read a customer reply into decisions', cases: '20 quality, 10 attacks, 4 controls' },
  { step: 'price_memo', label: 'Explain the suggested price', cases: '20 judged' },
  { step: 'cover_text', label: 'Write the quotation cover text', cases: '20 judged' },
] as const

const doc = (path: string) => `${PUBLIC_REPO_URL}/blob/main/${path}`

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Landing() {
  const heldout = latest.steps.intake_extract?.heldout
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl space-y-12 px-4 py-12 text-[15px] leading-relaxed sm:px-6">
        <header className="space-y-5">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Case study · product prototype</p>
          <h1 className="text-3xl font-semibold leading-tight">Linea: AI quote-to-order</h1>
          <p className="text-lg text-muted-foreground">
            A working prototype for Ferralba Steel, a fictional producer of configurable steel beams. It takes a customer request from the first email to an executable order, with four bounded AI steps, evals behind every one, and a person approving every change.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link to="/design/scenarios/$id" params={{ id: 'a' }}>
                Run scenario A
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/design">Read the design</Link>
            </Button>
            <Link to="/requests" className="text-sm text-primary underline">
              Open the app
            </Link>
            <a href={PUBLIC_REPO_URL} className="text-sm text-primary underline" target="_blank" rel="noreferrer">
              Source on GitHub
            </a>
          </div>
          {isStaticBuild && <p className="text-sm text-muted-foreground">Nothing to sign up for. The AI steps replay recorded model outputs, and your data stays in this browser tab.</p>}
        </header>

        <Section title="The problem">
          <p>
            Quoting configurable steel is a negotiation that lives in email threads, spreadsheets and people&apos;s memory. The company has years of past quotations, but at the moment a price is set nobody can find the three that matter. A customer accepts one line and changes another. A doubt about feasibility arrives after the offer has gone out. And nobody can say, today, what still stands between a request and an order.
          </p>
        </Section>

        <Section title="One model">
          <p>
            The unit of work is the request line, not the request. Each line runs two tracks: a commercial one (is the price agreed?) and a technical one (can we make it?). A line is executable when both are done, and the request becomes an order when every open line is. That single idea covers partial acceptance, late feasibility problems, changes and mixed states without special cases, and every transition is a row in a table with a test.
          </p>
          <figure className="rounded-md border bg-card p-4">
            <OneModelDiagram />
          </figure>
        </Section>

        <Section title="Where AI is, and where it is not">
          <p>
            I split the process into thirteen steps and gave each one an executor. Four are LLM steps, each with a schema, code checks and a human approval: reading the customer&apos;s request, reading the customer&apos;s reply, a short memo that explains a price, and the cover text of a quotation. References from history, prices, cost, feasibility rules and every state change are code. Choosing the price, sending the offer and deciding feasibility stay with people.
          </p>
          <p>
            The workflow is fixed: the model fills one structured output per step and never chooses the next one. And the first release would ship without any LLM at all, because the shared record is what saves the process; the AI saves minutes.
          </p>
        </Section>

        <Section title="Evidence">
          <p>Each step is graded by code, and the two text steps also by a judge model. Three full runs on the public dataset, with the held-out set run once:</p>
          <div className="overflow-x-auto rounded-md border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="border-b px-3 py-2 font-medium">Step</th>
                  <th className="border-b px-3 py-2 font-medium">Cases per run</th>
                  <th className="border-b px-3 py-2 font-medium">Pass rate</th>
                  <th className="border-b px-3 py-2 font-medium">Attacks that got through</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {EVAL_ROWS.map((r) => {
                  const s = latest.steps[r.step]
                  return (
                    <tr key={r.step}>
                      <td className="border-b px-3 py-2">{r.label}</td>
                      <td className="border-b px-3 py-2 text-muted-foreground">{r.cases}</td>
                      <td className="border-b px-3 py-2">{pct(s?.aggregate?.quality_pass_rate)}</td>
                      <td className="border-b px-3 py-2">{s?.aggregate?.contamination_rate ? pct(s.aggregate.contamination_rate) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground">
            Held-out intake cases, written after the prompt was tuned and never used for tuning: {heldout ? `${heldout.pass} of ${heldout.cases}` : '—'}.
          </p>
          <p>The numbers look good. Two failures behind them matter more:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="font-medium">My own example taught the wrong sentence.</span> On the earlier data the judge failed one price memo in two of three runs: it gave the median margin of the references as the margin of the suggested price. The model had learned that sentence from the example in my prompt. A code check could not see it, because the number was in the prompt; the judge could. Prompt v3 shows the two margins apart, and the cases where they differ now pass 9 of 9.
            </li>
            <li>
              <span className="font-medium">A grader bug failed correct answers.</span> On the public data, a check that every number in the memo is grounded only knew the fields of the input, not the margin the prompt computes from them. It had been failing 9 of 60 correct memos, 85 percent per run. I fixed the grader, with tests both ways, not the prompt.
            </li>
          </ul>
          <p>
            <Link to="/design/ai" className="text-primary underline">
              The full eval results, error analysis and traces
            </Link>
          </p>
        </Section>

        <Section title="How it was built">
          <p>
            I wrote the design first, then built it with an AI coding agent in phases. Each phase ended with tests, a deploy, a log entry and my review, and the next one started only after that. Walk-throughs on the deployed site found what the tests missed: a run lost on reload, a line ranking as a reference for itself. Most fixes came back with a test that fails without the fix.
          </p>
          <p>
            <a href={doc('docs/HOW_IT_WAS_BUILT.md')} className="text-primary underline" target="_blank" rel="noreferrer">
              How it was built, and where the agent needed me
            </a>
          </p>
        </Section>

        <div className="flex flex-wrap items-center gap-3 border-t pt-8">
          <Button asChild>
            <Link to="/design/scenarios/$id" params={{ id: 'a' }}>
              Run scenario A
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/design/scenarios/$id" params={{ id: 'b' }}>
              Run scenario B
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/design">Read the design</Link>
          </Button>
        </div>

        <footer className="text-sm text-muted-foreground">
          Ferralba Steel, its customers and its people are fictional. Built by Gabriele Bosi.{' '}
          <a href={PUBLIC_REPO_URL} className="underline" target="_blank" rel="noreferrer">
            Source and documentation on GitHub
          </a>
          .
        </footer>
      </div>
    </div>
  )
}
