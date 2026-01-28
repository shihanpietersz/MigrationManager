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
| [Developer Setup](docs/DEVELOPER_SETUP.md) | **Start here** - Developer environment setup |
| [Architecture Plan](docs/ARCHITECTURE_PLAN.md) | Comprehensive system design |
| [Architecture Current](docs/ARCHITECTURE_CURRENT.md) | Current implementation details |
| [Decision Rationale](docs/DECISION_RATIONALE.md) | Why we chose each technology |
| [Lift & Cleanse Design](docs/lift-and-cleanse-design.md) | Post-migration module design |
| [Security Plan](docs/SECURITY_PLAN.md) | Security architecture |

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

### Prerequisites

- Node.js 20+ LTS
- pnpm 8+ (`npm install -g pnpm`)

### Setup (One Command)

```bash
# Clone and setup
git clone <repository-url>
cd drmigrate-azsync
pnpm setup
```

This automatically:
- Installs all dependencies
- Creates environment files from examples
- Generates Prisma client
- Creates the SQLite database

### Run Development Servers

```bash
pnpm dev
```

Access the app at:
- **Frontend**: http://localhost:3000
- **API**: http://localhost:4000
- **API Docs**: http://localhost:4000/docs

> For detailed setup instructions, see [Developer Setup Guide](docs/DEVELOPER_SETUP.md)

## Local Assets (Air-Gapped Support)

This application is designed to work in **air-gapped environments** with zero external network requests. All assets are stored locally.

### Asset Location

All static assets are stored in `apps/web/public/assets/`:

```
apps/web/public/assets/
├── fonts/          # Local font files (woff2)
├── images/         # Logo, favicons, illustrations
├── icons/          # Custom SVG icons
└── README.md       # Detailed asset documentation
```

### Adding Fonts

1. Download `.woff2` font files (best format for web)
2. Place in `apps/web/public/assets/fonts/`
3. Update `apps/web/src/app/layout.tsx`:

```tsx
import localFont from 'next/font/local';

const myFont = localFont({
  src: [
    { path: '../../public/assets/fonts/MyFont-Regular.woff2', weight: '400' },
    { path: '../../public/assets/fonts/MyFont-Bold.woff2', weight: '700' },
  ],
  variable: '--font-my-font',
});
```

### Adding Images/Logos

1. Place the image in `apps/web/public/assets/images/`
2. Reference using the public path:

```tsx
import Image from 'next/image';

<Image src="/assets/images/my-logo.svg" alt="Logo" width={130} height={32} />
```

### Icons

**Primary:** Use [lucide-react](https://lucide.dev/) icons (bundled via npm, no external requests):

```tsx
import { Server, Database, Settings } from 'lucide-react';

<Server className="h-5 w-5 text-primary" />
```

**Custom:** For icons not in lucide-react, add SVGs to `assets/icons/`

> See `apps/web/public/assets/README.md` for complete asset documentation

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

