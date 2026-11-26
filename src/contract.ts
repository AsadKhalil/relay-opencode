import { Rpc } from '@opencode/plugin/rpc';

const choice = { type: 'object', properties: { providerID: { type: 'string' }, id: { type: 'string' }, variant: { anyOf: [{ type: 'string' }, { type: 'null' }] } }, required: ['providerID', 'id', 'variant'], additionalProperties: false } as const;
const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] } as const;
const prices = { inputPerMillion: nullableString, outputPerMillion: nullableString, cacheReadPerMillion: nullableString, cacheWritePerMillion: nullableString } as const;
const priceNames = ['inputPerMillion', 'outputPerMillion', 'cacheReadPerMillion', 'cacheWritePerMillion'] as const;
/** One model as the panel sees it: display fields only, never the host's record. Prices are USD for one million tokens; null is unknown. `steps` are the prices for chats over a size. */
const modelItem = {
  type: 'object', properties: {
    providerID: { type: 'string' }, id: { type: 'string' }, name: { type: 'string' }, enabled: { type: 'boolean' }, status: { type: 'string' },
    variants: { type: 'array', items: { type: 'string' } },
    capabilities: { type: 'object', properties: { input: { type: 'array', items: { type: 'string' } }, output: { type: 'array', items: { type: 'string' } }, tools: { type: 'boolean' } }, required: ['input', 'output', 'tools'], additionalProperties: false },
    limit: { type: 'object', properties: { context: { type: 'number' }, output: { type: 'number' } }, required: ['context', 'output'], additionalProperties: false },
    cost: { type: 'object', properties: { ...prices, tiered: { type: 'boolean' }, steps: { type: 'array', items: { type: 'object', properties: { above: { type: 'number' }, ...prices }, required: ['above', ...priceNames], additionalProperties: false } } }, required: [...priceNames, 'tiered', 'steps'], additionalProperties: false },
  }, required: ['providerID', 'id', 'name', 'enabled', 'status', 'variants', 'capabilities', 'limit', 'cost'], additionalProperties: false,
} as const;
// One set of settings for every project (the host shares plugin storage), the last decisions, and the panel's test box.
const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] } as const;
const nullableMode = { anyOf: [{ type: 'string', enum: ['plan', 'execute', 'review'] }, { type: 'null' }] } as const;
const nullableChoice = { anyOf: [choice, { type: 'null' }] } as const;
/** A model chosen for a mode, with the person's "use it for" line. The line is optional in what the panel sends and always present in what comes back. */
const modeChoice = { type: 'object', properties: { ...choice.properties, useFor: { type: 'string' } }, required: ['providerID', 'id', 'variant', 'useFor'], additionalProperties: false } as const;
const modeChoiceInput = { type: 'object', properties: { ...choice.properties, useFor: { type: 'string' } }, required: ['providerID', 'id', 'variant'], additionalProperties: false } as const;
const modeLists = { type: 'object', properties: { plan: { type: 'array', items: modeChoice }, execute: { type: 'array', items: modeChoice }, review: { type: 'array', items: modeChoice } }, required: ['plan', 'execute', 'review'], additionalProperties: false } as const;
const modeListsInput = { type: 'object', properties: { plan: { type: 'array', items: modeChoiceInput }, execute: { type: 'array', items: modeChoiceInput }, review: { type: 'array', items: modeChoiceInput } }, required: ['plan', 'execute', 'review'], additionalProperties: false } as const;
/** Where a reply's prices came from: OpenCode's own list, or Artificial Analysis's when OpenCode lists none. */
const priceSource = { anyOf: [{ type: 'string', enum: ['opencode', 'artificial-analysis'] }, { type: 'null' }] } as const;
const priceList = { type: 'object', properties: prices, required: [...priceNames], additionalProperties: false } as const;
const totals = { type: 'object', properties: { input: { type: 'number' }, output: { type: 'number' }, reasoning: { type: 'number' }, cacheRead: { type: 'number' }, cacheWrite: { type: 'number' }, costUsd: nullableString }, required: ['input', 'output', 'reasoning', 'cacheRead', 'cacheWrite', 'costUsd'], additionalProperties: false } as const;
/** What the reply to a placed message took; null until the chat has answered it. `total` and `prices` are null in a reply kept before 19 Nov 2026. */
const reply = {
  type: 'object', properties: { requests: { type: 'number' }, fresh: { type: 'number' }, cached: { type: 'number' }, costUsd: nullableString, seconds: nullableNumber, model: nullableString, total: { anyOf: [totals, { type: 'null' }] }, prices: { anyOf: [priceList, { type: 'null' }] }, pricesFrom: priceSource },
  required: ['requests', 'fresh', 'cached', 'costUsd', 'seconds', 'model', 'total', 'prices', 'pricesFrom'], additionalProperties: false,
} as const;
/** One model and effort in Usage by model: every reply Relay counted, added up. `byPrice` is tokens times each reply's price, by kind. */
const usageRow = { type: 'object', properties: {
  model: { type: 'string' }, messages: { type: 'number' }, requests: { type: 'number' }, input: { type: 'number' }, output: { type: 'number' }, reasoning: { type: 'number' }, cacheRead: { type: 'number' }, cacheWrite: { type: 'number' }, openCodeUsd: nullableString,
  byPrice: { type: 'object', properties: { input: nullableString, output: nullableString, cacheRead: nullableString, cacheWrite: nullableString }, required: ['input', 'output', 'cacheRead', 'cacheWrite'], additionalProperties: false },
  prices: { anyOf: [priceList, { type: 'null' }] }, pricesFrom: priceSource,
}, required: ['model', 'messages', 'requests', 'input', 'output', 'reasoning', 'cacheRead', 'cacheWrite', 'openCodeUsd', 'byPrice', 'prices', 'pricesFrom'], additionalProperties: false } as const;
const decision = { type: 'object', properties: { at: { type: 'string' }, sessionID: { type: 'string' }, kind: { type: 'string', enum: ['chat', 'helper'] }, mode: nullableMode, confidence: nullableNumber, fit: nullableNumber, model: nullableString, ms: { type: 'number' }, costUsd: nullableString, note: nullableString, messageID: nullableString, reply: { anyOf: [reply, { type: 'null' }] } }, required: ['at', 'sessionID', 'kind', 'mode', 'confidence', 'fit', 'model', 'ms', 'costUsd', 'note', 'messageID', 'reply'], additionalProperties: false } as const;
const relayOutput = { type: 'object', properties: {
  directory: { type: 'string' },
  settings: { type: 'object', properties: { revision: { type: 'integer', minimum: 0 }, modes: modeLists, decider: nullableChoice }, required: ['revision', 'modes', 'decider'], additionalProperties: false },
  decisions: { type: 'array', items: decision }, deciders: { type: 'array', items: modelItem },
  checks: { type: 'object', properties: { active: { type: 'boolean' }, note: nullableString }, required: ['active', 'note'], additionalProperties: false },
  priceKey: { type: 'boolean' },
}, required: ['directory', 'settings', 'decisions', 'deciders', 'checks', 'priceKey'], additionalProperties: false } as const;
/** The host reports any exception thrown by a handler as an opaque "RPC call failed", so a refusal the panel must show is returned as this declared error instead. */
const errors = { rejected: { type: 'object', properties: {}, additionalProperties: false } } as const;
const nothing = { type: 'object', properties: {}, additionalProperties: false } as const;
/** One usage record (src/usage-log.ts): numbers, models, ids and the project's folder, never text. */
const usageRecord = { type: 'object', properties: {
  at: { type: 'string' }, sessionID: { type: 'string' }, messageID: { type: 'string' }, project: { type: 'string' }, kind: { type: 'string', enum: ['chat', 'helper', 'summary'] },
  agent: nullableString, model: nullableString, requests: { type: 'number' }, input: { type: 'number' }, output: { type: 'number' }, reasoning: { type: 'number' }, cacheRead: { type: 'number' }, cacheWrite: { type: 'number' },
  costByPrice: nullableString, openCodeUsd: nullableString, pricesFrom: priceSource,
  relay: { anyOf: [{ type: 'object', properties: { mode: nullableMode, note: nullableString }, required: ['mode', 'note'], additionalProperties: false }, { type: 'null' }] },
}, required: ['at', 'sessionID', 'messageID', 'project', 'kind', 'agent', 'model', 'requests', 'input', 'output', 'reasoning', 'cacheRead', 'cacheWrite', 'costByPrice', 'openCodeUsd', 'pricesFrom', 'relay'], additionalProperties: false } as const;
const usageTotal = { type: 'object', properties: {
  model: { type: 'string' }, replies: { type: 'number' }, requests: { type: 'number' }, input: { type: 'number' }, output: { type: 'number' }, reasoning: { type: 'number' }, cacheRead: { type: 'number' }, cacheWrite: { type: 'number' },
  cost: nullableString, aaPriced: { type: 'boolean' }, unpriced: { type: 'number' },
}, required: ['model', 'replies', 'requests', 'input', 'output', 'reasoning', 'cacheRead', 'cacheWrite', 'cost', 'aaPriced', 'unpriced'], additionalProperties: false } as const;
/** What the usage tab asks for: a range of at most 92 days, the panel's offset from UTC, the filters, and a page of at most 200 records. */
const usageQuery = { type: 'object', properties: {
  from: { type: 'string' }, to: { type: 'string' }, tzOffsetMinutes: { type: 'integer', minimum: -840, maximum: 840 }, timeZone: { anyOf: [{ type: 'string', maxLength: 64 }, { type: 'null' }] }, search: { type: 'string', maxLength: 200 },
  provider: nullableString, effort: nullableString, mode: nullableString, relay: { type: 'string', enum: ['any', 'on', 'off'] }, kind: { type: 'string', enum: ['any', 'chat', 'helper', 'summary'] },
  project: nullableString, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 200 },
}, required: ['from', 'to', 'tzOffsetMinutes', 'search', 'provider', 'effort', 'mode', 'relay', 'kind', 'project', 'offset', 'limit'], additionalProperties: false } as const;
const strings = { type: 'array', items: { type: 'string' } } as const;
const usageDay = { type: 'object', properties: { day: { type: 'string' }, models: { type: 'array', items: { type: 'object', properties: { model: { type: 'string' }, cost: nullableString, tokens: { type: 'number' }, requests: { type: 'number' } }, required: ['model', 'cost', 'tokens', 'requests'], additionalProperties: false } } }, required: ['day', 'models'], additionalProperties: false } as const;
const usageLog = { type: 'object', properties: {
  directory: { type: 'string' }, days: { type: 'array', items: usageDay }, totals: { type: 'array', items: usageTotal },
  options: { type: 'object', properties: { providers: strings, efforts: strings, modes: strings, projects: strings }, required: ['providers', 'efforts', 'modes', 'projects'], additionalProperties: false },
  records: { type: 'array', items: usageRecord }, matching: { type: 'number' }, first: nullableString,
  before: { type: 'object', properties: { since: nullableString, rows: { type: 'array', items: usageRow } }, required: ['since', 'rows'], additionalProperties: false },
  credit: nullableString, removed: { type: 'number' },
}, required: ['directory', 'days', 'totals', 'options', 'records', 'matching', 'first', 'before', 'credit', 'removed'], additionalProperties: false } as const;
/** Relay's own choice for one mode (src/ranking.ts): null when the mode is not Relay's to choose, else the models by name, or why it can't rank them. */
const ownPart = { anyOf: [
  { type: 'null' },
  { type: 'object', properties: { kind: { type: 'string', enum: ['unranked'] }, reason: { type: 'string' } }, required: ['kind', 'reason'], additionalProperties: false },
  { type: 'object', properties: { kind: { type: 'string', enum: ['ranked'] }, strongest: { type: 'string' }, cheapest: { type: 'string' } }, required: ['kind', 'strongest', 'cheapest'], additionalProperties: false },
] } as const;

