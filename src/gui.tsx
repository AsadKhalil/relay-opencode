import { For, Show, createMemo, createResource, createSignal, onCleanup, type JSX } from 'solid-js';
import { Command, ComposerPill, Panel, Plugin, type MountedSession, type PanelTab } from '@opencode/plugin/gui';
import { RelayRpc } from './contract.js';
import { offered, type ModelChoice } from './settings.js';
import type { ListedModel } from './inventory.js';
import { USE_FOR_MAX, type Decision, type Mode, type ModeChoice, type Prices, type RelaySettings } from './relay-store.js';
import { describeError, modeLabel, reviewRules } from './router.js';
import { borrowedNote, checksLine, contextLabel, decisionLine, hintCell, hintText, indexLabel, indexTip, modelFacts, modelRows, nextEffort, noDeciderNote, ownChoiceNote, ownChoicePart, pickerModel, pillView, priceCell, priceTip, privacyNote, recentLine, severalModelsHint, switchHint, tryLine, versionLabel, type OwnChoicePart, type TableOrder } from './relay-view.js';
import { panelCss } from './gui-styles.js';
import { Icon, boardLight } from './gui-parts.js';
import type { IndexHint } from './standings.js';
import { UsagePanel } from './gui-usage.js';
import { money, rangeOf, short } from './usage-view.js';
import { formatUsd, parseUsd } from './costs.js';
import type { UsageTotal } from './usage-log.js';

// The Relay panel as a strip board (.impeccable/surfaces/src-gui-tsx.md): each mode is a bay, each chosen model a strip in it with its
// slot, its figures (price, index, context) and its "use it for" line; the decider is the controller above the bays.

type Model = ListedModel;
const bays = [['plan', 'Thinks, explains and plans. Cannot change files.'], ['execute', 'Writes, changes, fixes and runs. Can change files.'], ['review', 'Checks existing work and reports. Cannot change files.']] as const;
type RelayView = { directory: string; settings: RelaySettings; decisions: Decision[]; deciders: Model[]; checks: { active: boolean; note: string | null }; priceKey: boolean };
/** A drawer below the bays. Its body is built the first time it is opened, so closed drawers cost nothing. */
const Drawer = (props: { title: string; sub?: string; children: JSX.Element }) => {
  const [seen, setSeen] = createSignal(false);
  return <details class="rl-drawer" onToggle={event => { if (event.currentTarget.open) setSeen(true); }}>
    <summary><Icon name="chevron" /><span class="rl-drawer-t">{props.title}</span><Show when={props.sub}><span class="rl-sub">{props.sub}</span></Show></summary>
    <div class="rl-drawer-body"><Show when={seen()}>{props.children}</Show></div>
  </details>;
};

/** `listIntelligence`'s answer for one model: the index and where it came from, a price and context where OpenCode lists none, and each effort's own index. */
type Score = {
  providerID: string; id: string; index: number | null; matched: string | null; from: 'artificial-analysis' | 'openrouter' | null; prices: Prices | null;
  pricesFrom: 'artificial-analysis' | 'openrouter' | 'free' | null; context: number | null; efforts: { variant: string; index: number }[]; hint: IndexHint | null;
};
/** A model as the tables show it: OpenRouter's context where OpenCode lists none (`contextFrom`), and a borrowed price with its source. */
type Rated = Model & Pick<Score, 'index' | 'matched' | 'from' | 'hint'> & { borrowed: (Prices & { from: Score['pricesFrom'] }) | null; contextFrom: 'openrouter' | null };
/** A hint range on a strip, in whole points so it fits its field ("≈47–61"); the table and the tooltip keep the decimals. */
const compact = (text: string) => text.includes('–') ? text.replace(/(\d+)\.\d+/g, '$1') : text;
/** What a strip prints in its three fields, each with the sentence behind it as its tooltip. */
function stripFigures(model: Model, score: Score | undefined, variant: string | null) {
  const borrowed = score?.prices ? { ...score.prices, from: score.pricesFrom } : null, own = score?.efforts.find(effort => effort.variant === variant);
  const index = own?.index ?? score?.index ?? null, context = model.limit.context > 0 ? model.limit.context : score?.context ?? 0;
  return {
    price: priceCell(model.cost, borrowed), priceTip: `${priceTip(borrowed) ?? 'Price for 1M tokens, input over output, as OpenCode lists it'}${tierNote(priceCell(model.cost, borrowed))}`,
    index: index === null ? compact(hintCell(score?.hint)) : indexLabel(index), estimate: index === null, facts: modelFacts(model, score, variant),
    context: contextLabel(context),
  };
}
/** A price printed as a stack, input over output; a base-tier price says so in the field's tooltip, so the stack stays two short lines. */
const Price = (props: { text: string }) => {
  const parts = () => props.text.replace(' (base tier)', '').split(' / ');
  return <Show when={parts().length === 2} fallback={props.text}><span class="rl-px"><span>{parts()[0]}</span><span>{parts()[1]}</span></span></Show>;
};
const tierNote = (text: string) => text.includes('(base tier)') ? '; the base tier: more for long chats' : '';
/** What an unavailable strip says, as its stamp's tooltip and under its bay. */
const GONE = 'OpenCode no longer offers this model: remove it, or reconnect its provider';
/** The stamp a strip gets for Relay's own choice: "big work", "small work" or "all work"; the tooltip keeps the whole line. */
const stampOf = (part: string) => part.replace(/^Relay: /, '').replace(/ \(.*\)$/, '');

