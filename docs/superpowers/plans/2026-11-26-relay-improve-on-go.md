# Relay improvements, tested on Go — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three improvements, each checked on the owner's OpenCode Go models: Relay honors the cache time set in OpenCode, the decider's handling of short follow-ups is measured (and fixed only if it fails), and the README gets an honest "does it save money" section from three runs.

**Architecture:** Part A reads `settings.cache.ttl` from OpenCode's model list into `ListedModel.cacheMs` and uses it in `stayOrGo` in place of the fixed five minutes, then measures how long Go's cache really lives. Part B adds a chat's last reply to the decider example runner and measures 20 made-up follow-ups on a free decision model. Part C runs the existing proof runner twice more and writes up the results. The three parts are independent and can be done in any order. Part C does not need Part A's code, because neither of its setups (Relay off, one model a mode) ever reaches the cost check.

**Tech Stack:** TypeScript (ESM), node:test through tsx, OpenCode 2.3.0 plugin API, the runners in `scripts/bench/` and `scripts/decider-examples.ts`.

**Spec:** No separate spec. On 26 Nov 2026 the owner said "ok use Go models", then "go with your picks", which settled the decisions below.

## Decisions (owner, 26 Nov 2026)

- Real tests use the owner's Go models: `opencode-go/kimi-k3.1-pro` (strong) and `opencode-go/glm-5.3-flash` (cheap). No Claude plan use.
- Order: cache time, then follow-ups, then the proof.
- Cache time: read OpenCode's own setting; keep five minutes when nothing is set. Check Go's real cache lifetime with a few requests.
- Follow-ups: measure first, using made-up messages to a free decision model from an isolated host. Change Relay only if it fails the bar.
- Proof: two more runs of `off` vs `on-one` on Go, after the owner's Go week resets, for three runs in all. Then a README section that says only what the runs show.

## Global Constraints

- Never use the owner's real profile, Desktop or paid allowance without their yes for that named step. Record each such step in `docs/compatibility.md` and add it to the AGENTS.md "Never" line. The free, isolated decider run in Task 5 runs on the 26 Nov "go with your picks". Tasks 3 and 6 spend Go allowance, so each asks again when it is due.
- Isolated hosts get scratch `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `XDG_STATE_HOME`, `HOME`, `USERPROFILE`, `APPDATA` and `LOCALAPPDATA`, plus a throwaway password and the loopback mock provider. Delete the scratch roots afterwards.
- "Project host records can contain credentials; return only explicit display fields": from a model's `settings`, read `cache.ttl` and nothing else. Never pass `settings` on.
- Nothing provider-specific goes into `src/`. No Go default cache time.
- Mark a deliberate simplification with a `// shortcut:` comment that names its ceiling.
- Line endings: CRLF in `src/`, `tests/`, `scripts/`, `AGENTS.md` and most of `docs/` (this plan included); LF in `README.md` and `CONTRIBUTING.md`. Check them with Node, not `grep`.
- Before saying anything passes, run fresh: `npm run typecheck`, `npm test`, `npm run build`, `node scripts/check-package.mjs`. Report the counts as printed.
- Nothing that ran only against fakes is called verified.
- Before every push, run `git log origin/main..HEAD`. Push to `main`; never merge a pull request. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The owner's service is asked only about `relay-bench`, after the owner has opened it in Desktop. Real runs start outside Claude Code's shell, through WMI as on 24 Nov, so a reaped shell cannot orphan them.
- Isolated decider and plugin runs use the OpenCode 2.3.0 CLI: `npm install --prefix <scratch> --ignore-scripts @opencode/cli-windows-x64@2.3.0`, binary at `node_modules/@opencode/cli-windows-x64/bin/opencode.exe`. Desktop's own CLI is `%APPDATA%\ai.opencode.desktop\cli\2.4.2-x64\opencode-cli.exe`.

## Review Focus

