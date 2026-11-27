import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AaModel } from '../src/artificial-analysis.js';
import type { ListedModel } from '../src/inventory.js';
import type { UsageRow } from '../src/relay-store.js';
import { factsOf, indexHint, pricesOf, readStored, standingsOf } from '../src/standings.js';
import { indexTable, type IndexTable } from '../src/intelligence.js';

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
  const table: IndexTable = new Map([['kimi-k3-1-pro', { id: 'moonshotai/kimi-k3.1-pro', index: 60, context: null, prices: null }]]);
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

// 26 Nov: Artificial Analysis's free list has no index for many models OpenRouter's copy scores (12 of the owner's 123), and it is the same index.
test('a model with no index in Artificial Analysis’s list takes OpenRouter’s stored one; a free copy is $0, never the paid price', () => {
  const aa = [aaEntry('kimi-k3', 'Kimi K3 (Max)', null, null, { inputPerMillion: '3', outputPerMillion: '15' }), aaEntry('deepseek-v4-1-flash', 'DeepSeek V4.1 Flash', 32, null, { inputPerMillion: '0.3', outputPerMillion: '1.2' })];
  const table: IndexTable = new Map([['kimi-k3', { id: 'moonshotai/kimi-k3', index: 17.4, context: null, prices: null }], ['qwen3-8-flash', { id: 'qwen/qwen3.8-flash', index: 28.5, context: null, prices: null }]]);
  const models = [listed('opencode-go', 'kimi-k3', 'Kimi K3', cost('3', '15')), listed('opencode-go', 'qwen3.8-flash', 'Qwen3.8 Flash', cost('0.15', '0.47')), listed('opencode', 'deepseek-v4.1-flash-free', 'DeepSeek V4.1 Flash Free', cost(null, null))];
  const s = standingsOf({ aa, table, usage: [] }, models, [pick('opencode-go', 'kimi-k3'), pick('opencode-go', 'qwen3.8-flash'), pick('opencode', 'deepseek-v4.1-flash-free')]);
  assert.deepEqual([s.get('opencode-go/kimi-k3')?.index, s.get('opencode-go/qwen3.8-flash')?.index], [17.4, 28.5]);
  assert.deepEqual(s.get('opencode/deepseek-v4.1-flash-free'), { index: 32, coding: null, inputPerMillion: '0', outputPerMillion: '0', outPerRequest: null });
});

// 26 Nov (owner: "make sure prices, context, intelligence index shows for all models and providers ... tested all providers with effort").
// Made-up lists shaped like the owner's: OpenCode Zen and Go, Ollama Cloud (ids with ":"), Claude through a Claude login (family ids, no price).
const usd = (input: string, output: string) => ({ inputPerMillion: input, outputPerMillion: output });
const aaList = [
  aaEntry('gpt-6-1-terra', 'GPT-6.1 Terra (Max)', 51.4, null, usd('1', '5')), aaEntry('gpt-6-1-terra-non-reasoning', 'GPT-6.1 Terra (Non-reasoning)', 30.5, null, usd('1', '5')),
  aaEntry('gpt-6-1-terra-low', 'GPT-6.1 Terra (Low)', 29.4, null, usd('1', '5')),
  { ...aaEntry('claude-sonnet-5-5', 'Claude Sonnet 5.5 (Max)', 54.7, null, usd('2', '10')), creator: 'Anthropic', released: '2026-09-28' },
  { ...aaEntry('claude-sonnet-5-5-high', 'Claude Sonnet 5.5 (High)', 41.5, null, usd('2', '10')), creator: 'Anthropic', released: '2026-09-28' },
  { ...aaEntry('claude-4-5-haiku', 'Claude 4.5 Haiku (Non-reasoning)', null, null, usd('1', '5')), creator: 'Anthropic', released: '2025-10-15' },
  aaEntry('glm-5-3-flash', 'GLM-5.3-Flash', 27.7, null, usd('0.15', '0.5')), aaEntry('glm-5-3-flash-low', 'GLM-5.3-Flash (Low)', 20.1, null, usd('0.15', '0.5')),
  aaEntry('kimi-k3', 'Kimi K3', null, null, usd('3', '15')), aaEntry('deepseek-v4-1-flash-1017', 'DeepSeek V4.1 Flash 1017', 32.4, null, usd('0.3', '1.2')),
];
const router = (id: string, prompt: string, completion: string, context: number, index: number | null) => ({ id, canonical_slug: id, context_length: context, pricing: { prompt, completion }, benchmarks: { artificial_analysis: { intelligence_index: index } } });
const orList = indexTable({ data: [router('moonshotai/kimi-k3', '0.000003', '0.000015', 1048576, 17.4), router('anthropic/claude-haiku-4.5', '0.000001', '0.000005', 200000, 7.4),
  router('anthropic/claude-sonnet-5.5', '0.000002', '0.00001', 1000000, 54.5), router('vendor/big-model', '0.000001', '0.000002', 500000, null)] });
