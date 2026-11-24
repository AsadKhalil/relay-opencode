# The Relay usage tab, fixed to show the numbers (24 Nov 2026)

A short design: a fix of the usage tab built from `2026-11-24-relay-usage-tab-design.md` (merged in af16c33).

## Why

The owner opened the tab in Desktop: "the usage tab is still useless the ui si so poor i cannnot see the usage in dolllars or tokens please review it".

Rendered with test data at the panel's width (420 px), the tab hid its numbers:

1. In a window under about 900 px tall, both tables shrank to empty boxes. `.rl-body` is a grid of `auto` rows, and a scroll box's automatic minimum height is 0, so the tables got only the height left over.
2. The By model rows used the class `rl-row`, which the panel already defines as a flex row, so the rows lost their columns. Only "Model" showed, and Cost sat off-screen (882 px of table in a 391 px box).
3. Records had nine columns that never wrap, with Tokens and Cost last: 944 px of table in a 375 px box.
4. The totals were one sentence with six decimals, the chart had no scale or day names, and seven filter boxes came before any number.

## Goals, non-goals, anti-goals

- **Goal:** dollars and tokens readable at a glance in a 420 px side panel, at any window height.
- **Non-goals:** no new data, and no change to `getUsageLog` or the contract.
- **Anti-goals:** sideways scrolling; numbers only on hover; money in floating point.

## Approaches

- **Fix only the bugs:** stop the collapse, fewer columns, totals to the cent. The layout stays.
- **Redesign around the numbers:** the owner chose this, with the mockup below, then an install in their copy and the rest of the Go run.

## Design (the approved mockup)

```
Relay usage                      Refresh
[Today] [7 days] [30 days] [90 days]

 Spent              Tokens
 $0.42              2.3M
 64 replies         2.1M in · 156K out

Cost by day     [Cost] [Tokens] [Requests]
$0.09 ┤    █     █
      │ ▄  █  █  █  ▆  ▃
       Tu We Th Fr Sa Su Mo

By model                           Cost
kimi-k3.1-pro                     $0.35
  opencode-go · 28 replies · 984K tokens

[Search models…]          Filters (0) ▸

Records · 64, newest first
10:04 kimi-k3.1-pro             $0.012
      chat · execute · 31K in · 1.2K out
```

- **Header and range:** the name with Refresh, then the four ranges.
- **Tiles:** Spent and Tokens, big. Under Spent, the replies; when some have no price, how many. Under Tokens, in and out.
- **Chart:** the metric's name and buttons, the tallest bar's value at the top, a weekday and date under each bar for up to ten days (else the first, middle and last dates), at least seven slots so that one day is not one wide bar, and the legend.
- **By model:** one two-line row a model, most expensive first: the model's name and its cost, then provider, replies and tokens. A row is a button that searches for that model.
- **Search and filters:** the search stays in view. The six filters fold into **Filters**, whose heading counts those set, with **Clear**.
- **Records:** one two-line row a reply: time, model and cost, then kind, mode, tokens in and out, project, and Relay's choice. **Show more** adds 50.
- **Numbers:** money to the cent from $0.10 up, and two significant digits below ($0.069, $0.0021), with bigint as everywhere in Relay. Counts short (15.8K, 2.3M). Everywhere in the tab, "in" is what was read new, from a cache and into a cache, and "out" includes reasoning.
- **The root fix:** `.rl-body` rows take their content's height, which also keeps the main panel's model table from collapsing. The clashing rule goes, and a test fails when the panel's styles define a class twice.

## My calls

- Sorting by column is dropped: the rows come most expensive first, and there are few models.
- "Every reply of every chat" moves from the header to the footer.
- A model's tokens are all kinds added up, as in the chart.

## Testing

Unit tests for the money, counts, chart labels and rows; the duplicate-class test; screenshots of the real component in a browser page with test data, 420 px wide, 720 and 1,000 px tall. Then the four checks and the smoke, a final review, the install in the owner's copy, and the owner's own look in Desktop.
