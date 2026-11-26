import { createSignal, onCleanup, onMount, type Accessor, type JSX } from 'solid-js';

// Parts both Relay panels share: drawn icons, and the board's light. Nothing here may import from `node:` (the panel bundles it).

const paths = {
  x: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
  plus: 'M8 3.5v9M3.5 8h9',
  chevron: 'M6 4l4 4-4 4',
  refresh: 'M12.5 6.5A4.75 4.75 0 1 0 12.75 9.5M12.5 3v3.5H9',
  arrow: 'M3.5 8h9M9 4.5L12.5 8 9 11.5',
  warn: 'M8 2.75l5.75 10H2.25zM8 6.75v2.5M8 11.4v.1',
  try: 'M3.5 8h7M8 5l3 3-3 3M13 3.5v9',
} as const;
export type IconName = keyof typeof paths;
/** One drawn icon, 16 px, in the text's colour; hidden from screen readers, so its control names itself. */
export const Icon = (props: { name: IconName; size?: number }): JSX.Element =>
  <svg class="rl-icon" width={props.size ?? 14} height={props.size ?? 14} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d={paths[props.name]} />
  </svg>;

/**
 * The board's light: night when OpenCode's background is dark, else day. The panel keeps its own colours (owner, 26 Nov 2026) but follows
 * whether Desktop is light or dark, read from the host's `--background-base`, else from the system setting, and again when either changes.
 */
export function boardLight(root: Accessor<HTMLElement | undefined>): Accessor<'day' | 'night'> {
  const [light, setLight] = createSignal<'day' | 'night'>('day');
  const read = () => {
    const at = root(); if (!at) return;
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;width:0;height:0;color:var(--background-base,rgba(0,0,0,0))';
    at.appendChild(probe);
    const parts = getComputedStyle(probe).color.match(/[\d.]+/g)?.map(Number) ?? [];
    probe.remove();
    const [r = 0, g = 0, b = 0, alpha = 1] = parts;
    const dark = alpha === 0 ? matchMedia('(prefers-color-scheme: dark)').matches : (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
    setLight(dark ? 'night' : 'day');
  };
  onMount(() => {
    read();
    const watch = new MutationObserver(read), media = matchMedia('(prefers-color-scheme: dark)');
    for (const node of [document.documentElement, document.body]) watch.observe(node, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme'] });
    media.addEventListener('change', read);
    onCleanup(() => { watch.disconnect(); media.removeEventListener('change', read); });
  });
  return light;
}
