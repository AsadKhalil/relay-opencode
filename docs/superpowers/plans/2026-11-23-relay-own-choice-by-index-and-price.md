# Relay's own choice inside a mode: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a mode has two or more usable models and no "use it for" lines, Relay asks the decider "small or big?" and sends big work to the highest index, small work to the cheapest.

**Architecture:** A pure ranking (`src/ranking.ts`) picks the strongest and the cheapest of a mode's usable models from "standings" (index, prices, own output a request). The standings are built from Relay's stored copies only (`src/standings.ts`), never the network. The decider gets one more question per such mode, and the router, the helper hook and the panel use the same ranking.

**Tech Stack:** TypeScript (ESM), node:test through tsx, Solid (panel), OpenCode 2.3 plugin API.

**Spec:** `docs/superpowers/specs/2026-11-23-relay-own-choice-by-index-and-price-design.md` (gate open: the size test passed 27 of 30, `docs/compatibility.md`, 23 Nov).

## Global Constraints

- The decider is never told model names, prices or scores. It is asked about the work only.
- No network request while a message is placed or a helper starts. Only stored copies are read, bounded like today's spare reads; a late or failed read means no own choice this time.
- Hooks never throw (`AGENTS.md`). `src/ranking.ts` is imported by `src/router.ts`, which the panel bundles, so it imports nothing from `node:`.
- Money is compared with `parseUsd` (bigint), never floating point. A token average is rounded before `BigInt`.
- The size question is copied word for word from the spec, step 2, as tested:
  - name `<mode>_size`;
  - instructions with a reply: "How big is the work? Judge by the person's message and the end of the chat's last reply.";
  - instructions without a reply: "How big is the work the text asks for?";
  - choices: `small`, "Small and clear. One or two files, a quick question, a simple edit.", and `big`, "Big, unclear or risky. Several files, a new feature, a hard bug, data, money or security, or the last reply shows a failed try.".
- Values: a size counts at 0.5 or more (`LINE_UNSURE_BELOW`). A typical request reads 1,500 tokens and writes 500 until a model has 3 replies of its own. The effort scale is none, minimal, low, medium, high, xhigh, max.
- The person's lines win, and there is no new setting. The first model in the list stays the default when unsure (the owner's 19 Nov rule).
- Most files use CRLF (`src/`, `tests/`, `scripts/`, `docs/`). Check with Node.
- A deliberate simplification gets a `// shortcut:` comment naming its ceiling.
- Commits: no git identity is configured, so use `git -c user.name=… -c user.email=…` with the values from `git log -1`. End each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage only this plan's files: another session works in the same folder. The owner pushes; this PC's login gets a 403.
- Run the four checks fresh before saying anything passes (`npm run typecheck`, `npm test`, `npm run build`, `node scripts/check-package.mjs`), and report the counts as printed.

## Review Focus

1. **An Artificial Analysis copy stored before this change** (no Coding index). Expected: it reads as `coding: null`, and Execute ranks by the main index (Task 1).
2. **A usage row with 3 replies but 0 requests.** Expected: no average, so no division by zero (Task 3).
3. **A mode whose first listed model is unavailable.** Expected: "the first model" means the first *usable* one (Task 5).
4. **A size answer for a mode that was not asked.** Expected: it is ignored (Task 4).
5. **A helper whose calling chat can't be read.** Expected: no Review guard, and the helper still gets a Review model (Task 6).

---

### Task 1: Stored copies carry what the ranking needs

**Files:**
- Modify: `src/intelligence.ts`, `src/artificial-analysis.ts`
- Test: `tests/intelligence.test.ts`, `tests/artificial-analysis.test.ts`

**Interfaces:**
- Produces: `storedIndexTable(store: { get(key: string): Promise<unknown> }): Promise<IndexTable>`. It returns the copy in `relay/intelligence` whatever its age, and an empty `Map` when the copy is missing or unreadable.
- Produces: `AaModel.coding: number | null`, from `evaluations.artificial_analysis_coding_index`.

- [ ] **Step 1: Write the failing tests**

