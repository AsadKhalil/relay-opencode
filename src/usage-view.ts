import { formatUsd, parseUsd } from './costs.js';
import type { UsageDay, UsageRecord, UsageTotal } from './usage-log.js';

// The Relay usage tab's sums and texts (docs/superpowers/specs/2026-11-24-relay-usage-tab-design.md). The panel bundles this file, so it
// imports nothing from `node:`, and only types from src/usage-log.ts, which is server code.

export type Range = 'today' | '7d' | '30d' | '90d';
export const RANGES: readonly { id: Range; label: string }[] = [{ id: 'today', label: 'Today' }, { id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }, { id: '90d', label: '90 days' }];
const DAYS_BACK: Record<Range, number> = { today: 0, '7d': 6, '30d': 29, '90d': 89 };
/** A range in the panel's own days: from local midnight (today, or that many days before) to now, with the offset the server counts days by. */
export function rangeOf(range: Range, now: Date): { from: string; to: string; tzOffsetMinutes: number; timeZone: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - DAYS_BACK[range]);
  return { from: start.toISOString(), to: now.toISOString(), tzOffsetMinutes: -now.getTimezoneOffset(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
}

/** The records one page holds, and how many a refresh asks for: as many as are shown (up to the server's 200), so a refresh keeps Show more. */
export const PAGE = 50, PAGE_MAX = 200;
export const refreshLimit = (shown: number) => Math.min(PAGE_MAX, Math.max(PAGE, shown));

/** The cost the tab shows: by price when the model has one, else OpenCode's own when it is more than $0, else none. */
export function shownCost(record: Pick<UsageRecord, 'costByPrice' | 'openCodeUsd'>): string | null {
  if (record.costByPrice !== null) return record.costByPrice;
  return record.openCodeUsd !== null && parseUsd(record.openCodeUsd) > 0n ? record.openCodeUsd : null;
}

const amount = (count: number) => Math.round(count).toLocaleString('en-US');
const SCALE = parseUsd('1'), DIME = SCALE / 10n;
/** Money as the tab shows it: to the cent from $0.10 up, else two significant digits ($0.069, $0.0021); rounded with bigint, never a float. */
export function money(usd: string | null): string {
  if (usd === null) return 'no price';
  const value = parseUsd(usd);
  if (value === 0n) return '$0';
  if (value < DIME) {
    const decimals = Math.min(12, 14 - value.toString().length), unit = 10n ** BigInt(12 - decimals), rounded = (value + unit / 2n) / unit;
    if (rounded * unit < DIME) return `$0.${rounded.toString().padStart(decimals, '0').replace(/0+$/, '').padEnd(2, '0')}`;
  }
  const cents = (value + SCALE / 200n) / (SCALE / 100n);
  return `$${(cents / 100n).toLocaleString('en-US')}.${(cents % 100n).toString().padStart(2, '0')}`;
}
const SHORT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
/** A count as the tab shows it: 950, 15.8K, 2.3M. */
export const short = (count: number) => SHORT.format(Math.round(count));
export type Metric = 'cost' | 'tokens' | 'requests';
/** The chart's top value, the tallest bar's; `max` is in millionths of a dollar for cost, as `chartOf` gives it. */
export const scaleLabel = (metric: Metric, max: number) => metric === 'cost' ? money(formatUsd(BigInt(Math.round(max)) * 1_000_000n)) : short(max);
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'], MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** The names under the chart's bars (days as YYYY-MM-DD): a weekday and date each for up to ten days, else the first, middle and last dates. */
export function dayLabels(days: readonly string[]): string[] {
  const at = (day: string) => new Date(`${day}T12:00:00Z`);
  if (days.length <= 10) return days.map(day => `${WEEKDAYS[at(day).getUTCDay()]} ${at(day).getUTCDate()}`);
  const kept = new Set([0, Math.floor(days.length / 2), days.length - 1]);
  return days.map((day, n) => kept.has(n) ? `${at(day).getUTCDate()} ${MONTHS[at(day).getUTCMonth()]}` : '');
}
const nameOf = (model: string) => model.slice(model.indexOf('/') + 1);
/** One model's row in By model: its name and cost, then its provider, replies, every kind of token, and how many replies the cost leaves out. */
export function totalCells(total: UsageTotal) {
  const slash = total.model.indexOf('/'), provider = slash < 0 ? '' : total.model.slice(0, slash);
  const tokens = short(total.input + total.output + total.reasoning + total.cacheRead + total.cacheWrite);
  return { name: nameOf(total.model), provider, cost: `${money(total.cost)}${total.cost !== null && total.aaPriced ? '*' : ''}`, tokens,
    detail: [provider, `${amount(total.replies)} ${total.replies === 1 ? 'reply' : 'replies'}`, `${tokens} tokens`, total.cost !== null && total.unpriced ? `${amount(total.unpriced)} without a price` : ''].filter(Boolean).join(' · ') };
}
export const METRICS: readonly { id: Metric; label: string }[] = [{ id: 'cost', label: 'Cost' }, { id: 'tokens', label: 'Tokens' }, { id: 'requests', label: 'Requests' }];
const COLORS = ['#4f7cff', '#2ea36a', '#d99a1c', '#9b6bff', '#e05a8a'], OTHER = '#8b949e';
type Part = { model: string; value: number; color: string };
/** A cost in millionths of a dollar: a whole number, for bar heights only. Labels come from the USD strings. */
const micro = (cost: string | null) => cost === null ? 0 : Number(parseUsd(cost) / 1_000_000n);
const valueOf = (metric: Metric, model: UsageDay['models'][number]) => metric === 'cost' ? micro(model.cost) : metric === 'tokens' ? model.tokens : model.requests;
const labelOf = (metric: Metric, models: UsageDay['models']) => {
  if (metric === 'cost') { const known = models.flatMap(model => model.cost === null ? [] : [parseUsd(model.cost)]); return known.length ? money(formatUsd(known.reduce((sum, cost) => sum + cost, 0n))) : 'no price'; }
  return metric === 'tokens' ? `${short(models.reduce((sum, model) => sum + model.tokens, 0))} tokens` : `${short(models.reduce((sum, model) => sum + model.requests, 0))} requests`;
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

/** One row of the records list: time, model and cost, then provider, kind and chat, mode, tokens, project and what Relay did. In counts what was read
 *  new, from a cache and into a cache; out counts reasoning too. */
export function recordCells(record: UsageRecord) {
  const cost = shownCost(record), folder = record.project.split(/[\\/]/).filter(Boolean).at(-1) ?? record.project, model = record.model ?? 'unknown model';
  const provider = model.includes('/') ? model.slice(0, model.indexOf('/')) : '', mode = record.relay?.mode ?? record.agent ?? '';
  const relay = record.relay ? (record.relay.note ? `Relay: ${record.relay.note}` : 'Relay on') : 'Relay off';
  const tokens = `${short(record.input + record.cacheRead + record.cacheWrite)} in · ${short(record.output + record.reasoning)} out`;
  return {
    time: new Date(record.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }), model, name: record.model ? nameOf(record.model) : model,
    cost: cost === null ? 'no price' : `${money(cost)}${record.costByPrice !== null && record.pricesFrom === 'artificial-analysis' ? '*' : ''}`,
    detail: [provider, `${record.kind} ${record.sessionID.slice(-6)}`, mode, tokens, folder, relay].filter(Boolean).join(' · '),
  };
}

/** Show more's rows: the next page without those already shown, since a reply that arrives meanwhile moves every offset by one. */
export function appendNew(shown: readonly UsageRecord[], next: readonly UsageRecord[]): UsageRecord[] {
  const key = (record: UsageRecord) => `${record.sessionID}/${record.messageID}`, seen = new Set(shown.map(key));
  return [...shown, ...next.filter(record => !seen.has(key(record)))];
}
