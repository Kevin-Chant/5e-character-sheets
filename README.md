# 5e Character Sheets

Online D&D 5e character sheets that run in your browser. Sheets are stored
**client-side** — either in your browser for offline/local use, or in your own
Google Drive for cross-device sync — and an optional lightweight "live-edit"
server lets a player share a sheet so others can watch and edit it in real time
(handy for a DM following along during a session).

There is no central database and no account system: your character data only
ever lives in your browser, your Google Drive, or a peer's live session. That
keeps the project cheap to host and easy to self-host for the privacy-conscious.

## Architecture

| Piece                                                     | What it is                                                                                                                                                                                          |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Web app** (`src/`)                                      | React 18 + TypeScript single-page app (Vite), React Router, state via React Context + reducers.                                                                                                     |
| **Storage backends** (`src/datastores/`)                  | Pluggable `Datastore` implementations: `local-datastore` (browser `localStorage`), `google-drive-datastore` (Drive `appDataFolder`), and `remote-datastore` (a peer's live session).                |
| **Live-edit sidecar** (`server/`)                         | A small Node WAMP router ([nightlife-rabbit](https://github.com/christian-raedel/nightlife-rabbit)) that brokers real-time sessions over WebSockets. It is stateless — it stores no character data. |
| **Character model** (`src/lib/types.ts`, `src/lib/data/`) | The `Character` type, 5e data definitions, and a small formula engine for computed fields (AC, HP, attacks, etc.). A JSON schema is generated from the types for import validation.                 |

## Getting started

Requirements: Node 22+ and [pnpm](https://pnpm.io) (the repo pins a version via
`packageManager`).

```bash
pnpm install
cp .env.example .env.local   # optional; sensible defaults are built in
```

Run the web app and the live-edit server (two processes):

```bash
pnpm dev       # Vite dev server on http://localhost:3000
pnpm server    # live-edit sidecar on http://localhost:9000
```

The live-edit server is only needed for real-time sharing; local and Google
Drive storage work without it.

## Configuration

All configuration is optional — the app ships with working defaults. To point a
self-hosted deployment at your own Google Cloud app or live-edit server, set the
variables in `.env.local` (see [.env.example](.env.example)):

| Variable                                        | Purpose                                                                                                                     |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `VITE_GOOGLE_CLIENT_ID` / `VITE_GOOGLE_API_KEY` | Your Google OAuth client + API key (Drive `appdata` scope). These are shipped to the browser by design and are not secrets. |
| `VITE_LIVE_EDIT_HOST`                           | Default live-edit server URL the app connects to (also overridable per-device in the in-app settings).                      |
| `PORT`                                          | Port the live-edit sidecar (`pnpm server`) listens on. Defaults to `9000`.                                                  |

## Scripts

| Command                      | Description                                                             |
| ---------------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`                   | Start the Vite dev server.                                              |
| `pnpm server`                | Start the live-edit sidecar server.                                     |
| `pnpm build`                 | Generate the schema, type-check, and build for production into `dist/`. |
| `pnpm preview`               | Preview the production build locally.                                   |
| `pnpm test`                  | Run the Vitest unit tests.                                              |
| `pnpm type-check`            | Type-check with `tsc`.                                                  |
| `pnpm lint` / `pnpm lint:ci` | Lint (auto-fix locally / check-only in CI).                             |
| `pnpm pretty`                | Format with Prettier.                                                   |
| `pnpm run ci`                | Lint, type-check, and test — what CI runs.                              |

A husky pre-commit hook runs `lint-staged` (ESLint + Prettier on staged files),
and GitHub Actions runs `pnpm run ci` on pushes and pull requests.

## License

[MIT](LICENSE)
