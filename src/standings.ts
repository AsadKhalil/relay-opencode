import { aaEffortFor, aaFor, aaPricesFor, isFreeCopy, storedAaModels, type AaModel } from './artificial-analysis.js';
import { pricesAt } from './costs.js';
import { openRouterFor, storedIndexTable, type IndexTable } from './intelligence.js';
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
