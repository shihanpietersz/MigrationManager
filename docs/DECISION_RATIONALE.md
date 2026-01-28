# Technology Decision Rationale

## The Core Question: What Are We Building?

You're building a **REST API orchestration layer** that:
1. Wraps Azure Migrate & Site Recovery APIs
2. Adds business logic (assessment → replication group mapping)
3. Provides a better UX than the Azure Portal

This is fundamentally a **CRUD + Orchestration** app, NOT:
- A compute-intensive workload (no need for Rust)
- A real-time streaming system (no need for WebSockets)
- A highly transactional system (no need for complex DB)

---

## Frontend Decision: Next.js 14+ (App Router)

### Why Next.js?

| Factor | Benefit |
|--------|---------|
| **Server Components** | Fetch Azure data on server, reduce client JS bundle |
| **Built-in Routing** | File-based routing, less boilerplate |
| **API Routes** | Acts as BFF, can proxy requests with added logic |
| **Streaming** | Suspense boundaries for progressive loading |
| **Deployment** | Works on Azure Static Web Apps, Vercel, or self-hosted |

### Why NOT Plain React + Vite?

```
React + Vite:
✅ Simpler initial setup
✅ Smaller learning curve
❌ Need to add routing (React Router)
❌ Need to handle SSR manually (or go CSR-only)
❌ Need to build API proxy layer separately
❌ Need to configure build optimizations manually
```

**Verdict:** The added complexity of Next.js is **justified** because:
1. Dashboard apps benefit from SSR (faster initial load)
2. Built-in API routes reduce the need for a separate BFF
3. The App Router's layout system is perfect for dashboards

### Why NOT Angular?

- Heavier framework, steeper learning curve
- Less ecosystem momentum in 2024
- React/Next.js has better Azure/Microsoft community support

### Why NOT Vue/Nuxt?

- Valid alternative, but smaller talent pool
- React dominates enterprise dashboards
- Azure's own samples favor React

---

## Backend Decision: Node.js + Fastify

### Why Node.js over Rust?

| Factor | Node.js | Rust |
|--------|---------|------|
| **Azure SDK** | First-class support | Community packages only |
| **Development Speed** | Fast (same language as frontend) | Slower (steeper learning curve) |
| **Hiring** | Large talent pool | Niche talent |
| **Performance Need** | Sufficient (I/O bound) | Overkill (not CPU bound) |
| **Hot Reload** | Fast iteration | Compile times |

**The key insight:** Your backend is primarily:
- Making HTTP calls to Azure
- Transforming JSON responses
- Adding business logic

This is **I/O bound**, not CPU bound. Node.js excels at I/O-bound work.

### Why Fastify over Express?

```typescript
// Express: ~15,000 req/sec
const express = require('express');
const app = express();

// Fastify: ~45,000 req/sec (3x faster)
const fastify = require('fastify')();
```

**Fastify advantages:**
1. **3x faster** JSON serialization (critical for Azure API responses)
2. **Built-in schema validation** (validates Azure payloads before sending)
3. **Better TypeScript support** (native, not bolted on)
4. **Plugin architecture** (cleaner code organization)

### Why NOT .NET/C#?

- **Valid if** your team has C# expertise
- Azure SDK is excellent in both Node and .NET
- **Choose .NET if:**
  - DrMigrate core is already in .NET
  - Team is primarily .NET developers
  - You need AOT compilation for serverless cold starts

### Why NOT Python/FastAPI?

- Great framework, but:
  - Less natural for full-stack TypeScript
  - Azure SDK for Python is good but Node's is better documented
  - Type safety requires extra tooling (Pydantic)

---

## Database Decision: Start Light

### Why SQLite → PostgreSQL?

You DON'T need a database for core functionality:
- Assessment groups → stored in Azure
- Replication status → stored in Azure Site Recovery
- Machine inventory → stored in Azure Migrate

You only need local storage for:
- User preferences
- Audit logs
- Cached API responses

**Recommendation:**
```
Phase 1: SQLite (zero setup, good enough for single-instance)
Phase 2: PostgreSQL (if multi-instance or heavy querying needed)
```

**Why NOT MongoDB?**
- Your data is relational (users → groups → machines)
- Prisma ORM works great with SQLite/PostgreSQL
- MongoDB adds operational complexity with less benefit here

---

## Architecture Decision: Monorepo

### Why Turborepo?

```
Benefits:
✅ Shared TypeScript types (no type drift)
✅ Single CI/CD pipeline
✅ Atomic commits (frontend + backend together)
✅ Shared Azure Migrate SDK package
✅ Consistent tooling (ESLint, Prettier)
```

### Why NOT Nx?

- Nx is powerful but heavier
- Turborepo is simpler, faster builds
- Better for smaller teams (1-5 developers)

### Why NOT Separate Repos?

- **Type drift:** Frontend and backend types diverge
- **Deployment complexity:** Coordinating releases across repos
- **Development friction:** Switching between repos constantly

---

## UI Decision: shadcn/ui + Tailwind

### Why NOT Material UI?

```
Material UI:
✅ More components out of the box
❌ Larger bundle size (~300KB)
❌ Opinionated styling (hard to customize)
❌ Theming is complex
```

### Why shadcn/ui?

```
shadcn/ui:
✅ Copy-paste components (you own the code)
✅ Highly customizable
✅ Tailwind-based (consistent with modern practices)
✅ Accessible by default (Radix primitives)
✅ Smaller bundle (only include what you use)
```

**Perfect for:**
- Enterprise dashboards needing custom branding
- Teams that want control over component behavior
- Projects using Tailwind CSS

---

## State Management: TanStack Query + Zustand

### Why NOT Redux?

Redux is overkill for this app:
- Most state is **server state** (Azure data)
- TanStack Query handles server state better
- Less boilerplate, better caching

### The Split:

| State Type | Tool | Example |
|------------|------|---------|
| Server state | TanStack Query | Machine list, assessments, replication status |
| Client state | Zustand | UI preferences, wizard step, selected items |

---

## Deployment Decision: Azure Container Apps

### Why NOT Azure Kubernetes Service (AKS)?

- AKS is overkill for 2-3 containers
- Higher operational complexity
- More expensive

### Why NOT Azure App Service?

- Valid alternative for simpler deployments
- Container Apps offers better scaling defaults
- Native container support without Kubernetes complexity

### Why Container Apps?

```
✅ Right-sized for microservices (not full K8s)
✅ Scale to zero (cost savings)
✅ Built-in ingress and load balancing
✅ Easy secrets management
✅ Dapr integration if needed later
```

---

## Summary Decision Matrix

| Decision | Recommendation | Confidence |
|----------|----------------|------------|
| Frontend Framework | Next.js 14 | ⭐⭐⭐⭐⭐ High |
| UI Library | shadcn/ui + Tailwind | ⭐⭐⭐⭐ High |
| Backend Runtime | Node.js | ⭐⭐⭐⭐⭐ High |
| Backend Framework | Fastify | ⭐⭐⭐⭐ High |
| Database | SQLite → PostgreSQL | ⭐⭐⭐⭐ High |
| Monorepo Tool | Turborepo | ⭐⭐⭐⭐ High |
| Deployment | Azure Container Apps | ⭐⭐⭐ Medium |

---

## When to Revisit

**Reconsider .NET if:**
- DrMigrate core is in .NET and team prefers it
- You need AOT compilation for Azure Functions

**Reconsider Rust if:**
- You add compute-heavy features (large data processing)
- Cold start times become critical

**Reconsider separate repos if:**
- Team grows beyond 10+ developers
- Different release cadences needed
- Separate teams own frontend vs backend

