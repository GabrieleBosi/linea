// Hold, reject and override dialogs of the request workspace. Spec 6.4 (P1 actions) and 2.3.

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FORCEABLE_EVENTS, type ForceableEventName } from '@/domain/override'
import type { Line, Request } from '@/domain/types'
import type { ForceTarget } from '@/services/override'
import { configLabel } from '@/lib/format'

/** A confirmation with a required reason. Enter confirms once a reason is typed. */
export function ReasonDialog({
  open,
  title,
  description,
  label,
  confirmLabel,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  description: string
  label: string
  confirmLabel: string
  busy: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (open) setReason('')
  }, [open])
  const ready = reason.trim() !== '' && !busy
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && ready && (e.target as HTMLElement).tagName !== 'BUTTON') {
            e.preventDefault()
            onConfirm(reason.trim())
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="reason-dialog-reason">{label}</Label>
          <Textarea id="reason-dialog-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(reason.trim())} disabled={!ready}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Forces a transition on the request or on one line. The guard and the role check are skipped; the event is an override. */
export function OverrideDialog({
  open,
  request,
  lines,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean
  request: Request
  lines: Line[]
  busy: boolean
  onClose: () => void
  onConfirm: (target: ForceTarget, name: ForceableEventName, reason: string) => void
}) {
  const [targetKey, setTargetKey] = useState('request')
  const [name, setName] = useState<string>('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) {
      setTargetKey('request')
      setName('')
      setReason('')
    }
  }, [open])

  const line = lines.find((l) => l.id === targetKey) ?? null
  const options = useMemo(() => {
    if (!line) return FORCEABLE_EVENTS.filter((e) => e.target === 'request' && e.to !== request.status)
    return FORCEABLE_EVENTS.filter((e) => e.target === 'line' && (e.track === 'commercial' ? e.to !== line.commercial_status : e.to !== line.technical_status))
  }, [line, request.status])
  const chosen = options.find((e) => e.name === name)
  const ready = chosen !== undefined && reason.trim() !== '' && !busy

  const confirm = () => {
    if (!chosen) return
    onConfirm(line ? { kind: 'line', line_id: line.id } : { kind: 'request', request_id: request.id }, chosen.name, reason.trim())
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && ready && (e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'SELECT') {
            e.preventDefault()
            confirm()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Force a transition</DialogTitle>
          <DialogDescription>
            This skips the guard and the role check and is logged as an override with your reason. The design pages count overrides: every one of them proposes a new row in the transition table.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label htmlFor="override-target">Apply to</Label>
            <select
              id="override-target"
              value={targetKey}
              onChange={(e) => {
                setTargetKey(e.target.value)
                setName('')
              }}
              className="h-8 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="request">
                Request {request.ref} ({request.status.replace('_', ' ')})
              </option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  L{l.line_no} {configLabel(l)} ({l.commercial_status.replace('_', ' ')} · {l.technical_status.replace('_', ' ')})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="override-event">New state</Label>
            <select id="override-event" value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">Choose a state</option>
              {options.map((e) => (
                <option key={e.name} value={e.name}>
                  {e.label} · {e.track} track
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="override-reason">Reason</Label>
            <Textarea id="override-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why the process does not fit this case" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={!ready}>
            Force and log the override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
