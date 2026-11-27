import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUsd } from '../src/costs.js';
import { decisionsOf, type Decision } from '../src/relay-store.js';
import { pricesOf } from '../src/standings.js';
import type { IndexTable } from '../src/intelligence.js';
import { buildRecords, grown, priceFromList, KEEP_DAYS, LOG_PREFIX, logKey, pruneRecords, readRecords, saveRecords, shownCost, summarize, usageQueryOf, type LogStore, type UsageQuery, type UsageRecord } from '../src/usage-log.js';

// Usage records (docs/superpowers/specs/2026-11-24-relay-usage-tab-design.md). Messages are shaped as OpenCode 2.3 gives them from `session.context`.
const user = (id: string, created: number) => ({ id, type: 'user', time: { created }, text: 'never read' });
const answer = (id: string, created: number, tokens: { input: number; output?: number; reasoning?: number; read?: number }, extra: object = {}) => ({
  id, type: 'assistant', agent: 'build', finish: 'stop', cost: 0.01, model: { id: 'big', providerID: 'p', variant: 'default' }, time: { created, completed: created + 100 },
  tokens: { input: tokens.input, output: tokens.output ?? 0, reasoning: tokens.reasoning ?? 0, cache: { read: tokens.read ?? 0, write: 0 } }, ...extra,
});
const summary = (id: string, created: number) => ({ id, type: 'compaction', status: 'completed', reason: 'auto', time: { created }, model: { id: 'big', providerID: 'p', variant: 'default' }, cost: 0.008, tokens: { input: 495, output: 5, reasoning: 0, cache: { read: 0, write: 0 } } });
const chat = { sessionID: 'ses-1', project: 'C:/work/app', helper: false }, noPrices = { models: null, borrowed: null };
const decision = (messageID: string, extra: Partial<Decision> = {}): Decision => ({ at: '2026-11-24T00:00:00.000Z', sessionID: 'ses-1', kind: 'chat', mode: 'execute', confidence: 0.9, fit: null, model: 'p/big', ms: 10, costUsd: null, note: 'small work, so the cheapest', messageID, reply: null, from: null, start: null, ...extra });
const iso = (ms: number) => new Date(ms).toISOString();

/** Plugin storage in memory: keys in order, `limit` a page, and `next` to go on from. */
function memoryStore(pageSize = 100) {
  const data = new Map<string, unknown>();
  const store: LogStore = {
    async get(key) { return structuredClone(data.get(key)); },
    async set(key, value) { data.set(key, structuredClone(value)); },
    async remove(key) { data.delete(key); },
    async scan({ prefix, after, limit }) {
      const keys = [...data.keys()].filter(key => key.startsWith(prefix) && (after === undefined || key > after)).sort();
      const page = keys.slice(0, Math.min(limit ?? pageSize, pageSize));
      return { entries: page.map(key => ({ key, value: structuredClone(data.get(key)) })), ...(keys.length > page.length ? { next: page.at(-1) } : {}) };
    },
  };
  return { data, store };
}
const record = (at: number, extra: Partial<UsageRecord> = {}): UsageRecord => ({
  at: iso(at), sessionID: 'ses-1', messageID: `m${at}`, project: 'C:/work/app', kind: 'chat', agent: 'build', model: 'p/big', requests: 2, input: 100, output: 10, reasoning: 0,
  cacheRead: 0, cacheWrite: 0, costByPrice: null, openCodeUsd: '0.02', pricesFrom: null, relay: null, ...extra,
});

test('a record holds the counts, the agent, the model and no text', () => {
  const [made, ...more] = buildRecords([user('m1', 1000), answer('a1', 1100, { input: 100, output: 10 }), answer('a2', 1200, { input: 50, output: 5 })], chat, noPrices, []);
  assert.equal(more.length, 0);
  assert.deepEqual(made, { at: iso(1000), sessionID: 'ses-1', messageID: 'm1', project: 'C:/work/app', kind: 'chat', agent: 'build', model: 'p/big', requests: 2, input: 150, output: 15, reasoning: 0, cacheRead: 0, cacheWrite: 0, costByPrice: null, openCodeUsd: '0.02', pricesFrom: null, relay: null });
  assert.equal(JSON.stringify(made).includes('never read'), false);
});

