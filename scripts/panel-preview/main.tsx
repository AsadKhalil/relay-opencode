// Mounts one of Relay's real panels (src/gui.tsx) with a fake OpenCode context and sample answers. URL parameters:
// panel=models|usage, light=day|night (sets the host's background the way OpenCode's theme does), state=set|empty|retired.
import { render } from 'solid-js/web';
import plugin from '../../src/gui.tsx';
import { Panel } from './stubs.ts';
import { rpcFor } from './fixtures.ts';

const params = new URLSearchParams(location.search);
const which = params.get('panel') === 'usage' ? 'usage' : 'models', night = params.get('light') === 'night', state = params.get('state') === 'empty' ? 'empty' : params.get('state') === 'retired' ? 'retired' : 'set';
// OpenCode Desktop's themes set these on the page; the panel reads the background to choose its light.
document.documentElement.style.setProperty('--background-base', night ? '#151619' : '#fcfcfc');
document.documentElement.style.setProperty('--text-base', night ? '#d8d8d8' : '#1f1f1f');

const directory = 'C:/work/sample-app', rpc = rpcFor(state, directory);
const session = { key: 'preview', id: 'ses_preview', directory, server: { client: { rpc: () => rpc } } };
const panels: { id: string; render: (props: { session: typeof session }) => unknown }[] = [];
const ctx = {
  id: 'relay-opencode',
  add: (token: unknown, spec: unknown) => { if (token === Panel) panels.push(spec as (typeof panels)[number]); },
  sessions: { current: () => session },
  layout: { toggle: () => undefined, open: (id: string) => { location.search = `?panel=${id.endsWith(':usage') ? 'usage' : 'models'}&light=${night ? 'night' : 'day'}&state=${state}`; } },
  screen: { current: () => null },
};
(plugin as unknown as { setup: (context: typeof ctx) => void }).setup(ctx);
const panel = panels.find(item => item.id === which)!;
render(() => <div style={{ width: `${which === 'usage' ? 420 : 380}px`, height: '100vh', 'border-right': '1px solid rgba(127,127,127,.25)' }}>{panel.render({ session }) as never}</div>, document.getElementById('root')!);
