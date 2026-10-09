// Screen 4 — Operations queue. Spec 6.6.

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { StatusBadge } from '@/components/StatusBadge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ageLabel, configDetail, configLabel } from '@/lib/format'
import { useCheckQueue } from '@/lib/queries'

export const Route = createFileRoute('/ops/')({
  component: OpsQueue,
})

function OpsQueue() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'pending' | 'decided'>('pending')
  const queue = useCheckQueue(filter === 'pending' ? ['pending'] : ['feasible', 'not_feasible', 'waived'])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Operations queue</h1>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as 'pending' | 'decided')}>
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="decided">Decided</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {queue.isError && <p className="rounded-md border bg-card p-4 text-sm text-destructive">The queue could not be loaded: {queue.error.message}. Reload the page.</p>}
      {queue.data && queue.data.length === 0 && (
        <div className="rounded-md border bg-card p-6 text-sm">
          <p className="font-medium">{filter === 'pending' ? 'No feasibility checks are pending.' : 'No decided checks yet.'}</p>
          <p className="mt-1 text-muted-foreground">
            {filter === 'pending' ? 'Checks appear here when a line hits a rule, is a new configuration, or when Sales asks for one.' : 'Decisions appear here after Operations decides a pending check.'}
          </p>
        </div>
      )}
      {queue.data && queue.data.length > 0 && (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                <TableHead>Line</TableHead>
                <TableHead>Configuration</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Requested by</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Rule hits</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.data.map((item) => (
                <TableRow key={item.check.id} className="h-9 cursor-pointer" onClick={() => navigate({ to: '/ops/$checkId', params: { checkId: item.check.id } })}>
                  <TableCell className="font-medium">{item.request.ref}</TableCell>
                  <TableCell>L{item.line.line_no}</TableCell>
                  <TableCell>
                    {configLabel(item.line)} <span className="text-xs text-muted-foreground">{configDetail(item.line)}</span>
                  </TableCell>
                  <TableCell>{item.customer_name}</TableCell>
                  <TableCell>{item.check.requested_by}</TableCell>
                  <TableCell>{ageLabel(item.check.requested_at)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {item.check.rule_hits.length === 0 && <span className="text-xs text-muted-foreground">new configuration</span>}
                      {item.check.rule_hits.map((h) => (
                        <span key={h.rule_id} className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800" title={h.note}>
                          {h.rule_id}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge kind="check" value={item.check.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
