// How long Go's cache lives (plan: docs/superpowers/plans/2026-11-26-relay-improve-on-go.md, Task 3).
// THIS SENDS REAL REQUESTS through the owner's own OpenCode to two OpenCode Go models, using their Go allowance: at most 5 messages a
// chat, 10 in all, each answered with one word. Run it only with the owner's yes, in the test folder they have opened in Desktop
// (RELAY_BENCH_DIR, by default relay-bench in the home folder); the service gets no request about any other folder.
// Each chat first sends about 6,000 made-up words that no other chat shares, then a one-word message 4, 8, 16 and 31 minutes after the
// previous reply. A probe whose first request read 90% or more of its prompt from the cache found the cache alive (`cacheAlive`).
// Usage: npx tsx scripts/bench/cache-life.ts --out <file.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { OpenCode } from '@opencode/client/promise';
import { cacheAlive, DENIED_TOOLS, type Tokens } from './lib.js';

const { values: flags } = parseArgs({ options: { out: { type: 'string' } } });
if (!flags.out) throw new Error('Say where the rows go: --out <file.json>');
const out = flags.out;
const folder = process.env.RELAY_BENCH_DIR ?? join(homedir(), 'relay-bench');
const MODELS = [{ providerID: 'opencode-go', id: 'kimi-k3.1-pro' }, { providerID: 'opencode-go', id: 'glm-5.3-flash' }];
const GAPS_MINUTES = [4, 8, 16, 31];
const MESSAGE_LIMIT_MS = 5 * 60_000;

// shortcut: the connection and the wait for idle are copied from run.ts (a one-off check); move them to a shared module if a third runner needs them.
// The owner's running service: its address and password from its own file. The password is never printed.
const service = JSON.parse(readFileSync(join(homedir(), '.local', 'state', 'opencode', 'service.json'), 'utf8')) as { url: string; password: string };
const client = OpenCode.make({ baseUrl: service.url, headers: { authorization: `Basic ${Buffer.from(`opencode:${service.password}`).toString('base64')}` } });
const location = { directory: folder };
const items = (value: unknown): any[] => (Array.isArray(value) ? value : ((value as { data?: unknown[] } | null)?.data ?? []));
const sleep = (ms: number) => new Promise(done => setTimeout(done, ms));

/** Made-up words from a seed, so that the first message is text no other chat has sent. */
function filler(seed: number, count: number): string {
  const syllables = ['ka', 'lo', 'mi', 'ten', 'ru', 'sa', 'vo', 'pi', 'del', 'nor', 'qu', 'zan'];
  let state = seed >>> 0;
  const next = () => (state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0);
  return Array.from({ length: count }, () => Array.from({ length: 2 + (next() % 3) }, () => syllables[next() % syllables.length]).join('')).join(' ');
}

const tokensOf = (entry: any): Tokens => {
  const t = entry?.tokens ?? {};
  return { input: t.input ?? 0, output: t.output ?? 0, reasoning: t.reasoning ?? 0, cache: { read: t.cache?.read ?? 0, write: t.cache?.write ?? 0 } };
};

/** Sends one message and waits for the chat to go idle. The first new assistant entry is the message's first request. */
async function send(sessionID: string, text: string): Promise<{ entry: any | null; error: string | null }> {
  const before = items(await client.session.context({ sessionID })).length;
  await client.session.prompt({ sessionID, text });
  for (const deadline = Date.now() + MESSAGE_LIMIT_MS; Date.now() < deadline; await sleep(2000)) {
    const added = items(await client.session.context({ sessionID })).slice(before);
    if (!added.some(entry => entry.type === 'idle')) continue;
    const entry = added.find(item => item.type === 'assistant') ?? null;
    return { entry, error: entry === null ? 'no answer' : entry.error ? String(entry.error.message ?? entry.error) : null };
  }
  await client.session.interrupt({ sessionID }).catch(() => {});
  return { entry: null, error: `no answer within ${MESSAGE_LIMIT_MS / 60_000} minutes` };
}

type Row = { model: string; gapMinutes: number | null; cacheRead: number; prompt: number; alive: boolean | null; error: string | null };

/** One chat on `model`: the first message, then a probe after each gap. It stops at the first request that failed. */
async function probe(model: { providerID: string; id: string }, seed: number): Promise<Row[]> {
  const name = `${model.providerID}/${model.id}`, rows: Row[] = [];
  const permissions = ['edit', 'write', 'bash', ...DENIED_TOOLS].map(action => ({ action, resource: '*', effect: 'deny' as const }));
  const { id: sessionID } = await client.session.create({ model, location, title: `relay-bench cache-life ${model.id}`, permissions });
  const row = (gapMinutes: number | null, result: { entry: any | null; error: string | null }): Row => {
    const tokens = tokensOf(result.entry), prompt = tokens.input + tokens.cache.read + tokens.cache.write;
    const value: Row = { model: name, gapMinutes, cacheRead: tokens.cache.read, prompt, alive: gapMinutes === null || result.error ? null : cacheAlive(tokens), error: result.error };
    rows.push(value);
    console.log([name, gapMinutes ?? 'first', value.cacheRead, value.prompt, value.alive ?? '-', value.error ?? ''].join('\t'));
    return value;
  };
  if (row(null, await send(sessionID, `Reply with the single word: ready.\n\n${filler(seed, 6000)}`)).error) return rows;
  for (const gap of GAPS_MINUTES) {
    await sleep(gap * 60_000);
    if (row(gap, await send(sessionID, 'Reply with the single word: ok')).error) break;
  }
  return rows;
}

console.log(['model', 'gap (minutes)', 'cache read', 'prompt', 'alive', 'error'].join('\t'));
const seed = Date.now();
const rows = (await Promise.all(MODELS.map((model, index) => probe(model, seed + index)))).flat();
writeFileSync(out, JSON.stringify({ at: new Date(seed).toISOString(), rows }, null, 2));
