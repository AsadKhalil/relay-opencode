# Relay switching in the usage tab: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The usage tab shows how often Relay moved chats to other models, what the range cost, what it would have cost without those moves (compared with each chat's start model or with the Plan model), and what was saved, in place of the Records list. Every reply has a price, including those on the Claude agent and Codex logins.

**Architecture:**
- **Placing a message:** `placeMessage` keeps the chat's model before each placement (`from`) and the chat's start model (`start`, a storage key a chat, written once). The usage records copy both, with the decider's cost.
- **The server's sum:** a new pure function, `switchingOf` in `src/switching.ts`, adds up both views from the range's records. `getUsageLog` returns the sum, pricing with `factsOf` over OpenCode's model list (read within two seconds) and the stored public lists.
- **The tab:** a "Relay switching" plate replaces the Records list, and the server stops sending a page of records.

**Tech Stack:** TypeScript (ESM), Solid (panel), node:test through tsx, OpenCode plugin API 2.3.

**Spec:** `docs/superpowers/specs/2026-11-26-relay-switch-savings-design.md`

## Global Constraints

- **Money:**
  - USD strings, summed as bigint with `parseUsd` and `formatUsd` (`src/costs.ts`). Never floating point.
  - Bar heights may use whole millionths of a dollar, as `chartOf` does.
  - `formatUsd` cannot print a negative amount, so no stored or answered USD string is ever negative.
- **The person's message:** never dropped, doubled or changed. The `prompt` hook and the idle hook never throw. Nothing new is waited for without a bound.
- **No new model requests.** Storage keeps numbers, model names, ids and the project's folder, never text.
- **Panel files** (`usage-view.ts`, `gui-usage.tsx`, `gui-parts.tsx` and the others AGENTS.md lists) import nothing from `node:`. The panel takes only types from `src/usage-log.ts` and `src/switching.ts`.
- **Prices:** every price comes from `factsOf` in `src/standings.ts`. Nothing names a provider except the Claude login's family ids (`FAMILIES`).
- **Line endings:** CRLF in `src/`, `tests/`, `scripts/`, `docs/` and `AGENTS.md`; LF in `README.md` and `CONTRIBUTING.md`. Write scripts to files, never with backticks inline in bash.
- **Checks:** for each new guard, red then green. Before saying anything passes, run the four checks fresh (`npm run typecheck`, `npm test`, `npm run build`, `node scripts/check-package.mjs`) and report the counts as printed.
- **Commits:** as `Muhammad Asad <40663983+AsadKhalil@users.noreply.github.com>`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push (the owner pushes) and no merge.
- **The owner's own setup:** no real profile, Desktop, paid credentials or the owner's service without the owner's yes for that named step (Task 9 only).
- **Simplifications:** a deliberate one gets a `// shortcut:` comment that names its ceiling.
- **Copy:** the tab's sentences are copied exactly from the tasks below.

## Review Focus

1. **Model names with a slash or an effort:** a name like `openrouter/anthropic/claude-sonnet-5-5#high` splits at the first `/` and the last `#`, so it is priced, not left out (Task 3 test).
2. **A model no list knows:** a comparison model that neither OpenCode nor any public list prices leaves its replies out and counts them, and never throws (Task 4 test).
3. **A chat moved before the range starts:** it has records that carry `start` but no switch in the range. It is still compared, from its first record that carries `start` (Task 4 test).
4. **Nothing moved, or $0 without switching:** no division by zero. The percent is null and the tab says "Relay moved no chat in this range." (Task 6 test).
5. **A 90-day range of 30,000 records:** `switchingOf` groups once and sorts once. The test finishes well within two seconds (Task 4 test).

---

### Task 1: Relay keeps each chat's model before it places a message, and the chat's start model

**Files:**
- Modify: `src/relay-store.ts` (`Decision`, `readable`, `RelayStore.set`, new `chatStart`/`setChatStart`)
- Modify: `src/relay-command.ts` (`Placed`, `placeMessage`)
- Modify: `src/review-helper.ts` (the `record` defaults)
- Modify: `src/contract.ts` (the `decision` schema)
- Test: `tests/relay-command.test.ts`, `tests/relay-store.test.ts`

**Interfaces:**
- Produces:
  - `Decision` gains `from: string | null; start: string | null`.
  - `chatStart(store: Pick<RelayStore, 'get'>, sessionID: string): Promise<string | null>` and `setChatStart(store: Pick<RelayStore, 'set'>, sessionID: string, model: string): Promise<void>`, with the key `relay/start/${encodeURIComponent(sessionID)}`.
  - `Placed['outcome']` becomes `Pick<Decision, 'mode' | 'confidence' | 'fit' | 'model' | 'ms' | 'costUsd' | 'from' | 'start'>`.

