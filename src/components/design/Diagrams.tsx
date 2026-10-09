// Inline SVG diagrams for the design pages. Spec 8.1, 8.2, 8.10.

import type { CommercialRow, RequestRow, TechnicalRow } from '@/domain/transitions'

const STROKE = '#2F5D8A'
const INK = '#333'
const MUTED = '#777'

function Box({ x, y, w, h, label, sub, fill = '#fff' }: { x: number; y: number; w: number; h: number; label: string; sub?: string; fill?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={6} fill={fill} stroke={STROKE} strokeWidth={1.2} />
      <text x={x + w / 2} y={y + (sub ? h / 2 - 5 : h / 2 + 4)} textAnchor="middle" fontSize={12} fontWeight={600} fill={INK}>
        {label}
      </text>
      {sub && (
        <text x={x + w / 2} y={y + h / 2 + 11} textAnchor="middle" fontSize={10} fill={MUTED}>
          {sub}
        </text>
      )}
    </g>
  )
}

function Arrow({ x1, y1, x2, y2, label }: { x1: number; y1: number; x2: number; y2: number; label?: string }) {
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={MUTED} strokeWidth={1.2} markerEnd="url(#arrow)" />
      {label && (
        <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle" fontSize={10} fill={MUTED}>
          {label}
        </text>
      )}
    </g>
  )
}

const Defs = () => (
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill={MUTED} />
    </marker>
  </defs>
)

/** Request → lines, each with two tracks, executable when both are complete. Spec 8.1. */
export function OneModelDiagram() {
  const lines = [
    { no: 'L1', c: 'agreed', t: 'not required', ok: true },
    { no: 'L2', c: 'quoted', t: 'pending', ok: false },
    { no: 'L3', c: 'agreed', t: 'feasible', ok: true },
  ]
  return (
    <svg viewBox="0 0 720 200" role="img" aria-label="One request with three lines, each with a commercial and a technical track" className="h-auto w-full max-w-3xl">
      <Defs />
      <Box x={10} y={70} w={110} h={60} label="Request" sub="R-2026-0143" />
      {lines.map((l, i) => {
        const y = 15 + i * 62
        return (
          <g key={l.no}>
            <Arrow x1={120} y1={100} x2={160} y2={y + 25} />
            <rect x={160} y={y} width={330} height={50} rx={6} fill="#fff" stroke={STROKE} strokeWidth={1.2} />
            <text x={172} y={y + 30} fontSize={12} fontWeight={600} fill={INK}>
              {l.no}
            </text>
            <rect x={205} y={y + 12} width={125} height={26} rx={13} fill="#e8f0f8" />
            <text x={267} y={y + 29} textAnchor="middle" fontSize={11} fill="#1f4e79">
              commercial: {l.c}
            </text>
            <rect x={340} y={y + 12} width={140} height={26} rx={13} fill={l.t === 'pending' ? '#fdf1d6' : '#e3f3e6'} />
            <text x={410} y={y + 29} textAnchor="middle" fontSize={11} fill={l.t === 'pending' ? '#8a5a00' : '#1e6b32'}>
              technical: {l.t}
            </text>
            <Arrow x1={490} y1={y + 25} x2={530} y2={y + 25} />
            <text x={540} y={y + 29} fontSize={12} fill={l.ok ? '#1e6b32' : MUTED}>
              {l.ok ? '✓ executable' : '– not yet'}
            </text>
          </g>
        )
      })}
      <line x1={630} y1={30} x2={630} y2={170} stroke={MUTED} strokeDasharray="4 3" />
      <text x={640} y={95} fontSize={11} fill={MUTED}>
        every open line
      </text>
      <text x={640} y={109} fontSize={11} fill={MUTED}>
        executable →
      </text>
      <text x={640} y={123} fontSize={12} fontWeight={600} fill={INK}>
        Order
      </text>
    </svg>
  )
}

