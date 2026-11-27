import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatUsd, parseUsd } from '../src/costs.js';
import type { Prices } from '../src/relay-store.js';
import { switchingOf } from '../src/switching.js';
import { priceTotal, type RelayPart, type UsageRecord } from '../src/usage-log.js';

// The switching sums (docs/superpowers/specs/2026-11-26-relay-switch-savings-design.md, sections 2 to 4).

const price = (input: string, output: string, read: string, write: string): Prices => ({ inputPerMillion: input, outputPerMillion: output, cacheReadPerMillion: read, cacheWritePerMillion: write });
const PRICES: Record<string, Prices> = { 'p/big': price('4', '20', '0.2', '5'), 'p/cheap': price('2', '10', '0.1', '2.5'), 'p/plan': price('10', '30', '1', '12.5') };
const priceOf = (model: string) => PRICES[model] ?? null;
const dayOf = (at: string) => at.slice(0, 10);
type Tokens = Partial<Pick<UsageRecord, 'input' | 'output' | 'reasoning' | 'cacheRead' | 'cacheWrite'>>;
let seq = 0;
function rec(at: string, sessionID: string, model: string, tokens: Tokens, relay?: Partial<RelayPart>): UsageRecord {
  const counts = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, ...tokens };
  return {
    at, sessionID, messageID: `m${seq++}`, project: '/repo', kind: 'chat', agent: 'build', model, requests: 1, ...counts,
    costByPrice: priceTotal(counts, priceOf(model)), openCodeUsd: null, pricesFrom: priceOf(model) ? 'opencode' : null,
    relay: relay ? { mode: 'execute', note: null, from: null, start: null, deciderUsd: null, ...relay } : null,
  };
}
const days = ['2026-11-20', '2026-11-21', '2026-11-22'];
const sums = (all: UsageRecord[], kept = all, plan: string | null = null) => switchingOf(all, kept, { plan, priceOf, dayOf, days });
/** A chat that starts on p/big and is moved to p/cheap: $0.004, then $2, then $0.1. */
const moved = (decider = '0') => [
  rec('2026-11-20T10:00:00.000Z', 'ses-1', 'p/big', { input: 1_000 }),
  rec('2026-11-20T11:00:00.000Z', 'ses-1', 'p/cheap', { input: 1_000_000 }, { from: 'p/big', start: 'p/big', deciderUsd: decider }),
  rec('2026-11-21T12:00:00.000Z', 'ses-1', 'p/cheap', { cacheRead: 1_000_000 }, { from: 'p/cheap', start: 'p/big' }),
];

test('a switch is counted for the model it went to, and the chat is compared from that reply on', () => {
  const view = sums(moved()).default;
  assert.equal(view.model, null);
  assert.deepEqual(view.switches, [{ model: 'p/cheap', count: 1 }]);
  // r2 at p/big: 999,000 in + 1,000 from cache = $3.9962; r3: 1M from cache = $0.2.
  assert.deepEqual([view.spent, view.without, view.chats, view.notCompared, view.leftOut, view.deciderUsd], ['2.104', '4.2002', 1, 0, 0, '0']);
});

test('the Plan view prices the same replies at the Plan model', () => {
  const all = moved(), view = sums(all, all, 'p/plan').plan!;
  assert.equal(view.model, 'p/plan');
  const at = (tokens: number, perMillion: string) => BigInt(tokens) * parseUsd(perMillion) / 1_000_000n;
  const expected = parseUsd('0.004') + at(999_000, '10') + at(1_000, '1') + at(1_000_000, '1');
  assert.equal(view.without, formatUsd(expected));
  assert.equal(sums(moved()).plan, null, 'no Plan model, no Plan view');
});

test("a switch's cache writes and input, up to the last prompt, count as cache reads on the other side", () => {
  const view = sums([
    rec('2026-11-20T10:00:00.000Z', 'ses-1', 'p/big', { input: 10_000 }),
    rec('2026-11-20T11:00:00.000Z', 'ses-1', 'p/cheap', { input: 2_000, cacheWrite: 8_000 }, { from: 'p/big', start: 'p/big' }),
  ]).default;
  // r1 $0.04 stays; r2 is 10,000 cache reads at p/big = $0.002.
  assert.equal(view.without, '0.042');
});

test('older history: a model change under a Relay part is a switch, and the last reply before Relay is the default', () => {
  const view = sums([
    rec('2026-11-20T10:00:00.000Z', 'ses-1', 'p/big', { input: 1_000 }),
    rec('2026-11-20T11:00:00.000Z', 'ses-1', 'p/cheap', { output: 1_000 }, { from: null, start: null }),
  ]).default;
  assert.deepEqual([view.switches, view.chats], [[{ model: 'p/cheap', count: 1 }], 1]);
  assert.equal(view.without, '0.024', 'r1 $0.004, r2 1,000 out at p/big = $0.02');
});

test('a chat with no start and no reply before Relay is not compared by default, but is by Plan', () => {
  const all = [rec('2026-11-20T11:00:00.000Z', 'ses-1', 'p/cheap', { input: 1_000 }, { from: 'p/big', start: null })];
  const { default: plain, plan } = sums(all, all, 'p/plan');
  assert.deepEqual([plain.notCompared, plain.chats, plain.without], [1, 0, plain.spent]);
  assert.deepEqual([plan!.chats, plan!.without], [1, '0.01']);
});

