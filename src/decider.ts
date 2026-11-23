import { usdString } from './costs.js';
import { modes, type Mode } from './relay-store.js';
import { brief, safeHead, MAX_LINES, type DeciderAnswer, type LineAnswer } from './router.js';
import type { SizeAnswer } from './ranking.js';
import type { ModelChoice } from './settings.js';

// One request to a decision model: which mode fits the text, and, for each mode that has a choice to make, which "use it for" line fits it.
// The decider is given the text, the names and sizes of attached files and the lines, and for a chat message the end of the chat's last reply
// (its text only; the owner chose this on 19 Nov, so that "Implement it." can be placed by the plan before it). Never file contents, pictures,
// other earlier messages, the model's reasoning or tools, model names or prices.
// Its requests are not reserved in the budget ledger (the owner, 2026-11-14); what is sent is capped instead. Nothing here may import from `node:`.

export const MAX_CHARS = 4000;
export const MAX_REPLY_CHARS = 1500;
export const TIMEOUT_MS = 5000;
export const MAX_FILE_NAMES = 10;
const MAX_NAME = 80;

export type FileFact = { name: string; bytes: number | null };
/** `reply` is the end of the chat's last reply, for a chat message (see `lastReply`). `sizes` are the modes Relay chooses for by itself, asked how big the work is. */
export type DecideInput = { kind: 'chat' | 'helper'; text: string; agent: string | null; files: readonly FileFact[]; images: number; lines: Partial<Record<Mode, readonly string[]>>; reply?: string | null; sizes?: readonly Mode[] };
export type DecisionsRequest = { model: { providerID: string; id: string; variant?: string }; input: { type: 'text'; text: string }[]; questions: { type: 'choice'; name: string; instructions: string; choices: { value: string; description: string }[] }[] };
export type DecisionsHost = { decisions(request: DecisionsRequest): Promise<unknown> };

/** The last `max` characters of `text`, never starting with half a two-unit character. */
const endOf = (text: string, max: number) => { const tail = text.slice(-max); return /^[\uDC00-\uDFFF]/.test(tail) ? tail.slice(1) : tail; };

/** Text over the limit keeps its first and last half, and is never cut inside a two-unit character. */
export function capText(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  return `${safeHead(text, MAX_CHARS / 2)}\n[...]\n${endOf(text, MAX_CHARS / 2)}`;
}

/** `text` with every mention of the folder `home` as `~`: with either slash, in any case, and never inside a longer folder name. */
export function withoutHome(text: string, home: string): string {
  const parts = home.replace(/[\\/]+$/, '').split(/[\\/]+/);
  if (!parts.some(part => /\w/.test(part))) return text;
  const escape = (part: string) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // A Windows home (C:\Users\x) is also written /c/Users/x in Git Bash and /mnt/c/Users/x in WSL.
  const drive = /^([a-z]):$/i.exec(parts[0]), first = drive ? `(?:${drive[1]}:|/(?:mnt/)?${drive[1]})` : escape(parts[0]);
  // Not followed by more of a folder name: a letter, digit, "_" or "-", or a "." that a name goes on after ("me.old"; "me." ends a sentence).
  return text.replace(new RegExp(`${[first, ...parts.slice(1).map(escape)].join('[\\\\/]+')}(?![\\w-]|\\.\\w)`, 'gi'), '~');
}

type Part = { type?: unknown; text?: unknown };
type Entry = { type?: unknown; content?: unknown };
/**
 * The end of the chat's latest reply, from `session.context`: the text the model wrote over all of that reply's requests, joined, at most its
 * last MAX_REPLY_CHARS characters. Never its reasoning, tool calls or tool output, and never an earlier reply: a latest reply with no text
 * gives null. The person's new message may already be listed after the reply. `home` is hidden as `~` before the cut, so a cut can never
 * leave part of it.
 */