```ts
test('the stored index table is read from storage alone, at any age', async () => {
  const store = { get: async () => ({ fetchedAt: '2020-01-01T00:00:00.000Z', rows: [['glm-5-3', 'z-ai/glm-5.3', 50]] }) };
  assert.deepEqual([...await storedIndexTable(store)], [['glm-5-3', { id: 'z-ai/glm-5.3', index: 50 }]]);
  assert.equal((await storedIndexTable({ get: async () => { throw new Error('disk'); } })).size, 0);
});
test('the Coding index is kept, and a copy stored before it reads as null', async () => {
  const page = parseAaPage({ data: [{ slug: 'm', name: 'M', evaluations: { artificial_analysis_intelligence_index: 40, artificial_analysis_coding_index: 35 }, pricing: {} }] });
  assert.equal(page.models[0].coding, 35);
  const old = { get: async () => ({ fetchedAt: new Date().toISOString(), models: [{ slug: 'm', name: 'M', creator: '', released: null, index: 40, prices: {} }] }) };
  assert.equal((await storedAaModels(old))[0].coding, null);
});
```

- [ ] **Step 2: Run and see them fail.** Run `npx tsx --test tests/intelligence.test.ts tests/artificial-analysis.test.ts`. Expected: FAIL (`storedIndexTable` is not exported; `coding` is undefined).
- [ ] **Step 3: Implement.** `storedIndexTable` reuses `decodeCache` and `fromRows`. `parseAaPage` and `storedModel` set `coding` the way they set `index`.
- [ ] **Step 4: Run again.** Same command. Expected: PASS.
- [ ] **Step 5: Commit** `src/intelligence.ts src/artificial-analysis.ts tests/intelligence.test.ts tests/artificial-analysis.test.ts`, with the message "Stored copies: the index table without the network, and the Coding index".

### Task 2: The ranking

**Files:**
- Create: `src/ranking.ts`
- Test: `tests/ranking.test.ts` (new)

**Interfaces:**
- Consumes: `modelName`, `Mode` and `ModeChoice` from `src/relay-store.ts`; `ModelChoice` from `src/settings.ts`; `parseUsd` from `src/costs.ts`.
- Produces:
  - `EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const`, `TYPICAL_IN = 1500`, `TYPICAL_OUT = 500`, `OWN_REPLIES = 3`.
  - `type Standing = { index: number | null; coding: number | null; inputPerMillion: string | null; outputPerMillion: string | null; outPerRequest: number | null }`.
  - `type Standings = ReadonlyMap<string, Standing>`, keyed by `modelName(choice)`.
  - `type Size = 'small' | 'big'` and `type SizeAnswer = { size: Size; confidence: number }`.
  - `type Ranked = { kind: 'ranked'; strongest: ModelChoice; cheapest: ModelChoice } | { kind: 'unranked'; reason: string }`.
  - `rank(mode: Mode, list: readonly ModeChoice[], usable: readonly ModeChoice[], standings: Standings, writer: ModelChoice | null): Ranked | null`. `strongest` and `cheapest` are plain `ModelChoice`s, with no `useFor`.

The rules of `rank`, in order:
1. Null when any choice in `list` has a line, or `usable` has fewer than two models.
2. Two usable rows of one model (same `providerID` and `id`) where either effort is not on `EFFORTS` (the default effort included): unranked, reason `choose an effort for each <id> row`.
3. The score: the Coding index when `mode` is `execute` and every usable row has one; otherwise the main index. A row with no standing or no score: unranked, reason `no index for <id>`.
4. A row with a null input or output price, or both at $0: unranked, reason `no price for <id>`.
5. Review only, when the writer has a main index: rows scored below it are left out. When none is left, the strongest row (of all usable) takes all the work.
6. Strongest: the model whose best row scores highest; ties go to the model that comes first in `usable`. Within that model, its row with the highest effort.
7. Cheapest: the lowest `TYPICAL_IN × input + round(outPerRequest ?? TYPICAL_OUT) × output`, in `parseUsd` units. Ties go to the lower effort (an effort off the scale counts as `medium`), then to the earlier row in `usable`.

- [ ] **Step 1: Write the failing tests** (`ch(id, variant = null, useFor = '')` is a `ModeChoice` of provider `p`; `st(index, input, output, extra)` is a `Standing`; `map` keys by `modelName`)