const offered = (providerID: string, id: string, name: string, price: ReturnType<typeof cost>, context: number) => ({ providerID, id, name, cost: price, limit: { context } });
const shapes = {
  zen: offered('opencode', 'gpt-6.1-terra', 'GPT-6.1 Terra', cost('1', '5'), 1050000), go: offered('opencode-go', 'glm-5.3-flash', 'GLM-5.3-Flash', cost('0.15', '0.5'), 1000000),
  ollama: offered('ollama-cloud', 'deepseek-v4.1-flash:1017', 'deepseek-v4.1-flash:1017', cost('0.15', '0.6'), 1000000), sonnet: offered('claude-agent', 'sonnet', 'Sonnet 5.5', cost(null, null), 1000000),
  haiku: offered('claude-agent', 'claude-haiku-4-5-20251001', 'Haiku 4.5', cost(null, null), 200000), kimi: offered('opencode', 'kimi-k3', 'Kimi K3', cost('3', '15'), 1048576),
  free: offered('opencode', 'seaglass-alpha-free', 'Seaglass Alpha Free', cost('0', '0'), 1048576), pickle: offered('opencode', 'big-pickle', 'Big Pickle', cost(null, null), 200000),
  unknown: offered('new-provider', 'big-model', 'Big Model', cost(null, null), 0),
};
const brief = (model: keyof typeof shapes, variant: string | null, aa = aaList) => {
  const facts = factsOf(shapes[model], variant, { aa, table: orList });
  return [facts.pricesFrom, facts.prices?.inputPerMillion ?? null, facts.contextFrom, facts.context, facts.indexFrom, facts.index, facts.ownEffort];
};

test('every provider: OpenCode\u2019s price first, then Artificial Analysis\u2019s, then OpenRouter\u2019s; context from OpenCode, else OpenRouter', () => {
  assert.deepEqual(brief('zen', null), ['opencode', '1', 'opencode', 1050000, 'artificial-analysis', 51.4, false]);
  assert.deepEqual(brief('go', null), ['opencode', '0.15', 'opencode', 1000000, 'artificial-analysis', 27.7, false]);
  assert.deepEqual(brief('ollama', null), ['opencode', '0.15', 'opencode', 1000000, 'artificial-analysis', 32.4, false], 'an Ollama id with a colon');
  assert.deepEqual(brief('sonnet', null), ['artificial-analysis', '2', 'opencode', 1000000, 'artificial-analysis', 54.7, false], 'a Claude login model by its family');
  assert.deepEqual(brief('haiku', null), ['artificial-analysis', '1', 'opencode', 200000, 'openrouter', 7.4, false], 'a dated id; its words in another order there');
  assert.deepEqual(brief('kimi', null), ['opencode', '3', 'opencode', 1048576, 'openrouter', 17.4, false], 'no index in Artificial Analysis\u2019s list: OpenRouter\u2019s');
  assert.deepEqual(brief('free', null), ['free', '0', 'opencode', 1048576, null, null, false], 'a free model is $0 by its name');
  assert.deepEqual(brief('pickle', null), [null, null, 'opencode', 200000, null, null, false], 'in no list: nothing is made up');
  assert.deepEqual(brief('unknown', null), ['openrouter', '1', 'openrouter', 500000, null, null, false], 'a provider Relay has never seen, found by its model\u2019s name');
});

