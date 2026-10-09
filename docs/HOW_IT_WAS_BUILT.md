# How it was built

I built Linea with an AI coding agent, Claude Code, over three days (22–24 September 2026), and turned it into this public version in October. This page is the story of that build: how the work was set up, what the loop looked like, what went wrong, and where the agent needed me.

## Spec first

Before any code, I wrote one design document, now `docs/DESIGN.md`. It fixes the things an agent should not decide on its own: the one model (a request line with a commercial and a technical track), the decomposition of the process into thirteen steps with an executor for each, the four LLM steps with their schemas, checks and approval points, the eval sets and their targets, the two demo scenarios as data, and the phases with a stop after each one.

Next to it, a short rules file for the agent: every state change goes through `applyEvent()`; no LLM output changes state without a human approval in the UI; TypeScript strict with `zod` at every boundary; read the traces and the eval failures before you change a prompt; when the spec is silent, take the option that keeps autonomy lowest and write it down.

The agent worked with the Supabase, Netlify, Playwright and Context7 MCP servers, so it could apply migrations, deploy, walk the UI in a browser and check current SDK documentation itself.

## Phases and stops

Each phase ended the same way: tests green, a deploy, an entry in the build log, a commit, and a stop for my review. The next phase started only after I had read the log, walked the deployed site and answered the open questions.

1. **Setup.** Supabase, Netlify, CI, a hello function. The first browser walk found that the dev proxy rewrote the Vite module requests to `index.html`; the fix moved the single-page fallback into `public/_redirects`.
2. **Skeleton without an LLM.** The domain as pure TypeScript (24 transition rows as data, one test per row), the reference engine, the cost model, the generator, every screen with manual input, both scenarios as tests. 107 tests. The generator's win formula from my own spec missed the 60 to 75 percent target of the same section; a sweep over seeds showed that only the intercept moves it, and I took 0.7 over relaxing the test.
3. **The two P0 AI steps.** Intake and reply interpretation, the replay cache, traces, the eval runner with quality, adversarial and control sets. The first run showed one contaminated case: the model copied a code payload into a note. The error analysis put it on the prompt; prompt v2 brought contamination from 1 of 15 to 0.
4. **Design pages.** The step player, the decomposition and model pages rendered from code, the AI page from the eval results. The walk found that the player did not record the human decision on the AI run, as the screens do.
5. **P1 items.** Hold, reject, reopen, overrides, the price memo and the cover text with a judge model. Two fixes came from reading the judge's verdicts: it read the raw JSON and called "EUR" an invented fact, so it now reads the prompt the writer saw; and my cover-text examples signed with a name that was not in the input. The cover text timed out at MEDIUM thinking and moved to LOW with the same results.

## Walk-throughs, reviews and fixes

Tests caught logic errors. They did not catch what a person sees in front of the screen, so I walked the deployed site end to end before calling the build done, several times. Each walk-through produced a short list. The fixes went in as pull requests, most with a test that fails without the fix:

- the step player lost its run on a reload, and later lost its scenario state after "Reset demo and start" because two copies of the context existed;
- once an order existed, a line ranked as a reference for itself, with a perfect score;
- the deep-linked composer opened with an empty price, from a copy of the request taken before the step that priced it;
- the player bar slid over the role switch when the page scrolled, and a click meant for the role switch ran the whole scenario.

After the walks, three automated code reviews (domain, AI, UI) read the whole build. They found a step that could run twice after it had written and then failed its check, a free-text material field that could reach the cost model with a grade outside the catalog, and a regular expression that had never matched, because `\b` in a plain template string is a backspace. Each became a fix with a test.

## Two stories from the evals

The numbers are good now, and two failures explain what they are worth.

The first was mine. On the earlier data the judge failed one memo in two of three runs: it called the median margin of the references the margin of the suggested price. The cause was my own few-shot example, which says exactly that. A code check could not see it, because the number is in the prompt; the judge could. Prompt v3 puts the two margins on separate lines and its example keeps them apart: the cases where they differ pass 9 of 9 in three runs, and the memo step reads 98 percent over the three runs.

The second came during the public rework. A correct memo failed `numbers_grounded` because the check only knew the fields of the input, not the margin the prompt computes from them. Re-graded offline, the old check had been failing 9 of 60 correct memos. I fixed the grader, with tests that it still rejects a margin the prompt does not show, not the prompt. Both stories are in `evals/error-analysis.md`.

## What the agent was good at, and where I stepped in

The agent was good at breadth and at keeping things consistent: a test per transition row, the same rule in four places, the recorder and the composer building the same input. It read traces and eval failures carefully and attributed them before it changed anything. It found root causes I would not have looked for, such as a reset that was still deleting rows while the next step wrote, found in the database's edge logs.

I stepped in where the choice changed the product or its honesty:

- which situations the scenarios had to cover, and what the first release holds without AI;
- keeping the win-rate target instead of relaxing the test, LOW thinking as a measured deviation, the price per tonne only where the length is known, live mode as the default with replay as the fallback;
- asking for a held-out set and three repeat runs when the first scores came from the tuning cases;
- rejecting a shared-secret header for the AI functions, because a value the browser sends is not a secret;
- moving the late fixes onto branches with pull requests and code review, with one triage rule: fix what breaks the demo or makes a claim wrong, log the rest;
- a review pass that checked every number in the docs against the evidence behind it;
- and what the public demo may claim.

The walk-throughs were mine too: the screen positions, the bugs that only show when you click through a whole scenario, and the moments where the product said something that was not quite true.

## Making it public

The private build ran on a password-protected site with its keys in the site settings. For this version I rebuilt the data: new anchor customers and quotations, a regenerated history, every AI output the demo can reach re-recorded, and the full eval suite re-run three times plus the held-out set. The demo became a static build of the same code: an in-memory store per browser tab and in-browser replays of the recorded outputs, with no database, no functions and no keys (ADR-8). The full stack stays in the repository as the local live mode.

What I would do next: version the line in scenario B, so the alternative keeps its history in one place; tell the memo prompt that the low end of the won range is not a limit, the judge's one remaining objection; move the multi-row writes into one Postgres function each.
