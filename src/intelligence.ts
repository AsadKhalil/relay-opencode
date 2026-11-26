import { storedUsd } from './costs.js';
import type { Prices } from './relay-store.js';

// OpenRouter's public model list: each model's intelligence index (Artificial Analysis's number, as OpenRouter carries it), its context and its
// prices. No key is needed and nothing about the person is sent: one plain GET of the public list. OpenCode's model records share no id with
// that list, so a model is found by its id or its name, put in one form, through `findModel`; a key two different models would share matches nothing.

export const INDEX_SOURCE = 'Artificial Analysis Intelligence Index, from OpenRouter\'s public model list';
const LIST_URL = 'https://openrouter.ai/api/v1/models';
const MAX_CHARS = 8_000_000;
/** OpenRouter lists some models again under a suffix (":batch", ":free" …), and OpenCode marks free copies with "-free"; they are the same model. */
const VARIANT = /(:(batch|free|extended|thinking|beta|nitro|floor|exacto)|-free)$/;

/** One listed model: its index, its context in tokens, and its prices for a million tokens; each null when the list has none. */
export type ListedFacts = { id: string; index: number | null; context: number | null; prices: Prices | null };
export type IndexTable = Map<string, ListedFacts>;

/** One form for a model's id or name: no vendor, lower case, no variant suffix, and dashes for dots, colons, underscores and spaces. */
export function modelKey(text: string): string {
  return (text.toLowerCase().split('/').pop() ?? '').trim().replace(VARIANT, '').replace(/[._:\s]+/g, '-').replace(/^-+|-+$/g, '');
}

const DATE = /-(\d{8}|\d{4}-\d{2}-\d{2})$/;
const dateless = (key: string) => key.replace(DATE, '');
/** The words in order, then the numbers in theirs: "claude-4-5-haiku" and "claude-haiku-4-5" meet; "gpt-5-4-mini" and "gpt-4-5-mini" do not. */
const wordOrder = (key: string) => { const parts = dateless(key).split('-').filter(Boolean); return [...parts.filter(part => /[a-z]/.test(part)).sort(), '#', ...parts.filter(part => !/[a-z]/.test(part))].join('-'); };
type Forms = { keys: string[]; dateless: string[]; words: string[] };
const formsOf = new WeakMap<ReadonlyMap<string, unknown>, Forms>();
const forms = (table: ReadonlyMap<string, unknown>): Forms => {
  let found = formsOf.get(table);
  if (!found) { const keys = [...table.keys()]; found = { keys, dateless: keys.map(dateless), words: keys.map(wordOrder) }; formsOf.set(table, found); }
  return found;
};

/**
 * The one listed entry `names` lead to, closest first: a key as written, then without a date at the end, then with its words in any order
 * (numbers keep theirs), then the one listed key of five characters or more that ends in it. Every source of prices or an index uses this, so
 * a new provider's models are found the same way. An entry without what the caller needs (`useful`) is passed over, so another name or step
 * can find one that has it. Two different entries at one step lead nowhere: no guess. `table` maps keys to entries; null marks a shared key.
 */
export function findModel<T>(table: ReadonlyMap<string, T | null>, names: readonly string[], idOf: (entry: T) => string, useful: (entry: T) => boolean = () => true): T | null {
  const keys = [...new Set(names.map(modelKey).filter(Boolean))];
  for (const key of keys) { const found = table.get(key); if (found && useful(found)) return found; }
  const listed = forms(table);
  const one = (fits: (at: number) => boolean) => {
    let found: T | null = null;
    for (let at = 0; at < listed.keys.length; at++) {
      const entry = table.get(listed.keys[at]!);
      if (!entry || !useful(entry) || !fits(at)) continue;
      if (found && idOf(found) !== idOf(entry)) return null;
      found = entry;
    }
    return found;
  };
  for (const key of keys) { const want = dateless(key), found = one(at => listed.dateless[at] === want); if (found) return found; }
  for (const key of keys) { const want = wordOrder(key), found = one(at => listed.words[at] === want); if (found) return found; }
  for (const key of keys) { if (key.length < 5) continue; const found = one(at => listed.keys[at]!.endsWith(`-${key}`)); if (found) return found; }
  return null;
}

