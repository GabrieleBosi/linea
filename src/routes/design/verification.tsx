import { createFileRoute } from '@tanstack/react-router'
import { Markdown } from '@/components/Markdown'
import verification from '@/design/content/verification.md?raw'

export const Route = createFileRoute('/design/verification')({
  component: () => (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Verification</h1>
      <Markdown source={verification} />
    </div>
  ),
})