test('without a key, OpenRouter\u2019s list prices and scores the Claude login models', () => {
  assert.deepEqual(brief('sonnet', null, []), ['openrouter', '2', 'opencode', 1000000, 'openrouter', 54.5, false]);
});

test('every effort: its own index where Artificial Analysis lists it, else the highest effort\u2019s, said so', () => {
  assert.deepEqual(['none', 'low', 'medium', 'high', 'max'].map(effort => brief('zen', effort).slice(4)), [
    ['artificial-analysis', 30.5, true], ['artificial-analysis', 29.4, true], ['artificial-analysis', 51.4, false], ['artificial-analysis', 51.4, false], ['artificial-analysis', 51.4, true],
  ], '"none" is non-reasoning there; its plain entry is the highest effort');
  assert.deepEqual(['low', 'high', 'max'].map(effort => brief('go', effort).slice(4)), [['artificial-analysis', 20.1, true], ['artificial-analysis', 27.7, false], ['artificial-analysis', 27.7, true]]);
  assert.deepEqual(['low', 'high', 'xhigh', 'max'].map(effort => brief('sonnet', effort).slice(4)), [['artificial-analysis', 54.7, false], ['artificial-analysis', 41.5, true], ['artificial-analysis', 54.7, false], ['artificial-analysis', 54.7, true]]);
  assert.deepEqual(['low', 'high'].map(effort => brief('kimi', effort).slice(4)), [['openrouter', 17.4, false], ['openrouter', 17.4, false]], 'OpenRouter has one index a model');
  assert.deepEqual(['low', 'max'].map(effort => brief('sonnet', effort).slice(0, 2)), [['artificial-analysis', '2'], ['artificial-analysis', '2']], 'one price at every effort');
});

// The hint is for a model with no index, and only for reading: Relay's own choice never ranks by it (`standingsOf` has no hint).
const scoredAa = [
  { ...aaEntry('claude-sonnet-5-5', 'Claude Sonnet 5.5 (Max)', 54.7, null, usd('2', '10')), creator: 'Anthropic', released: '2026-09-28' },
  aaEntry('claude-sonnet-5-5-low', 'Claude Sonnet 5.5 (Low)', 25.6, null, usd('2', '10')),
  aaEntry('gpt-6-sol', 'GPT-6 Sol (Max)', 44.1, null, usd('2', '10')), aaEntry('gpt-6-2-sol', 'GPT-6.2 Sol (Max)', 57.3, null, usd('2', '10')),
  aaEntry('model-a', 'A', 20, null, usd('1', '4')), aaEntry('model-b', 'B', 24, null, usd('1.2', '4')), aaEntry('model-c', 'C', 30, null, usd('0.9', '3.6')),
  aaEntry('model-d', 'D', 36, null, usd('1', '5')), aaEntry('model-e', 'E', 40, null, usd('1.1', '4.4')), aaEntry('model-f', 'F', 60, null, usd('30', '180')), aaEntry('model-g', 'G', 50, null, usd('2', '5')),
];
const hintOf = (model: Parameters<typeof factsOf>[0], decision = false) => indexHint(model, factsOf(model, null, { aa: scoredAa, table: new Map() }), { aa: scoredAa, table: new Map() }, decision);
const none = { low: null, high: null, older: null, newer: null, count: 0 };

test('a hint from the family: below its newest scored version, above an older one, or between two', () => {
  assert.deepEqual(hintOf(offered('claude-agent', 'claude-sonnet-5', 'Sonnet 5', cost(null, null), 1000000)), { kind: 'family', low: null, high: 54.7, older: null, newer: 'claude-sonnet-5-5', count: 0, reason: null });
  assert.deepEqual(hintOf(offered('anthropic', 'claude-sonnet-6', 'Claude Sonnet 6', cost('3', '15'), 1000000)), { kind: 'family', low: 54.7, high: null, older: 'claude-sonnet-5-5', newer: null, count: 0, reason: null }, 'a newer version than any scored');
  assert.deepEqual(hintOf(offered('opencode', 'gpt-6.1-sol', 'GPT-6.1 Sol', cost('2', '10'), 1050000)), { kind: 'family', low: 44.1, high: 57.3, older: 'gpt-6-sol', newer: 'gpt-6-2-sol', count: 0, reason: null });
  assert.equal(hintOf(offered('opencode', 'claude-sonnet-5-5', 'Claude Sonnet 5.5', cost('2', '10'), 1000000)), null, 'a model with an index needs no hint');
  assert.deepEqual(hintOf(offered('p', 'gpt-5.9-sol', 'GPT-5.9 Sol', cost('2', '10'), 1050000))?.newer, 'gpt-6-sol', 'the nearest newer version, the closest bound');
});

