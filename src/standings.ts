import { aaEffortFor, aaFor, aaPricesFor, isFreeCopy, storedAaModels, type AaModel } from './artificial-analysis.js';
import { parseUsd, pricesAt } from './costs.js';
import { familyOf, modelKey, openRouterFor, storedIndexTable, type IndexTable } from './intelligence.js';
import type { ListedModel, ModelCostView } from './inventory.js';
import { OWN_REPLIES, type Standing, type Standings } from './ranking.js';
import { getUsage, modelName, type Prices, type RelayStore, type UsageRow } from './relay-store.js';
import type { ModelChoice } from './settings.js';

// What Relay knows of each model: its stored copies of Artificial Analysis's list, of OpenRouter's list and of its own usage totals. Storage
// only, so placing a message or starting a helper never waits on the network (AGENTS.md). The lists are refreshed where they always were:
// the panel's model tables, and a saved key.

export type Stored = { aa: readonly AaModel[]; table: IndexTable; usage: readonly UsageRow[] };

/** The three stored copies, read together. A part that cannot be read counts as empty. */
export async function readStored(store: Pick<RelayStore, 'get'>): Promise<Stored> {
  const [aa, table, usage] = await Promise.all([
    storedAaModels(store).catch((): AaModel[] => []),
    storedIndexTable(store).catch((): IndexTable => new Map()),
    getUsage(store).then(found => found.rows, (): UsageRow[] => []),
  ]);
  return { aa, table, usage };
}

/** Where a fact came from. "free" is a model OpenCode offers free by its name, priced $0. */
export type Facts = {
  prices: Prices | null; pricesFrom: 'opencode' | 'artificial-analysis' | 'openrouter' | 'free' | null;
  context: number | null; contextFrom: 'opencode' | 'openrouter' | null;
  index: number | null; coding: number | null; indexFrom: 'artificial-analysis' | 'openrouter' | null; matched: string | null;
  /** The index is the effort's own entry; false when it stands for the highest effort (the plain entry, or OpenRouter's one index a model). */
  ownEffort: boolean;
};
const FREE: Prices = { inputPerMillion: '0', outputPerMillion: '0', cacheReadPerMillion: '0', cacheWritePerMillion: '0' };
const hasPrice = (prices: Prices | null | undefined): prices is Prices => !!prices && (prices.inputPerMillion !== null || prices.outputPerMillion !== null);
const hasIndex = (found: { index: number | null }) => found.index !== null;

/**
 * One model at one effort, every source in one order, so the panel, the usage records and Relay's own choice agree, and a new provider's
 * models need nothing of their own:
 * - prices: OpenCode's own (what is paid; a $0 listing is its answer), else $0 for a free model, else Artificial Analysis's, else OpenRouter's;
 * - context: OpenCode's, else OpenRouter's;
 * - index: Artificial Analysis's entry for the effort, else its plain entry (the highest effort), else OpenRouter's.
 * Every list is matched by `findModel`'s ladder. Nothing is made up: a fact no source has stays null.
 */
export function factsOf(model: { providerID: string; id: string; name: string; cost?: ModelCostView | null; limit?: { context: number } }, variant: string | null, lists: Pick<Stored, 'aa' | 'table'>): Facts {
  const asked = { providerID: model.providerID, id: model.id, name: model.name, variant };
  // shortcut: prices at the base size, with no chat counted; a model that charges more above some size is compared at its base price.
  const own = model.cost ? pricesAt(model.cost, 0) : null;
  const free = isFreeCopy(model) && (!hasPrice(own) || (own.inputPerMillion === '0' && own.outputPerMillion === '0'));
  const aaPrices = free || hasPrice(own) ? null : aaPricesFor(asked, lists.aa);
  const orPrices = free || hasPrice(own) || aaPrices ? null : openRouterFor(model, lists.table, listed => hasPrice(listed.prices))?.prices ?? null;
  const [prices, pricesFrom]: [Prices | null, Facts['pricesFrom']] = free ? [FREE, 'free'] : hasPrice(own) ? [own, 'opencode'] : aaPrices ? [aaPrices, 'artificial-analysis'] : orPrices ? [orPrices, 'openrouter'] : [own, null];
  const routed = (model.limit?.context ?? 0) > 0 ? null : openRouterFor(model, lists.table, listed => listed.context !== null);
  const effort = aaEffortFor(asked, lists.aa, hasIndex), plain = effort ?? aaFor({ ...asked, variant: null }, lists.aa, hasIndex);
  const other = plain ? null : openRouterFor(model, lists.table, hasIndex);
  return {
    prices, pricesFrom,
    context: routed ? routed.context : (model.limit?.context ?? 0) > 0 ? model.limit!.context : null, contextFrom: routed ? 'openrouter' : (model.limit?.context ?? 0) > 0 ? 'opencode' : null,
    index: plain?.index ?? other?.index ?? null, coding: aaFor(asked, lists.aa, listed => listed.coding !== null)?.coding ?? null,
    indexFrom: plain ? 'artificial-analysis' : other ? 'openrouter' : null, matched: plain?.slug ?? other?.id ?? null, ownEffort: !!effort || (!!plain && variant === 'max'),
  };
}

/**
 * What the panel says of a model with no index; never used to rank (owner, 26 Nov 2026: "a hint for all models and provider according to the
 * latest version of that model or according to parameters"). Tried in order:
 * - family: its scored newer or older versions (`familyOf`), as a bound; a newer version scored higher in 9 of 9 steps checked on 26 Nov;
 * - price: the middle half of the scores of models at about its price (blended 3 in : 1 out, within half again), with five or more of them;
 * - none, with the reason: a decision model, a free model, no price, or too few models at its price.
 */
