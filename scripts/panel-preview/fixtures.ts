// Sample answers for every RPC the two panels call. Model names, prices and indexes are shaped like OpenCode's and the public lists'
// (26 Nov 2026); the settings, choices and usage are made up. `state=empty` is a first run: nothing chosen, no decider, no usage.
const usd = (value: number | null) => value === null ? null : String(value);
const cost = (input: number | null, output: number | null, read: number | null = null, write: number | null = null) =>
  ({ inputPerMillion: usd(input), outputPerMillion: usd(output), cacheReadPerMillion: usd(read), cacheWritePerMillion: usd(write), tiered: false, steps: [] });
const model = (providerID: string, id: string, name: string, price: ReturnType<typeof cost>, context: number, variants: string[] = [], tools = true) =>
  ({ providerID, id, name, enabled: true, status: 'active', variants, capabilities: { input: ['text', 'image'], output: ['text'], tools }, limit: { context, output: 64000 }, cost: price });
const efforts = ['low', 'medium', 'high', 'xhigh', 'max'];

const chat = [
  model('claude-agent', 'sonnet', 'Sonnet 5.5', cost(null, null), 1_000_000, efforts),
  model('claude-agent', 'opus', 'Opus 5.5', cost(null, null), 1_000_000, efforts),
  model('claude-agent', 'haiku', 'Haiku 5.5', cost(null, null), 1_000_000, efforts),
  model('claude-agent', 'claude-sonnet-5', 'Sonnet 5', cost(null, null), 1_000_000, efforts),
  model('opencode-go', 'glm-5.3-flash', 'GLM-5.3-Flash', cost(0.15, 0.5, 0.03), 1_000_000, ['low', 'high', 'max']),
  model('opencode-go', 'kimi-k3.1-pro', 'Kimi K3.1 Pro', cost(2, 10, 0.2), 1_048_576, ['low', 'high', 'max']),
  model('opencode', 'gpt-6.2-sol', 'GPT-6.2 Sol', cost(2, 10, 0.1, 2.5), 1_050_000, efforts),
  model('opencode', 'gpt-5.5', 'GPT-5.5', cost(5, 30, 0.5), 1_050_000, efforts),
  model('opencode', 'claude-sonnet-5-5', 'Claude Sonnet 5.5', cost(2, 10, 0.1, 2.5), 1_000_000, efforts),
  model('opencode', 'deepseek-v4.1-flash', 'DeepSeek V4.1 Flash 1017', cost(0.12, 0.48), 1_000_000, ['low', 'high', 'max']),
  model('opencode', 'seaglass-alpha-free', 'Seaglass Alpha Free', cost(0, 0), 1_048_576, efforts),
  model('opencode', 'big-pickle', 'Big Pickle', cost(0, 0), 200_000),
  model('ollama-cloud', 'gpt-oss:120b', 'gpt-oss:120b', cost(0.15, 0.6, 0.014), 131_072, ['low', 'medium', 'high']),
  model('ollama-cloud', 'minimax-m3', 'MiniMax-M3', cost(0.6, 2.4), 512_000, [], false),
];
const deciders = [
  model('opencode', 'gemini-decision-1', 'Gemini Decision 1', cost(0.1, 0), 262_144),
  model('opencode', 'jev-1.14', 'Jev 1.14', cost(0.042, 0), 64_000),
  model('opencode', 'jev-1.13-free', 'Jev 1.13 Free', cost(0, 0), 64_000),
];

const api = (input: number, output: number) => ({ inputPerMillion: String(input), outputPerMillion: String(output), cacheReadPerMillion: String(input / 10), cacheWritePerMillion: String(input * 1.25) });
const hint = (part: Record<string, unknown>) => ({ kind: 'none', low: null, high: null, older: null, newer: null, count: 0, reason: null, ...part });
const score = (providerID: string, id: string, part: Record<string, unknown>) =>
  ({ providerID, id, index: null, matched: null, from: null, prices: null, pricesFrom: null, context: null, efforts: [], hint: null, ...part });
