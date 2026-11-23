import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AaModel } from '../src/artificial-analysis.js';
import type { ListedModel } from '../src/inventory.js';
import type { UsageRow } from '../src/relay-store.js';
import { readStored, standingsOf } from '../src/standings.js';

const pick = (providerID: string, id: string, variant: string | null = null) => ({ providerID, id, variant });
const cost = (input: string | null, output: string | null) => ({ inputPerMillion: input, outputPerMillion: output, cacheReadPerMillion: null, cacheWritePerMillion: null, tiered: false, steps: [] });
const listed = (providerID: string, id: string, name: string, price: ReturnType<typeof cost>) => ({ providerID, id, name, cost: price }) as unknown as ListedModel;
const aaEntry = (slug: string, name: string, index: number | null, coding: number | null, prices: Partial<AaModel['prices']> = {}): AaModel =>
  ({ slug, name, creator: 'Maker', released: '2026-08-01', index, coding, prices: { inputPerMillion: null, outputPerMillion: null, cacheReadPerMillion: null, cacheWritePerMillion: null, ...prices } });
const row = (model: string, messages: number, requests: number, output: number, reasoning: number): UsageRow =>
  ({ model, messages, requests, input: 0, output, reasoning, cacheRead: 0, cacheWrite: 0, openCodeUsd: null, byPrice: { input: null, output: null, cacheRead: null, cacheWrite: null }, prices: null, pricesFrom: null });

test('each effort gets its Artificial Analysis entry, and the plain entry stands for an effort it does not list', () => {
  const aa = [aaEntry('gpt-x', 'GPT X', 57, 50), aaEntry('gpt-x-low', 'GPT X (Low)', 41, 30)];
  const s = standingsOf({ aa, table: new Map(), usage: [] }, [listed('openai', 'gpt-x', 'GPT X', cost('1.25', '10'))], [pick('openai', 'gpt-x', 'low'), pick('openai', 'gpt-x', 'high')]);
  assert.deepEqual([s.get('openai/gpt-x#low')?.index, s.get('openai/gpt-x#low')?.coding], [41, 30]);
  assert.deepEqual([s.get('openai/gpt-x#high')?.index, s.get('openai/gpt-x#high')?.coding], [57, 50]);
});

test('without that list, OpenRouter’s stored index, and no Coding index', () => {
  const table = new Map([['kimi-k3-1-pro', { id: 'moonshotai/kimi-k3.1-pro', index: 60 }]]);
  const s = standingsOf({ aa: [], table, usage: [] }, [listed('opencode-go', 'kimi-k3.1-pro', 'Kimi K3.1 Pro', cost('2', '10'))], [pick('opencode-go', 'kimi-k3.1-pro')]);
  assert.deepEqual(s.get('opencode-go/kimi-k3.1-pro'), { index: 60, coding: null, inputPerMillion: '2', outputPerMillion: '10', outPerRequest: null });
});

test('OpenCode’s price first, Artificial Analysis’s only when OpenCode lists none, and $0 stays $0', () => {
  const aa = [aaEntry('claude-sonnet-5-5', 'Claude Sonnet 5.5', 55, 50, { inputPerMillion: '3', outputPerMillion: '15' })];
  const models = [listed('agent', 'claude-sonnet-5-5', 'Claude Sonnet 5.5', cost(null, null)), listed('api', 'claude-sonnet-5-5', 'Claude Sonnet 5.5', cost('2', '10')), listed('free', 'claude-sonnet-5-5', 'Claude Sonnet 5.5', cost('0', '0'))];
  const s = standingsOf({ aa, table: new Map(), usage: [] }, models, ['agent', 'api', 'free'].map(provider => pick(provider, 'claude-sonnet-5-5')));
  const prices = (provider: string) => [s.get(`${provider}/claude-sonnet-5-5`)?.inputPerMillion, s.get(`${provider}/claude-sonnet-5-5`)?.outputPerMillion];
  assert.deepEqual([prices('agent'), prices('api'), prices('free')], [['3', '15'], ['2', '10'], ['0', '0']]);
});

test('a model’s own output a request needs three replies, and never comes from zero requests', () => {
  const usage = [row('p/two', 2, 4, 1000, 0), row('p/three', 3, 6, 3000, 1500), row('p/none', 3, 0, 0, 0)];
  const s = standingsOf({ aa: [], table: new Map(), usage }, [], [pick('p', 'two'), pick('p', 'three'), pick('p', 'none')]);
  assert.deepEqual(['p/two', 'p/three', 'p/none'].map(name => s.get(name)?.outPerRequest), [null, 750, null]);
});

test('readStored reads storage only, and a broken part counts as empty', async () => {
  const data = new Map<string, unknown>([
    ['relay/aa-models', { fetchedAt: new Date().toISOString(), models: [{ slug: 'm', name: 'M', creator: '', released: null, index: 40, coding: 35, prices: {} }] }],
    ['relay/intelligence', { fetchedAt: '2020-01-01T00:00:00.000Z', rows: [['m', 'x/m', 50]] }],
  ]);
  const read: string[] = [];
  const store = { get: async (key: string) => { read.push(key); if (key === 'relay/usage') throw new Error('disk'); return data.get(key); } };
  const stored = await readStored(store);
  assert.deepEqual([stored.aa.length, stored.aa[0].coding, stored.table.size, stored.usage], [1, 35, 1, []]);
  assert.deepEqual([...new Set(read)].sort(), ['relay/aa-models', 'relay/intelligence', 'relay/usage']);
});
