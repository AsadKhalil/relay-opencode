import type { PromptInput } from '@opencode/schema/prompt-input';
import type { Session } from '@opencode/schema/session';
import { LATE, within } from './decider.js';
import type { AaModel } from './artificial-analysis.js';
import { replyOf } from './chat-facts.js';
import { placeMessage, recordPlaced, timingOf, uploadsOf, type RelayDeps } from './relay-command.js';
import { chatSwitch, decisionsOf, saveReplies, waitingReplies } from './relay-store.js';
import { buildRecords, saveRecords, type LogStore } from './usage-log.js';

// The switch. In a chat where `/relay on` (or the pill) turned it on, every message the person sends is placed the way `/relay` places one,
// inside the host's `prompt` hook, before the message goes out (a switch made there serves that message: probe, 16 Nov). The host sends the
// message; this never does. It never throws, because a throw fails the person's message; what goes wrong becomes a note in the record.

/** How long a chat may take to show it is idle before it counts as busy and is left as it is. */
export const BUSY_CHECK_MS = 300;
type PromptEvent = { readonly sessionID: string; readonly messageID?: string; readonly prompt?: PromptInput.Prompt; readonly metadata?: Record<string, unknown> };

export function relayAutoHook(deps: RelayDeps) {
  const timing = { ...timingOf(deps), waitMs: BUSY_CHECK_MS };
  // The switch is read for every message in every chat, so a slow store must not hold them all for long.
  const flagMs = Math.min(timing.readMs, 1000);
  return async (event: PromptEvent): Promise<void> => {
    try {
      // `/relay` placed this message already and marked its send.
      if (event.metadata?.relay !== undefined || !event.prompt?.text?.trim()) return;
      const sessionID = event.sessionID as Session.ID, prompt = event.prompt;
      if (await within(() => chatSwitch(deps.store, sessionID), flagMs) !== true) return;
      // shortcut: the hook holds a message for at most three read limits; work still running then goes on without it, so a host call that
      // answers very late could switch the chat during the reply. The hook also does not wait for a `/relay` of the same chat that is still running.
      await within(async () => {
        const placed = await placeMessage(deps, timing, { sessionID, prompt, unsure: 'stay', uploads: uploadsOf(event.metadata) });
        // The record is for the panel; the message does not wait for it. recordPlaced never rejects.
        void recordPlaced(deps, sessionID, placed, typeof event.messageID === 'string' ? event.messageID : null);
      }, timing.readMs * 3);
    } catch { /* never fail the person's message */ }
  };
}

/**
 * What a reply took. When a chat has finished its work, the host runs this just before the chat goes idle. For each record of that chat
 * that still waits, the reply is read from the chat's own messages and kept with the record, with the prices the model list gives for the
 * model that answered, or else Artificial Analysis's from the copy kept in storage (`borrowedPrices`; never a request). No model is asked.
 * It never throws, and it holds the chat for one second at most; a chat with no waiting record costs one read of storage.
 */
type ReplyDeps = Pick<RelayDeps, 'session' | 'store' | 'readMs' | 'chatModels'> & {
  borrowedPrices?: () => Promise<AaModel[]>;
  /** Plugin storage for the usage records; without it, only replies to placed messages are read. */
  log?: LogStore;
  /** The folder Relay was loaded for, kept with each usage record. */
  project?: string;
};
/** Reading a chat for the two hooks below, within `limitMs`. */
function chatReader(deps: ReplyDeps, limitMs: number) {
  /** A list that fails, or takes more than half the time, is no list; the reply is kept all the same. */
  const spare = async <T>(read: (() => Promise<T[]>) | undefined): Promise<T[] | null> => {
    if (!read) return null;
    const value = await within(read, limitMs / 2).catch(() => null);
    return Array.isArray(value) ? value : null;
  };
  /** A helper's chat has a parent chat. One that cannot be read in half the time counts as a chat of its own. */
  const isHelper = async (sessionID: string): Promise<boolean> => {
    const chat = await within(() => deps.session.get({ sessionID: sessionID as Session.ID }), limitMs / 2).catch(() => null) as { parentID?: unknown } | typeof LATE | null;
    return !!chat && chat !== LATE && typeof chat.parentID === 'string' && chat.parentID !== '';
  };
  return {
    read: (sessionID: string) => Promise.all([deps.session.context({ sessionID: sessionID as Session.ID }), spare(deps.chatModels), spare(deps.borrowedPrices)]),
    /** Writes or grows the usage records of the chat's newest messages (src/usage-log.ts). */
    async keep(log: LogStore, sessionID: string, messages: unknown, models: Awaited<ReturnType<RelayDeps['chatModels']>> | null, borrowed: AaModel[] | null): Promise<void> {
      const [helper, decisions] = await Promise.all([isHelper(sessionID), decisionsOf(deps.store, sessionID)]);
      await saveRecords(log, buildRecords(messages, { sessionID, project: deps.project ?? '', helper }, { models, borrowed }, decisions));
    },
  };
}

export function relayReplyHook(deps: ReplyDeps) {
  const limitMs = Math.min(timingOf(deps).readMs, 1000), chat = chatReader(deps, limitMs);
  return async (event: { readonly sessionID: string }): Promise<void> => {
    try {
      await within(async () => {
        const waiting = await waitingReplies(deps.store, event.sessionID);
        // With usage records every chat is read when it goes idle, once for both jobs; without, only a chat with a waiting record.
        if (!waiting.length && !deps.log) return;
        const [messages, listed, borrowed] = await chat.read(event.sessionID);
        const replies = new Map(waiting.flatMap(messageID => { const reply = replyOf(messages, messageID, listed, borrowed); return reply ? [[messageID, reply] as const] : []; }));
        if (replies.size) await saveReplies(deps.store, event.sessionID, replies);
        if (deps.log) await chat.keep(deps.log, event.sessionID, messages, listed, borrowed);
      }, limitMs);
    } catch { /* the record is for the panel; the chat goes idle whatever happens here */ }
  };
}

/**
 * Before the host summarizes a long chat (a compaction), the usage records of its newest messages are written or grown, so the part of a
 * reply made before the cut is kept: afterwards the host lists the chat from the compaction on. It only reads the chat and writes Relay's
 * storage, never touches the request, waits half a second at most, and never throws. Not yet seen on a real host.
 */
export function relayCompactionHook(deps: ReplyDeps) {
  const limitMs = Math.min(timingOf(deps).readMs, 500), chat = chatReader(deps, limitMs);
  return async (event: { readonly sessionID: string }): Promise<void> => {
    const log = deps.log;
    if (!log) return;
    try {
      await within(async () => {
        const [messages, listed, borrowed] = await chat.read(event.sessionID);
        await chat.keep(log, event.sessionID, messages, listed, borrowed);
      }, limitMs);
    } catch { /* the summary goes ahead whatever happens here */ }
  };
}
