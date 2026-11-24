import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { UsageDay, UsageRecord, UsageTotal } from '../src/usage-log.js';
import { chartOf, rangeOf, recordCells, refreshLimit, sortTotals } from '../src/usage-view.js';

// The Relay usage tab's sums and texts (docs/superpowers/specs/2026-11-24-relay-usage-tab-design.md). The panel only draws these.
const day = (date: string, models: [string, string | null, number, number][]): UsageDay => ({ day: date, models: models.map(([model, cost, tokens, requests]) => ({ model, cost, tokens, requests })) });
const record = (extra: Partial<UsageRecord> = {}): UsageRecord => ({
  at: '2026-11-24T15:30:00.000Z', sessionID: 'ses_0123456789abcdef', messageID: 'm1', project: 'C:\\Users\\someone\\work\\app', kind: 'chat', agent: 'build', model: 'opencode-go/kimi-k3.1-pro',
  requests: 3, input: 1000, output: 200, reasoning: 50, cacheRead: 4000, cacheWrite: 0, costByPrice: '0.12', openCodeUsd: '0', pricesFrom: 'opencode', relay: null, ...extra,
});
const total = (model: string, cost: string | null, extra: Partial<UsageTotal> = {}): UsageTotal => ({ model, replies: 1, requests: 1, input: 1, output: 1, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost, aaPriced: false, ...extra });

test('today runs from local midnight to now; 7 days starts six midnights earlier', () => {
  const now = new Date(2026, 10, 24, 15, 30);
  assert.deepEqual(rangeOf('today', now), { from: new Date(2026, 10, 24).toISOString(), to: now.toISOString(), tzOffsetMinutes: -now.getTimezoneOffset() });
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
  assert.match(chartOf([day('2026-11-24', [['p/a', '0.1', 1500, 2]])], 'tokens').bars[0].title, /p\/a 1,500 tokens/);
});

test('an empty range gives empty bars, not an error', () => {
  assert.deepEqual(chartOf([], 'cost'), { bars: [], legend: [], max: 0 });
  const { bars, max } = chartOf([day('2026-11-23', []), day('2026-11-24', [])], 'tokens');
  assert.deepEqual([bars.map(bar => [bar.day, bar.total, bar.parts.length, bar.title]), max], [[['2026-11-23', 0, 0, '2026-11-23: no use'], ['2026-11-24', 0, 0, '2026-11-24: no use']], 0]);
});

test('a record shows the folder name, a short chat id, its Relay part or off, and its cost with * at Artificial Analysis prices', () => {
  const plain = recordCells(record());
  assert.deepEqual([plain.project, plain.chat, plain.kind, plain.mode, plain.model, plain.relay, plain.cost], ['app', 'abcdef', 'chat', 'build', 'opencode-go/kimi-k3.1-pro', 'off', '$0.12']);
  assert.equal(plain.tokens, '5,000 in · 250 out', 'in counts what was read new and from a cache; out counts reasoning too');
  const placed = recordCells(record({ relay: { mode: 'execute', note: 'small work, so the cheapest' }, costByPrice: '0.5', pricesFrom: 'artificial-analysis', project: '/home/someone/site' }));
  assert.deepEqual([placed.project, placed.mode, placed.relay, placed.cost], ['site', 'execute', 'execute: small work, so the cheapest', '$0.5*']);
  assert.equal(recordCells(record({ costByPrice: null, openCodeUsd: '0' })).cost, 'not listed');
  assert.equal(recordCells(record({ model: null, agent: null })).model, 'unknown model');
});

test('sorting by cost uses the USD amounts exactly', () => {
  const totals = [total('p/a', '0.25'), total('p/b', null), total('p/c', '1'), total('p/d', '0.3')];
  assert.deepEqual(sortTotals(totals, 'cost', true).map(item => item.model), ['p/c', 'p/d', 'p/a', 'p/b']);
  assert.deepEqual(sortTotals(totals, 'model', false).map(item => item.model), ['p/a', 'p/b', 'p/c', 'p/d']);
  assert.deepEqual(sortTotals([total('p/x', null, { requests: 5 }), total('p/y', null, { requests: 9 })], 'requests', true).map(item => item.model), ['p/y', 'p/x']);
});

test('a refresh asks for as many rows as are shown, up to 200, so Show more is kept', () => {
  assert.deepEqual([refreshLimit(0), refreshLimit(30), refreshLimit(150), refreshLimit(260)], [50, 50, 150, 200]);
});