Rules for `placeMessage`:
- **`from`:** `modelName(current)` as soon as the chat is read, or null when the chat has no model.
- **Reading the start:** it joins the bounded `Promise.all` as `spare(async () => ({ value: await chatStart(deps.store, sessionID) }))`, so a read that answered (`{ value }`) is told apart from one that failed or was late (`null`).
- **After a model switch that worked** (`on && modelChanges`):
  - the read answered with null and `from` is not null: `outcome.start = outcome.from`, and `void setChatStart(...).catch(() => {})`, not awaited;
  - the read answered with a model: `outcome.start` is that model;
  - the read did not answer: `outcome.start = null`, and nothing is written.
- **With no move:** `outcome.start` is the value read, or null.
- **The review helper:** its records get `from: null, start: null`.

- [ ] **Step 1: Write the failing tests** in `tests/relay-command.test.ts`, with the existing `fakeRelay`, `run`, `last` and `prompts` helpers:
  - **`a move keeps the model the chat was on, and the chat's start model is written once`:**
    - After the first `run(f)`: `last(f)` has `from` `'p/usual'`, `model` `'p/exec#high'` and `start` `'p/usual'`, and `f.data.get('relay/start/ses-1')` is `'p/usual'`.
    - The fake's `decision` is a function that answers execute at 0.98 on its first call and plan at 0.98 on its second. After the second `run(f)`, `last(f)` has `from` `'p/exec#high'`, `model` `'p/plan'` and `start` `'p/usual'`.
    - Across both runs there is exactly one `storageSet` call for `'relay/start/ses-1'`.
  - **`a message that keeps the model records where the chat was and writes no start`:** the chat is `{ agent: 'build', model: { providerID: 'p', id: 'exec', variant: 'high' } }`. `last(f)` has `from` `'p/exec#high'` and `start` null, and there is no `storageSet` for the start key.
  - **`a start read that hangs leaves the start unknown and writes nothing; the message is sent once`:** `stored: { 'relay/start/ses-1': 'never' }`, `readMs: 200`. `prompts(f)` deep-equals `sent`, `last(f).start` is null, and there is no `storageSet` for the start key.
  - **`a failing storage write still sends the message once`:** `fail: { storageSet: new Error('disk full') }`, and `prompts(f)` deep-equals `sent`.
- [ ] **Step 2:** In `tests/relay-store.test.ts`, write the failing test **`a record kept before this version reads from and start as null`**: a stored decision without the two fields comes back from `recentDecisions` with `from: null, start: null`.
- [ ] **Step 3: Run** `npx tsx --test tests/relay-command.test.ts tests/relay-store.test.ts`. Expected: FAIL, because `from` and `start` are undefined.
- [ ] **Step 4: Implement** the fields, the two functions, `readable` (`text(item.from)`, `text(item.start)`), the `RelayStore.set` value type (add `string`), the `placeMessage` rules above, the review helper's defaults, and `from: nullableString, start: nullableString` in the contract's `decision`, both required.
- [ ] **Step 5: Run** `npm test`. Expected: PASS, every test. The existing contract tests check `getRelay`'s output against the new schema.
- [ ] **Step 6: Commit** "Relay keeps each chat's model before it places a message, and the chat's start model".

### Task 2: Usage records carry where the chat was, its start model and the decider's cost

**Files:**
- Modify: `src/usage-log.ts` (`UsageRecord.relay`, `buildRecords`, `readable`)
- Modify: `src/contract.ts` (`usageRecord.relay`)
- Test: `tests/usage-log.test.ts`

**Interfaces:**
- Consumes: `Decision.from`, `Decision.start` and `Decision.costUsd` (Task 1).
- Produces: `export type RelayPart = { mode: Mode | null; note: string | null; from: string | null; start: string | null; deciderUsd: string | null }`, with `UsageRecord.relay: RelayPart | null`. `buildRecords` sets `deciderUsd` from the decision's `costUsd`.

- [ ] **Step 1: Write the failing tests.** The test file's `decision()` helper gets `from: null, start: null` defaults.
  - Change **`a Relay record names the message: its mode and note go with it`** so that, with `decision('m1', { from: 'p/usual', start: 'p/usual', costUsd: '0.0001' })`, `first.relay` deep-equals `{ mode: 'execute', note: 'small work, so the cheapest', from: 'p/usual', start: 'p/usual', deciderUsd: '0.0001' }`.
  - Add **`a record kept before this version reads from, start and the decider's cost as null`**: a stored record whose relay is `{ mode: 'plan', note: null }` reads back through `readRecords` with `{ mode: 'plan', note: null, from: null, start: null, deciderUsd: null }`.
  - Add **`a Relay part that arrives late brings its new fields`**: `grown(old with relay null, next with a full RelayPart)` keeps all five fields.