test('a reply with a price has its cost by price; output is priced with its reasoning', () => {
  const models = [{ providerID: 'p', id: 'big', name: 'big', cost: { inputPerMillion: '1', outputPerMillion: '4', cacheReadPerMillion: null, cacheWritePerMillion: null, steps: [] } }] as never;
  const [made] = buildRecords([user('m1', 1000), answer('a1', 1100, { input: 1_000_000, output: 500_000, reasoning: 500_000 })], chat, { models, borrowed: null }, []);
  assert.equal(parseUsd(made.costByPrice!), parseUsd('5'));
  assert.equal(made.pricesFrom, 'opencode');
});

test('a Relay record names the message: its mode and note go with it', () => {
  const messages = [user('m1', 1000), answer('a1', 1100, { input: 10 }), user('m2', 2000), answer('a2', 2100, { input: 20 })];
  const [first, second] = buildRecords(messages, chat, noPrices, [decision('m1', { from: 'p/usual', start: 'p/usual', costUsd: '0.0001' })]);
  assert.deepEqual(first.relay, { mode: 'execute', note: 'small work, so the cheapest', from: 'p/usual', start: 'p/usual', deciderUsd: '0.0001' });
  assert.equal(second.relay, null, 'a message Relay did not place has no Relay part');
});

test('a helper chat makes helper records; a finished compaction makes a summary record', () => {
  const [helper] = buildRecords([user('m1', 1000), answer('a1', 1100, { input: 10 })], { ...chat, helper: true }, noPrices, []);
  assert.equal(helper.kind, 'helper');
  const [made] = buildRecords([summary('c1', 3000), answer('a3', 3100, { input: 300 })], chat, noPrices, []);
  assert.deepEqual([made.kind, made.agent, made.messageID, made.requests, made.input], ['summary', 'compaction', 'c1', 2, 795]);
});

test('only the newest three messages make records, and one with no counts makes none', () => {
  const long = Array.from({ length: 50 }, (_, at) => [user(`u${at}`, 1000 + at * 10), answer(`r${at}`, 1005 + at * 10, { input: 10 })]).flat();
  assert.deepEqual(buildRecords(long, chat, noPrices, []).map(made => made.messageID), ['u47', 'u48', 'u49']);
  assert.deepEqual(buildRecords([user('m1', 1000), { ...answer('a1', 1100, { input: 1 }), tokens: undefined }], chat, noPrices, []), [], 'a stopped answer');
});

test('the key sorts by time', () => {
  const early = record(1_000), late = record(1_001);
  assert.ok(logKey(early).startsWith(LOG_PREFIX));
  assert.deepEqual([logKey(late), logKey(early)].sort(), [logKey(early), logKey(late)]);
});

test('a record grows when the reply has more requests or a Relay part appears, and never shrinks', () => {
  const base = record(1000), relay = { mode: 'plan' as const, note: null, from: null, start: null, deciderUsd: null };
  assert.deepEqual(grown(null, base), base);
  assert.equal(grown(base, base), null, 'nothing new');
  assert.deepEqual(grown({ ...base, relay }, { ...base, requests: 3, input: 200 }), { ...base, requests: 3, input: 200, relay }, 'more requests, and the old Relay part stays');
  assert.equal(grown(base, { ...base, requests: 1, input: 50 }), null, 'never fewer');
  assert.deepEqual(grown(base, { ...base, input: 1, relay }), { ...base, relay }, 'a late Relay part is added to the counts already kept');
});

