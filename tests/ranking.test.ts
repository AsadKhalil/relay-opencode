import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EFFORTS, OWN_REPLIES, TYPICAL_IN, TYPICAL_OUT, rank, type Standing } from '../src/ranking.js';
import { modelName } from '../src/relay-store.js';

const pick = (id: string, variant: string | null = null) => ({ providerID: 'p', id, variant });
const ch = (id: string, variant: string | null = null, useFor = '') => ({ ...pick(id, variant), useFor });
const st = (index: number | null, input: string | null, output: string | null, extra: Partial<Standing> = {}): Standing => ({ index, coding: null, inputPerMillion: input, outputPerMillion: output, outPerRequest: null, ...extra });
const map = (...rows: [ReturnType<typeof ch>, Standing][]) => new Map(rows.map(([choice, standing]) => [modelName(choice), standing]));

test('the values the design fixes', () => {
  assert.deepEqual(EFFORTS, ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual([TYPICAL_IN, TYPICAL_OUT, OWN_REPLIES], [1500, 500, 3]);
});

test('a mode with a line, or with one usable model, is not Relay’s to choose', () => {
  assert.equal(rank('execute', [ch('a', null, 'small edits'), ch('b')], [ch('a'), ch('b')], map(), null), null);
  assert.equal(rank('execute', [ch('a'), ch('b')], [ch('a')], map(), null), null);
});

test('big work goes to the highest index, small work to the cheapest typical request', () => {
  const s = map([ch('kimi'), st(60, '2', '10')], [ch('flash'), st(30, '0.15', '0.5')]);
  assert.deepEqual(rank('plan', [ch('flash'), ch('kimi')], [ch('flash'), ch('kimi')], s, null), { kind: 'ranked', strongest: pick('kimi'), cheapest: pick('flash') });
});

test('Execute ranks by the Coding index only when every model has one', () => {
  const both = map([ch('a'), st(60, '1', '1', { coding: 40 })], [ch('b'), st(50, '2', '2', { coding: 45 })]);
  assert.equal((rank('execute', [ch('a'), ch('b')], [ch('a'), ch('b')], both, null) as { strongest: { id: string } }).strongest.id, 'b');
  assert.equal((rank('plan', [ch('a'), ch('b')], [ch('a'), ch('b')], both, null) as { strongest: { id: string } }).strongest.id, 'a');
  const one = map([ch('a'), st(60, '1', '1', { coding: 40 })], [ch('b'), st(50, '2', '2')]);
  assert.equal((rank('execute', [ch('a'), ch('b')], [ch('a'), ch('b')], one, null) as { strongest: { id: string } }).strongest.id, 'a', 'one missing Coding index means the main index for all');
});

test('a model that writes a lot is not cheap', () => {
  const s = map([ch('a'), st(40, '1', '2', { outPerRequest: 20_000 })], [ch('b'), st(50, '2', '4', { outPerRequest: 500 })]);
  assert.equal((rank('plan', [ch('a'), ch('b')], [ch('a'), ch('b')], s, null) as { cheapest: { id: string } }).cheapest.id, 'b');
});

test('two rows of one model go by effort, and the default effort cannot be ranked against them', () => {
  const s = map([ch('s', 'low'), st(55, '3', '15')], [ch('s', 'high'), st(55, '3', '15')], [ch('s'), st(55, '3', '15')]);
  assert.deepEqual(rank('execute', [ch('s', 'low'), ch('s', 'high')], [ch('s', 'low'), ch('s', 'high')], s, null), { kind: 'ranked', strongest: pick('s', 'high'), cheapest: pick('s', 'low') });
  assert.deepEqual(rank('execute', [ch('s'), ch('s', 'low')], [ch('s'), ch('s', 'low')], s, null), { kind: 'unranked', reason: 'choose an effort for each s row' });
});

test('no index or no price leaves the list unranked, and $0 counts as no price', () => {
  const list = [ch('a'), ch('b')];
  assert.deepEqual(rank('plan', list, list, map([ch('a'), st(40, '1', '1')], [ch('b'), st(null, '1', '1')]), null), { kind: 'unranked', reason: 'no index for b' });
  assert.deepEqual(rank('plan', list, list, map([ch('a'), st(40, '1', '1')], [ch('b'), st(30, '0', '0.000')]), null), { kind: 'unranked', reason: 'no price for b' });
  assert.deepEqual(rank('plan', list, list, map([ch('a'), st(40, '1', '1')], [ch('b'), st(30, null, '1')]), null), { kind: 'unranked', reason: 'no price for b' });
  assert.deepEqual(rank('plan', list, list, map([ch('a'), st(40, '1', '1')]), null), { kind: 'unranked', reason: 'no index for b' }, 'no standing at all');
});

test('in Review no reviewer is weaker than the model that wrote the work', () => {
  const list = [ch('cheap'), ch('strong')], s = map([ch('cheap'), st(40, '0.1', '0.5')], [ch('strong'), st(60, '3', '15')], [ch('writer'), st(50, '1', '1')], [ch('top'), st(70, '1', '1')]);
  assert.deepEqual(rank('review', list, list, s, pick('writer')), { kind: 'ranked', strongest: pick('strong'), cheapest: pick('strong') });
  assert.deepEqual(rank('review', list, list, s, pick('top')), { kind: 'ranked', strongest: pick('strong'), cheapest: pick('strong') });
  assert.equal((rank('review', list, list, s, pick('unknown')) as { cheapest: { id: string } }).cheapest.id, 'cheap');
  assert.equal((rank('plan', list, list, s, pick('top')) as { cheapest: { id: string } }).cheapest.id, 'cheap', 'the guard is for Review only');
});

test('ties go by the person’s order', () => {
  const s = map([ch('a'), st(40, '1', '1')], [ch('b'), st(40, '1', '1')]);
  assert.deepEqual(rank('plan', [ch('b'), ch('a')], [ch('b'), ch('a')], s, null), { kind: 'ranked', strongest: pick('b'), cheapest: pick('b') });
});
