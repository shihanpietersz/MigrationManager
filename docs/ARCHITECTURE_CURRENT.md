# DrMigrate Azure Sync - Full Architecture (Detailed Plan)

> **Complete technical review** of the current implementation with security analysis,
> scalability assessment, and production-readiness roadmap.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [Backend Architecture](#3-backend-architecture)
4. [Frontend Architecture](#4-frontend-architecture)
5. [Azure Integration Layer](#5-azure-integration-layer)
6. [Data Model](#6-data-model)
7. [API Endpoint Inventory](#7-api-endpoint-inventory)
8. [Request Flows](#8-request-flows)
9. [Security Analysis](#9-security-analysis)
10. [Scalability Assessment](#10-scalability-assessment)
11. [HTTPS Enablement Plan](#11-https-enablement-plan)
12. [PostgreSQL Migration Plan](#12-postgresql-migration-plan)
13. [Production Readiness Checklist](#13-production-readiness-checklist)

---

## 1) System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              USER BROWSER                                        │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTP (no auth)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           NEXT.JS 14 FRONTEND                                    │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐                 │
│  │ Dashboard  │  │ Machines   │  │ Groups     │  │ Replication│                 │
│  │ Page       │  │ Page       │  │ Page       │  │ Page       │                 │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘                 │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐                 │
│  │ Lift &     │  │ Scripts    │  │ Tests      │  │ Settings   │                 │
│  │ Cleanse    │  │ Library    │  │ Module     │  │ Page       │                 │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘                 │
│                                                                                  │
│  State: TanStack Query + Zustand │ UI: shadcn/ui + Tailwind                     │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTP fetch (no auth header)
                                      │ NEXT_PUBLIC_API_URL=http://localhost:4000
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           FASTIFY API SERVER                                     │
│                                                                                  │
│  Plugins: @fastify/cors, @fastify/helmet, @fastify/swagger                      │
│  No auth middleware registered                                                   │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                           ROUTE LAYER                                    │    │
│  │  /api/v1/health        /api/v1/machines       /api/v1/groups            │    │
│  │  /api/v1/assessments   /api/v1/replication    /api/v1/targets           │    │
│  │  /api/v1/data-sources  /api/v1/settings       /api/v1/activity          │    │
│  │  /api/v1/lift-cleanse (scripts, executions, VMs, tests, suites)         │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                      │                                           │
│                                      ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                          SERVICE LAYER                                   │    │
│  │                                                                          │    │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │    │
│  │  │ machine.service  │  │ group.service    │  │ assessment.svc   │       │    │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘       │    │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │    │
│  │  │ replication.svc  │  │ data-source.svc  │  │ targets.service  │       │    │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘       │    │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │    │
│  │  │ azure-migrate    │  │ azure-site-      │  │ azure-vm         │       │    │
│  │  │ .service         │  │ recovery.service │  │ .service         │       │    │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘       │    │
│  │                                                                          │    │
│  │  LIFT & CLEANSE SERVICES:                                               │    │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │    │
│  │  │ script.service   │  │ execution.svc    │  │ script-security  │       │    │
│  │  │                  │  │                  │  │ .service         │       │    │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘       │    │
│  │  ┌──────────────────┐                                                   │    │
│  │  │ validation-test  │                                                   │    │
│  │  │ .service         │                                                   │    │
│  │  └──────────────────┘                                                   │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                      │                                           │
│                                      ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                          DATA LAYER                                      │    │
│  │                     Prisma ORM + SQLite                                  │    │
│  │                  (file:./data/drmigrate.db)                              │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ Service Principal (client_credentials)
                                      │ Bearer token to Azure Mgmt APIs
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              AZURE CLOUD                                         │
│                                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Azure AD     │  │ Azure        │  │ Site Recovery│  │ Azure VMs    │         │
│  │ (token)      │  │ Migrate      │  │ (ASR)        │  │ (Run Command)│         │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                           │
│  │ Resource Mgr │  │ Compute      │  │ Network      │                           │
│  │ (SKUs, RGs)  │  │ (VM sizes)   │  │ (VNets)      │                           │
│  └──────────────┘  └──────────────┘  └──────────────┘                           │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2) Technology Stack

| Layer | Technology | Location |
|-------|------------|----------|
| Frontend Framework | Next.js 14 (App Router) | `apps/web/` |
| UI Components | shadcn/ui + Tailwind CSS | `apps/web/src/components/ui/` |
| State Management | TanStack Query + Zustand | `apps/web/src/components/providers.tsx` |
| API Client | Custom fetch wrapper | `apps/web/src/lib/api.ts` |
| Backend Framework | Fastify | `apps/api/src/index.ts` |
| ORM | Prisma | `apps/api/prisma/schema.prisma` |
| Database | SQLite (file-based) | `apps/api/prisma/data/drmigrate.db` |
| Shared Types | TypeScript package | `packages/shared-types/src/index.ts` |
| Azure SDK | @azure/identity + REST | `apps/api/src/services/azure-*.ts` |
| Build System | Turborepo + pnpm | `turbo.json`, `pnpm-workspace.yaml` |

---

## 3) Backend Architecture

### 3.1 Route Modules

| Route File | Prefix | Responsibility |
|------------|--------|----------------|
| `health.ts` | `/api/v1` | Health + readiness checks |
| `machines.ts` | `/api/v1/machines` | Machine inventory CRUD |
| `groups.ts` | `/api/v1/groups` | Assessment group management |
| `assessments.ts` | `/api/v1/assessments` | Assessment creation + results |
| `replication.ts` | `/api/v1/replication` | Enable, monitor, migrate VMs |
| `targets.ts` | `/api/v1/targets` | Azure SKUs, VNets, storage |
| `data-sources.ts` | `/api/v1/data-sources` | External DB/CSV imports |
| `settings.ts` | `/api/v1/settings` | Azure config + diagnostics |
| `activity.ts` | `/api/v1/activity` | Activity log |
| `lift-cleanse.ts` | `/api/v1/lift-cleanse` | Scripts, VMs, tests, executions |

### 3.2 Service Modules

| Service | File | Purpose |
|---------|------|---------|
| `machineService` | `machine.service.ts` | Unified machine queries |
| `groupService` | `group.service.ts` | Group CRUD + machine links |
| `assessmentService` | `assessment.service.ts` | Assessment records |
| `replicationService` | `replication.service.ts` | Orchestrates ASR calls |
| `dataSourceService` | `data-source.service.ts` | CSV parsing, import jobs |
| `targetsService` | `targets.service.ts` | Azure resource lookups |
| `activityService` | `activity.service.ts` | Activity logging |
| `azureConfigService` | `azure-config.service.ts` | Persists Azure creds in DB |
| `azureMigrateService` | `azure-migrate.service.ts` | Azure Migrate REST calls |
| `azureSiteRecoveryService` | `azure-site-recovery.service.ts` | ASR REST calls |
| `azureVMService` | `azure-vm.service.ts` | VM listing + Run Command |
| `scriptService` | `lift-cleanse/script.service.ts` | Script CRUD + seeding |
| `executionService` | `lift-cleanse/execution.service.ts` | Script execution jobs |
| `scriptSecurityService` | `lift-cleanse/script-security.service.ts` | Security scanning |
| `validationTestService` | `lift-cleanse/validation-test.service.ts` | VM test definitions + runs |

---

## 4) Frontend Architecture

### 4.1 Page Structure

```
apps/web/src/app/(dashboard)/
├── page.tsx                    # Dashboard home
├── machines/page.tsx           # Machine inventory
├── groups/
│   ├── page.tsx                # List groups
│   ├── new/page.tsx            # Create group
│   └── [id]/page.tsx           # Group detail
├── assessments/
│   ├── page.tsx                # List assessments
│   ├── new/page.tsx            # Create assessment
│   └── [id]/page.tsx           # Assessment results
├── replication/
│   ├── page.tsx                # Replication dashboard
│   └── new/page.tsx            # Enable replication
├── data-sources/
│   ├── page.tsx                # List sources
│   └── import/page.tsx         # CSV upload
├── settings/page.tsx           # Azure config
└── lift-cleanse/
    ├── page.tsx                # Module dashboard
    ├── scripts/
    │   ├── page.tsx            # Script library
    │   └── new/page.tsx        # Create script
    ├── execute/page.tsx        # Run scripts on VMs
    ├── history/
    │   ├── page.tsx            # Execution history
    │   └── [id]/page.tsx       # Execution detail
    ├── vms/
    │   ├── page.tsx            # VM listing
    │   └── [id]/page.tsx       # VM detail + tests
    ├── tests/page.tsx          # Validation tests
    └── test-results/[id]/page.tsx
```

### 4.2 API Client Pattern

All API calls go through `apps/web/src/lib/api.ts`:

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  // NO authorization header is sent
  return response.json();
}
```

**Key observation:** Frontend makes direct HTTP calls to backend with no authentication.

---

## 5) Azure Integration Layer

### 5.1 Authentication Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ AzureConfig DB  │────▶│ Service         │────▶│ Azure AD        │
│ (tenant, client │     │ (getAccessToken)│     │ /oauth2/token   │
│  id, secret)    │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │
                                ▼
                        Bearer token cached
                        (5 min before expiry)
                                │
                                ▼
                        Azure Mgmt API calls
```

**Services with Azure auth:**
- `azure-migrate.service.ts` - uses `ClientSecretCredential`
- `azure-site-recovery.service.ts` - uses `ClientSecretCredential`
- `azure-vm.service.ts` - manual token fetch + cache
- `targets.service.ts` - uses `ClientSecretCredential`
- `replication.service.ts` - uses `ClientSecretCredential`

### 5.2 Azure API Endpoints Used

| API | Service | Example Endpoint |
|-----|---------|------------------|
| Azure Migrate Assessment | `azure-migrate.service.ts` | `/Microsoft.Migrate/assessmentProjects/{project}/machines` |
| Azure Migrate Groups | `azure-migrate.service.ts` | `/Microsoft.Migrate/assessmentProjects/{project}/groups` |
| Site Recovery Fabrics | `azure-site-recovery.service.ts` | `/Microsoft.RecoveryServices/vaults/{vault}/replicationFabrics` |
| Site Recovery Migration | `azure-site-recovery.service.ts` | `/.../replicationMigrationItems/{item}/migrate` |
| VM Run Command | `azure-vm.service.ts` | `/Microsoft.Compute/virtualMachines/{vm}/runCommands` |
| Resource Manager | `targets.service.ts` | `/subscriptions/{sub}/providers/Microsoft.Compute/skus` |

### 5.3 API Version Handling

Azure API versions are **hardcoded** in each service:

```typescript
// azure-migrate.service.ts
const endpoint = `...?api-version=2019-10-01`;
const endpoint = `...?api-version=2023-06-06`;

// azure-site-recovery.service.ts  
const endpoint = `...?api-version=2025-08-01`;
```

**Risk:** If Microsoft deprecates an API version, you must update multiple files.

---

## 6) Data Model

### 6.1 Entity Relationship Diagram

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│   DataSource     │───────│  ExternalMachine │───────│   GroupMachine   │
│                  │  1:N  │                  │  N:1  │                  │
│  - id            │       │  - id            │       │  - id            │
│  - name          │       │  - hostname      │       │  - machineType   │
│  - type          │       │  - ipAddresses   │       │                  │
│  - connString    │       │  - cpuCores      │       └────────┬─────────┘
│  - status        │       │  - memoryMB      │                │
└──────────────────┘       └──────────────────┘                │
                                                               │
┌──────────────────┐       ┌──────────────────┐                │
│DiscoveredMachine │───────│   GroupMachine   │────────────────┘
│                  │  N:1  │                  │
│  - azureMigrateId│       │                  │
│  - siteId        │       │                  │
│  - displayName   │       │                  │
└──────────────────┘       └──────────────────┘
                                    │
                                    │ N:1
                                    ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│ AssessmentGroup  │───────│   Assessment     │───────│ AssessmentResult │
│                  │  1:N  │                  │  1:N  │                  │
│  - id            │       │  - id            │       │  - readiness     │
│  - name          │       │  - name          │       │  - monthlyCost   │
│  - status        │       │  - status        │       │  - recommended   │
│  - machineCount  │       │  - azureLocation │       │    Size          │
└──────────────────┘       └──────────────────┘       └──────────────────┘

┌──────────────────┐       ┌──────────────────┐
│ ReplicationItem  │       │   ActivityLog    │
│                  │       │                  │
│  - machineId     │       │  - type          │
│  - status        │       │  - action        │
│  - targetConfig  │       │  - title         │
│  - azureProtected│       │  - status        │
│    ItemId        │       │                  │
└──────────────────┘       └──────────────────┘

LIFT & CLEANSE MODELS:

┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│LiftCleanseScript │───────│ ScriptExecution  │───────│ ScriptExecution  │
│                  │  1:N  │                  │  1:N  │ Target           │
│  - name          │       │  - status        │       │  - vmId          │
│  - content       │       │  - initiatedBy   │       │  - status        │
│  - scriptType    │       │  - parameters    │       │  - exitCode      │
│  - riskLevel     │       │  - totalTargets  │       │  - stdout        │
│  - isBuiltIn     │       │  - successCount  │       │  - stderr        │
└──────────────────┘       └──────────────────┘       └──────────────────┘

┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│ ValidationTest   │───────│ VmTestAssignment │───────│  VmTestResult    │
│                  │  1:N  │                  │  1:N  │                  │
│  - name          │       │  - vmId          │       │  - status        │
│  - script        │       │  - parameters    │       │  - exitCode      │
│  - expectedExit  │       │  - scheduleType  │       │  - stdout        │
│    Code          │       │  - lastStatus    │       │  - duration      │
└──────────────────┘       └──────────────────┘       └──────────────────┘

┌──────────────────┐       ┌──────────────────┐
│   TestSuite      │───────│  TestSuiteTest   │
│                  │  1:N  │                  │
│  - name          │       │  - testId        │
│  - runInParallel │       │  - order         │
│  - stopOnFailure │       │                  │
└──────────────────┘       └──────────────────┘
```

### 6.2 Prisma Schema Highlights

**Total Models:** 22

**Key Tables:**
- `AzureConfig` - stores Azure credentials (including `clientSecret` in plaintext)
- `DataSource` - external import sources
- `ExternalMachine` / `DiscoveredMachine` - machine inventory
- `AssessmentGroup` / `Assessment` / `AssessmentResult` - assessments
- `ReplicationItem` - replication tracking
- `LiftCleanseScript` / `ScriptExecution` / `ScriptExecutionTarget` - script execution
- `ValidationTest` / `VmTestAssignment` / `VmTestResult` - validation tests

---

## 7) API Endpoint Inventory

### 7.1 Core Migration Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/health` | None | Health check |
| GET | `/api/v1/machines` | None | List all machines |
| POST | `/api/v1/machines/compare` | None | Compare external vs Azure |
| GET | `/api/v1/groups` | None | List assessment groups |
| POST | `/api/v1/groups` | None | Create group |
| GET | `/api/v1/assessments` | None | List assessments |
| POST | `/api/v1/assessments/groups/:id` | None | Create assessment |
| GET | `/api/v1/replication` | None | List replication items |
| POST | `/api/v1/replication/enable` | None | Enable replication |
| POST | `/api/v1/replication/:id/migrate` | None | Start migration |
| POST | `/api/v1/replication/:id/test-migrate` | None | Test migration |
| GET | `/api/v1/targets/skus` | None | List VM sizes |
| GET | `/api/v1/targets/vnets` | None | List VNets |
| POST | `/api/v1/data-sources/import/csv` | None | Upload CSV (50MB max) |
| POST | `/api/v1/settings/azure` | None | Save Azure credentials |
| POST | `/api/v1/settings/azure/test` | None | Test Azure connection |

### 7.2 Lift & Cleanse Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/lift-cleanse/scripts` | None | List scripts |
| POST | `/api/v1/lift-cleanse/scripts` | None | Create script |
| POST | `/api/v1/lift-cleanse/scripts/validate` | None | Security scan script |
| POST | `/api/v1/lift-cleanse/execute` | None | Execute script on VMs |
| GET | `/api/v1/lift-cleanse/executions` | None | List executions |
| GET | `/api/v1/lift-cleanse/vms` | None | List Azure VMs |
| GET | `/api/v1/lift-cleanse/tests` | None | List validation tests |
| POST | `/api/v1/lift-cleanse/tests` | None | Create custom test |
| POST | `/api/v1/lift-cleanse/test-assignments` | None | Assign test to VM |
| POST | `/api/v1/lift-cleanse/test-assignments/:id/run` | None | Run test |

**Total Endpoints:** ~80+

**Auth Status:** ALL endpoints have NO authentication.

---

## 8) Request Flows

### 8.1 Machine Import Flow

```
User                    Frontend                  Backend                  Database
  │                        │                         │                        │
  │  Upload CSV            │                         │                        │
  │───────────────────────▶│                         │                        │
  │                        │  POST /data-sources/    │                        │
  │                        │       import/csv        │                        │
  │                        │────────────────────────▶│                        │
  │                        │                         │  Create ImportJob      │
  │                        │                         │───────────────────────▶│
  │                        │                         │                        │
  │                        │                         │  Parse CSV with Papa   │
  │                        │                         │                        │
  │                        │                         │  Upsert each machine   │
  │                        │                         │───────────────────────▶│
  │                        │                         │                        │
  │                        │  { jobId, processed }   │                        │
  │                        │◀────────────────────────│                        │
  │  Show results          │                         │                        │
  │◀───────────────────────│                         │                        │
```

### 8.2 Replication Enable Flow

```
Frontend                  Backend                  Azure Site Recovery
   │                         │                         │
   │  POST /replication/     │                         │
   │       enable            │                         │
   │────────────────────────▶│                         │
   │                         │                         │
   │                         │  getAccessToken()       │
   │                         │────────────────────────▶│ Azure AD
   │                         │◀────────────────────────│
   │                         │                         │
   │                         │  discoverInfrastructure │
   │                         │────────────────────────▶│
   │                         │◀────────────────────────│
   │                         │                         │
   │                         │  For each machine:      │
   │                         │  PUT /replication       │
   │                         │      MigrationItems     │
   │                         │────────────────────────▶│
   │                         │◀────────────────────────│
   │                         │                         │
   │                         │  Save to local DB       │
   │                         │                         │
   │  { items, message }     │                         │
   │◀────────────────────────│                         │
```

### 8.3 Script Execution Flow

```
Frontend                  Backend                  Azure VM Service
   │                         │                         │
   │  POST /lift-cleanse/    │                         │
   │       execute           │                         │
   │────────────────────────▶│                         │
   │                         │                         │
   │                         │  Security scan script   │
   │                         │  (scriptSecurityService)│
   │                         │                         │
   │                         │  Create Execution       │
   │                         │  record                 │
   │                         │                         │
   │                         │  For each target VM:    │
   │                         │  POST /runCommands      │
   │                         │────────────────────────▶│ Azure
   │                         │◀────────────────────────│
   │                         │                         │
   │                         │  Poll async operation   │
   │                         │────────────────────────▶│
   │                         │◀────────────────────────│
   │                         │                         │
   │                         │  Update target status   │
   │                         │                         │
   │  { executionId }        │                         │
   │◀────────────────────────│                         │
```

---

## 9) Security Analysis

### 9.1 Critical Issues

| Issue | Severity | Location | Impact |
|-------|----------|----------|--------|
| **No API authentication** | CRITICAL | All routes | Anyone can call any endpoint |
| **No authorization/RBAC** | CRITICAL | All routes | No role-based access control |
| **Secrets in DB plaintext** | HIGH | `AzureConfig.clientSecret` | Credential theft if DB exposed |
| **Connection strings in DB** | HIGH | `DataSource.connectionString` | DB creds exposed |
| **Swagger docs exposed** | MEDIUM | `/docs` | API documentation public |
| **No rate limiting** | MEDIUM | All routes | DoS vulnerability |
| **No input sanitization** | MEDIUM | Script content | Stored XSS possible |
| **File upload no auth** | HIGH | `/data-sources/import/csv` | Anyone can upload 50MB files |
| **CORS with credentials** | LOW | `cors.credentials: true` | Cookie risks if added later |

### 9.2 Security Scan Service

The `scriptSecurityService` scans uploaded scripts for dangerous patterns:

**PowerShell patterns detected:**
- `Remove-Item -Recurse` on system directories (CRITICAL)
- `Format-Volume`, `Clear-Disk` (CRITICAL)
- `Invoke-Expression`, `-EncodedCommand` (DANGER)
- `New-LocalUser`, `Add-LocalGroupMember` (DANGER)
- `Invoke-WebRequest`, `curl` (WARNING)

**Bash patterns detected:**
- `rm -rf /` (CRITICAL)
- `dd of=/dev/sda` (CRITICAL)
- Reverse shell patterns (CRITICAL)
- `eval`, `curl | bash` (DANGER)
- `chmod 777`, `crontab` (WARNING)

**Limitation:** Scans are advisory only. Scripts with CRITICAL risk can still be saved.

### 9.3 Azure Credentials Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CURRENT: Insecure credential flow                         │
│                                                                              │
│  User enters:                                                                │
│  - tenantId                                                                  │
│  - clientId                                                                  │
│  - clientSecret  ──────▶  POST /settings/azure  ──────▶  SQLite DB          │
│                                                         (plaintext)          │
│                                                                              │
│  When API needs Azure access:                                                │
│                                                                              │
│  SQLite DB  ──────▶  Service reads clientSecret  ──────▶  Azure AD token    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10) Scalability Assessment

### 10.1 Current Limitations

| Area | Limitation | Impact |
|------|------------|--------|
| **Database** | SQLite (single file) | No concurrent writes, no scaling |
| **No pagination** | Most list endpoints | Memory issues with large datasets |
| **Sync imports** | CSV import in-process | Blocks request, timeout risk |
| **Sync Azure calls** | No background jobs | Long response times |
| **No caching** | Azure lookups every call | Rate limiting, slow |
| **Hardcoded API versions** | Scattered across services | Hard to update |
| **No retry/backoff** | Azure API calls | Failures cascade |

### 10.2 Scalability Recommendations

**Short-term (weeks):**
1. Add pagination to `/machines`, `/groups`, `/executions`
2. Add request body size limits beyond multipart
3. Add rate limiting middleware
4. Add retry/backoff for Azure calls

**Mid-term (1-2 months):**
1. Move to PostgreSQL
2. Add background job queue (BullMQ/Agenda)
3. Centralize Azure API versions in config
4. Add Redis cache for Azure lookups

**Long-term (3+ months):**
1. Extract Azure integration to separate package
2. Add OpenTelemetry tracing
3. Add horizontal scaling support

---

## 11) HTTPS Enablement Plan

### 11.1 Current State

```
Frontend: http://localhost:3000
Backend:  http://localhost:4000
Swagger:  http://localhost:4000/docs
```

### 11.2 Development HTTPS

**Option A: mkcert + Fastify HTTPS**

```bash
# Install mkcert
mkcert -install
mkcert localhost 127.0.0.1

# Update Fastify config
const server = Fastify({
  https: {
    key: fs.readFileSync('localhost-key.pem'),
    cert: fs.readFileSync('localhost.pem'),
  }
});
```

**Option B: Caddy reverse proxy**

```caddyfile
localhost:443 {
  reverse_proxy localhost:4000
}
```

### 11.3 Production HTTPS

| Deployment | TLS Termination |
|------------|-----------------|
| Azure Container Apps | Built-in managed certs |
| Azure App Service | Built-in managed certs |
| VM + Nginx | Let's Encrypt / ACME |
| VM + Caddy | Automatic HTTPS |

**Configuration changes:**
1. Set `NEXT_PUBLIC_API_URL=https://api.yourdomain.com`
2. Set `FRONTEND_URL=https://app.yourdomain.com` in API
3. Add HSTS headers
4. Redirect HTTP → HTTPS

---

## 12) PostgreSQL Migration Plan

### 12.1 Schema Changes

```diff
# prisma/schema.prisma

datasource db {
-  provider = "sqlite"
+  provider = "postgresql"
-  url      = env("DATABASE_URL")
+  url      = env("DATABASE_URL") // postgresql://user:pass@host:5432/db
}

# JSON fields can use native JSONB:
model ExternalMachine {
-  ipAddresses String   // JSON as string
+  ipAddresses Json     // Native JSONB
-  tags        String?
+  tags        Json?
}
```

### 12.2 Migration Steps

1. **Setup Postgres:**
   ```bash
   # Local dev
   docker run -d --name postgres -e POSTGRES_PASSWORD=secret -p 5432:5432 postgres
   
   # Or use Azure Database for PostgreSQL
   ```

2. **Update schema:**
   ```bash
   # Update provider in schema.prisma
   # Update DATABASE_URL in .env
   ```

3. **Generate migration:**
   ```bash
   npx prisma migrate dev --name postgres_migration
   ```

4. **Data migration:**
   ```bash
   # Export SQLite data
   sqlite3 drmigrate.db .dump > backup.sql
   
   # Transform and import to Postgres
   # (Handle JSON string → JSONB conversion)
   ```

### 12.3 Connection Pooling

For production, add connection pooling:

```typescript
// Using Prisma Data Proxy or PgBouncer
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});
```

---

## 13) Production Readiness Checklist

### Phase 1: Security (Week 1-2)

- [ ] Add Azure AD auth to frontend (MSAL)
- [ ] Add JWT validation middleware to Fastify
- [ ] Implement RBAC (admin, operator, viewer roles)
- [ ] Move secrets to Azure Key Vault
- [ ] Disable Swagger in production
- [ ] Add HTTPS
- [ ] Add CSRF protection
- [ ] Add request size limits
- [ ] Add security headers (helmet config)

### Phase 2: Robustness (Week 3-4)

- [ ] Add pagination to all list endpoints
- [ ] Add rate limiting
- [ ] Add retry/backoff for Azure calls
- [ ] Add request validation (Zod/JSON Schema)
- [ ] Add structured error responses
- [ ] Add request ID tracing

### Phase 3: Scalability (Week 5-6)

- [ ] Migrate to PostgreSQL
- [ ] Add background job queue
- [ ] Add Redis cache
- [ ] Centralize Azure API config
- [ ] Add health check dependencies

### Phase 4: Operations (Week 7-8)

- [ ] Add structured logging
- [ ] Add metrics (Prometheus)
- [ ] Add tracing (OpenTelemetry)
- [ ] Add alerting
- [ ] Document deployment runbook
- [ ] Add backup/restore procedures

---

## Appendix A: File Reference

```
apps/api/
├── src/
│   ├── index.ts                    # Fastify entry point
│   ├── lib/
│   │   └── db.ts                   # Prisma client singleton
│   ├── routes/
│   │   ├── activity.ts
│   │   ├── assessments.ts
│   │   ├── data-sources.ts
│   │   ├── groups.ts
│   │   ├── health.ts
│   │   ├── lift-cleanse.ts         # 1150 lines - largest route file
│   │   ├── machines.ts
│   │   ├── replication.ts          # 820 lines
│   │   ├── settings.ts             # 570 lines
│   │   └── targets.ts
│   └── services/
│       ├── activity.service.ts
│       ├── assessment.service.ts
│       ├── azure-config.service.ts
│       ├── azure-migrate.service.ts           # 1000+ lines
│       ├── azure-migrate-replication.service.ts
│       ├── azure-site-recovery.service.ts     # 2000+ lines
│       ├── azure-vm.service.ts                # 700+ lines
│       ├── data-source.service.ts
│       ├── group.service.ts
│       ├── lift-cleanse/
│       │   ├── execution.service.ts
│       │   ├── index.ts
│       │   ├── script-security.service.ts     # Pattern-based security scanning
│       │   ├── script.service.ts
│       │   └── validation-test.service.ts
│       ├── machine.service.ts
│       ├── replication.service.ts             # 1500+ lines
│       └── targets.service.ts
└── prisma/
    └── schema.prisma                          # 22 models, 743 lines

apps/web/
├── src/
│   ├── app/
│   │   ├── (dashboard)/                       # 24 page files
│   │   ├── globals.css
│   │   └── layout.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── header.tsx
│   │   │   └── sidebar.tsx
│   │   ├── providers.tsx                      # TanStack Query provider
│   │   └── ui/                                # shadcn components
│   └── lib/
│       ├── api.ts                             # 920+ lines - all API functions
│       └── utils.ts
└── next.config.js

packages/shared-types/
└── src/
    └── index.ts                               # 417 lines - all shared types
```

---

## Appendix B: Environment Variables

**Backend (`apps/api/.env`):**
```env
PORT=4000
HOST=0.0.0.0
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
DATABASE_URL=file:./data/drmigrate.db

# Azure (stored in DB, but can be set here for initial config)
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_SUBSCRIPTION_ID=
AZURE_RESOURCE_GROUP=
AZURE_MIGRATE_PROJECT=
AZURE_LOCATION=eastus
AZURE_VAULT_NAME=
AZURE_VAULT_RESOURCE_GROUP=
```

**Frontend (`apps/web/.env.local`):**
```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1

# Azure AD (for future MSAL integration)
NEXT_PUBLIC_AZURE_CLIENT_ID=
NEXT_PUBLIC_AZURE_TENANT_ID=
NEXT_PUBLIC_AZURE_REDIRECT_URI=http://localhost:3000
```

---

*Document generated from code review on 2026-01-16*
