---
name: Relay
description: "A strip board for OpenCode: each mode a bay, each chosen model a flight strip, the decider the controller."
colors:
  bay: "#e3e5e0"
  rail: "#cdd1cb"
  paper: "#fcfaf4"
  rule: "#e2dccb"
  ink: "#1b1d20"
  ink-2: "#434850"
  ink-3: "#575c63"
  plan: "#2360d0"
  execute: "#e19a1c"
  review: "#1d8553"
  controller: "#6a4fd6"
  alert: "#c3372b"
  on-fill: "#fff"
  plan-text: "#1d4fae"
  execute-text: "#7a4d00"
  review-text: "#14663f"
  controller-text: "#5536c4"
  alert-text: "#a32a1f"
  series-1: "#0f8b8d"
  series-2: "#c2457a"
  series-3: "#7a6f66"
  series-4: "#93357f"
  series-5: "#8f9230"
  series-other: "#8a9099"
  night-bay: "#121315"
  night-rail: "#26282c"
  night-paper: "#2c2b27"
  night-rule: "#423e35"
  night-ink: "#efede6"
  night-ink-2: "#c9c5bb"
  night-ink-3: "#a39f95"
  night-plan: "#6a9dff"
  night-execute: "#f2ab2f"
  night-review: "#4cc48c"
  night-controller: "#a593ff"
  night-alert: "#ff6f61"
  night-on-fill: "#0d1117"
  night-series-1: "#3cc4c6"
  night-series-2: "#ee7eab"
  night-series-3: "#b3a89e"
  night-series-4: "#d47fc1"
  night-series-5: "#c6c95c"
  night-series-other: "#7f848b"
  badge-from: "#4f7cff"
  badge-to: "#9b6bff"
typography:
  headline:
    fontFamily: "inherit"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  title:
    fontFamily: "inherit"
    fontSize: "12px"
    fontWeight: 750
    lineHeight: 1.4
    letterSpacing: "0.06em"
  body:
    fontFamily: "inherit"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  body-small:
    fontFamily: "inherit"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "inherit"
    fontSize: "11.5px"
    fontWeight: 400
    lineHeight: 1.4
  call-sign:
    fontFamily: 'ui-monospace, "Cascadia Mono", "Cascadia Code", "SF Mono", Menlo, Consolas, monospace'
    fontSize: "12.5px"
    fontWeight: 650
    lineHeight: 1.3
  figure:
    fontFamily: 'ui-monospace, "Cascadia Mono", "Cascadia Code", "SF Mono", Menlo, Consolas, monospace'
    fontSize: "11.5px"
    fontWeight: 550
    lineHeight: 1.15
    fontFeature: '"tnum"'
  figure-large:
    fontFamily: 'ui-monospace, "Cascadia Mono", "Cascadia Code", "SF Mono", Menlo, Consolas, monospace'
    fontSize: "16px"
    fontWeight: 650
    lineHeight: 1.2
    fontFeature: '"tnum"'
  slot-numeral:
    fontFamily: 'ui-monospace, "Cascadia Mono", "Cascadia Code", "SF Mono", Menlo, Consolas, monospace'
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1
  label:
    fontFamily: 'ui-monospace, "Cascadia Mono", "Cascadia Code", "SF Mono", Menlo, Consolas, monospace'
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.03em"
  stamp:
    fontFamily: 'ui-monospace, "Cascadia Mono", "Cascadia Code", "SF Mono", Menlo, Consolas, monospace'
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: "0.04em"
rounded:
  strip: "3px"
  control: "4px"
  bay: "5px"
  badge: "6px"
spacing:
  rack: "3px"
  field: "6px"
  bay: "8px"
  section: "10px"
  gutter: "12px"