test('else from models at about its price: the middle half of their scores, with how many there are', () => {
  assert.deepEqual(hintOf(offered('p', 'mystery-1', 'Mystery 1', cost('1', '4'), 100000)), { kind: 'price', low: 24, high: 36, older: null, newer: null, count: 5, reason: null }, 'five models within half again of its price; G, at  in and  out, is just past it');
  assert.deepEqual(hintOf(offered('p', 'mystery-2', 'Mystery 2', cost('10', '40'), 100000)), { kind: 'none', ...none, reason: 'few-peers' });
});

test('else the reason there is none: a free model, a decision model, or no price', () => {
  assert.deepEqual(hintOf(offered('opencode', 'seaglass-alpha-free', 'Seaglass Alpha Free', cost('0', '0'), 1000000)), { kind: 'none', ...none, reason: 'free' });
  assert.deepEqual(hintOf(offered('opencode', 'jev-1.14', 'Jev 1.14', cost('0.042', '0'), 64000), true), { kind: 'none', ...none, reason: 'decision' });
  assert.deepEqual(hintOf(offered('opencode', 'big-pickle', 'Big Pickle', cost('0', '0'), 200000)), { kind: 'none', ...none, reason: 'no-price' });
});

const usd4 = (input: string, output: string) => ({ inputPerMillion: input, outputPerMillion: output, cacheReadPerMillion: null, cacheWritePerMillion: null });
const publicList: IndexTable = new Map([
  ['claude-sonnet-4-5', { id: 'anthropic/claude-sonnet-4-5', index: null, context: null, prices: usd4('3', '15') }],
  ['claude-sonnet-5-5', { id: 'anthropic/claude-sonnet-5-5', index: null, context: null, prices: usd4('2', '10') }],
  ['gpt-5-3-codex', { id: 'openai/gpt-5.3-codex', index: null, context: null, prices: usd4('1.75', '14') }],
]);
const priceOf = (facts: { prices: { inputPerMillion: string | null; outputPerMillion: string | null } | null; pricesFrom: string | null }) => [facts.prices?.inputPerMillion ?? null, facts.prices?.outputPerMillion ?? null, facts.pricesFrom];

test("a Claude login family borrows OpenRouter's newest version of it", () => {
  const facts = factsOf(offered('claude-agent', 'sonnet', 'Sonnet', cost(null, null), 1000000), null, { aa: [], table: publicList });
  assert.deepEqual(priceOf(facts), ['2', '10', 'openrouter']);
});

test('a Codex login model that lists no price is priced from the public list by its id', () => {
  const codex = offered('openai', 'gpt-5.3-codex', 'GPT-5.3 Codex', cost(null, null), 400000) as unknown as ListedModel;
  assert.deepEqual(priceOf(pricesOf('openai/gpt-5.3-codex', [codex], { aa: [], table: publicList })), ['1.75', '14', 'openrouter']);
});

test('a model listed at $0 stays $0, and a free copy is free', () => {
  const local = offered('p', 'local', 'Local', cost('0', '0'), 8000) as unknown as ListedModel;
  assert.deepEqual(priceOf(pricesOf('p/local', [local], { aa: [], table: publicList })), ['0', '0', 'opencode']);
  assert.equal(pricesOf('opencode/x-free', null, { aa: [], table: publicList }).pricesFrom, 'free');
});

test('a name with a slash in its id and an effort is split at the first slash and the last #', () => {
  assert.deepEqual(priceOf(pricesOf('openrouter/anthropic/claude-sonnet-5-5#high', null, { aa: [], table: publicList })), ['2', '10', 'openrouter']);
});
