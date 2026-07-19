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

| Flag               | Purpose                                                             |
| ------------------ | ------------------------------------------------------------------- |
| `--fixture <name>` | Seed `src/lib/fixtures/<name>.json` into localStorage (local store) |
| `--open`           | After seeding, click the character to open its sheet                |
| `--route <path>`   | Route to visit (default `/`)                                        |
| `--out <file>`     | Output PNG path — point this at the scratchpad                      |
| `--viewport WxH`   | Viewport size (default `1280x900`)                                  |
| `--no-full`        | Capture only the viewport instead of the full scroll height         |
| `--base <url>`     | Dev server URL (default `http://localhost:3000`)                    |
| `--seed <int>`     | Make `Math.random` deterministic — reproducible dice rolls          |
| `--steps <json>`   | Array of interaction steps run in order before capture (see below)  |
| `--steps-file <p>` | Same as `--steps`, read from a JSON file                            |

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

A failing step reports its index and selector, so flows are debuggable. Prefer
stable selectors — `aria-label` (buttons carry them, e.g. `Roll Greatsword`,
`Edit spell`) and component classes (`.roll-go`, `.roll-modal`) — over brittle
text. Pair with **`--no-full`** (modals are viewport-fixed, so full-page capture
misplaces them) and **`--seed`** for reproducible dice.

Example — open the damage roll dialog for an attack and roll it:

```bash
pnpm screenshot --fixture martial-fighter --open --no-full --seed 7 \
  --viewport 900x760 --out "$SCRATCHPAD/roll.png" \
  --steps '[{"click":"[aria-label=\"Roll Greatsword\"]"},{"click":".roll-go"},{"wait":300}]'
```

Multi-step flows compose naturally — e.g. enter edit mode, open the SRD picker,
search, and pick a spell: `[{"click":"[aria-label=\"Browse SRD\"]"},
{"fill":[".add-spell input","fireball"]},{"click":"text=Fireball"}]`.

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
