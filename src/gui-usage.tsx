import { For, Show, batch, createEffect, createMemo, createSignal, on, onCleanup, type JSX } from 'solid-js';
import type { MountedSession } from '@opencode/plugin/gui';
import { RelayRpc } from './contract.js';
import { formatUsd, parseUsd } from './costs.js';
import type { UsageRow } from './relay-store.js';
import { describeError } from './router.js';
import type { UsageKind, UsageRecord, UsageSummary, UsageTotal } from './usage-log.js';
import { appendNew, chartOf, dayLabels, METRICS, money, PAGE, RANGES, rangeOf, recordCells, refreshLimit, scaleLabel, short, totalCells, type Metric, type Range } from './usage-view.js';
import { usageCells } from './relay-view.js';
import { Icon, boardLight } from './gui-parts.js';

// The Relay usage tab (docs/superpowers/specs/2026-11-24-relay-usage-tab-design.md, and its fix of the same day,
// 2026-11-24-relay-usage-tab-fix-design.md): every reply of every chat for a time range. Spent and tokens come first, then a chart by day,
// the models and the records, each a row that fits the side panel. The server adds it all up (getUsageLog); this only draws what it gets.

type Log = { directory: string; before: { since: string | null; rows: UsageRow[] }; credit: string | null; removed: number } & UsageSummary;
const REFRESH_MS = 30_000, CHART_H = 60, BAR_W = 10, MIN_SLOTS = 7;
const amount = (count: number) => Math.round(count).toLocaleString('en-US');
const kinds: readonly ['any' | UsageKind, string][] = [['any', 'All kinds'], ['chat', 'Chats'], ['helper', 'Helpers'], ['summary', 'Summaries']];
const relays: readonly ['any' | 'on' | 'off', string][] = [['any', 'Relay on or off'], ['on', 'Relay on'], ['off', 'Relay off']];
const folderOf = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
const plural = (count: number, one: string, many: string) => `${amount(count)} ${count === 1 ? one : many}`;

/** A list filter: "All …" or one value the range has. */
const Pick = (props: { label: string; all: string; values: readonly string[]; value: string | null; set: (value: string | null) => void; name?: (value: string) => string }) =>
  <select class="rl-in" aria-label={props.label} onChange={event => props.set(event.currentTarget.value || null)}>
    <option value="" selected={props.value === null}>{props.all}</option>
    <For each={props.values}>{value => <option value={value} selected={props.value === value} title={value}>{props.name ? props.name(value) : value}</option>}</For>
  </select>;

