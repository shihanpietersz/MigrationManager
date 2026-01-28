# Quick Start Guide

## Prerequisites

- Node.js 20+ (LTS recommended)
- pnpm 8+ (`npm install -g pnpm`)
- Azure subscription with:
  - Azure Migrate project set up
  - VMware discovery configured
  - Recovery Services vault (for replication)
- Azure AD app registration

---

## Step 1: Initialize the Monorepo

```bash
# Create project structure
mkdir drmigrate-azsync && cd drmigrate-azsync

# Initialize pnpm workspace
pnpm init

# Install Turborepo
pnpm add -D turbo

# Create workspace configuration
```

**pnpm-workspace.yaml:**
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**turbo.json:**
```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "type-check": {
      "dependsOn": ["^build"]
    }
  }
}
```

---

## Step 2: Create Next.js Frontend

```bash
# Create apps directory
mkdir -p apps/web

# Initialize Next.js with TypeScript
cd apps/web
pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

# Add shadcn/ui
pnpm dlx shadcn-ui@latest init

# Add key dependencies
pnpm add @tanstack/react-query @azure/msal-browser @azure/msal-react zustand
pnpm add -D @types/node
```

---

## Step 3: Create Fastify Backend

```bash
# Create API app
mkdir -p apps/api/src
cd apps/api

# Initialize package.json
pnpm init
```

**apps/api/package.json:**
```json
{
  "name": "@drmigrate/api",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "type-check": "tsc --noEmit"
  }
}
```

```bash
# Install dependencies
pnpm add fastify @fastify/cors @fastify/helmet @azure/identity @azure/arm-migrate
pnpm add -D typescript tsx @types/node
```

**apps/api/src/index.ts:**
```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';

const server = Fastify({ logger: true });

await server.register(cors, {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
});

// Health check
server.get('/health', async () => ({ status: 'ok' }));

// Start server
try {
  await server.listen({ port: 4000, host: '0.0.0.0' });
  console.log('Server running on http://localhost:4000');
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
```

---

## Step 4: Create Shared Packages

### Shared Types

```bash
mkdir -p packages/shared-types/src
cd packages/shared-types
pnpm init
```

**packages/shared-types/package.json:**
```json
{
  "name": "@drmigrate/shared-types",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc"
  }
}
```

**packages/shared-types/src/index.ts:**
```typescript
// ============================================
// DATA SOURCE TYPES
// ============================================

export type DataSourceType = 'azure-migrate' | 'database' | 'csv' | 'api';

export interface DataSourceConfig {
  id: string;
  name: string;
  type: DataSourceType;
  connectionString?: string;  // For database sources
  apiEndpoint?: string;       // For API sources
  lastSyncAt?: string;
  status: 'connected' | 'disconnected' | 'error';
  createdAt: string;
}

export interface ImportJob {
  id: string;
  sourceId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalRecords: number;
  processedRecords: number;
  errors: string[];
  startedAt: string;
  completedAt?: string;
}

// ============================================
// MACHINE TYPES
// ============================================

// Base machine interface (unified view)
export interface Machine {
  id: string;
  displayName: string;
  operatingSystem: string;
  ipAddresses: string[];
  cpuCores?: number;
  memoryMB?: number;
  diskCount?: number;
  diskSizeGB?: number;
  powerState?: 'On' | 'Off' | 'Unknown';
  source: 'azure' | 'external' | 'both';
  sourceIds: {
    azure?: string;
    external?: string;
  };
  lastUpdated: string;
}

// Azure-discovered machine (full details)
export interface DiscoveredMachine extends Machine {
  azureMigrateId: string;
  siteId: string;
  vCenterName?: string;
  hostName?: string;
}

// External machine (imported)
export interface ExternalMachine {
  id: string;
  sourceId: string;
  hostname: string;
  ipAddresses: string[];
  operatingSystem?: string;
  cpuCores?: number;
  memoryMB?: number;
  diskSizeGB?: number;
  tags?: Record<string, string>;
  rawData?: Record<string, unknown>;
  importedAt: string;
}

// Comparison result
export interface MachineComparison {
  id: string;
  createdAt: string;
  matched: MatchedMachine[];
  azureOnly: DiscoveredMachine[];
  externalOnly: ExternalMachine[];
}

export interface MatchedMachine {
  azureMachine: DiscoveredMachine;
  externalMachine: ExternalMachine;
  matchConfidence: number; // 0-100
  discrepancies: Discrepancy[];
}

export interface Discrepancy {
  field: string;
  azureValue: unknown;
  externalValue: unknown;
}

// ============================================
// ASSESSMENT GROUP TYPES
// ============================================

export interface AssessmentGroup {
  id: string;
  name: string;
  description?: string;
  machineCount: number;
  machines: string[];  // Machine IDs
  createdAt: string;
  updatedAt: string;
}

// ============================================
// ASSESSMENT TYPES
// ============================================

export interface Assessment {
  id: string;
  groupId: string;
  name: string;
  status: 'Created' | 'Running' | 'Completed' | 'Failed';
  azureLocation: string;
  createdAt: string;
  completedAt?: string;
}

export interface AssessmentResult {
  machineId: string;
  machineName: string;
  readiness: 'Ready' | 'ReadyWithConditions' | 'NotReady' | 'Unknown';
  monthlyCostEstimate: number;
  recommendedSize: string;
  issues: AssessmentIssue[];
}

export interface AssessmentIssue {
  severity: 'Error' | 'Warning' | 'Info';
  message: string;
  recommendation?: string;
}

// ============================================
// REPLICATION TYPES
// ============================================

export interface ReplicationConfig {
  targetResourceGroup: string;
  targetVnetId: string;
  targetSubnetName: string;
  targetVmSize: string;
  targetStorageAccountId: string;
  availabilityZone?: string;
  availabilitySetId?: string;
  tags?: Record<string, string>;
}

export interface ReplicationItem {
  id: string;
  machineId: string;
  machineName: string;
  status: 'Enabling' | 'InitialReplication' | 'Protected' | 'Failed';
  healthStatus: 'Normal' | 'Warning' | 'Critical';
  replicationProgress?: number; // 0-100
  lastSyncTime?: string;
  targetConfig: ReplicationConfig;
}

// ============================================
// TARGET CONFIGURATION OPTIONS
// ============================================

export interface VmSku {
  name: string;
  family: string;
  cores: number;
  memoryGB: number;
  maxDataDisks: number;
  pricePerMonth?: number;
}

export interface VirtualNetwork {
  id: string;
  name: string;
  location: string;
  addressSpace: string[];
  subnets: Subnet[];
}

export interface Subnet {
  id: string;
  name: string;
  addressPrefix: string;
}

export interface StorageAccount {
  id: string;
  name: string;
  location: string;
  sku: string;
  kind: string;
}
```

