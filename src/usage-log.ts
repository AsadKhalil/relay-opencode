import type { AaModel } from './artificial-analysis.js';
import { agentOf, newestAnchors, replyOf } from './chat-facts.js';
import { costOf, formatUsd, parseUsd, storedUsd } from './costs.js';
import type { ListedModel } from './inventory.js';
import { modes, type Decision, type Mode, type PriceSource, type Prices, type Totals } from './relay-store.js';

// Usage records (docs/superpowers/specs/2026-11-24-relay-usage-tab-design.md): one dated record for each message of every chat, with what
// its reply took. Numbers, models, ids and the project's folder only: never the text of a message, a reply, a file name or a chat's title.
// Each record has a key of its own, so two OpenCode windows never write over each other's replies.

/** Plugin storage as the host gives it (`context.storage`). */
export type LogStore = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  scan(options: { prefix: string; after?: string; limit?: number }): Promise<{ entries: readonly { key: string; value: unknown }[]; next?: string }>;
};
export type UsageKind = 'chat' | 'helper' | 'summary';
const kinds: readonly UsageKind[] = ['chat', 'helper', 'summary'];
const sources: readonly PriceSource[] = ['opencode', 'artificial-analysis'];
/**
 * One message and what its reply took. `at` is the message's own time. `kind` is `summary` for a finished compaction (its own request and the
 * rest of the reply it cut), `helper` in a chat that has a parent chat, else `chat`. `relay` is the mode and note of the Relay record that
 * names the message, when Relay placed it or decided to leave it alone.
 */
export type UsageRecord = {
  at: string; sessionID: string; messageID: string; project: string; kind: UsageKind; agent: string | null; model: string | null;
  requests: number; input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number;
  costByPrice: string | null; openCodeUsd: string | null; pricesFrom: PriceSource | null; relay: { mode: Mode | null; note: string | null } | null;
};
export const LOG_PREFIX = 'relay/usage-log/', KEEP_DAYS = 90;
const DAY_MS = 86_400_000, NEWEST = 3, PAGE = 200;
/** The key sorts by the message's time, so a time range is one prefix scan. */
export const logKey = (record: Pick<UsageRecord, 'at' | 'sessionID' | 'messageID'>) => `${LOG_PREFIX}${record.at}/${record.sessionID}/${record.messageID}`;
const timeOfKey = (key: string) => key.slice(LOG_PREFIX.length).split('/', 1)[0] ?? '';

/** Tokens times each kind's price (output with its reasoning), as Usage by model works them out; null when no kind has a price. */
function priceTotal(total: Totals, prices: Prices | null): string | null {
  const parts = [costOf(total.input, prices?.inputPerMillion ?? null), costOf(total.output + total.reasoning, prices?.outputPerMillion ?? null),
    costOf(total.cacheRead, prices?.cacheReadPerMillion ?? null), costOf(total.cacheWrite, prices?.cacheWritePerMillion ?? null)].filter((part): part is bigint => part !== null);
  return parts.length ? formatUsd(parts.reduce((sum, part) => sum + part, 0n)) : null;
}

/** The records of a chat's three newest messages that have counts. `decisions` are Relay's records of the same chat. */
export function buildRecords(messages: unknown, chat: { sessionID: string; project: string; helper: boolean }, prices: { models: readonly ListedModel[] | null; borrowed: readonly AaModel[] | null }, decisions: readonly Decision[]): UsageRecord[] {
  return newestAnchors(messages, NEWEST).flatMap(anchor => {
    const reply = replyOf(messages, anchor.id, prices.models, prices.borrowed), total = reply?.total;
    if (!reply || !total) return [];
    const placed = decisions.find(item => item.messageID === anchor.id);
    return [{
      at: new Date(anchor.created).toISOString(), sessionID: chat.sessionID, messageID: anchor.id, project: chat.project, kind: anchor.summary ? 'summary' : chat.helper ? 'helper' : 'chat',
      agent: agentOf(messages, anchor.id), model: reply.model, requests: reply.requests, input: total.input, output: total.output, reasoning: total.reasoning,
      cacheRead: total.cacheRead, cacheWrite: total.cacheWrite, costByPrice: priceTotal(total, reply.prices), openCodeUsd: total.costUsd, pricesFrom: reply.pricesFrom,
      relay: placed ? { mode: placed.mode, note: placed.note } : null,
    } satisfies UsageRecord];
  });
}

/**
 * What to write when `next` was read for a message that may have a record already; null when there is nothing new. A record grows when its
 * reply made more requests (the host can wake a chat for the same message) or when a Relay part turns up late. It never loses a Relay part
 * and never goes back to fewer requests, so the last of two windows to write keeps the larger record.
 */
