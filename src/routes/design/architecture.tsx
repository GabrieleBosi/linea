import { createFileRoute } from '@tanstack/react-router'
import { ArchitectureDiagram } from '@/components/design/Diagrams'
import { Markdown } from '@/components/Markdown'
import architecture from '@/design/content/architecture.md?raw'

export const Route = createFileRoute('/design/architecture')({
  component: () => (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Architecture</h1>
      <figure className="rounded-md border bg-card p-4">
        <ArchitectureDiagram />
        <figcaption className="mt-2 text-xs text-muted-foreground">Browser → Netlify (static app, functions) → Supabase (Postgres) and Gemini. Keys stay in the functions.</figcaption>
      </figure>
      <Markdown source={architecture} />
      <section className="rounded-md border bg-card p-4 text-sm">
        <h2 className="mb-1 font-semibold">Prototype-only database policies</h2>
        <p className="text-muted-foreground">Row Level Security is on for every table. The anonymous key can read every table, and insert and update the transactional ones: requests, lines, quotations, quotation lines, customer responses, feasibility checks, orders, events. Only the service role, inside the functions and the scripts, writes AI runs and the replay cache, and deletes rows. These are demo policies, not a permission model.</p>
      </section>
    </div>
  ),
})
