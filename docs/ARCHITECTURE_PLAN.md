# DrMigrate Azure Sync - Architecture Plan

> **Expert Software Architect Recommendation**  
> Integration with Azure Migrate REST API for Assessment & Replication Management

---

## Executive Summary

This document outlines the architecture for extending DrMigrate to integrate with Azure Migrate's REST API, enabling:
- Creation and management of assessment groups
- Performing migration assessments
- Using assessment groups as replication groups
- Defining target state configurations (VM specs, subnets, SKUs)
- Full UI parity with Azure Migrate portal capabilities

---

## 1. Technology Stack Recommendation

### Frontend: **Next.js 14+ (App Router)**

| Criteria | Why Next.js over alternatives |
|----------|------------------------------|
| **Server Components** | Reduces client bundle size, better for complex dashboards |
| **API Routes** | Can act as a BFF (Backend-for-Frontend) layer |
| **SSR/SSG** | Better perceived performance for data-heavy views |
| **TypeScript Native** | First-class TypeScript support for type safety |
| **Deployment Flexibility** | Deploy to Azure Static Web Apps, Vercel, or self-hosted |

**Why NOT plain React?**
- You'd need to build routing, SSR, and API proxy layers manually
- Next.js gives you these out of the box with better DX

**Why NOT Rust (e.g., Leptos/Yew)?**
- Smaller ecosystem for enterprise web apps
- Harder to find developers
- Overkill for a REST API wrapper application

### Backend: **Node.js with Fastify (NOT Express)**

| Criteria | Why Fastify over alternatives |
|----------|------------------------------|
| **Performance** | 2-3x faster than Express for JSON serialization |
| **Schema Validation** | Built-in JSON schema validation (critical for Azure API payloads) |
| **TypeScript** | Native TypeScript support |
| **Plugin System** | Clean, encapsulated plugin architecture |
| **Azure SDK** | Excellent Azure SDK support for Node.js |

**Why NOT Rust?**
- You're wrapping REST APIs, not doing compute-heavy work
- Azure SDK has first-class Node.js support
- Faster development velocity for CRUD/orchestration apps

**Why NOT .NET?**
- Valid alternative if your team has C# expertise
- But Node.js + TypeScript gives unified language across stack

### Recommended Stack Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
│  Next.js 14+ (App Router) + TypeScript + Tailwind CSS           │
│  UI: shadcn/ui (modern, accessible, customizable)               │
│  State: TanStack Query (server state) + Zustand (client state)  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (API Layer)                          │
│  Node.js + Fastify + TypeScript                                  │
│  Auth: Azure AD (MSAL.js) with token proxy                       │
│  Validation: Zod + JSON Schema                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AZURE MIGRATE APIs                            │
│  • Assessment API (groups, assessments, machines)                │
│  • Site Recovery API (replication, recovery plans)               │
│  • Resource Manager API (VNets, Subnets, SKUs)                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Architecture Decision: Monorepo vs Separate Repos

### ✅ Recommended: **Turborepo Monorepo**

```
drmigrate-azsync/
├── apps/
│   ├── web/                  # Next.js frontend
│   └── api/                  # Fastify backend
├── packages/
│   ├── azure-migrate-sdk/    # Custom SDK wrapping Azure APIs
│   ├── shared-types/         # TypeScript types shared across apps
│   ├── ui/                   # Shared UI components (optional)
│   └── config/               # Shared ESLint, TypeScript configs
├── turbo.json
├── package.json
└── pnpm-workspace.yaml
```

**Benefits:**
- Shared types between frontend and backend (no drift)
- Single CI/CD pipeline
- Atomic commits across stack
- Shared Azure Migrate SDK package

---

## 3. Azure Migrate API Integration Architecture

### 3.1 API Landscape

Azure Migrate functionality is split across multiple REST APIs:

