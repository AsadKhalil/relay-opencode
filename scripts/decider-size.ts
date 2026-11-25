// The size question of Relay's own choice (docs/superpowers/specs/2026-11-23-relay-own-choice-by-index-and-price-design.md), asked of a real
// decision model with the made-up cases in scripts/decider-size-cases.json. First run 23 Nov 2026: 27 of 30 right (docs/compatibility.md).
// THIS MAKES REAL REQUESTS: one per case, at most 30, to the model in RELAY_SIZE_MODEL (default opencode/jev-1.13-free), from an isolated
// OpenCode whose XDG, home, app-data and temp folders all sit in a scratch root outside the home folder, with a throwaway password, no login
// and no plugin. Run it only with the owner's yes. It refuses a model whose listed price is not 0 unless RELAY_SIZE_PAID=1, and it stops after
// three cases in a row with no size answer. Needs RELAY_SMOKE_CLI pointing at an `opencode` 2.3 binary.
// RELAY_SIZE_OUT=<file> keeps the outcomes; RELAY_SIZE_FROM=<file> prints the report for kept outcomes again, with no request;
// RELAY_SIZE_SET=<file> uses another set of cases.
// The bar, fixed before the first run: at least 24 of 30 right (a size answered with 0.5 or more, equal to the label), and no failed try
// answered small with 0.5 or more.
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { OpenCode } from '@opencode/client/promise';
import { formatUsd, parseUsd, usdString } from '../src/costs.js';
import { buildDecisionRequest, LATE, TIMEOUT_MS, within, type DecisionsRequest } from '../src/decider.js';
import { listProjectModels } from '../src/inventory.js';
import { LINE_UNSURE_BELOW } from '../src/router.js';
import type { Size } from '../src/ranking.js';
import { modelRefusal } from './decider-examples.js';

/** `task` is the chat's first message, for the cases of 25 Nov (scripts/decider-size-task-cases.json); the 23 Nov cases have none. */
export type SizeCase = { id: string; expect: Size; tag: string; agent: 'plan' | 'build' | null; text: string; reply: string | null; task?: string | null };
export type SizeOutcome = { id: string; expect: Size; tag: string; reply: boolean; mode: string | null; modeSure: number | null; size: Size | null; sizeSure: number | null; verdict: 'right' | 'wrong' | 'unsure'; ms: number; costUsd: string | null; note: string | null };

const MAX_REQUESTS = 30, BAR = 24;
const sleep = (ms: number) => new Promise(done => setTimeout(done, ms));
const sure = (value: unknown): value is number => typeof value === 'number' && value >= 0 && value <= 1;

/** A size answered with 0.5 or more counts (as Relay counts it); anything else is unsure. */
export function judgeSize(expect: Size, answer: { size: Size; confidence: number } | null): SizeOutcome['verdict'] {
  return answer && answer.confidence >= LINE_UNSURE_BELOW ? (answer.size === expect ? 'right' : 'wrong') : 'unsure';
}

