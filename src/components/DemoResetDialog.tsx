import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { clearPlayerRuns, getDemoToken, resetDemo, setDemoToken } from '@/lib/demo'
import { isStaticBuild } from '@/lib/mode'

export function DemoResetDialog({ open, onClose, onDone, warning }: { open: boolean; onClose: () => void; onDone?: () => void; warning?: string }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setToken(getDemoToken() ?? '')
      setError(null)
    }
  }, [open])

  const run = async () => {
    setBusy(true)
    setError(null)
    // The static demo keeps its data in this tab only, so its reset needs no token.
    const r = await resetDemo(isStaticBuild ? '' : token.trim())
    setBusy(false)
    if (!r.ok) {
      if (r.status === 403) setDemoToken(null)
      setError(`${r.error} ${r.next}`)
      return
    }
    if (!isStaticBuild) setDemoToken(token.trim())
    // Both scenario players: their saved runs point at rows the reset just deleted.
    clearPlayerRuns()
    const total = Object.values(r.deleted).reduce((a, b) => a + b, 0)
    toast.success(isStaticBuild ? `Demo reset. ${total} row(s) cleared. The seeded history and the recorded AI outputs are kept.` : `Demo reset. ${total} row(s) deleted. Reference data and the replay cache are kept.`)
    await qc.invalidateQueries()
    onClose()
    if (onDone) onDone()
    else navigate({ to: '/requests' })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !busy && (isStaticBuild || token.trim() !== '') && (e.target as HTMLElement).tagName !== 'BUTTON') {
            e.preventDefault()
            void run()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Reset the demo?</DialogTitle>
          <DialogDescription>
            {isStaticBuild
              ? 'This clears every request, line, revision, reply, check, order, event and AI trace made in this browser tab. The customers, the catalog, the rules, the legacy quotations and the recorded AI outputs stay.'
              : 'This deletes every request, line, revision, reply, check, order, event and AI trace. Customers, the catalog, the rules, the legacy quotations and the replay cache stay.'}
          </DialogDescription>
        </DialogHeader>
        {warning && <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-sm text-amber-900" role="alert">{warning}</p>}
        {!isStaticBuild && (
          <div className="space-y-1">
            <Label htmlFor="demo-token">Reset token</Label>
            <Input id="demo-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Asked once, kept for this browser session" autoFocus />
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={run} disabled={busy || (!isStaticBuild && token.trim() === '')}>
            {busy ? 'Resetting…' : 'Reset demo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
