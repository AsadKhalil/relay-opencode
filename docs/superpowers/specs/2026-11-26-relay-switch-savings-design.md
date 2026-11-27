# Relay: switches and savings in the usage tab (design)

Status: asked for on 2026-11-26: "i am thinking of adding a view which shows stats how much time relay switch the model and save the cost and how much cost without switching. in usage panel i dont need records list instead add this in the form of chart also use open code go plan to test and verify. no of switch to model, cost saved, cost without switch . make sure if user add intergeration of codex or claude agent we ahve to calculate using input output token price". Asked what "without switching" compares with, the owner said "yes default or plan model". Of the two approaches below, the owner chose B. For its Default model, the owner chose each chat's own start model ("Each chat's start model") over OpenCode's configured default. A builder check raised four points: that one was the owner's, and the other three are settled below as my calls. Choices made while writing are marked *(my call)*.

## Why

The owner wants to see, in the usage tab, what Relay's switching does: how often it moves a chat to another model, which models it moves chats to, what the range would have cost without those moves, and what it saved. The records list is not needed. Replies through a subscription login (the Claude agent, Codex) list no price, and the owner wants them counted at per-token input and output prices all the same.

What exists today:
- Usage records (`src/usage-log.ts`): one per message of every chat, kept 90 days, with tokens, the reply's model and cost. A message Relay placed has a Relay part, `{ mode, note }`. Nothing says which model the chat was on before Relay placed it.
- Relay's own records (`relay/decisions`) keep only the newest 20, with the model chosen, not the one before.
- The tab prices a reply by OpenCode's listed price, else OpenCode's own cost when it is above $0, else Artificial Analysis's list when a key is saved (marked `*`). A reply on `claude-agent` lists no price (`cost: []`) and costs $0 in OpenCode, so with no key it has no price at all.
- The tab shows: range, three tiles (Spent, Tokens, Replies), a chart plate (cost, tokens or requests by day, by model), By model, search, Filters, the Records list, and "Before this history".

## Goals

1. **Switches**: how many times Relay moved a chat to another model in the range, and how many of those went to each model.
2. **Spent, Without switching, Saved** (and the percent) for the range, with a chart by day.
3. **Compare with: Default model | Plan model**: a choice above the numbers.
4. Every reply has a cost: a reply with no price of its own (the Claude agent, Codex, any login that lists none) is priced at public per-token prices for its input and output.
5. The Records list goes.
6. Checked on OpenCode Go.

## Non-goals

- A list of chats with their own savings.
- Any change to how Relay decides or which model it picks.
- A budget or an alert (owner, 14 Nov 2026: "i dont want a budget feature").
- Whether the cheaper model did the work as well. That is what the bench runs measure; this tab only counts cost.
- The review helper's picks. Its replies are in a chat of their own, and Relay's record of a helper does not name that chat *(my call)*.

## Anti-goals: a failure even if it works

- A saving that flatters Relay: leaving out what the decider cost, ignoring the cache a switch throws away, or counting a reply that cannot be priced as $0.
- An estimate that reads like a bill. "Without switching" is the same tokens at another model's prices; the tab says so.
- A slower chat or tab. No new model requests. The switch's hook gets one more storage read, inside the reads it already bounds, and one write a chat, which it does not wait for.
- Breaking an invariant in AGENTS.md: the message is never dropped, doubled or changed, and the hooks never throw.
- Text in storage. Records still hold numbers, model names, ids and the project's folder only.

## Approaches (put to the owner on 26 Nov)

- **A. One number, with a baseline per chat**: the model the chat was on when Relay first moved it; else, for older chats, the model of its last reply before Relay's first record; else the Plan model. One figure, but it mixes two kinds of comparison in one sum.
- **B. A choice: Compare with Default model | Plan model** (chosen). Each number compares with one model the owner can name. The Default view covers only chats whose default is known, so on older history it can show fewer chats.
- Set aside: adding it up in the panel from the records page (a page cannot add up thousands of replies; the server already sums the range), and keeping a running saving in storage (it would repeat what the records hold, and could not follow the range or the filters).

## The design

### 1. What Relay keeps when it places a message

