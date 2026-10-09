// Scenario pages with the step player. Spec 8.4. The player calls run(ctx) with the Supabase
// repository and never bypasses applyEvent. The click on "Run next step" is the human approval
// of an AI draft; the scripted decisions drive the state.

import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { IntakeInput } from '@/ai/steps/intake_extract'
import type { ReplyInput } from '@/ai/steps/reply_interpret'
import { DemoResetDialog } from '@/components/DemoResetDialog'
import { TraceLink } from '@/components/TraceDrawer'
import { Button } from '@/components/ui/button'
import { callIntake, callReply, recordAiDecision } from '@/lib/ai'
import { errorMessage } from '@/lib/actions'
import { repo } from '@/lib/repo'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import { appClock } from '@/lib/clock'
import { isStaticBuild } from '@/lib/mode'
import { createScenarioContext, resolveRoute, SCENARIOS, type FieldComparison, type ScenarioContext } from '@/scenarios'
import type { FieldComparison as FC } from '@/scenarios/ai'
import { ruleHits } from '@/domain/preCheck'
import type { Interpretation } from '@/domain/types'
import type { ScriptedIntake } from '@/scenarios/types'

export const Route = createFileRoute('/design/scenarios/$id')({
  component: ScenarioPage,
})

/** `wrote`: run() finished, so the data changed, and then expect() failed. Such a step never runs again. */
type StepStatus = { status: 'not run' | 'running' | 'done' | 'failed'; message?: string; wrote?: boolean }

const ACTOR_STYLE: Record<string, string> = {
  sales: 'bg-blue-50 text-blue-800',
  ops: 'bg-amber-100 text-amber-800',
  customer: 'bg-slate-100 text-slate-700',
  system: 'bg-slate-100 text-slate-700',
}

/** The AI calls read the header toggle at call time, so a toggle change mid-run takes effect on the next step. */
function makeContext(replayRef: { current: boolean }): ScenarioContext {
  const signal = () => new AbortController().signal
  return createScenarioContext(repo, {
    clock: appClock,
    ai: {
      mode: replayRef.current ? 'replay' : 'live',
      intake: async (input: IntakeInput) => {
        const r = await callIntake(input, replayRef.current, signal())
        return r.ok ? { output: r.output, checks: r.checks, mode: r.mode, model: r.model, latency_ms: r.latency_ms, ai_run_id: r.ai_run_id } : null
      },
      interpret: async (input: ReplyInput) => {
        const r = await callReply(input, replayRef.current, signal())
        return r.ok ? { output: r.output, checks: r.checks, mode: r.mode, model: r.model, latency_ms: r.latency_ms, ai_run_id: r.ai_run_id } : null
      },
      decide: recordAiDecision,
    },
  })
}

// Keyed by the scenario id: the router keeps the component when only the param changes, so
// going from A to B through the sidebar would otherwise carry A's context, statuses and next step.
function ScenarioPage() {
  const { id } = Route.useParams()
  return <ScenarioPlayer key={id} id={id} />
}

