# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- The owner, every day, in OpenCode Desktop on Windows, with several providers at once: OpenCode Zen, OpenCode Go, Ollama Cloud, and Claude through a Claude login.
- People who install `relay-opencode` from npm (`opencode plugin add relay-opencode@<version>`) and open the panel for the first time without knowing Relay. The panel must explain itself to them without the README.

## Product Purpose

Relay is an OpenCode plugin that puts each chat message on the right model. A small decision model reads the message, picks Plan, Execute or Review for it and which of that mode's models fits, then Relay switches the chat to that model and sends the message once, unchanged. The aim is to pay less than one model for everything without doing worse work.

Success: the person sets their models once, trusts the choices Relay makes, and can see what each reply cost.

## Positioning

Relay routes inside the person's own OpenCode chat, one message at a time, across whatever providers they already have, using lines they write in their own words ("use it for …"). Nothing proxies their traffic: the chat talks to the provider as before, and the decision model never sees model names or prices.

## Operating Context

- **The panels.** "Relay" is an OpenCode Desktop side panel, 380 px wide, opened with **Open Relay** in the command palette or from the pill. "Relay usage" is a second side panel, 420 px wide, opened with **Open usage**.
- **In the chat.** `/relay <message>` places one message; `/relay on` and `/relay off`, or the pill above the chat box, place every message of one chat. The terminal app has `/relay-stats`.
- **Setup.** For each of Plan, Execute and Review: one or more models, each with an effort and an optional "use it for" line. One decision model (the decider), with a box to try a sample message. An optional Artificial Analysis key for prices and the index.
- **Choosing a model** happens in a table of every model OpenCode offers (often 100+), compared by price per 1M tokens, context size and intelligence index.

## Capabilities and Constraints

- **What the side panel holds (all of it must keep working):** the three modes with their chosen models, effort, "use it for" lines, a line of price, index and context, and Relay's own part for each model ("big work", "small work"); the "Add a model" table with search, provider filter and order (provider, price, context, index), a price marked `*` when borrowed, a hint where there is no index; the decider card with the test box, the last choice and the privacy note; Usage (a button to the usage tab); the Artificial Analysis key; Recent choices; Review rules; the model count, the Relay version and Refresh.
- **What the usage tab holds:** range (today, 7, 30, 90 days), Spent and Tokens, a chart by day split by model, By model, search and filters, the records list with Show more, and the older totals.
- **The pill** above each chat box: Relay on or off for that chat, its last choice, and a warning when no decider is chosen.
- **Technology:** Solid, rendered through OpenCode Desktop's plugin GUI API (`@opencode/plugin/gui`), bundled with Vite. The styles are one CSS string scoped under `.rl` (`src/gui-styles.ts`); there is no CSS pipeline. The panel bundle may not import from `node:`.
- **Theme:** following OpenCode's own theme colours is not required (owner, 26 Nov 2026). The panel must still read well in OpenCode Desktop's light and dark themes.
- **Truth rules:** prices are exact USD; a $0 listing reads "$0 or not listed" unless the model is free by its name; a borrowed price names its source; an index hint is a bound or a range, never a plain number.
- **Terms:** Plan, Execute, Review (the modes); decider or decision model; effort; "use it for" line; Relay on and off; index (the Artificial Analysis Intelligence Index).

## Brand Commitments

- The name "Relay" and the "R" badge logo stay (owner, 26 Nov 2026). The "Plan · Execute · Review" tagline is not binding.
- Voice: short, plain words and step-by-step flows; no jargon the person has to look up.

## Evidence on Hand

- Screenshots of the earlier panel: `docs/images/` (18 Nov 2026).
- Real measurements: `docs/compatibility.md` (cost runs, price and index coverage on the owner's 123 models).
- No testimonials, ratings or user numbers exist; npm downloads are mostly automated. None may be invented.

## Product Principles

1. **Setup leads.** Choosing models per mode, with price, index and context side by side, is the panel's main job; everything else is one step away.
2. **Explain on first open.** A new npm user understands what Relay does and what to do next from the panel alone.
3. **Show the truth, label the guess.** Exact prices, named sources, hints marked as hints, nothing made up.
4. **Never surprise the person.** What is sent to the decider, and what Relay switched, are always visible.
