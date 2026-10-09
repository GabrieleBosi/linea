// Assumptions (spec 1.4) and the questions that came up during the build.

export type Assumption = { id: string; assumption: string; why: string; question: string }

export const ASSUMPTIONS: readonly Assumption[] = [
  { id: 'A1', assumption: 'Legacy quotations describe standard 12 m bars.', why: 'The legacy table has no length.', question: 'What lengths were quoted historically?' },
  { id: 'A2', assumption: 'One quotation revision covers all open lines of a request.', why: 'Partial acceptance happens line by line inside one offer.', question: 'Do you ever send separate quotations for one request?' },
  { id: 'A3', assumption: 'A feasibility check is needed for a configuration that is new or that hits a known rule. Known configurations do not need one.', why: 'Keeps Operations load low.', question: 'Which configurations are "known"?' },
  { id: 'A4', assumption: 'Currency is EUR. Prices exclude tax and transport. Validity is 30 days.', why: 'Prototype simplification.', question: 'What are the real commercial terms?' },
  { id: 'A5', assumption: 'The margin floor is 15 percent. Below it, a sales lead approves.', why: 'The history shows margins from 14 to 26 percent; four in five sit between 17 and 23.', question: 'Who approves low margins today?' },
  { id: 'A6', assumption: 'Customers communicate by email. Sales records replies.', why: 'That is how quotes and replies travel in this kind of business today.', question: 'Is there a customer portal in the future?' },
  { id: 'A7', assumption: 'A line accepted by the customer stays agreed when a later revision changes other lines.', why: 'Partial acceptance is normal.', question: 'Do accepted lines ever get re-opened by a revision?' },
  { id: 'A8', assumption: 'Changes after acceptance: within 10 percent of quantity and same configuration, the agreement stays valid.', why: 'A reasonable first threshold.', question: 'What are the real thresholds?' },
]

export type BuildQuestion = { phase: string; question: string; status: 'open' | 'answered'; answer?: string }

/** Questions that changed the product during the build, with the answer taken. */
export const BUILD_QUESTIONS: readonly BuildQuestion[] = [
  { phase: 'Data', question: 'The win formula of spec 5.2 gives 76 to 81 percent win rates and misses the 60 to 75 percent target. Keep the intercept at 0.7, or keep 1.2 and relax the test?', status: 'answered', answer: 'Keep 0.7 and the target. A sweep over seeds is the justification.' },
  { phase: 'Data', question: 'Four generated customer names sat close to real companies. Replace them?', status: 'answered', answer: 'Replaced, and every new name checked again.' },
  { phase: 'Domain', question: 'proposeAlternative and sendRevision write without a transaction. Accept for the prototype?', status: 'answered', answer: 'Accepted. Listed as a known gap; the fix is one Postgres function per use case.' },
  { phase: 'AI', question: 'The AI functions have no session check of their own. Add a shared secret header?', status: 'answered', answer: 'No: a value the browser sends is not a secret. The public demo has no functions at all.' },
  { phase: 'AI', question: 'Show an estimated money cost per run on the AI page, or tokens only?', status: 'answered', answer: 'Both, with the money labelled as assumed and the source of the prices next to it.' },
  { phase: 'AI', question: 'The history has no length, so a reference price per piece can sit far from the suggested price. Show a price per tonne?', status: 'answered', answer: 'Only where tonnage can be derived (Linea references). Legacy references read "per piece, length unknown".' },
  { phase: 'AI', question: 'cover_text times out at the 35 s budget with thinking MEDIUM. Raise the budget or lower the thinking level?', status: 'answered', answer: 'Thinking LOW, a measured deviation from the spec: no timeout, same checks and judge results. price_memo too: 20 of 20 held, p50 from 20 s to 3 s.' },
  { phase: 'AI', question: 'numbers_grounded failed correct memos that repeated the margin the prompt shows. Fix the prompt or the check?', status: 'answered', answer: 'The check: the margin of the suggested price is shown to the model, so it counts as input. Tested both ways.' },
  { phase: 'Demo', question: 'Should the public demo call the model?', status: 'answered', answer: 'No. It replays recorded outputs; the README shows how to run the steps live with your own key.' },
  { phase: 'Business', question: 'Which past quotations count as "known configurations" that need no technical check? Today the rule is: at least one reference in history with the same family, size and material.', status: 'open' },
  { phase: 'Business', question: 'Who approves a price below the 15 percent floor, and is the floor the same for every family?', status: 'open' },
  { phase: 'Business', question: 'Should a customer reply that mentions a line not in the revision create a new line, or only a note for Sales? Today it is a note.', status: 'open' },
]