- [ ] **Step 2: Run** `npx tsx --test tests/usage-log.test.ts`. Expected: FAIL on the three tests.
- [ ] **Step 3: Implement.** `readable` reads `from`/`start` with `text`, and `deciderUsd` with `storedUsd`. In the contract, the relay object gets `from`, `start` and `deciderUsd` (`nullableString`), all required.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** "Usage records carry where the chat was, its start model and the decider's cost".

### Task 3: Every reply has a price: OpenCode's, else Artificial Analysis's, else OpenRouter's

**Files:**
- Modify: `src/artificial-analysis.ts` (export `FAMILIES`)
- Modify: `src/intelligence.ts` (new `newestFamilyKey`)
- Modify: `src/standings.ts` (the OpenRouter lookup in `factsOf` for a Claude family; new `pricesOf`)
- Modify: `src/relay-store.ts` (`PriceSource` adds `'openrouter'`; `sourceOf` accepts it)
- Modify: `src/contract.ts` (`priceSource` enum)
- Modify: `src/usage-log.ts` (`priceFromList`, `aaPriced`)
- Modify: `src/rpc.ts` (`getUsageLog` reads the stored lists and the model list)
- Modify: `src/gui-usage.tsx` (the `*` footnote)
- Test: `tests/standings.test.ts`, `tests/usage-log.test.ts`, `tests/rpc.test.ts`

**Interfaces:**
- Produces:
  - `newestFamilyKey(table: IndexTable, family: string): string | null`: of the table's keys matching `^claude-${family}-(\d+(?:-\d+)*)$`, the one with the highest version, compared number by number; null when there is none.
  - `pricesOf(model: string, models: readonly ListedModel[] | null, lists: Pick<Stored, 'aa' | 'table'>): Pick<Facts, 'prices' | 'pricesFrom'>`:
    - it splits `provider/id#variant` at the first `/` and the last `#`;
    - it calls `factsOf` with the listed model when `models` has it, else with `{ providerID, id, name: id }`.
  - `priceFromList(records: readonly UsageRecord[], price: (model: string) => Pick<Facts, 'prices' | 'pricesFrom'>): UsageRecord[]`, for each record whose `shownCost` is null and whose model is known:
    - `'free'`: `costByPrice: '0'`, `pricesFrom: null`;
    - `'opencode'`, `'artificial-analysis'` or `'openrouter'`: `costByPrice` is the record's tokens at those prices (`priceTotal`), with that source;
    - otherwise the record is unchanged.
  - `registerRpc` options gain `listMs?: number` (default 2000), the limit on `listProjectModels` in `getUsageLog`. A late or failed list is `null`.
- **Ruling copied from the spec:** a listing of $0 in and $0 out keeps `costByPrice: '0'`, since that is not null, and so stays $0.

- [ ] **Step 1: Write the failing tests** in `tests/standings.test.ts`, with its `offered` and `cost` helpers and an OpenRouter table built as its other tests build one:
  - **`a Claude login family borrows OpenRouter's newest version of it`:**
    - The table has `anthropic/claude-sonnet-4-5` at 3/15 and `anthropic/claude-sonnet-5-5` at 2/10, and the AA list is empty.
    - `factsOf(offered('claude-agent', 'sonnet', 'Sonnet 5.5', cost(null, null), 1000000), null, { aa: [], table })` gives `prices.inputPerMillion` `'2'`, `outputPerMillion` `'10'` and `pricesFrom` `'openrouter'`.
  - **`a Codex login model that lists no price is priced from the public list by its id`:**
    - `pricesOf('openai/gpt-5.3-codex', [offered('openai', 'gpt-5.3-codex', 'GPT-5.3 Codex', cost(null, null), 400000)], { aa: [], table })`, with the table holding `openai/gpt-5.3-codex` at 1.75/14, gives `'1.75'`, `'14'` and `'openrouter'`.
  - **`a model listed at $0 stays $0, and a free copy is free`:** a listed `p/local` at `cost('0', '0')` gives `pricesFrom` `'opencode'` with `'0'`/`'0'`, and `'opencode/x-free'` gives `pricesFrom` `'free'`.
  - **`a name with a slash in its id and an effort is split at the first slash and the last #`** (Review Focus 1): with the table holding `anthropic/claude-sonnet-5-5`, `pricesOf('openrouter/anthropic/claude-sonnet-5-5#high', null, { aa: [], table })` gives `pricesFrom` `'openrouter'` and `'2'`.