/** The table and the verdict. A run with fewer outcomes than `total` cases never passes. */
export function sizeReport(outcomes: readonly SizeOutcome[], total: number): string {
  const count = (pick: (item: SizeOutcome) => boolean) => outcomes.filter(pick).length;
  const group = (label: string, pick: (item: SizeOutcome) => boolean) => {
    const items = outcomes.filter(pick);
    return `${label}: ${items.length} cases, ${items.filter(item => item.verdict === 'right').length} right, ${items.filter(item => item.verdict === 'wrong').length} wrong, ${items.filter(item => item.verdict === 'unsure').length} unsure`;
  };
  const right = count(item => item.verdict === 'right'), failedSmall = count(item => item.tag === 'failed try' && item.verdict === 'wrong' && item.size === 'small');
  const times = outcomes.map(item => item.ms).sort((a, b) => a - b);
  const cost = outcomes.reduce((sum, item) => { try { return item.costUsd === null ? sum : sum + parseUsd(item.costUsd); } catch { return sum; } }, 0n);
  const pct = (value: number | null) => value === null ? '-' : `${Math.round(value * 100)}%`;
  return [
    ...outcomes.map(item => `${item.id}  expect ${item.expect.padEnd(5)}  said ${(item.size ?? '-').padEnd(5)} ${pct(item.sizeSure).padStart(4)}  ${item.verdict.padEnd(6)}  mode ${(item.mode ?? '-').padEnd(7)} ${pct(item.modeSure).padStart(4)}  ${item.ms} ms  ${item.tag}${item.note ? `  [${item.note}]` : ''}`), '',
    group('All', () => true), group('Labelled small', item => item.expect === 'small'), group('Labelled big', item => item.expect === 'big'),
    group('With the end of a reply', item => item.reply), group('No reply (first message)', item => !item.reply), group('Failed tries', item => item.tag === 'failed try'),
    `Mode answers: execute ${count(item => item.mode === 'execute')}, plan ${count(item => item.mode === 'plan')}, review ${count(item => item.mode === 'review')}, none ${count(item => item.mode === null)}`,
    `Time: median ${times.length ? times[Math.floor((times.length - 1) / 2)] : '-'} ms, slowest ${times.length ? times[times.length - 1] : '-'} ms. Cost reported: ${formatUsd(cost)}.`,
    `PASS MARK (fixed before the first run): at least ${BAR} of ${total} right, and no failed try answered small. Result: ${right} of ${outcomes.length} right, ${failedSmall} failed tries answered small: ${right >= BAR && failedSmall === 0 && outcomes.length === total ? 'PASS' : 'MISS'}.`,
  ].join('\n');
}

function judged(item: SizeCase, result: unknown, ms: number, note: string | null): SizeOutcome {
  type Raw = { name?: unknown; choice?: unknown; confidence?: unknown };
  const answers = (result as { answers?: unknown } | null)?.answers;
  const named = (name: string) => Array.isArray(answers) ? answers.find(entry => entry !== null && typeof entry === 'object' && (entry as Raw).name === name) as Raw | undefined : undefined;
  const mode = named('mode'), size = named('execute_size');
  const said = size?.choice === 'small' || size?.choice === 'big' ? size.choice : null, confidence = sure(size?.confidence) ? size.confidence : null;
  return {
    id: item.id, expect: item.expect, tag: item.tag, reply: item.reply !== null, mode: typeof mode?.choice === 'string' ? mode.choice : null, modeSure: sure(mode?.confidence) ? mode.confidence : null,
    size: said, sizeSure: confidence, verdict: judgeSize(item.expect, said && confidence !== null ? { size: said, confidence } : null), ms, costUsd: usdString((result as { cost?: unknown } | null)?.cost), note,
  };
}

