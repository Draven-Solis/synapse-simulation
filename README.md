# Synapse Simulation

Interactive neurological visualization platform showcasing synaptic transmission and neural signal propagation.

## Quick Start

```bash
# Install
pnpm install

# Setup environment
DATABASE_URL=postgresql://user:pass@localhost/synapse_sim

# Run
pnpm --filter @workspace/synapse-viz-app run dev  # UI (port 8081)
pnpm --filter @workspace/api-server run dev       # API (port 5000)

# Type check & build
pnpm run typecheck
pnpm run build
```

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS
- **Backend**: Express 5, Node.js 24, Pino logging
- **Database**: PostgreSQL + Drizzle ORM
- **Build**: pnpm workspaces, esbuild

## Project Structure

```
artifacts/        # Apps (api-server, synapse-viz-app)
lib/             # Shared libraries (api-client, db, schemas)
scripts/         # Utility scripts
```

## Key Commands

| Command | Purpose |
|---------|---------|
| `pnpm run typecheck` | Full type check |
| `pnpm run build` | Build all packages |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate API types from OpenAPI |
| `pnpm --filter @workspace/db run push` | Push database migrations |

## Environment Variables

```
DATABASE_URL=postgresql://user:password@localhost:5432/synapse_sim
NODE_ENV=development
```

## Architecture

- **Monorepo**: pnpm workspaces for modular code organization
- **Animation**: RequestAnimationFrame + custom wave particle system
- **API**: Express + Zod validation + OpenAPI codegen
- **State**: React Query for server state

## Ports

- API: 5000
- Visualizer: 8081

## License

MIT
