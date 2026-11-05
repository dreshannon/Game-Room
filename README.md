# Game Rooms

Create a room, share the link, and play in real time. There are no accounts and nothing is saved.

Built with Vue, Vite, and Cloudflare Durable Objects, with one object per room holding its state in memory.

## Commands

- `npm run dev`: run the site and room server locally
- `npm test`: run the game rules tests
- `npm run typecheck`: check types
- `npm run deploy`: build and deploy (run `npx wrangler login` first)

## Adding a game

1. Add the rules in `src/games/<game>/logic.ts`, implementing the `Game` interface from `src/games/types.ts`.
2. Register it in `src/games/index.ts`.
3. Add a Vue component and register it in `src/client/games/index.ts`. It receives `view`, `you`, and `players` as props, and emits `move`.
