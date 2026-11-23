import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeSize, sizeReport, type SizeOutcome } from '../scripts/decider-size.js';

const outcome = (id: string, expect: 'small' | 'big', tag: string, size: 'small' | 'big' | null, confidence: number | null): SizeOutcome =>
  ({ id, expect, tag, reply: false, mode: 'execute', modeSure: 1, size, sizeSure: confidence, verdict: judgeSize(expect, size && confidence !== null ? { size, confidence } : null), ms: 100, costUsd: '0', note: null });

test('a size at 0.5 or more counts, under 0.5 is unsure, and a failed try called small misses the bar', () => {
  assert.equal(judgeSize('big', { size: 'big', confidence: 0.5 }), 'right');
  assert.equal(judgeSize('big', { size: 'small', confidence: 0.96 }), 'wrong');
  assert.equal(judgeSize('big', { size: 'big', confidence: 0.49 }), 'unsure');
  assert.equal(judgeSize('small', null), 'unsure');
  const passing = [...Array.from({ length: 24 }, (_, at) => outcome(`r${at}`, 'small', 'direct', 'small', 0.9)), ...Array.from({ length: 6 }, (_, at) => outcome(`u${at}`, 'big', 'direct', 'big', 0.3))];
  assert.match(sizeReport(passing, 30), /24 of 30 right, 0 failed tries answered small: PASS\.$/m);
  assert.match(sizeReport([...passing.slice(0, 29), outcome('f', 'big', 'failed try', 'small', 0.9)], 30), /1 failed tries answered small: MISS\.$/m);
  assert.match(sizeReport(passing.slice(0, 24), 30), /MISS\.$/m, 'a run that stopped early never passes');
});
