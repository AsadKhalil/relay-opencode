# Relay usage tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every reply in every chat leaves one dated record (numbers only), and a new side tab, Relay usage, shows them for a time range with search, filters, a small chart, totals by model and the records.

**Architecture:** The idle hook (and, before a summary, the compaction hook) reads the chat once and writes or grows one record per message under `relay/usage-log/<time>/<chat>/<message>` in plugin storage. A new RPC scans a time range, filters and adds it up on the server. The panel only draws what it gets.

**Tech Stack:** TypeScript ESM, OpenCode 2.3 plugin API (session hooks, plugin storage `get/set/remove/scan`, RPC, Solid GUI), node:test through tsx.

**Spec:** `docs/superpowers/specs/2026-11-24-relay-usage-tab-design.md`

## Global Constraints

- Keep no text: no message, reply, file name or chat title. Numbers, models, ids and the project's folder only.
- The idle hook never throws and holds a chat for one second at most. The compaction hook never throws, never changes the request, and waits half a second at most.
- No network request anywhere in this work.
- Key: `relay/usage-log/<ISO time of the message>/<sessionID>/<messageID>`. Kept 90 days; at most 1,000 old records removed per `getUsageLog` call.
- The idle hook looks at the chat's three newest messages (person's messages and finished compactions).
- A record is rewritten only when the reply has more requests or a Relay part appeared; a rewrite never lowers a count or drops a Relay part.
- Tab: ranges Today · 7 days · 30 days · 90 days (default 7); chart of the five largest models plus "other", switch cost, tokens or requests; records 50 at a time; refresh every 30 seconds while open.
- Cost shown: by list price when the model has one (OpenCode's, or Artificial Analysis's marked *), else OpenCode's own cost, else "not listed". Money is USD strings added with `parseUsd` (bigint), never floating point.
- Files the panel bundles (`src/usage-view.ts`, `src/gui-usage.tsx`) import nothing from `node:`.
- Every RPC method declares `errors`; outputs have `additionalProperties: false` and are checked with `fits` in tests.
- Keep each file's line endings (CRLF in `src/`, `tests/`, `scripts/`, `docs/`, `AGENTS.md`). Commit with `git -c user.name=… -c user.email=…` taken from `git log -1`; end messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A chat with hundreds of messages: each idle reads it once and touches only its three newest messages (bounded writes, no growth with chat length).
2. Two OpenCode windows writing the same record: whichever lands last has the same or larger counts and keeps any Relay part.
3. A reply sent at 23:59 local time is counted on that day in the panel's time zone, not the UTC day.
4. A record with no model (an answer with no model named), or a model with no `#effort`: search, filters, totals and chart still work.
5. A stored record from another build with missing or wrong fields is skipped, never breaks the tab.

---

### Task 1: Anchors and agents in a chat's messages

**Files:**
- Modify: `src/chat-facts.ts`
- Test: `tests/chat-facts.test.ts`