- [ ] **Step 2:** In `tests/usage-log.test.ts`, replace the test that begins "a record kept with no price is priced from Artificial Analysis’s list" with **`a record kept with no price is priced when read: from the lists for a login, $0 for a free copy, and left alone when OpenCode charged for it`**, using a `price` function made with `pricesOf` over the same lists:
  - `claude-agent/sonnet#high` (1M in, 50k out, 50k reasoning, 1M cache read, OpenCode $0) is priced from OpenRouter at 2/10/0.2 → `costByPrice` `'3.2'`, `pricesFrom` `'openrouter'`;
  - with the AA list holding `claude-sonnet-5-5`, the same record gets `'artificial-analysis'`;
  - the free copy gets `costByPrice` `'0'`;
  - the charged record (OpenCode $0.4) and a record of a model no list knows are returned unchanged.
- [ ] **Step 3:** In `tests/rpc.test.ts`, write **`getUsageLog prices a login's reply from OpenRouter's stored list, and still answers when the model list is late`**:
  - the stored usage record is on `claude-agent/sonnet` with no price, and the stored OpenRouter table has Sonnet 5.5;
  - the host's model list never answers, and `registerRpc` gets `listMs: 50`;
  - the answer comes, its total for `claude-agent/sonnet` has a cost and `aaPriced: true`, and it fits the contract.
- [ ] **Step 4: Run** `npx tsx --test tests/standings.test.ts tests/usage-log.test.ts tests/rpc.test.ts`. Expected: FAIL, because `pricesOf` and `newestFamilyKey` are not exported and the new signature is missing.
- [ ] **Step 5: Implement** the pieces above:
  - **`factsOf`:** for `providerID === 'claude-agent' && FAMILIES.has(id)`, the OpenRouter price lookup uses only `newestFamilyKey(table, id)` (none means no OpenRouter price).
  - **`getUsageLog`:** reads `readStored(relayStore)`, and `within(() => listProjectModels(context), listMs)` with `LATE` or a failure counted as null. It then calls `priceFromList(kept, model => pricesOf(model, models, stored))`.
  - **`aaPriced`:** true when any of a total's records has a `costByPrice` from `'artificial-analysis'` or `'openrouter'`. Keep the name, and fix its doc comment.
  - **The AA credit line:** shown only when some record is priced from `'artificial-analysis'`.
  - **The footnote** becomes exactly: `* at public prices (Artificial Analysis or OpenRouter), all or in part; on a subscription this estimates what the plan was used for, not a bill. `
- [ ] **Step 6: Run** `npm test` and `npm run typecheck`. Expected: PASS, and no errors.
- [ ] **Step 7: Commit** "Every reply has a price: OpenCode's, else Artificial Analysis's, else OpenRouter's".

### Task 4: The switching sums

**Files:**
- Create: `src/switching.ts`
- Test: `tests/switching.test.ts`

**Interfaces:**
- Consumes: `UsageRecord`, `RelayPart` (Task 2); `shownCost` (`src/usage-view.ts`); `Prices` (`src/relay-store.ts`); `costOf`, `formatUsd` and `parseUsd` (`src/costs.ts`).
- Produces:
```ts
export type SwitchingView = {
  model: string | null;                                // the Plan view's model; null in the Default view
  switches: { model: string; count: number }[];        // most first, then by name
  spent: string; without: string;                      // USD; saved = without − spent, which can be below 0
  days: { day: string; spent: string; without: string }[];
  chats: number; notCompared: number; leftOut: number; deciderUsd: string;
};
export type Switching = { default: SwitchingView; plan: SwitchingView | null };
export function switchingOf(all: readonly UsageRecord[], kept: readonly UsageRecord[],
  input: { plan: string | null; priceOf: (model: string) => Prices | null; dayOf: (at: string) => string; days: readonly string[] }): Switching;
```
- **Inputs:** `all` is every record of the range, and `kept` is what the filters keep. Both are already priced (Task 3). `plan: null` gives `plan: null`.

Rules (from the spec, section 2–4):
- **Per chat:** group `all` by `sessionID` and sort by `at`, once. "The previous reply" and switches look only at `kind === 'chat'` records.
- **A switch:** a chat record with a Relay part, where:
  - `relay.from !== null && model !== null && model !== relay.from`; or,
  - for history with no `from` (`relay.from === null`), there is a previous chat record and `model !== previous.model`.
- **Compared:** a chat's records (any kind) from its first switch, or from its first record whose `relay.start !== null`, whichever comes first, are compared.
- **The comparison model:**
  - Default: the first non-null `relay.start` among the chat's records. Else, the model of the chat's last record before its first record with a Relay part. Else none: the chat is counted in `notCompared` (when it has compared records in `kept`) and added in unchanged.
  - Plan: `input.plan`.
