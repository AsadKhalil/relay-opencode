import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { UsageDay, UsageTotal } from '../src/usage-log.js';
import type { SwitchingView } from '../src/switching.js';
import { chartOf, dayLabels, money, rangeOf, savedOf, savingsChart, scaleLabel, short, switchRows, totalCells } from '../src/usage-view.js';

// The Relay usage tab's sums and texts (docs/superpowers/specs/2026-11-24-relay-usage-tab-design.md). The panel only draws these.
const day = (date: string, models: [string, string | null, number, number][]): UsageDay => ({ day: date, models: models.map(([model, cost, tokens, requests]) => ({ model, cost, tokens, requests })) });
const total = (model: string, cost: string | null, extra: Partial<UsageTotal> = {}): UsageTotal => ({ model, replies: 1, requests: 1, input: 1, output: 1, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost, aaPriced: false, unpriced: 0, ...extra });

test('today runs from local midnight to now; 7 days starts six midnights earlier', () => {
  const now = new Date(2026, 10, 24, 15, 30);
  assert.deepEqual(rangeOf('today', now), { from: new Date(2026, 10, 24).toISOString(), to: now.toISOString(), tzOffsetMinutes: -now.getTimezoneOffset(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  assert.equal(rangeOf('7d', now).from, new Date(2026, 10, 18).toISOString());
  assert.equal(rangeOf('90d', now).from, new Date(2026, 7, 27).toISOString());
});

test('the chart keeps the five largest models and puts the rest in other, with one colour each', () => {
  const models = Array.from({ length: 7 }, (_, n): [string, string, number, number] => [`p/m${n}`, `0.${n + 1}`, 10 * (n + 1), 1]);
  const { bars, legend, max } = chartOf([day('2026-11-24', models)], 'cost');
  assert.deepEqual(legend.map(item => item.model), ['p/m6', 'p/m5', 'p/m4', 'p/m3', 'p/m2', 'other']);
  assert.equal(new Set(legend.map(item => item.color)).size, 6);
  assert.deepEqual(bars[0].parts.map(part => part.model), ['p/m6', 'p/m5', 'p/m4', 'p/m3', 'p/m2', 'other']);
  assert.equal(bars[0].parts.at(-1)!.value, 300_000, 'other holds $0.1 + $0.2, in millionths of a dollar');
  assert.equal(max, bars[0].total);
  assert.deepEqual(chartOf([day('2026-11-24', models)], 'requests').bars[0].total, 7);
});

test("a bar's title names the day and each model's share", () => {
  const { bars } = chartOf([day('2026-11-24', [['p/a', '0.1', 100, 2], ['p/b', null, 50, 1]])], 'cost');
  assert.match(bars[0].title, /^2026-11-24: /);
  assert.match(bars[0].title, /p\/a \$0\.1/);
  assert.match(bars[0].title, /p\/b no price/);
  assert.match(chartOf([day('2026-11-24', [['p/a', '0.1', 1500, 2]])], 'tokens').bars[0].title, /p\/a 1\.5K tokens/);
});

test('an empty range gives empty bars, not an error', () => {
  assert.deepEqual(chartOf([], 'cost'), { bars: [], legend: [], max: 0 });
  const { bars, max } = chartOf([day('2026-11-23', []), day('2026-11-24', [])], 'tokens');
  assert.deepEqual([bars.map(bar => [bar.day, bar.total, bar.parts.length, bar.title]), max], [[['2026-11-23', 0, 0, '2026-11-23: no use'], ['2026-11-24', 0, 0, '2026-11-24: no use']], 0]);
});

// The fix of 24 Nov (docs/superpowers/specs/2026-11-24-relay-usage-tab-fix-design.md): numbers a person can read at a glance.
test('money: cents from $0.10 up, two significant digits below, rounded exactly', () => {
  assert.deepEqual(['0.421317', '12.4', '1234.5', '0.068869', '0.0021', '0.0999', '0.05', '0.000001', '0.000000000001', '0'].map(money),
    ['$0.42', '$12.40', '$1,234.50', '$0.069', '$0.0021', '$0.10', '$0.05', '$0.000001', '$0.000000000001', '$0']);
  assert.equal(money(null), 'no price');
});

test('counts are short: 950, 15.8K, 2.3M', () => {
  assert.deepEqual([950, 15_813, 2_254_000, 0].map(short), ['950', '15.8K', '2.3M', '0']);
});

test("the chart's scale names the tallest bar's value; cost comes in millionths of a dollar", () => {
  assert.deepEqual([scaleLabel('cost', 90_000), scaleLabel('tokens', 1_234_567), scaleLabel('requests', 57), scaleLabel('cost', 0)], ['$0.09', '1.2M', '57', '$0']);
});

test('day names: a weekday and date for up to ten days, else the first, middle and last dates only', () => {
  const week = Array.from({ length: 7 }, (_, n) => `2026-11-${18 + n}`);
  assert.deepEqual(dayLabels(week), ['We 18', 'Th 19', 'Fr 20', 'Sa 21', 'Su 22', 'Mo 23', 'Tu 24']);
  const month = Array.from({ length: 30 }, (_, n) => new Date(Date.UTC(2026, 9, 26 + n)).toISOString().slice(0, 10));
  const labels = dayLabels(month);
  assert.equal(labels.length, 30);
  assert.deepEqual(labels.filter(Boolean), ['26 Oct', '10 Nov', '24 Nov']);
  assert.deepEqual(dayLabels([]), []);
});

test("a model's row: its name and cost, then provider, replies and all its tokens", () => {
  const kimi = totalCells(total('opencode-go/kimi-k3.1-pro', '0.352448', { replies: 28, requests: 84, input: 72_291, output: 73_303, reasoning: 1_000, cacheRead: 838_760, cacheWrite: 0 }));
  assert.deepEqual(kimi, { name: 'kimi-k3.1-pro', provider: 'opencode-go', cost: '$0.35', tokens: '985.4K', detail: 'opencode-go · 28 replies · 985.4K tokens' });
  assert.equal(totalCells(total('claude-agent/claude-sonnet-5-5', null)).cost, 'no price');
  assert.equal(totalCells(total('p/part', '0.21', { replies: 10, unpriced: 4 })).detail, 'p · 10 replies · 2 tokens · 4 without a price', 'a cost of only some replies says so');
  assert.equal(totalCells(total('p/none', null, { replies: 3, unpriced: 3 })).detail, 'p · 3 replies · 2 tokens', 'no price at all is said by the cost');
  assert.equal(totalCells(total('p/aa', '0.2', { aaPriced: true })).cost, '$0.20*');
  assert.deepEqual(totalCells(total('bare', '0.1')), { name: 'bare', provider: '', cost: '$0.10', tokens: '2', detail: '1 reply · 2 tokens' });
});

// The switching plate (docs/superpowers/specs/2026-11-26-relay-switch-savings-design.md, section 5).
const switching = (extra: Partial<SwitchingView> = {}): SwitchingView => ({ model: null, switches: [{ model: 'p/cheap', count: 1 }], spent: '0', without: '0', days: [], chats: 1, notCompared: 0, leftOut: 0, deciderUsd: '0', ...extra });

test('saved is without switching less spent, with its percent', () => {
  assert.deepEqual(savedOf(switching({ spent: '2.104', without: '4.2002' })), { amount: '$2.10', more: false, percent: 50 });
});

test('a switching that cost more says so', () => {
  assert.deepEqual(savedOf(switching({ spent: '1', without: '0.8' })), { amount: '$0.20', more: true, percent: -25 });
});

test('nothing moved, or nothing to compare, has no percent', () => {
  assert.deepEqual(savedOf(switching({ switches: [], spent: '0.5', without: '0.5' })), { amount: '$0', more: false, percent: null });
  assert.deepEqual(savedOf(switching({ spent: '0', without: '0' })), { amount: '$0', more: false, percent: null });
});

test("each day's bar has spent inside without, and says what was saved", () => {
  const chart = savingsChart(switching({ days: [{ day: '2026-11-20', spent: '0.12', without: '0.18' }, { day: '2026-11-21', spent: '0.3', without: '0.25' }, { day: '2026-11-22', spent: '0', without: '0' }] }));
  assert.deepEqual(chart.bars.map(bar => [bar.spent, bar.without]), [[120_000, 180_000], [300_000, 250_000], [0, 0]]);
  assert.equal(chart.max, 300_000);
  assert.equal(chart.bars[0]!.title, '2026-11-20: spent $0.12, without switching $0.18, saved $0.06');
  assert.equal(chart.bars[1]!.title, '2026-11-21: spent $0.30, without switching $0.25, $0.05 more');
});

test('switch rows: most first, five colours, the rest as other', () => {
  const switches = [9, 5, 4, 3, 2, 2, 1].map((count, at) => ({ model: `p/m${at}`, count }));
  const rows = switchRows(switching({ switches }));
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.map(row => [row.name, row.count, row.color]), [['m0', 9, 'var(--rl-s1)'], ['m1', 5, 'var(--rl-s2)'], ['m2', 4, 'var(--rl-s3)'], ['m3', 3, 'var(--rl-s4)'], ['m4', 2, 'var(--rl-s5)'], ['other', 3, 'var(--rl-s0)']]);
  assert.deepEqual([rows[0]!.share, rows[1]!.share], [1, 5 / 9]);
});
