import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchIndexTable, findModel, indexFor, indexTable, loadIndexTable, modelKey, openRouterFor, storedIndexTable } from '../src/intelligence.js';

const entry = (id: string, index: number | null, extra: Record<string, unknown> = {}) => ({ id, canonical_slug: id, name: id, benchmarks: { artificial_analysis: { intelligence_index: index } }, ...extra });
const body = { data: [
  entry('anthropic/claude-sonnet-5.5', 54.5), entry('anthropic/claude-sonnet-5.5:batch', 54.5), entry('anthropic/claude-haiku-5.5', 36.5),
  entry('z-ai/glm-5.3', 61), entry('moonshotai/kimi-k3.1-pro', 58.2), entry('openai/gpt-oss-20b', 33.4), entry('openai/gpt-oss-20b:free', 33.4),
  entry('vendor-a/twin-1', 40), entry('vendor-b/twin-1', 45), entry('vendor-x/alpha-lite-2', 20), entry('vendor-y/beta-lite-2', 25), entry('vendor/no-index', null), { id: 'vendor/no-benchmarks', name: 'x' },
] };

test('a model key drops the vendor, the case, the variant suffix and the punctuation', () => {
  assert.equal(modelKey('anthropic/claude-sonnet-5.5:batch'), 'claude-sonnet-5-5');
  assert.equal(modelKey('GLM-5.3'), 'glm-5-3');
  assert.equal(modelKey('gpt-oss:20b'), 'gpt-oss-20b');
  assert.equal(modelKey('Kimi K3.1 Pro'), 'kimi-k3-1-pro');
  assert.equal(modelKey('deepseek-v4.1-flash-free'), 'deepseek-v4-1-flash');
  assert.equal(modelKey('openai/gpt-oss-20b:free'), 'gpt-oss-20b');
});

test('the table keeps each model once, with or without an index, and drops a key two different models share', () => {
  const table = indexTable(body);
  assert.deepEqual(table.get('claude-sonnet-5-5'), { id: 'anthropic/claude-sonnet-5.5', index: 54.5, context: null, prices: null }, 'the :batch twin is the same model');
  assert.deepEqual(table.get('gpt-oss-20b'), { id: 'openai/gpt-oss-20b', index: 33.4, context: null, prices: null });
  assert.equal(table.has('twin-1'), false, 'two vendors, two scores: no guess');
  assert.deepEqual(table.get('no-index'), { id: 'vendor/no-index', index: null, context: null, prices: null }, 'kept for its price and context');
  assert.deepEqual(table.get('no-benchmarks'), { id: 'vendor/no-benchmarks', index: null, context: null, prices: null });
  assert.equal(indexTable({ nope: true }).size, 0);
  assert.equal(indexTable(null).size, 0);
});

test('a model is matched by its id, then its name, then by the one listed model whose id ends in it', () => {
  const table = indexTable(body);
  assert.deepEqual(indexFor({ id: 'glm-5.3', name: 'GLM-5.3' }, table), { index: 61, matched: 'z-ai/glm-5.3' });
  assert.deepEqual(indexFor({ id: 'gpt-oss:20b', name: 'gpt-oss:20b' }, table), { index: 33.4, matched: 'openai/gpt-oss-20b' });
  assert.deepEqual(indexFor({ id: 'opaque-1', name: 'Kimi K3.1 Pro' }, table), { index: 58.2, matched: 'moonshotai/kimi-k3.1-pro' });
  assert.deepEqual(indexFor({ id: 'sonnet', name: 'Sonnet 5.5' }, table), { index: 54.5, matched: 'anthropic/claude-sonnet-5.5' }, "OpenCode's claude-agent names its models like this");
  assert.equal(indexFor({ id: 'twin-1', name: 'Twin 1' }, table), null, 'ambiguous: no guess');
  assert.equal(indexFor({ id: '5.5', name: '5.5' }, table), null, 'too short to match by its end');
  assert.equal(indexFor({ id: 'pro', name: 'Pro' }, table), null, 'too short, even when only one listed model ends in it');
  assert.equal(indexFor({ id: 'lite-2', name: 'Lite 2' }, table), null, 'two listed models end in it: no guess');
  assert.equal(indexFor({ id: 'x1', name: 'Claude Sonnet' }, table), null, 'a name without its version is not any one version');
  assert.equal(indexFor({ id: 'unknown-model', name: 'Unknown' }, table), null);
});

