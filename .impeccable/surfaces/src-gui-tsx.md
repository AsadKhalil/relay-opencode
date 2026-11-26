---
version: 1
slug: "src-gui-tsx"
primary_target: "src/gui.tsx"
related_targets: ["src/gui-usage.tsx","src/gui-styles.ts"]
---

## Scope

Relay's two OpenCode Desktop side panels: Relay (380 px, setup) and Relay usage (420 px, cost). Mode: Operate. Users: the owner daily and first-time npm installers. Main job: set up models per mode; return visits check cost. Feels wrong: walls of small grey text, numbers hidden behind clicks.

## Direction contract

THESIS: Every model is a flight strip in its mode's bay, the decider the controller; no rounded settings cards wrapped in grey hint paragraphs.
OWN-WORLD: A strip board in day (pale bay, warm paper, black print) and night (dark bay, dim strips, light print). Holders coded Plan blue, Execute amber, Review green, decider violet. Square-cornered strips, printed field rules, monospace figures, a filled slot block.
STORY: A newcomer reads one line and slots a model into each empty bay; a returning user reads the cost strip, then re-trims a strip.
FIRST VIEWPORT: R and Relay; the controller strip (decider, last choice); the cost strip (spent, 7 days); then three bays of strips (slot, model, in/out price, index, context) ending in an empty slot. A new strip slides into its bay.
FORM: Flight strips, rank 1 of 7, seed e575b595.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Open decisions

- The pill above the chat box is drawn by OpenCode; only its words follow this world.