components:
  strip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.strip}"
    padding: "6px 8px 6px 0"
  strip-night:
    backgroundColor: "{colors.night-paper}"
    textColor: "{colors.night-ink}"
    rounded: "{rounded.strip}"
    padding: "6px 8px 6px 0"
  strip-slot-plan:
    backgroundColor: "{colors.plan}"
    textColor: "{colors.on-fill}"
    typography: "{typography.slot-numeral}"
    width: "24px"
  strip-slot-execute:
    backgroundColor: "{colors.execute}"
    textColor: "{colors.ink}"
    typography: "{typography.slot-numeral}"
    width: "24px"
  strip-slot-review:
    backgroundColor: "{colors.review}"
    textColor: "{colors.on-fill}"
    typography: "{typography.slot-numeral}"
    width: "24px"
  strip-slot-controller:
    backgroundColor: "{colors.controller}"
    textColor: "{colors.on-fill}"
    typography: "{typography.slot-numeral}"
    width: "24px"
  strip-call-sign:
    textColor: "{colors.ink}"
    typography: "{typography.call-sign}"
  strip-field:
    textColor: "{colors.ink}"
    typography: "{typography.figure}"
    padding: "0 0 0 6px"
  strip-field-estimate:
    textColor: "{colors.ink-3}"
    typography: "{typography.figure}"
    padding: "0 0 0 6px"
  bay:
    rounded: "{rounded.bay}"
    padding: "{spacing.bay}"
  bay-heading-plan:
    textColor: "{colors.plan-text}"
    typography: "{typography.title}"
  slot-empty:
    textColor: "{colors.plan-text}"
    rounded: "{rounded.strip}"
    padding: "7px 10px"
  slot-empty-filled:
    backgroundColor: "{colors.controller}"
    textColor: "{colors.on-fill}"
    rounded: "{rounded.strip}"
    padding: "7px 10px"
  cost-strip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.strip}"
  cost-strip-field:
    textColor: "{colors.ink}"
    typography: "{typography.figure-large}"
    padding: "7px 10px"
  button:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "5px 10px"
  button-small:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "3px 8px"
  button-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bay}"
    rounded: "{rounded.control}"
    padding: "3px 8px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "5px 8px"
  stamp:
    textColor: "{colors.execute-text}"
    typography: "{typography.stamp}"
    rounded: "{rounded.strip}"
    padding: "0 5px"
  stamp-unavailable:
    textColor: "{colors.alert-text}"
    typography: "{typography.stamp}"
    rounded: "{rounded.strip}"
    padding: "0 5px"
  tag:
    backgroundColor: "{colors.plan}"
    textColor: "{colors.on-fill}"
    typography: "{typography.stamp}"
    rounded: "{rounded.strip}"
    padding: "1px 5px"
  note:
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
  drawer:
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
  badge:
    backgroundColor: "{colors.badge-from}"
    textColor: "{colors.on-fill}"
    rounded: "{rounded.badge}"
    size: "22px"
---

# Design System: Relay

## Overview

**Creative North Star: "The Strip Board"**

Relay's two OpenCode Desktop side panels are an air-traffic strip board. Each mode (Plan, Execute, Review) is a bay; each model chosen for it is a paper flight strip slotted into that bay, with a coloured slot block at its left edge, its id printed in monospace, and its figures (price per 1M tokens, input over output; intelligence index; context) in narrow ruled fields at its right. The decider is the controller: its strip has its own violet bay above the others, with the last choice it made written under it. The usage tab is the same board's ledger: summary tiles cut like the cost strip, a chart plate, and rows of strips that each end in a money field.

The board is dense and quiet. Type is small (13px body, 10px to 12.5px labels and figures) because the panel is 380px wide and is read beside a chat. Hierarchy comes from the strip's own structure (slot, call sign, fields) and from four holder colours, not from size. There are two lights: day (pale grey-green bay, warm paper strips, near-black print) and night (near-black bay, dim brown-grey strips, cream print). The board reads which one OpenCode Desktop is in from the host's background lightness, and never borrows the host's colours.

What the board rejects, by its thesis: rounded settings cards wrapped in grey hint paragraphs. Explanation is one line at the top, a one-line blurb beside each bay heading, or fine print folded into a disclosure; everything else is strips. One divergence from the direction: it asked for square-cornered strips, and the build lands at a near-square 3px corner on every paper surface.

**Key Characteristics:**
- Flight strips on one five-column template: slot block, call sign, price, index, context.
- Four holder colours bound to the modes and the decider; plan blue doubles as the interaction colour.
- Monospace for every figure, model id, time, field label and stamp; the host's UI font for prose and controls.
- Paper lifted off a flat bay by one two-layer hairline shadow; bays and drawers recessed by tone, not shadow.
- Two lights as token swaps on one root; no web fonts, no icon fonts, drawn SVG icons.

