# Decision records

Format: context, decision, options considered, consequences. ADR-1 to ADR-6 shaped the design (`docs/DESIGN.md`). ADR-7 records the configuration of the full-stack build. ADR-8 records the public demo, and supersedes ADR-7 for anything public.

## ADR-1 — The line is the unit of state, with two tracks

Context: one request mixes outcomes: partial acceptance, late feasibility problems, changes and mixed states.
Decision: state lives on the line as a commercial track and a technical track. The request has a small status of its own.
Options considered: one status per request, which cannot express mixed states. One status per line, which mixes commercial and technical. A workflow engine, which is too heavy for a first release.
Consequences: the order guard is a pure function over lines, and each of these situations maps to transitions.

## ADR-2 — Level 2 autonomy

Context: the process is known and stable enough to write down.
Decision: a fixed workflow in code with LLM steps for language tasks, human approval on every state change.
Options considered: an agent with tools that drives the workflow (less predictable, harder to eval), no LLM at all (loses the intake and reply value).
Consequences: the product is testable and explainable, and autonomy can grow later where evals allow it.

## ADR-3 — References and prices are code, not a model

Context: "what makes a quotation a useful reference" depends on product, material, quantity, customer and age.
Decision: a scoring formula with visible weights, and price statistics from the top references.
Options considered: an embedding search (opaque weights), an LLM ranking (not reproducible).
Consequences: the business can read and tune the weights, and every suggestion is explainable.

## ADR-4 — Every revision is a snapshot

Context: the legacy table keeps the last version only.
Decision: `QuotationLine` snapshots per revision, with a diff view.
Consequences: negotiation history becomes data, and future analysis of revisions is possible.

## ADR-5 — Replay fallback for demos and outages

Context: live model calls can fail during a demo or an outage.
Decision: a cache keyed by step and input hash, used on failure or on demand.
Consequences: the demo never stalls, and the same mechanism supports offline tests. ADR-8 builds the public demo on it.

## ADR-6 — Overrides are a feature

Context: the process has informal rules that nobody has written down.
Decision: any transition can be forced with a reason and is logged as an override.
Consequences: the product collects the exceptions that become the next rows of the transition table.

## ADR-7 — Configuration in GitHub secrets, synced to Netlify as plain variables (superseded by ADR-8 for the public demo)

Context: during the build, GitHub repository secrets were the single source of truth, and `netlify dev` and `netlify dev:exec` had to inject the same values locally. Netlify "secret" variables come back masked to code that runs outside the Netlify infrastructure, so marking them secret would have broken local work.
Decision: a workflow set every variable as a plain site variable, in all contexts. The site was private and password-protected.
Options considered: secret variables (breaks local injection), a `.env` file on disk.
Consequences: anyone with access to the site settings could read the values. For a site that is public, this is not acceptable, which is one reason for ADR-8.

## ADR-8 — The public demo is static and replays recorded model outputs

Context: the public demo must be free to run, always on, open to anyone, and impossible to abuse for model calls. It must still show the real product, the real AI steps and their traces.
Decision: a static build of the same code. A build-time switch replaces the backend module: the data lives in an in-memory store seeded from the bundled history and kept per browser tab, and the AI steps run in the browser with the same step runner against outputs recorded live with the scenario inputs. The model client refuses every call, so an input without a recording takes the manual path, as a failed call does. The site has no database, no functions and no environment variables. The full stack stays in the repository as a local live mode with your own Supabase project and Gemini key.
Options considered: a public full-stack site with a rate limit (keys in production, cost and abuse risk), a video (not interactive), a public site with live calls behind a password (not public).
Consequences: anyone can run both scenarios end to end, reload, go back and reset, with nothing to configure. Free text that was not recorded gets no AI draft in the demo. Recordings must be redone when an input changes; `scripts/record-replay.ts` finds the missing ones with `--dry`.
