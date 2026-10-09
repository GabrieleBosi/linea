## Why this stack

A thin stack that a small team can run. The browser is a static React app served by Netlify. It talks to Postgres on Supabase with the anonymous key, behind Row Level Security with permissive prototype policies. The AI steps, the AI decision record and the demo reset run in Netlify functions, which hold the Gemini key and the service-role key; the browser never sees either. The domain is pure TypeScript with no IO, so the same transition table, cost model, reference engine and checks run in the unit tests, in the app and in the functions. Configuration lives in GitHub secrets and is synced to the site by a workflow. Password protection at the edge kept the prototype unlisted during the build; it is not a security boundary.

## The public demo

The public site is the static build of the same code (`npm run build:static`). A build-time switch replaces the backend module: the data lives in an in-memory store seeded from the bundled history and kept per browser tab, and the AI steps run in the browser with the same step runner against the recorded model outputs. No database, no functions, no keys. An input without a recording takes the manual path, as a failed model call does. The full stack above stays in the repository as the local live mode.