| API | Purpose | Base URL Pattern |
|-----|---------|------------------|
| **Azure Migrate Assessment** | Discovery, Groups, Assessments | `management.azure.com/.../assessmentProjects/` |
| **Azure Site Recovery** | Replication, Failover, Recovery | `management.azure.com/.../vaults/{vault}/replicationFabrics/` |
| **Azure Resource Manager** | VNets, Subnets, VM SKUs, Storage | `management.azure.com/subscriptions/{sub}/` |

### 3.2 Custom SDK Layer

Create an abstraction layer (`packages/azure-migrate-sdk/`) that:

```typescript
// packages/azure-migrate-sdk/src/index.ts

export interface AzureMigrateClient {
  // Assessment Operations
  assessment: {
    createGroup(params: CreateGroupParams): Promise<AssessmentGroup>;
    listGroups(projectId: string): Promise<AssessmentGroup[]>;
    addMachinesToGroup(groupId: string, machines: string[]): Promise<void>;
    createAssessment(groupId: string, config: AssessmentConfig): Promise<Assessment>;
    getAssessmentResults(assessmentId: string): Promise<AssessmentResults>;
  };
  
  // Replication Operations (Site Recovery)
  replication: {
    enableReplication(params: EnableReplicationParams): Promise<ReplicationJob>;
    getReplicationStatus(itemId: string): Promise<ReplicationStatus>;
    updateReplicationConfig(itemId: string, config: TargetConfig): Promise<void>;
    testFailover(itemId: string): Promise<FailoverJob>;
    plannedFailover(itemId: string): Promise<FailoverJob>;
  };
  
  // Discovery Operations
  discovery: {
    listDiscoveredMachines(siteId: string): Promise<DiscoveredMachine[]>;
    getMachineDetails(machineId: string): Promise<MachineDetails>;
  };
  
  // Target Configuration
  targets: {
    listAvailableSkus(location: string): Promise<VmSku[]>;
    listVnets(subscriptionId: string, location: string): Promise<Vnet[]>;
    listSubnets(vnetId: string): Promise<Subnet[]>;
    listStorageAccounts(subscriptionId: string): Promise<StorageAccount[]>;
  };
}
```

### 3.3 Key API Endpoints Reference

