# Contributing to Relay

Thanks for helping. Relay is an OpenCode plugin (package `relay-opencode`). `/relay <message>` asks a small decision model whether a message is plan, execute or review work, picks the model you chose for that kind of work, and sends the message there. The [README](README.md) says what it does and how to install it.

## Set up

1. Install Node 24 (what CI uses) and git.
2. Clone the repo and run `npm ci`.
3. Run the four checks. All four must pass before you open a pull request. CI runs them on Linux and Windows, and also runs the smoke below on Linux, macOS and Windows:

   ```
   npm run typecheck
   npm test
   npm run build
   node scripts/check-package.mjs
   ```

## The smoke on a real OpenCode

`npm run smoke:host:model` installs the packed plugin into an isolated OpenCode with scratch folders, a throwaway password, mock models and a mock decision model. It needs `npm run build` first, and `RELAY_SMOKE_CLI` set to an OpenCode 2.3.0 binary.

- To get one without installing OpenCode, run `npm install --prefix <folder> --ignore-scripts @opencode/cli-<os>-<arch>@2.3.0` (for example `cli-linux-x64`, `cli-darwin-arm64` or `cli-windows-x64`). The binary is in `<folder>/node_modules/@opencode/cli-<os>-<arch>/bin/`.
- Use 2.3.0, not 2.4.1: on 2.4.1 a chat with the smoke's mock model never finishes, with or without Relay (25 Nov 2026), so the smoke cannot pass there until its mock is changed.

## Where things are

- `src/` is the plugin.
  - `index.ts` connects everything to OpenCode.
  - `relay-command.ts` is `/relay` and the switch's placement; `relay-auto.ts` holds the hooks that run for every message, every idle chat and every summary.
  - `router.ts` holds the routing rules (pure functions, no OpenCode calls); `ranking.ts` is Relay's own choice inside a mode (index and price); `decider.ts` builds the question for the decision model.
  - `relay-store.ts` keeps the settings and recent decisions; `usage-log.ts` keeps one usage record per reply; `chat-facts.ts` reads a chat's messages.
  - `costs.ts` is money; `intelligence.ts`, `artificial-analysis.ts` and `standings.ts` are the index and prices.
  - `rpc.ts` and `contract.ts` are the calls the panel makes; `gui.tsx` is the side panel and the pill, `gui-usage.tsx` the Relay usage tab; `relay-view.ts` and `usage-view.ts` hold the words and numbers they show; `gui-styles.ts` their styles.
  - `tui.ts` is `/relay-stats` in the terminal app.
- `tests/` holds `node:test` tests, run through `tsx`. `tests/relay-fakes.ts` is a fake OpenCode host for the Relay tests.
- `npm run preview:panel` shows both panels in a browser with sample data, at http://127.0.0.1:5199/?panel=models|usage&light=day|night&state=set|empty|retired. Use it to check a change to `src/gui*.tsx` or `src/gui-styles.ts` in day and night; the look is recorded in `DESIGN.md`.
- `scripts/` holds the smoke (`smoke-host-model.mjs`), the package check, the decider's example run (`decider-examples.ts`) and size test (`decider-size.ts`, with its made-up cases), and the benchmark in `scripts/bench/`. The decider runs and the benchmark send real requests; run them only on purpose, as their headers say.
- `docs/` holds the pages the README links to (`guide.md`, `saving-money.md`, `privacy.md`, `status.md`, `data-sources.md`), what was seen on real OpenCode hosts (`compatibility.md`), a dated log of changes (`implementation-progress.md`), and the designs and plans (`superpowers/`).
- `docs/images/` holds the README's screenshots: the panel's real code (`src/gui.tsx`) in a plain page, with example settings and the model list Relay showed on 18 Nov 2026 (`docs/compatibility.md` says how they were made).

## How to make a change

- **Write the test first.** Watch it fail, then make it pass. For a new guard, break it once and check that its test turns red.
- **Keep the fakes honest.** A fake host in a test should behave like the real one. If you find a difference, fix the fake and say so.
- **Never use real keys or your own OpenCode profile in tests.** Use the smoke above.
- **Don't call something verified when it only ran against fakes.** If you try a change on a real OpenCode, add what you saw to `docs/compatibility.md` (platform, OpenCode version, and what you did not test), and one dated line to `docs/implementation-progress.md`.
- **Rules the code relies on:**
  - Every RPC method in `src/contract.ts` declares its errors. A test checks this.
  - Money is a USD string backed by `bigint` (`src/costs.ts`), never a float.
  - The panel bundles `router.ts`, `ranking.ts`, `decider.ts`, `relay-store.ts`, `relay-view.ts`, `settings.ts`, `costs.ts`, `usage-view.ts` and `gui-usage.tsx`, so they, and what they import, must not import anything from `node:`.
  - The package name, the plugin id and the RPC id are all `relay-opencode`, and a test keeps them equal. OpenCode keeps each plugin's saved settings under its id, so a new id loses everyone's settings.
  - A change to what the decider is asked is measured again with `scripts/decider-size.ts` (or `decider-examples.ts`) before it ships.
  - Mark a deliberate simplification with a `// shortcut:` comment that says where it stops working.
  - Keep each file's existing line endings: most files use CRLF; `README.md` and `CONTRIBUTING.md` use LF.
- `AGENTS.md` lists the same rules for coding agents, and more detail on each.

## Pull requests

- One topic per pull request, with a short description of what changed and how you tested it: fakes, smokes, or a real OpenCode.
- The four checks pass and CI is green.
- By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE).

## Releasing (maintainers)

A release puts a new version on npm, where OpenCode downloads it from. Only an owner of the npm package `relay-opencode` can publish.

1. **Pick the version.** Raise `version` in `package.json` (for example to `0.2.0`), or run `npm version 0.2.0 --no-git-tag-version`. Set the same version in `RELAY_VERSION` in `src/relay-view.ts` (the panel shows it; a test checks) and in the README's install example, and add a dated line to `docs/implementation-progress.md`.
2. **Check.** Run the four checks and the smoke (above). Commit and push.
3. **Publish.** Run `npm login` as a package owner, then `npm publish`. `prepublishOnly` runs the four checks again and stops the release if one fails. `npm publish --dry-run` first shows the files that would go out: only `dist/`, the README, the license and `package.json`.
4. **Wait for it to go live.** npm may hold a release for review. Until it is live, `npm view relay-opencode version` can print `0.0.0-stage`, a placeholder npm adds ("Temporary package placeholder for staged publishing"). For 0.1.0 the real version became `latest` about three minutes later. Check with `npm view relay-opencode version`.
5. **Tag it.** `git tag v0.2.0` and `git push origin v0.2.0`.
6. **Update your own OpenCode.** Set `"relay-opencode@0.2.0"` in `plugins` and restart OpenCode, or update a fixed copy as the [guide](docs/guide.md#update) says.

npmjs.com shows the README from the published package, so a README change shows there only after the next release.

## Reporting a problem

Open a GitHub issue with your OpenCode version (`opencode --version`), your operating system, what you typed, what you expected and what happened. Leave API keys and anything private out of logs and screenshots.
