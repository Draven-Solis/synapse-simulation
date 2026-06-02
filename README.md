# Synapse Simulation

An interactive neurological simulation and visualization platform that demonstrates synaptic processes and neural signal transmission through dynamic, real-time animations and educational visualizations.

## Overview

Synapse Simulation is a comprehensive, full-stack application that visualizes complex neurobiology concepts through interactive 3D/2D graphics and animations. Built with a modern TypeScript monorepo architecture, it combines a React-based frontend visualization engine with a robust Node.js backend API.

## Key Features

- **Interactive Synapse Visualization**: Real-time animation of synaptic transmission including action potentials, ion waves, and neural signal propagation
- **Multi-Stage Animation System**: Sequential visualization of neurological processes with playback controls
- **Responsive Web Interface**: Built with React 19 and Tailwind CSS for seamless cross-device experiences
- **Type-Safe API**: Express.js backend with Zod validation and TypeScript for robust data handling
- **Database Integration**: PostgreSQL + Drizzle ORM for persistent data management
- **Workspace Architecture**: pnpm monorepo for efficient code organization and dependency management

## Tech Stack

### Frontend
- **Framework**: React 19 with TypeScript 5.9
- **Build Tool**: Vite with optimized esbuild
- **Styling**: Tailwind CSS 4.3 with custom theme
- **Animation**: Framer Motion + custom Canvas/SVG animations
- **UI Components**: Radix UI component library
- **Routing**: Wouter
- **State Management**: React Query (TanStack)
- **Form Validation**: React Hook Form + Zod

### Backend
- **Runtime**: Node.js 24
- **Framework**: Express 5
- **Logging**: Pino (structured logging)
- **Database ORM**: Drizzle ORM 0.45+
- **Validation**: Zod schema validation
- **Package Manager**: pnpm workspaces

### Database
- **Primary DB**: PostgreSQL
- **Schema Management**: Drizzle ORM with migrations

### Development Tools
- **Language**: TypeScript 5.9
- **Formatting**: Prettier
- **Build**: esbuild with source maps
- **API Codegen**: Orval (from OpenAPI spec)

## Project Structure

```
synapse-simulation/
├── artifacts/                    # Compiled applications
│   ├── api-server/              # Express.js API backend
│   ├── synapse-viz-app/         # Main Synapse Visualizer UI
│   ├── mockup-sandbox/          # Component development sandbox
│   └── ...                      # Additional artifact apps
├── lib/                         # Shared libraries
│   ├── api-client-react/        # React API client
│   ├── api-zod/                 # Zod schemas + validation
│   ├── db/                      # Database layer
│   └── ...                      # Additional shared code
├── scripts/                     # Build & utility scripts
├── pnpm-workspace.yaml         # Workspace configuration
├── tsconfig.base.json          # TypeScript base config
└── package.json                # Root package config
```

## Getting Started

### Prerequisites
- Node.js 24+
- pnpm (enforced via preinstall hook)
- PostgreSQL (for database operations)

### Installation

```bash
# Install dependencies (pnpm enforced)
pnpm install

# Set up environment variables
cp .env.example .env
# Update DATABASE_URL in .env with your PostgreSQL connection string
```

### Development

```bash
# Full type checking across all packages
pnpm run typecheck

# Build all packages
pnpm run build

# Run the API server (port 5000)
pnpm --filter @workspace/api-server run dev

# Run the Synapse Visualizer UI (port 8081)
pnpm --filter @workspace/synapse-viz-app run dev

# Regenerate API client from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen

# Push database schema changes
pnpm --filter @workspace/db run push
```

### Production Build

```bash
# Build all packages
pnpm run build

# API Server is bundled as ESM module in dist/
pnpm --filter @workspace/api-server run start

# Visualizer is built as static SPA in dist/
pnpm --filter @workspace/synapse-viz-app run serve
```

## Architecture Decisions

### Monorepo Structure
Using pnpm workspaces enables:
- Shared code through workspace dependencies
- Unified dependency management via catalog versioning
- Efficient builds and type checking across packages
- Clear separation of concerns while maintaining code reuse

### Animation Engine
The synapse visualization uses:
- **RequestAnimationFrame** for smooth 60fps animations
- **Custom wave particle system** for ion propagation effects
- **Easing functions** for natural motion transitions
- **Canvas/SVG rendering** for performance and visual fidelity

### API Layer
- **Express.js** provides lightweight, flexible server framework
- **Zod schemas** ensure runtime validation and type safety
- **Drizzle ORM** offers type-safe database queries with migrations
- **Pino logging** enables structured, performant logging

### Frontend Architecture
- **React Query** manages server state and caching efficiently
- **Radix UI** provides accessible, unstyled components
- **Tailwind CSS** offers utility-first styling with dark mode support
- **Vite** ensures fast HMR and optimized production builds

## API & Validation

The project uses a code-generation approach:
1. **OpenAPI Spec** as source of truth for API contracts
2. **Orval** generates TypeScript React hooks from spec
3. **Zod schemas** auto-generated for runtime validation
4. Run `pnpm --filter @workspace/api-spec run codegen` after spec updates

## Database

Schema management via Drizzle:
```bash
# Create/edit tables in lib/db/schema/
# Then push changes:
pnpm --filter @workspace/db run push

# Generate migrations for production
pnpm --filter @workspace/db run generate
```

## Performance Considerations

- **Lazy code splitting** for faster initial page load
- **Source maps** enabled in production for debugging
- **esbuild bundling** for optimized API server size
- **CSS-in-JS** with Tailwind for minimal CSS payload
- **Wave particle animations** throttled and memoized

## Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:password@localhost:5432/synapse_sim

# Optional
NODE_ENV=development|production
LOG_LEVEL=info|debug|error
API_PORT=5000
```

## Contributing

1. Ensure all changes pass type checking: `pnpm run typecheck`
2. Build locally before committing: `pnpm run build`
3. Follow existing code style (Prettier formatting enforced)
4. Update API spec if adding/modifying endpoints
5. Run `pnpm --filter @workspace/api-spec run codegen` to regenerate types

## Troubleshooting

### "Use pnpm instead" error
The project enforces pnpm via the preinstall hook. Install pnpm:
```bash
npm install -g pnpm
```

### Port conflicts
Configured ports can be modified in `.replit` and individual package configs:
- API: 5000 (internal) → 5000 (external)
- Visualizer: 8081 (internal) → 80 (external)
- Additional dev ports: 5173, 5174, 8080, 8082, 19295, 19296, 19297

### Database connection issues
1. Verify PostgreSQL is running
2. Check `DATABASE_URL` format: `postgresql://user:password@host:port/database`
3. Ensure database exists: `createdb synapse_sim`
4. Run migrations: `pnpm --filter @workspace/db run push`

## Deployment

The project is configured for **Replit deployment** with autoscaling. See `.replit` for deployment configuration.

Standard Node.js deployment:
1. Build: `pnpm run build`
2. Install prod deps: `pnpm install --prod`
3. Start API: `node artifacts/api-server/dist/index.mjs`
4. Serve visualizer: `pnpm --filter @workspace/synapse-viz-app run serve`

## License

MIT

## Contact & Support

For issues, feature requests, or contributions, please open an issue on GitHub.

---

**Built with TypeScript | Powered by Replit**
