// A preview of Relay's two panels outside OpenCode, for design work and screenshots: `npm run preview:panel`, then open
// http://127.0.0.1:5199/?panel=models|usage&light=day|night&state=set|empty. OpenCode's own GUI and RPC modules are stubbed (stubs.ts) and
// every RPC answer is made-up sample data (fixtures.ts). Nothing here ships: the package holds dist/ only.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

const here = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root: here,
  plugins: [solid()],
  resolve: { alias: { '@opencode/plugin/gui': `${here}stubs.ts`, '@opencode/plugin/rpc': `${here}stubs.ts` } },
  server: { host: '127.0.0.1', port: 5199, strictPort: true },
});