1. **Odd cache-time text:** `"60"`, `"1H"`, `" 1h"`, `"-5m"` or a number count as unset (five minutes) and never throw. Pinned in Task 2, Step 1.
2. **Model settings that hold keys or headers next to `cache`:** none of it reaches `listModels` or any record. Pinned in Task 2, Step 1.
3. **Two models with different cache times:** the chat's current model is judged by its own time and the new pick by its own. Pinned in Task 2, Step 4.
4. **`ttl: "0s"`:** the cache is never alive, so a move always counts as free. Pinned in Task 2, Step 4.
5. **A host that lists no settings at all** (2.3.0 may not): behavior is exactly today's. Pinned by the unchanged router tests and the "no `cacheMs` key" assertion in Task 2, Step 1.

---

## Part A — The cache time

### Task 1: Does OpenCode list a model's cache time? (probe, isolated, no cost)

**Files:**
- Create (not committed): `<job tmp>/cache-probe.mjs`, adapted from `scripts/smoke-host-model.mjs`'s isolated host and mock provider
- Modify: `docs/compatibility.md` (a dated section)

- [ ] **Step 1:** Write the probe. Use an isolated host and the mock provider `smoke`, with `settings: { baseURL, cache: { ttl: '1h' } }` at the provider level, and on model `model-b` also `settings: { cache: { ttl: '10m' } }`. Call `client.model.list({ location })` and print, per model, only `providerID/id` and `JSON.stringify(model.settings?.cache ?? null)`.
- [ ] **Step 2:** Run it on the 2.3.0 CLI and on Desktop's 2.4.2 CLI.
  Expected: one line per mock model per version. Record which levels show up (provider, model, both or neither), and whether the model level wins.