---

## Step 5: Azure AD App Registration

1. Go to Azure Portal → Azure Active Directory → App registrations
2. Click "New registration"
3. Configure:
   - Name: `DrMigrate-AzSync`
   - Supported account types: Single tenant
   - Redirect URI: `http://localhost:3000` (Web)

4. After creation, note:
   - Application (client) ID
   - Directory (tenant) ID

5. Add API permissions:
   - Azure Service Management → user_impersonation
   - Microsoft Graph → User.Read

6. Create a client secret (for backend) if using confidential client flow

---

## Step 6: Environment Configuration

**apps/web/.env.local:**
```env
NEXT_PUBLIC_AZURE_CLIENT_ID=your-client-id
NEXT_PUBLIC_AZURE_TENANT_ID=your-tenant-id
NEXT_PUBLIC_API_URL=http://localhost:4000

# Azure Migrate Project Details
NEXT_PUBLIC_AZURE_SUBSCRIPTION_ID=your-subscription-id
NEXT_PUBLIC_AZURE_MIGRATE_PROJECT=your-migrate-project-name
NEXT_PUBLIC_AZURE_RESOURCE_GROUP=your-resource-group
```

**apps/api/.env:**
```env
PORT=4000
FRONTEND_URL=http://localhost:3000
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret  # Optional, for service principal auth
```

---

## Step 7: Run the Development Servers

From the root directory:

```bash
# Install all dependencies
pnpm install

# Run both apps in parallel
pnpm turbo dev
```

Or run individually:

```bash
# Terminal 1: Frontend
cd apps/web && pnpm dev

# Terminal 2: Backend
cd apps/api && pnpm dev
```

---

## Step 8: Verify Setup

1. Open http://localhost:3000 - Next.js app should load
2. Open http://localhost:4000/health - Should return `{"status":"ok"}`

---

## Project Structure After Setup

```
drmigrate-azsync/
├── apps/
│   ├── web/                    # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/            # App router pages
│   │   │   ├── components/     # React components
│   │   │   └── lib/            # Utilities, API client
│   │   ├── .env.local
│   │   └── package.json
│   └── api/                    # Fastify backend
│       ├── src/
│       │   ├── index.ts        # Server entry
│       │   ├── routes/         # API routes
│       │   └── services/       # Business logic
│       ├── .env
│       └── package.json
├── packages/
│   └── shared-types/           # TypeScript types
│       ├── src/
│       │   └── index.ts
│       └── package.json
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## Next Steps

1. **Implement MSAL authentication** in the frontend
2. **Create Azure Migrate service** in the backend
3. **Build the discovery page** to list VMware machines
4. **Create group management UI** with machine selector
5. **Add assessment workflow** with results display
6. **Implement replication enablement** with target configuration

Refer to [ARCHITECTURE_PLAN.md](./ARCHITECTURE_PLAN.md) for detailed implementation guidance.

