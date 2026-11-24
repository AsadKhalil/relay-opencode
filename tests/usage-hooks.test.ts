import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relayAutoHook, relayCompactionHook, relayReplyHook } from '../src/relay-auto.js';
import { recentDecisions } from '../src/relay-store.js';
import { LOG_PREFIX, type LogStore, type UsageRecord } from '../src/usage-log.js';
import { fakeModels, fakeRelay } from './relay-fakes.js';

// Usage records (docs/superpowers/specs/2026-11-24-relay-usage-tab-design.md): every chat that goes idle, or is about to be summarized, leaves
// them. In a file of its own: tests/relay-auto.test.ts ends with a storage write that never finishes, which holds Relay's storage queue for
// the rest of that file's process.
type Fake = ReturnType<typeof fakeRelay>;
const event = (text: string) => ({ sessionID: 'ses-1', messageID: 'msg-1', delivery: 'steer', prompt: { text, files: [], agents: [], skills: [] } });
const turnOn = (f: Fake) => { f.data.set('relay/on/ses-1', true); return f; };
const names = (f: Fake) => f.calls.map(call => call.name);
const last = async (f: Fake) => (await recentDecisions({ get: async key => structuredClone(f.data.get(key)) }))[0];
const sleep = (ms: number) => new Promise<void>(done => setTimeout(done, ms));
const replied = (created: number) => [
  { id: 'msg-1', type: 'user', time: { created }, text: 'never read' },
  { id: 'a1', type: 'assistant', agent: 'build', time: { created: created + 20, firstToken: created + 900, completed: created + 1500 }, model: { providerID: 'p', id: 'exec', variant: 'high' }, tokens: { input: 84_000, output: 300, reasoning: 0, cache: { read: 1200, write: 0 } }, cost: 0.21 },
  { id: 'a2', type: 'assistant', agent: 'build', time: { created: created + 1600, firstToken: created + 1700, completed: created + 2000 }, model: { providerID: 'p', id: 'exec', variant: 'high' }, tokens: { input: 400, output: 80, reasoning: 0, cache: { read: 85_500, write: 0 } }, cost: 0.01 },
  { id: 'i1', type: 'idle', time: { created: created + 2010 } },
];
const prices = { inputPerMillion: '3', outputPerMillion: '15', cacheReadPerMillion: '0.3', cacheWritePerMillion: '3.75' };
const priced = fakeModels.map(model => model.id === 'exec' ? { ...model, cost: { ...model.cost, ...prices } } : model);
const logged = (f: Fake) => ({ ...f.deps, log: f.deps.store as unknown as LogStore, project: 'C:/work/app' });
const records = (f: Fake) => [...f.data].filter(([key]) => key.startsWith(LOG_PREFIX)).map(([, value]) => value as UsageRecord);

test('a chat with Relay off gets records when it goes idle', async () => {
  const f = fakeRelay({ messages: replied(1000), models: priced });
  await relayReplyHook(logged(f))({ sessionID: 'ses-1' });
  assert.deepEqual(records(f).map(item => [item.messageID, item.kind, item.agent, item.model, item.requests, item.relay, item.project]), [['msg-1', 'chat', 'build', 'p/exec#high', 2, null, 'C:/work/app']]);
  assert.equal(records(f)[0].pricesFrom, 'opencode');
});

test('a placed message keeps its Relay part, and the old reply record is still filled', async () => {
  const f = turnOn(fakeRelay({ messages: replied(1000), models: priced }));
  await relayAutoHook(f.deps)(event('fix the login test')); await sleep(20);
  await relayReplyHook(logged(f))({ sessionID: 'ses-1' });
  assert.equal(records(f)[0].relay?.mode, 'execute');
  assert.equal((await last(f)).reply?.requests, 2);
});

test('the context is read once for both jobs', async () => {
  const f = turnOn(fakeRelay({ messages: replied(1000), models: priced }));
  await relayAutoHook(f.deps)(event('fix the login test')); await sleep(20);
  f.calls.length = 0;
  await relayReplyHook(logged(f))({ sessionID: 'ses-1' });
  assert.equal(names(f).filter(name => name === 'context').length, 1);
});

test('a helper chat (one with a parent) makes helper records; a slow session.get leaves it a chat', async () => {
  const helper = fakeRelay({ messages: replied(1000), parentID: 'ses-0' });
  await relayReplyHook(logged(helper))({ sessionID: 'ses-1' });
  assert.equal(records(helper)[0].kind, 'helper');
  const slow = fakeRelay({ messages: replied(1000), parentID: 'never', readMs: 200 });
  await relayReplyHook(logged(slow))({ sessionID: 'ses-1' });
  assert.equal(records(slow)[0].kind, 'chat');
});

test('the compaction hook writes the records so far, within half a second, and never changes the request', async () => {
  const f = fakeRelay({ messages: replied(1000) }), request = { sessionID: 'ses-1', agent: 'build', system: [], messages: [], options: {}, tools: {} }, before = structuredClone(request);
  await relayCompactionHook(logged(f))(request);
  assert.deepEqual(request, before);
  assert.deepEqual(records(f).map(item => item.messageID), ['msg-1']);
  const slow = fakeRelay({ messages: 'never' }), began = Date.now();
  await relayCompactionHook(logged(slow))({ sessionID: 'ses-1' });
  assert.ok(Date.now() - began < 900, 'a summary waits half a second at most');
});

// Last: a read of Relay's records that never answers holds its storage queue for the rest of this process.
test('a slow or failing storage leaves the record out and the hook still returns within its limit, without throwing', async () => {
  const failing = fakeRelay({ messages: replied(1000), readMs: 200, fail: { storageSet: new Error('disk full') } });
  await relayReplyHook(logged(failing))({ sessionID: 'ses-1' });
  assert.deepEqual(records(failing), []);
  const slow = fakeRelay({ messages: replied(1000), readMs: 200, stored: { 'relay/decisions': 'never' } }), began = Date.now();
  await relayReplyHook(logged(slow))({ sessionID: 'ses-1' });
  assert.ok(Date.now() - began < 1000, 'held for its limit at most');
});
