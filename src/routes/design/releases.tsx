import { createFileRoute } from '@tanstack/react-router'
import { Markdown } from '@/components/Markdown'
import releases from '@/design/content/releases.md?raw'

export const Route = createFileRoute('/design/releases')({
  component: () => (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Release plan</h1>
      <Markdown source={releases} />
    </div>
  ),
})