/**
 * The rack a model is picked from: a search box, a provider filter and an order, then one row per model with its price per 1M tokens, its
 * context and its index. Each rack keeps its own search, filter and order, and starts afresh when it is opened again.
 */
const ModelTable = (props: { label: string; models: Rated[]; action: string; actionLabel: (model: Rated) => string; can: (model: Rated) => boolean; mark: (model: Rated) => string; tip?: (model: Rated) => string | undefined; pick: (model: Rated) => void; close: () => void }) => {
  const [query, setQuery] = createSignal('');
  const [provider, setProvider] = createSignal('');
  const [order, setOrder] = createSignal<TableOrder>('provider');
  const providers = createMemo(() => [...new Set(props.models.map(model => model.providerID))].sort().map(id => ({ id, count: props.models.filter(model => model.providerID === id).length })));
  const rows = createMemo(() => modelRows(props.models, { query: query(), provider: provider(), order: order() }));
  // Escape closes the rack and stays inside the panel, so the host does not act on it too.
  return <div class="rl-picker" role="group" aria-label={props.label} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); props.close(); } }}>
    <div class="rl-inline">
      <input class="rl-in" type="search" ref={element => setTimeout(() => element.focus())} placeholder="Search, e.g. sonnet or ollama" aria-label="Search models" value={query()} onInput={event => setQuery(event.currentTarget.value)} />
      <button type="button" class="rl-btn" onClick={() => props.close()}>Done</button>
    </div>
    <div class="rl-inline">
      <select class="rl-in" aria-label="Provider" onChange={event => setProvider(event.currentTarget.value)}>
        <option value="" selected={provider() === ''}>All providers ({props.models.length})</option>
        <For each={providers()}>{item => <option value={item.id} selected={provider() === item.id}>{item.id} ({item.count})</option>}</For>
      </select>
      <select class="rl-in" aria-label="Order" onChange={event => setOrder(event.currentTarget.value as TableOrder)}>
        <option value="provider" selected={order() === 'provider'}>By provider</option>
        <option value="price" selected={order() === 'price'}>Cheapest first</option>
        <option value="context" selected={order() === 'context'}>Largest context</option>
        <option value="index" selected={order() === 'index'}>Highest index</option>
      </select>
    </div>
    <div class="rl-table-wrap">
      <table class="rl-table">
        <thead><tr><th scope="col">Model</th><th scope="col" title="Price for 1M tokens, input over output">$/M in·out</th><th scope="col" title="Artificial Analysis Intelligence Index">Index</th><th scope="col" title="Context size">Ctx</th><th scope="col"><span class="rl-sr">{props.action}</span></th></tr></thead>
        <tbody><For each={rows()}>{model => <tr>
          <td><span class="rl-t-name">{model.name}</span><small>{model.providerID}{props.mark(model)}</small></td>
          <td title={`${priceTip(model.borrowed) ?? 'Price for 1M tokens, input over output'}${tierNote(priceCell(model.cost, model.borrowed))}`}><Price text={priceCell(model.cost, model.borrowed)} /></td>
          <td classList={{ 'is-est': model.index === null }} title={model.index === null ? hintText(model.hint) : indexTip(model)}>{model.index === null ? compact(hintCell(model.hint)) : indexLabel(model.index)}</td>
          <td title={model.limit.context > 0 ? (model.contextFrom ? "From OpenRouter's list: OpenCode lists none" : undefined) : 'Context size not listed'}>{contextLabel(model.limit.context)}</td>
          <td><button type="button" class="rl-btn sm" disabled={!props.can(model)} title={props.tip?.(model)} aria-label={props.actionLabel(model)} onClick={() => props.pick(model)}>{props.action}</button></td>
        </tr>}</For></tbody>
      </table>
    </div>
    <p class="rl-small" aria-live="polite">{rows().length ? `${rows().length} of ${props.models.length} models` : 'No model matches. Try fewer words, or All providers.'}</p>
    <Show when={rows().some(model => priceCell(model.cost, model.borrowed).endsWith('*'))}><p class="rl-small">{borrowedNote}</p></Show>
  </div>;
};

