import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import { AppHeader } from '@/components/AppHeader'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PUBLIC_REPO_URL } from '@/config/demo'
import { isStaticBuild } from '@/lib/mode'
import { SessionProvider } from '@/lib/session'

type RouterContext = {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-[1440px] space-y-2 px-6 py-5">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p>
      <p className="text-sm">
        Reload the page. If it happens again, go to the <a href="/requests" className="text-primary underline">requests list</a>.
      </p>
    </div>
  ),
})

const NAV = [
  { to: '/requests', label: 'Requests' },
  { to: '/ops', label: 'Operations queue' },
  { to: '/design', label: 'Design' },
  { to: '/', label: 'About' },
] as const

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/** Keyboard: `/` focuses the search. `Esc` closes panels (handled by the panels). `Enter` approves the focused dialog (handled by the dialogs). Spec 6.1. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditable(e.target)) {
        const input = document.getElementById('global-search')
        if (input instanceof HTMLInputElement) {
          e.preventDefault()
          input.focus()
          input.select()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function RootLayout() {
  useShortcuts()
  // The landing page stands on its own; the app chrome starts at the requests list.
  const landing = useRouterState({ select: (s) => s.location.pathname === '/' })
  if (landing) {
    return (
      <SessionProvider>
        <TooltipProvider delayDuration={200}>
          <Outlet />
        </TooltipProvider>
      </SessionProvider>
    )
  }
  return (
    <SessionProvider>
      <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-background">
        <AppHeader />
        {isStaticBuild && <ReplayBanner />}
        <div className="mx-auto flex max-w-[1440px]">
          <nav aria-label="Main" className="min-h-[calc(100vh-3rem)] w-52 shrink-0 border-r bg-sidebar px-3 py-4">
            <ul className="space-y-1">
              {NAV.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="block rounded-md px-3 py-1.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent"
                    activeProps={{ className: 'bg-sidebar-accent font-medium' }}
                    activeOptions={{ exact: item.to === '/' }}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <main className="min-w-0 flex-1 px-6 py-5">
            <Outlet />
          </main>
        </div>
        <Toaster position="bottom-right" />
      </div>
      </TooltipProvider>
    </SessionProvider>
  )
}

/** The static demo says once, on every page, what its AI steps do. */
function ReplayBanner() {
  return (
    <div role="note" className="border-b bg-accent/40">
      <p className="mx-auto max-w-[1440px] px-4 py-1.5 text-sm">
        AI steps replay recorded model outputs. Run them live with your own key: see the{' '}
        <a href={`${PUBLIC_REPO_URL}#run-it-live`} className="text-primary underline" target="_blank" rel="noreferrer">
          README
        </a>
        .
      </p>
    </div>
  )
}

function NotFound() {
  return (
    <div className="space-y-2">
      <h1 className="text-lg font-semibold">This page does not exist</h1>
      <p className="text-muted-foreground">
        Go to the <Link to="/requests" className="text-primary underline">requests list</Link>.
      </p>
    </div>
  )
}