- **A compared record's cost without switching:**
  - Price its tokens with `priceOf(comparisonModel)` as `priceTotal` does (reasoning at the output price).
  - The cache correction applies to a chat record whose model differs from the previous chat record's. Let `shift = min(input + cacheWrite, previous.input + previous.cacheRead + previous.cacheWrite)`. Move `shift` tokens into cache reads, taken from cache writes first, then from input. Mark it `// shortcut:`: it does not check whether that cache would have run out.
  - If `shownCost(record)` or the comparison cost is null, the record is left out of both sides and counted in `leftOut`.
- **Sums over `kept`:**
  - `deciderUsd` = Σ `relay.deciderUsd` (null counts as 0).
  - `spent` = Σ `shownCost` + `deciderUsd`.
  - `without` = Σ `shownCost` + Σ (comparison − real) over compared records with both prices.
  - `days`: the same per `dayOf(record.at)`, with every day of `input.days` present.
  - `switches`: the switches in `kept`, counted by the record's model.
  - `chats`: chats with at least one compared record in `kept` and a comparison model.

- [ ] **Step 1: Write the failing tests** in `tests/switching.test.ts`:
  - **Helpers:**
    - A `rec(at, sessionID, model, tokens, relay?)` builder whose `costByPrice` is filled at these prices: `p/big` 4 in / 20 out / 0.2 read / 5 write; `p/cheap` 2 / 10 / 0.1 / 2.5; `p/plan` 10 / 30 / 1 / 12.5.
    - `priceOf` maps those three names, and anything else to null.
    - `dayOf = at => at.slice(0, 10)`.
  - **`a switch is counted for the model it went to, and the chat is compared from that reply on`:**
    - r1: `p/big`, input 1,000, no Relay part ($0.004).
    - r2: `p/cheap`, input 1,000,000, relay `{ from: 'p/big', start: 'p/big', deciderUsd: '0' }` ($2).
    - r3: `p/cheap`, cache read 1,000,000, relay `{ from: 'p/cheap', start: 'p/big' }` ($0.1).
    - Expect the Default view: `switches` `[{ model: 'p/cheap', count: 1 }]`, `spent` `'2.104'`, `without` `'4.2002'`, `chats` 1. (r2 compares at 999,000 in + 1,000 read at `p/big` = $3.9962; r3 compares at $0.2.)
  - **`the Plan view prices the same replies at the Plan model`:** with the same records and `plan: 'p/plan'`, `plan.model` is `'p/plan'` and `plan.without` is r1 + r2 at `p/plan` (999,000 in + 1,000 read) + r3 at `p/plan`. Compute it in the test with `parseUsd` from these prices.
  - **`a switch's cache writes and input, up to the last prompt, count as cache reads on the other side`:** r1 `p/big` input 10,000; r2 a switch to `p/cheap` with input 2,000 and cache write 8,000. r2's comparison is 10,000 cache reads at `p/big` = `'0.002'`.
  - **`older history: a model change under a Relay part is a switch, and the last reply before Relay is the default`:** r1 `p/big` with no relay; r2 `p/cheap` with relay `{ from: null, start: null }`. This gives one switch to `p/cheap`, compared at `p/big`.
  - **`a chat with no start and no reply before Relay is not compared by default, but is by Plan`:** `default.notCompared` is 1 and `default.chats` is 0; `plan.chats` is 1.
  - **`a model changed by hand before a Relay message that kept it is not a switch`:** r1 `p/big`; r2 `p/cheap` with relay `{ from: 'p/cheap' }`. This gives `switches` `[]` and `chats` 0.
  - **`a move between efforts of one model is a switch to that effort`:** `p/big` to `p/big#high` with `from: 'p/big'`.
  - **`a chat moved before the range starts is compared from its first record that carries start`** (Review Focus 3): r1 `p/cheap` with relay `{ from: 'p/cheap', start: 'p/big' }`. This gives `switches` `[]`, `chats` 1, compared at `p/big`.
  - **`a comparison model no list prices leaves its replies out and counts them`** (Review Focus 2): `start: 'x/unknown'` gives `leftOut` 2, and `without` equals `spent` minus the decider's cost.
  - **`the decider's cost is spent, and comes off the saving`:** `deciderUsd: '0.01'` on r2 raises `spent` by 0.01 and leaves `without` as it was.
  - **`filters change the sums but not a chat's comparison model`:** `kept` without r1 still compares r2 at `p/big`, and `spent` leaves out r1.
  - **`every day of the range is listed, with its own spent and without`.**
  - **`30,000 records add up within two seconds`** (Review Focus 5): 1,000 chats of 30 records each.
- [ ] **Step 2: Run** `npx tsx --test tests/switching.test.ts`. Expected: FAIL, because `src/switching.ts` does not exist.
- [ ] **Step 3: Implement** `switchingOf` in `src/switching.ts`. Export `priceTotal` from `src/usage-log.ts` to reuse it, and keep the file free of `node:` imports.
- [ ] **Step 4: Run** `npx tsx --test tests/switching.test.ts`, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** "The switching sums: switches, spent, and the cost without them".