/** OpenRouter's prices are USD a token, as text; a million tokens' worth, exactly. "-1" (the price varies) and anything odd are unknown. */
function perMillion(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) return null;
  const [whole = '', fraction = ''] = value.split('.'), digits = `${whole}${fraction.padEnd(6, '0')}`, point = whole.length + 6;
  let text = `${digits.slice(0, point).replace(/^0+(?=\d)/, '')}.${digits.slice(point)}`;
  text = text.replace(/0+$/, '').replace(/\.$/, '');
  return storedUsd(text);
}
const pricesOf = (pricing: Record<string, unknown> | undefined): Prices | null => {
  const prices = { inputPerMillion: perMillion(pricing?.prompt), outputPerMillion: perMillion(pricing?.completion), cacheReadPerMillion: perMillion(pricing?.input_cache_read), cacheWritePerMillion: perMillion(pricing?.input_cache_write) };
  return Object.values(prices).every(price => price === null) ? null : prices;
};
const positive = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

/** Every model in OpenRouter's reply, by key. A copy (":free", ":batch" …) is the same model and never changes its prices; a key two different models would share is left out. */
export function indexTable(reply: unknown): IndexTable {
  const table: IndexTable = new Map(), clash = new Set<string>();
  const data = (reply as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return table;
  type Item = { id?: unknown; canonical_slug?: unknown; context_length?: unknown; pricing?: Record<string, unknown>; benchmarks?: { artificial_analysis?: { intelligence_index?: unknown } } };
  const items = (data as Item[]).filter(item => typeof item?.id === 'string');
  // The models themselves first, then their copies, which only fill a key no model has.
  for (const item of [...items.filter(item => !VARIANT.test(item.id as string)), ...items.filter(item => VARIANT.test(item.id as string))]) {
    const index = item.benchmarks?.artificial_analysis?.intelligence_index, copy = VARIANT.test(item.id as string);
    const facts: ListedFacts = { id: (item.id as string).replace(VARIANT, ''), index: typeof index === 'number' && Number.isFinite(index) ? index : null, context: positive(item.context_length), prices: copy ? null : pricesOf(item.pricing) };
    for (const name of [item.id, item.canonical_slug]) {
      if (typeof name !== 'string') continue;
      const key = modelKey(name), found = table.get(key);
      if (!key || clash.has(key)) continue;
      if (found && found.id !== facts.id) { table.delete(key); clash.add(key); continue; }
      if (!found) table.set(key, facts);
    }
  }
  return table;
}

/** The listed model `model` is, by its id or its name; `useful` passes over one without what the caller needs. */
export const openRouterFor = (model: { id: string; name: string }, table: IndexTable, useful?: (found: ListedFacts) => boolean) => findModel(table, [model.id, model.name], found => found.id, useful);
/** A model's index, from the listed model with one that `openRouterFor` finds. Null when none fits clearly. */
export function indexFor(model: { id: string; name: string }, table: IndexTable): { index: number; matched: string } | null {
  const found = openRouterFor(model, table, listed => listed.index !== null);
  return found ? { index: found.index!, matched: found.id } : null;
}

/** Fetches OpenRouter's public model list (one GET, no key, nothing about the person) and keeps every model. */
export async function fetchIndexTable(fetcher: typeof fetch = fetch, ms = 15_000): Promise<IndexTable> {
  const response = await fetcher(LIST_URL, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(ms) });
  if (!response.ok) throw new Error(`OpenRouter answered ${response.status}`);
  const text = await response.text();
  if (text.length > MAX_CHARS) throw new Error('the model list is too big');
  let reply: unknown;
  try { reply = JSON.parse(text); } catch { throw new Error('the reply is not a model list'); }
  if (!Array.isArray((reply as { data?: unknown } | null)?.data)) throw new Error('the reply is not a model list');
  const table = indexTable(reply);
  // A list with no index at all is more likely a change on OpenRouter's side than a fact, so it never replaces a stored copy.
  if (![...table.values()].some(found => found.index !== null)) throw new Error('the list carries no index');
  return table;
}