function ScenarioPlayer({ id }: { id: string }) {
  const scenario = SCENARIOS.find((s) => s.id === id)
  const { replay, setRole } = useSession()
  const qc = useQueryClient()
  const ctxRef = useRef<ScenarioContext | null>(null)
  const [statuses, setStatuses] = useState<StepStatus[]>(() => (scenario ? scenario.steps.map(() => ({ status: 'not run' })) : []))
  const [next, setNext] = useState(0)
  const [resetOpen, setResetOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [, bump] = useState(0)

  const replayRef = useRef(replay)
  replayRef.current = replay
  // One context per run, always read from the ref: "Reset demo and start" replaces it, and every
  // step, the save and the restore must see the same object. (A memoised copy kept the old
  // context after a reset, so steps wrote into one object and the save read another, empty one.)
  if (!ctxRef.current) ctxRef.current = makeContext(replayRef)
  const ctx = ctxRef.current
  ctx.ai.mode = replay ? 'replay' : 'live'
  const router = useRouter()

  // The run survives a page reload: statuses, the next step and the scenario state (ids, drafts,
  // comparisons) go to session storage after every step. "Reset demo and start" clears them.
  const storageKey = `linea.player.${id}`
  const persist = (s: StepStatus[], n: number) => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ statuses: s, next: n, state: ctxRef.current?.state ?? {} }))
    } catch {
      /* storage unavailable: the run lasts for this page only */
    }
  }
  useEffect(() => {
    if (!scenario) return
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (!raw) return
      const saved = JSON.parse(raw) as { statuses: StepStatus[]; next: number; state: Record<string, unknown> }
      if (!Array.isArray(saved.statuses) || saved.statuses.length !== scenario.steps.length) return
      if (ctxRef.current) Object.assign(ctxRef.current.state, saved.state)
      setStatuses(saved.statuses.map((s) => (s.status === 'running' ? { status: 'not run' } : s)))
      setNext(saved.next)
    } catch {
      /* unreadable: start fresh */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  if (!scenario) {
    return (
      <p className="text-sm">
        Unknown scenario. <Link to="/design/scenarios/$id" params={{ id: 'a' }} className="text-primary underline">Scenario A</Link>
      </p>
    )
  }

  const start = () => {
    ctxRef.current = makeContext(replayRef)
    setStatuses(scenario.steps.map(() => ({ status: 'not run' })))
    setNext(0)
    try {
      sessionStorage.removeItem(storageKey)
    } catch {
      /* nothing to clear */
    }
    bump((n) => n + 1)
  }

  const runStep = async (i: number): Promise<boolean> => {
    const step = scenario.steps[i]
    const ctx = ctxRef.current
    if (!step || !ctx) return false
    setStatuses((s) => s.map((x, j) => (j === i ? { status: 'running' } : x)))
    let wrote = false
    try {
      ctx.setRole(step.actor === 'ops' ? 'ops' : 'sales')
      setRole(step.actor === 'ops' ? 'ops' : 'sales')
      await step.run(ctx)
      wrote = true
      await step.expect(ctx)
      setStatuses((s) => {
        const n = s.map((x, j) => (j === i ? { status: 'done' as const } : x))
        persist(n, i + 1)
        return n
      })
      setNext(i + 1)
      await qc.invalidateQueries()
      bump((n) => n + 1)
      return true
    } catch (e) {
      setStatuses((s) => {
        const n = s.map((x, j) => (j === i ? { status: 'failed' as const, message: errorMessage(e), wrote } : x))
        persist(n, i)
        return n
      })
      bump((n) => n + 1)
      return false
    }
  }

  // A step that changed the data and then failed its check would repeat the change if run again
  // (A2 would create a second request): the run stops there until "Reset demo and start".
  const blocked = statuses.some((s) => s.status === 'failed' && s.wrote)

  const runNext = async () => {
    if (next >= scenario.steps.length || blocked) return
    setBusy(true)
    await runStep(next)
    setBusy(false)
  }

  const runAll = async () => {
    if (blocked) return
    setBusy(true)
    for (let i = next; i < scenario.steps.length; i++) {
      const ok = await runStep(i)
      if (!ok) break
    }
    setBusy(false)
  }

  const done = statuses.filter((s) => s.status === 'done').length

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">{scenario.title}</h1>
        <ul className="mt-1 flex flex-wrap gap-1">
          {scenario.situations.map((s) => (
            <li key={s} className="rounded-full border px-2.5 py-0.5 text-xs">
              {s}
            </li>
          ))}
        </ul>
      </header>

      {/* Sticky below the pinned header (49 px), so "Run next step" stays in view while the cards
          grow and never covers the header's role switch. */}
      <div className="sticky top-[49px] z-10 flex flex-wrap items-center gap-2 rounded-md border bg-card p-3 shadow-sm">
        <Button variant="outline" size="sm" onClick={() => setResetOpen(true)} disabled={busy}>
          Reset demo and start
        </Button>
        <Button size="sm" onClick={runNext} disabled={busy || blocked || next >= scenario.steps.length}>
          Run next step{next < scenario.steps.length ? ` (${scenario.steps[next]?.id})` : ''}
        </Button>
        <Button variant="outline" size="sm" onClick={runAll} disabled={busy || blocked || next >= scenario.steps.length}>
          Run all
        </Button>
        <span className="text-sm text-muted-foreground">
          {done} of {scenario.steps.length} done · AI mode {replay ? 'replay' : 'live'} ({isStaticBuild ? 'recorded outputs' : 'header toggle'})
          {ctx.state.requestRef ? ` · ${String(ctx.state.requestRef)}` : ''}
        </span>
      </div>

      <ol className="space-y-2">
        {scenario.steps.map((step, i) => {
          const st = statuses[i] ?? { status: 'not run' }
          const prefix = step.id === 'A1' || step.id === 'B1' ? 'intake' : step.id === 'A6' || step.id === 'B4' ? 'reply1' : step.id === 'A9' || step.id === 'B10' ? 'reply2' : null
          const mode = prefix ? (ctx.state[`${prefix}Mode`] as string | undefined) : undefined
          const runId = prefix ? (ctx.state[`${prefix}AiRunId`] as string | null | undefined) : undefined
          const comparison = prefix ? (ctx.state[`${prefix}Comparison`] as FC[] | undefined) : undefined
          const route = resolveRoute(step.route, ctx.state)
          const routeReady = !route.includes(':')
          return (
            <li key={step.id} className={cn('rounded-md border bg-card p-3', st.status === 'failed' && 'border-destructive/50', i === next && st.status === 'not run' && 'border-primary')}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{step.id}</span>
                  <span className={cn('rounded px-1.5 py-0.5 text-xs', ACTOR_STYLE[step.actor])}>{step.actor}</span>
                  <span className="text-sm font-medium">{step.title}</span>
                  {step.ai && <span className="rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">AI draft</span>}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5',
                      st.status === 'done' ? 'bg-green-100 text-green-800' : st.status === 'failed' ? 'bg-red-50 text-red-700' : st.status === 'running' ? 'bg-amber-100 text-amber-800' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {st.status}
                  </span>
                  {i === next && st.status !== 'running' && !st.wrote && (
                    <Button size="xs" variant="outline" onClick={runNext} disabled={busy}>
                      Run
                    </Button>
                  )}
                </div>
              </div>
              {/* Open screen sits on its own line under the title, away from where the Run button was,
                  and navigates inside the app, so Back returns to the player without a page load. */}
              <div className="mt-1 text-xs">
                {routeReady && st.status === 'done' && busy ? (
                  // Leaving mid-run would unmount the player while the run goes on unsaved.
                  <span role="link" aria-disabled="true" title="Opens when the run finishes" className="cursor-not-allowed text-muted-foreground underline">
                    Open screen
                  </span>
                ) : routeReady && st.status === 'done' ? (
                  <a
                    href={route}
                    className="text-primary underline"
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                      e.preventDefault()
                      router.history.push(route)
                    }}
                  >
                    Open screen
                  </a>
                ) : (
                  <span className="text-muted-foreground">Screen: {step.route}</span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{step.narrative}</p>
              {st.message && <p className="mt-1 text-sm text-destructive">{st.message}</p>}
              {st.wrote && (
                <p className="mt-1 text-sm">
                  This step changed the data before its check failed, so running it again would repeat the change. Use "Reset demo and start" to run the scenario from the beginning.
                </p>
              )}
              {step.ai && st.status === 'done' && (
                <div className="mt-2 rounded border bg-muted/40 p-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span>
                      Mode <span className="font-medium">{mode ?? '—'}</span>
                    </span>
                    {runId && <TraceLink aiRunId={runId} />}
                    {comparison && (
                      <span className={comparison.every((c) => c.match) ? 'text-green-700' : 'text-amber-800'}>
                        {comparison.every((c) => c.match) ? 'The draft matches the script on every field.' : `${comparison.filter((c) => !c.match).length} field(s) differ from the script.`}
                      </span>
                    )}
                  </div>
                  {prefix === 'intake' && <IntakeDraftSummary draft={ctx.state.intakeDraft as ScriptedIntake | undefined} />}
                  {prefix && prefix !== 'intake' && <ReplyDraftSummary draft={ctx.state[`${prefix}Draft`] as Interpretation | undefined} />}
                  {comparison && (
                    <table className="mt-1 w-full">
                      <tbody>
                        {comparison.map((c: FieldComparison) => (
                          <tr key={c.field}>
                            <td className="pr-2 font-mono">{c.field}</td>
                            <td className="pr-2">expected {c.expected}</td>
                            <td className={c.match ? 'text-green-700' : 'text-amber-800'}>
                              {c.match ? '✓' : `got ${c.actual}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>

      <DemoResetDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onDone={start}
        warning={id === 'b' ? "This also deletes scenario A's data. The reset clears every request, revision and order in the demo, not only scenario B." : undefined}
      />
    </div>
  )
}

/** The intake draft on the card: lines with flags and pre-check rule hits, open questions, delivery. */
function IntakeDraftSummary({ draft }: { draft: ScriptedIntake | undefined }) {
  if (!draft) return null
  return (
    <div className="mt-2 space-y-1" data-draft-summary="intake">
      <table className="w-full">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pr-2 font-normal">Line</th>
            <th className="pr-2 font-normal">Configuration</th>
            <th className="pr-2 font-normal">Quantity</th>
            <th className="font-normal">Flags and rule hits</th>
          </tr>
        </thead>
        <tbody>
          {draft.lines.map((l, i) => {
            const hits = ruleHits(l)
            const flags = l.flags.filter((f) => !(f === 'check needed' && hits.length > 0))
            return (
              <tr key={i} className="align-top">
                <td className="pr-2 font-mono">L{i + 1}</td>
                <td className="pr-2">
                  {l.family} {l.size} {l.material}, {l.length_mm} mm{l.notes ? <span className="text-muted-foreground"> · {l.notes}</span> : null}
                </td>
                <td className="pr-2 tabular-nums">{l.quantity} pcs</td>
                <td>
                  {hits.length === 0 && flags.length === 0 && <span className="text-muted-foreground">none</span>}
                  {hits.map((h) => (
                    <span key={h.rule_id} className="mr-1 rounded bg-amber-100 px-1 text-amber-800">
                      {h.rule_id}: {h.note.replace(/\.$/, '')}
                    </span>
                  ))}
                  {flags.map((f) => (
                    <span key={f} className="mr-1 rounded bg-amber-100 px-1 text-amber-800">
                      {f}
                    </span>
                  ))}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p>
        <span className="text-muted-foreground">Open questions: </span>
        {draft.open_questions.length === 0 ? 'none' : draft.open_questions.join(' · ')}
      </p>
      {(draft.delivery_hint || draft.requested_delivery_date) && (
        <p>
          <span className="text-muted-foreground">Delivery: </span>
          {draft.requested_delivery_date ?? draft.delivery_hint}
        </p>
      )}
    </div>
  )
}

/** The reply draft on the card: one decision per quoted line with the changes and the source span. */
function ReplyDraftSummary({ draft }: { draft: Interpretation | undefined }) {
  if (!draft) return null
  return (
    <div className="mt-2 space-y-1" data-draft-summary="reply">
      <table className="w-full">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pr-2 font-normal">Line</th>
            <th className="pr-2 font-normal">Decision</th>
            <th className="pr-2 font-normal">Changes</th>
            <th className="font-normal">From the reply</th>
          </tr>
        </thead>
        <tbody>
          {draft.decisions.map((d) => {
            const changes = Object.entries(d.changes)
              .filter(([, v]) => v !== null)
              .map(([k, v]) => `${k.replace('_', ' ')} ${String(v)}`)
            return (
              <tr key={d.line_no} className="align-top">
                <td className="pr-2 font-mono">L{d.line_no}</td>
                <td className="pr-2 font-medium">{d.decision}</td>
                <td className="pr-2">{changes.length ? changes.join(', ') : '—'}</td>
                <td className="text-muted-foreground">“{d.source_span}”</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p>
        <span className="text-muted-foreground">Overall: </span>
        {draft.overall.replace('_', ' ')}
        {draft.needs_clarification.length > 0 && <span className="text-muted-foreground"> · needs clarification: {draft.needs_clarification.join(' · ')}</span>}
      </p>
    </div>
  )
}