- [ ] **Step 3:** Write a section in `docs/compatibility.md`: platform, both versions, what each listed, and what was not tested (Desktop's screen, real providers).
  **Gate:** if neither version lists `settings.cache.ttl`, skip Task 2. Instead, add to the cache line in `docs/status.md` that OpenCode does not show Relay the cache time, and commit only the docs.
- [ ] **Step 4:** Commit: `git add docs/compatibility.md` → `Record whether OpenCode lists a model's cache time`.

### Task 2: Relay uses the cache time OpenCode lists

**Files:**
- Modify: `src/inventory.ts` (`ttlMs`; `ListedModel.cacheMs`; `listProjectModels`)
- Modify: `src/contract.ts:10-15` (the model schema gets `cacheMs: { type: 'number' }`; it is not added to `required`)
- Modify: `src/router.ts:43` (`RoutableModel` gets `cacheMs?: number`) and `src/router.ts:140-182` (`stayOrGo`)
- Modify: `docs/status.md` (known limits: the cache line)
- Test: `tests/inventory.test.ts`, `tests/router.test.ts`

**Interfaces:**
- Produces: `export function ttlMs(value: unknown): number | null` in `src/inventory.ts`. It parses `/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/` and returns `Math.round(number × unit)`; anything else returns null.
- Produces: `ListedModel.cacheMs?: number`. It is present only when `ttlMs(model.settings?.cache?.ttl)` is not null.
- Produces: `RoutableModel.cacheMs?: number`.

- [ ] **Step 1: Write the failing tests** in `tests/inventory.test.ts`:

```ts
test('a cache time set in OpenCode is read in milliseconds; anything else is unset', () => {
  assert.deepEqual(['1h', '90s', '500ms', '2d', '5m', '1.5h', '0s'].map(ttlMs), [3_600_000, 90_000, 500, 172_800_000, 300_000, 5_400_000, 0]);
  assert.deepEqual(['', '60', '1H', ' 1h', '-5m', 'soon', 60, null, undefined, {}].map(ttlMs), Array(10).fill(null));
});

test('the cache time is the only thing read from a model\'s settings', async () => {
  const data = [
    { ...base('a'), settings: { apiKey: 'secret', headers: { authorization: 'secret' }, cache: { ttl: '1h', warming: true } } },
    { ...base('b'), settings: { cache: { ttl: 'soon' } } },
    base('c'),
  ];
  const [a, b, c] = await listProjectModels(hostWith(data) as never);
  assert.equal(a.cacheMs, 3_600_000);
  assert.equal('cacheMs' in b, false);
  assert.equal('cacheMs' in c, false);
  assert.equal(JSON.stringify([a, b, c]).includes('secret'), false);
});
```

`base(id)` and `hostWith(data)` are small helpers made the way the file's first test builds its `data` and `ctx`.

- [ ] **Step 2:** Run `npx tsx --test tests/inventory.test.ts`. Expected: FAIL, `ttlMs` is not exported.
- [ ] **Step 3:** Implement `ttlMs` and `cacheMs` in `src/inventory.ts`, and add the schema property in `src/contract.ts`.
- [ ] **Step 4: Write the failing router tests** in `tests/router.test.ts`.
  - Give the `Extra` type `models?: object[]`; `move` uses it in place of `priced` when given.
  - Add `const lasting = (ms: number, ids?: string[]) => priced.map(model => !ids || ids.includes(model.id) ? { ...model, cacheMs: ms } : model);`

```ts
test('the cache time OpenCode lists replaces the five minutes', () => {
  // An hour's cache, ten minutes after the last answer: the move from opus to sonnet still costs a re-read and does not pay.
  assert.equal(went(move('opus', 'sonnet', 60_000, { agoMs: 600_000, models: lasting(3_600_000) }))[0], 'opus');
  // Without a listed time, ten minutes is past the cache, so nothing is lost by moving.
  assert.deepEqual(went(move('opus', 'sonnet', 60_000, { agoMs: 600_000 })), ['sonnet', null]);
  // A cache time of 0 means there is never a cache to lose.
  assert.deepEqual(went(move('opus', 'sonnet', 60_000, { agoMs: 1_000, models: lasting(0) })), ['sonnet', null]);
  // Only the chat's own model counts for its cache: an hour on the pick alone does not keep the chat on opus.
  assert.deepEqual(went(move('opus', 'sonnet', 60_000, { agoMs: 600_000, models: lasting(3_600_000, ['sonnet']) })), ['sonnet', null]);
});
```

  - Extend the existing `held` test (line ~221): give `held` a second parameter `models`, passed on to `move`. With `lasting(3_600_000, ['sonnet'])`, `held(1_200_000, …)` gives the same result as `held(60_000, …)`.
- [ ] **Step 5:** Run `npx tsx --test tests/router.test.ts`. Expected: FAIL on the hour case (today the chat moves to sonnet), the `0` case (today it stays on opus) and the `held` extension.
- [ ] **Step 6:** In `stayOrGo`, replace `CACHE_MS` with each model's own life:
  - Add `const lifeOf = (model: RoutableModel | undefined) => model?.cacheMs ?? CACHE_MS`.
  - The "nothing to lose" check uses the current model's entry in `models`.
  - The `held` lookup uses the pick's entry.
  - The shortcut comment becomes: `// shortcut: a cache lives five minutes (OpenCode's default) unless OpenCode lists a cache time for the model. Cache warming is not read: a warmed cache is taken to end at its ttl.`
- [ ] **Step 7:** Run the four checks. Expected: all pass, counts as printed.
- [ ] **Step 8:** End-to-end on an isolated 2.3.0 host, with the mock from Task 1 and Relay packed from this repo. Relay's `listModels` RPC must list `cacheMs: 3600000` (or the level Task 1 found) for the mock model. Record it in `docs/compatibility.md`.
- [ ] **Step 9:** Update docs and commit.
  - In `docs/status.md`, rewrite the cache sentence of the known limit: "Relay counts a cache as lasting five minutes unless OpenCode lists a cache time for the model (`cache.ttl`); warming is not read."
  - Add a line to `docs/implementation-progress.md`.
  - Commit `src/inventory.ts src/contract.ts src/router.ts tests/inventory.test.ts tests/router.test.ts docs/status.md docs/compatibility.md docs/implementation-progress.md` → `Relay uses the cache time OpenCode lists for a model`.

### Task 3: How long Go's cache lives (the owner's OpenCode, a few cents)

**Files:**
- Modify: `scripts/bench/lib.ts` (`cacheAlive`), `tests/bench.test.ts`
- Create: `scripts/bench/cache-life.ts`

**Interfaces:**
- Produces: `export function cacheAlive(tokens: Tokens): boolean` in `scripts/bench/lib.ts`. It is true when `tokens.cache.read` is at least 90% of `input + cache.read + cache.write`, and false when that sum is 0.

- [ ] **Step 1: Failing test** in `tests/bench.test.ts`:

```ts
test('a request read its chat from the cache when 90% or more of its prompt was a cache read', () => {
  const t = (input: number, read: number, write = 0) => ({ input, output: 5, reasoning: 0, cache: { read, write } });
  assert.deepEqual([t(500, 24_000), t(2_400, 21_600), t(14_000, 10_000), t(0, 0), t(200, 9_000, 15_000)].map(cacheAlive), [true, true, false, false, false]);
});
```

- [ ] **Step 2:** Run `npx tsx --test tests/bench.test.ts`. Expected: FAIL, `cacheAlive` is not exported.
- [ ] **Step 3:** Implement `cacheAlive`, then run the test again. Expected: PASS.
- [ ] **Step 4:** Write `scripts/bench/cache-life.ts`.
  - The header comment says, as `run.ts`'s does, that it sends real requests to Go through the owner's OpenCode and runs only with their yes.
  - It connects as `run.ts` does: `service.json`, with the password never printed. Folder: `RELAY_BENCH_DIR`.
  - It runs two chats at once, one on `opencode-go/kimi-k3.1-pro` and one on `opencode-go/glm-5.3-flash`. Different models do not share a cache.
  - Each chat is created with `DENIED_TOOLS`, plus `edit`, `write` and `bash` on `*`, denied.
  - Message 1 of each chat: `Reply with the single word: ready.`, then about 6,000 made-up words seeded from the start time, so that no other chat shares that text.
  - Then four probes, `Reply with the single word: ok`, sent 4, 8, 16 and 31 minutes after the previous reply went idle. For idle, poll `session.context` for an `idle` entry, as `untilIdle` in `run.ts` does.
  - For each probe, read the first new assistant entry's tokens and print `model, gap minutes, cache.read, prompt tokens, cacheAlive`. Write the rows as JSON to `--out <file>`.
  - Stop a chat at the first entry with an error. Never send more than 5 messages per chat.
  - Mark the small copy of `run.ts`'s connection and wait code with `// shortcut: copied from run.ts (a one-off check); move it to a shared module if a third runner needs it`.
- [ ] **Step 5: Gate.** Ask the owner: "Run the cache-lifetime check on Go now? About an hour, 10 requests, a few cents of Kimi and Flash. Please have `relay-bench` open in Desktop." Wait for a yes.
- [ ] **Step 6:** Start it through WMI with `--out %USERPROFILE%\relay-bench-results\2026-11-xx-cache-life.json`. Expected: 8 rows.
- [ ] **Step 7:** Record the table in `docs/compatibility.md` and add the yes to the AGENTS.md "Never" line. Then tell the owner what it means:
  - alive at 31 minutes: Relay's five minutes is too short for Go, and it moves chats whose cache was still alive;
  - dead at 4 minutes: five minutes is too long;
  - in between: the measured span.
  - Any change to their config, such as setting `cache.ttl` for `opencode-go`, or to Relay's default, is a new decision for the owner.
- [ ] **Step 8:** Commit `scripts/bench/lib.ts scripts/bench/cache-life.ts tests/bench.test.ts docs/compatibility.md AGENTS.md` → `How long Go's cache lives: a check and its result`.

## Part B — Short follow-ups

### Task 4: The example runner can send a chat's last reply

**Files:**
- Modify: `scripts/decider-examples.ts` (`Example.reply`; `runExamples` passes it; `oneModelEach`; `RELAY_EXAMPLES_ONE`)
- Create: `scripts/decider-followup-cases.json`
- Test: `tests/relay-examples.test.ts`

**Interfaces:**
- Produces: `Example.reply?: string`, passed as `reply` in the `decide` input. As in Relay, `decide` itself drops it when no mode has lines.
- Produces: `export function oneModelEach(set: ExampleSet): ExampleSet`, which returns the set with `lines: { plan: [''], execute: [''], review: [''] }`. That is one model a mode, so no lines and no reply are sent, as Relay sends it for that setup. `main` applies it when `RELAY_EXAMPLES_ONE=1`.

- [ ] **Step 1: Failing test** in `tests/relay-examples.test.ts`, using the file's `fakeHost`:

```ts
test('a reply goes to the decider with two models a mode, and not with one model a mode', async () => {
  const set: ExampleSet = { ...tiny, examples: [{ ...tiny.examples[0], reply: 'Plan: 1. add the table 2. wire the form 3. test it' }] };
  const answer = () => ({ answers: [picked('mode', 'execute', 0.9)], cost: 0 });
  const lined = fakeHost(answer), single = fakeHost(answer);
  await runExamples(set, lined, judgeModel, 0);
  await runExamples(oneModelEach(set), single, judgeModel, 0);
  assert.equal(JSON.stringify(lined.requests).includes('wire the form'), true);
  assert.equal(JSON.stringify(single.requests).includes('wire the form'), false);
});
```

- [ ] **Step 2:** Run `npx tsx --test tests/relay-examples.test.ts`. Expected: FAIL, `oneModelEach` is not exported.
- [ ] **Step 3:** Implement it, then run the test again. Expected: PASS.
- [ ] **Step 4:** Write `scripts/decider-followup-cases.json`. Its `lines` are copied from `scripts/relay-examples.json`; it has 20 examples, every one `line: null, followUp: true`, with these texts.

| # | Reply before it | Chat's agent | `text` | `expect` |
|---|---|---|---|---|
| 1–10 | a plan | `plan` | ok, do it · go ahead · yes · sounds good, build it · continue · implement steps 1 and 2 · lgtm, apply it · yep, make the changes · do it but skip the tests for now · ship it | `execute` |
| 11–14 | a review | `plan` | fix those · ok fix both bugs · fix the first one only · go ahead and fix everything you found | `execute` |
| 15–18 | a plan | `plan` | ok but why not use a queue? · wait, what about the login page? · hmm, explain step 3 more · ok, what are the risks? | `plan` |
| 19–20 | a finished build | `build` | now check it · done? review what you changed | `review` |

  The `reply` for each is made up, 600 characters at most:
  - a plan: 2–4 sentences ending in a numbered plan of 3 steps, no code;
  - a review: two problems, each with a file name;
  - a finished build: the files changed and that the tests pass.
- [ ] **Step 5:** Run the four checks, then commit `scripts/decider-examples.ts scripts/decider-followup-cases.json tests/relay-examples.test.ts` → `The example runner sends a chat's last reply; 20 follow-up cases`.

### Task 5: Measure the follow-ups (free decision model, isolated)

**Files:**
- Modify: `docs/compatibility.md`, `docs/implementation-progress.md`, `AGENTS.md` (the "Never" line)

- [ ] **Step 1:** Run both setups. That is 40 requests to `opencode/jev-1.13-free`, and the script refuses any model with a price.

```bash
RELAY_SMOKE_CLI=<2.3.0 opencode.exe> RELAY_EXAMPLES_SET=scripts/decider-followup-cases.json RELAY_EXAMPLES_ONE=1 RELAY_EXAMPLES_OUT=<tmp>/followups-one.json npx tsx scripts/decider-examples.ts
RELAY_SMOKE_CLI=<2.3.0 opencode.exe> RELAY_EXAMPLES_SET=scripts/decider-followup-cases.json RELAY_EXAMPLES_OUT=<tmp>/followups-lines.json npx tsx scripts/decider-examples.ts
```

  Expected: 20 outcomes each. If the free model is not listed, stop and tell the owner; do not switch to a paid model.
- [ ] **Step 2:** Score each setup from its outcomes file.
  - The bar: the decider's own mode (`said`) is right at confidence ≥ 0.6 in **at least 17 of 20**, and **no Plan case (15–18) gets Execute at ≥ 0.6**.
  - Ignore line counts in the one-model setup.
- [ ] **Step 3:** Record both tables in `docs/compatibility.md`, with platform, CLI version, decider and what was not tested (the owner's own decider, real chats). Add the step to the AGENTS.md "Never" line and a line to `docs/implementation-progress.md`, then commit → `How the decider places short follow-ups`.
- [ ] **Step 4:** Decide from the results.
  - One-model setup passes: nothing to change. Tell the owner.
  - One-model fails and the lined setup passes: the reply is what helps. Propose to the owner that the mode question also carries the last reply (the `replied` rule in `src/decider.ts`), which changes the request measured on 23 Nov. Build it only after their yes, as a new plan.
  - Both fail: bring the misses to the owner; nothing is built yet.

## Part C — The proof

### Task 6: Two more runs of Relay off vs one model a mode (Go allowance)

**Files:**
- Results outside the repo: `%USERPROFILE%\relay-bench-results\<date>-a\` and `<date>-b\`. They are kept, because the earlier runs' files were in scratch folders and are gone.

- [ ] **Step 1: Gate.** Ask the owner whether their Go week has reset (their Go usage page shows it) and for a yes to run `off` and `on-one` once, about $2.30 at list price. Ask them to open `relay-bench` in Desktop. Wait for the yes.
- [ ] **Step 2:** Run `npx tsx scripts/bench/run.ts --plan go --out <scratch>/check --check`. Expected: `PASS`.
- [ ] **Step 3:** Start run a through WMI: `npx tsx scripts/bench/run.ts --plan go --sides off,on-one --budget 30 --out %USERPROFILE%\relay-bench-results\<date>-a`. Expected: 12 chats and a `results.json`. The runner puts back the owner's Relay settings when it ends.
- [ ] **Step 4:** Read the week share the runner printed.
  - If this week's share so far, plus run a's share again, stays under 90%: ask for the yes for run b and run it the same way into `<date>-b`.
  - Otherwise, run b waits for next week. Tell the owner the date.
- [ ] **Step 5:** Run `npx tsx scripts/bench/report.ts --sides off,on-one <date>-a <date>-b` and record the table and each run's section in `docs/compatibility.md`. Take the earlier run's totals from `docs/compatibility.md`: the section where one model a mode passed 6 of 6 and Off 4 of 6. Keep each run on its own row; never add runs from different Relay versions into one total. Add the yes to the AGENTS.md "Never" line, then commit → `Two more proof runs on Go: Relay off vs one model a mode`.

### Task 7: The README says what the runs show

**Files:**
- Modify: `README.md` (LF): a section `## Does it save money?` after `## Use`, and the sentence in setup step 2
- Modify: `docs/saving-money.md` ("What you can do", first bullet), `docs/status.md` (the tested list), `docs/implementation-progress.md`

- [ ] **Step 1:** Write the README section.
  - A table with one row per run: date, Relay off (passed, Go list cost), one model a mode (passed, Go list cost), difference.
  - One sentence on the limits: six exercises, list prices, and the share of the Go allowance being an estimate.
  - A link to the `docs/compatibility.md` sections.
  - If the three runs do not show one model a mode cheaper at the same or better passes, the section says that plainly, and nothing is recommended.
- [ ] **Step 2:** Only if Step 1 shows a saving, add to setup step 2: "Start with one model a mode: a strong model for Plan and Review and a cheaper one for Execute." Add the same as the first bullet of "What you can do" in `docs/saving-money.md`, with the runs' numbers.
- [ ] **Step 3:** Run the four checks, then commit `README.md docs/saving-money.md docs/status.md docs/implementation-progress.md` → `README: what three runs on Go show`.

## Release

### Task 8: Version 0.2.3 for the owner to publish

Only after Task 2 has landed: it is the only shipped code change. The README from Task 7 reaches npm with it.

**Files:**
- Modify: `package.json`, `package-lock.json` (version), `src/relay-view.ts` (`RELAY_VERSION = '0.2.3'`), `README.md` (install and update lines `0.2.2` → `0.2.3`)

- [ ] **Step 1:** Change the four places. Run the four checks; `tests/plugin.test.ts` keeps `RELAY_VERSION` equal to `package.json`. Expected: all pass.
- [ ] **Step 2:** Commit → `0.2.3: the cache time OpenCode lists`, then push after `git log origin/main..HEAD`.
- [ ] **Step 3:** Give the owner the commands to publish (`npm publish`, `git tag v0.2.3`, `git push origin v0.2.3`, `gh release create v0.2.3`). Updating their own OpenCode to 0.2.3 is a separate yes.