// A row: key, id, index, context, then the four prices. A copy stored before 26 Nov 2026 has the first three only, and no `v`.
const CACHE_KEY = 'relay/intelligence', DAY_MS = 24 * 3600_000, VERSION = 2;
type Row = [string, string, number | null, ...(number | string | null)[]];
type Cache = { fetchedAt: string; v?: number; rows: Row[] };
type CacheStore = { get(key: string): Promise<unknown>; set(key: string, value: Cache): Promise<void> };
const decodeCache = (value: unknown): Cache | null => {
  const cache = value as Cache | null;
  return cache && typeof cache.fetchedAt === 'string' && Number.isFinite(Date.parse(cache.fetchedAt)) && Array.isArray(cache.rows)
    && cache.rows.every(row => Array.isArray(row) && row.length >= 3 && typeof row[0] === 'string' && typeof row[1] === 'string' && (typeof row[2] === 'number' || row[2] === null)) ? cache : null;
};
const text = (value: unknown) => typeof value === 'string' ? storedUsd(value) : null;
const fromRows = (rows: Cache['rows']): IndexTable => new Map(rows.map(([key, id, index, context, input, output, read, write]) => {
  const prices = { inputPerMillion: text(input), outputPerMillion: text(output), cacheReadPerMillion: text(read), cacheWritePerMillion: text(write) };
  return [key, { id, index, context: positive(context), prices: Object.values(prices).every(price => price === null) ? null : prices }];
}));
const toRows = (table: IndexTable): Row[] => [...table].map(([key, found]) => [key, found.id, found.index, found.context, found.prices?.inputPerMillion ?? null, found.prices?.outputPerMillion ?? null, found.prices?.cacheReadPerMillion ?? null, found.prices?.cacheWritePerMillion ?? null]);

/** The stored table at any age, from storage alone and never the network, for Relay's own choice while a message is placed. Empty when there is no readable copy. */
export async function storedIndexTable(store: { get(key: string): Promise<unknown> }): Promise<IndexTable> {
  try { const saved = decodeCache(await store.get(CACHE_KEY)); return saved ? fromRows(saved.rows) : new Map(); } catch { return new Map(); }
}

/** The table: the stored copy while it is under a day old and has prices, else a fresh fetch, stored; when that fails, the older copy with a note. */
export async function loadIndexTable(store: CacheStore, fetcher: typeof fetch, now: number): Promise<{ table: IndexTable; fetchedAt: string | null; note: string | null }> {
  let saved: Cache | null = null;
  try { saved = decodeCache(await store.get(CACHE_KEY)); } catch { /* read as no copy */ }
  if (saved && saved.v === VERSION && now - Date.parse(saved.fetchedAt) < DAY_MS) return { table: fromRows(saved.rows), fetchedAt: saved.fetchedAt, note: null };
  try {
    const table = await fetchIndexTable(fetcher), fetchedAt = new Date(now).toISOString();
    try { await store.set(CACHE_KEY, { fetchedAt, v: VERSION, rows: toRows(table) }); } catch { /* shown anyway, fetched again next time */ }
    return { table, fetchedAt, note: null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return saved ? { table: fromRows(saved.rows), fetchedAt: saved.fetchedAt, note: `could not refresh the index: ${reason}` } : { table: new Map(), fetchedAt: null, note: `could not load the index: ${reason}` };
  }
}
