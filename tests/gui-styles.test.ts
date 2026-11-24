import { test } from 'node:test';
import assert from 'node:assert/strict';
import { panelCss } from '../src/gui-styles.js';

// The panel's styles are one string, so a second rule for the same class quietly changes every place the first one served. On 24 Nov the
// usage tab's table rows used `.rl-row`, the panel's flex row, and lost their columns: Cost and Tokens went off-screen.
test('each selector is styled by one rule only', () => {
  const selectors = [...panelCss.matchAll(/([^{}]+)\{/g)].flatMap(match => match[1]!.split(',').map(selector => selector.trim()));
  assert.deepEqual(selectors.filter((selector, at) => selectors.indexOf(selector) !== at), []);
});

// A grid of `auto` rows gives a scroll box (overflow:auto) only the height left over, which in a short window is none: on 24 Nov both
// tables of the usage tab were empty boxes in a window 720 px tall.
test('the panel body gives each part the height of its content, so a scroll box never shrinks to nothing', () => {
  assert.match(panelCss, /\.rl-body\{[^}]*grid-auto-rows:max-content/);
});
