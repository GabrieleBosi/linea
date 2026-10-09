## Does the model match reality?

1. **Replay the past.** Take 20 real requests from email and spreadsheets, not from the legacy table. Enter them in Linea as they happened, with their original dates. Log every moment where the model cannot represent what happened in a model gap log. Target before release 1: zero gaps in the last five replays.
2. **Shadow two weeks.** Sales keeps its spreadsheets. One person mirrors every live request in Linea. Count gaps and overrides per week.
3. **Instrument the product.** Three signals are the truth: forced transitions with a reason, AI outputs edited before approval, and "other" reasons on hold, reject and decline. Review them every week for 30 minutes with one Sales and one Operations user.
4. **Keep the process as data.** The transition table, the feasibility rules and the reference weights are data with tests. An exception found in the review becomes a row and a test in the same week.
5. **Measure before and after.** Time from request to first sent revision. Revisions per won request. Share of lines with a feasibility flag before the send, not after. AI acceptance rate without edits.

The model gap log lives in `docs/VERIFICATION.md`. It is empty until the first replay: the prototype holds no real request.
