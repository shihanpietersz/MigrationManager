# DrMigrate Azure Sync

> 🚀 Web application for managing Azure Migrate assessments and replications

## Overview

DrMigrate Azure Sync integrates with [Azure Migrate REST API](https://learn.microsoft.com/en-us/rest/api/migrate/), providing a streamlined interface for:

- **Dual Data Sources**: Import machines from external databases OR discover via Azure Migrate
- **Machine Comparison**: Compare and reconcile external inventory with Azure-discovered machines
- **Assessment Groups**: Create machine groups (e.g., 5 VMs for SAP application)
- **Assessments**: Run migration readiness assessments
- **Replication**: Use assessment groups as replication groups
- **Target Configuration**: Define VM specs, subnets, SKUs, and more
- **Flexible Deployment**: Run on Azure or on-premises VM

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 + TypeScript + Tailwind + shadcn/ui |
| Backend | Node.js + Fastify + TypeScript |
| State | TanStack Query + Zustand |
| Auth | Azure AD (MSAL.js) |
| Deployment | Azure Container Apps |

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture Plan](docs/ARCHITECTURE_PLAN.md) | Comprehensive system design |
| [Decision Rationale](docs/DECISION_RATIONALE.md) | Why we chose each technology |
| [Quick Start](docs/QUICK_START.md) | Step-by-step setup guide |

## Project Phases

### Phase 1: VMware Support (Current)
- Discovery integration
- Assessment group management
- Assessment execution
- Replication enablement

### Phase 2: Expansion (Planned)
- Physical server support
- Hyper-V support

## Quick Start

```bash
# Install dependencies
pnpm install

# Configure environment
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env

# Run development servers
pnpm turbo dev
```

## Azure Resources Required

1. **Azure Migrate Project** with VMware discovery
2. **Recovery Services Vault** for replication
3. **Azure AD App Registration** with permissions:
   - `Azure Service Management / user_impersonation`
   - `Microsoft Graph / User.Read`

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         DATA SOURCES                                  │
│  ┌─────────────────┐              ┌─────────────────┐                │
│  │  External DB    │              │  Azure Migrate  │                │
│  │  (CMDB, CSV)    │              │  (Discovery)    │                │
│  └────────┬────────┘              └────────┬────────┘                │
│           └──────────────┬─────────────────┘                         │
│                          ▼                                           │
│               ┌──────────────────┐                                   │
│               │ Unified Inventory│                                   │
│               └──────────────────┘                                   │
└──────────────────────────────────────────────────────────────────────┘
                           │
┌──────────────────┐       │       ┌──────────────────┐
│   Next.js Web    │───────┴──────▶│   Fastify API    │
│   (Frontend)     │               │   (Backend)      │
└──────────────────┘               └────────┬─────────┘
                                            │
              ┌─────────────────────────────┼─────────────────────┐
              ▼                             ▼                     ▼
     ┌──────────────┐            ┌──────────────┐        ┌──────────────┐
     │   Azure AD   │            │ Azure Migrate│        │   Site       │
     │   (Auth)     │            │   (Assess)   │        │   Recovery   │
     └──────────────┘            └──────────────┘        └──────────────┘
```

## Deployment Options

| Option | Best For |
|--------|----------|
| **VM (PM2)** | On-premises, air-gapped environments |
| **Docker Compose** | Consistent deployments, easy scaling |
| **Azure Container Apps** | Cloud-native, auto-scaling |

## License

Proprietary - DrMigrate

