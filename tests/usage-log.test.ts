import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUsd } from '../src/costs.js';
import { decisionsOf, type Decision } from '../src/relay-store.js';
import { buildRecords, grown, KEEP_DAYS, LOG_PREFIX, logKey, pruneRecords, readRecords, saveRecords, type LogStore, type UsageRecord } from '../src/usage-log.js';

// Usage records (docs/superpowers/specs/2026-11-24-relay-usage-tab-design.md). Messages are shaped as OpenCode 2.3 gives them from `session.context`.
const user = (id: string, created: number) => ({ id, type: 'user', time: { created }, text: 'never read' });
const answer = (id: string, created: number, tokens: { input: number; output?: number; reasoning?: number; read?: number }, extra: object = {}) => ({
  id, type: 'assistant', agent: 'build', finish: 'stop', cost: 0.01, model: { id: 'big', providerID: 'p', variant: 'default' }, time: { created, completed: created + 100 },
  tokens: { input: tokens.input, output: tokens.output ?? 0, reasoning: tokens.reasoning ?? 0, cache: { read: tokens.read ?? 0, write: 0 } }, ...extra,
});
const summary = (id: string, created: number) => ({ id, type: 'compaction', status: 'completed', reason: 'auto', time: { created }, model: { id: 'big', providerID: 'p', variant: 'default' }, cost: 0.008, tokens: { input: 495, output: 5, reasoning: 0, cache: { read: 0, write: 0 } } });
const chat = { sessionID: 'ses-1', project: 'C:/work/app', helper: false }, noPrices = { models: null, borrowed: null };
const decision = (messageID: string, extra: Partial<Decision> = {}): Decision => ({ at: '2026-11-24T00:00:00.000Z', sessionID: 'ses-1', kind: 'chat', mode: 'execute', confidence: 0.9, fit: null, model: 'p/big', ms: 10, costUsd: null, note: 'small work, so the cheapest', messageID, reply: null, ...extra });
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
  const [first, second] = buildRecords(messages, chat, noPrices, [decision('m1')]);
  assert.deepEqual(first.relay, { mode: 'execute', note: 'small work, so the cheapest' });
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
  const base = record(1000), relay = { mode: 'plan' as const, note: null };
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
