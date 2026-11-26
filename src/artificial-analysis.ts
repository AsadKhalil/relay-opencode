import { usdString } from './costs.js';
import { findModel, modelKey } from './intelligence.js';
import type { Prices } from './relay-store.js';

// Artificial Analysis's free model list: each model's prices and intelligence index, with a key the owner saves in the panel. The key is sent
// only to this address, in `x-api-key`, and never shown, returned, recorded or written into a note. Read with the owner's test key on 19 Nov
// 2026: 763 models in four pages of 200, one entry for each effort (`claude-sonnet-5-5` is Max, `claude-sonnet-5-5-high` is High).

export const AA_LIST_URL = 'https://artificialanalysis.ai/api/v2/language/models/free';
export const AA_SOURCE = 'Artificial Analysis Intelligence Index, from Artificial Analysis';
/** Artificial Analysis asks for this credit wherever its data is shown. */
export const AA_CREDIT = 'Prices and index: Artificial Analysis (artificialanalysis.ai)';
const MAX_PAGES = 5, MAX_CHARS = 8_000_000, DAY_MS = 24 * 3600_000;
const LIST_KEY = 'relay/aa-models', PRICE_KEY = 'relay/aa-key';

/** `index` is the Intelligence Index and `coding` the Coding Index; either can be missing. */
export type AaModel = { slug: string; name: string; creator: string; released: string | null; index: number | null; coding: number | null; prices: Prices };
type Store = { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void>; remove(key: string): Promise<void> };

const price = (value: unknown) => typeof value === 'number' ? usdString(value) : null;
const text = (value: unknown) => typeof value === 'string' ? value : null;
const score = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
/** One page of the list: its models, and whether another page follows. An entry with no slug or name is left out. */
export function parseAaPage(body: unknown): { models: AaModel[]; more: boolean } {
  const page = body as { data?: unknown; pagination?: { has_more?: unknown } } | null;
  const data: unknown[] = Array.isArray(page?.data) ? page.data : [];
  const models = data.flatMap(item => {
    const model = item as { slug?: unknown; name?: unknown; model_creator?: { name?: unknown }; release_date?: unknown; evaluations?: { artificial_analysis_intelligence_index?: unknown; artificial_analysis_coding_index?: unknown }; pricing?: Record<string, unknown> } | null;
    if (!model || typeof model.slug !== 'string' || typeof model.name !== 'string') return [];
    const pricing = model.pricing ?? {};
    return [{
      slug: model.slug, name: model.name, creator: text(model.model_creator?.name) ?? '', released: text(model.release_date),
      index: score(model.evaluations?.artificial_analysis_intelligence_index), coding: score(model.evaluations?.artificial_analysis_coding_index),
      prices: { inputPerMillion: price(pricing.price_1m_input_tokens), outputPerMillion: price(pricing.price_1m_output_tokens), cacheReadPerMillion: price(pricing.price_1m_cache_hit_tokens), cacheWritePerMillion: price(pricing.price_1m_cache_write_tokens) },
    }];
  });
  return { models, more: page?.pagination?.has_more === true };
}

const refusals: Record<number, string> = { 401: 'the key was refused', 403: 'the key may not read this list', 429: "today's 100 requests are used up" };
/** Every page of the list (five at most). An error names what went wrong, never the key. */
export async function fetchAaModels(key: string, fetcher: typeof fetch = fetch, ms = 15_000): Promise<AaModel[]> {
  const models: AaModel[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await fetcher(`${AA_LIST_URL}?page=${page}`, { headers: { 'x-api-key': key, accept: 'application/json' }, signal: AbortSignal.timeout(ms) });
    if (!response.ok) throw new Error(refusals[response.status] ?? `Artificial Analysis answered ${response.status}`);
    const body = await response.text();
    if (body.length > MAX_CHARS) throw new Error('the list is too big');
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { throw new Error('the reply is not a model list'); }
    const found = parseAaPage(parsed);
    models.push(...found.models);
    if (!found.more) break;
  }
  if (!models.length) throw new Error('the list has no models');
  return models;
}

const storedModel = (value: unknown): AaModel | null => {
  const model = value as Partial<Record<keyof AaModel, unknown>> | null, prices = model?.prices as Partial<Record<keyof Prices, unknown>> | null | undefined;
  if (!model || typeof model.slug !== 'string' || typeof model.name !== 'string' || !prices || typeof prices !== 'object') return null;
  return {
    // A copy stored before the Coding index was kept has none, until the next daily load.
    slug: model.slug, name: model.name, creator: text(model.creator) ?? '', released: text(model.released), index: score(model.index), coding: score(model.coding),
    prices: { inputPerMillion: text(prices.inputPerMillion), outputPerMillion: text(prices.outputPerMillion), cacheReadPerMillion: text(prices.cacheReadPerMillion), cacheWritePerMillion: text(prices.cacheWritePerMillion) },
  };
};
async function stored(store: Pick<Store, 'get'>): Promise<{ fetchedAt: string; models: AaModel[] } | null> {
  const value = await store.get(LIST_KEY) as { fetchedAt?: unknown; models?: unknown } | null;
  if (!value || typeof value.fetchedAt !== 'string' || !Number.isFinite(Date.parse(value.fetchedAt)) || !Array.isArray(value.models)) return null;
  return { fetchedAt: value.fetchedAt, models: value.models.map(storedModel).filter(model => model !== null) };
}
/** The stored list, with no request: what the idle hook reads. */
export async function storedAaModels(store: Pick<Store, 'get'>): Promise<AaModel[]> {
  try { return (await stored(store))?.models ?? []; } catch { return []; }
}
/** The list: the stored copy while it is under a day old, else a fresh fetch, stored; when that fails, the older copy with a note. */
export async function loadAaModels(store: Pick<Store, 'get' | 'set'>, key: string, fetcher: typeof fetch, now: number): Promise<{ models: AaModel[]; fetchedAt: string | null; note: string | null }> {
  let saved: Awaited<ReturnType<typeof stored>> = null;
  try { saved = await stored(store); } catch { /* read as no copy */ }
  if (saved && now - Date.parse(saved.fetchedAt) < DAY_MS) return { ...saved, note: null };
  try {
    const models = await fetchAaModels(key, fetcher), fetchedAt = new Date(now).toISOString();
    try { await store.set(LIST_KEY, { fetchedAt, models }); } catch { /* shown anyway, fetched again next time */ }
    return { models, fetchedAt, note: null };
  } catch (error) {
    const reason = error instanceof Error && !error.message.includes(key) ? error.message : 'the request failed';
    return saved ? { ...saved, note: `could not refresh the list from Artificial Analysis: ${reason}` } : { models: [], fetchedAt: null, note: `could not load the list from Artificial Analysis: ${reason}` };
  }
}