export function lastReply(messages: unknown, home: string | null = null): string | null {
  const all: Entry[] = Array.isArray(messages) ? messages.filter((item): item is Entry => item !== null && typeof item === 'object') : [];
  let newest = all.length - 1;
  while (newest >= 0 && all[newest].type !== 'assistant') newest--;
  if (newest < 0) return null;
  let start = newest;
  while (start > 0 && all[start - 1].type !== 'user') start--;
  const parts = all.slice(start, newest + 1).filter(entry => entry.type === 'assistant').flatMap(entry => (Array.isArray(entry.content) ? entry.content : []) as Part[]);
  const joined = parts.flatMap(part => part !== null && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string' ? [part.text] : []).join('\n').trim();
  const text = home ? withoutHome(joined, home) : joined;
  return text ? endOf(text, MAX_REPLY_CHARS) : null;
}
/**
 * Whether a reply goes to the decider: only for a chat message with text, and only when the decider is asked to choose a line or a size. The
 * reply is there to tell a mode's models apart (19 Nov); with one model a mode the request stays word for word as measured (the 23 Nov review).
 */
const replied = (input: DecideInput): input is DecideInput & { reply: string } =>
  input.kind === 'chat' && typeof input.reply === 'string' && input.reply.trim() !== '' && (modes.some(mode => (input.lines[mode]?.length ?? 0) > 0) || sized(input).length > 0);
/** The modes asked about the size of the work: those Relay chooses for by itself, which never have lines. */
const sized = (input: DecideInput): Mode[] => modes.filter(mode => input.sizes?.includes(mode) && !input.lines[mode]?.length);

const flat = (text: string, max: number) => safeHead(text.replace(/[\s\x00-\x1f\x7f]+/g, ' ').trim(), max);
/** Only the last part of a path is sent, so the name of a home folder never leaves the machine. */
const fileName = (name: string) => flat(name.split(/[\\/]/).pop() ?? '', MAX_NAME) || 'file';
const size = (bytes: number | null) => bytes === null ? 'size unknown' : bytes < 1000 ? `${bytes} B` : bytes < 1_000_000 ? `${Math.round(bytes / 1000)} kB` : `${Math.round(bytes / 1_000_000)} MB`;
/** What the chat's agent can do, so that "ok, do it" after a plan reads as a go-ahead. Never its name: "plan" is also an answer, and told
 * "The chat is on the agent: plan" a real decider hedged on clear fix requests (16 Nov). Other agents are unknown here, so nothing is said. */
const agentLine = (agent: string | null) =>
  agent === 'plan' ? 'Before this message the chat was on a read-only agent, which explains and plans and cannot change files. '
  : agent === 'build' ? 'Before this message the chat was on an agent that can change files. ' : '';

function describe(input: DecideInput): string {
  const text = capText(input.text);
  if (input.kind === 'helper') return `A task that a model is handing to a helper: "${text}"`;
  const shown = input.files.slice(0, MAX_FILE_NAMES).map(file => `${fileName(file.name)} (${size(file.bytes)})`).join(', '), more = input.files.length - MAX_FILE_NAMES;
  const files = input.files.length ? `${shown}${more > 0 ? ` and ${more} more` : ''}` : 'none';
  const reply = replied(input) ? `The end of the chat's last reply: "${endOf(input.reply.trim(), MAX_REPLY_CHARS)}"\n` : '';
  return `The person's message: "${text}"\n${reply}${agentLine(input.agent)}Attached files: ${files}. Attached pictures: ${input.images}.`;
}

// With a reply in the input, the questions say which text to judge, so the reply cannot pull the mode (a plan that says "I will change"
// is not a request to change). Without one, they are word for word what the decider was measured with before (14 to 19 Nov).
const modeQuestion = (reply: boolean) => ({
  type: 'choice' as const, name: 'mode',
  instructions: reply
    ? "Which mode fits the person's message? The end of the chat's last reply only shows what the message refers to. Choose execute only when the message clearly asks to change, create, fix or run something now. Choose review when it asks to check existing work and report, with nothing to change. Otherwise choose plan."
    : 'Which mode fits the text? Choose execute only when it clearly asks to change, create, fix or run something now. Choose review when it asks to check existing work and report, with nothing to change. Otherwise choose plan.',
  choices: [
    { value: 'plan', description: 'Think, explain, investigate, design or plan. Nothing is changed.' },
    { value: 'execute', description: 'Write, change, create, fix or run something now.' },
    { value: 'review', description: 'Check existing work for mistakes and risks, and report them.' },
  ],
});
const lineQuestion = (mode: Mode, lines: readonly string[], reply: boolean) => ({
  type: 'choice' as const, name: `${mode}_line`,
  instructions: reply
    ? "Which description of work fits best? Judge the kind and size of the work by the person's message and the end of the chat's last reply. Choose none when no description fits clearly."
    : 'Which description of work fits the text best? Choose none when no description fits clearly.',
  choices: [...lines.slice(0, MAX_LINES).map((line, index) => ({ value: String(index + 1), description: line })), { value: 'none', description: 'None of these fits clearly.' }],
});
// Both instructions word for word as measured on 23 Nov: the first for the 15 cases with the end of a reply, the second for the 15 first
// messages (27 of 30 right in all, docs/compatibility.md). A change is measured again with scripts/decider-size.ts before it ships.
// The decider is asked about the work, never about models, prices or scores.
const sizeQuestion = (mode: Mode, reply: boolean) => ({
  type: 'choice' as const, name: `${mode}_size`,
  instructions: reply ? "How big is the work? Judge by the person's message and the end of the chat's last reply." : 'How big is the work the text asks for?',
  choices: [
    { value: 'small', description: 'Small and clear. One or two files, a quick question, a simple edit.' },
    { value: 'big', description: 'Big, unclear or risky. Several files, a new feature, a hard bug, data, money or security, or the last reply shows a failed try.' },
  ],
});

export function buildDecisionRequest(decider: ModelChoice, input: DecideInput): DecisionsRequest {
  const reply = replied(input);
  return {
    model: { providerID: decider.providerID, id: decider.id, ...(decider.variant === null ? {} : { variant: decider.variant }) },
    input: [{ type: 'text', text: describe(input) }],
    questions: [modeQuestion(reply), ...modes.flatMap(mode => input.lines[mode]?.length ? [lineQuestion(mode, input.lines[mode], reply)] : []), ...sized(input).map(mode => sizeQuestion(mode, reply))],
  };
}

type RawAnswer = { type?: unknown; name?: unknown; choice?: unknown; confidence?: unknown; reason?: unknown; message?: unknown };
const sure = (value: unknown): value is number => typeof value === 'number' && value >= 0 && value <= 1;

/** The mode answer must be exactly right, or there is no answer. A line answer that cannot be used is left out, and the router then falls back by its rule. */
function read(result: unknown, input: DecideInput, ms: number): DeciderAnswer {
  const unreadable: DeciderAnswer = { kind: 'none', reason: "the decider's answer could not be read", ms };
  const answers = (result as { answers?: unknown } | null | undefined)?.answers;
  if (!Array.isArray(answers)) return unreadable;
  const named = (name: string): RawAnswer | undefined => answers.find(item => item !== null && typeof item === 'object' && (item as RawAnswer).name === name);
  const mode = named('mode');
  if (mode?.type === 'error') return { kind: 'none', reason: `the decider gave no answer: ${brief(typeof mode.reason === 'string' && mode.reason.trim() ? mode.reason : mode.message)}`, ms };
  const found = modes.find(item => item === mode?.choice);
  if (mode?.type !== 'choice' || !found || !sure(mode.confidence)) return unreadable;
  const lines: Partial<Record<Mode, LineAnswer>> = {};
  for (const item of modes) {
    const sent = Math.min(input.lines[item]?.length ?? 0, MAX_LINES), line = named(`${item}_line`);
    if (!sent || line?.type !== 'choice' || !sure(line.confidence)) continue;
    if (line.choice === 'none') lines[item] = { index: null, confidence: line.confidence };
    else if (typeof line.choice === 'string' && /^[1-8]$/.test(line.choice) && Number(line.choice) <= sent) lines[item] = { index: Number(line.choice) - 1, confidence: line.confidence };
  }
  // A size answer counts only for a mode that was asked, and only as small or big with a confidence; anything else is left out.
  const asked = sized(input), sizes: Partial<Record<Mode, SizeAnswer>> = {};
  for (const item of asked) {
    const size = named(`${item}_size`);
    if (size?.type === 'choice' && (size.choice === 'small' || size.choice === 'big') && sure(size.confidence)) sizes[item] = { size: size.choice, confidence: size.confidence };
  }
  return { kind: 'answer', mode: found, confidence: mode.confidence, lines, ...(asked.length ? { sizes } : {}), ms, costUsd: usdString((result as { cost?: unknown }).cost) };
}

export const LATE = Symbol('late');
/** What the work gives, or LATE when it takes longer than `ms`. Work that is given up on cannot be stopped; the race keeps a handler on it, so its late failure is not an unhandled rejection. */
export async function within<T>(work: () => T | Promise<T>, ms: number): Promise<T | typeof LATE> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([Promise.resolve().then(work), new Promise<typeof LATE>(done => { timer = setTimeout(() => done(LATE), ms); })]); }
  finally { clearTimeout(timer); }
}

/** Asks the decider once and never throws. A late answer and a late failure are both dropped. */
export async function decide(host: DecisionsHost, decider: ModelChoice | null, input: DecideInput, timeoutMs = TIMEOUT_MS): Promise<DeciderAnswer> {
  if (!decider) return { kind: 'none', reason: 'no decider chosen', ms: 0 };
  const started = Date.now();
  try {
    const result = await within(() => host.decisions(buildDecisionRequest(decider, input)), timeoutMs);
    if (result === LATE) return { kind: 'none', reason: `the decider took longer than ${timeoutMs / 1000} seconds`, ms: Date.now() - started };
    return read(result, input, Date.now() - started);
  } catch (error) {
    return { kind: 'none', reason: `the decider gave no answer: ${brief(error)}`, ms: Date.now() - started };
  }
}
