// The decomposition table. Spec section 3. Rendered on /design/decomposition.

export type Executor = 'llm' | 'code' | 'human' | 'human+code' | 'llm+human' | 'llm+checks' | 'code+llm'

export type DecompositionRow = {
  n: number
  step: string
  executor: string
  executorKind: Executor
  io: string
  risk: 'Low' | 'Medium' | 'High' | '—'
  why: string
  /** P1 or P2 when the step is not in the P0 build. */
  scope?: 'P1' | 'P2'
}

export const DECOMPOSITION: readonly DecompositionRow[] = [
  { n: 1, step: 'Read the customer email and list what they want', executor: 'LLM intake_extract + human approval', executorKind: 'llm+human', io: 'Raw text → structured lines, open questions', risk: 'Medium', why: 'Free text needs language understanding. The output is checkable against the catalog and the text.' },
  { n: 2, step: 'Decide if a line needs a technical check', executor: 'Code preCheck', executorKind: 'code', io: 'Line → rule hits, new-configuration flag', risk: 'Low', why: 'Known rules are code. Unknown rules come from Operations over time.' },
  { n: 3, step: 'Find past quotations that are useful references', executor: 'Code references', executorKind: 'code', io: 'Line, customer → top 5 with score breakdown', risk: 'Low', why: 'Similarity is a formula the business can read and tune.' },
  { n: 4, step: 'Estimate production cost', executor: 'Code costModel', executorKind: 'code', io: 'Configuration → cost', risk: 'Low', why: 'Arithmetic.' },
  { n: 5, step: 'Choose a price', executor: 'Human, with code suggestion', executorKind: 'human+code', io: 'References, cost, margin bands → price', risk: 'High', why: 'Judgement stays with Sales. The product shows evidence.' },
  { n: 6, step: 'Explain the price internally', executor: 'LLM price_memo + checks', executorKind: 'llm+checks', io: 'References, cost, price → 3 sentences', risk: 'Low', why: 'Text generation with numeric grounding checks.', scope: 'P1' },
  { n: 7, step: 'Write the quotation cover text', executor: 'LLM cover_text + checks', executorKind: 'llm+checks', io: 'Revision → text', risk: 'Medium', why: 'Policy checks: every line covered, feasibility disclaimer present.', scope: 'P1' },
  { n: 8, step: 'Send the quotation', executor: 'Human', executorKind: 'human', io: 'Revision → sent', risk: '—', why: 'Side effect. Human only.' },
  { n: 9, step: 'Read the customer reply and update each line', executor: 'LLM reply_interpret + human approval', executorKind: 'llm+human', io: 'Reply, revision → per-line decisions', risk: 'High', why: 'Language understanding. Every decision is approved before state changes.' },
  { n: 10, step: 'Apply the decisions', executor: 'Code applyEvent', executorKind: 'code', io: 'Decisions → transitions, new revision draft', risk: 'Low', why: 'Deterministic.' },
  { n: 11, step: 'Do the feasibility check', executor: 'Human (Operations)', executorKind: 'human', io: 'Line, rule hits → feasible / not feasible, alternative', risk: 'High', why: 'Tacit knowledge. The product records it as data.' },
  { n: 12, step: 'Decide that the request is an executable order', executor: 'Code guard + human click', executorKind: 'human+code', io: 'Lines → order', risk: 'Low', why: 'The guard is code. The click is human.' },
  { n: 13, step: 'Classify a change after acceptance', executor: 'Code rules, LLM for free text', executorKind: 'code+llm', io: 'Change → classification', risk: 'Medium', why: 'Rules first.', scope: 'P2' },
]

export const AUTONOMY_SCALE = [
  { level: 1, label: 'Single call', detail: 'One prompt, one answer.' },
  { level: 2, label: 'Fixed workflow', detail: 'The sequence is code. The model fills one structured output per step. A human approves.' },
  { level: 3, label: 'Model picks the path', detail: 'The model chooses which step or tool comes next.' },
  { level: 4, label: 'Model plans the steps', detail: 'The model plans and re-plans a multi-step task.' },
] as const

export const AUTONOMY_LEVEL = 2

export const PATTERN_CHIPS = [
  { label: 'Fixed workflow (Level 2)', used: true },
  { label: 'Tool use (code tools)', used: true },
  { label: 'Reflection with external checks (steps 6 and 7)', used: true },
  { label: 'Multi-agent', used: false },
] as const

/** Three bullets for the overview. */
export const AUTOMATION_SUMMARY = [
  'Automated with approval: reading the customer email into lines (step 1) and reading the customer reply into decisions (step 9). An LLM drafts, code checks, a human approves.',
  'Automated by code: feasibility pre-check, references from history, cost estimate, state transitions and the order guard (steps 2, 3, 4, 10, 12). No model involved.',
  'Not automated: choosing the price, sending the quotation, the feasibility decision and the click that makes an order (steps 5, 8, 11, 12). Judgement and side effects stay with people.',
] as const