test('a model changed by hand before a Relay message that kept it is not a switch', () => {
  const view = sums([
    rec('2026-11-20T10:00:00.000Z', 'ses-1', 'p/big', { input: 1_000 }),
    rec('2026-11-20T11:00:00.000Z', 'ses-1', 'p/cheap', { input: 1_000 }, { from: 'p/cheap' }),
  ]).default;
  assert.deepEqual([view.switches, view.chats, view.without], [[], 0, view.spent]);
});

test('a move between efforts of one model is a switch to that effort', () => {
  const view = sums([
    rec('2026-11-20T10:00:00.000Z', 'ses-1', 'p/big', { input: 1_000 }),
    rec('2026-11-20T11:00:00.000Z', 'ses-1', 'p/big#high', { input: 1_000 }, { from: 'p/big', start: 'p/big' }),
  ]).default;
  assert.deepEqual(view.switches, [{ model: 'p/big#high', count: 1 }]);
});

test('a chat moved before the range starts is compared from its first record that carries start', () => {
  const view = sums([rec('2026-11-20T10:00:00.000Z', 'ses-1', 'p/cheap', { input: 1_000 }, { from: 'p/cheap', start: 'p/big' })]).default;
  assert.deepEqual([view.switches, view.chats, view.spent, view.without], [[], 1, '0.002', '0.004']);
});

test('a comparison model no list prices leaves its replies out and counts them', () => {
  const view = sums([
    rec('2026-11-20T10:00:00.000Z', 'ses-1', 'p/cheap', { input: 1_000 }, { from: 'x/unknown', start: 'x/unknown', deciderUsd: '0.01' }),
    rec('2026-11-20T11:00:00.000Z', 'ses-1', 'p/cheap', { input: 1_000 }, { from: 'p/cheap', start: 'x/unknown' }),
  ]).default;
  assert.equal(view.leftOut, 2);
  assert.equal(view.without, formatUsd(parseUsd(view.spent) - parseUsd('0.01')));
});

test("the decider's cost is spent, and comes off the saving", () => {
  const view = sums(moved('0.01')).default;
  assert.deepEqual([view.spent, view.without, view.deciderUsd], ['2.114', '4.2002', '0.01']);
});

test("filters change the sums but not a chat's comparison model", () => {
  const all = moved(), view = sums(all, all.slice(1)).default;
  // r2 still compares at p/big, with r1's prompt as its cache.
  assert.deepEqual([view.spent, view.without, view.switches], ['2.1', '4.1962', [{ model: 'p/cheap', count: 1 }]]);
});

test('every day of the range is listed, with its own spent and without', () => {
  assert.deepEqual(sums(moved()).default.days, [
    { day: '2026-11-20', spent: '2.004', without: '4.0002' },
    { day: '2026-11-21', spent: '0.1', without: '0.2' },
    { day: '2026-11-22', spent: '0', without: '0' },
  ]);
});

test('switches: most first, then by name', () => {
  const chat = (id: string, to: string) => [rec('2026-11-20T10:00:00.000Z', id, 'p/big', { input: 1 }), rec('2026-11-20T11:00:00.000Z', id, to, { input: 1 }, { from: 'p/big', start: 'p/big' })];
  assert.deepEqual(sums([...chat('a', 'p/plan'), ...chat('b', 'p/cheap'), ...chat('c', 'p/plan')]).default.switches, [{ model: 'p/plan', count: 2 }, { model: 'p/cheap', count: 1 }]);
});

test('30,000 records add up within two seconds', () => {
  const all: UsageRecord[] = [];
  for (let chat = 0; chat < 1_000; chat++) for (let at = 0; at < 30; at++) {
    const time = new Date(Date.parse('2026-11-20T00:00:00.000Z') + at * 60_000).toISOString();
    all.push(rec(time, `ses-${chat}`, at % 3 ? 'p/cheap' : 'p/big', { input: 1_000, cacheRead: 5_000 }, at ? { from: at % 3 === 1 ? 'p/big' : 'p/cheap', start: 'p/big' } : undefined));
  }
  const began = performance.now(), result = sums(all, all, 'p/plan');
  assert.ok(performance.now() - began < 2_000, `took ${Math.round(performance.now() - began)} ms`);
  assert.equal(result.default.chats, 1_000);
});

test('a comparison model with no cache price leaves out the replies whose cache it would have to price', () => {
  const noCache: Prices = { inputPerMillion: '10', outputPerMillion: '30', cacheReadPerMillion: null, cacheWritePerMillion: null };
  const priced = (model: string) => model === 'p/nocache' ? noCache : priceOf(model);
  const all = [
    rec('2026-11-20T10:00:00.000Z', 'ses-1', 'p/cheap', { input: 1_000 }, { from: 'p/nocache', start: 'p/nocache' }),
    rec('2026-11-20T11:00:00.000Z', 'ses-1', 'p/cheap', { input: 1_000, cacheRead: 100_000 }, { from: 'p/cheap', start: 'p/nocache' }),
  ];
  const view = switchingOf(all, all, { plan: null, priceOf: priced, dayOf, days }).default;
  // r1 (input only) compares at $0.01; r2's cache reads have no price there, so it is left out instead of counting them as $0.
  assert.equal(view.leftOut, 1);
  assert.equal(view.without, formatUsd(parseUsd('0.01') + parseUsd(all[1]!.costByPrice!)));
});
