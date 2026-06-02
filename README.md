# 🧠 Synapse Simulation

Visual exploration of how neurons communicate through animated synapses.

---

## ✨ Live Demo

### [→ Open Visualizer](https://synaptic-mapper.netlify.app/)

---

## 🎯 What It Does

- 🎨 Watch neurons fire in real-time
- ⚡ Visualize synaptic signal transmission
- 🎮 Interactive animation controls

---

## 🚀 Quick Start

```bash
pnpm install
pnpm --filter @workspace/synapse-viz-app run dev
```

**Environment Setup:**
```
DATABASE_URL=postgresql://user:pass@localhost/synapse_sim
```

---

## 🛠️ Tech Stack

```
Frontend  → React 19 + Vite
Backend   → Express.js + Node 24
Database  → PostgreSQL + Drizzle ORM
Language  → TypeScript
```

---

## 📁 Structure

```
artifacts/    Apps (UI & Backend)
lib/          Shared Libraries
scripts/      Utilities
```

---

## 💻 Commands

| Command | Purpose |
|---------|---------|
| `pnpm run build` | Build everything |
| `pnpm run typecheck` | Check for errors |

---

## ⚙️ For Developers

```bash
# Start visualizer
pnpm --filter @workspace/synapse-viz-app run dev

# Start backend API
pnpm --filter @workspace/api-server run dev
```

---

## 📝 License

MIT
