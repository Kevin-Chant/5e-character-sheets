# Screenshotting the UI for visual iteration

`scripts/screenshot.mjs` renders a route — optionally seeded with a fixture
character — and saves a PNG. It auto-starts `pnpm dev` if nothing is already
serving on the base URL, so you don't need the dev server running first (though
if the user already has one up, it's reused).

## Standard invocation — use `pnpm screenshot`, not `node scripts/...`

Always run it through the package script:

```bash
pnpm screenshot --fixture full-caster-wizard --open --out "$SCRATCHPAD/sheet.png"
```

Two conventions matter and are easy to get wrong:

1. **Invoke via `pnpm screenshot`.** The permissions allowlist in
   `.claude/settings.local.json` has `Bash(pnpm screenshot:*)`. Calling
   `node scripts/screenshot.mjs ...` directly is _not_ covered and will trigger
   a permission prompt. pnpm forwards extra args to the script, so just append
   flags after `pnpm screenshot`.
2. **Always pass `--out` pointing at your session scratchpad dir** (the absolute
   path the harness gives you, e.g. `/tmp/claude-*/.../scratchpad`). The script's
   default output is `screenshot.png` **in the repo root** — a stray, untracked
   PNG that pollutes `git status`. `/screenshot.png` is gitignored as a safety
   net, but don't rely on it; write to the scratchpad. Never write to a
   repo-relative `scratchpad/` either — that also lands inside the repo.

## Flags

| Flag                | Purpose                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--fixture <name>`  | Seed `src/lib/fixtures/<name>.json` into localStorage (local store)                                                                                                            |
| `--open`            | After seeding, click the character to open its sheet                                                                                                                           |
| `--route <path>`    | Route to visit (default `/`)                                                                                                                                                   |
| `--out <file>`      | Output PNG path — point this at the scratchpad                                                                                                                                 |
| `--viewport WxH`    | Viewport size (default `1280x900`)                                                                                                                                             |
| `--no-full`         | Capture only the viewport instead of the full scroll height                                                                                                                    |
| `--base <url>`      | Dev server URL (default `http://localhost:3000`)                                                                                                                               |
| `--seed <int>`      | Make `Math.random` deterministic — reproducible dice rolls                                                                                                                     |
| `--steps <json>`    | Array of interaction steps run in order before capture (see below)                                                                                                             |
| `--steps-file <p>`  | Same as `--steps`, read from a JSON file                                                                                                                                       |
| `--storage <file>`  | Persist localStorage across runs (loaded before, saved after) — drive long flows like repeated level-ups in incremental batches. Wins over `--fixture`; `--open` works with it |
| `--dump <file>`     | After the steps, dump the stored characters as JSON — diff real saved state instead of eyeballing pixels                                                                       |
| `--snapshot`        | Print the accessibility tree (roles + accessible names) instead of capturing — **the way to find a selector**, see below                                                       |
| `--snapshot-of <s>` | Scope `--snapshot` to a selector, e.g. `".modal-content"`                                                                                                                      |
| `--probe 'a,b'`     | Per selector: box, stacking-relevant computed styles, and what actually sits on top — see "Layering questions" below                                                           |

Available fixtures: `empty-level-1`, `full-caster-wizard`, `martial-fighter`,
`multiclass`.

## Modal / interaction flows — `--steps`

To capture something that only exists after interaction (a modal, a picker, a
roll result), pass `--steps` a JSON array of actions run in order after the sheet
opens. Each step is an object with exactly one action key:

| Step                              | Does                                         |
| --------------------------------- | -------------------------------------------- |
| `{"click":"<selector>"}`          | Click (Playwright selector: CSS, or `text=`) |
| `{"fill":["<selector>","text"]}`  | Type into an input                           |
| `{"select":["<selector>","val"]}` | Choose a `<select>` option (value or label)  |
| `{"press":"<key>"}`               | Keyboard press, e.g. `"Enter"`, `"Escape"`   |
| `{"wait":300}`                    | Wait N ms                                    |
| `{"wait":"<selector>"}`           | Wait until the selector is visible           |
| `{"shot":"<name>"}`               | Capture here and carry on                    |

