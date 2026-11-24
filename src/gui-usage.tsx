import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, type JSX } from 'solid-js';
import type { MountedSession } from '@opencode/plugin/gui';
import { RelayRpc } from './contract.js';
import { formatUsd, parseUsd } from './costs.js';
import type { UsageRow } from './relay-store.js';
import { describeError } from './router.js';
import type { UsageKind, UsageRecord, UsageSummary, UsageTotal } from './usage-log.js';
import { chartOf, METRICS, PAGE, RANGES, rangeOf, recordCells, refreshLimit, sortTotals, type Metric, type Range } from './usage-view.js';
import { usageCells } from './relay-view.js';

// The Relay usage tab (docs/superpowers/specs/2026-11-24-relay-usage-tab-design.md): every reply of every chat for a time range, with search,
// filters, a chart by day, totals by model and the records. The server adds it all up (getUsageLog); this only draws what it gets.

type Log = { directory: string; before: { since: string | null; rows: UsageRow[] }; credit: string | null; removed: number } & UsageSummary;
const REFRESH_MS = 30_000, CHART_H = 60, BAR_W = 10;
const amount = (count: number) => Math.round(count).toLocaleString('en-US');
const columns: readonly [keyof UsageTotal, string][] = [['model', 'Model'], ['replies', 'Replies'], ['requests', 'Requests'], ['input', 'In'], ['output', 'Out'], ['cacheRead', 'Cache read'], ['cacheWrite', 'Cache written'], ['cost', 'Cost']];
const kinds: readonly ['any' | UsageKind, string][] = [['any', 'All kinds'], ['chat', 'Chats'], ['helper', 'Helpers'], ['summary', 'Summaries']];
const relays: readonly ['any' | 'on' | 'off', string][] = [['any', 'Relay on or off'], ['on', 'Relay on'], ['off', 'Relay off']];
const folderOf = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
const sumCost = (costs: readonly (string | null)[]) => { const known = costs.filter((cost): cost is string => cost !== null); return known.length ? `$${formatUsd(known.reduce((sum, cost) => sum + parseUsd(cost), 0n))}` : 'no price'; };

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
  const [metric, setMetric] = createSignal<Metric>('cost'), [order, setOrder] = createSignal<{ by: keyof UsageTotal; down: boolean }>({ by: 'cost', down: true });
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
    try { const next = await ask(shown.session, shown.value.records.length + shown.more.length); if (log() === shown) setLog({ ...shown, more: [...shown.more, ...next.records] }); }
    catch (failure) { setError(describeError(failure, 'Could not load more records.')); }
  };
  // Asked for when the tab opens, when the range or a filter changes, and every 30 seconds while it is open. The search waits for a pause in typing.
  createEffect(on([range, search, provider, effort, mode, relay, kind, project, () => props.session], () => { void load(); }));
  // The timer skips a tick while an answer is still coming, or while the tab is hidden, so slow answers never pile up.
  createEffect(() => { const text = typed(); const timer = setTimeout(() => setSearch(text.trim()), 300); onCleanup(() => clearTimeout(timer)); });
  const timer = setInterval(() => { if (!loading() && !document.hidden) void load(true); }, REFRESH_MS); onCleanup(() => clearInterval(timer));

  const chart = createMemo(() => { const shown = view(); return shown ? chartOf(shown.value.days, metric()) : undefined; });
  const totals = createMemo(() => { const shown = view(); return shown ? sortTotals(shown.value.totals, order().by, order().down) : []; });
  const records = createMemo(() => { const shown = view(); return shown ? [...shown.value.records, ...shown.more] : []; });
  const summary = createMemo(() => {
    const all = view()?.value.totals ?? [], add = (pick: (total: UsageTotal) => number) => amount(all.reduce((sum, total) => sum + pick(total), 0));
    return `${sumCost(all.map(total => total.cost))} · ${add(total => total.replies)} replies · ${add(total => total.requests)} requests · in ${add(total => total.input)} · out ${add(total => total.output + total.reasoning)} · cache read ${add(total => total.cacheRead)} · cache written ${add(total => total.cacheWrite)}`;
  });
  const sortBy = (by: keyof UsageTotal) => setOrder(now => ({ by, down: now.by === by ? !now.down : by !== 'model' }));

  return <section class="rl" aria-label="Relay usage">
    <style>{props.css}</style>
    <header class="rl-top">
      <div class="rl-brand"><span class="rl-logo" aria-hidden="true">R</span><h2 class="rl-name">Relay usage</h2><span class="rl-tag">every reply of every chat</span></div>
    </header>
    <div class="rl-body">
      <div class="rl-seg" role="group" aria-label="Time range">
        <For each={RANGES}>{item => <button type="button" class="rl-btn sm" aria-pressed={range() === item.id} onClick={() => setRange(item.id)}>{item.label}</button>}</For>
        <button type="button" class="rl-btn sm rl-right" disabled={loading()} onClick={() => void load(true)}>{loading() ? 'Loading…' : 'Refresh'}</button>
      </div>
      <input class="rl-in" type="search" aria-label="Search models" placeholder="Search models, e.g. kimi or opencode-go" value={typed()} onInput={event => setTyped(event.currentTarget.value)} />
      <div class="rl-filters">
        <Pick label="Provider" all="All providers" values={view()?.value.options.providers ?? []} value={provider()} set={setProvider} />
        <Pick label="Effort" all="All efforts" values={view()?.value.options.efforts ?? []} value={effort()} set={setEffort} />
        <Pick label="Mode or agent" all="All modes" values={view()?.value.options.modes ?? []} value={mode()} set={setMode} />
        <Pick label="Project" all="All projects" values={view()?.value.options.projects ?? []} value={project()} set={setProject} name={folderOf} />
        <select class="rl-in" aria-label="Relay on or off" onChange={event => setRelay(event.currentTarget.value as 'any' | 'on' | 'off')}><For each={relays}>{([value, label]) => <option value={value} selected={relay() === value}>{label}</option>}</For></select>
        <select class="rl-in" aria-label="Kind" onChange={event => setKind(event.currentTarget.value as 'any' | UsageKind)}><For each={kinds}>{([value, label]) => <option value={value} selected={kind() === value}>{label}</option>}</For></select>
      </div>
      <Show when={error()}><div class="rl-note n-bad" role="alert">{error()}</div></Show>
      <Show when={view()} fallback={<p class="rl-hint">{loading() ? 'Loading…' : ''}</p>}>{shown => <>
        <p class="rl-sum" aria-live="polite">{summary()}</p>
        <div class="rl-card">
          <div class="rl-seg" role="group" aria-label="Chart shows">
            <For each={METRICS}>{item => <button type="button" class="rl-btn sm" aria-pressed={metric() === item.id} onClick={() => setMetric(item.id)}>{item.label}</button>}</For>
          </div>
          <svg class="rl-chart" viewBox={`0 0 ${Math.max(1, chart()!.bars.length) * BAR_W} ${CHART_H}`} preserveAspectRatio="none" role="img" aria-label={`${METRICS.find(item => item.id === metric())!.label} by day`}>
            <For each={chart()!.bars}>{(bar, at) => {
              let top = CHART_H;
              return <g><title>{bar.title}</title><rect x={at() * BAR_W} y={0} width={BAR_W} height={CHART_H} fill="transparent" />
                <For each={bar.parts}>{part => { const height = chart()!.max ? part.value / chart()!.max * (CHART_H - 2) : 0; top -= height; return <rect x={at() * BAR_W + 1.5} y={top} width={BAR_W - 3} height={height} fill={part.color} />; }}</For>
              </g>;
            }}</For>
          </svg>
          <div class="rl-axis"><span>{shown().value.days[0]?.day ?? ''}</span><span>{shown().value.days.at(-1)?.day ?? ''}</span></div>
          <div class="rl-legend"><For each={chart()!.legend}>{item => <span><i class="rl-dot" style={{ background: item.color }} />{item.model}</span>}</For></div>
        </div>
        <Show when={shown().value.matching} fallback={<p class="rl-hint">No replies in this range{search() || provider() || effort() || mode() || project() || relay() !== 'any' || kind() !== 'any' ? ' with these filters' : ''}. Relay counts every chat from the version that brought this tab on.</p>}>
          <strong class="rl-role">By model</strong>
          <div class="rl-table-wrap"><table class="rl-grid">
            <thead><tr><For each={columns}>{([key, label]) => <th scope="col" aria-sort={order().by === key ? (order().down ? 'descending' : 'ascending') : 'none'}><button type="button" class="rl-sort" onClick={() => sortBy(key)}>{label}{order().by === key ? (order().down ? ' ↓' : ' ↑') : ''}</button></th>}</For></tr></thead>
            <tbody><For each={totals()}>{total => <tr class="rl-row" title="Show only this model" onClick={() => setTyped(total.model)}>
              <td>{total.model}</td><td>{amount(total.replies)}</td><td>{amount(total.requests)}</td><td>{amount(total.input)}</td><td>{amount(total.output + total.reasoning)}</td>
              <td>{amount(total.cacheRead)}</td><td>{amount(total.cacheWrite)}</td><td>{total.cost === null ? 'not listed' : `$${total.cost}${total.aaPriced ? '*' : ''}`}</td>
            </tr>}</For></tbody>
          </table></div>
          <strong class="rl-role">Records</strong>
          <div class="rl-table-wrap"><table class="rl-grid">
            <thead><tr><th scope="col">Time</th><th scope="col">Project</th><th scope="col">Chat</th><th scope="col">Kind</th><th scope="col">Mode</th><th scope="col">Model</th><th scope="col">Relay</th><th scope="col">Tokens</th><th scope="col">Cost</th></tr></thead>
            <tbody><For each={records()}>{record => { const cell = recordCells(record); return <tr>
              <td>{cell.time}</td><td title={record.project}>{cell.project}</td><td title={record.sessionID}>{cell.chat}</td><td>{cell.kind}</td><td>{cell.mode}</td><td>{cell.model}</td><td>{cell.relay}</td><td>{cell.tokens}</td><td>{cell.cost}</td>
            </tr>; }}</For></tbody>
          </table></div>
          <div class="rl-inline">
            <span class="rl-hint">{amount(records().length)} of {amount(shown().value.matching)} records, newest first.</span>
            <Show when={records().length < shown().value.matching}><button type="button" class="rl-btn sm" onClick={() => void showMore()}>Show more</button></Show>
          </div>
        </Show>
        <span class="rl-hint">
          {shown().value.first ? `History since ${new Date(shown().value.first!).toLocaleDateString()}; records older than 90 days are removed. ` : ''}
          {shown().value.totals.some(total => total.aaPriced) || shown().value.records.some(record => record.costByPrice !== null && record.pricesFrom === 'artificial-analysis') ? '* at Artificial Analysis prices, all or in part. ' : ''}
          Out counts reasoning too. Go is billed by allowance, so its cost is its list price.
        </span>
        <Show when={shown().value.credit}>{credit => <span class="rl-hint">{credit()}</span>}</Show>
        <details class="rl-acc"><summary>Before this history<span class="rl-sub">Relay's own messages since 19 Nov</span></summary><div class="rl-acc-body">
          <Show when={shown().value.before.rows.length} fallback={<p class="rl-hint">Nothing counted before this history.</p>}>
            <ol class="rl-plain"><For each={shown().value.before.rows}>{row => { const cell = usageCells(row); return <li class="rl-hint">
              <strong>{cell.model}</strong>{cell.effort === '-' ? '' : ` · ${cell.effort}`}: {cell.requests} request{row.requests === 1 ? '' : 's'}, {cell.cost}
              <br />in {cell.input} · out {cell.output} · cache read {cell.cacheRead} · cache write {cell.cacheWrite}
            </li>; }}</For></ol>
          </Show>
        </div></details>
      </>}</Show>
    </div>
  </section>;
}