```ts
test('a mode with a line, or with one usable model, is not Relay’s to choose', () => {
  assert.equal(rank('execute', [ch('a', null, 'small edits'), ch('b')], [ch('a'), ch('b')], map(), null), null);
  assert.equal(rank('execute', [ch('a'), ch('b')], [ch('a')], map(), null), null);
});
test('big work goes to the highest index, small work to the cheapest typical request', () => {
  const s = map([ch('kimi'), st(60, '2', '10')], [ch('flash'), st(30, '0.15', '0.5')]);
  assert.deepEqual(rank('plan', [ch('flash'), ch('kimi')], [ch('flash'), ch('kimi')], s, null), { kind: 'ranked', strongest: pick('kimi'), cheapest: pick('flash') });
});
test('Execute ranks by the Coding index only when every model has one', () => {
  const both = map([ch('a'), st(60, '1', '1', { coding: 40 })], [ch('b'), st(50, '2', '2', { coding: 45 })]);
  assert.equal((rank('execute', [ch('a'), ch('b')], [ch('a'), ch('b')], both, null) as { strongest: { id: string } }).strongest.id, 'b');
  assert.equal((rank('plan', [ch('a'), ch('b')], [ch('a'), ch('b')], both, null) as { strongest: { id: string } }).strongest.id, 'a');
});
test('a model that writes a lot is not cheap', () => {
  const s = map([ch('a'), st(40, '1', '2', { outPerRequest: 20_000 })], [ch('b'), st(50, '2', '4', { outPerRequest: 500 })]);
  assert.equal((rank('plan', [ch('a'), ch('b')], [ch('a'), ch('b')], s, null) as { cheapest: { id: string } }).cheapest.id, 'b');
});
test('two rows of one model go by effort, and the default effort cannot be ranked against them', () => {
  const s = map([ch('s', 'low'), st(55, '3', '15')], [ch('s', 'high'), st(55, '3', '15')], [ch('s'), st(55, '3', '15')]);
  assert.deepEqual(rank('execute', [ch('s', 'low'), ch('s', 'high')], [ch('s', 'low'), ch('s', 'high')], s, null), { kind: 'ranked', strongest: pick('s', 'high'), cheapest: pick('s', 'low') });
  assert.deepEqual(rank('execute', [ch('s'), ch('s', 'low')], [ch('s'), ch('s', 'low')], s, null), { kind: 'unranked', reason: 'choose an effort for each s row' });
});
test('no index or no price leaves the list unranked, and $0 counts as no price', () => {
  const list = [ch('a'), ch('b')];
  assert.deepEqual(rank('plan', list, list, map([ch('a'), st(40, '1', '1')], [ch('b'), st(null, '1', '1')]), null), { kind: 'unranked', reason: 'no index for b' });
  assert.deepEqual(rank('plan', list, list, map([ch('a'), st(40, '1', '1')], [ch('b'), st(30, '0', '0.000')]), null), { kind: 'unranked', reason: 'no price for b' });
  assert.deepEqual(rank('plan', list, list, map([ch('a'), st(40, '1', '1')], [ch('b'), st(30, null, '1')]), null), { kind: 'unranked', reason: 'no price for b' });
});
test('in Review no reviewer is weaker than the model that wrote the work', () => {
  const list = [ch('cheap'), ch('strong')], s = map([ch('cheap'), st(40, '0.1', '0.5')], [ch('strong'), st(60, '3', '15')], [ch('writer'), st(50, '1', '1')], [ch('top'), st(70, '1', '1')]);
  assert.deepEqual(rank('review', list, list, s, pick('writer')), { kind: 'ranked', strongest: pick('strong'), cheapest: pick('strong') });
  assert.deepEqual(rank('review', list, list, s, pick('top')), { kind: 'ranked', strongest: pick('strong'), cheapest: pick('strong') });
  assert.equal((rank('review', list, list, s, pick('unknown')) as { cheapest: { id: string } }).cheapest.id, 'cheap');
});
test('ties go by the person’s order', () => {
  const s = map([ch('a'), st(40, '1', '1')], [ch('b'), st(40, '1', '1')]);
  assert.deepEqual(rank('plan', [ch('b'), ch('a')], [ch('b'), ch('a')], s, null), { kind: 'ranked', strongest: pick('b'), cheapest: pick('b') });
});
```

- [ ] **Step 2: Run and see them fail.** Run `npx tsx --test tests/ranking.test.ts`. Expected: FAIL (cannot find `src/ranking.ts`).
- [ ] **Step 3: Implement `rank` in `src/ranking.ts`** by the seven rules above. It is pure and imports nothing from `node:`.
- [ ] **Step 4: Run again.** Same command. Expected: PASS.
- [ ] **Step 5: Commit** `src/ranking.ts tests/ranking.test.ts`, with the message "Relay's own choice: the ranking by index and price".