export function grown(old: UsageRecord | null, next: UsageRecord): UsageRecord | null {
  if (!old) return next;
  if (next.requests > old.requests) return { ...next, relay: old.relay ?? next.relay };
  return !old.relay && next.relay ? { ...old, relay: next.relay } : null;
}

const text = (value: unknown) => typeof value === 'string' ? value : null;
const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
/** A stored record, or null when the value is not one (another build's, or damaged). */
function readable(value: unknown): UsageRecord | null {
  const item = value as Partial<Record<keyof UsageRecord, unknown>> | null;
  if (!item || typeof item !== 'object') return null;
  const at = text(item.at), sessionID = text(item.sessionID), messageID = text(item.messageID), project = text(item.project);
  const counts = [item.requests, item.input, item.output, item.reasoning, item.cacheRead, item.cacheWrite].map(amount);
  if (!at || Number.isNaN(Date.parse(at)) || !sessionID || !messageID || project === null || !kinds.includes(item.kind as UsageKind) || counts.some(count => count === null)) return null;
  const relay = item.relay as { mode?: unknown; note?: unknown } | null | undefined;
  const [requests, input, output, reasoning, cacheRead, cacheWrite] = counts as number[];
  return {
    at, sessionID, messageID, project, kind: item.kind as UsageKind, agent: text(item.agent), model: text(item.model), requests, input, output, reasoning, cacheRead, cacheWrite,
    costByPrice: storedUsd(item.costByPrice), openCodeUsd: storedUsd(item.openCodeUsd), pricesFrom: sources.includes(item.pricesFrom as PriceSource) ? item.pricesFrom as PriceSource : null,
    relay: relay && typeof relay === 'object' ? { mode: modes.includes(relay.mode as Mode) ? relay.mode as Mode : null, note: text(relay.note) } : null,
  };
}

/** Writes each record that is new or has grown. Once a record exists it is read first, so nothing kept is lost. */
export async function saveRecords(store: Pick<LogStore, 'get' | 'set'>, records: readonly UsageRecord[]): Promise<void> {
  for (const record of records) {
    const key = logKey(record), write = grown(readable(await store.get(key)), record);
    if (write) await store.set(key, write);
  }
}

/** Removes records older than 90 days, oldest first, `max` at most; returns how many went. */
export async function pruneRecords(store: Pick<LogStore, 'scan' | 'remove'>, now: number, max = 1000): Promise<number> {
  const before = new Date(now - KEEP_DAYS * DAY_MS).toISOString();
  let removed = 0, after: string | undefined;
  while (removed < max) {
    const page = await store.scan({ prefix: LOG_PREFIX, after, limit: Math.min(PAGE, max - removed) });
    for (const { key } of page.entries) {
      if (timeOfKey(key) >= before) return removed;
      await store.remove(key); removed++;
    }
    if (!page.next || !page.entries.length) return removed;
    after = page.next;
  }
  return removed;
}

// shortcut: every call scans the range; fine to about 30,000 records, past that keep daily summaries beside them.
/** The records from `from` to `to` (both ISO times, both included), oldest first; values that are not records are skipped. */
export async function readRecords(store: Pick<LogStore, 'scan'>, from: string, to: string): Promise<UsageRecord[]> {
  const found: UsageRecord[] = [];
  let after: string | undefined = `${LOG_PREFIX}${from}`;
  for (;;) {
    const page = await store.scan({ prefix: LOG_PREFIX, after, limit: PAGE });
    for (const { key, value } of page.entries) {
      if (timeOfKey(key) > to) return found;
      const record = readable(value);
      if (record) found.push(record);
    }
    if (!page.next || !page.entries.length) return found;
    after = page.next;
  }
}

// ---- Adding up for the tab ----

/** What the tab asks for: a time range (ISO), the panel's offset from UTC in minutes (local = UTC + offset), the filters, and a page of records. */
export type UsageQuery = {
  from: string; to: string; tzOffsetMinutes: number; search: string; provider: string | null; effort: string | null; mode: string | null;
  relay: 'any' | 'on' | 'off'; kind: 'any' | UsageKind; project: string | null; offset: number; limit: number;
};
/** One local day, with each model's cost (null when none of it has a price), tokens of every kind, and requests. */
export type UsageDay = { day: string; models: { model: string; cost: string | null; tokens: number; requests: number }[] };
export type UsageTotal = { model: string; replies: number; requests: number; input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number; cost: string | null; aaPriced: boolean };
/** `first` is the oldest record given. `matching` counts every record the filters keep; `records` is one page of them, newest first. */
export type UsageSummary = { days: UsageDay[]; totals: UsageTotal[]; options: { providers: string[]; efforts: string[]; modes: string[]; projects: string[] }; records: UsageRecord[]; matching: number; first: string | null };