export function UsagePanel(props: { session: MountedSession; css: string }): JSX.Element {
  const [range, setRange] = createSignal<Range>('7d');
  const [typed, setTyped] = createSignal(''), [search, setSearch] = createSignal('');
  const [provider, setProvider] = createSignal<string | null>(null), [effort, setEffort] = createSignal<string | null>(null);
  const [mode, setMode] = createSignal<string | null>(null), [project, setProject] = createSignal<string | null>(null);
  const [relay, setRelay] = createSignal<'any' | 'on' | 'off'>('any'), [kind, setKind] = createSignal<'any' | UsageKind>('any');
  const [metric, setMetric] = createSignal<Metric>('cost');
  const [log, setLog] = createSignal<{ session: MountedSession; value: Log; more: UsageRecord[] }>();
  const [error, setError] = createSignal(''), [loading, setLoading] = createSignal(false);
  const view = createMemo(() => log()?.session === props.session ? log() : undefined);

  const ask = async (session: MountedSession, offset: number, limit = PAGE) => {
    const query = { ...rangeOf(range(), new Date()), search: search(), provider: provider(), effort: effort(), mode: mode(), relay: relay(), kind: kind(), project: project(), offset, limit };
    const value = await session.server.client.rpc(RelayRpc).getUsageLog(query, { location: { directory: session.directory } }) as Log;
    if (value.directory !== session.directory) throw new Error('The usage came from a different project.');
    return value;
  };
  let asked = 0;
  /** Asks again: a new range, filter or chat starts at the first page; a refresh asks for as many rows as are shown. A slower, older answer never replaces a newer one. */
  const load = async (refresh = false) => {
    const session = props.session, mine = ++asked, shown = refresh && view() ? view()!.value.records.length + view()!.more.length : 0;
    setLoading(true);
    try { const value = await ask(session, 0, refreshLimit(shown)); if (mine === asked) { setLog({ session, value, more: [] }); setError(''); } }
    catch (failure) { if (mine === asked) setError(describeError(failure, 'Could not load the usage.')); }
    finally { if (mine === asked) setLoading(false); }
  };
  const showMore = async () => {
    const shown = view(); if (!shown) return;
    try { const next = await ask(shown.session, shown.value.records.length + shown.more.length); if (log() === shown) setLog({ ...shown, more: appendNew([...shown.value.records, ...shown.more], next.records).slice(shown.value.records.length) }); }
    catch (failure) { setError(describeError(failure, 'Could not load more records.')); }
  };
  // Asked for when the tab opens, when the range or a filter changes, and every 30 seconds while it is open. The search waits for a pause in typing.
  createEffect(on([range, search, provider, effort, mode, relay, kind, project, () => props.session], () => { void load(); }));
  // The timer skips a tick while an answer is still coming, or while the tab is hidden, so slow answers never pile up.
  createEffect(() => { const text = typed(); const timer = setTimeout(() => setSearch(text.trim()), 300); onCleanup(() => clearTimeout(timer)); });
  const timer = setInterval(() => { if (!loading() && !document.hidden) void load(true); }, REFRESH_MS); onCleanup(() => clearInterval(timer));

  const filtersOn = () => [provider(), effort(), mode(), project()].filter(value => value !== null).length + (relay() === 'any' ? 0 : 1) + (kind() === 'any' ? 0 : 1);
  const clear = () => batch(() => { setTyped(''); setSearch(''); setProvider(null); setEffort(null); setMode(null); setProject(null); setRelay('any'); setKind('any'); });
  const chart = createMemo(() => { const shown = view(); return shown ? chartOf(shown.value.days, metric()) : undefined; });
  const slots = () => Math.max(MIN_SLOTS, chart()?.bars.length ?? 0), offset = () => Math.floor((slots() - (chart()?.bars.length ?? 0)) / 2);
  const labels = createMemo(() => dayLabels(view()?.value.days.map(day => day.day) ?? []));
  const totals = () => view()?.value.totals ?? [];   // most spent first, as the server sorts them
  const records = createMemo(() => { const shown = view(); return shown ? [...shown.value.records, ...shown.more] : []; });
  /** The tiles: what the range cost where a price is known, how many replies have none, and every token in and out. */
  const sums = createMemo(() => {
    const all = view()?.value.totals ?? [], add = (pick: (total: UsageTotal) => number) => all.reduce((sum, total) => sum + pick(total), 0);
    const priced = all.flatMap(total => total.cost === null ? [] : [parseUsd(total.cost)]);
    return {
      spent: priced.length || !all.length ? money(formatUsd(priced.reduce((sum, cost) => sum + cost, 0n))) : 'no price', aa: all.some(total => total.cost !== null && total.aaPriced),
      unpriced: add(total => total.unpriced), replies: add(total => total.replies), requests: add(total => total.requests),
      in: add(total => total.input + total.cacheRead + total.cacheWrite), out: add(total => total.output + total.reasoning),
    };
  });

  let root: HTMLElement | undefined;
  const light = boardLight(() => root);
  return <section class="rl" ref={element => { root = element; }} data-light={light()} aria-label="Relay usage">
    <style>{props.css}</style>
    <header class="rl-top">
      <span class="rl-logo" aria-hidden="true">R</span><h2 class="rl-name">Relay usage</h2>
      <button type="button" class="rl-btn sm rl-right" disabled={loading()} onClick={() => void load(true)}><Icon name="refresh" size={12} />{loading() ? 'Loading…' : 'Refresh'}</button>
    </header>
    <div class="rl-body">
      <div class="rl-seg" role="group" aria-label="Time range">
        <For each={RANGES}>{item => <button type="button" class="rl-btn sm" aria-pressed={range() === item.id} onClick={() => setRange(item.id)}>{item.label}</button>}</For>
      </div>
      <Show when={search() || filtersOn()}>
        <div class="rl-note n-warn"><span class="rl-u-main">Filtered{search() ? `: "${search()}"` : ''}{filtersOn() ? `${search() ? ' and' : ':'} ${plural(filtersOn(), 'filter', 'filters')}` : ''}</span>
          <button type="button" class="rl-btn sm rl-right" onClick={clear}>Clear</button></div>
      </Show>
      <Show when={error()}><div class="rl-note n-bad" role="alert"><Icon name="warn" /><span>{error()}</span></div></Show>
      <Show when={view()} fallback={<p class="rl-small">{loading() ? 'Loading…' : ''}</p>}>{shown => <>
        <div class="rl-u-sum" aria-live="polite">
          <span class="rl-cost-f"><span class="rl-k">Spent</span><span class="rl-v">{sums().spent}{sums().aa ? '*' : ''}</span>
            <Show when={sums().unpriced}><span class="rl-u-small">{plural(sums().unpriced, 'reply', 'replies')} with no price</span></Show></span>
          <span class="rl-cost-f"><span class="rl-k">Tokens</span><span class="rl-v">{short(sums().in + sums().out)}</span><span class="rl-u-small">{short(sums().in)} in · {short(sums().out)} out</span></span>
          <span class="rl-cost-f"><span class="rl-k">Replies</span><span class="rl-v">{short(sums().replies)}</span><span class="rl-u-small">{plural(sums().requests, 'request', 'requests')}</span></span>
        </div>
        <div class="rl-u-plate">
          <div class="rl-u-head"><h3>{METRICS.find(item => item.id === metric())!.label} by day</h3>
            <div class="rl-seg" role="group" aria-label="Chart shows"><For each={METRICS}>{item => <button type="button" class="rl-btn sm" aria-pressed={metric() === item.id} onClick={() => setMetric(item.id)}>{item.label}</button>}</For></div>
          </div>
          <div>
            <div class="rl-u-plot">
              <Show when={chart()!.max > 0}><span class="rl-u-scale">{scaleLabel(metric(), chart()!.max)}</span></Show>
              <Show when={metric() === 'cost' && !chart()!.max && shown().value.matching}><span class="rl-u-empty">No price in this range: see Tokens or Requests.</span></Show>
              <svg class="rl-chart" viewBox={`0 0 ${slots() * BAR_W} ${CHART_H}`} preserveAspectRatio="none" role="img" aria-label={`${METRICS.find(item => item.id === metric())!.label} by day`}>
                <For each={chart()!.bars}>{(bar, at) => {
                  let top = CHART_H; const x = (offset() + at()) * BAR_W;
                  return <g><title>{bar.title}</title><rect x={x} y={0} width={BAR_W} height={CHART_H} fill="transparent" />
                    <For each={bar.parts}>{part => { const height = chart()!.max ? part.value / chart()!.max * (CHART_H - 2) : 0; top -= height; return <rect x={x + 1.5} y={top} width={BAR_W - 3} height={height} style={{ fill: part.color }} />; }}</For>
                  </g>;
                }}</For>
              </svg>
            </div>
            <div class="rl-u-days" style={{ 'grid-template-columns': `repeat(${slots()}, minmax(0, 1fr))` }}>
              {/* Beyond ten days only three dates show, each wider than its day: the first and last keep inside the chart's edges. */}
              <For each={labels()}>{(label, at) => <span style={{ 'grid-column': `${offset() + at() + 1}`, 'justify-self': labels().length <= 10 ? 'center' : at() === 0 ? 'start' : at() === labels().length - 1 ? 'end' : 'center' }}>{label}</span>}</For>
            </div>
          </div>
          <div class="rl-legend"><For each={chart()!.legend}>{item => <span><i class="rl-dot" style={{ background: item.color }} />{item.model}</span>}</For></div>
        </div>
        <Show when={shown().value.matching} fallback={<p class="rl-small">No replies in this range{search() || filtersOn() ? ' with these filters' : ''}. Relay counts every chat from the version that brought this tab on.</p>}>
          <div class="rl-u-head"><h3>By model</h3><span class="rl-small">most spent first · click to show one</span></div>
          <ol class="rl-u-list"><For each={totals()}>{total => { const cell = totalCells(total); return <li>
            <button type="button" class="rl-u-item" title={`${total.model}: show only this model`} onClick={() => setTyped(total.model)}>
              <span class="rl-u-main"><span class="rl-u-name">{cell.name}</span><span class="rl-u-small">{cell.detail}</span></span>
              <span class="rl-u-money">{cell.cost}</span>
            </button>
          </li>; }}</For></ol>
        </Show>
        <input class="rl-in" type="search" aria-label="Search models" placeholder="Search models, e.g. kimi or opencode-go" value={typed()} onInput={event => setTyped(event.currentTarget.value)} />
        <details class="rl-drawer"><summary><Icon name="chevron" /><span class="rl-drawer-t">Filters</span><Show when={filtersOn()}><span class="rl-u-badge">{filtersOn()} on</span></Show><span class="rl-sub">provider, effort, mode, project, Relay, kind</span></summary>
          <div class="rl-drawer-body"><div class="rl-filters">
            <Pick label="Provider" all="All providers" values={shown().value.options.providers} value={provider()} set={setProvider} />
            <Pick label="Effort" all="All efforts" values={shown().value.options.efforts} value={effort()} set={setEffort} />
            <Pick label="Mode or agent" all="All modes" values={shown().value.options.modes} value={mode()} set={setMode} />
            <Pick label="Project" all="All projects" values={shown().value.options.projects} value={project()} set={setProject} name={folderOf} />
            <select class="rl-in" aria-label="Relay on or off" onChange={event => setRelay(event.currentTarget.value as 'any' | 'on' | 'off')}><For each={relays}>{([value, label]) => <option value={value} selected={relay() === value}>{label}</option>}</For></select>
            <select class="rl-in" aria-label="Kind" onChange={event => setKind(event.currentTarget.value as 'any' | UsageKind)}><For each={kinds}>{([value, label]) => <option value={value} selected={kind() === value}>{label}</option>}</For></select>
          </div></div>
        </details>
        <Show when={shown().value.matching}>
          <div class="rl-u-head"><h3>Records</h3><span class="rl-small">{amount(shown().value.matching)}, newest first</span></div>
          <ol class="rl-u-list"><For each={records()}>{record => { const cell = recordCells(record); return <li class="rl-u-item" title={`${cell.model} · chat ${record.sessionID}`}>
            <span class="rl-u-main"><span class="rl-u-when">{cell.time}</span><span class="rl-u-name">{cell.name}</span><span class="rl-u-small">{cell.detail}</span></span>
            <span class="rl-u-money">{cell.cost}</span>
          </li>; }}</For></ol>
          <div class="rl-inline">
            <span class="rl-small">{amount(records().length)} of {amount(shown().value.matching)} shown.</span>
            <Show when={records().length < shown().value.matching}><button type="button" class="rl-btn sm" onClick={() => void showMore()}>Show more</button></Show>
          </div>
        </Show>
        <p class="rl-small">
          Every reply of every chat, Relay on or off. {shown().value.first ? `History since ${new Date(shown().value.first!).toLocaleDateString()}; records older than 90 days are removed. ` : ''}
          {sums().aa || shown().value.records.some(record => record.costByPrice !== null && record.pricesFrom === 'artificial-analysis') ? '* at Artificial Analysis prices, all or in part. ' : ''}
          In counts tokens read new, from a cache and into a cache; out counts reasoning too. Go is billed by allowance, so its cost is its list price.
        </p>
        <Show when={shown().value.credit}>{credit => <p class="rl-small">{credit()}</p>}</Show>
        <details class="rl-drawer"><summary><Icon name="chevron" /><span class="rl-drawer-t">Before this history</span><span class="rl-sub">Relay's own messages since 19 Nov</span></summary><div class="rl-drawer-body">
          <Show when={shown().value.before.rows.length} fallback={<p>Nothing counted before this history.</p>}>
            <ol class="rl-log"><For each={shown().value.before.rows}>{row => { const cell = usageCells(row); return <li>
              <span><strong>{cell.model}</strong>{cell.effort === '-' ? '' : ` · ${cell.effort}`}: {cell.requests} request{row.requests === 1 ? '' : 's'}, {cell.cost}
              <br />in {cell.input} · out {cell.output} · cache read {cell.cacheRead} · cache write {cell.cacheWrite}</span>
            </li>; }}</For></ol>
          </Show>
        </div></details>
      </>}</Show>
    </div>
  </section>;
}