### Task 3: Standings from the stored copies

**Files:**
- Create: `src/standings.ts`
- Test: `tests/standings.test.ts` (new)

**Interfaces:**
- Consumes: Task 1's `storedIndexTable` and `AaModel.coding`; `storedAaModels` and `aaFor` (`src/artificial-analysis.ts`); `indexFor` (`src/intelligence.ts`); `getUsage` and `modelName` (`src/relay-store.ts`); `pricesAt` (`src/costs.ts`); Task 2's `Standing`, `Standings` and `OWN_REPLIES`.
- Produces:
  - `type Stored = { aa: readonly AaModel[]; table: IndexTable; usage: readonly UsageRow[] }`.
  - `readStored(store: Pick<RelayStore, 'get'>): Promise<Stored>`. Storage only; a part that can't be read counts as empty.
  - `standingsOf(stored: Stored, models: readonly ListedModel[], choices: readonly ModelChoice[]): Standings`. Pure.

How `standingsOf` fills a standing:
- **Index and Coding index.** With a non-empty `aa`, the scores come from `aaFor({ providerID, id, name, variant }, aa)`, where `name` is the listed model's name, or its id when it isn't listed. Otherwise the index is `indexFor({ id, name }, table)` and the Coding index is null.
- **Prices.** OpenCode's prices at size 0 (`pricesAt(cost, 0)`). When OpenCode's input and output are both null and an Artificial Analysis entry matched, that entry's prices are used instead. A $0 price stays as it is.
- **Output a request.** From the usage row whose `model` equals `modelName(choice)`, when it has at least `OWN_REPLIES` messages and more than 0 requests: `(output + reasoning) / requests`. Otherwise null.

- [ ] **Step 1: Write the failing tests:**
  - "each effort gets its Artificial Analysis entry, and the plain entry stands for an effort it does not list". The list is `gpt-x` (index 57, Coding 50) and `gpt-x-low` (41, 30): `gpt-x#low` gets 41/30, and `gpt-x#high` gets 57/50.
  - "without that list, OpenRouter's stored index, and no Coding index".
  - "OpenCode's price first, Artificial Analysis's only when OpenCode lists none, and $0 stays $0".
  - "a model's own output a request needs three replies, and never comes from zero requests". A row of 2 messages gives null. A row of 3 messages, 6 requests, output 3,000 and reasoning 1,500 gives 750. A row of 3 messages and 0 requests gives null.
  - "`readStored` reads storage only, and a broken part counts as empty". The store throws on `relay/usage`; the result has `usage: []` and the other two parts filled.
- [ ] **Step 2: Run and see them fail.** Run `npx tsx --test tests/standings.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `readStored` (three reads in parallel, each caught) and `standingsOf` by the rules above.
- [ ] **Step 4: Run again.** Same command. Expected: PASS.
- [ ] **Step 5: Commit** `src/standings.ts tests/standings.test.ts`, with the message "Relay's own choice: standings from the stored copies only".

### Task 4: The size question

**Files:**
- Modify: `src/decider.ts`, and the `DeciderAnswer` type in `src/router.ts`
- Test: `tests/decider.test.ts`

**Interfaces:**
- Consumes: Task 2's `Size` and `SizeAnswer`.
- Produces:
  - `DecideInput.sizes?: readonly Mode[]`: the modes whose size is asked.
  - The `answer` kind of `DeciderAnswer` gains `sizes?: Partial<Record<Mode, SizeAnswer>>`.
  - `replied(input)` is also true when `sizes` is non-empty, so the end of the reply goes with a size question.

- [ ] **Step 1: Write the failing tests:**
  - "a mode whose size is asked gets the size question word for word, and the reply goes with it". `buildDecisionRequest(d, { kind: 'chat', text: 'Implement it.', agent: 'plan', files: [], images: 0, lines: {}, sizes: ['execute'], reply: 'Plan: one file.' })` has `questions[1]` deep-equal to the question in Global Constraints (with-reply instructions), and `input[0].text` contains `The end of the chat's last reply: "Plan: one file."`.
  - "without a reply, the size question asks about the text alone": the instructions are "How big is the work the text asks for?".
  - "a size answer is read when it is small or big with a confidence, and only for a mode that was asked". A fake host answers `execute_size` small 0.98 and `plan_size` big 0.9, with only `execute` asked. Expected: `answer.sizes` deep-equals `{ execute: { size: 'small', confidence: 0.98 } }`.
  - "a malformed size answer is left out": a choice of `medium`, or a confidence of 1.2, gives `sizes` `{}`.
