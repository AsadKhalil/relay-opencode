import { formatUsd, parseUsd } from './costs.js';
import type { UsageDay, UsageRecord, UsageTotal } from './usage-log.js';

// The Relay usage tab's sums and texts (docs/superpowers/specs/2026-11-24-relay-usage-tab-design.md). The panel bundles this file, so it
// imports nothing from `node:`, and only types from src/usage-log.ts, which is server code.

export type Range = 'today' | '7d' | '30d' | '90d';
export const RANGES: readonly { id: Range; label: string }[] = [{ id: 'today', label: 'Today' }, { id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }, { id: '90d', label: '90 days' }];
const DAYS_BACK: Record<Range, number> = { today: 0, '7d': 6, '30d': 29, '90d': 89 };
/** A range in the panel's own days: from local midnight (today, or that many days before) to now, with the offset the server counts days by. */
export function rangeOf(range: Range, now: Date): { from: string; to: string; tzOffsetMinutes: number } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - DAYS_BACK[range]);
  return { from: start.toISOString(), to: now.toISOString(), tzOffsetMinutes: -now.getTimezoneOffset() };
}

/** The cost the tab shows: by price when the model has one, else OpenCode's own when it is more than $0, else none. */
export function shownCost(record: Pick<UsageRecord, 'costByPrice' | 'openCodeUsd'>): string | null {
  if (record.costByPrice !== null) return record.costByPrice;
  return record.openCodeUsd !== null && parseUsd(record.openCodeUsd) > 0n ? record.openCodeUsd : null;
}

const amount = (count: number) => Math.round(count).toLocaleString('en-US');
export type Metric = 'cost' | 'tokens' | 'requests';
export const METRICS: readonly { id: Metric; label: string }[] = [{ id: 'cost', label: 'Cost' }, { id: 'tokens', label: 'Tokens' }, { id: 'requests', label: 'Requests' }];
const COLORS = ['#4f7cff', '#2ea36a', '#d99a1c', '#9b6bff', '#e05a8a'], OTHER = '#8b949e';
type Part = { model: string; value: number; color: string };
/** A cost in millionths of a dollar: a whole number, for bar heights only. Labels come from the USD strings. */
const micro = (cost: string | null) => cost === null ? 0 : Number(parseUsd(cost) / 1_000_000n);
const valueOf = (metric: Metric, model: UsageDay['models'][number]) => metric === 'cost' ? micro(model.cost) : metric === 'tokens' ? model.tokens : model.requests;
const labelOf = (metric: Metric, models: UsageDay['models']) => {
  if (metric === 'cost') { const known = models.flatMap(model => model.cost === null ? [] : [parseUsd(model.cost)]); return known.length ? `$${formatUsd(known.reduce((sum, cost) => sum + cost, 0n))}` : 'no price'; }
  return metric === 'tokens' ? `${amount(models.reduce((sum, model) => sum + model.tokens, 0))} tokens` : `${amount(models.reduce((sum, model) => sum + model.requests, 0))} requests`;
};

/** One bar a day, split by model: the `top` largest models of the range by `metric`, and the rest as "other". `max` is the tallest bar. */
export function chartOf(days: readonly UsageDay[], metric: Metric, top = 5): { bars: { day: string; total: number; title: string; parts: Part[] }[]; legend: { model: string; color: string }[]; max: number } {
  const sums = new Map<string, number>();
  for (const day of days) for (const model of day.models) sums.set(model.model, (sums.get(model.model) ?? 0) + valueOf(metric, model));
  const ranked = [...sums].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([model]) => model), kept = ranked.slice(0, top), rest = ranked.length > top;
  const colorOf = (model: string) => kept.includes(model) ? COLORS[kept.indexOf(model) % COLORS.length]! : OTHER;
  const bars = days.map(day => {
    const parts: Part[] = kept.flatMap(model => { const mine = day.models.find(item => item.model === model); return mine ? [{ model, value: valueOf(metric, mine), color: colorOf(model) }] : []; });
    const others = day.models.filter(item => !kept.includes(item.model));
    if (others.length) parts.push({ model: 'other', value: others.reduce((sum, item) => sum + valueOf(metric, item), 0), color: OTHER });
    const shares = [...kept.flatMap(model => { const mine = day.models.find(item => item.model === model); return mine ? [`${model} ${labelOf(metric, [mine])}`] : []; }), ...(others.length ? [`other ${labelOf(metric, others)}`] : [])];
    return { day: day.day, total: parts.reduce((sum, part) => sum + part.value, 0), title: `${day.day}: ${shares.length ? shares.join(', ') : 'no use'}`, parts };
  });
  return { bars, legend: [...kept.map(model => ({ model, color: colorOf(model) })), ...(rest ? [{ model: 'other', color: OTHER }] : [])], max: bars.reduce((most, bar) => Math.max(most, bar.total), 0) };
}

/** One line of the records list. In counts what was read new and from a cache; out counts reasoning too. */
export function recordCells(record: UsageRecord) {
  const cost = shownCost(record), folder = record.project.split(/[\\/]/).filter(Boolean).at(-1) ?? record.project;
  return {
    time: new Date(record.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }), project: folder, chat: record.sessionID.slice(-6), kind: record.kind,
    mode: record.relay?.mode ?? record.agent ?? '-', model: record.model ?? 'unknown model',
    relay: record.relay ? `${record.relay.mode ?? 'no mode'}${record.relay.note ? `: ${record.relay.note}` : ''}` : 'off',
    tokens: `${amount(record.input + record.cacheRead + record.cacheWrite)} in · ${amount(record.output + record.reasoning)} out`,
    cost: cost === null ? 'not listed' : `$${cost}${record.costByPrice !== null && record.pricesFrom === 'artificial-analysis' ? '*' : ''}`,
  };
}

/** The by-model table in the order a header asks for. Costs compare as USD amounts; a total with no price sorts below any price. */
export function sortTotals(totals: readonly UsageTotal[], by: keyof UsageTotal, down: boolean): UsageTotal[] {
  const key = (total: UsageTotal): bigint | number | string => by === 'cost' ? (total.cost === null ? -1n : parseUsd(total.cost)) : by === 'aaPriced' ? Number(total.aaPriced) : total[by];
  return [...totals].sort((a, b) => { const x = key(a), y = key(b), order = x < y ? -1 : x > y ? 1 : 0; return down ? -order : order; });
}