/** Entities and their references. Spec 8.2. */
export function EntityDiagram() {
  return (
    <svg viewBox="0 0 760 300" role="img" aria-label="Entity diagram" className="h-auto w-full max-w-4xl">
      <Defs />
      <Box x={20} y={20} w={120} h={44} label="Customer" sub="name, segment" />
      <Box x={200} y={20} w={140} h={44} label="Request" sub="ref, status, owner" />
      <Box x={200} y={120} w={140} h={44} label="Line" sub="two tracks, price" />
      <Box x={420} y={20} w={150} h={44} label="Quotation" sub="revision, status, valid" />
      <Box x={420} y={120} w={150} h={44} label="QuotationLine" sub="snapshot per revision" />
      <Box x={620} y={20} w={120} h={44} label="CustomerResponse" sub="raw, interpreted" />
      <Box x={20} y={120} w={120} h={44} label="FeasibilityCheck" sub="decision, alternative" />
      <Box x={620} y={120} w={120} h={44} label="Order" sub="snapshot lines" />
      <Box x={200} y={220} w={140} h={44} label="Event" sub="append-only timeline" />
      <Box x={420} y={220} w={150} h={44} label="AiRun" sub="trace per LLM call" />
      <Arrow x1={140} y1={42} x2={200} y2={42} label="1..n" />
      <Arrow x1={270} y1={64} x2={270} y2={120} label="1..n" />
      <Arrow x1={340} y1={42} x2={420} y2={42} label="revisions" />
      <Arrow x1={495} y1={64} x2={495} y2={120} label="1..n" />
      <Arrow x1={340} y1={142} x2={420} y2={142} label="snapshot of" />
      <Arrow x1={570} y1={42} x2={620} y2={42} label="reply to" />
      <Arrow x1={200} y1={142} x2={140} y2={142} label="check on" />
      <Arrow x1={570} y1={142} x2={620} y2={142} label="agreed lines" />
      <Arrow x1={270} y1={164} x2={270} y2={220} label="per request" />
      <Arrow x1={340} y1={242} x2={420} y2={242} label="ai_run event" />
    </svg>
  )
}

type Row = CommercialRow | TechnicalRow | RequestRow