**Interfaces:**
- Produces: `newestAnchors(messages: unknown, count: number): { id: string; created: number; summary: boolean }[]` (newest last; person's messages and completed compactions); `agentOf(messages: unknown, anchorID: string): string | null`; `replyOf(messages, anchorID, models?, borrowed?)` now also takes a completed compaction's id.

- [ ] **Step 1: Write the failing tests** in `tests/chat-facts.test.ts`, with the file's own `user`, `answer`, `idle` helpers and the compaction shape on line 90:
  - `'the newest anchors are the last person messages and finished compactions, oldest first'`: for `[user m1, answer, user m2, answer, compaction c1 (completed), answer, user m3, answer]`, `newestAnchors(list, 3)` deep-equals `[{ id: 'm2', …, summary: false }, { id: 'c1', …, summary: true }, { id: 'm3', …, summary: false }]`; a pending compaction is not an anchor.
  - `"a summary's reply is its own request and the answers after it, up to the next message"`: `replyOf(list, 'c1')` has `requests: 2` and `total.input` = the compaction's 495 plus the next answer's input; `model` is the compaction's model.
  - `"the agent is the first answer's"`: `agentOf(list, 'm2') === 'build'`; `agentOf(list, 'c1') === 'compaction'`; an anchor with no answer gives `null`.
  - Review Focus 1: `'only the newest anchors are returned however long the chat'`: 300 messages, `newestAnchors(list, 3).length === 3`.

- [ ] **Step 2: Run** `npx tsx --test tests/chat-facts.test.ts`. Expected: FAIL, `newestAnchors` is not exported.

- [ ] **Step 3: Implement** the two functions and the compaction anchor in `replyOf`: when the anchor is a completed compaction with counts, it is the first request, followed by the answers until the next person's message. `replyOf` with a person's message id behaves exactly as before. Leave `counts` and `chatFacts` unchanged.

- [ ] **Step 4: Run** `npx tsx --test tests/chat-facts.test.ts`. Expected: PASS, with the old tests unchanged.

- [ ] **Step 5: Commit** `src/chat-facts.ts tests/chat-facts.test.ts`: "Usage records: find a chat's newest messages and summaries".

### Task 2: The usage record: build, grow, save, prune, read

**Files:**
- Create: `src/usage-log.ts`
- Modify: `src/relay-store.ts` (export `decisionsOf`)
- Test: `tests/usage-log.test.ts`

**Interfaces:**
- Consumes: Task 1; `replyOf`; `costOf`, `parseUsd`, `formatUsd`, `storedUsd` (`src/costs.ts`); `Decision`, `Mode`, `PriceSource` (`src/relay-store.ts`).
- Produces:
  - `type LogStore = { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void>; remove(key: string): Promise<void>; scan(options: { prefix: string; after?: string; limit?: number }): Promise<{ entries: readonly { key: string; value: unknown }[]; next?: string }> }`
  - `type UsageKind = 'chat' | 'helper' | 'summary'`
  - `type UsageRecord = { at: string; sessionID: string; messageID: string; project: string; kind: UsageKind; agent: string | null; model: string | null; requests: number; input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number; costByPrice: string | null; openCodeUsd: string | null; pricesFrom: PriceSource | null; relay: { mode: Mode | null; note: string | null } | null }`
  - `LOG_PREFIX = 'relay/usage-log/'`, `KEEP_DAYS = 90`, `logKey(record): string`
  - `buildRecords(messages: unknown, chat: { sessionID: string; project: string; helper: boolean }, prices: { models: ListedModel[] | null; borrowed: AaModel[] | null }, decisions: readonly Decision[]): UsageRecord[]`
  - `grown(old: UsageRecord | null, next: UsageRecord): UsageRecord | null` (null: nothing to write)
  - `saveRecords(store: LogStore, records: readonly UsageRecord[]): Promise<void>`
  - `pruneRecords(store: LogStore, now: number, max = 1000): Promise<number>`
  - `readRecords(store: LogStore, from: string, to: string): Promise<UsageRecord[]>`
  - `decisionsOf(store: Pick<RelayStore, 'get'>, sessionID: string): Promise<Decision[]>` in `src/relay-store.ts`

- [ ] **Step 1: Write the failing tests** in `tests/usage-log.test.ts` (an in-memory `LogStore` whose `scan` returns keys in order, `limit` per page and `next`):
  - `'a record holds the counts, the agent, the model and no text'`: from a two-request reply, the record's `requests`, token fields, `agent: 'build'`, `model: 'p/big'`; `JSON.stringify(record)` does not contain the person's text `'never read'`.
  - `'a reply with a price has its cost by price; output is priced with its reasoning'`: prices `{ input: '1', output: '4' }` per million, 1,000,000 input, 500,000 output and 500,000 reasoning give `costByPrice: '5'`.
  - `'a Relay record names the message: its mode and note go with it'`, and a message with no Relay record has `relay: null`.
  - `'a helper chat makes helper records; a finished compaction makes a summary record'`.
  - `'the key sorts by time'`: two records 1 ms apart sort the same by key as by `at`.
  - `'a record grows when the reply has more requests or a Relay part appears, and never shrinks'`: `grown(null, r)` is `r`; more requests gives the larger record keeping the old Relay part; fewer requests gives `null`; same requests with a new Relay part gives the old counts with the Relay part.
  - Review Focus 2: `'two windows saving the same record end with the larger one'`: save the larger, then the smaller; the stored record is the larger.
  - `'records past 90 days are removed, 1,000 at most a call'`: 1,005 old and 2 new records; `pruneRecords` returns 1,000; a second call returns 5; the 2 new remain.
  - `'reading a range returns the records between from and to, over several pages'` (`limit` 2 in the fake).
  - Review Focus 5: `'a stored value that is not a record is skipped'`: `readRecords` ignores `{ at: 5 }` and `null`.

- [ ] **Step 2: Run** `npx tsx --test tests/usage-log.test.ts`. Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement** `src/usage-log.ts` and `decisionsOf`. `buildRecords` takes `newestAnchors(messages, 3)`, skips an anchor whose `replyOf` is null, and sets `kind` to `summary` for a compaction, `helper` when `chat.helper`, else `chat`. `costByPrice` is the sum of `costOf` per kind (output with reasoning) and null when no kind has a price. `openCodeUsd` comes from the reply's `total.costUsd`. `relay` comes from the decision whose `messageID` equals the anchor. `readRecords` scans from `LOG_PREFIX + from` and stops past `to`. Mark the ceiling: `// shortcut: every call scans the range; fine to about 30,000 records, past that keep daily summaries beside them.`

- [ ] **Step 4: Run** `npx tsx --test tests/usage-log.test.ts tests/relay-store.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit** `src/usage-log.ts src/relay-store.ts tests/usage-log.test.ts`: "Usage records: one per reply, grown, kept 90 days".

### Task 3: Adding up for the tab

**Files:**
- Modify: `src/usage-log.ts`
- Test: `tests/usage-log.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `type UsageQuery = { from: string; to: string; tzOffsetMinutes: number; search: string; provider: string | null; effort: string | null; mode: string | null; relay: 'any' | 'on' | 'off'; kind: 'any' | UsageKind; project: string | null; offset: number; limit: number }`
  - `type UsageDay = { day: string; models: { model: string; cost: string | null; tokens: number; requests: number }[] }`
  - `type UsageTotal = { model: string; replies: number; requests: number; input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number; cost: string | null; aaPriced: boolean }`
  - `type UsageSummary = { days: UsageDay[]; totals: UsageTotal[]; options: { providers: string[]; efforts: string[]; modes: string[]; projects: string[] }; records: UsageRecord[]; matching: number; first: string | null }`
  - `shownCost(record: UsageRecord): string | null`; `summarize(records: readonly UsageRecord[], query: UsageQuery): UsageSummary`

- [ ] **Step 1: Write the failing tests:**
  - `'the cost shown is the cost by price, else OpenCode's own when more than $0, else none'`.
  - Review Focus 3: `'days are counted in the panel's time zone'`: a record at `2026-11-24T04:59:00Z` with `tzOffsetMinutes: -300` falls on `2026-11-23`; every day of the range is present, empty days included.
  - `'search matches part of the model, provider or id in any case'`: `'KIMI'` finds `opencode-go/kimi-k3.1-pro`.
  - `'each filter narrows the records, totals and days alike'`: provider, effort, mode (`relay.mode ?? agent`), relay on or off, kind, project.
  - `'the filter lists come from the whole range, not the filtered part'`.
  - Review Focus 4: `'a record with no model, or with no effort, is counted and searchable'`: `model: null` totals under `unknown model`; effort lists hold `default` for a model without `#`.
  - `'records come newest first, 50 at a time, with how many match'`.
  - `'totals add USD exactly'`: `0.1 + 0.2` gives `'0.3'`.

- [ ] **Step 2: Run** `npx tsx --test tests/usage-log.test.ts`. Expected: FAIL, `summarize` is not exported.

- [ ] **Step 3: Implement** `shownCost` and `summarize`. A day is `new Date(Date.parse(at) + tzOffsetMinutes * 60000).toISOString().slice(0, 10)`. Days run from `from` to `to`. Totals are sorted by cost, then by tokens.

- [ ] **Step 4: Run** `npx tsx --test tests/usage-log.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**: "Usage records: add up by day and model, with search and filters".

### Task 4: The hooks write records for every chat

**Files:**
- Modify: `src/relay-auto.ts`, `src/index.ts`
- Test: `tests/relay-auto.test.ts`, `tests/plugin.test.ts`, `tests/relay-fakes.ts` (fake storage gains `remove` and `scan`, and `session.get` a `parentID` option)

**Interfaces:**
- Consumes: Tasks 1 to 3.
- Produces: `relayReplyHook(deps: Pick<RelayDeps, 'session' | 'store' | 'readMs' | 'chatModels'> & { borrowedPrices?: () => Promise<AaModel[]>; log?: LogStore; project?: string })` writes records for every chat; `relayCompactionHook(deps: same): (event: { readonly sessionID: string }) => Promise<void>`.

- [ ] **Step 1: Write the failing tests** in `tests/relay-auto.test.ts`:
  - `'a chat with Relay off gets records when it goes idle'`: no Relay records; after the hook, `relay/usage-log/...` holds the chat's newest messages with `relay: null`.
  - `'a placed message keeps its Relay part, and the old reply record is still filled'`.
  - `'a helper chat (one with a parent) makes helper records; a slow session.get leaves it a chat'`.
  - `'a slow or failing storage leaves the record out and the hook still returns within its limit, without throwing'`.
  - `'the context is read once for both jobs'`: one `context` call per idle.
  - `'the compaction hook writes the records so far, within half a second, and never changes the request'`: the event object is deep-equal before and after.
  - In `tests/plugin.test.ts`: the registered session hooks are `['compaction', 'experimental.idle', 'prompt']`.

- [ ] **Step 2: Run** `npx tsx --test tests/relay-auto.test.ts tests/plugin.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** In `relayReplyHook`, inside the existing `within(…, limitMs)`: read the context, models, borrowed prices, the chat (`session.get`, half the limit, for `parentID`) and `decisionsOf` together. Then fill waiting replies as today, and `saveRecords(deps.log, buildRecords(…))` when `deps.log` is given. `relayCompactionHook` runs the same record step within `min(limitMs, 500)`. In `src/index.ts`, pass `log: context.storage as unknown as LogStore` and `project: context.location.directory`, and register `context.session.hook('compaction', relayCompactionHook(…))` with its disposer.

- [ ] **Step 4: Run** `npm test`. Expected: all pass.

- [ ] **Step 5: Commit**: "Every chat that goes idle, or is about to be summarized, leaves its usage records".

### Task 5: The server call for the tab

**Files:**
- Modify: `src/contract.ts`, `src/rpc.ts`
- Test: `tests/rpc.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 3; `getUsage`, `AA_CREDIT`.
- Produces: RPC `getUsageLog`, with input `UsageQuery` and output `{ directory: string } & UsageSummary & { before: { since: string | null; rows: UsageRow[] }; credit: string | null; removed: number }`.

- [ ] **Step 1: Write the failing tests** in `tests/rpc.test.ts` (with `asClient`):
  - `'getUsageLog adds up the stored records for a range and its output fits the contract'`: `fits(RelayRpc.methods.getUsageLog.output, answer)` is `[]`, and so is the input.
  - `'getUsageLog removes records past 90 days, at most 1,000'`: `removed` counts them.
  - `'getUsageLog refuses a range longer than 92 days or a limit over 200'`: rejects with `type: 'rejected'`.
  - `'the old totals come along as before'`: `before.rows` equals `getRelayUsage().rows`.

- [ ] **Step 2: Run** `npx tsx --test tests/rpc.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** the contract entry (input and output schemas, `errors`), and the handler: validate the input, then `pruneRecords`, `readRecords`, `summarize`, `getUsage`, and `credit` when any shown total is `aaPriced`.

- [ ] **Step 4: Run** `npm test`. Expected: all pass, including the test that every method declares `errors`.

- [ ] **Step 5: Commit**: "getUsageLog: the tab's data, added up on the server".

### Task 6: The Relay usage tab

**Files:**
- Create: `src/usage-view.ts`, `src/gui-usage.tsx`
- Modify: `src/gui.tsx`, `src/gui-styles.ts`
- Test: `tests/usage-view.test.ts`

**Interfaces:**
- Consumes: Task 5's output type.
- Produces:
  - `type Range = 'today' | '7d' | '30d' | '90d'`
  - `rangeOf(range: Range, now: Date): { from: string; to: string; tzOffsetMinutes: number }`
  - `type Metric = 'cost' | 'tokens' | 'requests'`
  - `chartOf(days: UsageDay[], metric: Metric, top = 5): { bars: { day: string; total: number; title: string; parts: { model: string; value: number; color: string }[] }[]; legend: { model: string; color: string }[]; max: number }`
  - `recordCells(record: UsageRecord): { time: string; project: string; chat: string; kind: string; mode: string; model: string; relay: string; tokens: string; cost: string }`
  - `sortTotals(totals: UsageTotal[], by: keyof UsageTotal, down: boolean): UsageTotal[]`

- [ ] **Step 1: Write the failing tests** in `tests/usage-view.test.ts`:
  - `'today runs from local midnight to now; 7 days starts six midnights earlier'`.
  - `'the chart keeps the five largest models and puts the rest in other, with one colour each'`.
  - `'a bar's title names the day and each model's share'`; cost values come from USD strings.
  - `'an empty range gives empty bars, not an error'`.
  - `'a record shows the folder name, a short chat id, its Relay part or off, and its cost with * at Artificial Analysis prices'`.
  - `'sorting by cost uses the USD amounts exactly'`.

- [ ] **Step 2: Run** `npx tsx --test tests/usage-view.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `src/usage-view.ts` (no `node:` import). Then `src/gui-usage.tsx`, the tab as the spec's step 6 lays it out: range buttons, search, filter lists, Refresh, the summary, the SVG chart with its switch and legend, the by-model table (sortable; a row click sets the search), the records with "Show more", the footer, and "Before this history" in a collapsed section. It fetches on open, on Refresh, on a filter change and every 30 s. Colours come from the panel's own variables in `src/gui-styles.ts`, so light and dark both read well, and tables scroll sideways inside their own box at the panel's width. In `src/gui.tsx`, add a second `Panel` (`id: 'usage'`, tab title "Relay usage") and a command "Open Relay usage". Replace the Usage by model section with one line and an "Open usage" button.

- [ ] **Step 4: Run** `npm run typecheck && npx tsx --test tests/usage-view.test.ts && npm run build`. Expected: typecheck clean, tests pass, and the build writes `dist/gui-experimental.cjs`.

- [ ] **Step 5: Commit**: "The Relay usage tab: range, search, filters, chart, totals and records".

### Task 7: The smoke, the docs and the four checks

**Files:**
- Modify: `scripts/smoke-host-model.mjs`, `docs/guide.md`, `docs/privacy.md`, `docs/status.md`, `AGENTS.md`, `docs/compatibility.md`, `docs/implementation-progress.md`

- [ ] **Step 1:** In the smoke, after its existing turns, call `getUsageLog` for today. Assert a record exists for the `/relay` message with its Relay part, and one for a plain message with `relay: null`. The output must pass the host's own check of the declared schema.
- [ ] **Step 2: Docs:**
  - `docs/guide.md`: a "Relay usage" section in place of Usage by model, plus the commands table.
  - `docs/privacy.md`: every reply's counts and the project's folder, on this machine, for 90 days; never text.
  - `docs/status.md`: what ran where.
  - `AGENTS.md`: the idle hook now reads every chat; the compaction hook; the new keys; the bundled files `usage-view.ts` and `gui-usage.tsx`.
  - `docs/compatibility.md` and `docs/implementation-progress.md`: the smoke's result.
- [ ] **Step 3: Run the four checks fresh,** plus the smoke: `npm run typecheck`, `npm test`, `npm run build`, `node scripts/check-package.mjs`, and `RELAY_SMOKE_CLI=<Desktop's 2.3.2 CLI> npm run smoke:host:model`. Expected: all pass. Record the counts as printed.
- [ ] **Step 4: Commit**: "Relay usage: the smoke and the docs".

### Task 8 (after the final review and the merge): install, then the two Go runs

The owner approved this with the design ("install it in your copy … and run the two Go tests").
- [ ] Pack the build. Close Desktop's window and end its service. Install the build into the fixed copy with `npm install` and check it by hash. Start Desktop through Explorer, and wait for the service and the test folder.
- [ ] `scripts/bench/run.ts --plan go --check --sides on-own,on-one`, then a run with `--sides on-own,on-one --budget 90` into `bench/second` in the scratchpad. Watch the PC's free memory first.
- [ ] Read `getUsageLog` for today through the service: the runs' chats must show as records, with Relay's part on each placed message. This is the first check on real replies.
- [ ] Record in `docs/compatibility.md` and `docs/implementation-progress.md`: the table over all runs (`report.ts`), the second run against the first, and what the usage records showed. Commit. The owner pushes.
