# Relay: a Usage tab with history, filters and a chart (design)

Status: asked for on 2026-11-24 ("i need proper usage tab with filter and little bit of graph, search by model filter and different filter records as available in all systems"). The owner chose to count every chat ("Every chat") and to keep one record per reply ("A. Record per reply"). After it is built and installed, the owner asked for a second Go run of "On, Relay chooses" and of "On, one model a mode". A builder check raised three points, settled below as my calls: a record that grows after its first idle, summaries of a long chat (compactions), and keeping the project's folder. Choices made while writing are marked *(my call)*.

## Why

The owner wants a usage page like the ones other services have: what was spent, on which model, when, with filters and a small chart.

What exists today:
- Relay's "Usage by model" keeps one running total for each model and effort, with no dates. Recent choices keeps only the newest 20 records. So nothing can be shown by day, and no single reply can be looked up.
- It counts only messages Relay placed. Chats with Relay off are missing.
- Desktop's own Usage screen shows only the OpenCode Go quota (percent used, when it resets) and Console budgets. A chat's details screen shows that one chat's total cost. Neither has a history by model, filters or a chart.

## Goals

1. From the update on, every reply in every chat is counted: chats with Relay on or off, `/relay` messages, and helpers.
2. A tab of its own shows the usage for a time range, with a chart by day, a search by model, filters, totals by model, and the records themselves.
3. With the filters, Relay on and Relay off can be compared in real use.
4. Each reply is counted exactly once, even with two OpenCode windows open.

## Non-goals

- Chats from before the update. The history starts when the new build is installed; the old totals stay, labelled for what they are (step 8).
- The decider's own requests *(my call: they are on a free model in practice, and Recent choices shows them)*.
- Budgets, limits or alerts. Desktop's Usage screen already shows the Go quota.
- A download of the records (CSV) *(my call: not asked; easy to add later)*.
- Changing `/relay-stats` in the terminal app *(my call)*. It keeps showing the old totals: Relay's messages since 19 Nov.

## Anti-goals: a failure even if it works

- Keeping any text: no message, reply, file name or chat title. Numbers, models, ids and the project's folder only.
- A slower or failed chat. The idle hook stays within its one second and never throws; a record that can't be written is simply missing.
- A reply counted twice, or a Relay record of a reply rewritten later with less information.
- A network request. Everything is in OpenCode's plugin storage on this machine.
- A new dependency for the chart. It is drawn by hand as SVG.
- A tab that scans 90 days of records every few seconds.

## Approaches (put to the owner on 24 Nov)

- **A. One record per reply** (chosen). A dated record for each reply under a key of its own, kept 90 days, read and added up on the server when the tab asks. Exact records, any filter, and no count lost between two windows, because no two replies share a key.
- **B. Daily totals only.** One total per day for each model, mode and Relay on or off. Smaller, but no single records, and two windows writing the same day's total in the same instant can lose a count.
- **C. Read OpenCode's chat history when the tab opens.** Nothing new stored, and the past is included, but every chat is read each time: slow with many chats, heavy on the owner's service (which has frozen before), and it can't tell which messages Relay placed.

## The design

1. **What is counted.** One record for each message in a chat (the person's message, or a helper's task) with everything the model did for it until the next message: all its requests, as `replyOf` in `src/chat-facts.ts` already adds them up. Chats with Relay on and off alike, in every project where Relay is loaded.

2. **When** (`src/relay-auto.ts`, `relayReplyHook`). The `experimental.idle` hook runs each time any chat finishes its work. Today it reads a chat only when a Relay record waits for its reply. Now it reads every chat that goes idle, once, for both jobs:
   - It looks at the chat's three newest messages *(my call: an idle can be missed, for example while Relay is loading, or after a reply that failed or was stopped, which runs no idle; older ones are let go)*.
   - A message with no record gets one. A record may grow later *(my call, after the builder check)*: the host can wake a chat for the same message once its own helper or shell finishes, and a slow decider can write the Relay record after the reply ended. So a record is written again only when the reply now has more requests, or a Relay part has appeared. A rewrite never lowers a count and never drops a Relay part, so it can't lose what the Relay record said once that record has left the newest 20.
   - All of it stays inside the hook's one-second limit and its try/catch, as today.
   - A Relay record that arrives after the chat's last idle stays unattached *(shortcut: rare; it would need the decision to look up the usage record)*.