## Colors

A cool grey board holding warm paper strips, where four saturated holder colours and one alert red carry all the meaning.

Every colour is a token on the panel root with a night value under the night light; the `night-` keys in the frontmatter are those values, with the same roles.

### Primary
The four holders. A component never names a holder colour directly: it reads `--code`, `--code-ink` and `--code-text`, which the element's `data-mode` (plan, execute, review, decider) sets to that holder's fill, on-fill and text values.
- **Signal Blue** (`plan` #2360d0, night #6a9dff): Plan's slot blocks, tags and empty slot. Also the board's one interaction colour: the focus outline, the input focus ring, text selection, the native control accent, row hover tints in the model rack and the usage lists, and the Usage arrow on the cost strip.
- **Runway Amber** (`execute` #e19a1c, night #f2ab2f): Execute's slot blocks, tags and empty slot. The one light holder fill in day, so text on it is ink, not white.
- **Clearance Green** (`review` #1d8553, night #4cc48c): Review's slot blocks, tags and empty slot.
- **Controller Violet** (`controller` #6a4fd6, night #a593ff): the decider's bay heading, its D slot, and the filled "Choose a decider" slot.

Each holder has a darker text variant for day (`plan-text`, `execute-text`, `review-text`, `controller-text`), used wherever the colour is text on paper or bay: bay headings, stamps, link buttons, empty-slot labels, fine-print summaries. At night the text variant is the fill itself. Text on a fill uses `on-fill` (white in day, ink on amber; `night-on-fill` #0d1117 on every fill at night).

### Secondary
- **Alert Red** (`alert` #c3372b, `alert-text` #a32a1f; night #ff6f61 for both): the remove x on hover, the "unavailable" stamp, error notes, and warning lines under a bay. Nothing else.

### Tertiary
- **Ledger Series** (`series-1` to `series-5`: teal, rose, taupe, plum, olive; `series-other` slate grey): the usage chart's stacked bars and legend dots, one per most-spent model in order, grey for the rest. Usage tab only.
- **Badge Gradient** (`badge-from` #4f7cff to `badge-to` #9b6bff, 135 degrees): the R badge, and nothing else.

### Neutral
- **Board Bay** (`bay` #e3e5e0, night #121315): the panel's background; also the text colour on an ink fill.
- **Rail Grey** (`rail` #cdd1cb, night #26282c): mixed into the bay to recess mode bays (52%) and drawers (40%); control borders, the footer rule, the scrollbar thumb, the "none" tag.
- **Strip Paper** (`paper` #fcfaf4, night #2c2b27): every lifted surface (strips, the cost strip, the model rack, log lines, usage tiles, plate and rows) and every button and input.
- **Printed Rule** (`rule` #e2dccb, night #423e35): field rules between a strip's figures, table row rules, the dashed "use it for" line, the effort select's border, the key cap's underline.
- **Print Ink** (`ink` #1b1d20, night #efede6): call signs, figures, headings outside a bay; the fill of a pressed segment and the count badge.
- **Second Ink** (`ink-2` #434850, night #c9c5bb): the lede, bay blurbs, provider names, captions, the footer.
- **Third Ink** (`ink-3` #575c63, night #a39f95): field labels and column heads, placeholders, the remove x at rest, estimated figures.

### Named Rules
**The Four Holders Rule.** On the board, blue, amber, green and violet mean Plan, Execute, Review and the decider. They reach a strip, slot block, bay heading, stamp, tag, empty slot or link only through `data-mode` and `--code`, `--code-ink`, `--code-text`; a component that hard-codes a holder colour breaks when the mode or the light changes.

**The Reserved Series Rule.** Chart series never take a holder hue. Teal, rose, taupe, plum, olive and grey sit off blue, amber, green and violet, so a bar never reads as a mode.

**The Two Lights Rule.** Every colour has a day value on `.rl` and a night value on `.rl[data-light=night]`. The light follows OpenCode Desktop's background lightness (else the system setting); the colours stay Relay's own. The R badge is the only component that carries literal colours.

## Typography

**Display Font:** none
**Body Font:** the host's UI font, inherited from OpenCode Desktop (nothing is loaded)
**Label/Mono Font:** the system monospace stack (ui-monospace, Cascadia Mono, Cascadia Code, SF Mono, Menlo, Consolas, monospace)

**Character:** The host's sans carries prose and controls, so the panel speaks in OpenCode's voice; the monospace prints everything a controller reads off a strip. Weights sit between the usual steps (550, 650, 750) where the host's variable face allows them; a static face rounds them.

### Hierarchy
- **Headline** (700, 15px, 1.4, -0.01em): the panel name beside the R badge. Once per panel.
- **Title** (750, 12px, 0.06em, uppercase): bay headings (DECIDER, PLAN, EXECUTE, REVIEW) in the holder's text colour; usage section heads (COST BY DAY, BY MODEL, RECORDS) in ink.
- **Body** (400, 13px, 1.4): the board's base size.
- **Body Small** (400, 12px to 12.5px, 1.5): the lede, bay blurbs, drawer bodies, inputs (12.5px), buttons and link buttons (600).
- **Caption** (400, 11.5px): provider names, small notes, the footer, counts.
- **Call Sign** (mono 650, 12.5px, 1.3): a model's id on its strip; 600 in the usage rows.
- **Figure** (mono 550, 11.5px, 1.15, tabular): price, index and context fields, right-aligned; prices stack input over output.
- **Figure Large** (mono 650, 16px, 1.2, tabular): the totals on the cost strip and the usage tiles.
- **Slot Numeral** (mono 700, 12px, 1): the number, or D, in a slot block.
- **Label** (mono 600, 10px, 0.03em, uppercase): the printed field labels over figures, the legend row above the bays, the rack's and the log's column heads.
- **Stamp** (mono 700, 10px, 0.04em, uppercase): stamps and tags.

### Named Rules
**The Mono Figures Rule.** Every number, model id, time, field label and stamp is set in the monospace stack, and every number with tabular figures; prose and controls never are.

**The No Load Rule.** Relay loads no web font and no icon font. Type is the host's UI font plus the system monospace stack.

**The Italic Guess Rule.** A figure Relay estimated rather than read (an index hint such as "<54.7" or "≈47–61") is italic in third ink; a borrowed price keeps its ink and carries a "*". A guess never looks like a reading.

## Layout

Two fixed-width side panels: Relay at 380px and Relay usage at 420px. There are no breakpoints; columns flex inside the width with `minmax(0, 1fr)`, and a call sign truncates with an ellipsis rather than wrapping.

Each panel is a column: a header (R badge and name, 12px 14px 8px), a scrolling body, and on Relay a footer (model count, version, Refresh) under a rail-coloured rule. The body is a single-column grid with 10px between sections and 12px side gutters, its rows sized to their content so a scroll box inside never collapses.

Relay's first viewport, top to bottom: the one-line lede; the decider bay (controller strip, last choice, try box); the cost strip; a legend row of column heads; then the Plan, Execute and Review bays, each ending in an empty slot; drawers below. The usage tab: range segments, three summary tiles, the chart plate, By model, search, a Filters drawer, then the records.

Spacing rhythm: 3px between strips in a rack (they stack nearly touching, like a rack), 6px inside a bay and between inline controls, 8px of bay padding, 10px between sections and as a field's side padding, 12px gutters. A strip has 6px vertical padding, and its slot block and figure fields stretch its full height so their edges and rules run top to bottom.

Usage rows are strips without a slot block: a main column (time, call sign, detail) and a money field fenced by a left rule, at least 64px wide. The filters sit in an auto-fill grid of 118px-minimum cells.

**The Shared Template Rule.** A strip is a five-column grid: 24px slot block, flexible call sign, 66px price, 38px index, 36px context, 6px apart. The legend row above the bays uses the same template, so its heads stand over every bay's fields. Anything new that shows a model's figures joins this template.

## Elevation & Depth

Two levels and one shadow. The bay is flat; mode bays and drawers sit a little darker than it (rail mixed in), a recess made by tone. Paper sits above with one shared lift. Nothing floats higher: Relay has no menus, popovers or dialogs of its own.

### Shadow Vocabulary
- **Strip lift, day** (`box-shadow: 0 1px 0 rgba(27,29,32,.07), 0 1px 3px rgba(27,29,32,.12)`): every paper surface (strips, the cost strip, the model rack, log lines, usage tiles, plate and rows).
- **Strip lift, night** (`box-shadow: 0 1px 0 rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.35)`): the same surfaces at night.
- **Input focus ring** (`box-shadow: 0 0 0 3px color-mix(in srgb, var(--rl-plan) 20%, transparent)`): a text input or select on focus, with a plan-blue border.
- **Note ring** (`box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 38%, transparent)`): a note's edge in its status colour.
- **Key cap rule** (`box-shadow: inset 0 -1px 0 var(--rl-rule)`): the underline of a `kbd`.

### Named Rules
**The One Lift Rule.** Paper gets `--rl-lift` and nothing else. A strip never gets a shadow of its own, and a bay or drawer never gets one at all.

## Shapes

Near-square. Paper is cut at 3px (strips, slot blocks, stamps, tags, the cost strip, the model rack, the chart plate, log lines); controls at 4px (buttons, inputs, notes, drawers); bays at 5px. The slot block rounds only its outer left corners (3px 0 0 3px) and runs the strip's full height, so it reads as the strip's coloured holder edge, not a badge. The R badge is the one rounder shape (6px), a brand mark.

Lines carry state. A 1px printed rule separates figure fields. An empty slot has a dashed 1.5px border in its holder colour at 60%, and turns solid-filled when it is the step to take next. A stamp has a solid 1.5px border in its own text colour. A writable "use it for" line is a dashed 1px bottom rule.

Icons are drawn SVG paths on a 16-unit grid, 1.6 stroke, round caps and joins, shown at 12px or 14px in the text's colour and hidden from screen readers (plus, x, chevron, arrow, refresh, warn, try).

**The Pulled Strip Rule.** A strip whose model OpenCode no longer offers is pulled 10px out of its holder and stamped "unavailable" in alert red, with the reason under its bay. Position, not only colour, says it is out.

## Components

### Flight Strip
The signature: a paper strip slotted into its bay, read left to right.
- **Structure:** slot block (its number in the bay, or D for the decider) | call sign (model id over provider) | price stack (input over output) | index | context. A second row spans call sign to index: the effort select, any stamps, and the "use it for" line. The remove x sits in the context column.
- **Colour:** paper with the strip lift; the slot block in the holder fill with an on-fill numeral; figures in ink, right-aligned, with 1px rules between fields.
- **States:** the remove x is third ink at rest, and on hover turns alert red on an alert tint (14%). An unavailable strip is pulled 10px right (0.2s, `cubic-bezier(.16,1,.3,1)`). A strip just added slides in from 32px at 30% opacity over 0.28s on the same curve, only when reduced motion is not requested.
- **"Use it for" line:** borderless 12px text on a dashed rule, placeholder "Use it for…"; on focus the rule turns solid in the holder colour.
- **Effort:** a compact native select (1px rule border, 3px corners, 11.5px), at most 72px wide.

### Bay
- **Recess:** rail mixed 52% into the bay, 5px corners, 8px padding, 6px gap.
- **Head:** the uppercase title in the holder's text colour, then a one-line blurb in second ink, on one baseline.
- **Notes:** "None yet", review checks and Relay's own part are 12px second-ink lines; warnings take alert text and the warn icon.
- **End:** always an empty slot, or the open model rack in its place.

### Empty Slot
- **Default:** full width, 3px, 7px 10px, a dashed 1.5px border in the holder at 60%, holder text 12.5px 600, a plus icon. Hover: the holder at 9% behind it.
- **Filled:** a solid holder fill with on-fill text ("Choose a decider" when none is set). It marks the one step the person must take next.

### Cost Strip
- One button: paper, 3px, the strip lift; three fields (7-DAY SPEND, TOKENS, REPLIES), each a label over a large figure and ruled from the next, then a Usage arrow in plan blue whose cell fills on hover.
- The usage tab's three summary tiles use the same fields, with a caption line under each figure.

### Buttons
- **Shape:** 4px.
- **Default:** paper, a 1px rail border, ink, 12px 600, 5px 10px. A small size (3px 8px, 11.5px) for Refresh, range and metric segments, and the rack's Add and Use.
- **Hover / Disabled:** the border darkens to third ink; disabled is 50% opacity.
- **Pressed:** an ink fill with bay text, for the range and chart-metric segments.
- **Link button:** holder text, 12px 600, a 1px underline 3px below ("Change the decider").

### Chips
- **Stamp:** outlined (1.5px, its own colour), holder text, label type: Relay's own part on a strip ("small work", "big work"); alert red for "unavailable".
- **Tag:** a filled holder with on-fill text, the same type: the mode on a Recent choices line; rail with second ink for "none".
- **Count badge:** an ink fill with bay text, mono 10.5px ("2 on" beside Filters).

### Inputs / Fields
- **Style:** paper, a 1px rail border, 4px, 5px 8px, 12.5px; selects share it. Placeholders in third ink.
- **Focus:** a plan-blue border and a 3px plan ring at 20%. Every other focusable element gets a 2px plan-blue outline 2px out.
- **Disabled:** 55% opacity.

### Model Rack
- Opens in place of a bay's empty slot: paper, 3px, the strip lift, 8px padding. A search box with Done, provider and order selects, then a table in a 1px-ruled, 3px, 320px-high scroll box.
- Sticky label-type column heads; fixed figure columns (66px, 44px, 40px, 42px); mono tabular figures, right-aligned; estimates italic in third ink; plan at 7% on row hover; a small Add or Use button per row.

### Notes
- 4px, 8px 10px, ink text: a status colour at 11% into paper with a 1px inset ring at 38%, its icon in that colour. Plan blue by default, amber for a warning, green when done, alert red for an error.

### Drawers and Fine Print
- **Drawer:** a disclosure under the bays: rail mixed 40% into the bay, 4px, an 8px 10px summary with a chevron that turns 90 degrees in 0.15s and a right-aligned caption. Its body is built on first open.
- **Fine print:** a dotted-underlined summary in the holder's text colour that folds a bay's longer explanation.

### Navigation
- **Panel header:** the R badge (22px, 6px corners, the badge gradient, a white 12px 700 R) and the panel name in headline type. On the usage tab, a small Refresh sits at the right.
- **Footer (Relay):** the model count in caption type, the version in mono 11px, a small Refresh.

### Usage Chart Plate
- A paper plate, 3px, the strip lift: an uppercase head with metric segments; stacked bars on 10-unit slots inset 1.5 each side; the maximum in mono third ink at the top left; a printed baseline rule; mono day labels; a legend of 8px series dots with 2px corners.

## Do's and Don'ts

### Do:
- **Do** put any new model row on a paper strip in the shared template (24px slot, flexible call sign, 66px, 38px, 36px; 6px apart) with 1px rule-coloured field rules.
- **Do** colour a mode only through `data-mode` and `--code`, `--code-ink`, `--code-text`: the `-text` variant for text on paper, the `-ink` variant for text on a fill.
- **Do** print every figure in the monospace stack with tabular figures, right-aligned; print estimates italic in third ink and mark borrowed prices with "*".
- **Do** give every new colour a day value on `.rl` and a night value on `.rl[data-light=night]`, and look at it in both lights.
- **Do** end each bay with an empty slot (dashed 1.5px, holder at 60%), and fill it solid only for the one step the person must take next.
- **Do** keep one rule per selector in `panelCss` (`tests/gui-styles.test.ts`), with every selector scoped under `.rl`.
- **Do** run entrance motion only under `prefers-reduced-motion: no-preference`, on `cubic-bezier(.16,1,.3,1)`, in 0.28s or less.

### Don't:
- **Don't** wrap settings in rounded cards with grey hint paragraphs; explanation is one line, a bay blurb, or folded fine print.
- **Don't** load a web font or an icon font, or use text glyphs as icons; draw icons as 16-unit SVG paths at 1.6 stroke.
- **Don't** give a chart series or a decoration a holder hue (blue, amber, green, violet).
- **Don't** take colours from OpenCode's theme; read only whether it is light or dark.
- **Don't** put literal white on a holder fill; plan blue is light at night, and only the `-ink` token keeps text on it legible.
- **Don't** round paper beyond 3px or controls beyond 4px, and don't give a strip a shadow of its own.
- **Don't** change the name "Relay" or the R badge.
