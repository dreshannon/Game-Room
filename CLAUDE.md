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
- Confirm a new game's rules with me before building it (see "Adding a new game").
- Ask before every commit and push. Commit to `main`.
- Theme: colors come from tokens in `src/client/style.css`. Dark mode uses
  `:root[data-theme='dark']`, not `prefers-color-scheme` media queries.
- Settings saved in localStorage are wrapped in try/catch.
- Animations are skipped for reduced motion and hidden tabs (`src/client/motion.ts`).
- Everything has to work at phone width (375px) with no sideways scrolling.
- Player-facing text is plain and short.

## Adding a new game

When I ask for a game "like X" or "based on X", follow these steps in order.

1. **Look up the rules.** Search the web for X's official rules or a reliable rules summary and
   read them in full, including setup, turn structure, scoring, edge cases and end of game.
   If a detail is unclear or sources disagree, say so; don't guess.
2. **Write up the mechanics in our own words.** Keep the mechanics (how turns, scoring and
   information work). Don't copy rule text, flavour text, card or piece names, special terms,
   art, colours, layout or anything else that makes X recognisable.
3. **Make it ours:**
   - A new name. Check it isn't the name of an existing game.
   - A new theme, and new names for every special term (cards, pieces, actions, zones).
   - Our own art and look, built from the site's design tokens.
   - Changes that make it better online: no physical upkeep, fewer waiting players,
     secret information kept on the server, a sensible number of players.
4. **Check with me before building.** Send one short proposal: the name, the theme, the rules
   as we'll play them (a numbered turn sequence), player count, lobby options, how it differs
   from X, and any open questions. Wait for my OK.
5. **Build it:**
   - `src/games/<id>/logic.ts` implementing `Game`, with `MoveError` messages written for players.
     Hide secret information in `viewFor`.
   - `logic.test.ts` covering setup, every move type, illegal moves, scoring, the end of the
     game, a player leaving, and walk-ins if the game allows them.
   - The client component and a rules page in `src/client/games/rules/`, written in our own words.
   - Register the game in `src/games/index.ts` and `src/client/games/index.ts`.
6. **Check it:** typecheck, tests and build, then a full game in the browser with the smallest
   and a larger player count, in light and dark mode and at phone width.

Never mention X by name in code, rules text or anything players see.

## Checking changes
Test in the browser preview with two or three players, each in its own tab (sessionStorage keeps
them apart). `POST /api/rooms` makes a room. Restarting the worker closes open rooms.
