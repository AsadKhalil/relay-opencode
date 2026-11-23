import { aaFor, storedAaModels, type AaModel } from './artificial-analysis.js';
import { pricesAt } from './costs.js';
import { indexFor, storedIndexTable, type IndexTable } from './intelligence.js';
import type { ListedModel } from './inventory.js';
import { OWN_REPLIES, type Standing, type Standings } from './ranking.js';
import { getUsage, modelName, type RelayStore, type UsageRow } from './relay-store.js';
import type { ModelChoice } from './settings.js';

// What Relay's own choice (src/ranking.ts) knows of each model: its stored copies of Artificial Analysis's list, of OpenRouter's index and
// of its own usage totals. Storage only, so placing a message or starting a helper never waits on the network (AGENTS.md). The lists are
// refreshed where they always were: the panel's model tables, and a saved key.

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

/**
 * Each choice's standing, by `modelName(choice)`. With Artificial Analysis's list (there is one only while a key is saved) the scores are its
 * entry for the choice's effort, or its plain entry (the highest effort); without it, OpenRouter's index and no Coding index.
 */
export function standingsOf(stored: Stored, models: readonly ListedModel[], choices: readonly ModelChoice[]): Standings {
  const standings = new Map<string, Standing>();
  for (const choice of choices) {
    const listed = models.find(model => model.providerID === choice.providerID && model.id === choice.id), name = listed?.name ?? choice.id;
    const hit = stored.aa.length ? aaFor({ providerID: choice.providerID, id: choice.id, name, variant: choice.variant }, stored.aa) : null;
    const index = stored.aa.length ? hit?.index ?? null : indexFor({ id: choice.id, name }, stored.table)?.index ?? null;
    // shortcut: prices at the base size, with no chat counted; a model that charges more above some size is compared at its base price.
    const own = listed?.cost ? pricesAt(listed.cost, 0) : null;
    // Artificial Analysis's price only where OpenCode lists none, as the usage table borrows it; a $0 listing is OpenCode's own answer.
    const prices = (!own || (own.inputPerMillion === null && own.outputPerMillion === null)) && hit ? hit.prices : own;
    const row = stored.usage.find(item => item.model === modelName(choice));
    const outPerRequest = row && row.messages >= OWN_REPLIES && row.requests > 0 ? (row.output + row.reasoning) / row.requests : null;
    standings.set(modelName(choice), { index, coding: hit?.coding ?? null, inputPerMillion: prices?.inputPerMillion ?? null, outputPerMillion: prices?.outputPerMillion ?? null, outPerRequest });
  }
  return standings;
}