- `placeMessage` (`src/relay-command.ts`) already reads the chat's model before it decides (`current`). Relay's record gains `from`: that model's name (`modelName`), or null when the chat had none.
- **The chat's start model.** A storage key a chat, `relay/chat-start/<chat id>`, holds the model the chat was on just before Relay first moved it. It is written once, at the chat's first real move (the new model differs from `from`), and never changed after *(my call: like the switch key a chat has now; without it, a 7-day range of a chat that started 10 days ago could not tell its default)*. It is read with the other reads `placeMessage` already bounds; the write is not waited for, as `recordPlaced` is not. Relay's record gains `start`: the key's value after this message (null until the chat's first move).
- The usage record's Relay part gains `from`, `start` and `deciderUsd` (the decider's cost for this message, from the record's `costUsd`). `grown()` keeps them like the rest of the Relay part. `readable()` reads each, and a record kept before this version reads them as null.

### 2. What counts as a switch

- A reply counts as a switch when its Relay part has a `from` and the reply's model is not that model. It is a switch to the reply's model.
- History from before this version has no `from` *(my call)*: within one chat, in time order, a reply with a Relay part whose model differs from that chat's previous reply's model counts as a switch. This can count a model the person changed by hand just before a Relay message that kept it; it applies only to records kept before this version.
- Only replies of kind `chat` count. `/relay` and the switch both count; summaries and helpers do not.

### 3. Which replies are compared, and with what

- In a chat, every reply from its first switch on, in the range, is compared: whichever model answered it, and whether Relay was still on. Replies before a chat's first switch, and chats Relay never moved, cost the same either way and are added in unchanged *(my call)*.
- The model a chat is compared with:
  - **Default model**: the reply's `start`. For a chat whose records have no `start` (older history), the model of the chat's last reply before its first Relay part, within the range. A chat with neither is not compared in this view, and the tab counts it ("3 chats not compared: their default is not known").
  - **Plan model**: the first model of Relay's Plan mode as it is set now *(my call: when the owner changes the Plan model, the whole history is compared with the new one)*. With no Plan model set, the choice is greyed out and says why.
- The switches, the first switch of each chat and each chat's model are worked out from every record of the range. The filters then pick which replies are added up, so a filter never changes what a chat is compared with *(my call)*.

### 4. The sums (on the server, in `getUsageLog`)

- **A reply's cost**: as the tab works it out now, with one change for replies that have no price of their own. Those are priced the way `factsOf` (`src/standings.ts`) prices a model: Artificial Analysis's list when a key is saved, else OpenRouter's public list, which needs no key. A `claude-agent` family id (`sonnet`, `haiku`, `opus`, `fable`) is looked up as its newest Claude version on OpenRouter as it already is on Artificial Analysis (`FAMILIES`); a Codex login, or any other provider that lists no price, is looked up by its id and name, like every other model. OpenCode's ChatGPT sign-in (Codex on a subscription, provider `openai`) sets each model's price to none (`cost=[]`, seen in the 2.3.0 CLI's program text), as the Claude login does, so this rule reaches it. A listing of $0 in and $0 out still reads as $0, because it can mean free *(my call)*. Input, output (with reasoning), cache read and cache write each at its own price. The Spent tile and By model use the same prices, so every number on the tab agrees. Records are priced as they are read; nothing is written. A model free by its name stays $0.
- **A compared reply's cost without switching**: its tokens at the comparison model's prices, with one correction. On a reply where the model changed (a switch, or a later move back), its input and cache-write tokens, up to the size of the chat's previous prompt (that reply's input + cache read + cache write), are priced as cache reads: the model the chat stayed on would have kept its cache *(my call)*. It does not check whether that cache would have run out; a long pause before the switch makes the saving look smaller than it was.
- **Prices of the comparison model**: `factsOf` over OpenCode's model list and the stored lists, as everywhere else in Relay. `getUsageLog` reads the model list once a call, within two seconds *(my call; the tab was storage only until now)*. When the list fails or is late, the switching part says "The model prices could not be read. Refresh to try again." and the rest of the tab shows as it does now.
- **The numbers**, for the range and the filters:
  - Spent = what the tab's Spent tile shows, plus what the decider cost for the placed messages in the range.
  - Saved = the sum, over compared replies, of (cost without switching − cost), minus what the decider cost.
  - Without switching = Spent + Saved.
  - The percent is Saved ÷ Without switching. A negative saving shows as "$0.05 more".
  - A compared reply that cannot be priced on one side is left out of both, and the tab counts it ("2 replies left out: no price").
  - A decider cost kept before this version is unknown, so it counts as $0, and the small print says decisions before this version are not counted.
  - The decider's requests for helpers are not counted. Relay's record of a helper names no message, and only the newest 20 records are kept. The small print says so; with a free decider they cost $0 *(my call)*.
- All money stays USD strings summed as bigint (`parseUsd`, `formatUsd`), never floating point.
- The answer gives both views at once, so the choice in the tab needs no new request. Each view has: switches by model, the four numbers, a day list (spent and without switching), chats compared, chats not compared, replies left out, and the decider's cost. The Plan view also names the Plan model.

### 5. What the tab shows, in place of the Records list