const scores = [
  score('claude-agent', 'sonnet', { index: 54.7, matched: 'claude-sonnet-5-5', from: 'artificial-analysis', prices: api(2, 10), pricesFrom: 'artificial-analysis', efforts: [{ variant: 'low', index: 25.6 }, { variant: 'medium', index: 30.9 }, { variant: 'high', index: 41.5 }, { variant: 'xhigh', index: 49.9 }, { variant: 'max', index: 54.7 }] }),
  score('claude-agent', 'opus', { index: 59.1, matched: 'claude-opus-5-5', from: 'artificial-analysis', prices: api(4, 20), pricesFrom: 'artificial-analysis' }),
  score('claude-agent', 'haiku', { index: 36.5, matched: 'claude-haiku-5-5', from: 'artificial-analysis', prices: api(0.1, 0.5), pricesFrom: 'artificial-analysis' }),
  score('claude-agent', 'claude-sonnet-5', { prices: api(2, 10), pricesFrom: 'artificial-analysis', hint: hint({ kind: 'family', high: 54.7, newer: 'claude-sonnet-5-5' }) }),
  score('opencode-go', 'glm-5.3-flash', { index: 27.7, matched: 'glm-5-3-flash', from: 'artificial-analysis', efforts: [{ variant: 'low', index: 20.1 }, { variant: 'max', index: 27.7 }] }),
  score('opencode-go', 'kimi-k3.1-pro', { index: 46.6, matched: 'kimi-k3-1-pro', from: 'artificial-analysis', efforts: [{ variant: 'max', index: 46.6 }] }),
  score('opencode', 'gpt-6.2-sol', { index: 57.3, matched: 'gpt-6-2-sol', from: 'artificial-analysis', efforts: [{ variant: 'low', index: 40.6 }, { variant: 'medium', index: 52.4 }, { variant: 'high', index: 54.8 }, { variant: 'xhigh', index: 55.6 }, { variant: 'max', index: 57.3 }] }),
  score('opencode', 'gpt-5.5', { hint: hint({ kind: 'price', low: 47.4, high: 61.2, count: 7 }) }),
  score('opencode', 'claude-sonnet-5-5', { index: 54.7, matched: 'claude-sonnet-5-5', from: 'artificial-analysis' }),
  score('opencode', 'deepseek-v4.1-flash', { index: 32.4, matched: 'deepseek-v4-1-flash-1017', from: 'artificial-analysis' }),
  score('opencode', 'seaglass-alpha-free', { prices: { inputPerMillion: '0', outputPerMillion: '0', cacheReadPerMillion: '0', cacheWritePerMillion: '0' }, pricesFrom: 'free', hint: hint({ reason: 'free' }) }),
  score('opencode', 'big-pickle', { hint: hint({ reason: 'no-price' }) }),
  score('ollama-cloud', 'gpt-oss:120b', { index: 3.8, matched: 'gpt-oss-120b', from: 'artificial-analysis' }),
  score('ollama-cloud', 'minimax-m3', { index: 19, matched: 'minimax-m3', from: 'artificial-analysis' }),
  score('opencode', 'gemini-decision-1', { hint: hint({ reason: 'decision' }) }),
  score('opencode', 'jev-1.14', { hint: hint({ reason: 'decision' }) }),
  score('opencode', 'jev-1.13-free', { hint: hint({ reason: 'decision' }) }),
];

const now = Date.now(), ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
const took = (model: string, requests: number, input: number, output: number, read: number, costUsd: string | null, prices: ReturnType<typeof api> | null, from: 'opencode' | 'artificial-analysis' | null) =>
  ({ requests, fresh: input, cached: read, costUsd, seconds: 1.4, model, total: { input, output, reasoning: 0, cacheRead: read, cacheWrite: 0, costUsd }, prices, pricesFrom: from });
