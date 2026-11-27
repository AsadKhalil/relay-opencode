import { formatUsd, parseUsd } from './costs.js';
import type { Prices } from './relay-store.js';
import { priceTotal, shownCost, type UsageRecord } from './usage-log.js';

// How Relay's switching did over a range (docs/superpowers/specs/2026-11-26-relay-switch-savings-design.md): how often it moved a chat to
// another model, what the range cost, and what the same replies would have cost on the model each chat was compared with. Server code; the
// panel takes only the types.

/** One view: the Default model (each chat's start model; `model` null) or the Plan model (`model` names it). USD strings, never below 0. */
export type SwitchingView = {
  model: string | null;
  /** Most first, then by name. */
  switches: { model: string; count: number }[];
  /** Saved is `without` less `spent`, which can be below 0. */
  spent: string; without: string;
  days: { day: string; spent: string; without: string }[];
  chats: number; notCompared: number; leftOut: number; deciderUsd: string;
};
export type Switching = { default: SwitchingView; plan: SwitchingView | null };

/** What each record of the range is, worked out once from every record so a filter never changes it. */
type Fact = { switched: boolean; compared: boolean; shift: number; start: string | null };
/** A record by its chat and message, so a copy of it (a priced one, say) finds its facts too. */
const idOf = (record: UsageRecord) => `${record.sessionID}/${record.messageID}`;
const byTime = (a: UsageRecord, b: UsageRecord) => a.at < b.at ? -1 : a.at > b.at ? 1 : 0;

function factsOf(all: readonly UsageRecord[]): Map<string, Fact> {
  const chats = new Map<string, UsageRecord[]>();
  for (const record of all) { const list = chats.get(record.sessionID); if (list) list.push(record); else chats.set(record.sessionID, [record]); }
  const facts = new Map<string, Fact>();
  for (const list of chats.values()) {
    list.sort(byTime);
    // The chat's default: its start model, else (older history) the model of its last reply before Relay's first part.
    const firstRelay = list.findIndex(record => record.relay !== null);
    const start = list.find(record => record.relay?.start != null)?.relay!.start
      ?? (firstRelay < 0 ? null : list.slice(0, firstRelay).filter(record => record.kind === 'chat').at(-1)?.model ?? null);
    let previous: UsageRecord | null = null, compared = false;
    for (const record of list) {
      const chat = record.kind === 'chat', relay = record.relay;
      const switched = chat && relay !== null && record.model !== null
        && (relay.from !== null ? record.model !== relay.from : previous !== null && record.model !== previous.model);
      compared ||= switched || relay?.start != null;
      // shortcut: the model the chat stayed on is taken to have kept its cache; a long pause before a switch would have lost it, which makes the saving look smaller than it was.
      const moved = chat && previous !== null && record.model !== previous.model;
      const shift = moved ? Math.min(record.input + record.cacheWrite, previous!.input + previous!.cacheRead + previous!.cacheWrite) : 0;
      facts.set(idOf(record), { switched, compared, shift, start });
      if (chat) previous = record;
    }
  }
  return facts;
}

/** A record's tokens at other prices, with `shift` of its cache writes, then its input, read from the cache instead. */
function costAt(record: UsageRecord, prices: Prices, shift: number): string | null {
  const fromWrite = Math.min(shift, record.cacheWrite), fromInput = Math.min(shift - fromWrite, record.input);
  return priceTotal({ input: record.input - fromInput, output: record.output, reasoning: record.reasoning, cacheRead: record.cacheRead + fromWrite + fromInput, cacheWrite: record.cacheWrite - fromWrite }, prices);
}

/**
 * Both views for a range. `all` is every record of the range, which decides the switches and each chat's comparison model; `kept` is what the
 * filters keep, which is added up. Both are priced already. A compared record that has no price on one side is left out of the comparison and counted.
 */
export function switchingOf(all: readonly UsageRecord[], kept: readonly UsageRecord[], input: { plan: string | null; priceOf: (model: string) => Prices | null; dayOf: (at: string) => string; days: readonly string[] }): Switching {
  const facts = factsOf(all), prices = new Map<string, Prices | null>();
  const priceOf = (model: string) => { if (!prices.has(model)) prices.set(model, input.priceOf(model)); return prices.get(model)!; };
  const view = (model: string | null): SwitchingView => {
    const spentByDay = new Map(input.days.map(day => [day, 0n])), withoutByDay = new Map(input.days.map(day => [day, 0n]));
    const switches = new Map<string, number>(), chats = new Set<string>(), notCompared = new Set<string>();
    let spent = 0n, without = 0n, decider = 0n, leftOut = 0;
    const add = (day: string, paid: bigint, other: bigint) => { if (spentByDay.has(day)) { spentByDay.set(day, spentByDay.get(day)! + paid); withoutByDay.set(day, withoutByDay.get(day)! + other); } };
    for (const record of kept) {
      const fact = facts.get(idOf(record)), day = input.dayOf(record.at), cost = shownCost(record), paid = cost === null ? 0n : parseUsd(cost);
      const asked = record.relay?.deciderUsd ? parseUsd(record.relay.deciderUsd) : 0n;
      decider += asked; spent += paid + asked; add(day, paid + asked, 0n);
      if (fact?.switched) switches.set(record.model!, (switches.get(record.model!) ?? 0) + 1);
      let other = paid;
      const against = model ?? fact?.start ?? null;
      if (fact?.compared) {
        if (against === null) notCompared.add(record.sessionID);
        else {
          chats.add(record.sessionID);
          const listed = priceOf(against), there = cost === null || listed === null ? null : costAt(record, listed, fact.shift);
          if (there === null) leftOut++; else other = parseUsd(there);
        }
      }
      without += other; add(day, 0n, other);
    }
    return {
      model, switches: [...switches].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([name, count]) => ({ model: name, count })),
      spent: formatUsd(spent), without: formatUsd(without), days: input.days.map(day => ({ day, spent: formatUsd(spentByDay.get(day)!), without: formatUsd(withoutByDay.get(day)!) })),
      chats: chats.size, notCompared: notCompared.size, leftOut, deciderUsd: formatUsd(decider),
    };
  };
  return { default: view(null), plan: input.plan === null ? null : view(input.plan) };
}
