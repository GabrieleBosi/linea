import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { isStaticBuild } from '@/lib/mode'
import { PERSONAS, useSession, type Role } from '@/lib/session'
import { cn } from '@/lib/utils'
import { DemoResetDialog } from './DemoResetDialog'

/**
 * On the scenario pages the header stays pinned, and the player bar pins below it, so the role
 * switch never slides under the run controls. Height: h-12 plus the 1 px border.
 */
export function usePinnedHeader(): boolean {
  return useRouterState({ select: (s) => s.location.pathname.startsWith('/design/scenarios/') })
}

export function AppHeader() {
  const { role, setRole, replay, setReplay } = useSession()
  const navigate = useNavigate()
  const [resetOpen, setResetOpen] = useState(false)
  const [q, setQ] = useState('')
  const pinned = usePinnedHeader()

  return (
    <header className={cn('border-b bg-card', pinned && 'sticky top-0 z-20')}>
      <div className="mx-auto flex h-12 max-w-[1440px] items-center gap-2 px-3 sm:gap-4 sm:px-4">
        <Link to="/requests" className="flex items-baseline gap-2">
          <span className="text-base font-semibold text-primary">Linea</span>
          <span className="hidden text-sm text-muted-foreground sm:inline">Ferralba Steel</span>
        </Link>

        <div className="flex-1" />

        <form
          className="hidden md:block"
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            navigate({ to: '/requests', search: q.trim() ? { q: q.trim() } : {} })
          }}
        >
          <label className="sr-only" htmlFor="global-search">
            Search requests
          </label>
          <input
            id="global-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search requests  /"
            className="h-8 w-64 rounded-md border bg-background px-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </form>

        <div role="group" aria-label="Role" className="flex rounded-md border p-0.5">
          {(Object.keys(PERSONAS) as Role[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              aria-pressed={role === r}
              className={cn('rounded px-2.5 py-1 text-sm', role === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}
            >
              {PERSONAS[r].label}
            </button>
          ))}
        </div>

        {/* The static demo only replays; the banner under the header says so. */}
        {!isStaticBuild && (
          <div role="group" aria-label="AI mode" title="Live calls the model. Replay reads the recorded answers first." className="flex rounded-md border p-0.5">
            {([
              ['Live', false],
              ['Replay', true],
            ] as const).map(([label, value]) => (
              <button
                key={label}
                type="button"
                onClick={() => setReplay(value)}
                aria-pressed={replay === value}
                className={cn('rounded px-2.5 py-1 text-sm', replay === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <span className="hidden text-sm text-muted-foreground sm:inline">{PERSONAS[role].name}</span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Menu" className="rounded-md border px-2 py-1 text-sm hover:bg-accent">
              ⋯
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => navigate({ to: '/design' })}>Design</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setResetOpen(true)}>Reset demo…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <DemoResetDialog open={resetOpen} onClose={() => setResetOpen(false)} />
    </header>
  )
}