3. **The record** (`src/usage-log.ts`, new). Under the key `relay/usage-log/<time>/<chat id>/<message id>`, where `<time>` is the message's own creation time in ISO form, so keys sort by time and a time range is one prefix scan. It holds:
   - `at`, `sessionID`, `messageID`, and `project` (the folder Relay was loaded for);
   - `helper`: the chat has a parent chat. This takes one `session.get`, inside the same time limit; when it can't be read, it counts as false;
   - `agent` (for example `build` or `plan`) and `model` (`provider/id#effort`), both from the first answer;
   - `requests`, `input`, `output`, `reasoning`, `cacheRead`, `cacheWrite`;
   - `costByPrice`: tokens times the model's listed prices, or Artificial Analysis's when OpenCode lists none, as Usage by model works them out; `openCodeUsd`: OpenCode's own cost; `pricesFrom`;
   - `relay`: `{ mode, note }` when a Relay record names this message (it placed it, or decided to leave it alone), else null. A helper's own reply has no such link today (its Relay record names the calling chat), so a helper shows "helper" and no Relay part *(my call)*.

   - **Summaries of a long chat (compactions)** *(my call, after the builder check)*. After a compaction the host lists the chat from the compaction's own entry on (`docs/compatibility.md`, 18 Nov), so a message from before it can no longer be found. Two things keep that work counted:
     - A finished compaction gets a record of its own, keyed by the compaction entry's id. It holds the compaction's own request (when its entry carries counts) and the answers that follow it up to the next message, which are the rest of a reply the compaction cut. It shows as "summary" beside chat and helper.
     - The host's `compaction` hook runs just before a compaction request. There Relay first writes or grows the records of the chat's newest messages, the same way as at idle, so the part of a reply made before the cut is kept. It only reads and writes Relay's storage, never changes the request, is bounded to half a second, and never throws. Neither has been seen on a real host: an automatic compaction in the middle of a reply was never tested.
   - `project` keeps the folder Relay was loaded for, as a full path *(my call, after the builder check: OpenCode's own database on this machine already holds it, and folder names alone could merge two projects)*. The tab shows the folder's name, with the full path on hover.

4. **How long.** 90 days. When the tab asks for data, the server also removes records older than that, at most 1,000 a call *(my call)*.

5. **The server's answer** (`getUsageLog` in `src/contract.ts` and `src/rpc.ts`, storage only). Input: a time range, the panel's time-zone offset, and the filters. Output:
   - the days of the range, each with its totals by model (cost, tokens, requests), counted in the panel's local days;
   - the totals by model over the range;
   - the values each filter can take in that range (providers, efforts, modes or agents, projects);
   - the newest records that match, 50 at a time, with a way to ask for the next 50;
   - the old all-time totals (step 8).
   - Filters: search (part of the model's name, provider or id, any case), provider, effort, mode or agent, Relay on or off, chat or helper, project.
   - *shortcut:* each call scans every record in the range. That is fine up to about 30,000 records (300 replies a day for 90 days). Past that, keep daily summaries beside the records.

6. **The tab** (`src/gui.tsx`; texts and sums in `src/relay-view.ts`). A second side tab, **Relay usage**, next to **Relay**. It has its own command ("Open Relay usage") and an "Open usage" button in the Relay tab, where Usage by model is now *(my call: a full tab has more room than a section)*. From the top:
   - **Range:** Today · 7 days · 30 days · 90 days (default 7).
   - **Search** by model, and the filters as lists, with Refresh.
   - **Summary:** cost, replies, requests, tokens in and out, cache read and written.
   - **Chart:** one bar a day, split by model (the five largest in the range, the rest as "other"), with a switch for cost, tokens or requests. Hovering over a bar shows that day's numbers. A legend names the colours.
   - **By model:** a table of model, effort, replies, requests, in, out, cache read, cache written and cost. A header sorts it; a row narrows the search to that model.
   - **Records:** newest first: time, project, chat (short id), chat or helper, mode or agent, model and effort, Relay (its mode and note, or "off"), tokens in and out, cost. "Show more" adds 50.
   - **Footer:** "* at Artificial Analysis prices" when some are, Artificial Analysis's credit line when its prices were used, and since when the history runs.
   - It asks for data when opened, on Refresh, when a filter changes, and every 30 seconds while open *(my call)*.
   - Light and dark themes, at the panel's narrow width: tables scroll sideways inside their own box.

7. **Cost shown.** The cost by price when the model has one; else OpenCode's own cost; else "not listed". Go is billed by allowance and OpenCode records $0 for it, so its list price is what shows, as everywhere else in Relay. Money is added as USD strings with `parseUsd` (bigint), never floating point.

8. **The old totals.** Usage by model keeps counting Relay's own messages, as today, so `/relay-stats` is unchanged. In the Usage tab it is one collapsed section at the bottom: "Before this history: Relay's own messages since 19 Nov".

9. **Docs.** `docs/guide.md` (the Usage tab), `docs/privacy.md` (Relay reads the counts of every reply in every chat and keeps them, with the project's folder, on this machine for 90 days; never text), `docs/status.md`, and `AGENTS.md` (the idle hook now reads every chat; the new keys; the panel's bundled files).

## Testing

- Unit tests first (TDD):
  - Records from made-up chat contexts: one request and several; a reply that was stopped with no counts (no record); a helper; a Relay record and none.
  - A compacted chat: the compaction's own record with the answers after it; the record of a message from before the cut, kept by the `compaction` hook.
  - Growing: a record is rewritten when the reply has more requests or a Relay part appeared, and never lowered or stripped of its Relay part.
  - Key order equals time order.
  - Removing records past 90 days.
  - Adding up: days in a time zone, the five largest models plus "other", each filter, search in any case, paging.
  - USD sums.
  - The panel's bar heights, labels and legend.
- The RPC: its output is checked against the declared schema (`asClient` in `tests/rpc.test.ts`), and every method declares `errors`.
- The idle hook: still never throws, still bounded; a slow `session.get` leaves `helper` false; a slow storage leaves the record out.
- The real-host smoke, with mocks: after its existing turns, `getUsageLog` lists the mock chat's replies, with Relay's part on the `/relay` message and none on a plain one.
- After the owner's yes: install in their copy (Desktop closes for a minute), then the two Go runs they asked for. Their replies then show in the new tab, a check on real replies.

## Left to the builder

- The exact wording of labels, and the colours (from the panel's existing styles, readable in both themes).
- How the records page is asked for (an offset or the last key).
- Whether the tab's lists and chart are split into components.
