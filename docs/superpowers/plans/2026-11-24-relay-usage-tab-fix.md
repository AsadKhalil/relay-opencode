# Relay usage tab fix: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dollars and tokens readable at a glance in the Relay usage tab, at any window height, with no sideways scrolling.

**Architecture:** the numbers' texts are helpers in `src/usage-view.ts` (unit-tested); the layout is `src/gui-usage.tsx`; the styles are `src/gui-styles.ts`. The server, `getUsageLog` and the contract do not change.

**Tech Stack:** TypeScript (ESM), Solid, node:test through tsx, Vite.

**Spec:** `docs/superpowers/specs/2026-11-24-relay-usage-tab-fix-design.md`

## Global Constraints

- Money is USD strings, rounded with bigint (`parseUsd`, `formatUsd` in `src/costs.ts`). Floats only for bar heights.
- The panel bundles `usage-view.ts` and `gui-usage.tsx`: nothing they import may come from `node:`.
- CRLF line endings in `src/`, `tests/` and `docs/`.
- No change to `getUsageLog`, `src/usage-log.ts` or `src/contract.ts`.

## Review Focus

1. A model with no price shows "no price", never "$0", and Spent says how many replies it leaves out.
2. Amounts at the edges: $0.000001, $0.0999 (rounds to $0.10), $1,234.50.
3. The chart with one day (Today) and with 90 days: bar widths and labels.
4. A long model name or Relay note wraps or ends in an ellipsis; it never widens the panel.
5. The main Relay panel after the `.rl-body` change: its model table still scrolls inside its own box.

---

### Task 1: The numbers' texts

**Files:** modify `src/usage-view.ts`; test `tests/usage-view.test.ts`.

**Interfaces (produces):**
- `money(usd: string | null): string`: `'no price'` for null; `'$0'` for 0; cents from $0.10 up with thousands commas; two significant digits below, trailing zeros trimmed to at least two decimals.
- `short(count: number): string`: `Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })`.
- `scaleLabel(metric: Metric, max: number): string`: the chart's top value; `max` is millionths of a dollar for cost.
- `dayLabels(days: readonly string[]): string[]`: `'We 18'` for each day up to ten days; beyond, `'18 Nov'` for the first, middle and last, and `''` elsewhere.
- `totalCells(total: UsageTotal): { name: string; provider: string; cost: string; tokens: string; detail: string }`.
- `recordCells(record)` keeps its fields; `tokens` reads `'5K in · 250 out'` (in = input, cache read and cache write; out = output and reasoning) and `cost` uses `money`. `chartOf`'s titles use `money` and `short`.

- [ ] **Step 1: Write the failing tests**: money (`null`→`no price`, `'0'`→`$0`, `'0.421317'`→`$0.42`, `'12.4'`→`$12.40`, `'1234.5'`→`$1,234.50`, `'0.068869'`→`$0.069`, `'0.0021'`→`$0.0021`, `'0.0999'`→`$0.10`, `'0.05'`→`$0.05`, `'0.000001'`→`$0.000001`); short (950, 15,813, 2,254,000 → `950`, `15.8K`, `2.3M`); scaleLabel (`cost` 90,000 → `$0.09`, `tokens` 1,234,567 → `1.2M`, `requests` 57 → `57`); dayLabels (seven days from 2026-11-18 → `We 18` … `Tu 24`; 30 days → three dates); totalCells (`opencode-go/kimi-k3.1-pro` → name `kimi-k3.1-pro`, provider `opencode-go`); recordCells' new tokens and cost.
- [ ] **Step 2:** `npx tsx --test tests/usage-view.test.ts`. Expected: the new tests FAIL (not exported).
- [ ] **Step 3:** Implement the helpers in `src/usage-view.ts`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `Usage tab: money, short counts and chart labels for the fix`.

### Task 2: Styles that cannot hide the numbers

**Files:** modify `src/gui-styles.ts`; test `tests/usage-view.test.ts` (or a new `tests/gui-styles.test.ts`).

- [ ] **Step 1: Write the failing tests**: no class selector is defined twice at the top level of `panelCss` (it fails today on `.rl-row`); `.rl-body` sets `grid-auto-rows:max-content`.
- [ ] **Step 2:** Run them. Expected: FAIL on `.rl-row` and on `.rl-body`.
- [ ] **Step 3:** Add `grid-auto-rows:max-content` to `.rl-body`, remove `.rl-row{cursor:pointer}`, `.rl-grid` and `.rl-sort`, and add the classes Task 3 uses: tiles, lists of two-line rows, the chart's scale and day names.
- [ ] **Step 4:** Run them. Expected: PASS. Check red then green: put the duplicate back, see the test fail, remove it.
- [ ] **Step 5:** Commit `Panel styles: rows take their content's height; a class is defined once`.

### Task 3: The tab's layout

**Files:** modify `src/gui-usage.tsx`.

**Interfaces (consumes):** Task 1's helpers, Task 2's classes.

- [ ] **Step 1:** Lay the tab out as the spec's mockup: header with Refresh, ranges, tiles, chart card, By model rows (buttons), search and folded Filters with a count and Clear, Records rows, Show more, footer.
- [ ] **Step 2:** `npm run typecheck` and `npm run build`. Expected: both pass.
- [ ] **Step 3:** Render the real component with test data in a browser page (420 px wide; 720 and 1,000 px tall; also Today and 90 days). Expected: Spent and Tokens visible at once; every model's and record's cost visible without sideways scrolling; nothing collapses.
- [ ] **Step 4:** Commit `The usage tab shows its numbers: tiles, labelled chart, two-line rows, folded filters`.

### Task 4: Docs, checks, review, install

- [ ] **Step 1:** Update `docs/guide.md` (Relay usage), `docs/status.md` and `docs/implementation-progress.md`.
- [ ] **Step 2:** The four checks fresh (`npm run typecheck`, `npm test`, `npm run build`, `node scripts/check-package.mjs`) and the smoke. Expected: all pass; report the counts.
- [ ] **Step 3:** Final review of the branch by a fresh reviewer; fix Critical and Important, each red then green.
- [ ] **Step 4:** Merge into local main, install in the owner's copy (owner's yes, 24 Nov), record it in `docs/compatibility.md`, then the rest of the Go run.
