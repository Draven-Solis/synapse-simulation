# 🧠 Synapse Simulation

A visual tool that shows how nerves communicate with each other through animated synapses (connections between neurons).

## What Does It Do?

Watch neurons fire and signals travel across synapses in real-time. Perfect for learning how the brain works visually.

## Getting Started (Super Easy)

```bash
# Install everything
pnpm install

# Set up your database connection
DATABASE_URL=postgresql://user:pass@localhost/synapse_sim

# Start the visualizer (open in browser at localhost:8081)
pnpm --filter @workspace/synapse-viz-app run dev

# Start the backend (runs at localhost:5000)
pnpm --filter @workspace/api-server run dev
```

## What You'll See

- 🎨 **Beautiful Animations** - Watch synapses light up with ion waves
- ⚡ **Real-time Signals** - See neural signals propagate through networks
- 🎮 **Interactive Controls** - Play, pause, and speed up animations

## Built With

| Part | Technology |
|------|-----------|
| **What You See** | React (JavaScript framework) |
| **The Brains** | Express.js (backend server) |
| **Data Storage** | PostgreSQL (database) |
| **Code Language** | TypeScript (safer JavaScript) |

## Main Commands

```bash
pnpm run build          # Build everything
pnpm run typecheck      # Check for code errors
```

## How It's Organized

```
📁 synapse-simulation
  📂 artifacts/        ← The actual apps (UI & backend)
  📂 lib/             ← Shared code libraries
  📂 scripts/         ← Helper scripts
```

## Where to Access

- **Visualizer** → http://localhost:8081
- **API** → http://localhost:5000

## Need Help?

Make sure:
- ✅ PostgreSQL is running
- ✅ You set `DATABASE_URL` in your environment
- ✅ You're using `pnpm` (not npm or yarn)

## License

MIT - Free to use!
