// Design section layout. Spec section 8.

import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { usePinnedHeader } from '@/components/AppHeader'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/design')({
  component: DesignLayout,
})

type Page = { to: '/design' | '/design/model' | '/design/decomposition' | '/design/data' | '/design/ai' | '/design/verification' | '/design/releases' | '/design/assumptions' | '/design/architecture'; label: string; exact?: boolean } | { scenario: 'a' | 'b'; label: string }

const PAGES: Page[] = [
  { to: '/design', label: 'Overview', exact: true },
  { to: '/design/model', label: 'Model' },
  { to: '/design/decomposition', label: 'Decomposition' },
  { scenario: 'a', label: 'Scenario A' },
  { scenario: 'b', label: 'Scenario B' },
  { to: '/design/data', label: 'Data' },
  { to: '/design/ai', label: 'AI and evals' },
  { to: '/design/verification', label: 'Verification' },
  { to: '/design/releases', label: 'Release plan' },
  { to: '/design/assumptions', label: 'Assumptions' },
  { to: '/design/architecture', label: 'Architecture' },
]

const LINK = 'block whitespace-nowrap rounded px-2 py-1 text-sm hover:bg-accent'
const ACTIVE = { className: 'bg-accent font-medium' }

function DesignLayout() {
  const pinned = usePinnedHeader()
  return (
    // Below 768 px the design nav is one row that scrolls sideways above the page.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[180px_minmax(0,1fr)] md:gap-6">
      <nav aria-label="Design" className={cn('min-w-0 md:sticky md:self-start', pinned ? 'md:top-[65px]' : 'md:top-4')}>
        <p className="mb-2 hidden px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:block">Design</p>
        <ul className="flex gap-1 overflow-x-auto pb-1 md:block md:space-y-0.5 md:overflow-visible md:pb-0">
          {PAGES.map((p) => (
            <li key={p.label}>
              {'scenario' in p ? (
                <Link to="/design/scenarios/$id" params={{ id: p.scenario }} className={LINK} activeProps={ACTIVE}>
                  {p.label}
                </Link>
              ) : (
                <Link to={p.to} activeOptions={{ exact: p.exact ?? false }} className={LINK} activeProps={ACTIVE}>
                  {p.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  )
}