export type IndexHint = { kind: 'family' | 'price' | 'none'; low: number | null; high: number | null; older: string | null; newer: string | null; count: number; reason: 'free' | 'decision' | 'no-price' | 'few-peers' | null };
type Scored = { name: string; index: number; blended: bigint | null; family: string; version: number[] };
const EFFORT_SLUG = /-(minimal|low|medium|high|xhigh|max|non-reasoning|reasoning)$/;
/** A typical request's price, in a form that compares exactly: three parts input to one part output. Null when either is unknown, or both are $0. */
const blendOf = (prices: Prices | null): bigint | null => {
  if (prices?.inputPerMillion == null || prices.outputPerMillion == null) return null;
  const blended = 3n * parseUsd(prices.inputPerMillion) + parseUsd(prices.outputPerMillion);
  return blended > 0n ? blended : null;
};
const scoredCache = new WeakMap<readonly AaModel[], WeakMap<IndexTable, Scored[]>>();
/** Every scored model both lists hold, once: Artificial Analysis's plain entries (its highest effort) first, then OpenRouter's. */
function scoredOf(lists: Pick<Stored, 'aa' | 'table'>): Scored[] {
  const byTable = scoredCache.get(lists.aa) ?? new WeakMap<IndexTable, Scored[]>();
  scoredCache.set(lists.aa, byTable);
  const cached = byTable.get(lists.table);
  if (cached) return cached;
  const found = new Map<string, Scored>();
  const add = (name: string, index: number, prices: Prices | null) => { const key = modelKey(name); if (key && !found.has(key)) found.set(key, { name, index, blended: blendOf(prices), ...familyOf(name) }); };
  for (const listed of lists.aa) if (listed.index !== null && !EFFORT_SLUG.test(listed.slug)) add(listed.slug, listed.index, listed.prices);
  for (const listed of lists.table.values()) if (listed.index !== null) add(listed.id, listed.index, listed.prices);
  const scored = [...found.values()];
  byTable.set(lists.table, scored);
  return scored;
}
const compareVersions = (a: readonly number[], b: readonly number[]) => { for (let at = 0; at < Math.max(a.length, b.length); at++) { const d = (a[at] ?? -1) - (b[at] ?? -1); if (d) return d; } return 0; };
const tenth = (value: number) => Math.round(value * 10) / 10;
const quartile = (sorted: readonly number[], at: number) => { const place = (sorted.length - 1) * at, low = Math.floor(place); return sorted[low]! + (sorted[Math.min(low + 1, sorted.length - 1)]! - sorted[low]!) * (place - low); };

/** The hint for `model` (see `IndexHint`), or null when it has an index. `decision` is a decision model, which the index does not score. */
export function indexHint(model: { id: string; name: string }, facts: Pick<Facts, 'index' | 'prices' | 'pricesFrom'>, lists: Pick<Stored, 'aa' | 'table'>, decision = false): IndexHint | null {
  if (facts.index !== null) return null;
  const none = (reason: NonNullable<IndexHint['reason']>): IndexHint => ({ kind: 'none', low: null, high: null, older: null, newer: null, count: 0, reason });
  if (decision) return none('decision');
  const scored = scoredOf(lists), mine = [familyOf(model.id), familyOf(model.name)].find(found => found.version.length);
  if (mine) {
    const relatives = scored.filter(other => other.family === mine.family && other.version.length && compareVersions(other.version, mine.version) !== 0);
    const older = relatives.filter(other => compareVersions(other.version, mine.version) < 0).sort((a, b) => compareVersions(b.version, a.version))[0];
    const newer = relatives.filter(other => compareVersions(other.version, mine.version) > 0).sort((a, b) => compareVersions(a.version, b.version))[0];
    if (older || newer) return { kind: 'family', low: older?.index ?? null, high: newer?.index ?? null, older: older?.name ?? null, newer: newer?.name ?? null, count: 0, reason: null };
  }
  if (facts.pricesFrom === 'free' || isFreeCopy(model)) return none('free');
  const blended = blendOf(facts.prices);
  if (blended === null) return none('no-price');
  // Within half again either way, in exact arithmetic: 2/3 of the price ≤ a peer's ≤ 3/2 of it.
  const peers = scored.flatMap(other => other.blended !== null && 3n * other.blended >= 2n * blended && 2n * other.blended <= 3n * blended ? [other.index] : []).sort((a, b) => a - b);
  if (peers.length < 5) return none('few-peers');
  return { kind: 'price', low: tenth(quartile(peers, 0.25)), high: tenth(quartile(peers, 0.75)), older: null, newer: null, count: peers.length, reason: null };
}

/** Each choice's standing, by `modelName(choice)`: its facts (`factsOf`) at its effort, and the output its own replies take a request. */
export function standingsOf(stored: Stored, models: readonly ListedModel[], choices: readonly ModelChoice[]): Standings {
  const standings = new Map<string, Standing>();
  for (const choice of choices) {
    const listed = models.find(model => model.providerID === choice.providerID && model.id === choice.id);
    const facts = factsOf({ providerID: choice.providerID, id: choice.id, name: listed?.name ?? choice.id, cost: listed?.cost ?? null, limit: listed?.limit }, choice.variant, stored);
    const row = stored.usage.find(item => item.model === modelName(choice));
    const outPerRequest = row && row.messages >= OWN_REPLIES && row.requests > 0 ? (row.output + row.reasoning) / row.requests : null;
    standings.set(modelName(choice), { index: facts.index, coding: facts.coding, inputPerMillion: facts.prices?.inputPerMillion ?? null, outputPerMillion: facts.prices?.outputPerMillion ?? null, outPerRequest });
  }
  return standings;
}
