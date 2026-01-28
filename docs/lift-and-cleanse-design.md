# Lift and Cleanse System - Technical Design Document

> **Version:** 1.1  
> **Status:** Design Review  
> **Author:** DrMigrate Team  
> **Last Updated:** January 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Integration with Existing App](#2-integration-with-existing-app)
3. [Design Decisions](#3-design-decisions)
4. [System Architecture](#4-system-architecture)
5. [Azure Technology Stack](#5-azure-technology-stack)
6. [Database Schema](#6-database-schema)
7. [Backend API Design](#7-backend-api-design)
8. [WebSocket Real-time Streaming](#8-websocket-real-time-streaming)
9. [Frontend UI Design](#9-frontend-ui-design)
10. [Built-in Script Library](#10-built-in-script-library)
11. [Scheduling System](#11-scheduling-system)
12. [VM Targeting & Grouping](#12-vm-targeting--grouping)
13. [Security Considerations](#13-security-considerations)
14. [File Structure](#14-file-structure)
15. [Implementation Phases](#15-implementation-phases)
16. [API Reference](#16-api-reference)
17. [Appendix A: Sample Scripts](#appendix-a-sample-built-in-scripts)
18. [Appendix B: Error Codes](#appendix-b-error-codes)

---

## 1. Executive Summary

The **Lift and Cleanse System** is a new module within the existing DrMigrate application for post-migration VM management. It enables IT administrators to execute PowerShell and Bash scripts on Azure VMs. 

### Integration Principle

> **⚠️ IMPORTANT:** This module is NOT a separate application. It is a new feature within the existing DrMigrate app and will:
> - Use the **existing Azure credentials** configured in Settings
> - Reuse the **existing authentication services**
> - Follow the **same patterns** as other modules (Replication, Assessments, etc.)
> - Share the **same database** and infrastructure

This system provides:

- **Script Library**: Pre-built and custom scripts for common post-migration tasks
- **Multi-VM Execution**: Run scripts across multiple VMs in parallel
- **Real-time Output**: Live streaming of script output via WebSocket
- **Script Sharing**: Share custom scripts across the organization
- **Scheduling**: Schedule scripts for later or recurring execution
- **VM Grouping**: Target VMs by tags, resource groups, or explicit selection

### Key Features

| Feature | Description |
|---------|-------------|
| **Script Management** | Create, edit, share, and organize scripts |
| **Parallel Execution** | Execute on multiple VMs simultaneously |
| **Live Streaming** | Real-time output via WebSocket |
| **Scheduling** | One-time or recurring script execution |
| **VM Targeting** | Filter by tags, resource groups, or manual selection |
| **Audit Trail** | Complete execution history with output logs |

---

## 2. Integration with Existing App

### Reusing Existing Infrastructure

The Lift and Cleanse module is fully integrated with the existing DrMigrate application. **No separate authentication or configuration is required.**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         DrMigrate Application                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   Settings Page (Existing)                                                       │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  Azure Configuration (Single Entry Point)                                │   │
│   │  • Tenant ID                                                             │   │
│   │  • Client ID (Service Principal)                                         │   │
│   │  • Client Secret                                                         │   │
│   │  • Subscription ID                                                       │   │
│   │  • Resource Group                                                        │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                              │                                                   │
│                              │ azureConfigService.getConfig()                    │
│                              ▼                                                   │
│   ┌──────────────────────────────────────────────────────────────────────────┐  │
│   │                     Shared Azure Config                                   │  │
│   └──────────────────────────────────────────────────────────────────────────┘  │
│          │                   │                   │                   │          │
│          ▼                   ▼                   ▼                   ▼          │
│   ┌────────────┐      ┌────────────┐      ┌────────────┐      ┌────────────┐   │
│   │ Replication│      │ Assessments│      │  Machines  │      │   Lift &   │   │
│   │   Module   │      │   Module   │      │   Module   │      │  Cleanse   │   │
│   │ (Existing) │      │ (Existing) │      │ (Existing) │      │   (NEW)    │   │
│   └────────────┘      └────────────┘      └────────────┘      └────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Services to Reuse

| Existing Service | Location | Purpose in Lift & Cleanse |
|------------------|----------|---------------------------|
| `azureConfigService` | `services/azure-config.service.ts` | Get Azure credentials (Tenant, Client ID, Secret) |
| `prisma` (DB client) | `lib/db.ts` | Database operations |
| `activityService` | `services/activity.service.ts` | Audit logging |
| Navigation/Layout | `app/(dashboard)/layout.tsx` | Consistent UI |
| API patterns | `routes/*.ts` | Consistent API structure |

### How Authentication Works

```typescript
// Lift and Cleanse will use the EXISTING azure-config.service.ts
// NO new credentials entry required!

// Example: azure-vm.service.ts (new service)
import { azureConfigService } from './azure-config.service.js';

class AzureVMService {
  async runCommand(vmId: string, script: string) {
    // Get credentials from EXISTING config (entered in Settings page)
    const config = await azureConfigService.getConfig();
    
    if (!config?.isConfigured) {
      throw new Error('Azure not configured. Please configure in Settings.');
    }

    // Use existing credentials - no duplicate entry!
    const { tenantId, clientId, clientSecret, subscriptionId } = config;
    
    // Make Azure API call with existing credentials
    const token = await this.getAccessToken(tenantId, clientId, clientSecret);
    // ... rest of implementation
  }
}
```

### Navigation Integration

Lift and Cleanse will be added to the existing sidebar navigation:

```
┌─────────────────────────────┐
│ 🏠 Dashboard                │
│                             │
│ Migrate                     │
│   ├─ ⚙️ Settings            │  ← Existing (Azure Config here)
│   ├─ 🖥️ Machines            │  ← Existing
│   ├─ 📊 Assessments         │  ← Existing
│   ├─ 🔄 Replication         │  ← Existing
│   └─ 🧹 Lift & Cleanse      │  ← NEW MODULE
│       ├─ Dashboard          │
│       ├─ Script Library     │
│       ├─ Executions         │
│       └─ Schedules          │
│                             │
│ Smart Tools                 │
│   └─ 🤖 AI Assistant        │
└─────────────────────────────┘
```

### Database Integration

New tables will be added to the **existing** Prisma schema (`apps/api/prisma/schema.prisma`):

```prisma
// EXISTING TABLES (unchanged)
model AzureConfig { ... }      // Stores Azure credentials
model Machine { ... }          // Discovered machines
model ReplicationItem { ... }  // Replication jobs
model Activity { ... }         // Audit logs

// NEW TABLES (added for Lift & Cleanse)
model LiftCleanseScript { ... }
model ScriptExecution { ... }
model ScriptExecutionTarget { ... }
model ScriptSchedule { ... }
model VMGroup { ... }
```

### What Gets Reused vs. What's New

| Component | Reuse Existing | Create New |
|-----------|----------------|------------|
| Azure Credentials | ✅ `azureConfigService` | - |
| Database Connection | ✅ `prisma` | - |
| Activity Logging | ✅ `activityService` | - |
| UI Layout/Navigation | ✅ `layout.tsx` | - |
| API Framework | ✅ Fastify routes | - |
| Azure VM Run Command | - | ✅ `azure-vm.service.ts` |
| Script Management | - | ✅ `script.service.ts` |
| Execution Orchestration | - | ✅ `execution.service.ts` |
| Scheduling | - | ✅ `scheduler.service.ts` |
| WebSocket Streaming | - | ✅ `websocket.service.ts` |
| Frontend Pages | - | ✅ `lift-cleanse/*` |

### User Flow

1. **User configures Azure in Settings** (already done if using other modules)
2. **User navigates to Lift & Cleanse** in sidebar
3. **System automatically uses existing credentials** - no re-entry needed
4. **User can immediately** browse scripts, target VMs, and execute

---

## 3. Design Decisions

Based on requirements review, the following design decisions have been made:

| Decision Area | Choice | Rationale |
|---------------|--------|-----------|
| **Execution Concurrency** | Parallel with configurable limit | Faster execution across multiple VMs |
| **Script Parameters** | Simple key-value pairs | Easy to use, covers most use cases |
| **Real-time Output** | WebSocket live streaming | Immediate feedback, better UX |
| **Script Sharing** | Enabled | Team collaboration and reuse |
| **Scheduling** | One-time and recurring | Automation and maintenance windows |
| **VM Grouping** | Tags, Resource Groups, and explicit | Flexible targeting options |

---

## 4. System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js/React)                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────────────────┐   │
│  │ Script      │  │ Script      │  │ VM Target   │  │ Execution Dashboard   │   │
│  │ Library     │  │ Editor      │  │ Selector    │  │ (WebSocket Output)    │   │
│  │             │  │ (Monaco)    │  │ (Groups)    │  │                       │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └───────────────────────┘   │
│  ┌─────────────┐  ┌─────────────────────────────────────────────────────────┐   │
│  │ Schedule    │  │ Execution History with Output Logs                      │   │
│  │ Manager     │  │                                                         │   │
│  └─────────────┘  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
                              │                    ▲
                              │ REST API           │ WebSocket
                              ▼                    │
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND (Fastify + Node.js)                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────────────┐    │
│  │ Script Service    │  │ Execution Service │  │ WebSocket Server          │    │
│  │ - CRUD operations │  │ - Orchestration   │  │ - Live output streaming   │    │
│  │ - Sharing         │  │ - Parallel exec   │  │ - Status updates          │    │
│  │ - Validation      │  │ - Status tracking │  │                           │    │
│  └───────────────────┘  └───────────────────┘  └───────────────────────────┘    │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────────────┐    │
│  │ Azure VM Service  │  │ Scheduler Service │  │ VM Discovery Service      │    │
│  │ - Run Command API │  │ - Cron jobs       │  │ - List VMs                │    │
│  │ - Output polling  │  │ - One-time tasks  │  │ - Tags & Groups           │    │
│  │ - OS detection    │  │ - Recurring runs  │  │ - Status checks           │    │
│  └───────────────────┘  └───────────────────┘  └───────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DATABASE (SQLite/Prisma)                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────────┐  ┌─────────────────────────────┐  │
│  │ LiftCleanse     │  │ ScriptExecution     │  │ ScriptExecutionTarget       │  │
│  │ Script          │  │                     │  │                             │  │
│  └─────────────────┘  └─────────────────────┘  └─────────────────────────────┘  │
│  ┌─────────────────┐  ┌─────────────────────┐  ┌─────────────────────────────┐  │
│  │ ScriptSchedule  │  │ VMGroup             │  │ ScriptShare                 │  │
│  │                 │  │                     │  │                             │  │
│  └─────────────────┘  └─────────────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              AZURE (Run Command API)                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐            │
│    │ Windows VM 1    │    │ Windows VM 2    │    │ Linux VM 1      │            │
│    │ PowerShell 5.1  │    │ PowerShell 5.1  │    │ Bash            │            │
│    │ Azure VM Agent  │    │ Azure VM Agent  │    │ Azure VM Agent  │            │
│    └─────────────────┘    └─────────────────┘    └─────────────────┘            │
│                                                                                  │
│    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐            │
│    │ Linux VM 2      │    │ Windows VM 3    │    │ Linux VM 3      │            │
│    │ Bash            │    │ PowerShell 5.1  │    │ Bash            │            │
│    │ Azure VM Agent  │    │ Azure VM Agent  │    │ Azure VM Agent  │            │
│    └─────────────────┘    └─────────────────┘    └─────────────────┘            │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Script Execution Flow                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌──────────┐
    │  User    │
    │ Triggers │
    │ Execute  │
    └────┬─────┘
         │
         ▼
    ┌──────────────────────────────────────────────────────────────┐
    │ 1. Validate Script & Parameters                              │
    │    - Check script exists                                     │
    │    - Validate parameter key-value pairs                      │
    │    - Verify user permissions                                 │
    └──────────────────────────────────────────────────────────────┘
         │
         ▼
    ┌──────────────────────────────────────────────────────────────┐
    │ 2. Resolve Target VMs                                        │
    │    - Expand VM groups (tags, resource groups)                │
    │    - Filter by OS compatibility                              │
    │    - Check VM running status                                 │
    └──────────────────────────────────────────────────────────────┘
         │
         ▼
    ┌──────────────────────────────────────────────────────────────┐
    │ 3. Create Execution Record                                   │
    │    - Store in database                                       │
    │    - Create target records for each VM                       │
    │    - Establish WebSocket channel                             │
    └──────────────────────────────────────────────────────────────┘
         │
         ▼
    ┌──────────────────────────────────────────────────────────────┐
    │ 4. Execute in Parallel (with concurrency limit)              │
    │                                                              │
    │    ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
    │    │  VM 1   │  │  VM 2   │  │  VM 3   │  │  VM 4   │       │
    │    │ Running │  │ Running │  │ Pending │  │ Pending │       │
    │    └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘       │
    │         │            │            │            │             │
    │         └────────────┴────────────┴────────────┘             │
    │                          │                                   │
    │              Azure Run Command API                           │
    └──────────────────────────────────────────────────────────────┘
         │
         ▼
    ┌──────────────────────────────────────────────────────────────┐
    │ 5. Stream Output via WebSocket                               │
    │    - Poll Azure for output (every 2 seconds)                 │
    │    - Push new output lines to WebSocket                      │
    │    - Update status in real-time                              │
    └──────────────────────────────────────────────────────────────┘
         │
         ▼
    ┌──────────────────────────────────────────────────────────────┐
    │ 6. Complete & Store Results                                  │
    │    - Store full output in database                           │
    │    - Record exit codes                                       │
    │    - Mark execution complete                                 │
    │    - Close WebSocket channel                                 │
    └──────────────────────────────────────────────────────────────┘
```

---

## 5. Azure Technology Stack

### Azure Run Command API

The system uses **Azure Run Command** for script execution on VMs:

| Feature | Specification |
|---------|---------------|
| **API Version** | 2024-07-01 |
| **Max Execution Time** | 90 minutes |
| **Max Output Size** | 4KB (per command) |
| **Supported OS** | Windows, Linux |
| **Agent Required** | Azure VM Agent (pre-installed) |

### API Endpoints

**Windows PowerShell Execution:**
```http
POST /subscriptions/{subscriptionId}/resourceGroups/{resourceGroup}/providers/Microsoft.Compute/virtualMachines/{vmName}/runCommand?api-version=2024-07-01

{
  "commandId": "RunPowerShellScript",
  "script": [
    "param([string]$PackageName)",
    "$ErrorActionPreference = 'Stop'",
    "Write-Host 'Installing package: ' + $PackageName",
    "# Script content here"
  ],
  "parameters": [
    { "name": "PackageName", "value": "nginx" }
  ]
}
```

**Linux Bash Execution:**
```http
POST /subscriptions/{subscriptionId}/resourceGroups/{resourceGroup}/providers/Microsoft.Compute/virtualMachines/{vmName}/runCommand?api-version=2024-07-01

{
  "commandId": "RunShellScript",
  "script": [
    "#!/bin/bash",
    "set -e",
    "PACKAGE_NAME=$1",
    "echo 'Installing package: $PACKAGE_NAME'",
    "# Script content here"
  ],
  "parameters": [
    { "name": "arg1", "value": "nginx" }
  ]
}
```

### Response Handling

The API returns an async operation that must be polled:

```http
GET /subscriptions/{subscriptionId}/resourceGroups/{resourceGroup}/providers/Microsoft.Compute/virtualMachines/{vmName}/runCommands/{runCommandName}?$expand=instanceView&api-version=2024-07-01
```

Response includes:
- `provisioningState`: Running, Succeeded, Failed
- `instanceView.output`: Script stdout
- `instanceView.error`: Script stderr
- `instanceView.exitCode`: Exit code

---

## 6. Database Schema

### Prisma Schema

```prisma
// ============================================
// LIFT AND CLEANSE MODULE
// ============================================

// Script Library
model LiftCleanseScript {
  id          String   @id @default(cuid())
  name        String
  description String?
  content     String   // The actual script content
  
  // Script metadata
  scriptType  String   // 'powershell' | 'bash'
  targetOs    String   // 'windows' | 'linux' | 'both'
  category    String   // 'cleanup' | 'install' | 'configure' | 'diagnostic' | 'custom'
  tags        String?  // JSON array of tags for filtering
  
  // Script configuration
  parameters  String?  // JSON: [{ "key": "PackageName", "description": "...", "required": true }]
  timeout     Int      @default(3600)  // Execution timeout in seconds (max 5400 = 90 min)
  runAsAdmin  Boolean  @default(true)  // Run with elevated privileges
  
  // Ownership & Sharing
  isBuiltIn   Boolean  @default(false) // System-provided vs user-created
  isShared    Boolean  @default(false) // Shared with organization
  createdBy   String?  // User who created (null for built-in)
  
  // Timestamps
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  // Relations
  executions  ScriptExecution[]
  schedules   ScriptSchedule[]
  shares      ScriptShare[]
}

// Script Execution (a single execution job)
model ScriptExecution {
  id          String   @id @default(cuid())
  
  // Script reference
  scriptId    String?
  script      LiftCleanseScript? @relation(fields: [scriptId], references: [id])
  
  // For ad-hoc scripts (not saved to library)
  adHocScript String?  // Script content if ad-hoc
  adHocType   String?  // 'powershell' | 'bash'
  
  // Execution metadata
  status      String   @default("pending") // pending | running | completed | failed | cancelled
  initiatedBy String?  // User who started the execution
  parameters  String?  // JSON: { "PackageName": "nginx", "Version": "1.0" }
  
  // Concurrency settings
  maxParallel Int      @default(5)  // Max concurrent VM executions
  
  // Scheduling reference (if scheduled)
  scheduleId  String?
  schedule    ScriptSchedule? @relation(fields: [scheduleId], references: [id])
  
  // Timing
  startedAt   DateTime?
  completedAt DateTime?
  
  // Summary
  totalTargets    Int @default(0)
  successCount    Int @default(0)
  failedCount     Int @default(0)
  
  // Timestamps
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  // Relations
  targets     ScriptExecutionTarget[]
}

// Execution Target (per-VM execution record)
model ScriptExecutionTarget {
  id            String   @id @default(cuid())
  
  // Execution reference
  executionId   String
  execution     ScriptExecution @relation(fields: [executionId], references: [id], onDelete: Cascade)
  
  // Target VM details
  vmId          String   // Azure resource ID
  vmName        String
  resourceGroup String
  subscriptionId String
  osType        String   // 'windows' | 'linux'
  
  // Execution status for this specific target
  status        String   @default("pending") // pending | running | completed | failed | cancelled | skipped
  exitCode      Int?
  errorMessage  String?  // Error message if failed
  
  // Output capture (stored after completion)
  stdout        String?  // Standard output (full)
  stderr        String?  // Standard error (full)
  
  // Azure tracking
  azureRunCommandName String?  // Run command resource name
  azureOperationUrl   String?  // For polling async operations
  
  // Timing
  queuedAt      DateTime?
  startedAt     DateTime?
  completedAt   DateTime?
  
  // Timestamps
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  @@index([executionId])
  @@index([vmId])
  @@index([status])
}

// Script Scheduling
model ScriptSchedule {
  id          String   @id @default(cuid())
  name        String
  description String?
  
  // Script reference
  scriptId    String
  script      LiftCleanseScript @relation(fields: [scriptId], references: [id])
  
  // Schedule configuration
  scheduleType String  // 'once' | 'recurring'
  cronExpression String? // For recurring: "0 2 * * *" (daily at 2 AM)
  runAt        DateTime? // For one-time: specific datetime
  timezone     String   @default("UTC")
  
  // Target VMs (JSON array of VM targeting rules)
  targetConfig String   // JSON: { "type": "explicit|tag|resourceGroup", "values": [...] }
  
  // Execution settings
  parameters   String?  // JSON: parameter values
  maxParallel  Int      @default(5)
  
  // Status
  isEnabled    Boolean  @default(true)
  lastRunAt    DateTime?
  nextRunAt    DateTime?
  
  // Ownership
  createdBy    String?
  
  // Timestamps
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  
  // Relations
  executions   ScriptExecution[]
}

// Script Sharing
model ScriptShare {
  id          String   @id @default(cuid())
  
  // Script reference
  scriptId    String
  script      LiftCleanseScript @relation(fields: [scriptId], references: [id], onDelete: Cascade)
  
  // Share target (for future: specific users/groups)
  shareType   String   @default("organization") // 'organization' | 'user' | 'group'
  sharedWith  String?  // User ID or Group ID (null for org-wide)
  
  // Permissions
  canEdit     Boolean  @default(false)
  canExecute  Boolean  @default(true)
  
  // Audit
  sharedBy    String?
  sharedAt    DateTime @default(now())
  
  @@unique([scriptId, shareType, sharedWith])
}

// VM Groups (for targeting)
model VMGroup {
  id          String   @id @default(cuid())
  name        String
  description String?
  
  // Grouping type
  groupType   String   // 'static' | 'dynamic'
  
  // For static groups: explicit VM list
  vmIds       String?  // JSON array of VM resource IDs
  
  // For dynamic groups: filter criteria
  filterType  String?  // 'tag' | 'resourceGroup' | 'subscription'
  filterKey   String?  // Tag key or resource group name
  filterValue String?  // Tag value (for tags)
  
  // Ownership
  createdBy   String?
  
  // Timestamps
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### Entity Relationship Diagram

```
┌─────────────────────┐       ┌─────────────────────┐
│ LiftCleanseScript   │       │ ScriptSchedule      │
├─────────────────────┤       ├─────────────────────┤
│ id                  │◄──────│ scriptId            │
│ name                │       │ scheduleType        │
│ content             │       │ cronExpression      │
│ scriptType          │       │ targetConfig        │
│ targetOs            │       │ isEnabled           │
│ category            │       └─────────────────────┘
│ parameters          │               │
│ isBuiltIn           │               │
│ isShared            │               ▼
└─────────────────────┘       ┌─────────────────────┐
        │                     │ ScriptExecution     │
        │                     ├─────────────────────┤
        ▼                     │ id                  │
┌─────────────────────┐       │ scriptId            │
│ ScriptShare         │       │ status              │
├─────────────────────┤       │ parameters          │
│ scriptId            │       │ maxParallel         │
│ shareType           │       │ scheduleId          │
│ canEdit             │       └─────────────────────┘
│ canExecute          │               │
└─────────────────────┘               │
                                      ▼
                              ┌─────────────────────────┐
                              │ ScriptExecutionTarget   │
                              ├─────────────────────────┤
                              │ executionId             │
                              │ vmId                    │
                              │ vmName                  │
                              │ status                  │
                              │ stdout                  │
                              │ stderr                  │
                              │ exitCode                │
                              └─────────────────────────┘
```

---

## 7. Backend API Design

### Route Structure

Base path: `/api/v1/lift-cleanse`

### Scripts API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/scripts` | List all scripts (with filters) |
| GET | `/scripts/:id` | Get script details |
| POST | `/scripts` | Create new script |
| PUT | `/scripts/:id` | Update script |
| DELETE | `/scripts/:id` | Delete script (custom only) |
| POST | `/scripts/:id/duplicate` | Duplicate a script |
| POST | `/scripts/:id/share` | Share script with organization |
| DELETE | `/scripts/:id/share` | Unshare script |

### Execution API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/execute` | Execute script on target VMs |
| POST | `/execute/adhoc` | Execute ad-hoc script (not saved) |
| GET | `/executions` | List execution history |
| GET | `/executions/:id` | Get execution details |
| GET | `/executions/:id/targets` | Get all target statuses |
| GET | `/executions/:id/targets/:targetId` | Get specific target output |
| POST | `/executions/:id/cancel` | Cancel running execution |
| POST | `/executions/:id/retry` | Retry failed targets |

### Schedule API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/schedules` | List all schedules |
| GET | `/schedules/:id` | Get schedule details |
| POST | `/schedules` | Create new schedule |
| PUT | `/schedules/:id` | Update schedule |
| DELETE | `/schedules/:id` | Delete schedule |
| POST | `/schedules/:id/enable` | Enable schedule |
| POST | `/schedules/:id/disable` | Disable schedule |
| POST | `/schedules/:id/run-now` | Trigger immediate execution |

### VM API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/vms` | List all Azure VMs |
| GET | `/vms/:id` | Get VM details |
| GET | `/vms/tags` | Get all unique VM tags |
| GET | `/vms/resource-groups` | Get all resource groups with VMs |
| GET | `/vm-groups` | List saved VM groups |
| POST | `/vm-groups` | Create VM group |
| PUT | `/vm-groups/:id` | Update VM group |
| DELETE | `/vm-groups/:id` | Delete VM group |

### Request/Response Examples

#### Create Script

```http
POST /api/v1/lift-cleanse/scripts
Content-Type: application/json

{
  "name": "Install Azure Monitor Agent",
  "description": "Installs and configures the Azure Monitor Agent on Windows VMs",
  "content": "# Install Azure Monitor Agent\n$ErrorActionPreference = 'Stop'\n\nWrite-Host 'Installing Azure Monitor Agent...'\n# Installation script here",
  "scriptType": "powershell",
  "targetOs": "windows",
  "category": "install",
  "tags": ["monitoring", "azure", "agent"],
  "parameters": [
    { "key": "WorkspaceId", "description": "Log Analytics Workspace ID", "required": true },
    { "key": "WorkspaceKey", "description": "Log Analytics Workspace Key", "required": true }
  ],
  "timeout": 1800,
  "runAsAdmin": true
}
```

#### Execute Script

```http
POST /api/v1/lift-cleanse/execute
Content-Type: application/json

{
  "scriptId": "clx1abc123",
  "targets": {
    "type": "mixed",
    "explicit": [
      "/subscriptions/xxx/resourceGroups/rg1/providers/Microsoft.Compute/virtualMachines/vm1"
    ],
    "tags": [
      { "key": "Environment", "value": "Production" }
    ],
    "resourceGroups": ["rg-web-servers"],
    "vmGroups": ["group-id-1"]
  },
  "parameters": {
    "WorkspaceId": "abc-123-def",
    "WorkspaceKey": "secret-key-here"
  },
  "maxParallel": 5
}
```

#### Execution Response

```json
{
  "success": true,
  "data": {
    "executionId": "exec_xyz789",
    "status": "running",
    "scriptName": "Install Azure Monitor Agent",
    "totalTargets": 5,
    "targets": [
      { "vmId": "...", "vmName": "vm-web-01", "status": "running" },
      { "vmId": "...", "vmName": "vm-web-02", "status": "running" },
      { "vmId": "...", "vmName": "vm-web-03", "status": "pending" },
      { "vmId": "...", "vmName": "vm-app-01", "status": "pending" },
      { "vmId": "...", "vmName": "vm-app-02", "status": "pending" }
    ],
    "websocketChannel": "exec_xyz789"
  }
}
```

#### Create Schedule

```http
POST /api/v1/lift-cleanse/schedules
Content-Type: application/json

{
  "name": "Weekly Cleanup - Production",
  "description": "Weekly cleanup of temp files on production servers",
  "scriptId": "clx1abc123",
  "scheduleType": "recurring",
  "cronExpression": "0 3 * * 0",  // Every Sunday at 3 AM
  "timezone": "America/New_York",
  "targetConfig": {
    "type": "tag",
    "tags": [{ "key": "Environment", "value": "Production" }]
  },
  "parameters": {
    "CleanupDays": "7"
  },
  "maxParallel": 10
}
```

---

## 8. WebSocket Real-time Streaming

### WebSocket Implementation

The system uses WebSocket for real-time output streaming during script execution.

### Connection Flow

```
┌──────────────┐                    ┌──────────────┐                    ┌──────────────┐
│   Browser    │                    │   Backend    │                    │    Azure     │
└──────┬───────┘                    └──────┬───────┘                    └──────┬───────┘
       │                                   │                                   │
       │ 1. POST /execute                  │                                   │
       │──────────────────────────────────>│                                   │
       │                                   │                                   │
       │ 2. Response: { executionId, wsChannel }                               │
       │<──────────────────────────────────│                                   │
       │                                   │                                   │
       │ 3. WebSocket Connect              │                                   │
       │   ws://host/ws?channel=exec_123   │                                   │
       │──────────────────────────────────>│                                   │
       │                                   │                                   │
       │ 4. WS: Connected                  │                                   │
       │<──────────────────────────────────│                                   │
       │                                   │                                   │
       │                                   │ 5. Run Command (for each VM)      │
       │                                   │──────────────────────────────────>│
       │                                   │                                   │
       │                                   │ 6. Poll for output (every 2s)     │
       │                                   │──────────────────────────────────>│
       │                                   │                                   │
       │                                   │ 7. Output chunk                   │
       │                                   │<──────────────────────────────────│
       │                                   │                                   │
       │ 8. WS: Output Event               │                                   │
       │<──────────────────────────────────│                                   │
       │                                   │                                   │
       │ ... (repeat 6-8 until complete)   │                                   │
       │                                   │                                   │
       │ 9. WS: Execution Complete         │                                   │
       │<──────────────────────────────────│                                   │
       │                                   │                                   │
       │ 10. WebSocket Close               │                                   │
       │──────────────────────────────────>│                                   │
       │                                   │                                   │
```

### WebSocket Events

#### Client → Server

```typescript
// Subscribe to execution updates
{ "type": "subscribe", "executionId": "exec_xyz789" }

// Subscribe to specific target
{ "type": "subscribe_target", "executionId": "exec_xyz789", "targetId": "target_abc" }

// Unsubscribe
{ "type": "unsubscribe", "executionId": "exec_xyz789" }
```

#### Server → Client

```typescript
// Execution status update
{
  "type": "execution_status",
  "executionId": "exec_xyz789",
  "status": "running",
  "successCount": 2,
  "failedCount": 0,
  "totalTargets": 5
}

// Target status update
{
  "type": "target_status",
  "executionId": "exec_xyz789",
  "targetId": "target_abc",
  "vmName": "vm-web-01",
  "status": "running"
}

// Output stream (incremental)
{
  "type": "output",
  "executionId": "exec_xyz789",
  "targetId": "target_abc",
  "vmName": "vm-web-01",
  "stream": "stdout",  // or "stderr"
  "content": "Installing package nginx...\n",
  "timestamp": "2026-01-08T10:30:45.123Z"
}

// Target completed
{
  "type": "target_complete",
  "executionId": "exec_xyz789",
  "targetId": "target_abc",
  "vmName": "vm-web-01",
  "status": "completed",
  "exitCode": 0,
  "duration": 45000  // milliseconds
}

// Execution completed
{
  "type": "execution_complete",
  "executionId": "exec_xyz789",
  "status": "completed",
  "successCount": 4,
  "failedCount": 1,
  "duration": 120000
}

// Error
{
  "type": "error",
  "executionId": "exec_xyz789",
  "targetId": "target_abc",
  "message": "VM agent not responding"
}
```

### Backend WebSocket Service

```typescript
// services/websocket.service.ts
import { WebSocketServer, WebSocket } from 'ws';

interface ExecutionChannel {
  executionId: string;
  clients: Set<WebSocket>;
}

class WebSocketService {
  private wss: WebSocketServer;
  private channels: Map<string, ExecutionChannel> = new Map();

  broadcast(executionId: string, event: object) {
    const channel = this.channels.get(executionId);
    if (channel) {
      const message = JSON.stringify(event);
      channel.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }
  }

  sendOutput(executionId: string, targetId: string, vmName: string, content: string, stream: 'stdout' | 'stderr') {
    this.broadcast(executionId, {
      type: 'output',
      executionId,
      targetId,
      vmName,
      stream,
      content,
      timestamp: new Date().toISOString()
    });
  }
}
```

---

## 9. Frontend UI Design

### Navigation Structure

```
/lift-cleanse                        → Dashboard (overview + quick actions)
/lift-cleanse/scripts                → Script Library
/lift-cleanse/scripts/new            → Create New Script
/lift-cleanse/scripts/:id            → View/Edit Script
/lift-cleanse/scripts/:id/execute    → Execute Script Wizard
/lift-cleanse/execute                → Ad-hoc Script Execution
/lift-cleanse/history                → Execution History
/lift-cleanse/history/:id            → Execution Details + Live Output
/lift-cleanse/schedules              → Schedule Manager
/lift-cleanse/schedules/new          → Create Schedule
/lift-cleanse/schedules/:id          → View/Edit Schedule
/lift-cleanse/vm-groups              → VM Group Manager
```

### Page Wireframes

#### Dashboard Page

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  🧹 Lift & Cleanse                                                              │
│  Post-migration VM management and script execution                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ Total Scripts   │  │ Active Schedules│  │ Running Now     │  │ Success Rate│ │
│  │      24         │  │      8          │  │      2          │  │    96.5%    │ │
│  │ 12 built-in     │  │ Next: 2h 15m    │  │ 5 VMs           │  │ Last 30 days│ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────┘ │
│                                                                                  │
│  Quick Actions                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ [📜 Script Library]  [▶️ Execute Script]  [📅 Schedules]  [⚙️ VM Groups] │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  Recent Executions                                               [View All →]   │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ ✅ Remove VMware Tools          5 VMs    Completed    2 mins ago        │    │
│  │ 🔄 Install Azure Monitor        3 VMs    Running      Just now          │    │
│  │ ✅ Configure NTP Settings       8 VMs    Completed    1 hour ago        │    │
│  │ ❌ Clean Temp Files             2 VMs    1 Failed     3 hours ago       │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  Upcoming Scheduled Runs                                         [View All →]   │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ 📅 Weekly Cleanup - Production    Sunday 3:00 AM    12 VMs   [Run Now] │    │
│  │ 📅 Daily Health Check             Tomorrow 6:00 AM   All VMs [Run Now] │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Script Library Page

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  📜 Script Library                                              [+ New Script]  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Filters:                                                                        │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────────────────┐ │
│  │ All Types ▼│  │ All OS    ▼│  │ All Cats  ▼│  │ 🔍 Search scripts...      │ │
│  └────────────┘  └────────────┘  └────────────┘  └────────────────────────────┘ │
│                                                                                  │
│  ☑ Show Built-in   ☑ Show Custom   ☑ Show Shared                               │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ 📜 Remove VMware Tools                                    🏷️ Built-in   │    │
│  │    Cleanup • Windows                                                     │    │
│  │    Removes VMware Tools, drivers, and registry entries after migration  │    │
│  │    ┌────────────────────────────────────────────────────────────────┐   │    │
│  │    │ [▶️ Execute]  [👁️ View]  [📋 Duplicate]                         │   │    │
│  │    └────────────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ 📜 Install Azure Monitor Agent                            🏷️ Built-in   │    │
│  │    Install • Both (Windows/Linux)                                        │    │
│  │    Installs and configures Azure Monitor Agent for log collection       │    │
│  │    Parameters: WorkspaceId, WorkspaceKey                                 │    │
│  │    ┌────────────────────────────────────────────────────────────────┐   │    │
│  │    │ [▶️ Execute]  [👁️ View]  [📋 Duplicate]                         │   │    │
│  │    └────────────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ 📜 Custom App Installation                    👤 You  •  🔗 Shared      │    │
│  │    Install • Windows                                                     │    │
│  │    Installs custom application via Chocolatey                           │    │
│  │    Parameters: PackageName, Version                                      │    │
│  │    ┌────────────────────────────────────────────────────────────────┐   │    │
│  │    │ [▶️ Execute]  [✏️ Edit]  [📋 Duplicate]  [🗑️ Delete]  [Unshare] │   │    │
│  │    └────────────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Script Editor Page

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ✏️ Create New Script                                     [Cancel] [💾 Save]    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ Name:         [Custom Cleanup Script                                  ] │    │
│  │ Description:  [Cleans up application temp files and logs              ] │    │
│  │ Category:     [Cleanup        ▼]     OS Target: [○ Windows ○ Linux ● Both] │
│  │ Timeout:      [1800] seconds         ☑ Run as Administrator              │   │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  Parameters (Key-Value):                                        [+ Add Parameter]│
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ Key: [DaysToKeep    ]  Description: [Days of logs to retain] ☑ Required │    │
│  │ Key: [AppPath       ]  Description: [Application path       ] ☐ Required │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  Script Content:                                         [Validate] [Format]    │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  1 │ param(                                                             │    │
│  │  2 │     [Parameter(Mandatory=$true)]                                   │    │
│  │  3 │     [int]$DaysToKeep,                                              │    │
│  │  4 │     [string]$AppPath = "C:\App"                                    │    │
│  │  5 │ )                                                                  │    │
│  │  6 │                                                                    │    │
│  │  7 │ $ErrorActionPreference = 'Stop'                                    │    │
│  │  8 │                                                                    │    │
│  │  9 │ Write-Host "Cleaning files older than $DaysToKeep days..."         │    │
│  │ 10 │ $cutoffDate = (Get-Date).AddDays(-$DaysToKeep)                     │    │
│  │ 11 │                                                                    │    │
│  │ 12 │ Get-ChildItem -Path "$AppPath\Logs" -Recurse |                     │    │
│  │ 13 │     Where-Object { $_.LastWriteTime -lt $cutoffDate } |            │    │
│  │ 14 │     Remove-Item -Force                                             │    │
│  │ 15 │                                                                    │    │
│  │ 16 │ Write-Host "Cleanup complete!"                                     │    │
│  │    │                                                                    │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  Tags:                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ [cleanup] [logs] [maintenance] [+ Add tag...]                           │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  Sharing:   ☑ Share with organization   (Others can view and execute)          │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Execution Wizard

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ▶️ Execute Script: Remove VMware Tools                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Step 1: Select Target VMs                                                       │
│  ─────────────────────────────────────────────────────────────────────────────  │
│                                                                                  │
│  Target by:  [● Explicit Selection  ○ Tags  ○ Resource Group  ○ VM Group]      │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ 🔍 Filter VMs...                                                        │    │
│  ├─────────────────────────────────────────────────────────────────────────┤    │
│  │ ☑ vm-web-01      Windows Server 2019    rg-production   Running    🟢  │    │
│  │ ☑ vm-web-02      Windows Server 2019    rg-production   Running    🟢  │    │
│  │ ☐ vm-db-01       Ubuntu 22.04           rg-production   Running    🟢  │    │
│  │   ⚠️ Script requires Windows                                            │    │
│  │ ☑ vm-app-01      Windows Server 2022    rg-staging      Running    🟢  │    │
│  │ ☐ vm-test-01     Windows Server 2019    rg-dev          Stopped    🔴  │    │
│  │   ⚠️ VM is not running                                                  │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  Selected: 3 VMs (Windows only)              [Select All Compatible] [Clear]    │
│                                                                                  │
│  Step 2: Parameters                                                              │
│  ─────────────────────────────────────────────────────────────────────────────  │
│                                                                                  │
│  ✅ No parameters required for this script                                       │
│                                                                                  │
│  Step 3: Execution Settings                                                      │
│  ─────────────────────────────────────────────────────────────────────────────  │
│                                                                                  │
│  Max parallel executions: [5  ▼]    (How many VMs to run on simultaneously)     │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ ⚠️ Warning: This script will remove VMware Tools from the selected VMs. │    │
│  │    Ensure the VMs are running on Azure and no longer need VMware.       │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│                                               [Cancel]  [▶️ Execute Now]         │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Live Execution Output

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ⚡ Execution: exec_xyz789                                    [Cancel Execution]│
│  Script: Remove VMware Tools           Started: 2 mins ago    Status: 🔄 Running│
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Progress: ████████████░░░░░░░░  60%   (3/5 completed)                          │
│                                                                                  │
│  Target VMs:                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ vm-web-01     ✅ Completed   Exit: 0    Duration: 45s    [View Output]  │    │
│  │ vm-web-02     ✅ Completed   Exit: 0    Duration: 42s    [View Output]  │    │
│  │ vm-app-01     🔄 Running     ████░░░░   30s elapsed      [View Output]  │    │
│  │ vm-app-02     ⏳ Pending     Queued                                      │    │
│  │ vm-web-03     ❌ Failed      Exit: 1    Duration: 12s    [View Output]  │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  Live Output: vm-app-01                                          [Copy] [Clear] │
│  ─────────────────────────────────────────────────────────────────────────────  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ PS> Starting VMware Tools removal...                                    │    │
│  │ PS> Checking for running VMware services...                             │    │
│  │ PS> Found services: VMTools, VMwareToolsService                         │    │
│  │ PS> Stopping VMTools...                                                 │    │
│  │ PS> Stopping VMwareToolsService...                                      │    │
│  │ PS> Services stopped successfully                                       │    │
│  │ PS> Uninstalling VMware Tools...                                        │    │
│  │ PS> Removing from Programs and Features...                              │    │
│  │ 🔄 Waiting for output...                                                │    │
│  │                                                                         │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                   [Auto-scroll] │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Schedule Manager

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  📅 Scheduled Executions                                     [+ New Schedule]   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Active Schedules                                                                │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ 📅 Weekly Cleanup - Production                                🟢 Active │    │
│  │    Script: Clean Temp Files                                              │    │
│  │    Schedule: Every Sunday at 3:00 AM (America/New_York)                 │    │
│  │    Targets: Tag: Environment=Production (12 VMs)                         │    │
│  │    Next Run: Jan 12, 2026 3:00 AM                                        │    │
│  │    Last Run: Jan 5, 2026 3:00 AM  ✅ Success (12/12)                     │    │
│  │    ┌────────────────────────────────────────────────────────────────┐   │    │
│  │    │ [▶️ Run Now]  [✏️ Edit]  [⏸️ Disable]  [🗑️ Delete]  [📊 History] │   │    │
│  │    └────────────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ 📅 Daily Health Check                                        🟢 Active │    │
│  │    Script: System Health Check                                           │    │
│  │    Schedule: Every day at 6:00 AM (UTC)                                  │    │
│  │    Targets: All VMs in subscription                                      │    │
│  │    Next Run: Jan 9, 2026 6:00 AM                                         │    │
│  │    Last Run: Jan 8, 2026 6:00 AM  ⚠️ Partial (45/48, 3 failed)           │    │
│  │    ┌────────────────────────────────────────────────────────────────┐   │    │
│  │    │ [▶️ Run Now]  [✏️ Edit]  [⏸️ Disable]  [🗑️ Delete]  [📊 History] │   │    │
│  │    └────────────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  Disabled Schedules                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ 📅 Monthly Patching                                         🔴 Disabled │    │
│  │    Script: Windows Update Check                                          │    │
│  │    Schedule: First Sunday of month at 2:00 AM                           │    │
│  │    ┌────────────────────────────────────────────────────────────────┐   │    │
│  │    │ [▶️ Enable]  [✏️ Edit]  [🗑️ Delete]                             │   │    │
│  │    └────────────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Built-in Script Library

### Pre-packaged Scripts

#### Cleanup Category

| Script Name | OS | Description | Parameters |
|-------------|-----|-------------|------------|
| Remove VMware Tools | Windows | Uninstalls VMware Tools, drivers, and cleans registry | None |
| Remove VMware Guest Agent | Linux | Removes open-vm-tools and related packages | None |
| Remove Hyper-V Integration | Windows | Removes Hyper-V integration components | None |
| Clean Temp Files | Both | Removes temporary files and caches | DaysOld (optional) |
| Remove Old User Profiles | Windows | Removes stale user profiles | DaysInactive |
| Clear Windows Update Cache | Windows | Clears Windows Update download cache | None |
| Clean Package Cache | Linux | Clears apt/yum package cache | None |

#### Install Category

| Script Name | OS | Description | Parameters |
|-------------|-----|-------------|------------|
| Install Azure Monitor Agent | Both | Installs Azure Monitor Agent | WorkspaceId, WorkspaceKey |
| Install Azure Backup Agent | Windows | Installs MARS agent | VaultCredentials |
| Install Log Analytics Agent | Both | Installs OMS agent (legacy) | WorkspaceId, WorkspaceKey |
| Enable Azure Disk Encryption | Both | Enables disk encryption | KeyVaultUrl, KeyEncryptionKeyUrl |
| Install Chocolatey | Windows | Installs Chocolatey package manager | None |
| Install Custom Package | Windows | Installs package via Chocolatey | PackageName, Version |
| Install Custom Package | Linux | Installs package via apt/yum | PackageName |

#### Configure Category

| Script Name | OS | Description | Parameters |
|-------------|-----|-------------|------------|
| Configure Azure NTP | Both | Sets Azure NTP servers | None |
| Update DNS Settings | Both | Configures DNS servers | PrimaryDNS, SecondaryDNS |
| Enable RDP | Windows | Enables Remote Desktop | Port (optional) |
| Enable SSH | Linux | Enables and configures SSH | Port (optional) |
| Configure Windows Firewall | Windows | Opens required Azure ports | AdditionalPorts |
| Join Azure AD | Windows | Joins VM to Azure AD | TenantId |
| Set Timezone | Both | Configures timezone | Timezone |
| Configure Proxy | Both | Sets system proxy | ProxyServer, ProxyPort |

#### Diagnostic Category

| Script Name | OS | Description | Parameters |
|-------------|-----|-------------|------------|
| System Health Check | Both | Collects system health info | None |
| Network Connectivity Test | Both | Tests network connectivity | TestEndpoints |
| Disk Space Report | Both | Reports disk usage | None |
| Running Services Report | Both | Lists running services | None |
| Memory Usage Report | Both | Reports memory utilization | None |
| Installed Software Report | Windows | Lists installed applications | None |
| Installed Packages Report | Linux | Lists installed packages | None |
| Event Log Export | Windows | Exports recent event logs | Hours, LogName |
| System Log Export | Linux | Exports syslog entries | Hours |

---

## 11. Scheduling System

### Schedule Types

#### One-Time Schedule

Execute a script at a specific date and time.

```json
{
  "scheduleType": "once",
  "runAt": "2026-01-15T03:00:00Z",
  "timezone": "America/New_York"
}
```

#### Recurring Schedule (Cron)

Execute on a recurring basis using cron expressions.

```json
{
  "scheduleType": "recurring",
  "cronExpression": "0 3 * * 0",  // Every Sunday at 3 AM
  "timezone": "UTC"
}
```

### Cron Expression Reference

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6) (Sunday = 0)
│ │ │ │ │
* * * * *
```

**Common Examples:**

| Expression | Description |
|------------|-------------|
| `0 3 * * *` | Daily at 3:00 AM |
| `0 3 * * 0` | Every Sunday at 3:00 AM |
| `0 3 1 * *` | First day of month at 3:00 AM |
| `0 */4 * * *` | Every 4 hours |
| `0 3 * * 1-5` | Weekdays at 3:00 AM |
| `0 3 1,15 * *` | 1st and 15th of month at 3:00 AM |

### Scheduler Service

The scheduler uses a background job to check for due schedules:

```typescript
// Pseudo-code for scheduler service
class SchedulerService {
  // Runs every minute
  async checkDueSchedules() {
    const dueSchedules = await prisma.scriptSchedule.findMany({
      where: {
        isEnabled: true,
        nextRunAt: { lte: new Date() }
      }
    });

    for (const schedule of dueSchedules) {
      await this.executeSchedule(schedule);
      await this.updateNextRun(schedule);
    }
  }

  async calculateNextRun(schedule: ScriptSchedule): Promise<Date> {
    if (schedule.scheduleType === 'once') {
      return null; // Disable after one run
    }
    
    // Parse cron and calculate next occurrence
    const parser = require('cron-parser');
    const interval = parser.parseExpression(schedule.cronExpression, {
      currentDate: new Date(),
      tz: schedule.timezone
    });
    return interval.next().toDate();
  }
}
```

---

## 12. VM Targeting & Grouping

### Targeting Methods

#### 1. Explicit Selection

Manually select specific VMs by name or resource ID.

```json
{
  "type": "explicit",
  "vmIds": [
    "/subscriptions/xxx/resourceGroups/rg1/providers/Microsoft.Compute/virtualMachines/vm1",
    "/subscriptions/xxx/resourceGroups/rg1/providers/Microsoft.Compute/virtualMachines/vm2"
  ]
}
```

#### 2. Tag-Based Selection

Select VMs matching specific tags.

```json
{
  "type": "tag",
  "tags": [
    { "key": "Environment", "value": "Production" },
    { "key": "Role", "value": "WebServer" }
  ],
  "matchAll": true  // All tags must match (AND) vs any tag (OR)
}
```

#### 3. Resource Group Selection

Select all VMs in specific resource groups.

```json
{
  "type": "resourceGroup",
  "resourceGroups": ["rg-web-servers", "rg-app-servers"]
}
```

#### 4. Saved VM Groups

Use pre-defined VM groups (static or dynamic).

```json
{
  "type": "vmGroup",
  "groupIds": ["group-production-web", "group-staging-all"]
}
```

#### 5. Mixed Selection

Combine multiple targeting methods.

```json
{
  "type": "mixed",
  "explicit": ["/subscriptions/.../vm1"],
  "tags": [{ "key": "Environment", "value": "Production" }],
  "resourceGroups": ["rg-critical"],
  "vmGroups": ["group-1"]
}
```

### VM Group Types

#### Static Groups

Fixed list of VMs that must be manually updated.

```json
{
  "name": "Critical Servers",
  "groupType": "static",
  "vmIds": [
    "/subscriptions/.../vm-db-primary",
    "/subscriptions/.../vm-db-secondary",
    "/subscriptions/.../vm-web-main"
  ]
}
```

#### Dynamic Groups

Automatically updated based on filter criteria.

```json
{
  "name": "Production Web Servers",
  "groupType": "dynamic",
  "filterType": "tag",
  "filterKey": "Environment",
  "filterValue": "Production"
}
```

### VM Discovery API

```typescript
// services/azure-vm.service.ts

interface AzureVM {
  id: string;           // Full resource ID
  name: string;
  resourceGroup: string;
  subscriptionId: string;
  location: string;
  osType: 'Windows' | 'Linux';
  osVersion: string;
  vmSize: string;
  powerState: 'Running' | 'Stopped' | 'Deallocated';
  tags: Record<string, string>;
  provisioningState: string;
}

class AzureVMService {
  // List all VMs in subscription
  async listVMs(filters?: VMFilters): Promise<AzureVM[]>;
  
  // Get VM details
  async getVM(vmId: string): Promise<AzureVM>;
  
  // Get all unique tags
  async getAllTags(): Promise<{ key: string; values: string[] }[]>;
  
  // Get resource groups containing VMs
  async getResourceGroupsWithVMs(): Promise<string[]>;
  
  // Resolve targeting config to actual VMs
  async resolveTargets(targetConfig: TargetConfig): Promise<AzureVM[]>;
}
```

---

## 13. Security Considerations

### Authentication & Authorization

| Concern | Implementation |
|---------|----------------|
| **API Authentication** | Uses existing DrMigrate session auth |
| **Azure Access** | Uses existing Service Principal from Settings page |
| **Azure Credentials** | Stored in existing `AzureConfig` table (not duplicated) |
| **Script Ownership** | Only owners can edit/delete custom scripts |
| **Sharing Permissions** | Shared scripts: execute-only by default |

> **Note:** No additional Azure credentials are required. The Service Principal configured in Settings must have the additional RBAC permissions listed below for VM Run Command operations.

---

### Script Upload Options

Users can add scripts in multiple ways:

| Method | Description |
|--------|-------------|
| **Editor** | Type/paste directly in Monaco editor |
| **File Upload** | Upload `.ps1`, `.sh`, `.bash` files (drag & drop or file picker) |
| **Import from URL** | Import from GitHub raw URLs or Gist |
| **Duplicate Built-in** | Copy a built-in script and customize |

#### File Upload Restrictions

```typescript
const ALLOWED_EXTENSIONS = ['.ps1', '.sh', '.bash', '.txt'];
const MAX_FILE_SIZE = 1024 * 1024; // 1MB max
const MAX_SCRIPT_LINES = 5000;     // Prevent extremely large scripts
```

---

### Script Security Scanning

**All scripts (uploaded, pasted, or imported) go through security validation before saving.**

#### Security Scan Pipeline

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Upload/   │────▶│   Static    │────▶│   Pattern   │────▶│   Risk      │
│   Editor    │     │   Analysis  │     │   Matching  │     │   Scoring   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                           │                   │                   │
                           ▼                   ▼                   ▼
                    ┌──────────────────────────────────────────────────┐
                    │              Security Report                      │
                    │  • Risk Level: Low/Medium/High/Critical           │
                    │  • Detected Issues: [list]                        │
                    │  • Recommendations: [list]                        │
                    └──────────────────────────────────────────────────┘
                                          │
                                          ▼
                    ┌──────────────────────────────────────────────────┐
                    │              Action Based on Risk                 │
                    │  • Low: Allow save                                │
                    │  • Medium: Warn, require acknowledgment           │
                    │  • High: Require admin approval                   │
                    │  • Critical: Block save completely                │
                    └──────────────────────────────────────────────────┘
```

#### Dangerous Command Detection

The scanner checks for potentially malicious patterns:

**PowerShell Dangerous Patterns:**

| Pattern | Risk | Description |
|---------|------|-------------|
| `Remove-Item -Recurse C:\Windows` | 🔴 Critical | Deleting system files |
| `Format-Volume`, `Clear-Disk` | 🔴 Critical | Disk wiping |
| `Invoke-Expression`, `iex` | 🟠 High | Dynamic code execution |
| `-EncodedCommand` | 🟠 High | Obfuscated commands |
| `[Convert]::FromBase64String` | 🟠 High | Encoded payloads |
| `New-LocalUser`, `Add-LocalGroupMember` | 🟠 High | Account creation |
| `New-ScheduledTask` | 🟠 High | Persistence mechanism |
| `Invoke-WebRequest` to non-Azure URLs | 🟡 Medium | External downloads |
| `Start-Process -Verb RunAs` | 🟡 Medium | Privilege elevation |
| `Get-Credential`, `ConvertTo-SecureString` | 🟡 Medium | Credential handling |
| `Stop-Service`, `Stop-Process` | 🟢 Low | Service/process control |

**Bash Dangerous Patterns:**

| Pattern | Risk | Description |
|---------|------|-------------|
| `rm -rf /`, `rm -rf /*` | 🔴 Critical | System destruction |
| `dd if=/dev/zero of=/dev/sda` | 🔴 Critical | Disk wiping |
| `mkfs`, `fdisk` | 🔴 Critical | Disk formatting |
| `eval`, `exec` | 🟠 High | Dynamic execution |
| `base64 -d \| bash` | 🟠 High | Encoded execution |
| `curl \| bash`, `wget \| sh` | 🟠 High | Remote execution |
| `useradd`, `usermod` | 🟠 High | User manipulation |
| `crontab -e`, `/etc/cron.d/` | 🟠 High | Persistence |
| `nc -e`, `bash -i >& /dev/tcp` | 🔴 Critical | Reverse shell |
| `chmod 777`, `chmod +s` | 🟡 Medium | Permission changes |
| `iptables -F` | 🟡 Medium | Firewall changes |

**Universal Dangerous Patterns:**

| Pattern | Risk | Description |
|---------|------|-------------|
| Cryptocurrency wallet addresses | 🔴 Critical | Crypto miner |
| Known malware signatures | 🔴 Critical | Malware |
| Obfuscated variable names (`$_0x...`) | 🟠 High | Obfuscation |
| IP addresses (non-Azure ranges) | 🟡 Medium | External connections |
| Suspicious domain patterns | 🟠 High | C2 communication |

#### Security Scanning Service

```typescript
// services/lift-cleanse/script-security.service.ts

interface SecurityScanResult {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  score: number;          // 0-100 (higher = more risky)
  issues: SecurityIssue[];
  recommendations: string[];
  canSave: boolean;
  requiresApproval: boolean;
}

interface SecurityIssue {
  severity: 'info' | 'warning' | 'danger' | 'critical';
  line: number;
  column: number;
  pattern: string;
  description: string;
  matchedText: string;
}

class ScriptSecurityService {
  
  // Scan a script for security issues
  async scanScript(content: string, scriptType: 'powershell' | 'bash'): Promise<SecurityScanResult> {
    const issues: SecurityIssue[] = [];
    
    // 1. Check file size and line count
    this.checkSize(content, issues);
    
    // 2. Run pattern-based detection
    const patterns = scriptType === 'powershell' 
      ? this.powershellPatterns 
      : this.bashPatterns;
    this.scanPatterns(content, patterns, issues);
    
    // 3. Check for obfuscation
    this.checkObfuscation(content, issues);
    
    // 4. Check for external connections
    this.checkExternalConnections(content, issues);
    
    // 5. Calculate risk score
    const score = this.calculateRiskScore(issues);
    const riskLevel = this.getRiskLevel(score);
    
    return {
      riskLevel,
      score,
      issues,
      recommendations: this.getRecommendations(issues),
      canSave: riskLevel !== 'critical',
      requiresApproval: riskLevel === 'high',
    };
  }

  private powershellPatterns: DangerPattern[] = [
    { 
      pattern: /Remove-Item\s+.*-Recurse.*\\(Windows|System32|Program Files)/i,
      severity: 'critical',
      description: 'Attempting to delete system directories'
    },
    {
      pattern: /Invoke-Expression|iex\s*\(/i,
      severity: 'danger',
      description: 'Dynamic code execution can run arbitrary code'
    },
    {
      pattern: /-EncodedCommand/i,
      severity: 'danger',
      description: 'Encoded commands can hide malicious code'
    },
    // ... more patterns
  ];

  private bashPatterns: DangerPattern[] = [
    {
      pattern: /rm\s+-rf\s+(\/|\/\*|\$\(|`)/,
      severity: 'critical',
      description: 'Dangerous recursive deletion of root or variable path'
    },
    {
      pattern: /curl.*\|\s*(bash|sh)|wget.*\|\s*(bash|sh)/i,
      severity: 'danger',
      description: 'Downloading and executing remote scripts'
    },
    {
      pattern: /bash\s+-i\s+>&\s*\/dev\/tcp/,
      severity: 'critical',
      description: 'Reverse shell detected'
    },
    // ... more patterns
  ];
}
```

#### UI Security Indicators

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Create New Script                                                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Script Content:                              [Upload File] [Import from URL]   │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  1 │ $ErrorActionPreference = 'Stop'                                    │    │
│  │  2 │                                                                    │    │
│  │  3 │ # Download and install package                                     │    │
│  │  4 │ Invoke-WebRequest -Uri $PackageUrl -OutFile C:\temp\pkg.msi  ⚠️    │    │
│  │  5 │ Start-Process msiexec -ArgumentList "/i C:\temp\pkg.msi /qn"       │    │
│  │  6 │                                                                    │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ 🔒 Security Scan Results                                    Risk: 🟡 Medium │
│  ├─────────────────────────────────────────────────────────────────────────┤    │
│  │ ⚠️ Line 4: External download detected                                   │    │
│  │    Invoke-WebRequest downloads from external URL                        │    │
│  │    Recommendation: Ensure URL is trusted and from known source          │    │
│  │                                                                         │    │
│  │ ℹ️ Line 5: Process execution                                            │    │
│  │    Start-Process runs external program                                  │    │
│  │    Recommendation: Verify the installed package source                  │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ☑ I acknowledge the security warnings and confirm this script is safe          │
│                                                                                  │
│                                                      [Cancel]  [Save Script]    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### High-Risk Script Approval Workflow

For scripts with HIGH risk level, an approval workflow is required:

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ⚠️ Script Requires Approval                                                │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ This script contains high-risk patterns and requires admin approval        │
│ before it can be saved or executed.                                        │
│                                                                             │
│ Detected Issues:                                                            │
│ • Line 12: Invoke-Expression detected (dynamic code execution)             │
│ • Line 15: Encoded command parameter detected                               │
│                                                                             │
│ The script has been submitted for review.                                   │
│ You will be notified when it is approved or rejected.                       │
│                                                                             │
│ Request ID: REQ-2026-0108-001                                               │
│ Submitted: Jan 8, 2026 10:30 AM                                             │
│ Status: ⏳ Pending Review                                                   │
│                                                                             │
│                                                         [Close]             │
└────────────────────────────────────────────────────────────────────────────┘
```

---

### Runtime Protection

Even if a script passes security scanning, runtime protections apply:

| Protection | Implementation |
|------------|----------------|
| **Execution Timeout** | Azure Run Command: 90 min max |
| **Output Size Limit** | 4KB per command (Azure limit) |
| **VM Agent Isolation** | Scripts run via VM Agent, not direct shell |
| **No Persistent Access** | Each execution is isolated, no shell persistence |
| **Audit Logging** | Every execution logged with full script content |

---

### Administrative Controls

#### Role-Based Permissions

| Permission | Script Creator | Script User | Admin |
|------------|---------------|-------------|-------|
| View built-in scripts | ✅ | ✅ | ✅ |
| Execute built-in scripts | ✅ | ✅ | ✅ |
| Create custom scripts | ✅ | ❌ | ✅ |
| Edit own scripts | ✅ | ❌ | ✅ |
| Delete own scripts | ✅ | ❌ | ✅ |
| Approve high-risk scripts | ❌ | ❌ | ✅ |
| Execute without warnings | ❌ | ❌ | ✅ |
| View all execution logs | ❌ | ❌ | ✅ |

#### Script Approval Settings (Admin)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ ⚙️ Security Settings                                                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│ Script Creation Policy:                                                          │
│ ┌───────────────────────────────────────────────────────────────────────────┐   │
│ │ ○ Allow all users to create scripts                                       │   │
│ │ ● Only designated users can create scripts                                │   │
│ │ ○ Disable custom script creation (built-in only)                          │   │
│ └───────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│ Risk Level Handling:                                                             │
│ ┌───────────────────────────────────────────────────────────────────────────┐   │
│ │ Low Risk:      [Allow ▼]     (Save and execute immediately)               │   │
│ │ Medium Risk:   [Warn   ▼]    (Require user acknowledgment)                │   │
│ │ High Risk:     [Approve▼]    (Require admin approval)                     │   │
│ │ Critical Risk: [Block  ▼]    (Cannot be saved or executed)                │   │
│ └───────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│ Additional Security:                                                             │
│ ☑ Scan scripts on every edit (not just creation)                                │
│ ☑ Log all script content changes                                                │
│ ☑ Require re-approval if high-risk script is modified                          │
│ ☐ Block all external URL downloads in scripts                                  │
│ ☐ Block all network operations in scripts                                      │
│                                                                                  │
│                                                          [Save Settings]        │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

### Audit Trail

All actions are logged for compliance and investigation:

```typescript
interface ScriptAuditLog {
  id: string;
  timestamp: Date;
  action: 'created' | 'edited' | 'deleted' | 'executed' | 'approved' | 'rejected';
  userId: string;
  scriptId: string;
  scriptContent: string;    // Snapshot of script at time of action
  securityScan?: SecurityScanResult;
  targetVMs?: string[];
  parameters?: Record<string, string>;
  executionOutput?: string;
  ipAddress: string;
}
```

Audit logs capture:
- Who created/edited/executed the script
- Full script content at time of execution
- Security scan results
- Target VMs and parameters
- Complete output
- User's IP address
- Timestamps

---

### Azure RBAC Requirements

The service principal needs these permissions for VM Run Command:

```json
{
  "permissions": [
    "Microsoft.Compute/virtualMachines/read",
    "Microsoft.Compute/virtualMachines/runCommand/action",
    "Microsoft.Compute/virtualMachines/runCommands/read",
    "Microsoft.Compute/virtualMachines/runCommands/write",
    "Microsoft.Compute/virtualMachines/runCommands/delete"
  ]
}
```

**Recommended:** Create a custom role with only these permissions, following least-privilege principle.

---

## 14. File Structure

The Lift & Cleanse module integrates with the existing project structure. **Existing files are not modified** (except for adding navigation links).

```
apps/
├── api/
│   ├── prisma/
│   │   └── schema.prisma                    # ADD new models (don't remove existing)
│   │
│   └── src/
│       ├── routes/
│       │   ├── settings.ts                  # EXISTING - Azure config
│       │   ├── replication.ts               # EXISTING - Replication
│       │   ├── machines.ts                  # EXISTING - Machines
│       │   └── lift-cleanse.ts              # NEW - All lift-cleanse routes
│       │
│       ├── services/
│       │   ├── azure-config.service.ts      # EXISTING - REUSE for credentials
│       │   ├── activity.service.ts          # EXISTING - REUSE for audit logs
│       │   ├── replication.service.ts       # EXISTING - Reference pattern
│       │   │
│       │   ├── lift-cleanse/                # NEW - Module services
│       │   │   ├── script.service.ts        # Script CRUD operations
│       │   │   ├── execution.service.ts     # Execution orchestration
│       │   │   ├── scheduler.service.ts     # Schedule management
│       │   │   ├── vm-group.service.ts      # VM group management
│       │   │   └── index.ts                 # Service exports
│       │   │
│       │   └── azure-vm.service.ts          # NEW - Azure VM Run Command
│       │
│       ├── websocket/                       # NEW - WebSocket support
│       │   ├── server.ts                    # WebSocket server setup
│       │   └── handlers/
│       │       └── execution.handler.ts     # Execution streaming handler
│       │
│       └── scripts/                         # NEW - Built-in scripts
│           ├── index.ts                     # Script registry
│           ├── windows/
│           │   ├── cleanup/
│           │   │   ├── remove-vmware-tools.ps1
│           │   │   ├── clean-temp-files.ps1
│           │   │   └── ...
│           │   ├── install/
│           │   │   ├── install-azure-monitor.ps1
│           │   │   └── ...
│           │   ├── configure/
│           │   │   ├── configure-ntp.ps1
│           │   │   └── ...
│           │   └── diagnostic/
│           │       ├── system-health-check.ps1
│           │       └── ...
│           │
│           └── linux/
│               ├── cleanup/
│               │   ├── remove-vmware-tools.sh
│               │   └── ...
│               ├── install/
│               │   ├── install-azure-monitor.sh
│               │   └── ...
│               ├── configure/
│               │   └── ...
│               └── diagnostic/
│                   └── ...
│
└── web/
    └── src/
        ├── app/
        │   └── (dashboard)/
        │       ├── layout.tsx                   # EXISTING - UPDATE to add nav link
        │       ├── settings/                    # EXISTING - Azure config
        │       ├── machines/                    # EXISTING
        │       ├── replication/                 # EXISTING
        │       │
        │       └── lift-cleanse/                # NEW - Lift & Cleanse pages
        │           ├── page.tsx                 # Dashboard
        │           ├── scripts/
        │           │   ├── page.tsx             # Script library
        │           │   ├── new/
        │           │   │   └── page.tsx         # Create script
        │           │   └── [id]/
        │           │       ├── page.tsx         # View/edit script
        │           │       └── execute/
        │           │           └── page.tsx     # Execute wizard
        │           ├── execute/
        │           │   └── page.tsx             # Ad-hoc execution
        │           ├── history/
        │           │   ├── page.tsx             # Execution history
        │           │   └── [id]/
        │           │       └── page.tsx         # Execution details
        │           ├── schedules/
        │           │   ├── page.tsx             # Schedule list
        │           │   ├── new/
        │           │   │   └── page.tsx         # Create schedule
        │           │   └── [id]/
        │           │       └── page.tsx         # Edit schedule
        │           └── vm-groups/
        │               ├── page.tsx             # VM group list
        │               └── [id]/
        │                   └── page.tsx         # Edit group
        │
        ├── components/
        │   ├── ui/                              # EXISTING - Reuse UI components
        │   │   ├── button.tsx
        │   │   ├── card.tsx
        │   │   ├── dialog.tsx
        │   │   └── ...
        │   │
        │   └── lift-cleanse/                    # NEW - Module-specific components
        │       ├── ScriptCard.tsx               # Script display card
        │       ├── ScriptEditor.tsx             # Monaco editor wrapper
        │       ├── VMSelector.tsx               # VM selection component
        │       ├── ParameterForm.tsx            # Parameter input form
        │       ├── ExecutionOutput.tsx          # Live output display
        │       ├── ExecutionProgress.tsx        # Progress indicator
        │       ├── ScheduleForm.tsx             # Schedule configuration
        │       └── CronBuilder.tsx              # Cron expression builder
        │
        ├── hooks/
        │   └── lift-cleanse/                    # NEW - Module hooks
        │       ├── useScripts.ts                # Script queries
        │       ├── useExecution.ts              # Execution mutations
        │       ├── useExecutionWebSocket.ts     # WebSocket hook
        │       ├── useSchedules.ts              # Schedule queries
        │       └── useVMs.ts                    # VM queries
        │
        └── lib/
            ├── api.ts                           # EXISTING - ADD lift-cleanse endpoints
            └── lift-cleanse/                    # NEW - Module-specific lib
                └── types.ts                     # TypeScript types
```

---

## 15. Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Database & Core Services**
- [ ] Add Prisma schema models
- [ ] Run database migrations
- [ ] Implement Azure VM service (list VMs, run command)
- [ ] Create script service (CRUD operations)
- [ ] Create execution service (single VM execution)
- [ ] Basic API routes

**Deliverables:**
- Execute a built-in script on a single VM via API
- View execution output after completion

---

### Phase 2: Multi-VM & WebSocket (Week 2-3)

**Parallel Execution & Live Streaming**
- [ ] Implement parallel execution with concurrency limit
- [ ] Set up WebSocket server
- [ ] Implement execution streaming handler
- [ ] Create execution polling service
- [ ] Frontend WebSocket hook

**Deliverables:**
- Execute scripts on multiple VMs in parallel
- View live output in browser via WebSocket

---

### Phase 3: UI - Script Library (Week 3-4)

**Script Management UI**
- [ ] Script library page with filters
- [ ] Script editor with Monaco
- [ ] Script validation endpoint
- [ ] Parameter configuration UI
- [ ] Script sharing functionality

**Deliverables:**
- Full script CRUD from UI
- Create and edit custom scripts
- Share scripts with organization

---

### Phase 4: UI - Execution (Week 4-5)

**Execution Interface**
- [ ] VM selector component (explicit, tags, groups)
- [ ] Execution wizard
- [ ] Live execution output page
- [ ] Execution history page
- [ ] Retry failed targets

**Deliverables:**
- Execute scripts from UI with VM selection
- View live output with progress
- Review execution history

---

### Phase 5: Scheduling (Week 5-6)

**Schedule Management**
- [ ] Scheduler background service
- [ ] Schedule CRUD API
- [ ] Cron expression builder UI
- [ ] Schedule management page
- [ ] Schedule execution history

**Deliverables:**
- Create one-time and recurring schedules
- Automatic execution of scheduled scripts
- View schedule history

---

### Phase 6: VM Groups & Polish (Week 6-7)

**Advanced Features**
- [ ] VM group service
- [ ] VM group UI
- [ ] Dynamic group resolution
- [ ] Built-in script library (all scripts)
- [ ] Error handling improvements
- [ ] Performance optimization

**Deliverables:**
- Create and use VM groups
- Full built-in script library
- Production-ready module

---

## 16. API Reference

### Full API Endpoint List

#### Scripts

```
GET    /api/v1/lift-cleanse/scripts
GET    /api/v1/lift-cleanse/scripts/:id
POST   /api/v1/lift-cleanse/scripts
PUT    /api/v1/lift-cleanse/scripts/:id
DELETE /api/v1/lift-cleanse/scripts/:id
POST   /api/v1/lift-cleanse/scripts/:id/duplicate
POST   /api/v1/lift-cleanse/scripts/:id/share
DELETE /api/v1/lift-cleanse/scripts/:id/share
POST   /api/v1/lift-cleanse/scripts/:id/validate
```

#### Execution

```
POST   /api/v1/lift-cleanse/execute
POST   /api/v1/lift-cleanse/execute/adhoc
GET    /api/v1/lift-cleanse/executions
GET    /api/v1/lift-cleanse/executions/:id
GET    /api/v1/lift-cleanse/executions/:id/targets
GET    /api/v1/lift-cleanse/executions/:id/targets/:targetId
POST   /api/v1/lift-cleanse/executions/:id/cancel
POST   /api/v1/lift-cleanse/executions/:id/retry
```

#### Schedules

```
GET    /api/v1/lift-cleanse/schedules
GET    /api/v1/lift-cleanse/schedules/:id
POST   /api/v1/lift-cleanse/schedules
PUT    /api/v1/lift-cleanse/schedules/:id
DELETE /api/v1/lift-cleanse/schedules/:id
POST   /api/v1/lift-cleanse/schedules/:id/enable
POST   /api/v1/lift-cleanse/schedules/:id/disable
POST   /api/v1/lift-cleanse/schedules/:id/run-now
GET    /api/v1/lift-cleanse/schedules/:id/history
```

#### VMs & Groups

```
GET    /api/v1/lift-cleanse/vms
GET    /api/v1/lift-cleanse/vms/:id
GET    /api/v1/lift-cleanse/vms/tags
GET    /api/v1/lift-cleanse/vms/resource-groups
POST   /api/v1/lift-cleanse/vms/resolve-targets
GET    /api/v1/lift-cleanse/vm-groups
GET    /api/v1/lift-cleanse/vm-groups/:id
POST   /api/v1/lift-cleanse/vm-groups
PUT    /api/v1/lift-cleanse/vm-groups/:id
DELETE /api/v1/lift-cleanse/vm-groups/:id
GET    /api/v1/lift-cleanse/vm-groups/:id/members
```

#### WebSocket

```
WS     /ws?channel={executionId}

Events (Server → Client):
- execution_status
- target_status
- output
- target_complete
- execution_complete
- error
```

---

## Appendix A: Sample Built-in Scripts

### Remove VMware Tools (Windows)

```powershell
# Remove VMware Tools - Windows
# Category: Cleanup
# Description: Removes VMware Tools and related components after migration

$ErrorActionPreference = 'Stop'

Write-Host "=== VMware Tools Removal Script ===" -ForegroundColor Cyan
Write-Host "Starting removal process..."

# Stop VMware services
$vmwareServices = Get-Service -Name "VMware*", "vmtools*" -ErrorAction SilentlyContinue
if ($vmwareServices) {
    Write-Host "Stopping VMware services..."
    $vmwareServices | Stop-Service -Force -ErrorAction SilentlyContinue
    Write-Host "Services stopped."
} else {
    Write-Host "No VMware services found."
}

# Uninstall VMware Tools
$uninstallKeys = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
)

$vmwareProduct = Get-ItemProperty $uninstallKeys -ErrorAction SilentlyContinue | 
    Where-Object { $_.DisplayName -like "*VMware Tools*" }

if ($vmwareProduct) {
    Write-Host "Found VMware Tools installation. Uninstalling..."
    $uninstallString = $vmwareProduct.UninstallString
    if ($uninstallString) {
        Start-Process "msiexec.exe" -ArgumentList "/x $($vmwareProduct.PSChildName) /qn /norestart" -Wait
        Write-Host "VMware Tools uninstalled."
    }
} else {
    Write-Host "VMware Tools not found in installed programs."
}

# Clean up VMware registry entries
Write-Host "Cleaning registry entries..."
$registryPaths = @(
    "HKLM:\SOFTWARE\VMware, Inc.",
    "HKLM:\SOFTWARE\WOW6432Node\VMware, Inc."
)

foreach ($path in $registryPaths) {
    if (Test-Path $path) {
        Remove-Item -Path $path -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Removed: $path"
    }
}

# Remove VMware drivers
Write-Host "Removing VMware drivers..."
$drivers = Get-WindowsDriver -Online | Where-Object { $_.ProviderName -like "*VMware*" }
foreach ($driver in $drivers) {
    pnputil /delete-driver $driver.Driver /force 2>$null
}

Write-Host ""
Write-Host "=== VMware Tools removal complete ===" -ForegroundColor Green
Write-Host "A system restart may be required."
```

### Install Azure Monitor Agent (Linux)

```bash
#!/bin/bash
# Install Azure Monitor Agent - Linux
# Category: Install
# Parameters: WorkspaceId, WorkspaceKey

set -e

WORKSPACE_ID="${1:?WorkspaceId is required}"
WORKSPACE_KEY="${2:?WorkspaceKey is required}"

echo "=== Azure Monitor Agent Installation ==="
echo "Installing Azure Monitor Agent..."

# Detect package manager
if command -v apt-get &> /dev/null; then
    PKG_MANAGER="apt"
elif command -v yum &> /dev/null; then
    PKG_MANAGER="yum"
elif command -v dnf &> /dev/null; then
    PKG_MANAGER="dnf"
else
    echo "Error: Unsupported package manager"
    exit 1
fi

echo "Detected package manager: $PKG_MANAGER"

# Download and install the agent
echo "Downloading Azure Monitor Agent..."
wget https://raw.githubusercontent.com/Microsoft/OMS-Agent-for-Linux/master/installer/scripts/onboard_agent.sh -O /tmp/onboard_agent.sh

echo "Installing agent..."
chmod +x /tmp/onboard_agent.sh
/tmp/onboard_agent.sh -w "$WORKSPACE_ID" -s "$WORKSPACE_KEY" -d opinsights.azure.com

# Verify installation
if systemctl is-active --quiet omsagent; then
    echo "Azure Monitor Agent installed and running successfully!"
else
    echo "Warning: Agent installed but service not running"
    systemctl status omsagent
fi

echo ""
echo "=== Installation Complete ==="
```

---

## Appendix B: Error Codes

| Code | Description |
|------|-------------|
| `SCRIPT_NOT_FOUND` | Specified script does not exist |
| `SCRIPT_VALIDATION_FAILED` | Script syntax validation failed |
| `EXECUTION_NOT_FOUND` | Specified execution does not exist |
| `NO_VALID_TARGETS` | No VMs matched the target criteria |
| `VM_NOT_RUNNING` | Target VM is not in running state |
| `VM_AGENT_ERROR` | Azure VM Agent not responding |
| `EXECUTION_TIMEOUT` | Script execution exceeded timeout |
| `PERMISSION_DENIED` | User lacks permission for this action |
| `SCHEDULE_CONFLICT` | Schedule timing conflicts with existing |
| `AZURE_API_ERROR` | Azure API returned an error |

---

*Document End*

