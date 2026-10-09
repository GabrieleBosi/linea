import { createFileRoute } from '@tanstack/react-router'
import { ASSUMPTIONS, BUILD_QUESTIONS } from '@/design/assumptions'

export const Route = createFileRoute('/design/assumptions')({
  component: AssumptionsPage,
})

function AssumptionsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Assumptions and open questions</h1>
        <p className="mt-1 text-sm text-muted-foreground">The assumptions the prototype makes, each with the question for the business, plus the questions that came up during the build.</p>
      </header>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="border-b px-2 py-1.5 text-left font-medium">#</th>
              <th className="border-b px-2 py-1.5 text-left font-medium">Assumption</th>
              <th className="border-b px-2 py-1.5 text-left font-medium">Why</th>
              <th className="border-b px-2 py-1.5 text-left font-medium">Question for the business</th>
            </tr>
          </thead>
          <tbody>
            {ASSUMPTIONS.map((a) => (
              <tr key={a.id}>
                <td className="border-b px-2 py-1.5 font-medium">{a.id}</td>
                <td className="border-b px-2 py-1.5">{a.assumption}</td>
                <td className="border-b px-2 py-1.5 text-muted-foreground">{a.why}</td>
                <td className="border-b px-2 py-1.5">{a.question}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section>
        <h2 className="mb-2 text-base font-semibold">Questions from the build</h2>
        <ul className="space-y-2 text-sm">
          {BUILD_QUESTIONS.map((q, i) => (
            <li key={i} className="rounded-md border bg-card p-3">
              <div className="flex items-start gap-2">
                <span className={q.status === 'open' ? 'rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900' : 'rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-900'}>{q.status}</span>
                <span className="text-xs text-muted-foreground">{q.phase}</span>
              </div>
              <p className="mt-1">{q.question}</p>
              {q.answer && <p className="mt-1 text-muted-foreground">Answer: {q.answer}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
