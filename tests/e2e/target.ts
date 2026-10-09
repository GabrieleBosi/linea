// Which build the UI tests run against. `npm run e2e`: the static demo build (default).
// `npm run e2e:full` (or E2E_TARGET=full): a local `npm run dev:live`, with the reset token injected.

export const fullStack = process.env.E2E_TARGET === 'full' || process.env.npm_lifecycle_event === 'e2e:full'
export const isStatic = !fullStack
export const resetToken = process.env.DEMO_RESET_TOKEN