const decisions = [
  { at: ago(4), sessionID: 'ses_sample1', kind: 'chat', mode: 'execute', confidence: 0.92, fit: null, model: 'opencode-go/glm-5.3-flash', ms: 840, costUsd: '0.00004', note: 'small work, so the cheapest', messageID: 'msg_1', reply: took('opencode-go/glm-5.3-flash', 3, 18_200, 1_450, 41_000, '0.0049', null, 'opencode') },
  { at: ago(19), sessionID: 'ses_sample1', kind: 'chat', mode: 'plan', confidence: 0.88, fit: 0.81, model: 'claude-agent/sonnet#high', ms: 910, costUsd: '0.00004', note: null, messageID: 'msg_2', reply: took('claude-agent/sonnet#high', 2, 9_400, 2_100, 22_000, null, api(2, 10), 'artificial-analysis') },
  { at: ago(47), sessionID: 'ses_sample2', kind: 'helper', mode: 'review', confidence: 0.97, fit: null, model: 'claude-agent/sonnet', ms: 760, costUsd: '0.00003', note: null, messageID: 'msg_3', reply: null },
  { at: ago(95), sessionID: 'ses_sample2', kind: 'chat', mode: 'execute', confidence: 0.71, fit: null, model: 'opencode-go/kimi-k3.1-pro#low', ms: 1_020, costUsd: '0.00005', note: 'big work, so the highest index', messageID: 'msg_4', reply: took('opencode-go/kimi-k3.1-pro#low', 6, 52_000, 6_800, 210_000, '0.2108', null, 'opencode') },
  { at: ago(160), sessionID: 'ses_sample3', kind: 'chat', mode: null, confidence: null, fit: null, model: null, ms: 0, costUsd: null, note: 'no decider chosen', messageID: 'msg_5', reply: null },
];
const settings = {
  revision: 86,
  modes: {
    plan: [{ providerID: 'claude-agent', id: 'sonnet', variant: 'high', useFor: 'hard design and architecture' }, { providerID: 'opencode', id: 'gpt-6.2-sol', variant: 'medium', useFor: 'everyday plans and questions' }],
    execute: [{ providerID: 'opencode-go', id: 'glm-5.3-flash', variant: null, useFor: '' }, { providerID: 'opencode-go', id: 'kimi-k3.1-pro', variant: 'low', useFor: '' }],
    review: [{ providerID: 'claude-agent', id: 'sonnet', variant: null, useFor: '' }],
  },
  decider: { providerID: 'opencode', id: 'gemini-decision-1', variant: null },
};
const emptySettings = { revision: 0, modes: { plan: [], execute: [], review: [] }, decider: null };

// Usage: seven days of three models, then the records.
const day = (offset: number) => new Date(now - offset * 86_400_000).toISOString().slice(0, 10);
const daily = [[0.21, 0.05, 0.02], [0.34, 0.09, 0.03], [0.12, 0.02, 0], [0, 0, 0], [0.48, 0.11, 0.05], [0.29, 0.07, 0.01], [0.17, 0.04, 0.02]];
const usageModels = ['opencode-go/kimi-k3.1-pro#low', 'claude-agent/sonnet#high', 'opencode-go/glm-5.3-flash'];
const days = daily.map((costs, at) => ({ day: day(6 - at), models: costs.flatMap((amount, which) => amount ? [{ model: usageModels[which]!, cost: String(amount), tokens: Math.round(amount * 2_400_000), requests: Math.max(1, Math.round(amount * 40)) }] : []) }));
const sum = (which: number) => daily.reduce((total, costs) => total + costs[which]!, 0);
const total = (which: number, replies: number, aaPriced: boolean) => ({ model: usageModels[which]!, replies, requests: replies * 3, input: Math.round(sum(which) * 1_900_000), output: Math.round(sum(which) * 120_000), reasoning: 0, cacheRead: Math.round(sum(which) * 4_000_000), cacheWrite: 0, cost: sum(which).toFixed(2), aaPriced, unpriced: 0 });
const record = (minutes: number, which: number, amount: string, mode: string | null, kind = 'chat') => ({
  at: ago(minutes), sessionID: 'ses_sample1', messageID: `msg_${minutes}`, project: 'C:/work/sample-app', kind, agent: mode === 'execute' ? 'build' : 'plan', model: usageModels[which]!, requests: 3,
  input: 18_000, output: 1_400, reasoning: 0, cacheRead: 41_000, cacheWrite: 0, costByPrice: amount, openCodeUsd: amount, pricesFrom: which === 1 ? 'artificial-analysis' : 'opencode', relay: mode ? { mode, note: null } : null,
});
const records = [record(4, 2, '0.0049', 'execute'), record(19, 1, '0.0412', 'plan'), record(47, 1, '0.0188', 'review', 'helper'), record(95, 0, '0.2108', 'execute'), record(140, 2, '0.0031', null), record(300, 0, '0.0954', 'execute'), record(420, 1, '0.0377', 'plan'), record(610, 2, '0.0022', 'execute')];
const usage = {
  days, totals: [total(0, 14, false), total(1, 9, true), total(2, 31, false)], records, matching: 54, first: ago(60 * 24 * 9),
  options: { providers: ['claude-agent', 'opencode-go'], efforts: ['default', 'high', 'low'], modes: ['build', 'execute', 'plan', 'review'], projects: ['C:/work/sample-app'] },
  before: { since: '2026-11-19T00:00:00.000Z', rows: [] }, credit: 'Prices and index: Artificial Analysis (artificialanalysis.ai)', removed: 0,
};
const emptyUsage = { ...usage, days: days.map(item => ({ day: item.day, models: [] })), totals: [], records: [], matching: 0, first: null, options: { providers: [], efforts: [], modes: [], projects: [] }, credit: null };