/** A small state diagram generated from the transition rows. Spec 8.2. */
export function StateDiagram({ title, states, rows }: { title: string; states: readonly string[]; rows: readonly Row[] }) {
  const gap = 160
  const w = states.length * gap + 40
  const x = (s: string) => 20 + states.indexOf(s) * gap + 55
  const edges: Array<{ from: string; to: string; label: string; p2: boolean }> = []
  for (const r of rows) {
    for (const f of r.from as readonly string[]) {
      if (!states.includes(f) || !states.includes(r.to)) continue
      edges.push({ from: f, to: r.to, label: r.event, p2: Boolean(r.p2) })
    }
  }
  // Merge labels for the same pair.
  const merged = new Map<string, { from: string; to: string; labels: string[]; p2: boolean }>()
  for (const e of edges) {
    const key = `${e.from}>${e.to}`
    const m = merged.get(key)
    if (m) {
      if (!m.labels.includes(e.label)) m.labels.push(e.label)
      m.p2 = m.p2 && e.p2
    } else merged.set(key, { from: e.from, to: e.to, labels: [e.label], p2: e.p2 })
  }
  // Arcs run above the states forward and below them backward. Shorter arcs take the lower
  // lanes; an arc shares a lane with arcs that do not overlap it horizontally.
  const LANE = 26
  const BASE = 34
  const lanes = { above: [] as Array<Array<[number, number]>>, below: [] as Array<Array<[number, number]>> }
  const placed = [...merged.values()]
    .filter((e) => e.from !== e.to)
    .sort((a, b) => Math.abs(x(a.to) - x(a.from)) - Math.abs(x(b.to) - x(b.from)))
    .map((e) => {
      const x1 = x(e.from)
      const x2 = x(e.to)
      const forward = x2 > x1
      const side = forward ? lanes.above : lanes.below
      const lo = Math.min(x1, x2)
      const hi = Math.max(x1, x2)
      let lane = side.findIndex((l) => l.every(([a, b]) => hi <= a || lo >= b))
      if (lane === -1) {
        lane = side.length
        side.push([])
      }
      side[lane]?.push([lo, hi])
      return { ...e, x1, x2, forward, lane }
    })
  const loops = [...merged.values()].filter((e) => e.from === e.to)
  const top = BASE + lanes.above.length * LANE + (loops.length > 0 ? 30 : 0) + 20
  const bottom = BASE + lanes.below.length * LANE + 20
  const y = top
  const h = top + bottom
  return (
    <figure className="rounded-md border bg-card p-3">
      <figcaption className="mb-1 text-sm font-medium">{title}</figcaption>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={title} className="h-auto w-full">
        <Defs />
        {loops.map((e, i) => {
          const x1 = x(e.from)
          const stroke = e.p2 ? '#bbb' : MUTED
          return (
            <g key={`loop-${i}`}>
              <path d={`M ${x1 - 12} ${y - 18} C ${x1 - 30} ${y - 60}, ${x1 + 30} ${y - 60}, ${x1 + 12} ${y - 18}`} fill="none" stroke={stroke} strokeWidth={1.2} markerEnd="url(#arrow)" />
              <text x={x1} y={y - 52} textAnchor="middle" fontSize={10} fill={stroke}>
                {e.labels.join(', ')}
              </text>
            </g>
          )
        })}
        {placed.map((e, i) => {
          const stroke = e.p2 ? '#bbb' : MUTED
          const lift = (e.forward ? -1 : 1) * (BASE + e.lane * LANE)
          const mx = (e.x1 + e.x2) / 2
          const sx = e.x1 + (e.forward ? 55 : -55)
          const ex = e.x2 + (e.forward ? -58 : 58)
          const sy = y + (e.forward ? -6 : 6)
          return (
            <g key={i}>
              <path d={`M ${sx} ${sy} Q ${mx} ${y + lift * 2} ${ex} ${sy}`} fill="none" stroke={stroke} strokeWidth={1.2} markerEnd="url(#arrow)" strokeDasharray={e.p2 ? '3 3' : undefined} />
              <text x={mx} y={y + lift + (e.forward ? -3 : 11)} textAnchor="middle" fontSize={10} fill={stroke}>
                {e.labels.join(', ')}
              </text>
            </g>
          )
        })}
        {states.map((s) => (
          <g key={s}>
            <rect x={x(s) - 55} y={y - 18} width={110} height={36} rx={18} fill="#fff" stroke={STROKE} strokeWidth={1.2} />
            <text x={x(s)} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill={INK}>
              {s.replace('_', ' ')}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  )
}

/** The full stack: browser → Netlify → Supabase and Gemini. Spec 8.10. The public demo is the static app alone. */
export function ArchitectureDiagram() {
  return (
    <svg viewBox="0 0 720 200" role="img" aria-label="Architecture diagram" className="h-auto w-full max-w-3xl">
      <Defs />
      <Box x={20} y={70} w={130} h={60} label="Browser" sub="React app, anon key" />
      <Box x={230} y={20} w={170} h={50} label="Netlify static app" sub="the same build as the demo" />
      <Box x={230} y={120} w={170} h={60} label="Netlify functions" sub="Gemini key, service role" />
      <Box x={520} y={20} w={170} h={50} label="Supabase Postgres" sub="RLS, migrations" />
      <Box x={520} y={120} w={170} h={60} label="Gemini" sub="gemini-3.8-flash" />
      <Arrow x1={150} y1={90} x2={230} y2={50} label="serves" />
      <Arrow x1={150} y1={110} x2={230} y2={140} label="/api/ai/*, reset" />
      <Arrow x1={150} y1={100} x2={520} y2={48} label="reads and writes with the anon key" />
      <Arrow x1={400} y1={140} x2={520} y2={55} label="ai_runs, ai_replay" />
      <Arrow x1={400} y1={155} x2={520} y2={150} label="generateContent" />
    </svg>
  )
}