export default Plugin.define({
  setup(ctx) {
    const tab: PanelTab = { id: 'models', title: 'Relay', closable: 'compact', fallback: true };
    ctx.add(Command, () => ({
      id: 'open', title: 'Open Relay', keywords: 'relay models modes plan execute review decider',
      enabled: !!ctx.sessions.current(),
      run: () => { const session = ctx.sessions.current(); if (session) ctx.layout.toggle(`${ctx.id}:models`, session); },
    }));
    const usageTab: PanelTab = { id: 'usage', title: 'Relay usage', closable: 'compact' };
    ctx.add(Command, () => ({
      id: 'usage', title: 'Open Relay usage', keywords: 'relay usage cost tokens requests chart models',
      enabled: !!ctx.sessions.current(),
      run: () => { const session = ctx.sessions.current(); if (session) ctx.layout.toggle(`${ctx.id}:usage`, session); },
    }));
    ctx.add(Panel, { id: 'usage', region: 'side', width: 420, list: input => input.open.includes('usage') ? [usageTab] : [], render: props => <UsagePanel session={props.session} css={panelCss} /> });
    ctx.add(Panel, {
      id: 'models', region: 'side', width: 380,
      list: input => input.open.includes('models') ? [tab] : [],
      render: props => {
        type Session = typeof props.session;
        let root: HTMLElement | undefined;
        const light = boardLight(() => root);
        const api = (session: Session) => ({ rpc: session.server.client.rpc(RelayRpc), options: { location: { directory: session.directory } } });
        const call = async <T extends object>(session: Session, run: (client: ReturnType<typeof api>) => Promise<unknown>) => {
          const value = await run(api(session)) as T & { directory: string };
          if (value.directory !== session.directory) throw new Error('Wrong project');
          return value;
        };
        const [saving, setSaving] = createSignal(false);
        const [saveError, setSaveError] = createSignal('');
        const [response, { refetch }] = createResource(() => props.session, async session => {
          const { rpc, options } = api(session);
          const [value, relay] = await Promise.all([rpc.listModels({}, options), rpc.getRelay({}, options)]) as [{ directory: string; models: Model[] }, RelayView];
          if (value.directory !== session.directory || relay.directory !== session.directory) throw new Error('Data came from a different project');
          return { session, models: value.models, relay };
        });
        const data = createMemo(() => response()?.session === props.session ? response() : undefined);
        const result = createMemo(() => data()?.models);
        // The intelligence index, asked for apart from the models, so a slow or failed fetch never holds the lists up. It never throws.
        const [intel, { refetch: refetchIntel }] = createResource(() => props.session, async session => {
          try {
            const value = await call<{ source: string; note: string | null; scores: Score[] }>(session, ({ rpc, options }) => rpc.listIntelligence({}, options));
            return { session, source: value.source, note: value.note, byModel: new Map(value.scores.map(score => [`${score.providerID}/${score.id}`, score])) };
          } catch (error) { return { session, source: null, note: describeError(error, 'the index could not be loaded'), byModel: new Map<string, Score>() }; }
        });
        const scores = createMemo(() => { const value = intel(); return value?.session === props.session ? value : undefined; });
        const scoreOf = (model: Model) => scores()?.byModel.get(`${model.providerID}/${model.id}`);
        const rated = (model: Model): Rated => {
          const score = scoreOf(model), routed = model.limit.context > 0 ? null : score?.context ?? null;
          return { ...model, limit: { ...model.limit, context: routed ?? model.limit.context }, contextFrom: routed ? 'openrouter' : null, index: score?.index ?? null, matched: score?.matched ?? null, from: score?.from ?? null, hint: score?.hint ?? null, borrowed: score?.prices ? { ...score.prices, from: score.pricesFrom } : null };
        };
        const indexSource = () => {
          const value = scores();
          if (!value) return 'Index: loading…';
          if (!value.source) return `Index: not shown (${value.note}).`;
          return `Index: ${value.source}. For a model with efforts it is the highest effort's score; lower efforts score less.${value.note ? ` (${value.note})` : ''}`;
        };
        // Relay's own choice: which model of each mode gets big work and small work, worked out on the server from the saved settings
        // and the stored copies. Asked for again after a save. It never throws; when it can't be had, no part is shown.
        const [own, { refetch: refetchOwn }] = createResource(() => props.session, async session => {
          try { return { session, modes: (await call<{ modes: Record<Mode, OwnChoicePart> }>(session, ({ rpc, options }) => rpc.getOwnChoice({}, options))).modes }; }
          catch { return { session, modes: null }; }
        });
        const ownPart = (mode: Mode): OwnChoicePart => { const value = own(); return value?.session === props.session && value.modes ? value.modes[mode] : null; };
        // The cost strip: the last seven days, added up by the server, as the usage tab shows them. It never throws; a failure shows no figures.
        const [spend, { refetch: refetchSpend }] = createResource(() => props.session, async session => {
          try {
            const value = await call<{ totals: UsageTotal[] }>(session, ({ rpc, options }) => rpc.getUsageLog({ ...rangeOf('7d', new Date()), search: '', provider: null, effort: null, mode: null, relay: 'any', kind: 'any', project: null, offset: 0, limit: 1 }, options));
            const priced = value.totals.flatMap(total => total.cost === null ? [] : [parseUsd(total.cost)]);
            const add = (pick: (total: UsageTotal) => number) => value.totals.reduce((sum, total) => sum + pick(total), 0);
            return { session, spent: priced.length ? money(formatUsd(priced.reduce((sum, usd) => sum + usd, 0n))) : value.totals.length ? 'no price' : '$0', marked: value.totals.some(total => total.cost !== null && total.aaPriced),
              tokens: short(add(total => total.input + total.output + total.reasoning + total.cacheRead + total.cacheWrite)), replies: short(add(total => total.replies)) };
          } catch { return { session, spent: null, marked: false, tokens: null, replies: null }; }
        });
        const spent = createMemo(() => { const value = spend(); return value?.session === props.session ? value : undefined; });
        // Recent choices, asked for again every 5 seconds while the panel is open, so a /relay sent meanwhile shows up without a Refresh.
        const [recent, setRecent] = createSignal<{ session: Session; decisions: Decision[] }>();
        const loadRecent = async () => {
          const session = props.session;
          try {
            const value = await call<{ decisions: Decision[] }>(session, ({ rpc, options }) => rpc.getRelayDecisions({}, options));
            if (props.session === session) setRecent({ session, decisions: value.decisions });
          } catch { /* the list keeps what it showed */ }
        };
        const poll = setInterval(() => { void loadRecent(); }, 5000); onCleanup(() => clearInterval(poll));
        const decisions = createMemo(() => recent()?.session === props.session ? recent()!.decisions : data()?.relay.decisions ?? []);
        // The Artificial Analysis key: typed into a password field, sent once, cleared, and never shown or sent back.
        const [keyDraft, setKeyDraft] = createSignal('');
        const [keying, setKeying] = createSignal(false);
        const [keyNote, setKeyNote] = createSignal<{ session: Session; text: string; bad: boolean }>();
        const saveKey = async (key: string | null) => {
          const session = props.session; if (keying()) return;
          setKeying(true);
          try {
            const { rpc, options } = api(session);
            const value = await rpc.setPriceKey({ key }, options) as { saved: boolean; note: string | null };
            setKeyDraft('');
            setKeyNote({ session, bad: !!value.note, text: !value.saved ? 'Key removed.' : value.note ? `Key saved, but ${value.note}.` : 'Key saved. Prices and the index now come from Artificial Analysis.' });
            await Promise.all([refetch(), refetchIntel(), refetchOwn()]);
          } catch (error) { setKeyNote({ session, bad: true, text: describeError(error, 'Could not save the key.') }); }
          finally { setKeying(false); }
        };
        const when = (at: string) => new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        /** A log line's time: the time alone today, the date alone before, so the model field keeps its width; the line's title has both. */
        const logTime = (at: string) => { const then = new Date(at); return then.toDateString() === new Date().toDateString() ? then.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : then.toLocaleDateString([], { month: 'short', day: 'numeric' }); };
        // One rack open at a time: a mode's "Add a model", or the decider's.
        const [adding, setAdding] = createSignal<Mode | 'decider' | null>(null);
        const same = (a: ModelChoice, b: ModelChoice) => a.providerID === b.providerID && a.id === b.id && a.variant === b.variant;
        const chosen = (mode: Mode): ModeChoice[] => data()?.relay.settings.modes[mode] ?? [];
        /** Saves Relay's settings with one part changed, then reloads them. When the server refuses, its own words are shown. */
        const saveRelay = async (change: Partial<Pick<RelaySettings, 'modes' | 'decider'>>) => {
          const current = data(); if (!current || saving()) return;
          const { revision, modes, decider } = current.relay.settings;
          setSaving(true); setSaveError('');
          try { await call(current.session, ({ rpc, options }) => rpc.saveRelay({ revision, modes, decider, ...change }, options)); }
          catch (error) { setSaveError(describeError(error, 'Could not save. The settings may have changed; refresh and try again.')); }
          finally {
            try { if (props.session === current.session) { await refetch(); void refetchOwn(); } }
            catch { setSaveError('Could not refresh the settings. Try Refresh.'); }
            finally { setSaving(false); }
          }
        };
        const setList = (mode: Mode, list: ModeChoice[]) => { const current = data(); if (current) void saveRelay({ modes: { ...current.relay.settings.modes, [mode]: list } }); };
        // The test box: what Relay would do with a sample message. Nothing is switched, sent or recorded.
        const [sample, setSample] = createSignal('');
        const [trying, setTrying] = createSignal(false);
        const [tried, setTried] = createSignal<{ session: Session; text: string; bad: boolean }>();
        const tryDecider = async () => {
          const session = props.session, text = sample(); if (trying() || !text.trim()) return;
          setTrying(true);
          try {
            const value = await call<Parameters<typeof tryLine>[0]>(session, ({ rpc, options }) => rpc.testDecider({ text }, options));
            if (props.session === session) setTried({ session, text: tryLine(value), bad: value.mode === null });
          } catch (error) { if (props.session === session) setTried({ session, text: describeError(error, 'Could not ask the decider.'), bad: true }); }
          finally { setTrying(false); }
        };
        /** The same test the router uses, so a strip says "unavailable" exactly when /relay would pass the model over. */
        const unavailable = (choice: ModelChoice) => { const models = result(); return models !== undefined && !offered(models, choice); };
        const usable = createMemo(() => (result() ?? []).filter(model => model.enabled && model.status !== 'deprecated').map(rated));
        const deciders = createMemo(() => (data()?.relay.deciders ?? []).filter(model => model.enabled && model.status !== 'deprecated').map(rated));
        /** The saved decider as the host offers it now; undefined when it is not offered, and the strip then says so. */
        const deciderModel = createMemo(() => { const relay = data()?.relay, saved = relay?.settings.decider; return relay && saved ? offered(relay.deciders, saved) : undefined; });
        const isDecider = (model: Model) => { const saved = data()?.relay.settings.decider; return !!saved && saved.providerID === model.providerID && saved.id === model.id; };
        const inList = (mode: Mode, model: Model) => chosen(mode).some(choice => choice.providerID === model.providerID && choice.id === model.id);
        // A strip that has just been added slides into its bay, once; the key names the mode and the choice.
        const [fresh, setFresh] = createSignal('');
        const keyOf = (mode: Mode, choice: ModelChoice) => `${mode}:${choice.providerID}/${choice.id}#${choice.variant ?? ''}`;
        // A model goes in with the default effort, or with the first effort not in the list yet; the effort is changed on its strip.
        const addModel = (mode: Mode, model: Model) => {
          const variant = nextEffort(chosen(mode), model); if (variant === undefined) return;
          const choice = { providerID: model.providerID, id: model.id, variant, useFor: '' };
          setFresh(keyOf(mode, choice));
          setList(mode, [...chosen(mode), choice]);
        };
        const taken = (mode: Mode, choice: ModeChoice, variant: string | null) => chosen(mode).some(item => same(item, { ...choice, variant }));
        const setEffort = (mode: Mode, choice: ModeChoice, variant: string | null) => setList(mode, chosen(mode).map(item => same(item, choice) ? { ...item, variant } : item));
        const lastDecision = () => decisions()[0];

        return <section class="rl" ref={element => { root = element; }} data-light={light()} aria-label="Relay">
          <style>{panelCss}</style>
          <header class="rl-top">
            <span class="rl-logo" aria-hidden="true">R</span><h2 class="rl-name">Relay</h2>
          </header>
          <div class="rl-body">
            <p class="rl-lede">Type <kbd>/relay</kbd> and a message: Relay picks Plan, Execute or Review, switches the chat to your model for it, and sends the message. <kbd>/relay on</kbd> does it for every message in a chat.</p>
            <Show when={!response.error} fallback={<div class="rl-note n-bad" role="alert"><Icon name="warn" />Could not load the settings. Check the server connection and try again.</div>}>
              <Show when={data() && data()!.relay.settings.decider === null}><div class="rl-note n-warn" role="status"><Icon name="warn" /><span>{noDeciderNote}</span></div></Show>

              <section class="rl-bay" data-mode="decider" aria-labelledby="rl-bay-decider">
                <header class="rl-bay-head"><h3 id="rl-bay-decider">Decider</h3><span class="rl-bay-say">Picks the mode and model for each message.</span></header>
                <Show when={data()?.relay.settings.decider} fallback={<Show when={adding() !== 'decider'}><button type="button" class="rl-slot-empty is-go" disabled={saving() || response.loading} onClick={() => setAdding('decider')}><Icon name="plus" />Choose a decider</button></Show>}>{decider => {
                  const model = () => deciderModel(), figures = () => model() ? stripFigures(model()!, scoreOf(model()!), decider().variant) : null;
                  return <ol class="rl-rack"><li class="rl-strip" classList={{ 'is-off': !!data() && !model() }}>
                    <span class="rl-slot" title="The decider">D</span>
                    <span class="rl-call">
                      <span class="rl-id" title={`${decider().providerID} / ${decider().id}`}>{decider().id}</span>
                      <span class="rl-meta"><span class="rl-prov">{decider().providerID}</span>
                        <Show when={model()?.variants.length}>
                          <select class="rl-eff" aria-label="Effort for the decider" disabled={saving()} onChange={event => void saveRelay({ decider: { ...decider(), variant: event.currentTarget.value || null } })}>
                            <option value="" selected={decider().variant === null}>default</option>
                            <For each={model()!.variants}>{variant => <option value={variant} selected={decider().variant === variant}>{variant}</option>}</For>
                          </select>
                        </Show>
                      </span>
                    </span>
                    <span class="rl-f" title={figures()?.priceTip}><Price text={figures()?.price ?? '—'} /></span>
                    <span class="rl-f" classList={{ 'is-est': figures()?.estimate ?? true }} title={figures()?.facts}>{figures()?.index ?? '—'}</span>
                    <span class="rl-f">{figures()?.context ?? '—'}</span>
                    <span class="rl-row2">
                      <Show when={data() && !model()}><span class="rl-stamp is-bad" title={GONE}>unavailable</span></Show>
                      <button type="button" class="rl-link" disabled={saving() || response.loading} onClick={() => setAdding(adding() === 'decider' ? null : 'decider')}>{adding() === 'decider' ? 'Keep this decider' : 'Change the decider'}</button>
                    </span>
                    <button type="button" class="rl-x" aria-label={`Remove the decider ${decider().providerID} / ${decider().id}`} disabled={saving()} onClick={() => void saveRelay({ decider: null })}><Icon name="x" /></button>
                  </li></ol>;
                }}</Show>
                <Show when={adding() === 'decider'}>
                  <ModelTable label="Choose a decider" models={deciders()} action="Use" actionLabel={model => `Use ${model.name} from ${model.providerID} as the decider`}
                    can={model => !saving() && !isDecider(model)} mark={model => isDecider(model) ? ' · in use' : ''}
                    pick={model => { setAdding(null); void saveRelay({ decider: { providerID: model.providerID, id: model.id, variant: null } }); }} close={() => setAdding(null)} />
                </Show>
                <p class="rl-last" aria-live="polite">{decisionLine(lastDecision())}</p>
                <div class="rl-try">
                  <input class="rl-in" type="text" aria-label="A sample message to try the decider with" placeholder="Try a message, e.g. fix the login test" value={sample()} onInput={event => setSample(event.currentTarget.value)} onKeyDown={event => { if (event.key === 'Enter') void tryDecider(); }} />
                  <button type="button" class="rl-btn" disabled={trying() || !sample().trim() || !data()?.relay.settings.decider} onClick={() => void tryDecider()}><Icon name="try" />{trying() ? 'Asking…' : 'Try'}</button>
                </div>
                <Show when={tried()?.session === props.session ? tried() : undefined}>{shown => <div class={`rl-note ${shown().bad ? 'n-bad' : 'n-ok'}`} role="status"><span>{shown().text}</span></div>}</Show>
                <details class="rl-fine"><summary><Icon name="chevron" size={12} />What it sends to {data()?.relay.settings.decider?.providerID ?? "the decider's provider"}</summary><p>{privacyNote(data()?.relay.settings.decider?.providerID ?? null)}</p></details>
              </section>

              <button type="button" class="rl-cost" onClick={() => ctx.layout.open(`${ctx.id}:usage`, props.session)} aria-label="Open Relay usage">
                <span class="rl-cost-f"><span class="rl-k">7-day spend</span><span class="rl-v">{spent()?.spent ?? '…'}{spent()?.marked ? '*' : ''}</span></span>
                <span class="rl-cost-f"><span class="rl-k">Tokens</span><span class="rl-v">{spent()?.tokens ?? '…'}</span></span>
                <span class="rl-cost-f"><span class="rl-k">Replies</span><span class="rl-v">{spent()?.replies ?? '…'}</span></span>
                <span class="rl-cost-go">Usage<Icon name="arrow" /></span>
              </button>

              <div class="rl-legend-row" aria-hidden="true"><span /><span>model</span><span>$/M in·out</span><span>index</span><span>ctx</span></div>
              <For each={bays}>{([mode, blurb]) => <section class="rl-bay" data-mode={mode} aria-labelledby={`rl-bay-${mode}`}>
                <header class="rl-bay-head"><h3 id={`rl-bay-${mode}`}>{modeLabel(mode)}</h3><span class="rl-bay-say">{blurb}</span></header>
                <Show when={chosen(mode).length}><ol class="rl-rack"><For each={chosen(mode)}>{(choice, at) => {
                  const model = () => result() && offered(result()!, choice), figures = () => model() ? stripFigures(model()!, scoreOf(model()!), choice.variant) : null;
                  const part = () => ownChoicePart(ownPart(mode), choice);
                  return <li class="rl-strip" classList={{ 'is-off': unavailable(choice), 'rl-arrive': fresh() === keyOf(mode, choice) }} onAnimationEnd={() => setFresh('')}>
                    <span class="rl-slot" title={at() === 0 ? 'First: used when no line fits' : `Slot ${at() + 1}`}>{at() + 1}</span>
                    <span class="rl-call">
                      <span class="rl-id" title={`${choice.providerID} / ${choice.id}`}>{choice.id}</span>
                      <span class="rl-meta"><span class="rl-prov">{choice.providerID}</span></span>
                    </span>
                    <span class="rl-f" title={figures()?.priceTip}><Price text={figures()?.price ?? '—'} /></span>
                    <span class="rl-f" classList={{ 'is-est': figures()?.estimate ?? true }} title={figures()?.facts}>{figures()?.index ?? '—'}</span>
                    <span class="rl-f">{figures()?.context ?? '—'}</span>
                    <span class="rl-row2">
                      <Show when={model()?.variants.length} fallback={<Show when={choice.variant}><span>{choice.variant}</span></Show>}>
                        <select class="rl-eff" aria-label={`Effort for ${choice.id} in ${modeLabel(mode)}`} disabled={saving()} onChange={event => setEffort(mode, choice, event.currentTarget.value || null)}>
                          <option value="" selected={choice.variant === null} disabled={choice.variant !== null && taken(mode, choice, null)}>default</option>
                          <For each={model()!.variants}>{variant => <option value={variant} selected={choice.variant === variant} disabled={choice.variant !== variant && taken(mode, choice, variant)}>{variant}</option>}</For>
                        </select>
                      </Show>
                      <Show when={unavailable(choice)}><span class="rl-stamp is-bad" title={GONE}>unavailable</span></Show>
                      <Show when={part()}>{text => <span class="rl-stamp" title={text()}>{stampOf(text())}</span>}</Show>
                      <input class="rl-for" type="text" maxlength={USE_FOR_MAX} aria-label={`What ${choice.id} is for in ${modeLabel(mode)}`} placeholder="Use it for…" value={choice.useFor} disabled={saving()}
                        onChange={event => { const useFor = event.currentTarget.value.replace(/\s+/g, ' ').trim(); if (useFor !== choice.useFor) setList(mode, chosen(mode).map(item => same(item, choice) ? { ...item, useFor } : item)); }} />
                    </span>
                    <button type="button" class="rl-x" aria-label={`Remove ${choice.providerID} / ${choice.id} / ${choice.variant ?? 'default'} from ${modeLabel(mode)}`} disabled={saving()} onClick={() => setList(mode, chosen(mode).filter(item => !same(item, choice)))}><Icon name="x" /></button>
                  </li>;
                }}</For></ol></Show>
                <Show when={!chosen(mode).length}><p class="rl-bay-note">None yet: /relay leaves the chat as it is for {modeLabel(mode)}.</p></Show>
                <Show when={chosen(mode).some(unavailable)}><p class="rl-bay-note is-warn"><Icon name="warn" />{GONE}.</p></Show>
                <Show when={chosen(mode).length > 1}><details class="rl-fine"><summary><Icon name="chevron" size={12} />{chosen(mode).some(choice => choice.useFor) ? 'Your lines decide between these' : 'No lines: Relay picks by the size of the work'}</summary><p>{severalModelsHint}</p></details></Show>
                <Show when={ownChoiceNote(ownPart(mode))}>{note => <p class="rl-bay-note is-warn"><Icon name="warn" />{note()}</p>}</Show>
                <Show when={mode === 'review' && data()}><p class="rl-bay-note">{checksLine(data()!.relay.checks)}</p></Show>
                <Show when={adding() === mode} fallback={<button type="button" class="rl-slot-empty" disabled={saving() || response.loading} onClick={() => setAdding(mode)}><Icon name="plus" />Add a model to {modeLabel(mode)}</button>}>
                  <ModelTable label={`Add a model to ${modeLabel(mode)}`} models={usable()} action="Add" actionLabel={model => `Add ${model.name} from ${model.providerID} to ${modeLabel(mode)}`}
                    can={model => !saving() && nextEffort(chosen(mode), model) !== undefined} mark={model => `${model.capabilities.tools ? '' : ' · no tools'}${inList(mode, model) ? ' · in the list' : ''}`}
                    tip={model => inList(mode, model) ? 'Adds it once more, with another effort' : undefined} pick={model => addModel(mode, model)} close={() => setAdding(null)} />
                </Show>
              </section>}</For>

              <Show when={saveError()}><div class="rl-note n-bad" role="alert"><Icon name="warn" /><span>{saveError()}</span></div></Show>
              <div class="rl-drawers">
                <Drawer title="Recent choices" sub={`${decisions().length} of the last 20`}>
                  <Show when={decisions().length} fallback={<p>No /relay message yet.</p>}>
                    <ol class="rl-log"><li class="rl-log-head" aria-hidden="true"><span>when</span><span>mode</span><span>model</span><span>sure</span><span>reply</span></li>
                      <For each={decisions()}>{item => <li title={`${when(item.at)} · ${recentLine(item)}`}>
                        <time dateTime={item.at}>{logTime(item.at)}</time>
                        <Show when={item.mode} fallback={<span class="rl-tag is-none">none</span>}>{mode => <span class="rl-tag" data-mode={mode()}>{modeLabel(mode())}</span>}</Show>
                        <span class="rl-log-model">{item.model ? item.model.slice(item.model.indexOf('/') + 1) : item.note ?? (item.kind === 'helper' ? 'left as it was' : 'nothing switched')}</span>
                        <span class="rl-log-f">{item.confidence === null ? '—' : `${Math.round(item.confidence * 100)}%`}</span>
                        <span class="rl-log-f">{(cost => cost ? `$${cost}` : '—')(item.reply?.total?.costUsd ?? item.reply?.costUsd)}</span>
                        <span class="rl-sr">{recentLine(item)}</span>
                      </li>}</For></ol>
                  </Show>
                </Drawer>
                <Drawer title="Prices from Artificial Analysis" sub={data()?.relay.priceKey ? 'key saved' : 'no key'}>
                  <p>For a model OpenCode lists no price for, such as Claude through a subscription login, Relay can take its prices and its intelligence index from Artificial Analysis. Make a free key at artificialanalysis.ai and paste it here. It is kept in OpenCode's plugin storage on this machine, sent only to Artificial Analysis, and never shown again.</p>
                  <div class="rl-inline">
                    <input class="rl-in" type="password" autocomplete="off" aria-label="Artificial Analysis key" placeholder={data()?.relay.priceKey ? 'A key is saved' : 'Paste a key'} value={keyDraft()} onInput={event => setKeyDraft(event.currentTarget.value)} onKeyDown={event => { if (event.key === 'Enter' && keyDraft().trim()) void saveKey(keyDraft()); }} />
                    <button type="button" class="rl-btn" disabled={keying() || !keyDraft().trim()} onClick={() => void saveKey(keyDraft())}>{keying() ? 'Saving…' : 'Save'}</button>
                    <button type="button" class="rl-btn" disabled={keying() || !data()?.relay.priceKey} onClick={() => void saveKey(null)}>Remove</button>
                  </div>
                  <Show when={keyNote()?.session === props.session ? keyNote() : undefined}>{shown => <div class={`rl-note ${shown().bad ? 'n-bad' : 'n-ok'}`} role="status"><span>{shown().text}</span></div>}</Show>
                </Drawer>
                <Drawer title="How Relay works">
                  <p>{switchHint}</p><p>{severalModelsHint}</p><p>{indexSource()}</p><p>{borrowedNote}</p><p>These settings are the same in every project.</p>
                </Drawer>
                <Drawer title="Review rules" sub="added to every review"><pre class="rl-pre">{reviewRules}</pre></Drawer>
              </div>
            </Show>
          </div>
          <footer class="rl-foot">
            <span aria-live="polite">{response.loading ? 'Loading…' : `${result()?.length ?? 0} models available`}{saving() ? ' · saving…' : ''}</span>
            <span class="rl-foot-r"><span class="rl-ver" title="The Relay version this panel runs">{versionLabel}</span>
              <button type="button" class="rl-btn sm" disabled={response.loading} onClick={() => { void refetch(); void refetchSpend(); }}><Icon name="refresh" size={12} />Refresh</button></span>
          </footer>
        </section>;
      },
    });

    // The pill above each chat box: whether every message in that chat goes through Relay, the row that turns it, and the chat's last choice.
    // shortcut: it asks the server again every 5 seconds for the chats shown in the last 15; a server event would do better if OpenCode gives plugins one.
    const [chats, setChats] = createSignal<Record<string, { on: boolean; last: Decision | null; decider: boolean }>>({});
    const seen = new Map<string, { session: MountedSession; at: number }>();
    const relayOf = (session: MountedSession) => ({ rpc: session.server.client.rpc(RelayRpc), options: { location: { directory: session.directory } } });
    // Desktop sends its model picker's choice with every message (2.3.0, 17 Nov), so after Relay switches a chat the picker must follow, or
    // the next message goes back to the old model. Only a switch made while the pill watches the chat is followed, once, and only while that
    // chat is on screen, so a model the person picks afterwards stands.
    // shortcut: a chat switched while another one is on screen is followed when it is shown again; a pick made in the picker within the
    // few seconds before that is overridden.
    const followed = new Map<string, string>();
    const follow = (session: MountedSession, last: Decision | null) => {
      const at = last?.at ?? '';
      if (!followed.has(session.key)) { followed.set(session.key, at); return; }
      if (!last || followed.get(session.key) === at) return;
      const model = pickerModel(last);
      if (!model) { followed.set(session.key, at); return; }
      if (ctx.sessions.current()?.key !== session.key) return;
      if (ctx.screen.current()?.composer.setModel(model)) followed.set(session.key, at);
    };
    const refresh = async (session: MountedSession) => {
      try {
        const { rpc, options } = relayOf(session);
        const value = await rpc.getRelayChat({ sessionID: session.id }, options) as { on: boolean; last: Decision | null; decider: boolean };
        setChats(previous => ({ ...previous, [session.key]: value }));
        follow(session, value.last);
      } catch { /* the pill keeps what it showed, or stays hidden */ }
    };
    const turn = async (session: MountedSession, on: boolean) => {
      try { const { rpc, options } = relayOf(session); await rpc.setRelayChat({ sessionID: session.id, on }, options); } catch { /* shown by the refresh below */ }
      await refresh(session);
    };
    const timer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of seen) if (now - entry.at > 15_000) seen.delete(key); else void refresh(entry.session);
    }, 5000);
    try {
      ctx.add(ComposerPill, {
        id: 'relay',
        show: input => {
          const session = input.session, first = !seen.has(session.key);
          seen.set(session.key, { session, at: Date.now() });
          if (first) void refresh(session);
          const state = chats()[session.key];
          if (!state) return undefined;
          const view = pillView(state);
          const run = (id: string) => id === 'toggle' ? () => void turn(session, !state.on) : id === 'decider' ? () => ctx.layout.open(`${ctx.id}:models`, session) : undefined;
          return {
            label: view.label, icon: view.icon, tone: view.tone, title: 'Relay',
            rows: view.rows.map(row => ({ id: row.id, label: row.label, tone: row.tone, run: run(row.id) })),
          };
        },
      });
    } catch { /* a host without the pill registry loses only the pill */ }
    return () => clearInterval(timer);
  },
});