/** The RPC client a panel gets for `state`: every method answers after a short delay, as a real server would. `retired` adds a model that is not offered. */
export function rpcFor(state: 'set' | 'empty' | 'retired', directory: string) {
  let current = state === 'empty' ? structuredClone(emptySettings) : structuredClone(settings);
  // `retired`: a Review model OpenCode no longer offers, beside one it does.
  if (state === 'retired') current.modes.review.push({ providerID: 'opencode', id: 'gpt-5.1-codex', variant: null, useFor: 'second opinion on risky diffs' });
  const view = () => ({ directory, settings: current, decisions: state === 'empty' ? [] : decisions, deciders, checks: current.decider && current.modes.review.length ? { active: true, note: null } : { active: false, note: 'choose a decider and a Review model' }, priceKey: state !== 'empty' });
  const later = <T>(value: T) => new Promise<T>(resolve => setTimeout(() => resolve(structuredClone(value)), 120));
  return {
    listModels: () => later({ directory, models: chat }),
    getRelay: () => later(view()),
    saveRelay: (input: { modes: typeof settings.modes; decider: typeof settings.decider }) => { current = { revision: current.revision + 1, modes: input.modes, decider: input.decider } as typeof current; return later(view()); },
    listIntelligence: () => later({ directory, source: 'Artificial Analysis Intelligence Index, from Artificial Analysis; where its list has none, OpenRouter\'s copy of the same index', fetchedAt: ago(30), note: null, scores }),
    getOwnChoice: () => later({ directory, modes: { plan: null, execute: current.modes.execute.length > 1 && current.modes.execute.every(item => !item.useFor) ? { kind: 'ranked', strongest: 'opencode-go/kimi-k3.1-pro#low', cheapest: 'opencode-go/glm-5.3-flash' } : null, review: null } }),
    getRelayDecisions: () => later({ directory, decisions: state === 'empty' ? [] : decisions }),
    getRelayUsage: () => later({ directory, since: null, rows: [], credit: null }),
    getUsageLog: () => later({ directory, ...(state === 'empty' ? emptyUsage : usage) }),
    setPriceKey: (input: { key: string | null }) => later({ saved: input.key !== null, note: null }),
    testDecider: () => later({ directory, mode: 'execute', confidence: 0.9, model: 'opencode-go/glm-5.3-flash', fit: null, ms: 780, costUsd: '0.00004', note: 'small work, so the cheapest' }),
    getRelayChat: () => later({ on: true, last: decisions[0], decider: true }),
    setRelayChat: (input: { on: boolean }) => later({ on: input.on }),
  };
}
