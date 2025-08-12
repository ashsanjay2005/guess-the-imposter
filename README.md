## Guess the Imposter – Monorepo

A 4‑player social deduction party game built as a pnpm workspace monorepo.

### Quick start

1) Install dependencies

```bash
pnpm i
```

2) Run dev servers (client + server)

```bash
pnpm dev
```

- Server: `http://localhost:4000`
- Client: `http://localhost:5173`

Open two browser windows (or more). Create a room in one, join the same room in the other, and use multiple tabs to reach 4 players. Play through a full round. The app supports reconnects and host transfer.

### Tech
- **Server**: Node 20+, TypeScript, Express, Socket.IO, Zod. In‑memory store with clean interfaces to replace with Redis later.
- **Client**: Vite + React + TypeScript + TailwindCSS. Socket reconnect handling.
- **Tooling**: pnpm workspaces, ESLint, Prettier.
- **Tests**: server state machine unit tests and a minimal socket integration test.

### Scripts
- `pnpm dev` – run both client and server
- `pnpm -r test` – run all tests
- `pnpm -r lint` – run linters

### Structure
```
packages/
  client/  (Vite React app)
  server/  (Express + Socket.IO)
```

### Notes
- Minimum 4 players to start; spectators can join after. Host can manage timers and the question bank (CRUD with JSON import/export) from the room sidebar.