- [ ] **Step 2: Run and see them fail.** Run `npx tsx --test tests/decider.test.ts`. Expected: FAIL on the new tests only.
- [ ] **Step 3: Implement.** One size question for each mode in `sizes` that has no lines, after the line questions. `read()` fills `sizes` by the rules in the tests.
- [ ] **Step 4: Run again.** Run `npx tsx --test tests/decider.test.ts`, then `npm test`. Expected: PASS, and the old request tests still pass unchanged.
- [ ] **Step 5: Commit** `src/decider.ts src/router.ts tests/decider.test.ts`, with the message "The decider can be asked how big the work is".

### Task 5: Choosing, and the `/relay` and switch path

**Files:**
- Modify: `src/router.ts`, `src/relay-command.ts`, `tests/relay-fakes.ts`
- Test: `tests/router.test.ts`, `tests/relay-command.test.ts`

**Interfaces:**
- Consumes: Tasks 2 to 4.
- Produces:
  - `sizesFor(settings: Pick<RelaySettings, 'modes'>, models: readonly RoutableModel[], attachment: Attachment, current: ModelChoice | null, standings: Standings | null): Mode[]`. These are the modes where `rank` gives `ranked` and the strongest is not the cheapest.
  - `choose(mode: Mode, list: readonly ModeChoice[], usable: readonly ModeChoice[], answer: Extract<DeciderAnswer, { kind: 'answer' }>, standings: Standings | null | undefined, writer: ModelChoice | null): { model: ModelChoice; fit: number | null; note: string | null }`.
  - `route(…, unsure, standings?: Standings | null)`. `undefined` keeps today's rule; `null` means the copies could not be read in time.
  - `tests/relay-fakes.ts`:
    - `FakeOptions.stored?: Record<string, unknown | 'never'>` preloads storage keys, and `'never'` makes that key hang.
    - `FakeReply.sizes?: Partial<Record<Mode, { choice: string; confidence: number }>>` answers `<mode>_size`.

What `choose` does:
- When `standings` is `undefined`, or `rank` gives null: `pickModel`, as today.
- `null` standings, when the mode would qualify (no line in `list`, two or more usable): `usable[0]`, with the note `the index and prices could not be read in time, so the first model is picked`.
- `unranked`: `usable[0]`, with the note `<reason>, so the first model is picked`.
- `ranked`, when the strongest is also the cheapest: that model, with no note.
- `ranked` otherwise:
  - `big` at 0.5 or more takes the strongest: fit is the confidence, the note is `big work, so the highest index`.
  - `small` at 0.5 or more takes the cheapest: fit is the confidence, the note is `small work, so the cheapest`.
  - Anything else takes `usable[0]`, with the note `not sure how big the work is, so the first model is picked`.
- `stayOrGo` then runs as today.

- [ ] **Step 1: Write the failing tests:**
  - **Router:**
    - "big takes the strongest, small the cheapest, unsure the first usable model, each with its note".
    - "with no standings given a mode keeps today's rule; with unread standings, the first model and a note".
    - "the first model is the first usable one": the list's first model is unavailable (Review Focus 3).
    - "`sizesFor` asks only where Relay can rank and the strongest is not the cheapest".
  - **Command:**
    - "a mode with no lines is asked its size, and big work moves the chat to the strongest". Settings: `execute: [entry('flash', 'high'), entry('kimi', 'high')]`. The stored `relay/intelligence` scores kimi 60 and flash 30, and `models` lists prices. The decider answers `execute_size` big 0.9. Expected: the last `switchModel` input is `p/kimi#high`, and the decisions request has an `execute_size` question.
    - "late stored copies leave the message to the first model, with the note": `stored: { 'relay/usage': 'never' }`. Expected: the record's note contains `could not be read in time, so the first model is picked`, and the message was sent once.
