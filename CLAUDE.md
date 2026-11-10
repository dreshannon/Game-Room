# Game Rooms

Multiplayer party games in the browser. Vue 3 + Vite client, Cloudflare Workers + Durable Objects
(partyserver) for rooms. Deploys from GitHub `main` to Cloudflare.

## Commands
- `npm run dev` – dev server (the preview uses port 5175, see .claude/launch.json)
- `npm run typecheck` – vue-tsc for the client, tsc for the worker
- `npm test` – vitest
- `npm run build`

Run all three checks before saying work is done.

## How it fits together
- `src/games/<game>/logic.ts` – pure, server-authoritative rules: `Game<State, View>` from `src/games/types.ts`.
  `applyMove` validates everything (moves come straight from the client) and throws `MoveError`
  with a player-facing message. `viewFor` hides secret state per viewer.
- Register a game in `src/games/index.ts`, and its component and rules in `src/client/games/index.ts`.
- `src/worker/room.ts` – one Durable Object per room: players, host, lobby, colors, walk-ins, ticks.
  All state is in memory, so deploying ends games in progress.
- `src/shared/protocol.ts` – client/server messages.
- Optional game hooks: `playerColors`/`recolor`, `onPlayerJoin` (walk-ins), `onPlayerLeave`,
  `tickDelay`/`tick`, `seats`, `teams`.

## Conventions
- Games, names and art are our own. Don't recreate an existing game's name, art or look.
- Confirm a new game's rules with me before building it.
- Ask before every commit and push. Commit to `main`.
- Theme: colors come from tokens in `src/client/style.css`. Dark mode uses
  `:root[data-theme='dark']`, not `prefers-color-scheme` media queries.
- Settings saved in localStorage are wrapped in try/catch.
- Animations are skipped for reduced motion and hidden tabs (`src/client/motion.ts`).
- Everything has to work at phone width (375px) with no sideways scrolling.
- Player-facing text is plain and short.

## Checking changes
Test in the browser preview with two or three players, each in its own tab (sessionStorage keeps
them apart). `POST /api/rooms` makes a room. Restarting the worker closes open rooms.