Based on [Azure Migrate REST API](https://learn.microsoft.com/en-us/rest/api/migrate/):

```yaml
# Assessment Groups
POST /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Migrate/assessmentProjects/{project}/groups/{group}
GET  /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Migrate/assessmentProjects/{project}/groups

# Assessments
POST /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Migrate/assessmentProjects/{project}/groups/{group}/assessments/{assessment}
GET  /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Migrate/assessmentProjects/{project}/groups/{group}/assessments/{assessment}/assessedMachines

# Site Recovery - Replication (via Recovery Services Vault)
PUT  /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.RecoveryServices/vaults/{vault}/replicationFabrics/{fabric}/replicationProtectionContainers/{container}/replicationProtectedItems/{item}
GET  /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.RecoveryServices/vaults/{vault}/replicationJobs

# VMware-specific Discovery
GET  /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.OffAzure/VMwareSites/{site}/machines
```

---

## 4. Data Flow Architecture

### 4.1 Dual Data Source Architecture

The application supports **two machine data sources**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      MACHINE DATA SOURCES                                │
├─────────────────────────────────┬───────────────────────────────────────┤
│     OPTION A: External DB       │     OPTION B: Azure Discovery         │
├─────────────────────────────────┼───────────────────────────────────────┤
│  • Import from existing CMDB    │  • Real-time Azure Migrate discovery  │
│  • CSV/Excel upload             │  • VMware vCenter integration         │
│  • API sync from other tools    │  • Auto-refresh capabilities          │
│  • Compare with Azure data      │  • Full machine details               │
└─────────────────────────────────┴───────────────────────────────────────┘
                    │                              │
                    └──────────────┬───────────────┘
                                   ▼
                    ┌──────────────────────────────┐
                    │   UNIFIED MACHINE INVENTORY  │
                    │   (Merge, Compare, Validate) │
                    └──────────────────────────────┘
```

**Use Cases:**
| Source | When to Use |
|--------|-------------|
| External DB | You have existing asset inventory (CMDB, ServiceNow, custom DB) |
| Azure Discovery | Fresh discovery or validation against source |
| Both | Compare external inventory with Azure-discovered machines |

### 4.2 Assessment-to-Replication Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER WORKFLOW                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
     ┌──────────────────────────────┼──────────────────────────────┐
     ▼                              ▼                              ▼
┌─────────────┐            ┌─────────────────┐            ┌──────────────┐
│ 1. IMPORT   │            │ 2. CREATE GROUP │            │ 3. ASSESS    │
│  or DISCOVER│───────────▶│  (SAP App, 5VM) │───────────▶│   Readiness  │
│   Machines  │            │                 │            │              │
└─────────────┘            └─────────────────┘            └──────────────┘
       │                            │                              │
       │ External DB                │                              │
       │ OR Azure Migrate           │                              │
       │ OR Both (compare)          │                              │
       │                            │                              │
     ┌─┴────────────────────────────┴──────────────────────────────┘
     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    4. CONFIGURE TARGET STATE                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │  VM SKUs    │  │   VNet/     │  │  Storage    │  │  Availability   │ │
│  │  Sizing     │  │   Subnet    │  │  Account    │  │  Zone/Set       │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    5. ENABLE REPLICATION                                 │
│  Assessment Group ──▶ Replication Group (1:1 mapping)                    │
│  Uses Site Recovery API with configured target state                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    6. MONITOR & MANAGE                                   │
│  • Replication health          • Sync progress                           │
│  • Test failover               • Planned migration                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.3 External Data Source Integration

Support importing machines from external databases/systems:

```typescript
// packages/azure-migrate-sdk/src/data-sources/index.ts

export interface MachineDataSource {
  type: 'azure-migrate' | 'external-db' | 'csv-import' | 'api-sync';
  fetch(): Promise<ExternalMachine[]>;
}

// External machine schema (normalized from various sources)
export interface ExternalMachine {
  sourceId: string;           // ID from source system
  hostname: string;
  ipAddresses: string[];
  operatingSystem: string;
  cpuCores?: number;
  memoryMB?: number;
  diskSizeGB?: number;
  tags?: Record<string, string>;
  sourceSystem: string;       // 'servicenow', 'cmdb', 'csv', etc.
  lastUpdated: Date;
}

// Comparison result
export interface MachineComparisonResult {
  matchedMachines: MatchedMachine[];     // Found in both sources
  azureOnlyMachines: DiscoveredMachine[]; // Only in Azure
  externalOnlyMachines: ExternalMachine[]; // Only in external DB
  discrepancies: MachineDiscrepancy[];    // Data mismatches
}
```

**Supported Import Methods:**

| Method | Description | Use Case |
|--------|-------------|----------|
| Database Connection | Direct SQL/NoSQL query | CMDB, ServiceNow, custom inventory |
| CSV/Excel Upload | File-based import | One-time migrations, spreadsheet data |
| REST API Sync | Periodic API polling | Integration with other tools |
| Manual Entry | Form-based input | Small-scale, ad-hoc additions |

### 4.4 Database Requirements

Since we now have **external data sources**, we need proper local storage:

| Data | Storage | Purpose |
|------|---------|---------|
| User Sessions | Redis / In-memory | OAuth token caching |
| Job History | SQLite → PostgreSQL | Local audit trail |
| User Preferences | SQLite → PostgreSQL | UI customizations |
| Cached Lookups | Redis / In-memory | VM SKUs, VNets (TTL: 1hr) |
| **Imported Machines** | SQLite → PostgreSQL | External machine inventory |
| **Comparison Results** | SQLite → PostgreSQL | Cached comparison data |
| **Data Source Configs** | SQLite → PostgreSQL | External DB connection settings |

**Recommendation:** Start with **SQLite** (via Prisma) for simplicity, migrate to PostgreSQL if scaling needed.

### 4.5 Data Comparison Workflow

```
┌──────────────────┐     ┌──────────────────┐
│  External DB     │     │  Azure Migrate   │
│  (Imported)      │     │  (Discovered)    │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         ▼                        ▼
┌─────────────────────────────────────────────┐
│           COMPARISON ENGINE                  │
│  • Match by hostname/IP                      │
│  • Identify discrepancies                    │
│  • Flag missing machines                     │
│  • Reconcile data differences                │
└─────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│           UNIFIED VIEW                       │
│  • Combined machine list                     │
│  • Source indicators                         │
│  • Confidence scores                         │
│  • Manual override capability                │
└─────────────────────────────────────────────┘
```

---

## 5. Authentication Architecture

### 5.1 Azure AD Integration

```
┌─────────────┐         ┌─────────────┐         ┌─────────────────────┐
│   Browser   │◀───────▶│  Next.js    │◀───────▶│     Fastify API     │
│  (MSAL.js)  │         │  (SSR/CSR)  │         │  (Token Validation) │
└─────────────┘         └─────────────┘         └─────────────────────┘
       │                                                   │
       │                                                   │
       ▼                                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Azure AD (Entra ID)                              │
│  • App Registration for DrMigrate                                        │
│  • Delegated permissions for Azure Migrate APIs                          │
│  • Scopes: user_impersonation, Azure Management APIs                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Required Azure AD Permissions

```json
{
  "requiredResourceAccess": [
    {
      "resourceAppId": "https://management.azure.com/",
      "resourceAccess": [
        { "id": "user_impersonation", "type": "Scope" }
      ]
    }
  ]
}
```

### 5.3 Token Flow

1. User signs in via MSAL.js in browser
2. Frontend receives access token for Azure Management API
3. Token passed to Fastify backend via Authorization header
4. Backend validates token and proxies requests to Azure APIs
5. Backend can add additional business logic/caching

---

## 6. Frontend Architecture

### 6.1 Page Structure

```
apps/web/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx              # Sidebar, navigation
│   │   ├── page.tsx                # Dashboard home (overview)
│   │   │
│   │   ├── machines/               # UNIFIED MACHINE INVENTORY
│   │   │   ├── page.tsx            # All machines (merged view)
│   │   │   ├── compare/page.tsx    # Compare external vs Azure
│   │   │   └── [machineId]/
│   │   │       └── page.tsx        # Machine details
│   │   │
│   │   ├── data-sources/           # EXTERNAL DATA SOURCES
│   │   │   ├── page.tsx            # List configured sources
│   │   │   ├── new/page.tsx        # Add new source wizard
│   │   │   ├── import/page.tsx     # CSV/Excel upload
│   │   │   └── [sourceId]/
│   │   │       └── page.tsx        # Source details & sync
│   │   │
│   │   ├── discovery/              # AZURE MIGRATE DISCOVERY
│   │   │   ├── page.tsx            # Azure discovered machines
│   │   │   └── sites/page.tsx      # VMware sites management
│   │   │
│   │   ├── groups/                 # ASSESSMENT GROUPS
│   │   │   ├── page.tsx            # List assessment groups
│   │   │   ├── new/page.tsx        # Create new group wizard
│   │   │   └── [groupId]/
│   │   │       ├── page.tsx        # Group details
│   │   │       └── assess/page.tsx # Run assessment
│   │   │
│   │   ├── assessments/            # ASSESSMENTS
│   │   │   ├── page.tsx            # List all assessments
│   │   │   └── [assessmentId]/
│   │   │       └── page.tsx        # Assessment results
│   │   │
│   │   ├── replication/            # REPLICATION MANAGEMENT
│   │   │   ├── page.tsx            # Replication dashboard
│   │   │   ├── new/page.tsx        # Enable replication wizard
│   │   │   └── [itemId]/
│   │   │       └── page.tsx        # Replication status & actions
│   │   │
│   │   └── settings/               # SETTINGS
│   │       ├── page.tsx            # General settings
│   │       ├── azure/page.tsx      # Azure connection settings
│   │       └── users/page.tsx      # User management (future)
│   │
│   └── api/                        # Next.js API routes (BFF)
│       └── [...proxy]/route.ts     # Proxy to Fastify backend
│
├── components/
│   ├── machines/
│   │   ├── machine-table.tsx       # Sortable/filterable table
│   │   ├── machine-selector.tsx    # Multi-select for groups
│   │   └── comparison-view.tsx     # Side-by-side comparison
│   ├── data-sources/
│   │   ├── source-wizard.tsx       # Add data source wizard
│   │   ├── csv-uploader.tsx        # Drag-drop CSV import
│   │   └── db-connector.tsx        # Database connection form
│   ├── groups/
│   │   └── group-wizard.tsx
│   ├── assessments/
│   │   └── assessment-results.tsx
│   └── replication/
│       ├── target-config-form.tsx
│       └── replication-status.tsx
│
└── lib/
    ├── api-client.ts               # TanStack Query hooks
    ├── auth.ts                     # MSAL configuration
    └── utils.ts                    # Shared utilities
```

### 6.2 Key UI Components

**Machine Selector (for creating groups):**
```tsx
// Multi-select table with filtering, search, and batch selection
<MachineSelector
  source="vmware"  // later: "hyperv" | "physical"
  onSelect={(machines) => setSelectedMachines(machines)}
  maxSelection={50}
/>
```

**Target Configuration Form:**
```tsx
// Dynamic form based on Azure Migrate supported options
<TargetConfigForm
  machines={selectedMachines}
  onSubmit={(config) => enableReplication(config)}
>
  <VmSkuSelector />      {/* Dropdown with sizing recommendations */}
  <VnetSubnetPicker />   {/* Hierarchical network selection */}
  <StoragePicker />      {/* Storage account selection */}
  <AvailabilityConfig /> {/* Zone or Set selection */}
</TargetConfigForm>
```

---

## 7. Backend API Design

### 7.1 API Routes Structure

```
apps/api/
├── src/
│   ├── index.ts                    # Fastify server entry
│   ├── plugins/
│   │   ├── auth.ts                 # Azure AD token validation
│   │   ├── azure-client.ts         # Azure SDK client singleton
│   │   └── error-handler.ts        # Standardized error responses
│   ├── routes/
│   │   ├── discovery/
│   │   │   └── index.ts            # GET /discovery/machines
│   │   ├── groups/
│   │   │   └── index.ts            # CRUD /groups
│   │   ├── assessments/
│   │   │   └── index.ts            # CRUD /assessments
│   │   ├── replication/
│   │   │   └── index.ts            # CRUD /replication
│   │   └── targets/
│   │       └── index.ts            # GET /targets/skus, /targets/vnets
│   └── services/
│       ├── assessment.service.ts
│       ├── replication.service.ts
│       └── discovery.service.ts
```

### 7.2 API Endpoints

```yaml
# ============================================
# DATA SOURCES (External DB + Azure Discovery)
# ============================================

# External Data Sources Configuration
GET    /api/v1/data-sources                     # List configured sources
POST   /api/v1/data-sources                     # Add new data source (DB, API, etc.)
PUT    /api/v1/data-sources/:sourceId           # Update source config
DELETE /api/v1/data-sources/:sourceId           # Remove source
POST   /api/v1/data-sources/:sourceId/test      # Test connection

# Machine Import
POST   /api/v1/import/machines                  # Import from configured source
POST   /api/v1/import/csv                       # Upload CSV file
GET    /api/v1/import/jobs                      # List import jobs
GET    /api/v1/import/jobs/:jobId               # Import job status

# Unified Machine Inventory
GET    /api/v1/machines                         # All machines (merged view)
GET    /api/v1/machines?source=azure            # Only Azure-discovered
GET    /api/v1/machines?source=external         # Only imported machines
GET    /api/v1/machines/:machineId              # Machine details

# Machine Comparison
POST   /api/v1/machines/compare                 # Compare external vs Azure
GET    /api/v1/machines/compare/:comparisonId   # Get comparison results
POST   /api/v1/machines/reconcile               # Apply reconciliation

# ============================================
# AZURE MIGRATE DISCOVERY
# ============================================

GET    /api/v1/discovery/sites                  # List VMware sites
GET    /api/v1/discovery/machines?siteType=vmware
GET    /api/v1/discovery/machines/:machineId
POST   /api/v1/discovery/refresh                # Trigger discovery refresh

# ============================================
# ASSESSMENT GROUPS
# ============================================

GET    /api/v1/groups
POST   /api/v1/groups                           # Create group
GET    /api/v1/groups/:groupId
PUT    /api/v1/groups/:groupId                  # Update group details
PUT    /api/v1/groups/:groupId/machines         # Add/remove machines
DELETE /api/v1/groups/:groupId

# ============================================
# ASSESSMENTS
# ============================================

POST   /api/v1/groups/:groupId/assessments      # Create assessment
GET    /api/v1/assessments                      # List all assessments
GET    /api/v1/assessments/:assessmentId
GET    /api/v1/assessments/:assessmentId/results
GET    /api/v1/assessments/:assessmentId/export # Export as PDF/Excel

# ============================================
# REPLICATION
# ============================================

POST   /api/v1/replication/enable               # Enable replication for group
GET    /api/v1/replication                      # List all replications
GET    /api/v1/replication/:itemId/status
PUT    /api/v1/replication/:itemId/config       # Update target config
POST   /api/v1/replication/:itemId/test-failover
POST   /api/v1/replication/:itemId/failover
POST   /api/v1/replication/:itemId/cancel       # Cancel replication

# ============================================
# TARGET CONFIGURATION OPTIONS
# ============================================

GET    /api/v1/targets/skus?location=eastus
GET    /api/v1/targets/vnets?subscriptionId=xxx
GET    /api/v1/targets/subnets?vnetId=xxx
GET    /api/v1/targets/storage-accounts
GET    /api/v1/targets/availability-zones?location=xxx
GET    /api/v1/targets/availability-sets?resourceGroup=xxx
```

---

## 8. Phase-Based Development Plan

### Phase 1: Foundation (Weeks 1-4)

```
✅ Week 1: Project Setup
   - Initialize Turborepo monorepo
   - Setup Next.js with TypeScript, Tailwind, shadcn/ui
   - Setup Fastify with TypeScript + Prisma (SQLite)
   - Azure AD app registration
   - Basic authentication flow

✅ Week 2: Azure Discovery Module
   - Integrate with Azure Migrate Discovery API
   - List discovered VMware machines
   - Machine details view
   - Machine search and filtering

✅ Week 3: External Data Sources
   - Data source configuration UI
   - CSV/Excel upload functionality
   - Database connection wizard (SQL Server, PostgreSQL, MySQL)
   - Import job management

✅ Week 4: Unified Machine Inventory
   - Merged machine view (Azure + External)
   - Source indicators and badges
   - Comparison engine (match by hostname/IP)
   - Discrepancy highlighting
   - Machine reconciliation workflow
```

### Phase 2: Assessment (Weeks 5-7)

```
✅ Week 5: Assessment Groups
   - Create assessment group UI
   - Machine selector (from unified inventory)
   - Add/remove machines from groups
   - Group management CRUD

✅ Week 6: Assessment Execution
   - Create assessment configuration form
   - Trigger assessment API call
   - Assessment status polling
   - Assessment results display

✅ Week 7: Assessment Results
   - Readiness breakdown view
   - Cost estimation display
   - Issues and recommendations
   - Export assessment report (PDF/Excel)
```

### Phase 3: Replication (Weeks 8-10)

```
✅ Week 8: Target Configuration
   - VM SKU selector with recommendations
   - VNet/Subnet picker
   - Storage account selection
   - Availability zone/set configuration

✅ Week 9: Enable Replication
   - "Use assessment group as replication group" feature
   - Enable replication API integration
   - Replication job monitoring
   - Initial sync progress

✅ Week 10: Replication Management
   - Replication health dashboard
   - Test failover functionality
   - Planned failover workflow
   - Cleanup and rollback
```

### Phase 4: Polish & Deployment (Weeks 11-13)

```
✅ Week 11: Production Readiness
   - Edge cases and error handling
   - Retry logic for long-running operations
   - Notifications and alerts
   - Comprehensive testing

✅ Week 12: Deployment Options
   - Docker Compose setup
   - PM2 configuration for VM deployment
   - Environment-specific configs
   - Installation documentation

✅ Week 13: Hyper-V & Physical (Prep)
   - Abstract provider layer
   - Hyper-V discovery integration
   - Physical server discovery
   - Provider-specific UI variations
```

---

## 9. Key Technical Considerations

### 9.1 Long-Running Operations

Azure Migrate operations are async. Handle with:

```typescript
// Polling pattern for long-running operations
async function waitForOperation(operationId: string): Promise<OperationResult> {
  const maxAttempts = 60;
  const pollInterval = 10000; // 10 seconds
  
  for (let i = 0; i < maxAttempts; i++) {
    const status = await checkOperationStatus(operationId);
    
    if (status.state === 'Succeeded') return status.result;
    if (status.state === 'Failed') throw new OperationError(status.error);
    
    await sleep(pollInterval);
  }
  
  throw new TimeoutError('Operation timed out');
}
```

### 9.2 Rate Limiting

Azure Management APIs have rate limits. Implement:

- Request queuing with p-limit
- Exponential backoff on 429 responses
- Caching of static data (SKUs, VNets)

### 9.3 Error Mapping

Map Azure errors to user-friendly messages:

```typescript
const errorMap = {
  'AuthorizationFailed': 'You do not have permission to perform this action',
  'ResourceNotFound': 'The specified resource was not found',
  'InvalidParameter': 'Invalid configuration provided',
  // ... more mappings
};
```

---

## 10. Deployment Architecture

The application supports **flexible deployment** - cloud OR on-premises VM.

### Option A: On-Premises VM Deployment (Recommended for Control)

Perfect for running on a Windows/Linux VM within your datacenter:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Windows/Linux VM (On-Premises)                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      Docker Compose Stack                        │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │    │
│  │  │  Next.js     │  │  Fastify     │  │   SQLite     │           │    │
│  │  │  :3000       │◀▶│  :4000       │◀▶│  (file-based)│           │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  OR (without Docker):                                                    │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  • Node.js 20 LTS installed                                      │    │
│  │  • PM2 process manager (keeps apps running)                      │    │
│  │  • Nginx reverse proxy (optional, for SSL)                       │    │
│  │  • SQLite for data storage                                       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │ HTTPS (outbound only)
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Azure Cloud Services                             │
│  • Azure AD (Authentication)                                             │
│  • Azure Migrate (Assessment APIs)                                       │
│  • Azure Site Recovery (Replication APIs)                                │
└─────────────────────────────────────────────────────────────────────────┘
```

**VM Deployment Requirements:**
| Component | Minimum | Recommended |
|-----------|---------|-------------|
| OS | Windows Server 2019+ / Ubuntu 20.04+ | Windows Server 2022 / Ubuntu 22.04 |
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB | 50 GB SSD |
| Network | Outbound HTTPS to Azure | Outbound HTTPS to Azure |

**VM Setup (Non-Docker):**
```bash
# Install Node.js 20 LTS
# Windows: Download from nodejs.org
# Linux:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 (process manager)
npm install -g pm2

# Clone and build
git clone <repo-url> /opt/drmigrate-azsync
cd /opt/drmigrate-azsync
pnpm install
pnpm build

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Auto-start on boot
```

**PM2 Configuration (ecosystem.config.js):**
```javascript
module.exports = {
  apps: [
    {
      name: 'drmigrate-web',
      cwd: './apps/web',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'drmigrate-api',
      cwd: './apps/api',
      script: 'dist/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
    },
  ],
};
```

### Option B: Docker Compose (VM or Cloud)

Works on any Docker-enabled environment:

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  web:
    build: ./apps/web
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://api:4000
    depends_on:
      - api
    restart: unless-stopped

  api:
    build: ./apps/api
    ports:
      - "4000:4000"
    environment:
      - DATABASE_URL=file:./data/drmigrate.db
    volumes:
      - api-data:/app/data
    restart: unless-stopped

volumes:
  api-data:
```

### Option C: Azure Container Apps (Cloud)

For cloud-native deployment with auto-scaling:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Azure Container Apps Environment                     │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │   Next.js Web    │    │   Fastify API    │    │  Azure SQL /     │  │
│  │   (Container)    │◀──▶│   (Container)    │◀──▶│  PostgreSQL      │  │
│  │   Port: 3000     │    │   Port: 4000     │    │  (Managed)       │  │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Deployment Comparison

| Factor | VM (Non-Docker) | VM (Docker) | Azure Container Apps |
|--------|-----------------|-------------|---------------------|
| **Setup Complexity** | Low | Medium | Medium |
| **Maintenance** | Manual updates | Container rebuilds | Auto-managed |
| **Scaling** | Manual | Manual | Auto-scale |
| **Cost** | VM cost only | VM cost only | Per-usage |
| **Internet Dependency** | Outbound only | Outbound only | Full cloud |
| **Offline Capability** | Yes (cached data) | Yes (cached data) | No |
| **Best For** | Air-gapped, simple | Consistent deployments | Cloud-first |

---

## 11. Technology Comparison Summary

| Aspect | Recommended | Alternative | Why Not |
|--------|-------------|-------------|---------|
| Frontend Framework | Next.js 14 | React + Vite | SSR, API routes, better DX |
| UI Components | shadcn/ui | Material UI | More customizable, smaller bundle |
| State Management | TanStack Query | Redux | Better for server state |
| Backend Framework | Fastify | Express | 2-3x faster, better TypeScript |
| Backend Language | TypeScript | Rust / C# | Azure SDK support, team velocity |
| Database | SQLite → PostgreSQL | MongoDB | Relational data, Prisma ORM |
| Monorepo | Turborepo | Nx | Simpler, faster builds |
| Deployment | Container Apps | AKS / App Service | Right-sized for this workload |

---

## 12. Next Steps

1. **Approve architecture** - Review this document with stakeholders
2. **Azure AD setup** - Create app registration with required permissions
3. **Initialize repository** - Run the project scaffold command
4. **Spike on Azure APIs** - Validate API access with Postman/Insomnia
5. **Begin Phase 1** - Start with authentication and discovery module

---

## Appendix: Useful Resources

- [Azure Migrate REST API Reference](https://learn.microsoft.com/en-us/rest/api/migrate/)
- [Azure Site Recovery REST API](https://learn.microsoft.com/en-us/rest/api/site-recovery/)
- [MSAL.js Documentation](https://learn.microsoft.com/en-us/azure/active-directory/develop/msal-overview)
- [Next.js App Router Documentation](https://nextjs.org/docs/app)
- [Fastify Documentation](https://fastify.dev/)
- [shadcn/ui Components](https://ui.shadcn.com/)
- [TanStack Query](https://tanstack.com/query/latest)
- [Turborepo](https://turbo.build/repo)