export const RelayRpc = Rpc.define({
  id: 'relay-opencode',
  events: {},
  methods: {
    getRelay: { errors, input: nothing, output: relayOutput },
    saveRelay: { errors, input: { type: 'object', properties: { revision: { type: 'integer', minimum: 0 }, modes: modeListsInput, decider: nullableChoice }, required: ['revision', 'modes', 'decider'], additionalProperties: false }, output: relayOutput },
    /** The pill: one chat's switch, that chat's newest record, and whether a decider is chosen at all. */
    getRelayChat: { errors, input: { type: 'object', properties: { sessionID: { type: 'string' } }, required: ['sessionID'], additionalProperties: false }, output: { type: 'object', properties: { on: { type: 'boolean' }, last: { anyOf: [decision, { type: 'null' }] }, decider: { type: 'boolean' } }, required: ['on', 'last', 'decider'], additionalProperties: false } },
    /** The panel's Recent choices, newest first. Storage only, so the panel can ask every few seconds. */
    getRelayDecisions: { errors, input: nothing, output: { type: 'object', properties: { directory: { type: 'string' }, decisions: { type: 'array', items: decision } }, required: ['directory', 'decisions'], additionalProperties: false } },
    setRelayChat: { errors, input: { type: 'object', properties: { sessionID: { type: 'string' }, on: { type: 'boolean' } }, required: ['sessionID', 'on'], additionalProperties: false }, output: { type: 'object', properties: { on: { type: 'boolean' } }, required: ['on'], additionalProperties: false } },
    /** What Relay would do with a sample message: the mode after the 0.6 rule, the model it would pick, and the note. Nothing is switched, sent or recorded. */
    testDecider: { errors, input: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false }, output: { type: 'object', properties: { directory: { type: 'string' }, mode: nullableMode, confidence: nullableNumber, model: nullableString, fit: nullableNumber, ms: { type: 'number' }, costUsd: nullableString, note: nullableString }, required: ['directory', 'mode', 'confidence', 'model', 'fit', 'ms', 'costUsd', 'note'], additionalProperties: false } },
    /** Usage by model: the totals of every reply Relay counted, and the credit Artificial Analysis asks for when its prices are used. Storage only. */
    getRelayUsage: { errors, input: nothing, output: { type: 'object', properties: { directory: { type: 'string' }, since: nullableString, rows: { type: 'array', items: usageRow }, credit: nullableString }, required: ['directory', 'since', 'rows', 'credit'], additionalProperties: false } },
    /** For the panel: which model of each mode Relay gives big work and small work by itself, from the saved settings and the stored copies only. */
    /** The usage tab (Relay usage): every reply of every chat in a time range, added up and filtered on the server. Storage only; it also removes records past 90 days. */
    getUsageLog: { errors, input: usageQuery, output: usageLog },
    getOwnChoice: { errors, input: nothing, output: { type: 'object', properties: { directory: { type: 'string' }, modes: { type: 'object', properties: { plan: ownPart, execute: ownPart, review: ownPart }, required: ['plan', 'execute', 'review'], additionalProperties: false } }, required: ['directory', 'modes'], additionalProperties: false } },
    /** Saves the Artificial Analysis key, or with null removes it, and never returns it. `note` says why the list could not be loaded with it. */
    setPriceKey: { errors, input: { type: 'object', properties: { key: nullableString }, required: ['key'], additionalProperties: false }, output: { type: 'object', properties: { saved: { type: 'boolean' }, note: nullableString }, required: ['saved', 'note'], additionalProperties: false } },
    listModels: { errors, input: nothing, output: { type: 'object', properties: { directory: { type: 'string' }, models: { type: 'array', items: modelItem } }, required: ['directory', 'models'], additionalProperties: false } },
    /** The intelligence index of each listed model that could be matched, with where it came from, when it was fetched, and why it may be old or missing. */
    listIntelligence: { errors, input: nothing, output: { type: 'object', properties: {
      directory: { type: 'string' }, source: { type: 'string' }, fetchedAt: nullableString, note: nullableString,
      // What `factsOf` (src/standings.ts) adds to OpenCode's own record. `matched` and `from` say where the index came from; `prices` and
      // `pricesFrom` are only for a model OpenCode lists no price for; `context` only when OpenCode lists none; `efforts` are the efforts with an index of their own.
      scores: { type: 'array', items: { type: 'object', properties: {
        providerID: { type: 'string' }, id: { type: 'string' }, index: nullableNumber, matched: nullableString,
        from: { anyOf: [{ type: 'string', enum: ['artificial-analysis', 'openrouter'] }, { type: 'null' }] }, prices: { anyOf: [priceList, { type: 'null' }] },
        pricesFrom: { anyOf: [{ type: 'string', enum: ['artificial-analysis', 'openrouter', 'free'] }, { type: 'null' }] }, context: nullableNumber,
        efforts: { type: 'array', items: { type: 'object', properties: { variant: { type: 'string' }, index: { type: 'number' } }, required: ['variant', 'index'], additionalProperties: false } },
      }, required: ['providerID', 'id', 'index', 'matched', 'from', 'prices', 'pricesFrom', 'context', 'efforts'], additionalProperties: false } },
    }, required: ['directory', 'source', 'fetchedAt', 'note', 'scores'], additionalProperties: false } },
  },
});