/** The cost the tab shows: by price when the model has one, else OpenCode's own when it is more than $0, else none. */
export function shownCost(record: UsageRecord): string | null {
  if (record.costByPrice !== null) return record.costByPrice;
  return record.openCodeUsd !== null && parseUsd(record.openCodeUsd) > 0n ? record.openCodeUsd : null;
}
const nameOf = (record: UsageRecord) => record.model ?? 'unknown model';
const providerOf = (record: UsageRecord) => record.model?.split('/', 1)[0] ?? 'unknown';
const effortOf = (record: UsageRecord) => { const hash = record.model?.lastIndexOf('#') ?? -1; return hash < 0 ? 'default' : record.model!.slice(hash + 1); };
const modeOf = (record: UsageRecord) => record.relay?.mode ?? record.agent ?? 'unknown';
const tokensOf = (record: UsageRecord) => record.input + record.output + record.reasoning + record.cacheRead + record.cacheWrite;
const sum = (costs: readonly (string | null)[]) => { const known = costs.filter((cost): cost is string => cost !== null); return known.length ? formatUsd(known.reduce((total, cost) => total + parseUsd(cost), 0n)) : null; };
const sorted = (values: Iterable<string>) => [...new Set(values)].sort();

/** The days, totals, filter lists and one page of records for a range. The filter lists come from every record given, so a filter never hides its own choices. */
export function summarize(records: readonly UsageRecord[], query: UsageQuery): UsageSummary {
  const dayOf = (time: string | number) => new Date((typeof time === 'number' ? time : Date.parse(time)) + query.tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
  const search = query.search.trim().toLowerCase();
  const kept = records.filter(record => (!search || nameOf(record).toLowerCase().includes(search))
    && (query.provider === null || providerOf(record) === query.provider) && (query.effort === null || effortOf(record) === query.effort)
    && (query.mode === null || modeOf(record) === query.mode) && (query.relay === 'any' || (query.relay === 'on') === (record.relay !== null))
    && (query.kind === 'any' || record.kind === query.kind) && (query.project === null || record.project === query.project));
  // Every day of the range, empty ones too, in the panel's own days.
  const days: UsageDay[] = [], last = dayOf(query.to);
  for (let day = dayOf(query.from); day <= last && days.length < KEEP_DAYS + 3; day = new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10)) days.push({ day, models: [] });
  const byDay = new Map(days.map(day => [day.day, new Map<string, UsageRecord[]>()]));
  const byModel = new Map<string, UsageRecord[]>();
  for (const record of kept) {
    const models = byDay.get(dayOf(record.at));
    if (models) models.set(nameOf(record), [...models.get(nameOf(record)) ?? [], record]);
    byModel.set(nameOf(record), [...byModel.get(nameOf(record)) ?? [], record]);
  }
  for (const day of days) day.models = [...byDay.get(day.day)!].map(([model, mine]) => ({ model, cost: sum(mine.map(shownCost)), tokens: mine.reduce((total, record) => total + tokensOf(record), 0), requests: mine.reduce((total, record) => total + record.requests, 0) }));
  const add = (mine: UsageRecord[], pick: (record: UsageRecord) => number) => mine.reduce((total, record) => total + pick(record), 0);
  const totals = [...byModel].map(([model, mine]): UsageTotal => ({
    model, replies: mine.length, requests: add(mine, record => record.requests), input: add(mine, record => record.input), output: add(mine, record => record.output),
    reasoning: add(mine, record => record.reasoning), cacheRead: add(mine, record => record.cacheRead), cacheWrite: add(mine, record => record.cacheWrite), cost: sum(mine.map(shownCost)),
    aaPriced: mine.some(record => record.costByPrice !== null && record.pricesFrom === 'artificial-analysis'),
  }));
  const costKey = (total: UsageTotal) => total.cost === null ? -1n : parseUsd(total.cost), tokens = (total: UsageTotal) => total.input + total.output + total.reasoning + total.cacheRead + total.cacheWrite;
  totals.sort((a, b) => costKey(b) > costKey(a) ? 1 : costKey(b) < costKey(a) ? -1 : tokens(b) - tokens(a));
  const newest = [...kept].sort((a, b) => a.at < b.at ? 1 : a.at > b.at ? -1 : 0);
  return {
    days, totals, records: newest.slice(query.offset, query.offset + query.limit), matching: kept.length, first: records.reduce<string | null>((oldest, record) => oldest === null || record.at < oldest ? record.at : oldest, null),
    options: { providers: sorted(records.map(providerOf)), efforts: sorted(records.map(effortOf)), modes: sorted(records.map(modeOf)), projects: sorted(records.map(record => record.project)) },
  };
}
