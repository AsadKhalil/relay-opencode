import { RelayRpc } from './contract.js';
export { RelayRpc } from './contract.js';
import type { Plugin } from '@opencode/plugin';
import { listProjectModels } from './inventory.js';
import { getRelaySettings, saveRelaySettings, recentDecisions, modelName, modes, chatSwitch, setChatSwitch, getUsage, type Mode, type RelaySettings, type RelayStore } from './relay-store.js';
import { candidates, checksStatus, describeError, linesFor, route, sizesFor } from './router.js';
import { rank } from './ranking.js';
import { factsOf, indexHint, pricesOf, readStored, standingsOf } from './standings.js';
import { decide, LATE, within } from './decider.js';
import { INDEX_SOURCE, loadIndexTable } from './intelligence.js';
import { AA_CREDIT, AA_SOURCE, getPriceKey, loadAaModels, setPriceKey } from './artificial-analysis.js';
import { dayCounter, filterRecords, oldestRecord, priceFromList, pruneRecords, readRecords, summarize, usageQueryOf, type LogStore } from './usage-log.js';
import { switchingOf } from './switching.js';

const chatID = (input: unknown) => { const id = (input as { sessionID: string }).sessionID.trim(); if (!id) throw new Error('Name the chat'); return id; };

/** The panel's and the pill's calls. Relay's settings are one set for every project; only the model lists come from this project's host. */
export function registerRpc(context: Pick<Plugin.Context, 'rpc' | 'location' | 'model' | 'storage' | 'experimental'>, options: { fetcher?: typeof fetch; now?: () => number; listMs?: number } = {}) {
  const relayStore = context.storage as unknown as RelayStore;
  // One fetch of the index at a time, shared by the calls that arrive while it runs.
  let indexLoad: ReturnType<typeof loadIndexTable> | undefined;
  const indexTable = () => indexLoad ??= loadIndexTable(context.storage as never, options.fetcher ?? fetch, (options.now ?? Date.now)()).finally(() => { indexLoad = undefined; });
  // The same for Artificial Analysis's list, which only a saved key may fetch.
  let aaLoad: ReturnType<typeof loadAaModels> | undefined;
  const aaModels = (key: string) => aaLoad ??= loadAaModels(context.storage, key, options.fetcher ?? fetch, (options.now ?? Date.now)()).finally(() => { aaLoad = undefined; });
  const relayView = async (settings: RelaySettings, chat: Awaited<ReturnType<typeof listProjectModels>>, deciders: Awaited<ReturnType<typeof listProjectModels>>) => ({ directory: context.location.directory, settings, decisions: await recentDecisions(relayStore), deciders, checks: checksStatus(settings, chat), priceKey: (await getPriceKey(relayStore)) !== null });
  return context.rpc.register(RelayRpc, guarded({
    listModels: async () => ({ directory: context.location.directory, models: await listProjectModels(context) }),
    // Each model's facts beyond OpenCode's own record, by `factsOf`: the index (Artificial Analysis's with a saved key, else OpenRouter's copy
    // of it), a price where OpenCode lists none (such as Claude through a subscription login), a context where it lists none, and the index of
    // each effort that has its own. The lists are loaded here, at most once a day each, so Relay's own choice can read them from storage.
    listIntelligence: async () => {
      const [key, chat, deciders] = await Promise.all([getPriceKey(relayStore), listProjectModels(context), listProjectModels(context, 'decision')]);
      const seen = new Set<string>(), models = [...chat, ...deciders].filter(model => { const name = `${model.providerID}/${model.id}`; return !seen.has(name) && !!seen.add(name); });
      const chatNames = new Set(chat.map(model => `${model.providerID}/${model.id}`));
      const [aa, found] = await Promise.all([key ? aaModels(key) : null, indexTable()]), list = aa?.models ?? [];
      const lists = { aa: list, table: found.table };
      const scores = models.flatMap(model => {
        const facts = factsOf(model, null, lists), lent = facts.pricesFrom === 'opencode' ? null : facts.pricesFrom;
        const efforts = model.variants.flatMap(variant => { const own = factsOf(model, variant, lists); return own.ownEffort && own.index !== null ? [{ variant, index: own.index }] : []; });
        const context = facts.contextFrom === 'openrouter' ? facts.context : null, hint = indexHint(model, facts, lists, !chatNames.has(`${model.providerID}/${model.id}`));
        return [{ providerID: model.providerID, id: model.id, index: facts.index, matched: facts.matched, from: facts.indexFrom, prices: lent ? facts.prices : null, pricesFrom: lent, context, efforts, hint }];
      });
      const source = list.length ? `${AA_SOURCE}; where its list has none, OpenRouter's copy of the same index` : INDEX_SOURCE;
      return { directory: context.location.directory, source, fetchedAt: list.length ? aa!.fetchedAt : found.fetchedAt, note: [aa?.note, found.note].filter(Boolean).join('; ') || null, scores };
    },
    // Usage by model, for the panel and /relay-stats. Storage only, so the panel can ask every few seconds.
    getRelayUsage: async () => {
      const [usage, key] = await Promise.all([getUsage(relayStore), getPriceKey(relayStore)]);
      return { directory: context.location.directory, ...usage, credit: key !== null || usage.rows.some(row => row.pricesFrom === 'artificial-analysis') ? AA_CREDIT : null };
    },
    // Which model of each mode gets big work and small work by itself. Worked out here, not in the panel: the panel has neither each
    // effort's own score nor the Coding index. Storage only, with the same rule as /relay (src/ranking.ts).
    // The usage tab: one range of usage records, added up and filtered here. Old records go first, 1,000 at most a call. Storage, and the
    // model list within two seconds (a late or failed list is none: the stored public lists still price what they can).
    getUsageLog: async input => {
      const query = usageQueryOf(input), log = context.storage as unknown as LogStore;
      const removed = await pruneRecords(log, (options.now ?? Date.now)());
      const listed = within(() => listProjectModels(context), options.listMs ?? 2000).then(found => found === LATE ? null : found, () => null);
      // Settings that cannot be read leave the Plan view out; the rest of the tab does not need them.
      const [kept, oldest, before, stored, models, settings] = await Promise.all([readRecords(log, query.from, query.to), oldestRecord(log), getUsage(relayStore), readStored(relayStore), listed, getRelaySettings(relayStore).catch(() => null)]);
      // A record with no cost (no price when it was kept, such as a reply on a subscription login) is priced as it is read; nothing is written.
      // Each model is looked up once a call: a range can hold thousands of such replies, and this runs on the service's own thread.
      const facts = new Map<string, ReturnType<typeof pricesOf>>();
      const priced = (model: string) => { let found = facts.get(model); if (!found) facts.set(model, found = pricesOf(model, models, stored)); return found; };
      const records = priceFromList(kept, priced), summary = summarize(records, query);
      // Without the model list, the comparison models' prices are not known, so the switching part says so instead of guessing.
      const plan = settings?.modes.plan[0], switching = models === null ? null : switchingOf(records, filterRecords(records, query), {
        plan: plan ? modelName(plan) : null, priceOf: model => priced(model).prices, dayOf: dayCounter(query), days: summary.days.map(day => day.day),
      });
      // Artificial Analysis's data is credited wherever it shows: a reply priced from its list, or a model the switching part was priced at.
      const fromAa = records.some(record => record.costByPrice !== null && record.pricesFrom === 'artificial-analysis') || [...facts.values()].some(found => found.pricesFrom === 'artificial-analysis');
      const credit = fromAa || before.rows.some(row => row.pricesFrom === 'artificial-analysis') ? AA_CREDIT : null;
      return { directory: context.location.directory, ...summary, first: oldest ?? summary.first, before, credit, removed, switching };
    },
    getOwnChoice: async () => {
      const [settings, models, stored] = await Promise.all([getRelaySettings(relayStore), listProjectModels(context), readStored(relayStore)]);
      const standings = standingsOf(stored, models, modes.flatMap(mode => settings.modes[mode])), nothingAttached = { needsImage: false, tokens: 0 };
      const part = (mode: Mode) => {
        const list = settings.modes[mode], ranked = rank(mode, list, candidates(mode, list, models, nothingAttached).usable, standings, null);
        if (ranked === null) return null;
        return ranked.kind === 'unranked' ? { kind: 'unranked' as const, reason: ranked.reason } : { kind: 'ranked' as const, strongest: modelName(ranked.strongest), cheapest: modelName(ranked.cheapest) };
      };
      return { directory: context.location.directory, modes: { plan: part('plan'), execute: part('execute'), review: part('review') } };
    },
    // The key is saved and the list loaded with it at once, so a refused key shows now. The key is never sent back.
    setPriceKey: async input => {
      await setPriceKey(context.storage, (input as { key: string | null }).key);
      const saved = await getPriceKey(relayStore);
      return { saved: saved !== null, note: saved === null ? null : (await aaModels(saved)).note };
    },
    getRelay: async () => {
      const [settings, chat, deciders] = await Promise.all([getRelaySettings(relayStore), listProjectModels(context), listProjectModels(context, 'decision')]);
      return relayView(settings, chat, deciders);
    },
    saveRelay: async input => {
      const { revision, ...next } = input as { revision: number; modes: unknown; decider: unknown };
      const [chat, deciders] = await Promise.all([listProjectModels(context), listProjectModels(context, 'decision')]);
      return relayView(await saveRelaySettings(relayStore, revision, next, chat, deciders), chat, deciders);
    },
    // The pill: one chat's switch, that chat's newest record, and whether Relay can switch anything at all.
    getRelayChat: async input => {
      const sessionID = chatID(input);
      const [on, decisions, settings] = await Promise.all([chatSwitch(relayStore, sessionID), recentDecisions(relayStore), getRelaySettings(relayStore)]);
      return { on, last: decisions.find(item => item.sessionID === sessionID) ?? null, decider: settings.decider !== null };
    },
    getRelayDecisions: async () => ({ directory: context.location.directory, decisions: await recentDecisions(relayStore) }),
    setRelayChat: async input => {
      const sessionID = chatID(input), on = (input as { on: boolean }).on;
      await setChatSwitch(relayStore, sessionID, on);
      return { on };
    },
    testDecider: async input => {
      const text = (input as { text: string }).text;
      if (!text.trim()) throw new Error('Type a sample message');
      const [settings, models, stored] = await Promise.all([getRelaySettings(relayStore), listProjectModels(context), readStored(relayStore)]);
      // The same path as /relay with nothing attached and no chat: the lines or sizes asked about and the pick come from the router.
      const attachment = { needsImage: false, tokens: 0 }, standings = standingsOf(stored, models, modes.flatMap(mode => settings.modes[mode]));
      const answer = await decide({ decisions: request => context.experimental.generate.decisions(request as never) }, settings.decider, { kind: 'chat', text, agent: null, files: [], images: 0, lines: linesFor(settings, models, attachment), sizes: sizesFor(settings, models, attachment, null, standings) });
      const result = route(answer, settings, models, attachment, null, 'plan', standings);
      return { directory: context.location.directory, mode: result.mode, confidence: answer.kind === 'answer' ? answer.confidence : null, model: result.switch ? modelName(result.model) : null, fit: result.switch ? result.fit : null, ms: answer.ms, costUsd: answer.kind === 'answer' ? answer.costUsd : null, note: result.note };
    },
  }));
}

type Call = { error: (type: 'rejected', message: string, data: unknown) => unknown };
/** A handler that throws reaches the client as "RPC call failed" in the real host; return its message as the declared 'rejected' error so the panel can show it. */
function guarded<H>(handlers: H): H {
  return Object.fromEntries(Object.entries(handlers as Record<string, (input: unknown, call: Call) => Promise<unknown>>).map(([name, handler]) => [name, async (input: unknown, call: Call) => {
    try { return await handler(input, call); } catch (error) { return call.error('rejected', describeError(error, 'The request failed.').slice(0, 500), {}); }
  }])) as H;
}