A failing step reports its index and selector, and the output carries a
`FAILED: …` summary line at **both ends** so it survives being read through
`head` or `tail` — Playwright's own diagnosis (which elements a `text=` matched,
what intercepted a click) is in the middle and is almost always the answer.
Prefer stable selectors — `aria-label` (buttons carry them, e.g. `Roll
Greatsword`, `Edit spell`) and component classes (`.roll-go`, `.roll-modal`) —
over brittle text. Pair with **`--no-full`** (modals are viewport-fixed, so
full-page capture misplaces them) and **`--seed`** for reproducible dice.

**`{"shot":"<name>"}` gives one boot many frames.** Each run is a cold browser
launch, so capturing five states used to mean five runs. A mid-flow shot writes
next to `--out` with the name inserted: `--out flow.png` yields
`flow.step1.png`, `flow.review.png`, … and the final capture keeps `flow.png`.

Example — open the damage roll dialog for an attack and roll it:

```bash
pnpm screenshot --fixture martial-fighter --open --no-full --seed 7 \
  --viewport 900x760 --out "$SCRATCHPAD/roll.png" \
  --steps '[{"click":"[aria-label=\"Roll Greatsword\"]"},{"click":".roll-go"},{"wait":300}]'
```

Multi-step flows compose naturally — e.g. enter edit mode, open the SRD picker,
search, and pick a spell: `[{"click":"[aria-label=\"Browse SRD\"]"},
{"fill":[".add-spell input","fireball"]},{"click":"text=Fireball"}]`.

## Finding a selector: `--snapshot`, don't guess

The single most common way these runs fail is a guessed selector — `text=` does
**substring** matching, so `text=Adv.` also hits "Disadv." and
`text="Create new character"` matches both the sidebar button and the picker
card (a strict-mode violation). Grepping the source for a component name doesn't
help either: the served bundle is minified.

Ask the page instead:

```bash
pnpm screenshot --fixture martial-fighter --open --snapshot-of "#detail" --snapshot
```

prints a YAML accessibility tree — every role and accessible name, i.e. exactly
what is clickable and what to call it. `--snapshot`/`--probe` runs skip the PNG
unless you also pass `--out`, so they're cheap questions rather than captures.
Steps run first, so you can snapshot _inside_ a modal you just opened.

## Layering questions: `--probe`, not a PNG

A screenshot can't tell you _why_ something is covered, and reasoning about it
from `index.css` is error-prone (a `z-index` on an unpositioned element is
inert; a parent can trap a child in its own stacking context). `--probe` asks
the browser:

```bash
pnpm screenshot --fixture martial-fighter --open --probe '#nav,.modal-content,#sidebar' \
  --steps '[{"click":"[aria-label=\"Level up this character\"]"},{"wait":800}]'
```

```
#nav
  box      1280x80 at 0,0
  styles   position: static; z-index: 2; …
  topmost  div.modal-background
```

`topmost` is the useful field: `self` means a click at the element's centre
reaches it, anything else names what's covering it. The line above is the whole
diagnosis of "the modal backdrop now covers the nav" — and `position: static`
next to `z-index: 2` says that z-index was never doing anything.

Playwright's click failures report the same fact from the other direction
(`<div id="sidebar-scrim"></div> intercepts pointer events`), which is worth
remembering when a step times out: it's usually a real overlay, not a flake.

## Gotcha: the sheet scrolls _inside_ `#detail`, so `--full` caps at the viewport

`#detail` is `overflow: auto; height: calc(100vh - 80px)` — the character sheet
scrolls within it, not the page body. So Playwright's full-page capture only
gets the `#detail` viewport, and lower sections (spellcasting, limited-use
abilities) are cut off no matter what.

To capture content below the fold, use a **tall `--viewport`** so the whole
sheet fits without `#detail` needing to scroll, e.g.
`--viewport 1400x2400`. (A bespoke `scrollIntoView` script works too, but inline
`.mjs` files with browser globals trip ESLint's `no-undef`/`prettier` — if you
must write one, keep it in the scratchpad, never in the repo, so `pnpm run ci`
stays clean.)
