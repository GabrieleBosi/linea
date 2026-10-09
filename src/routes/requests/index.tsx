// Screen 0 — requests list. Spec 6.2.1.

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/StatusBadge'
import { date } from '@/lib/format'
import { useRequestSummaries } from '@/lib/queries'
import { backend } from '@/lib/backend'

export const Route = createFileRoute('/requests/')({
  component: RequestsList,
  validateSearch: (search: Record<string, unknown>): { q?: string } => (typeof search.q === 'string' && search.q.trim() !== '' ? { q: search.q } : {}),
})

function RequestsList() {
  const navigate = useNavigate()
  const { q } = Route.useSearch()
  const all = useRequestSummaries()
  const needle = (q ?? '').trim().toLowerCase()
  const summaries = {
    ...all,
    data: all.data?.filter((s) => !needle || [s.request.ref, s.customer_name, s.request.title, s.request.status].some((v) => v.toLowerCase().includes(needle))),
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Requests</h1>
        <Button asChild>
          <Link to="/requests/new">New request</Link>
        </Button>
      </div>

      {!backend.ready && (
        <p className="rounded-md border bg-card p-4 text-sm text-destructive">
          The build has no database variables. Run the app with <code>npx netlify dev</code>.
        </p>
      )}
      {summaries.isError && (
        <p className="rounded-md border bg-card p-4 text-sm text-destructive">The requests could not be loaded: {summaries.error.message}. Reload the page.</p>
      )}
      {q && (
        <p className="text-sm text-muted-foreground">
          Showing requests that match "{q}".{' '}
          <Link to="/requests" search={{}} className="text-primary underline">
            Show all
          </Link>
        </p>
      )}
      {summaries.data && summaries.data.length === 0 && (
        <div className="rounded-md border bg-card p-6 text-sm">
          <p className="font-medium">{q ? `No request matches "${q}".` : 'No requests yet.'}</p>
          <p className="mt-1 text-muted-foreground">{q ? 'Try the reference, the customer or a word of the title.' : 'Click "New request" to enter the first customer request.'}</p>
        </div>
      )}
      {summaries.data && summaries.data.length > 0 && (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Ready of open</TableHead>
                <TableHead>Latest revision</TableHead>
                <TableHead>Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.data.map((s) => (
                <TableRow
                  key={s.request.id}
                  className="h-9 cursor-pointer"
                  onClick={() => navigate({ to: '/requests/$requestId', params: { requestId: s.request.id } })}
                >
                  <TableCell className="font-medium">{s.request.ref}</TableCell>
                  <TableCell>{s.customer_name}</TableCell>
                  <TableCell>{s.request.title}</TableCell>
                  <TableCell>
                    <StatusBadge kind="request" value={s.request.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{s.line_count}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.ready_count} of {s.open_count}
                  </TableCell>
                  <TableCell>{s.latest_revision ? `R${s.latest_revision.revision_no} ${s.latest_revision.status}` : '—'}</TableCell>
                  <TableCell>{date(s.request.received_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
