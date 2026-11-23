# Relay: its own choice inside a mode, by index and price (design)

Status: on 2026-11-23 the owner asked how Relay should pick between several models in one mode, and brought two routing designs to compare. They chose my proposal: "Write it up, build after the re-run". The re-run and then a test of the decider alone followed the same day, and the gate is now open (see Gate). A builder check the same day raised four points, settled below: helpers, efforts, an unsure answer after a failed try, and the smoke. Choices made while writing are marked *(my call)*.

## Why

The owner, 23 Nov: "if i select multiple models to route to best models according to the problem (cheap and have best intelligence index according to the problem)".

Today Relay follows only the person's "use it for" lines. With no lines written, the first model in the list is always used, so a second model sits idle.

What the tests and the research say (`docs/compatibility.md`, `docs/research/2026-11-17-relay-cost-and-model-choice.md`):
- One model a mode saved 29.8% on Go (6 of 6 exercises passed, Off 4 of 6) and 42.2% on Ollama.
- A move to another model makes it read the whole chat again without the cache. On `variable-length-quantity`, Kimi's review read 40,435 tokens new after Flash's build, and Relay cost twice what Off did. A change of effort kept the cache (18 Nov, Claude models).
- Price per token is not cost: that Flash build wrote 37,522 output and reasoning tokens.
- A decider sorts a message into kinds of work well (about 93%). It can't rank models, and guessing difficulty from the message alone scored 0.52 and 0.63.
- A reviewer weaker than the writer cut passes from 91.4% to 82.8% in one study.

## Goals

1. When a mode has two or more usable models and no lines, Relay chooses by itself: the highest index for big, unclear or risky work and after a failed try, the cheapest for small, clear work.
2. The index fits the problem: Artificial Analysis's Coding index for Execute when every model in the comparison has one, the main index otherwise.
3. "Cheapest" counts how much a model writes, not only its price per token.
4. In Review, Relay's own choice never takes a reviewer with a lower index than the model that wrote the work.
5. The panel shows which model takes which work, or why Relay can't rank the list.

## Non-goals

- No change where the person wrote lines: the decider follows them, as today *(my call: one rule, write lines and Relay follows them, write none and Relay chooses)*.
- No new setting *(my call)*.
- From the two designs the owner brought: no checking an answer before the person sees it, no self-rated confidence, no second model in parallel and no judge, no retries or failover (OpenCode retries), no learned pass rates, no fixed table of named models.
- No change to the mode question, Plan when unsure, the cost check (`stayOrGo`), the first-model default, or the size caps.

## Anti-goals: a failure even if it works