test('two windows saving the same record end with the larger one', async () => {
  const { store } = memoryStore(), larger = record(1000, { requests: 4, input: 400 }), smaller = record(1000, { requests: 2, input: 100 });
  await saveRecords(store, [larger]);
  await saveRecords(store, [smaller]);
  assert.deepEqual(await store.get(logKey(larger)), larger);
});

test('records past 90 days are removed, 1,000 at most a call', async () => {
  const { data, store } = memoryStore(), now = Date.parse('2026-11-24T12:00:00Z'), day = 86_400_000;
  for (let at = 0; at < 1005; at++) { const old = record(now - (KEEP_DAYS + 1) * day - at); data.set(logKey(old), old); }
  for (const fresh of [record(now - day), record(now - 2 * day)]) data.set(logKey(fresh), fresh);
  assert.equal(await pruneRecords(store, now), 1000);
  assert.equal(await pruneRecords(store, now), 5);
  assert.equal(data.size, 2);
});

test('reading a range returns the records between from and to, over several pages', async () => {
  const { data, store } = memoryStore(2);
  for (const at of [1000, 2000, 3000, 4000, 5000]) data.set(logKey(record(at)), record(at));
  assert.deepEqual((await readRecords(store, iso(2000), iso(4000))).map(made => made.at), [iso(2000), iso(3000), iso(4000)]);
});

test('a stored value that is not a record is skipped', async () => {
  const { data, store } = memoryStore();
  data.set(`${LOG_PREFIX}${iso(2000)}/ses-1/bad`, { at: 5 });
  data.set(`${LOG_PREFIX}${iso(2500)}/ses-1/none`, null);
  data.set(logKey(record(3000)), record(3000));
  assert.deepEqual((await readRecords(store, iso(1000), iso(4000))).map(made => made.messageID), ['m3000']);
});

test('the Relay records of one chat are listed for the idle hook', async () => {
  const stored = [decision('m1'), decision('m2', { sessionID: 'ses-2' })];
  assert.deepEqual((await decisionsOf({ get: async () => structuredClone(stored) }, 'ses-1')).map(item => item.messageID), ['m1']);
});

// Adding up for the tab: what the panel shows for a range and its filters.
const query = (extra: Partial<UsageQuery> = {}): UsageQuery => ({ from: '2026-11-20T05:00:00.000Z', to: '2026-11-24T16:00:00.000Z', tzOffsetMinutes: -300, search: '', provider: null, effort: null, mode: null, relay: 'any', kind: 'any', project: null, timeZone: null, ...extra });
const at = (time: string, extra: Partial<UsageRecord> = {}) => record(Date.parse(time), extra);
const kimi = at('2026-11-23T15:00:00Z', { model: 'opencode-go/kimi-k3.1-pro', costByPrice: '0.1', relay: { mode: 'plan', note: null, from: null, start: null, deciderUsd: null } });
const flash = at('2026-11-23T16:00:00Z', { model: 'opencode-go/glm-5.3-flash#high', costByPrice: '0.2', agent: 'build', kind: 'helper', project: 'C:/work/other' });
const claude = at('2026-11-24T04:59:00Z', { model: 'claude-agent/sonnet', costByPrice: null, openCodeUsd: '0', pricesFrom: null });

test("the cost shown is the cost by price, else OpenCode's own when more than $0, else none", () => {
  assert.equal(shownCost(record(1, { costByPrice: '0.5', openCodeUsd: '0.7' })), '0.5');
  assert.equal(shownCost(record(1, { costByPrice: null, openCodeUsd: '0.7' })), '0.7');
  assert.equal(shownCost(record(1, { costByPrice: null, openCodeUsd: '0' })), null);
  assert.equal(shownCost(record(1, { costByPrice: null, openCodeUsd: null })), null);
});