```
Relay switching                Compare with [Default model][Plan model]
 Switches   Spent    Without switching   Saved
 14         $0.94    $1.31               $0.37 · 28%

 ┆▓┆ ┆▓┆ ┆▓┆ ▓▓ ┆▓┆        outline: without switching · filled: spent
 We 20 Th 21 Fr 22 Sa 23 Su 24

 Switches to each model
 glm-5.3-flash    ██████████  9
 kimi-k3.1-pro    █████       5

 An estimate: the same replies at the prices of each chat's model before
 Relay first moved it. 9 chats compared · 3 not compared (default not
 known) · 2 replies left out (no price) · Relay's decisions $0.004.
```

- One plate in the board's style (DESIGN.md), between Filters and "Before this history" where the Records list was. The four tiles are cut like the summary tiles above.
- The day chart: each day has an outline bar for Without switching and a filled bar for Spent inside it, on one scale, so the gap at the top is the saving. Its title reads "We 20: spent $0.12, without switching $0.18, saved $0.06". The same days, labels and slots as the chart above. Ledger Series colours only (series-1 filled, series-other outline), never a mode's colour.
- Switches to each model: a row per model, a bar and the count, most first, the five largest in the series colours and the rest as "other" *(my call)*.
- The small print says what the numbers are compared with (the Plan view names the model), that it is an estimate that says nothing of whether the other model would have answered as well, and the counts above.
- Nothing moved in the range: "Relay moved no chat in this range." with the tiles at 0.
- The choice starts on Default model and is kept while the tab is open *(my call)*.
- Removed: the Records list, Show more, and the page of records in `getUsageLog`'s answer, with its `offset` and `limit` *(my call)*. Kept: the tiles, the chart plate, By model, search, Filters and "Before this history". The footnote for `*` now reads "at public prices (Artificial Analysis or OpenRouter), all or in part; on a subscription this estimates what the plan was used for, not a bill."

## Testing

- Tests first, with the names of what would break them:
  - a switch from `from`; a switch from older records with no `from`; a manual change before a Relay message that kept the model is not a switch when `from` is there;
  - the compared replies of a chat start at its first switch; a reply after Relay was turned off is still compared;
  - the Default view uses `start`, falls back to the last reply before Relay, and counts a chat with neither as not compared;
  - the Plan view uses the first Plan model, and is greyed out with none;
  - the cache correction on a switch reply, and its cap at the previous prompt;
  - a reply left out of both sides when one side has no price;
  - the decider's cost lowers the saving; a negative saving;
  - a filter changes the sums but not a chat's comparison model;
  - a `claude-agent/sonnet` reply and a made-up Codex login reply, each listing no price, priced at the borrowed input and output prices; a model free by its name stays $0;
  - `placeMessage` keeps `from`, writes the chat's start model once and never again, and still sends the message when that write fails;
  - `grown()` and `readable()` keep the new fields; old records read them as null;
  - the contract declares the new answer (a test already makes every field declared).
- The panel preview (`npm run preview:panel`) with sample data for both views, at side-panel width, in light and dark: screenshots for the owner.
- The real-host smoke, isolated with mock models and $0: a placed message that moves the chat leaves a record with `from` and `start`, and `getUsageLog` returns one switch.
- **The Go check** (needs the owner's yes; no spend beyond the proof run the plan already waits on): install this version in the owner's OpenCode, then run the `off` and `on-one` sides on Go (plan `2026-11-26-relay-improve-on-go.md`, Task 6). Task 6 waits for this version, so one run serves both *(my call)*. How it is installed (a release, together with that plan's Task 8, or a packed copy) is asked when it is built. The runner reads `getUsageLog` for the run's chats before it puts the owner's settings back, and keeps the answer with its results, so the Plan view is read while Kimi is the Plan model *(my call)*. Check, for the `on-one` chats:
  1. the tab's switches equal the moves in Relay's records for those chats;
  2. Without switching equals a sum by hand from their usage records at Kimi's listed prices, to the cent. Both views must agree there: the bench starts every chat on Kimi, which is also the Plan model;
  3. Without switching beside the `off` side's real cost, with the gap reported as a check of the estimate, not a pass or fail: two runs never take the same tokens.
  The results go in `docs/compatibility.md` and `docs/implementation-progress.md`. Until then, nothing here is called verified on Go.

## Left to the builder

- Names, and where the new sum lives (a pure function beside `summarize` is the natural place).
- The exact sizes inside the plate, within DESIGN.md.
- How the two-second limit on the model list is written, and how the chat-start read joins the reads `placeMessage` already makes.
- `docs/guide.md`, `docs/saving-money.md` and `docs/status.md`: a short paragraph each on what the numbers mean, and the known limits above.