- [ ] **Step 2: Run and see them fail.** Run `npx tsx --test tests/router.test.ts tests/relay-command.test.ts`. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement.**
  - `choose`, `sizesFor`, and `route` calling `choose` in `src/router.ts`.
  - In `place()` in `src/relay-command.ts`: add `spare(() => readStored(deps.store))` to the first read. Build `standingsOf(stored, models, [every mode's choices, current])`, or `null` when the read is late. Pass `sizes` to `decide` and `standings` to `route`.
- [ ] **Step 4: Run again.** Run `npm test`. Expected: PASS, the old tests included.
- [ ] **Step 5: Commit** `src/router.ts src/relay-command.ts tests/relay-fakes.ts tests/router.test.ts tests/relay-command.test.ts`, with the message "Relay chooses by itself in a mode with no lines".

### Task 6: Helpers that check work

**Files:**
- Modify: `src/review-helper.ts`, `src/index.ts` (only if the deps passed in need `session`)
- Test: `tests/review-helper.test.ts`

**Interfaces:**
- Consumes: Task 3's `readStored` and `standingsOf`; Task 5's `sizesFor` and `choose`.
- Produces: `reviewHelperHook(deps: Pick<RelayDeps, 'store' | 'chatModels' | 'decide' | 'readMs' | 'session'>)`.
  - The writer is the calling chat's model, read with `deps.session.get({ sessionID: event.sessionID })` and mapped through `hostVariant`.
  - A failure or a late answer gives `null`: no guard.

- [ ] **Step 1: Write the failing tests:**
  - "a check with no Review lines is asked its size and gets the strongest reviewer for big work".
  - "no reviewer weaker than the calling chat's model".
  - "when the calling chat can't be read, there is no guard and the helper still gets a Review model" (Review Focus 5).
- [ ] **Step 2: Run and see them fail.** Run `npx tsx --test tests/review-helper.test.ts`. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement.**
  - Read the settings, the model list, `readStored` and the writer within the existing `readMs`; the last two are each caught to `null`.
  - Ask `sizes: ['review']` when `sizesFor(...)` includes `review`, and pick with `choose('review', …, writer)`.
  - The record keeps the picked model and its note, as today.
- [ ] **Step 4: Run again.** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `src/review-helper.ts tests/review-helper.test.ts` (and `src/index.ts` if changed), with the message "Helpers that check work follow Relay's own choice".

### Task 7: The panel shows each model's part