test("days are counted in the panel's time zone", () => {
  const { days } = summarize([kimi, claude], query());
  assert.deepEqual(days.map(day => day.day), ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24'], 'every day of the range, empty ones too');
  assert.deepEqual(days.find(day => day.day === '2026-11-23')!.models.map(model => model.model).sort(), ['claude-agent/sonnet', 'opencode-go/kimi-k3.1-pro'], '04:59 UTC is 23:59 the day before at UTC-5');
  assert.deepEqual(days.find(day => day.day === '2026-11-24')!.models, []);
});

test('search matches part of the model, provider or id in any case', () => {
  assert.deepEqual(summarize([kimi, flash, claude], query({ search: 'KIMI' })).totals.map(item => item.model), ['opencode-go/kimi-k3.1-pro']);
  assert.equal(summarize([kimi, flash, claude], query({ search: 'opencode-go' })).matching, 2);
});

test('each filter narrows the records, totals and days alike', () => {
  const all = [kimi, flash, claude], models = (part: Partial<UsageQuery>) => summarize(all, query(part)).totals.map(total => total.model).sort();
  assert.deepEqual(models({ provider: 'opencode-go' }), ['opencode-go/glm-5.3-flash#high', 'opencode-go/kimi-k3.1-pro']);
  assert.deepEqual(models({ effort: 'high' }), ['opencode-go/glm-5.3-flash#high']);
  assert.deepEqual(models({ mode: 'plan' }), ['opencode-go/kimi-k3.1-pro'], "a placed message's mode");
  assert.deepEqual(models({ mode: 'build' }), ['claude-agent/sonnet', 'opencode-go/glm-5.3-flash#high'], 'else its agent');
  assert.deepEqual(models({ relay: 'on' }), ['opencode-go/kimi-k3.1-pro']);
  assert.deepEqual(models({ relay: 'off' }), ['claude-agent/sonnet', 'opencode-go/glm-5.3-flash#high']);
  assert.deepEqual(models({ kind: 'helper' }), ['opencode-go/glm-5.3-flash#high']);
  assert.deepEqual(models({ project: 'C:/work/other' }), ['opencode-go/glm-5.3-flash#high']);
  const day = summarize(all, query({ relay: 'on' })).days.find(item => item.day === '2026-11-23')!;
  assert.deepEqual(day.models.map(model => model.model), ['opencode-go/kimi-k3.1-pro']);
});

test('the filter lists come from the whole range, not the filtered part', () => {
  const { options } = summarize([kimi, flash, claude], query({ provider: 'claude-agent' }));
  assert.deepEqual(options, { providers: ['claude-agent', 'opencode-go'], efforts: ['default', 'high'], modes: ['build', 'plan'], projects: ['C:/work/app', 'C:/work/other'] });
});

test('a record with no model, or with no effort, is counted and searchable', () => {
  const nameless = at('2026-11-23T17:00:00Z', { model: null, costByPrice: '0.05' });
  const summed = summarize([nameless, kimi], query());
  assert.deepEqual(summed.totals.map(total => total.model).sort(), ['opencode-go/kimi-k3.1-pro', 'unknown model']);
  assert.equal(summarize([nameless, kimi], query({ search: 'unknown' })).matching, 1);
  assert.deepEqual(summed.options.efforts, ['default']);
});

test('totals add USD exactly, and are ordered by cost', () => {
  const one = at('2026-11-23T10:00:00Z', { model: 'p/a', costByPrice: '0.1' }), two = at('2026-11-23T11:00:00Z', { model: 'p/a', costByPrice: '0.2' });
  const dear = at('2026-11-23T12:00:00Z', { model: 'p/b', costByPrice: '1', pricesFrom: 'artificial-analysis' });
  const { totals } = summarize([one, two, dear], query());
  assert.deepEqual(totals.map(total => [total.model, total.replies, total.cost, total.aaPriced]), [['p/b', 1, '1', true], ['p/a', 2, '0.3', false]]);
});

test('a total counts its replies with no price, also when others of its model have one', () => {
  const priced = at('2026-11-23T10:00:00Z', { model: 'p/a', costByPrice: '0.1' }), bare = at('2026-11-23T11:00:00Z', { model: 'p/a', costByPrice: null, openCodeUsd: '0' });
  const none = at('2026-11-23T12:00:00Z', { model: 'p/b', costByPrice: null, openCodeUsd: null });
  const { totals } = summarize([priced, bare, none], query());
  assert.deepEqual(totals.map(total => [total.model, total.cost, total.replies, total.unpriced]), [['p/a', '0.1', 2, 1], ['p/b', null, 1, 1]]);
});

// The final review's fixes (24 Nov): what a record keeps when it is read again, and a range that does not trust the host's `after`.
test('a price that turns up later is added to a record that has none', () => {
  const unpriced = record(1000, { costByPrice: null, pricesFrom: null }), priced = record(1000, { costByPrice: '0.3', pricesFrom: 'opencode' });
  assert.deepEqual(grown(unpriced, priced), priced);
});

test('a record that grows while the prices are late keeps waiting rather than losing its cost', () => {
  const old = record(1000, { requests: 2, costByPrice: '0.2', pricesFrom: 'opencode' });
  assert.equal(grown(old, record(1000, { requests: 3, input: 300, costByPrice: null, pricesFrom: null })), null);
  assert.deepEqual(grown(old, record(1000, { requests: 3, input: 300, costByPrice: '0.3', pricesFrom: 'opencode' }))?.costByPrice, '0.3');
});

test('a helper record stays a helper when it grows, even if its chat could not be read that time', () => {
  assert.equal(grown(record(1000, { kind: 'helper' }), record(1000, { kind: 'chat', requests: 3 }))?.kind, 'helper');
  assert.equal(grown(record(1000, { kind: 'helper', costByPrice: null }), record(1000, { kind: 'chat', costByPrice: '0.1' }))?.kind, 'helper');
});

test('a range never includes records from before it, whatever the host does with after', async () => {
  const { data, store } = memoryStore();
  for (const at of [1000, 2000, 3000]) data.set(logKey(record(at)), record(at));
  const ignoring: LogStore = { ...store, scan: options => store.scan({ ...options, after: undefined }) };
  assert.deepEqual((await readRecords(ignoring, iso(2000), iso(3000))).map(made => made.at), [iso(2000), iso(3000)]);
});

test('with nothing old enough, removing old records looks at the oldest key only', async () => {
  const { data, store } = memoryStore(), now = Date.parse('2026-11-24T12:00:00Z'), limits: (number | undefined)[] = [];
  for (let at = 0; at < 300; at++) { const fresh = record(now - 3_600_000 - at); data.set(logKey(fresh), fresh); }
  const counting: LogStore = { ...store, scan: options => { limits.push(options.limit); return store.scan(options); } };
  assert.equal(await pruneRecords(counting, now), 0);
  assert.deepEqual(limits, [1]);
});

// The minor issues, fixed on 24 Nov: a clock change inside the range, and a damaged date.
test('with a time zone, days follow its clock changes: 90 days across the end of summer time are 90 bars', () => {
  const range = query({ from: '2026-08-27T04:00:00.000Z', to: '2026-11-24T16:00:00.000Z', tzOffsetMinutes: -300, timeZone: 'America/New_York' });
  const late = at('2026-09-01T04:30:00Z'), summed = summarize([late], range);
  assert.deepEqual([summed.days.length, summed.days[0].day, summed.days.at(-1)!.day], [90, '2026-08-27', '2026-11-24']);
  assert.equal(summed.days.find(day => day.models.length)?.day, '2026-09-01', 'half past midnight in summer time is that day, not the one before');
  assert.equal(summarize([late], { ...range, timeZone: null }).days[0].day, '2026-08-26', 'one offset for the whole range still shifts summer days');
});

test('the query takes an optional time zone, and refuses one that is not', () => {
  const base = { from: '2026-11-20T05:00:00.000Z', to: '2026-11-24T16:00:00.000Z', tzOffsetMinutes: -300, search: '', provider: null, effort: null, mode: null, relay: 'any', kind: 'any', project: null };
  assert.equal(usageQueryOf(base).timeZone, null);
  assert.equal(usageQueryOf({ ...base, timeZone: 'America/New_York' }).timeZone, 'America/New_York');
  assert.throws(() => usageQueryOf({ ...base, timeZone: 'Not/AZone' }), /The time zone is not one\./);
});

test('a stored record with an impossible date is skipped, so the range still reads', async () => {
  const { data, store } = memoryStore();
  data.set(`${LOG_PREFIX}${iso(2000)}/ses-1/far`, record(2000, { at: '+275760-09-13T00:00:00.000Z', messageID: 'far' }));
  data.set(logKey(record(3000)), record(3000));
  const found = await readRecords(store, iso(1000), iso(4000));
  assert.deepEqual(found.map(made => made.messageID), ['m3000']);
  assert.doesNotThrow(() => summarize(found, query({ from: iso(0), to: iso(86_400_000) })));
});

// 26 Nov: records kept before a key was saved stayed unpriced (12 of the owner's Claude replies).
test('a record kept with no price is priced when read: from the lists for a login, $0 for a free copy, and left alone when OpenCode charged for it', () => {
  const prices = (input: string, output: string) => ({ inputPerMillion: input, outputPerMillion: output, cacheReadPerMillion: '0.2', cacheWritePerMillion: null });
  const table: IndexTable = new Map([['claude-sonnet-5-5', { id: 'anthropic/claude-sonnet-5-5', index: null, context: null, prices: prices('2', '10') }]]);
  const aa = [{ slug: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5 (Max)', creator: 'Anthropic', released: '2026-09-28', index: 54.7, coding: null, prices: prices('2', '10') }];
  const sonnet = at('2026-11-23T10:00:00Z', { model: 'claude-agent/sonnet#high', input: 1_000_000, output: 50_000, reasoning: 50_000, cacheRead: 1_000_000, costByPrice: null, openCodeUsd: '0' });
  const free = at('2026-11-23T11:00:00Z', { model: 'opencode/deepseek-v4.1-flash-free', costByPrice: null, openCodeUsd: '0' });
  const charged = at('2026-11-23T12:00:00Z', { model: 'claude-agent/sonnet', costByPrice: null, openCodeUsd: '0.4' });
  const unknown = at('2026-11-23T13:00:00Z', { model: 'nobody/never-listed', costByPrice: null, openCodeUsd: '0' });
  const [priced, freed, ...rest] = priceFromList([sonnet, free, charged, unknown, kimi], model => pricesOf(model, null, { aa: [], table }));
  assert.deepEqual([priced.costByPrice, priced.pricesFrom], ['3.2', 'openrouter'], '1M in at $2, 0.1M out with reasoning at $10, 1M from cache at $0.20');
  assert.deepEqual([freed.costByPrice, freed.pricesFrom], ['0', null], 'a free copy is $0');
  assert.deepEqual(rest, [charged, unknown, kimi]);
  const [fromAa] = priceFromList([sonnet], model => pricesOf(model, null, { aa, table }));
  assert.deepEqual([fromAa.costByPrice, fromAa.pricesFrom], ['3.2', 'artificial-analysis']);
});

test("a record kept before this version reads from, start and the decider's cost as null", async () => {
  const { data, store } = memoryStore(), old = { ...record(1000), relay: { mode: 'plan', note: null } };
  data.set(logKey(old), old);
  const [read] = await readRecords(store, iso(0), iso(2000));
  assert.deepEqual(read.relay, { mode: 'plan', note: null, from: null, start: null, deciderUsd: null });
});

test('a Relay part that arrives late brings its new fields', () => {
  const part = { mode: 'execute' as const, note: null, from: 'p/big', start: 'p/big', deciderUsd: '0.0002' };
  assert.deepEqual(grown(record(1000), record(1000, { relay: part }))?.relay, part);
});
