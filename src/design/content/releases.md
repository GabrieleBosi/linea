## Release plan

What goes into users' hands first, and why. The prototype contains all three releases. This plan is about what the business gets access to and when, not about build effort. Each release is a change for the people who use it, so the increments stay small and observable.

| Release | Content | Success signal |
|---|---|---|
| 1 — The shared record (weeks 1 to 3) | Requests, lines with two tracks, revisions as snapshots, references from history, the timeline, the order readiness checklist, legacy import. No LLM. | Sales enters 100 percent of new requests. The model gap log stays empty for five replays. |
| 2 — Assisted intake and replies (weeks 4 to 7) | intake_extract and reply_interpret behind approval, the Operations queue with rule pre-checks, traces and evals in production. | AI acceptance without edits above 70 percent. Feasibility flags before the send above 80 percent. |
| 3 — Depth (weeks 8 and later) | Price memo and cover text, change-after-acceptance rules, order hand-off to production, analytics. An MCP server that exposes the read tools (references, readiness, request summary) to an assistant. | Revisions per won request decrease. |

## Why release 1 has no LLM

The record is the product. The LLM saves minutes per request. The record saves the process. Traces from release 1 also give the real eval cases for release 2.