**Files:**
- Modify: `src/contract.ts`, `src/rpc.ts`, `src/relay-view.ts`, `src/gui.tsx`
- Test: `tests/rpc.test.ts`, `tests/relay-view.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3 and 5.
- Produces:
  - **Ruling (plan):** the spec has the panel work the parts out itself. But the panel has neither each effort's own score nor the Coding index, so the server works them out with the same `rank` and the same stored copies. Cost if wrong: one more RPC.
  - **RPC `getOwnChoice`** (it declares `errors`, as every method must): input nothing; output `{ directory: string; modes: Record<Mode, null | { kind: 'unranked'; reason: string } | { kind: 'ranked'; strongest: string; cheapest: string }> }`. The model names come from `modelName`. It is computed from the saved settings, `listProjectModels`, `readStored` and `standingsOf`, with `writer` null.
  - **`testDecider`** passes `sizes` and `standings`, so "Try a message" shows Relay's own choice.
  - **`ownChoicePart(part, choice): string | null`** in `src/relay-view.ts`, which gives one of:
    - "Relay: big work (highest index)";
    - "Relay: small work (cheapest)";
    - "Relay: all work (highest index and cheapest)";
    - null for any other model.
  - **`severalModelsHint`, reworded:** "Several models: write a line for each and the decider follows your lines. Write none and Relay chooses by itself: the highest index for big, unclear or risky work, the cheapest for small, clear work. When it is not sure, the first model in this list is used."
  - **`privacyNote`:** "the end of the chat's last reply when it must choose between the lines you wrote" becomes "the end of the chat's last reply when it must choose between your models", and the note adds "never model names, prices or scores".

- [ ] **Step 1: Write the failing tests:**
  - **RPC:**
    - "`getOwnChoice` gives each mode's part from the saved settings and the stored copies, and null for a mode with lines".
    - "`testDecider` shows Relay's own choice".
  - **View:**
    - The new hint and privacy texts, exactly as above.
    - "`ownChoicePart` names the part of each model".
- [ ] **Step 2: Run and see them fail.** Run `npx tsx --test tests/rpc.test.ts tests/relay-view.test.ts`. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement.**
  - The handler and its contract entry.
  - In `gui.tsx`, a resource loading `getOwnChoice`. It refetches with the others after a save (the line that runs `refetch(), refetchIntel(), loadUsage()`).
  - Under each chosen model, an `rl-hint` line with `ownChoicePart`.
  - For an `unranked` mode, one card-level hint: "Relay can't rank this list: <reason>. The first model is used."
- [ ] **Step 4: Run again.** Run `npm test`, then `npm run build`. Expected: PASS, and the build exits 0.
- [ ] **Step 5: Commit** `src/contract.ts src/rpc.ts src/relay-view.ts src/gui.tsx tests/rpc.test.ts tests/relay-view.test.ts`, with the message "The panel shows which model takes which work".

### Task 8: The size test kept, the smoke, the docs and the checks

**Files:**
- Create: `scripts/decider-size.ts`, `tests/decider-size.test.ts`
- Modify:
  - `scripts/smoke-host-model.mjs`;
  - `docs/guide.md`, `docs/privacy.md`, `docs/saving-money.md`, `docs/status.md`;
  - `AGENTS.md`: add `ranking.ts` to the list of files the panel bundles;
  - `docs/compatibility.md`, `docs/implementation-progress.md`.

**Interfaces:**
- Consumes:
  - `buildDecisionRequest` with `sizes: ['execute']` (Task 4);
  - `scripts/decider-size-cases.json`, which is already committed;
  - the isolated-host setup of `scripts/decider-examples.ts`, plus a scratch home, app-data and temp, and a scratch root outside the home folder.
- Produces:
  - `judgeSize(expect, answer)`: `right`, `wrong`, or `unsure` under 0.5.
  - `sizeReport(outcomes)`, ending in `PASS` or `MISS`. The bar is 24 of 30 right, and no case tagged `failed try` called small.

- [ ] **Step 1: Write the failing test** `tests/decider-size.test.ts`: "a size at 0.5 or more counts, under 0.5 is unsure, and a failed try called small misses the bar". It covers `judgeSize` and `sizeReport` on hand-made outcomes.
- [ ] **Step 2: Run and see it fail.** Run `npx tsx --test tests/decider-size.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `scripts/decider-size.ts`.
  - Port it from the 23 Nov scratch runner, with relative imports and no hard-coded user folder.
  - The header says it makes real requests and needs the owner's yes.
  - It stops after three cases in a row with no answer.
  - Do not run it against a real model in this task.
- [ ] **Step 4: Run again.** Same command. Expected: PASS.
- [ ] **Step 5: Smoke.** In `scripts/smoke-host-model.mjs`, after the Execute checks:
  - save Plan as `[model-big, model-cheap]` with no lines, and send one `/relay` planning message;
  - assert that the decisions request had no `plan_size` question, because the mock models have no index;
  - assert that the record's note contains `no index for`, and that the model is `smoke/model-big`.
- [ ] **Step 6: Docs.**
  - `docs/guide.md`: how a mode with several models picks.
  - `docs/privacy.md`: the size question; still no model names, prices or scores.
  - `docs/saving-money.md`: one model at two efforts keeps the cache, so pick an effort on both rows.
  - `docs/status.md`: what is tested.
  - `AGENTS.md`: the bundled-files line.
- [ ] **Step 7: The four checks, fresh.** Run `npm run typecheck`, `npm test`, `npm run build` and `node scripts/check-package.mjs`. Then run `npm run smoke:host:model` with `RELAY_SMOKE_CLI` set to Desktop's CLI. Expected: exit 0 everywhere, and the test and package counts reported as printed.
- [ ] **Step 8: Record and commit.**
  - Add a `docs/compatibility.md` entry for the smoke (platform, version, not tested), and a line in `docs/implementation-progress.md`.
  - Commit this task's files with the message "Relay's own choice: the size test kept, the smoke, the docs".

### Task 9 (only with the owner's yes at that moment): the live test on Go

The final whole-branch review and its fixes come first. After them, ask the owner before anything else:
- whether to update their Relay copy (Desktop closes for a minute);
- whether to run a bench side "On, Relay chooses", with Execute `[CHEAP, STRONG]` and no lines, on the six exercises. It uses their Go allowance.

Success (spec, Testing): no dearer than "two for Execute", with no fewer tasks passed. Record the result in `docs/compatibility.md`.