async function main() {
  const cases = JSON.parse(readFileSync(process.env.RELAY_SIZE_SET ?? new URL('./decider-size-cases.json', import.meta.url), 'utf8')) as SizeCase[];
  if (process.env.RELAY_SIZE_FROM) { console.log(sizeReport(JSON.parse(readFileSync(process.env.RELAY_SIZE_FROM, 'utf8')) as SizeOutcome[], cases.length)); return; }
  if (cases.length > MAX_REQUESTS) throw new Error(`more than ${MAX_REQUESTS} cases`);
  const cli = process.env.RELAY_SMOKE_CLI ?? 'opencode', password = 'synthetic-local-size';
  const [providerID, ...idParts] = (process.env.RELAY_SIZE_MODEL ?? 'opencode/jev-1.13-free').split('/'), id = idParts.join('/'), decider = { providerID, id, variant: null };
  // A scratch root outside the home folder, so no path the host sees holds the user's name (AGENTS.md, 18 Nov 2026).
  const root = await mkdtemp(join(process.platform === 'win32' ? parse(homedir()).root : tmpdir(), 'relay-size-')), folder = (name: string) => join(root, name);
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '', ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}), ...(process.env.COMSPEC ? { COMSPEC: process.env.COMSPEC } : {}),
    XDG_CONFIG_HOME: folder('config'), XDG_DATA_HOME: folder('data'), XDG_CACHE_HOME: folder('cache'), XDG_STATE_HOME: folder('state'),
    HOME: folder('home'), USERPROFILE: folder('home'), APPDATA: folder('roaming'), LOCALAPPDATA: folder('local'), TEMP: folder('temp'), TMP: folder('temp'), TMPDIR: folder('temp'),
    OPENCODE_SERVER_PASSWORD: password,
  };
  let child: ReturnType<typeof spawn> | undefined;
  try {
    await Promise.all(['project', 'config', 'data', 'cache', 'state', 'home', 'roaming', 'local', 'temp'].map(name => mkdir(folder(name), { recursive: true })));
    const version = (await promisify(execFile)(cli, ['--version'], { timeout: 20_000, env })).stdout.trim();
    const listener = createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
    const { port } = listener.address() as { port: number }; await new Promise(done => listener.close(done));
    let log = '';
    child = spawn(cli, ['serve', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: folder('project'), env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', chunk => { log += chunk.toString(); }); child.stderr?.on('data', chunk => { log += chunk.toString(); });
    const client = OpenCode.make({ baseUrl: `http://127.0.0.1:${port}`, headers: { authorization: `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}` } });
    // Model records can carry credentials, so the list is read through the plugin's own filter and nothing else of it is printed.
    const deciders = async () => listProjectModels({ location: { directory: folder('project') }, model: client.model } as never, 'decision');
    let listed: Awaited<ReturnType<typeof deciders>> | undefined;
    for (const deadline = Date.now() + 60_000; Date.now() < deadline && !listed;) {
      if (child.exitCode !== null) throw new Error(`OpenCode exited: ${log.slice(-600)}`);
      try { listed = await deciders(); } catch { await sleep(300); }
    }
    if (!listed) throw new Error(`OpenCode did not answer within a minute: ${log.slice(-600)}`);
    const refusal = modelRefusal(providerID, id, listed, process.env.RELAY_SIZE_PAID === '1');
    if (refusal) throw new Error(refusal);
    const ask = async (request: DecisionsRequest) => {
      const result = await client.experimental.generate.decisions(request as never) as { answers?: unknown; data?: unknown };
      return result.answers === undefined && result.data !== undefined ? result.data : result;
    };
    const outcomes: SizeOutcome[] = [];
    let silent = 0;
    for (const item of cases) {
      // Relay's own request for a chat message whose Execute list has no lines.
      const request = buildDecisionRequest(decider, { kind: 'chat', text: item.text, agent: item.agent, files: [], images: 0, lines: {}, sizes: ['execute'], reply: item.reply, task: item.task ?? null });
      const began = Date.now();
      let result: unknown = null, note: string | null = null;
      try { const got = await within(() => ask(request), TIMEOUT_MS); if (got === LATE) note = `no answer within ${TIMEOUT_MS} ms`; else result = got; }
      catch (error) { note = (error instanceof Error ? error.message : String(error)).slice(0, 160); }
      const outcome = judged(item, result, Date.now() - began, note);
      outcomes.push(outcome);
      silent = outcome.size === null ? silent + 1 : 0;
      if (silent >= 3) { console.log('Stopped: three cases in a row got no size answer.'); break; }
      await sleep(300);
    }
    if (process.env.RELAY_SIZE_OUT) writeFileSync(process.env.RELAY_SIZE_OUT, JSON.stringify(outcomes, null, 1));
    console.log(`Decider: ${providerID}/${id} on ${version}; ${outcomes.length} requests from an isolated OpenCode, scratch root outside the home folder, no login, no plugin.`);
    console.log(sizeReport(outcomes, cases.length));
    console.log('LIMIT: made-up cases, one decision model, one run, only the Execute size question. No chat, switch or plugin was involved.');
  } finally {
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit'), escalation = setTimeout(() => child?.kill('SIGKILL'), 5000);
      child.kill('SIGTERM'); try { await exited; } finally { clearTimeout(escalation); }
    }
    await rm(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