test('the list is fetched once, refused when it is not a model list, too big, or late, and never with anything about the person', async () => {
  const asked: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher = (reply: () => Response) => (async (url: string, init?: RequestInit) => { asked.push({ url, init }); return reply(); }) as typeof fetch;
  const table = await fetchIndexTable(fetcher(() => new Response(JSON.stringify(body))));
  assert.equal(table.get('glm-5-3')?.index, 61);
  assert.deepEqual([asked[0]!.url, asked[0]!.init?.method ?? 'GET', asked[0]!.init?.headers], ['https://openrouter.ai/api/v1/models', 'GET', { accept: 'application/json' }]);
  await assert.rejects(fetchIndexTable(fetcher(() => new Response('nope', { status: 503 }))), /answered 503/);
  await assert.rejects(fetchIndexTable(fetcher(() => new Response('not json'))), /not a model list/);
  await assert.rejects(fetchIndexTable(fetcher(() => new Response(JSON.stringify({ data: 'x' })))), /not a model list/);
  await assert.rejects(fetchIndexTable(fetcher(() => new Response('x'.repeat(8_000_001)))), /too big/);
  await assert.rejects(fetchIndexTable(fetcher(() => new Response(JSON.stringify({ data: [entry('vendor/no-index', null)] })))), /carries no index/);
  const late = (async (_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as typeof fetch;
  await assert.rejects(fetchIndexTable(late, 50), /aborted/);
});

test('the stored index table is read from storage alone, at any age', async () => {
  const store = { get: async () => ({ fetchedAt: '2020-01-01T00:00:00.000Z', rows: [['glm-5-3', 'z-ai/glm-5.3', 50]] }) };
  assert.deepEqual([...await storedIndexTable(store)], [['glm-5-3', { id: 'z-ai/glm-5.3', index: 50, context: null, prices: null }]], 'a copy stored before 26 Nov has no prices or context');
  assert.equal((await storedIndexTable({ get: async () => { throw new Error('disk'); } })).size, 0);
});

// 26 Nov: the list is kept whole for prices and context, and one ladder finds a model in it and in Artificial Analysis's list.
const priced = (id: string, prompt: string, completion: string, context: number, index: number | null = null, extra: Record<string, unknown> = {}) =>
  entry(id, index, { context_length: context, pricing: { prompt, completion, input_cache_read: '0.0000001', input_cache_write: '-1' }, ...extra });

test('each model keeps its prices for a million tokens, exactly, and its context; a copy (:free, :batch) never changes them', () => {
  const table = indexTable({ data: [priced('openai/gpt-oss-20b:free', '0', '0', 131072, 33.4), priced('openai/gpt-oss-20b', '0.00000007', '0.0000003', 131072, 33.4), priced('vendor/auto', '-1', '-1', 0)] });
  assert.deepEqual(table.get('gpt-oss-20b'), { id: 'openai/gpt-oss-20b', index: 33.4, context: 131072, prices: { inputPerMillion: '0.07', outputPerMillion: '0.3', cacheReadPerMillion: '0.1', cacheWritePerMillion: null } });
  assert.deepEqual(table.get('auto'), { id: 'vendor/auto', index: null, context: null, prices: { inputPerMillion: null, outputPerMillion: null, cacheReadPerMillion: '0.1', cacheWritePerMillion: null } }, 'a price of -1 (it varies) is unknown');
  assert.equal(indexTable({ data: [priced('vendor/solo:free', '0', '0', 1000, 10)] }).get('solo')?.prices, null, 'a model listed only as a free copy: its own price is unknown, not $0');
});

test('the ladder: as written, then without a date, then with its words in any order, then the one listed key that ends in it', () => {
  const table = indexTable({ data: [priced('anthropic/claude-haiku-4.5', '0.000001', '0.000005', 200000, 7.4), priced('qwen/qwen3.8-max-20260902', '0.000002', '0.000006', 262144), priced('vendor/gpt-5.4-mini', '0.00000075', '0.0000045', 400000), priced('vendor/gpt-4.5-mini', '0.000001', '0.000002', 128000)] });
  const id = (model: { id: string; name: string }) => openRouterFor(model, table)?.id ?? null;
  assert.equal(id({ id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5' }), 'anthropic/claude-haiku-4.5', 'a date at the end');
  assert.equal(id({ id: 'qwen3.8-max', name: 'Qwen3.8 Max' }), 'qwen/qwen3.8-max-20260902', 'a date on the listed side');
  assert.equal(id({ id: 'claude-4-5-haiku', name: 'Claude 4.5 Haiku' }), 'anthropic/claude-haiku-4.5', 'the words in another order');
  assert.equal(id({ id: 'mini-gpt-5.4', name: 'x' }), 'vendor/gpt-5.4-mini', 'numbers keep their order: 5.4 is not 4.5');
  assert.equal(id({ id: 'haiku', name: 'Haiku' }), null, 'a family name alone is no one model');
});

test('a match without what is asked for gives way to one with it, and never to a guess', () => {
  const table = indexTable({ data: [priced('deepseek/deepseek-v4.1-flash', '0.0000003', '0.0000012', 1000000), priced('deepseek/deepseek-v4.1-flash-1017', '0.0000003', '0.0000012', 1000000, 32.4)] });
  const indexed = (model: { id: string; name: string }) => openRouterFor(model, table, found => found.index !== null)?.id ?? null;
  assert.equal(openRouterFor({ id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash 1017' }, table)?.id, 'deepseek/deepseek-v4.1-flash', 'its id first');
  assert.equal(indexed({ id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash 1017' }), 'deepseek/deepseek-v4.1-flash-1017', 'its name names the version that has an index');
  assert.equal(indexed({ id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' }), null, 'no index for that one');
  const twins = new Map([['red-big-cat', { id: 'a/red-big-cat' }], ['big-red-cat', { id: 'b/big-red-cat' }]]);
  assert.equal(findModel(twins, ['cat-red-big'], found => found.id), null, 'two listed models in the same words: no guess');
});

test('a copy stored before 26 Nov is read, and refreshed at once for its prices', async () => {
  const records = new Map<string, unknown>([['relay/intelligence', { fetchedAt: '2026-11-26T07:00:00.000Z', rows: [['glm-5-3', 'z-ai/glm-5.3', 50]] }]]);
  const store = { async get(key: string) { return records.get(key); }, async set(key: string, value: unknown) { records.set(key, value); } };
  let fetched = 0;
  const fetcher = (async () => { fetched++; return new Response(JSON.stringify({ data: [priced('z-ai/glm-5.3', '0.0000014', '0.0000044', 1000000, 61)] })); }) as unknown as typeof fetch;
  const found = await loadIndexTable(store, fetcher, Date.parse('2026-11-26T08:00:00Z'));
  assert.deepEqual([fetched, found.table.get('glm-5-3')?.prices?.inputPerMillion, found.table.get('glm-5-3')?.context], [1, '1.4', 1000000]);
  const again = await loadIndexTable(store, fetcher, Date.parse('2026-11-26T09:00:00Z'));
  assert.deepEqual([fetched, again.table.get('glm-5-3')?.prices?.outputPerMillion], [1, '4.4'], 'the new copy is kept, prices and all');
});
