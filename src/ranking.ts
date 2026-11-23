import { parseUsd } from './costs.js';
import { modelName, type Mode, type ModeChoice } from './relay-store.js';
import type { ModelChoice } from './settings.js';

// Relay's own choice inside a mode (docs/superpowers/specs/2026-11-23-relay-own-choice-by-index-and-price-design.md). When a mode has two or
// more usable models and no "use it for" lines, Relay ranks them itself: the highest index takes big work, the cheapest typical request takes
// small work. Pure rules over what Relay has stored; the decider never sees any of it. Nothing here may import from `node:` (the panel bundles it).

/** The efforts Relay can order, weakest first. A model's default effort is not on it: providers differ on what the default means. */
export const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
/** A typical request until a model has replies of its own: tokens read new and tokens written (the cost check's own guess), and how many of its replies make an average. */
export const TYPICAL_IN = 1500, TYPICAL_OUT = 500, OWN_REPLIES = 3;

/** What Relay knows of one model at one effort, from its stored copies: the Intelligence and Coding indexes, its prices in USD a million tokens, and its own output and reasoning a request. */
export type Standing = { index: number | null; coding: number | null; inputPerMillion: string | null; outputPerMillion: string | null; outPerRequest: number | null };
/** By `modelName(choice)`. */
export type Standings = ReadonlyMap<string, Standing>;
export type Size = 'small' | 'big';
export type SizeAnswer = { size: Size; confidence: number };
export type Ranked = { kind: 'ranked'; strongest: ModelChoice; cheapest: ModelChoice } | { kind: 'unranked'; reason: string };

const plain = ({ providerID, id, variant }: ModelChoice): ModelChoice => ({ providerID, id, variant });
const sameModel = (a: ModelChoice, b: ModelChoice) => a.providerID === b.providerID && a.id === b.id;
/** The place of an effort on the scale, or -1 for the default effort and any other name. */
const onScale = (variant: string | null) => variant === null ? -1 : (EFFORTS as readonly string[]).indexOf(variant);
const MEDIUM = EFFORTS.indexOf('medium');

/** Relay's own choice for a mode, or null when it is not Relay's to make: a line is written, or fewer than two models can be used now. */
export function rank(mode: Mode, list: readonly ModeChoice[], usable: readonly ModeChoice[], standings: Standings, writer: ModelChoice | null): Ranked | null {
  if (list.some(choice => choice.useFor !== '') || usable.length < 2) return null;
  const unranked = (reason: string): Ranked => ({ kind: 'unranked', reason });
  // Rows of one model differ only by their effort, so both must be on the scale to be told apart.
  for (const [at, row] of usable.entries()) {
    if (usable.slice(at + 1).some(other => sameModel(row, other) && (onScale(row.variant) < 0 || onScale(other.variant) < 0))) return unranked(`choose an effort for each ${row.id} row`);
  }
  const standingOf = (choice: ModelChoice) => standings.get(modelName(choice));
  // One index for the whole comparison: Execute's Coding index only when every model has one.
  const coding = mode === 'execute' && usable.every(row => typeof standingOf(row)?.coding === 'number');
  const scoreOf = (choice: ModelChoice) => { const standing = standingOf(choice), score = coding ? standing?.coding : standing?.index; return typeof score === 'number' ? score : null; };
  const missingIndex = usable.find(row => scoreOf(row) === null);
  if (missingIndex) return unranked(`no index for ${missingIndex.id}`);
  const priceOf = (choice: ModelChoice) => {
    const standing = standingOf(choice);
    if (!standing || standing.inputPerMillion === null || standing.outputPerMillion === null) return null;
    try {
      const input = parseUsd(standing.inputPerMillion), output = parseUsd(standing.outputPerMillion);
      return input === 0n && output === 0n ? null : { input, output };   // $0 can mean "not listed", so it is no price
    } catch { return null; }
  };
  const missingPrice = usable.find(row => priceOf(row) === null);
  if (missingPrice) return unranked(`no price for ${missingPrice.id}`);

  /** The model whose best row scores highest (a tie goes to the model met first), then that model's highest effort. */
  const strongestOf = (rows: readonly ModeChoice[]): ModeChoice => {
    let best = rows[0], bestScore = -Infinity;
    for (const row of rows) {
      const score = Math.max(...rows.filter(other => sameModel(other, row)).map(other => scoreOf(other) ?? -Infinity));
      if (score > bestScore) { best = row; bestScore = score; }
    }
    return rows.filter(row => sameModel(row, best)).reduce((top, row) => onScale(row.variant) > onScale(top.variant) ? row : top);
  };
  /** A typical request: TYPICAL_IN read at the input price, and the model's own output and reasoning (TYPICAL_OUT until it has its own) at the output price. */
  const costOf = (row: ModeChoice) => {
    const price = priceOf(row)!, own = standingOf(row)?.outPerRequest;
    const out = typeof own === 'number' && Number.isFinite(own) && own >= 0 ? Math.round(own) : TYPICAL_OUT;
    return BigInt(TYPICAL_IN) * price.input + BigInt(out) * price.output;
  };
  const tie = (row: ModeChoice) => { const place = onScale(row.variant); return place < 0 ? MEDIUM : place; };
  const cheapestOf = (rows: readonly ModeChoice[]): ModeChoice => rows.reduce((low, row) => {
    const cost = costOf(row), lowest = costOf(low);
    return cost < lowest || (cost === lowest && tie(row) < tie(low)) ? row : low;
  });

  let rows: readonly ModeChoice[] = usable;
  // A reviewer weaker than the writer made results worse (docs/research/2026-11-17-relay-cost-and-model-choice.md), so none is kept below it.
  const bar = mode === 'review' && writer ? standingOf(writer)?.index : null;
  if (typeof bar === 'number') {
    const kept = usable.filter(row => (standingOf(row)?.index ?? -Infinity) >= bar);
    rows = kept.length ? kept : [strongestOf(usable)];
  }
  return { kind: 'ranked', strongest: plain(strongestOf(rows)), cheapest: plain(cheapestOf(rows)) };
}