### Task 5: getUsageLog answers both views

**Files:**
- Modify: `src/usage-log.ts` (export `dayCounter(query: UsageQuery): (time: string | number) => string` and `filterRecords(records: readonly UsageRecord[], query: UsageQuery): UsageRecord[]`, both taken out of `summarize`, which uses them)
- Modify: `src/rpc.ts` (`getUsageLog`)
- Modify: `src/contract.ts` (`usageLog.switching`)
- Test: `tests/rpc.test.ts`

**Interfaces:**
- Consumes: `switchingOf` (Task 4), `pricesOf` and the model-list read (Task 3).
- Produces: `getUsageLog`'s answer gains `switching: Switching | null`. It is null when the model list was late or failed. Otherwise it is `switchingOf(records, filterRecords(records, query), { plan, priceOf: model => pricesOf(model, models, stored).prices, dayOf, days })`, where `plan` is `modelName` of `settings.modes.plan[0]`, or null.

- [ ] **Step 1: Write the failing tests** in `tests/rpc.test.ts`, with its `usageHost` and `fits`:
  - **`getUsageLog answers how Relay's switching did, in both views, and fits the contract`:**
    - Stored records: a chat moved from `p/big` to `p/cheap`. The host lists both with prices. The settings' Plan model is `p/plan`.
    - `answer.switching.default.switches` is `[{ model: 'p/cheap', count: 1 }]`, `answer.switching.plan.model` is `'p/plan'`, and the output fits `RelayRpc.methods.getUsageLog.output`.
  - **`with the model list late, switching is null and the rest of the answer comes`:** `listMs: 50` and a list that never answers give `switching: null` with `totals` present.
  - **`with no Plan model set, the Plan view is null`.**
- [ ] **Step 2: Run** `npx tsx --test tests/rpc.test.ts`. Expected: FAIL, because `switching` is undefined.
- [ ] **Step 3: Implement.** In the contract, a `switchingView` schema mirrors `SwitchingView`, and `switching` is `anyOf [{ default, plan: anyOf [view, null] }, null]`, required. `getUsageLog` reads the settings with the others, in its `Promise.all`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** "getUsageLog answers how Relay's switching did, in both views".

### Task 6: The Relay switching plate replaces the Records list

**Files:**
- Modify: `src/usage-view.ts` (new `savedOf`, `savingsChart`, `switchRows`)
- Modify: `src/gui-usage.tsx` (the plate; the Records list, Show more and their state go)
- Modify: `src/gui-styles.ts` (the plate's classes, with the board's tokens only)
- Modify: `scripts/panel-preview/fixtures.ts` (a sample `switching` for both views, one with nothing moved)
- Modify: `DESIGN.md` (the usage tab line: "…a Filters drawer, then the switching plate")
- Test: `tests/usage-view.test.ts`

**Interfaces:**
- Consumes: `SwitchingView`, `Switching` (Task 4 types), and `getUsageLog`'s `switching` (Task 5).
- Produces:
  - `savedOf(view: SwitchingView): { amount: string; more: boolean; percent: number | null }`:
    - `amount` is `money` of |without − spent|, and `more` is true when spent > without;
    - `percent` is the whole percent of (without − spent) ÷ without, rounded to the nearest whole, from bigint; null when `without` is `'0'` or `switches` is empty.
  - `savingsChart(view: SwitchingView): { bars: { day: string; spent: number; without: number; title: string }[]; max: number }`:
    - heights are whole millionths of a dollar;
    - each title is exactly `${day}: spent ${money(spent)}, without switching ${money(without)}, saved ${money(saved)}`, or `…, ${money(|saved|)} more` when it cost more.
  - `switchRows(view: SwitchingView, top = 5): { model: string; name: string; count: number; share: number; color: string }[]`:
    - most first, with the top five in `COLORS` order and the rest as one `other` row in `OTHER`;
    - `share` is count ÷ the largest count.

The plate goes where the Records list was. It is a `rl-u-plate` headed **Relay switching**, with a two-button segment **Compare with**: `Default model` | `Plan model`. Its contents, in order:
- **Four tiles** (`rl-cost-f`): `Switches`, `Spent`, `Without switching`, `Saved`. Saved shows `money · percent%`, or `amount more` when `more`.
- **The day chart** (SVG): the same slots and labels as the chart above. An outline bar (series-other) is the cost without switching, and a filled bar (series-1) inside it is what was spent.
- **"Switches to each model"**: one row per `switchRows` item, with a bar of `share` width and the count.
- **The small print**, exactly:
  - Default view: `An estimate: the same replies at the prices of each chat's model before Relay first moved it. It says nothing of whether that model would have answered as well.`
  - Plan view: `An estimate: the same replies at the prices of your Plan model, ${name}. It says nothing of whether that model would have answered as well.`
  - Then the counts, each shown only when above 0 except the first: `${chats} chats compared` · `${notCompared} not compared (default not known)` · `${leftOut} replies left out (no price)` · `Relay's decisions ${money(deciderUsd)}`, followed by `Decisions before this version, and decisions for helpers, are not counted.`