// The subscription login's models are named by family only; Claude Code picks the version, so the newest in the list stands for it.
const FAMILIES = new Set(['sonnet', 'haiku', 'opus', 'fable']);
type Asked = { providerID: string; id: string; name: string; variant: string | null };
type Useful = (listed: AaModel) => boolean;
// One key table a list, kept while the list is: a list is read once and asked about for every model and effort.
const tables = new WeakMap<readonly AaModel[], Map<string, AaModel | null>>();
function tableOf(models: readonly AaModel[]): Map<string, AaModel | null> {
  let table = tables.get(models);
  if (table) return table;
  table = new Map();
  for (const listed of models) for (const name of [listed.slug, listed.name]) {
    const key = modelKey(name), found = table.get(key);
    if (key && found !== null) table.set(key, found && found.slug !== listed.slug ? null : listed);
  }
  tables.set(models, table);
  return table;
}
/** The names `model` is looked up by: its id and name, or for a Claude login family, the newest listed model of it. Null when that family is not listed. */
function namesOf(model: Asked, models: readonly AaModel[]): string[] | null {
  if (model.providerID !== 'claude-agent' || !FAMILIES.has(model.id)) return [model.id, model.name];
  const base = new RegExp(`^claude-${model.id}-[\\d-]+$`);
  const newest = models.filter(listed => listed.creator === 'Anthropic' && base.test(listed.slug)).sort((a, b) => (b.released ?? '').localeCompare(a.released ?? '') || a.slug.length - b.slug.length)[0];
  return newest ? [newest.slug] : null;
}
/** OpenCode's effort as Artificial Analysis names an entry: its plain entry is the highest effort ("max"), and "none" is its non-reasoning entry. */
const effortSlug = (variant: string | null) => variant === null || variant === 'max' ? null : variant === 'none' ? 'non-reasoning' : variant;
/** The listed entry of `model` at its own effort, through the ladder of `findModel`; null when that effort has no entry of its own. */
export function aaEffortFor(model: Asked, models: readonly AaModel[], useful?: Useful): AaModel | null {
  const names = namesOf(model, models), effort = effortSlug(model.variant);
  return names && effort ? findModel(tableOf(models), names.map(name => `${name}-${effort}`), listed => listed.slug, useful) : null;
}
/**
 * The listed model that is `model` at its effort: its effort's own entry, else its plain entry, found by the ladder of `findModel` (as written,
 * without a date, in another word order, by its end). `useful` passes over an entry without what the caller needs. Two models at one step match nothing.
 */
export function aaFor(model: Asked, models: readonly AaModel[], useful?: Useful): AaModel | null {
  const names = namesOf(model, models);
  return names ? aaEffortFor(model, models, useful) ?? findModel(tableOf(models), names, listed => listed.slug, useful) : null;
}

/** A model OpenCode offers free (an id ending -free or :free, or Free in its name). `modelKey` reads it as the paid model: right for the index, wrong for a bill. */
export const isFreeCopy = (model: { id: string; name: string }) => /[-:]free$/i.test(model.id) || /\bfree\b/i.test(model.name);
const priced = (listed: AaModel) => listed.prices.inputPerMillion !== null || listed.prices.outputPerMillion !== null;
/** Artificial Analysis's prices for a model, from an entry that has some; null for a free copy or no match. Callers lend them only where OpenCode lists none. */
export const aaPricesFor = (model: Asked, models: readonly AaModel[]): Prices | null => isFreeCopy(model) ? null : aaFor(model, models, priced)?.prices ?? null;

const KEY_SHAPE = /^\S{8,200}$/;
/** The saved key, or null. */
export async function getPriceKey(store: Pick<Store, 'get'>): Promise<string | null> {
  const value = await store.get(PRICE_KEY);
  return typeof value === 'string' && KEY_SHAPE.test(value) ? value : null;
}
/** Saves the key, or with null removes it and the list fetched with it. The refusal never repeats what was typed. */
export async function setPriceKey(store: Store, key: string | null): Promise<void> {
  if (key === null) { await store.remove(PRICE_KEY); await store.remove(LIST_KEY); return; }
  const trimmed = key.trim();
  if (!KEY_SHAPE.test(trimmed)) throw new Error('That does not look like an Artificial Analysis key: it should be one word of 8 to 200 characters.');
  await store.set(PRICE_KEY, trimmed);
}