- The decider seeing model names, prices or scores. It is asked about the work, never about models.
- A network request while a message is placed. Only stored copies are read.
- A slower or failed message. A read that fails or is late means Relay does not choose by itself this time.
- Treating a failed try as small work. A failed try the decider sees in the last reply counts as big. When the decider is unsure, the first model is used even then (the owner's 19 Nov rule).
- Two different indexes in one comparison.

## Approaches (put to the owner on 23 Nov)

- **A. Their first design** (sub-task and acceptance test, filter, the cheapest route that meets a quality target, verify before committing, escalate by failure, failover). Its second half needs a router that sends the request and sees the answer before the person does. Relay picks once, before the message goes, and the answer lands in the chat, often after files changed.
- **B. Their second design** (classifier, capability matrix, success-rate scoring, confidence escalation, parallel pools). The same problem; self-rated confidence and parallel pools add cost without a signal Relay can trust.
- **C. Smart enough, then cheapest: picked before sending, corrected on the next message.** The front half of A, on Relay's existing decider, checks and cost check. Picked by the owner.

Within C, Relay writing its own lines into empty boxes was weighed against a size question. The size question was chosen: no mixed lists, and the lines stay the person's *(my call)*.

## The design

1. **When Relay chooses by itself** (`src/router.ts`). A mode qualifies when, after today's checks (offered, pictures, size), it has two or more usable models, no model in its list has a line, and Relay can rank every usable one (an index and a price, steps 3 and 4). Otherwise everything is as today, and the note says what was missing, for example "no index for X, so the first model is picked".
2. **The size question** (`src/decider.ts`). For such a mode the request carries `<mode>_size` instead of a line question: "How big is the work? Judge by the person's message and the end of the chat's last reply." Two choices:
   - `small`: small and clear. One or two files, a quick question, a simple edit.
   - `big`: big, unclear or risky. Several files, a new feature, a hard bug, data, money or security, or the last reply shows a failed try.
   - The end of the last reply goes with a size question, as it does with a line question.
3. **Strongest: the highest index.**
   - Execute: the Coding index when every usable model has one, otherwise the main index. Plan and Review: the main index.
   - From the stored Artificial Analysis list when a key is saved (it scores each effort), else the stored OpenRouter copy (one number a model, at its highest effort).
   - A model's score is Artificial Analysis's entry for its chosen effort when the list has one. Otherwise it is its top score: Artificial Analysis's plain entry is the highest effort, and so is OpenRouter's number. Two different models compare by these scores, and a tie goes by the person's order.
   - Two rows of the same model compare on one fixed scale: none (Artificial Analysis's "non-reasoning"), minimal, low, medium, high, xhigh, max. The default effort and any other name are not on it, so such rows can't be ranked against each other. The list then falls back to the first model, with the note "choose an effort for each X row" *(my call: the default effort differs by provider, and a wrong guess sends big work to the weaker effort)*.
4. **Cheapest: the lowest cost of a typical request.** 1,500 tokens read at the model's input price, plus its own average output and reasoning a request at its output price.
   - The average comes from Relay's usage rows for that model and effort once it has three replies; 500 tokens until then (the cost check's own guess).
   - Prices: OpenCode's listed price; for a model it lists none for, Artificial Analysis's from the stored list, as the usage table borrows them. $0 counts as no price.
   - Ties: for two rows of the same model, the lower effort on the scale of step 3 is cheaper; otherwise the person's order.
5. **The pick.** `big` takes the strongest, `small` the cheapest. A size answer under 0.5 (`LINE_UNSURE_BELOW`), or none, takes the first model, even after a failed try (the owner's 19 Nov rule). When one model is both the strongest and the cheapest, it takes all the work and no size question is asked. The cost check then weighs any step down as today; a step up is always made.
6. **The Review guard.** In Relay's own choice for Review, a reviewer whose index is lower than that of the chat's current model (the one that wrote the last reply) is left out. If that leaves none, the strongest reviewer is used. With no index for the chat's model there is no guard *(my call)*.
7. **Helpers that check work** (`src/review-helper.ts`). They follow the Review list the same way, because the owner chose on 13 Nov that helpers follow the modes.
   - The size is judged from the helper's task text alone. Helpers get no reply, as in the 19 Nov design.
   - The guard's writer is the calling chat's model. It is read together with the settings, within the hook's existing time limit; when it can't be read there is no guard.
   - The hook never stops a helper from starting, as today.
8. **What Relay reads** (`src/relay-command.ts`). In the same bounded read as the chat's messages (`spare`): the stored OpenRouter copy, the stored Artificial Analysis list and the usage rows. The helper hook reads the same. No network.
9. **The Coding index** (`src/artificial-analysis.ts`). `parseAaPage` also keeps `evaluations.artificial_analysis_coding_index`. Copies stored before this read it as missing until the next daily load.
10. **The panel** (`src/gui.tsx`, `src/relay-view.ts`).
   - In a list where Relay chooses by itself, each model shows its part: "Relay: big work (highest index)", "Relay: small work (cheapest)", or both; or one line on why Relay can't rank the list.
   - The hint: write a line for each model and the decider follows your lines; write none and Relay chooses by itself.
   - The Recent choices note names the size and the part, for example "small work, so the cheapest".
   - The panel uses the router's own function (it already bundles `router.ts`), with data it already loads: prices, the index, the usage rows.
11. **Docs.** `docs/guide.md` (how a mode with several models picks), `docs/privacy.md` and the panel's privacy note (the last reply also goes with a size question; still no model names, prices or scores), `docs/saving-money.md` (one model at two efforts keeps the cache), `docs/status.md`.

## Testing

- Unit tests first (TDD): when a mode qualifies; strongest and cheapest, with efforts, ties and usage averages; the size question and its answer; the pick and its fallbacks; the Review guard; the panel's parts and hint.
- The four checks, and the smoke with a mock: a mode with two mock models and no lines. The mock models have no index (the stored lists come only from the network), so the smoke checks the fallback: the first model, with the note. The unit tests cover the strongest and cheapest picks *(my call: a test-only list address would change Relay's network requests, and writing the host's storage directly depends on an undocumented format)*.
- Live, after the owner's yes (it uses their Go allowance): a bench side "On, Relay chooses", with Execute on GLM-5.3 Flash and Kimi K3.1 Pro and no lines, on the six exercises, against Off, one model a mode and two for Execute. Success: no dearer than two for Execute, with no fewer passed.

## Gate

Built only after the Go re-run of "On, two for Execute" with the decider fix meets that design's success line: on the one-file exercises the decider picks the "small edits" line, so the side costs about as little as one model a mode, with no fewer tasks passed. The size question rests on the same judgment (small work from big, with the last reply), which the research found weak from the message alone. If the re-run misses, this design is reconsidered, not built.

What happened (`docs/compatibility.md`, 23 Nov):
- **The re-run.** 6 of 6 passed and every build went to the cheap model, 15.6% below Off; the gap to one model a mode is noise. But the decider chose the "small edits" line itself in only 4 of 12 turns, and the list's order did the rest. The six exercises have no big work.
- **So the owner chose a test of the size question alone**, with the bar "at least 8 in 10 right and no failed try called small" ("Test the decider alone first").
- **It passed.** 30 made-up cases (`scripts/decider-size-cases.json`) to `opencode/jev-1.13-free`: 27 right, 1 wrong, 2 unsure. All 15 small cases were right, and no failed try was called small.
- **The weak spot is risky work that looks small.** A change to how prices round was called small (96% sure), and turning off a security check was called big at only 48%, so it would fall back to the first model.

## Left to the builder

- The exact wording of the panel parts and the notes. The size question and its choices were tested as written in step 2; a change to them is tested again with `scripts/decider-size-cases.json` before it ships.
- Whether OpenRouter's public list also carries a Coding index (one GET of the list Relay already reads). If it does, use it without a key.
- How the smoke's mock decider answers a size question.

Not counted: how many of the owner's models have a Coding index on Artificial Analysis. That needs their key and is not part of the build.