- **Special states:**
  - `switching` null: `The model prices could not be read. Refresh to try again.`
  - `plan` null: the Plan button is disabled, with the title `Set a Plan model in Relay's settings first.`
  - No switches: `Relay moved no chat in this range.`, with the tiles at 0.
- **The choice** is a signal that starts at `'default'`.

- [ ] **Step 1: Write the failing tests** in `tests/usage-view.test.ts`:
  - **`saved is without switching less spent, with its percent`:** spent `'2.104'` and without `'4.2002'` give `{ amount: '$2.10', more: false, percent: 50 }`.
  - **`a switching that cost more says so`:** spent `'1'` and without `'0.8'` give `{ amount: '$0.20', more: true, percent: -25 }`.
  - **`nothing moved, or nothing to compare, has no percent`** (Review Focus 4): no switches and without `'0'` give `percent: null`, with no throw.
  - **`each day's bar has spent inside without, and says what was saved`:** a title for a day that cost more ends in `more`.
  - **`switch rows: most first, five colours, the rest as other`:** seven models give six rows, the last being `other` in `var(--rl-s0)`.
- [ ] **Step 2: Run** `npx tsx --test tests/usage-view.test.ts`. Expected: FAIL, because the helpers are not exported.
- [ ] **Step 3: Implement** the three helpers, then the plate in `gui-usage.tsx` and its classes in `gui-styles.ts`. Remove the Records section, `showMore`, `more` and the `records` memo. A refresh asks for the first page only (`limit: PAGE`) until Task 7 removes the page.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck` and `npm run build`. Expected: PASS, no errors, and the build writes `dist/`.
- [ ] **Step 5:** Run `npm run preview:panel` and take screenshots of the usage tab at 400 px wide, light and dark, in both views and in the nothing-moved state. Save them to the scratchpad, and look at each one against DESIGN.md (series colours only, no mode hue, nothing overflowing).
- [ ] **Step 6: Commit** "The Relay switching plate replaces the Records list".

### Task 7: The server stops sending records; the real-host smoke checks the switching

**Files:**
- Modify: `src/usage-log.ts` (`UsageSummary` loses `records`; `UsageQuery` and `usageQueryOf` lose `offset` and `limit`)
- Modify: `src/contract.ts` (`usageQuery` loses `offset`/`limit`; `usageLog` loses `records`; `usageRecord` goes if nothing else uses it)
- Modify: `src/usage-view.ts` (`PAGE`, `PAGE_MAX`, `refreshLimit`, `recordCells` and `appendNew` go)
- Modify: `src/gui-usage.tsx` (`ask` sends no page)
- Modify: `scripts/panel-preview/fixtures.ts`
- Modify: `scripts/smoke-host-model.mjs` (see below)
- Test: `tests/usage-log.test.ts`, `tests/usage-view.test.ts`, `tests/rpc.test.ts`

**Interfaces:**
- Produces: `UsageQuery` without `offset`/`limit`, and `UsageSummary` without `records`. `matching` stays.

- [ ] **Step 1: Change the tests first.**
  - Delete the tests of the records page: `records come newest first, 50 at a time, with how many match`; the `appendNew` and `refreshLimit` tests in `tests/usage-view.test.ts`; and the `limit over 200` refusal in `tests/rpc.test.ts`.
  - Change `usageQuery()` in the tests to send no `offset`/`limit`.
  - Add **`the query refuses an offset or a limit`**: the contract's `additionalProperties: false` makes an old panel's question fail plainly (`fits(input)` is not empty).
- [ ] **Step 2: Run** `npm test`. Expected: FAIL, because the query still requires `offset` and `limit`.
- [ ] **Step 3: Implement** the removals.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Change the smoke's usage checks** (`scripts/smoke-host-model.mjs`, after "Usage records (the Relay usage tab)"):
  - Its range questions send no page.
  - "No text is kept" checks `JSON.stringify(log)`.
  - The first chat's Relay part checks become `relay: 'on'` and `relay: 'off'` questions over a range that ends at `betweenChats`: each has `matching` ≥ 1.
  - The between-chats range checks `later.matching > 0` and these switching values:
    - `later.switching.default.switches` deep-equals `[{ model: 'smoke/model-big', count: 1 }, { model: 'smoke/model-cheap', count: 1 }]`;
    - `later.switching.default.chats` is 1, and `later.switching.plan.model` is `'smoke/model-big'`.
  - Add: the long chat's first move (`down`) has `from` `'smoke/model-big'` and `start` `'smoke/model-big'`, read from `getRelayDecisions`.
  - Update the comment at the top of the file to name the switching check.
- [ ] **Step 6: Run the smoke** isolated, with the 2.3.0 CLI in the scratchpad: `npm run build`, then `RELAY_SMOKE_CLI=<scratchpad>/cli230/node_modules/@opencode/cli-windows-x64/bin/opencode.exe npm run smoke:host:model`. Expected: it ends with its pass line and no assertion error. Record the run in `docs/compatibility.md` (Windows 11, OpenCode 2.3.0 CLI, mock models; not tested: real models, a real cache, Desktop's panel) and in `docs/implementation-progress.md`.
- [ ] **Step 7: Commit** "The usage answer sends no records; the real-host smoke checks the switching".

### Task 8: Docs, and the bench runner keeps the tab's answer

**Files:**
- Modify: `scripts/bench/run.ts` (read the tab's answer before the settings go back)
- Modify: `scripts/bench/lib.ts` (new `tabQuery`)
- Modify: `docs/guide.md`, `docs/saving-money.md`, `docs/status.md`
- Modify: `docs/superpowers/plans/2026-11-26-relay-improve-on-go.md` (Task 6: "waits for the switching version, so one run serves both")
- Test: `tests/bench.test.ts`

**Interfaces:**
- Produces: `tabQuery(from: string, to: string, folder: string, relay: 'on' | 'off')`, which returns the full `getUsageLog` question with `project: folder`, `kind: 'any'`, empty search, no other filter, `tzOffsetMinutes: 0` and `timeZone: null`. `run.ts` saves `results.usageTab = { on, off }` (two `getUsageLog` answers for the run's start to now) just before `restoreSettings`. A failure is kept as `{ error }` and never stops the restore.

- [ ] **Step 1: Write the failing test** **`the tab question for a bench run names its folder and the Relay side`** in `tests/bench.test.ts`: `tabQuery(a, b, 'C:/x/relay-bench', 'on')` deep-equals the full object. Then run `npx tsx --test tests/bench.test.ts`. Expected: FAIL.
- [ ] **Step 2: Implement** `tabQuery` and the read in `run.ts`, inside the existing `restore` path, before `restoreSettings`. Then run `npx tsx --test tests/bench.test.ts`. Expected: PASS.
- [ ] **Step 3: Write the docs:**
  - **`docs/guide.md`:** what the switching plate shows, and what each view compares with.
  - **`docs/saving-money.md`:** how to read Saved, why it is an estimate, and how logins are priced.
  - **`docs/status.md`:** the known limits:
    - cache running out is not checked;
    - helper decisions are not counted;
    - the Plan view uses the Plan model as set now;
    - older chats can lack a default.
  - **`docs/implementation-progress.md`:** a line for this plan.
- [ ] **Step 4: Run the four checks** (`npm run typecheck`, `npm test`, `npm run build`, `node scripts/check-package.mjs`). Expected: all pass. Report the counts as printed.
- [ ] **Step 5: Commit** "Docs for Relay switching; the bench runner keeps the tab's answer".

### Task 9 (needs the owner's yes): The Go check

Do not start this task without the owner's yes for each of the two named steps: installing this version in their OpenCode (the route chosen then: a release together with the other plan's Task 8, or a packed copy), and the Go run. Record the yes in `AGENTS.md`'s Never line and in `docs/compatibility.md`.

- [ ] **Step 1:** Install as the owner chose, after the owner opens `relay-bench` in Desktop. Confirm the panel shows the new version beside Refresh.
- [ ] **Step 2:** Run the `off` and `on-one` sides on Go (the other plan's Task 6), started through WMI as before.
- [ ] **Step 3: Check, from `results.usageTab`:**
  1. The `on` answer's switch counts equal the moves in Relay's records for those chats.
  2. The `on` answer's Spent, less `deciderUsd`, equals the runner's own cost for `on-one` to the cent, or the gap is explained (helpers, a reply outside the range). Both views give the same Without switching, since Kimi is both the start model and the Plan model there.
  3. Put the `on` answer's Without switching beside the `off` answer's Spent, and report the gap as a check of the estimate, not as a pass or fail.
- [ ] **Step 4:** Record the platform, versions, numbers and what was not tested in `docs/compatibility.md` and `docs/implementation-progress.md`. Only now does anything here count as verified on Go.
- [ ] **Step 5: Commit** "The Go check of Relay switching".
