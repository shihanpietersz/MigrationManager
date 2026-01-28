# DrMigrate Azure Sync - Enterprise Security Plan

> **A+ Enterprise-Grade Security Implementation**
> 
> This document provides a complete security architecture for securing the frontend-backend
> communication with support for multiple deployment scenarios: single VM, containers,
> or distributed deployment.

---

## Executive Summary

### Current State: CRITICAL SECURITY GAPS

| Finding | Severity | Status |
|---------|----------|--------|
| No authentication on API endpoints | 🔴 CRITICAL | Not implemented |
| No authorization/RBAC | 🔴 CRITICAL | Not implemented |
| Azure credentials stored plaintext | 🔴 CRITICAL | SQLite plaintext |
| MSAL packages installed but unused | 🟠 HIGH | Code exists, not wired |
| Swagger UI exposed in all environments | 🟠 HIGH | /docs accessible |
| No rate limiting | 🟠 HIGH | DoS vulnerable |
| No HTTPS enforcement | 🟠 HIGH | HTTP only |
| No CSRF protection | 🟡 MEDIUM | Needed with cookies |
| No input validation middleware | 🟡 MEDIUM | Per-route only |

### Target State: Enterprise A+ Security

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         ENTERPRISE SECURITY ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐  │
│   │   Browser   │────▶│   Azure AD  │────▶│   Next.js   │────▶│   Fastify   │  │
│   │             │     │   (MSAL)    │     │   + Auth    │     │   + JWT     │  │
│   └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘  │
│                                                                      │          │
│   Security Layers:                                                   │          │
│   ✅ Azure AD Authentication (MSAL.js)                              │          │
│   ✅ JWT Token Validation (RS256)                                    │          │
│   ✅ Role-Based Access Control (RBAC)                               ▼          │
│   ✅ HTTPS Everywhere                               ┌─────────────────────────┐ │
│   ✅ Rate Limiting                                  │   Secrets Encrypted     │ │
│   ✅ Request Validation                             │   (Azure Key Vault or   │ │
│   ✅ Audit Logging                                  │    local encryption)    │ │
│   ✅ Security Headers                               └─────────────────────────┘ │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Table of Contents

1. [Authentication Architecture](#1-authentication-architecture)
2. [Authorization (RBAC) Design](#2-authorization-rbac-design)
3. [Secrets Management](#3-secrets-management)
4. [API Security Middleware](#4-api-security-middleware)
5. [HTTPS Implementation](#5-https-implementation)
6. [Deployment Scenarios](#6-deployment-scenarios)
7. [Implementation Plan](#7-implementation-plan)
8. [Security Checklist](#8-security-checklist)

---

## 1. Authentication Architecture

### 1.1 Authentication Flow

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           AZURE AD AUTHENTICATION FLOW                            │
└──────────────────────────────────────────────────────────────────────────────────┘

     USER                 BROWSER               AZURE AD              BACKEND
       │                    │                      │                     │
       │  1. Access App     │                      │                     │
       │───────────────────▶│                      │                     │
       │                    │                      │                     │
       │                    │  2. Check auth state │                     │
       │                    │      (MSAL.js)       │                     │
       │                    │                      │                     │
       │  3. Redirect to    │                      │                     │
       │     Azure AD login │                      │                     │
       │◀───────────────────│                      │                     │
       │                    │                      │                     │
       │  4. Enter credentials                     │                     │
       │──────────────────────────────────────────▶│                     │
       │                    │                      │                     │
       │  5. Return tokens  │                      │                     │
       │     (ID + Access)  │                      │                     │
       │◀──────────────────────────────────────────│                     │
       │                    │                      │                     │
       │                    │  6. Store tokens     │                     │
       │                    │     in memory        │                     │
       │                    │                      │                     │
       │                    │  7. API Request +    │                     │
       │                    │     Authorization:   │                     │
       │                    │     Bearer <token>   │                     │
       │                    │─────────────────────────────────────────────▶
       │                    │                      │                     │
       │                    │                      │  8. Validate JWT    │
       │                    │                      │     (RS256 + JWKS)  │
       │                    │                      │                     │
       │                    │                      │  9. Extract claims: │
       │                    │                      │     - sub (user ID) │
       │                    │                      │     - roles         │
       │                    │                      │     - email         │
       │                    │                      │                     │
       │                    │  10. Response        │                     │
       │                    │◀─────────────────────────────────────────────
       │  11. Display data  │                      │                     │
       │◀───────────────────│                      │                     │
```

### 1.2 Azure AD App Registration (Required)

**Step 1: Create App Registration**

```
Azure Portal → Azure Active Directory → App registrations → New registration

Name: DrMigrate-AzSync
Supported account types: Single tenant (or Multi-tenant for SaaS)
Redirect URI: 
  - https://localhost:3000 (dev)
  - https://your-app.com (prod)
```

**Step 2: Configure API Permissions**

```
API Permissions:
├── Microsoft Graph
│   └── User.Read (Delegated) - Sign in and read user profile
└── Azure Service Management
    └── user_impersonation (Delegated) - Access Azure as signed-in user
```

**Step 3: Define App Roles**

In the App Registration manifest, add:

```json
{
  "appRoles": [
    {
      "id": "00000000-0000-0000-0000-000000000001",
      "allowedMemberTypes": ["User"],
      "displayName": "Administrator",
      "description": "Full access to all features",
      "value": "Admin",
      "isEnabled": true
    },
    {
      "id": "00000000-0000-0000-0000-000000000002",
      "allowedMemberTypes": ["User"],
      "displayName": "Operator",
      "description": "Can execute migrations and scripts",
      "value": "Operator",
      "isEnabled": true
    },
    {
      "id": "00000000-0000-0000-0000-000000000003",
      "allowedMemberTypes": ["User"],
      "displayName": "Viewer",
      "description": "Read-only access",
      "value": "Viewer",
      "isEnabled": true
    }
  ]
}
```

**Step 4: Expose an API**

```
Expose an API:
  Application ID URI: api://drmigrate-azsync
  Scopes:
    - api://drmigrate-azsync/access_as_user
```

### 1.3 Frontend MSAL Implementation

**File: `apps/web/src/lib/auth/msal-config.ts`**

```typescript
import { Configuration, LogLevel } from '@azure/msal-browser';

export const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_AZURE_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_AZURE_TENANT_ID}`,
    redirectUri: process.env.NEXT_PUBLIC_AZURE_REDIRECT_URI || 'http://localhost:3000',
    postLogoutRedirectUri: '/',
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: 'sessionStorage', // More secure than localStorage
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (process.env.NODE_ENV === 'development') {
          console.log(`[MSAL ${LogLevel[level]}] ${message}`);
        }
      },
      logLevel: LogLevel.Warning,
    },
  },
};

export const loginRequest = {
  scopes: [
    'openid',
    'profile',
    'email',
    'api://drmigrate-azsync/access_as_user', // Backend API scope
  ],
};

export const apiRequest = {
  scopes: ['api://drmigrate-azsync/access_as_user'],
};
```

**File: `apps/web/src/lib/auth/AuthProvider.tsx`**

```typescript
'use client';

import { MsalProvider, MsalAuthenticationTemplate } from '@azure/msal-react';
import { PublicClientApplication, InteractionType } from '@azure/msal-browser';
import { msalConfig, loginRequest } from './msal-config';

const msalInstance = new PublicClientApplication(msalConfig);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <MsalProvider instance={msalInstance}>
      <MsalAuthenticationTemplate
        interactionType={InteractionType.Redirect}
        authenticationRequest={loginRequest}
        loadingComponent={<LoadingSpinner />}
        errorComponent={<AuthError />}
      >
        {children}
      </MsalAuthenticationTemplate>
    </MsalProvider>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
    </div>
  );
}

function AuthError({ error }: { error: Error }) {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-red-600">Authentication Error</h1>
        <p className="mt-2 text-gray-600">{error.message}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-primary text-white rounded"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
```

**File: `apps/web/src/lib/auth/useAuthenticatedFetch.ts`**

```typescript
'use client';

import { useMsal } from '@azure/msal-react';
import { apiRequest } from './msal-config';

export function useAuthenticatedFetch() {
  const { instance, accounts } = useMsal();

  async function authFetch<T>(
    url: string,
    options?: RequestInit
  ): Promise<T> {
    // Silently acquire token
    const tokenResponse = await instance.acquireTokenSilent({
      ...apiRequest,
      account: accounts[0],
    });

    const headers = new Headers(options?.headers);
    headers.set('Authorization', `Bearer ${tokenResponse.accessToken}`);
    headers.set('Content-Type', 'application/json');

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // Token expired, force re-login
      await instance.acquireTokenRedirect(apiRequest);
      throw new Error('Session expired');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `API error: ${response.status}`);
    }

    return response.json();
  }

  return { authFetch };
}
```

### 1.4 Backend JWT Validation

**File: `apps/api/src/plugins/auth.ts`**

```typescript
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

interface JwtPayload {
  sub: string;           // User ID
  oid: string;           // Object ID
  name: string;          // Display name
  email?: string;
  preferred_username?: string;
  roles?: string[];      // App roles
  aud: string;           // Audience
  iss: string;           // Issuer
  iat: number;
  exp: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: JwtPayload;
  }
}

const TENANT_ID = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;

// JWKS client for fetching Microsoft's public keys
const jwks = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`,
  cache: true,
  cacheMaxAge: 86400000, // 24 hours
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  jwks.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

async function verifyToken(token: string): Promise<JwtPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        algorithms: ['RS256'],
        audience: `api://${CLIENT_ID}`,
        issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
      },
      (err, decoded) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(decoded as JwtPayload);
      }
    );
  });
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Decorate request with user
  fastify.decorateRequest('user', null);

  // Authentication hook
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for health checks and docs
    if (
      request.url === '/api/v1/health' ||
      request.url === '/api/v1/ready' ||
      request.url.startsWith('/docs')
    ) {
      return;
    }

    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization header',
        },
      });
    }

    const token = authHeader.substring(7);

    try {
      const payload = await verifyToken(token);
      request.user = payload;
    } catch (err) {
      fastify.log.warn({ err }, 'JWT verification failed');
      return reply.code(401).send({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Token validation failed',
        },
      });
    }
  });
};

export default fp(authPlugin, {
  name: 'auth',
  fastify: '4.x',
});
```

---

## 2. Authorization (RBAC) Design

### 2.1 Role Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              ROLE HIERARCHY                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────┐       │
│   │                           ADMIN                                      │       │
│   │  • Full access to all features                                       │       │
│   │  • Manage Azure credentials                                          │       │
│   │  • Execute scripts with elevated risk                                │       │
│   │  • View audit logs                                                   │       │
│   │  • Manage users (if implemented)                                     │       │
│   └─────────────────────────────────────────────────────────────────────┘       │
│                                    │                                             │
│                                    ▼                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐       │
│   │                          OPERATOR                                    │       │
│   │  • Create/manage groups and assessments                              │       │
│   │  • Enable replication                                                │       │
│   │  • Execute approved scripts (low/medium risk)                        │       │
│   │  • Run validation tests                                              │       │
│   │  • Cannot modify Azure credentials                                   │       │
│   └─────────────────────────────────────────────────────────────────────┘       │
│                                    │                                             │
│                                    ▼                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐       │
│   │                           VIEWER                                     │       │
│   │  • Read-only access to all data                                      │       │
│   │  • View machines, groups, assessments                                │       │
│   │  • View replication status                                           │       │
│   │  • View execution history                                            │       │
│   │  • Cannot modify anything                                            │       │
│   └─────────────────────────────────────────────────────────────────────┘       │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Permission Matrix

| Resource | Action | Admin | Operator | Viewer |
|----------|--------|-------|----------|--------|
| **Machines** | List | ✅ | ✅ | ✅ |
| | Import CSV | ✅ | ✅ | ❌ |
| | Delete | ✅ | ❌ | ❌ |
| **Groups** | List | ✅ | ✅ | ✅ |
| | Create | ✅ | ✅ | ❌ |
| | Update | ✅ | ✅ | ❌ |
| | Delete | ✅ | ❌ | ❌ |
| **Assessments** | List | ✅ | ✅ | ✅ |
| | Create | ✅ | ✅ | ❌ |
| | View Results | ✅ | ✅ | ✅ |
| **Replication** | List | ✅ | ✅ | ✅ |
| | Enable | ✅ | ✅ | ❌ |
| | Migrate | ✅ | ✅ | ❌ |
| | Delete | ✅ | ❌ | ❌ |
| **Scripts** | List | ✅ | ✅ | ✅ |
| | Create | ✅ | ✅ | ❌ |
| | Execute (low risk) | ✅ | ✅ | ❌ |
| | Execute (high risk) | ✅ | ❌ | ❌ |
| | Delete | ✅ | ❌ | ❌ |
| **Settings** | View Azure config | ✅ | ✅ | ✅ |
| | Modify Azure config | ✅ | ❌ | ❌ |
| | Test connection | ✅ | ✅ | ❌ |

### 2.3 RBAC Middleware Implementation

**File: `apps/api/src/plugins/rbac.ts`**

```typescript
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

type Role = 'Admin' | 'Operator' | 'Viewer';
type Permission = 'read' | 'write' | 'delete' | 'execute' | 'admin';

const rolePermissions: Record<Role, Permission[]> = {
  Admin: ['read', 'write', 'delete', 'execute', 'admin'],
  Operator: ['read', 'write', 'execute'],
  Viewer: ['read'],
};

declare module 'fastify' {
  interface FastifyInstance {
    authorize: (permissions: Permission[]) => (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }
}

const rbacPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate(
    'authorize',
    (requiredPermissions: Permission[]) => {
      return async (request: FastifyRequest, reply: FastifyReply) => {
        if (!request.user) {
          return reply.code(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          });
        }

        const userRoles = (request.user.roles || ['Viewer']) as Role[];
        
        // Collect all permissions for the user's roles
        const userPermissions = new Set<Permission>();
        for (const role of userRoles) {
          const perms = rolePermissions[role] || [];
          perms.forEach((p) => userPermissions.add(p));
        }

        // Check if user has all required permissions
        const hasPermission = requiredPermissions.every((p) =>
          userPermissions.has(p)
        );

        if (!hasPermission) {
          return reply.code(403).send({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Insufficient permissions',
              required: requiredPermissions,
              userRoles,
            },
          });
        }
      };
    }
  );
};

export default fp(rbacPlugin, {
  name: 'rbac',
  dependencies: ['auth'],
  fastify: '4.x',
});
```

### 2.4 Using RBAC in Routes

**Example: `apps/api/src/routes/settings.ts`**

```typescript
// Before (no auth):
fastify.post('/azure', async (request) => { ... });

// After (with RBAC):
fastify.post('/azure', {
  preHandler: fastify.authorize(['admin']),
  schema: { ... },
}, async (request) => { ... });

// Read-only endpoint:
fastify.get('/azure', {
  preHandler: fastify.authorize(['read']),
  schema: { ... },
}, async (request) => { ... });

// Execute scripts (operator+):
fastify.post('/execute', {
  preHandler: fastify.authorize(['execute']),
  schema: { ... },
}, async (request) => { ... });
```

---

## 3. Secrets Management

### 3.1 Current Problem

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        CURRENT: INSECURE STORAGE                                 │
│                                                                                  │
│   User submits Azure credentials via Settings page                               │
│                         │                                                        │
│                         ▼                                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐       │
│   │                      SQLite Database                                 │       │
│   │                                                                      │       │
│   │   AzureConfig table:                                                 │       │
│   │   ┌─────────────────────────────────────────────────────────────┐   │       │
│   │   │ id       │ tenantId       │ clientId       │ clientSecret   │   │       │
│   │   ├─────────────────────────────────────────────────────────────┤   │       │
│   │   │ default  │ abc-123...     │ def-456...     │ PLAINTEXT!!!   │   │       │
│   │   └─────────────────────────────────────────────────────────────┘   │       │
│   │                                                                      │       │
│   │   ⚠️ Anyone with file access can read the secret!                   │       │
│   └─────────────────────────────────────────────────────────────────────┘       │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Solution Options

#### Option A: Azure Key Vault (Recommended for Azure deployments)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     OPTION A: AZURE KEY VAULT                                    │
│                                                                                  │
│   ┌──────────────┐        ┌──────────────┐        ┌──────────────┐             │
│   │   Backend    │───────▶│  Managed     │───────▶│  Key Vault   │             │
│   │              │        │  Identity    │        │              │             │
│   └──────────────┘        └──────────────┘        └──────────────┘             │
│                                                          │                      │
│   • No secrets in code or database                       │                      │
│   • Automatic key rotation support                       │                      │
│   • Audit logging built-in                               ▼                      │
│   • Works with Container Apps, VMs, AKS        Secrets stored securely         │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Implementation:**

```typescript
// apps/api/src/lib/secrets.ts
import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential } from '@azure/identity';

const vaultUrl = process.env.KEY_VAULT_URL!;
const client = new SecretClient(vaultUrl, new DefaultAzureCredential());

export async function getSecret(name: string): Promise<string> {
  const secret = await client.getSecret(name);
  return secret.value!;
}

export async function setSecret(name: string, value: string): Promise<void> {
  await client.setSecret(name, value);
}

// Usage in azure-config.service.ts:
import { getSecret, setSecret } from '../lib/secrets';

async function getAzureCredentials() {
  return {
    tenantId: await getSecret('azure-tenant-id'),
    clientId: await getSecret('azure-client-id'),
    clientSecret: await getSecret('azure-client-secret'),
  };
}
```

#### Option B: Local Encryption (For single VM / offline deployments)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     OPTION B: LOCAL ENCRYPTION                                   │
│                                                                                  │
│   ┌──────────────┐        ┌──────────────┐        ┌──────────────┐             │
│   │   Backend    │───────▶│  Encryption  │───────▶│   SQLite     │             │
│   │              │        │  Service     │        │  (encrypted) │             │
│   └──────────────┘        └──────────────┘        └──────────────┘             │
│                                  │                                              │
│                                  │                                              │
│   Master key stored in:         │                                              │
│   • Environment variable        │                                              │
│   • Protected file (chmod 600)  │                                              │
│   • Windows DPAPI               ▼                                              │
│                          AES-256-GCM encryption                                │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Implementation:**

```typescript
// apps/api/src/lib/crypto.ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getMasterKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable not set');
  }
  // Derive a 32-byte key from the provided key
  return crypto.scryptSync(key, 'drmigrate-salt', 32);
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getMasterKey(), iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  // Return: iv:tag:encrypted
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, encrypted] = ciphertext.split(':');
  
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, getMasterKey(), iv);
  decipher.setAuthTag(tag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

**Updated Prisma hook:**

```typescript
// apps/api/src/lib/db.ts
import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from './crypto';

const prisma = new PrismaClient().$extends({
  query: {
    azureConfig: {
      async create({ args, query }) {
        if (args.data.clientSecret) {
          args.data.clientSecret = encrypt(args.data.clientSecret);
        }
        return query(args);
      },
      async update({ args, query }) {
        if (args.data.clientSecret) {
          args.data.clientSecret = encrypt(args.data.clientSecret as string);
        }
        return query(args);
      },
    },
  },
  result: {
    azureConfig: {
      clientSecret: {
        needs: { clientSecret: true },
        compute(config) {
          return config.clientSecret ? decrypt(config.clientSecret) : null;
        },
      },
    },
  },
});

export default prisma;
```

---

## 4. API Security Middleware

### 4.1 Security Middleware Stack

```typescript
// apps/api/src/index.ts

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import auth from './plugins/auth';
import rbac from './plugins/rbac';
import requestValidation from './plugins/request-validation';
import auditLog from './plugins/audit-log';

async function buildServer() {
  const server = Fastify({
    logger: true,
    // Trust proxy for accurate client IP (when behind load balancer)
    trustProxy: true,
  });

  // 1. Security headers (helmet)
  await server.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  });

  // 2. CORS (strict configuration)
  await server.register(cors, {
    origin: (origin, cb) => {
      const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((o) => o.trim());
      
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error('Not allowed by CORS'), false);
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    credentials: false, // No cookies - using Bearer tokens
    maxAge: 86400,
  });

  // 3. Rate limiting
  await server.register(rateLimit, {
    max: 100,        // 100 requests
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
      },
    }),
    // Different limits for different routes
    keyGenerator: (request) => {
      // Use user ID if authenticated, otherwise IP
      return request.user?.sub || request.ip;
    },
  });

  // 4. Authentication (JWT validation)
  await server.register(auth);

  // 5. Authorization (RBAC)
  await server.register(rbac);

  // 6. Request validation
  await server.register(requestValidation);

  // 7. Audit logging
  await server.register(auditLog);

  // 8. Disable Swagger in production
  if (process.env.NODE_ENV !== 'production') {
    await server.register(swagger, { ... });
    await server.register(swaggerUi, { routePrefix: '/docs' });
  }

  // Register routes...
  return server;
}
```

### 4.2 Request Validation Plugin

```typescript
// apps/api/src/plugins/request-validation.ts
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

const requestValidation: FastifyPluginAsync = async (fastify) => {
  // Add request ID for tracing
  fastify.addHook('onRequest', async (request) => {
    request.id = request.headers['x-request-id'] as string || 
                 crypto.randomUUID();
  });

  // Validate Content-Type for POST/PUT
  fastify.addHook('preHandler', async (request, reply) => {
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      const contentType = request.headers['content-type'];
      
      // Skip for multipart (file uploads)
      if (contentType?.includes('multipart/form-data')) {
        return;
      }
      
      if (request.body && !contentType?.includes('application/json')) {
        return reply.code(415).send({
          success: false,
          error: {
            code: 'UNSUPPORTED_MEDIA_TYPE',
            message: 'Content-Type must be application/json',
          },
        });
      }
    }
  });

  // Sanitize common XSS patterns in string fields
  fastify.addHook('preHandler', async (request) => {
    if (request.body && typeof request.body === 'object') {
      sanitizeObject(request.body);
    }
  });
};

function sanitizeObject(obj: Record<string, unknown>) {
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (typeof value === 'string') {
      // Basic XSS prevention
      obj[key] = value
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
    } else if (typeof value === 'object' && value !== null) {
      sanitizeObject(value as Record<string, unknown>);
    }
  }
}

export default fp(requestValidation, { name: 'request-validation' });
```

### 4.3 Audit Logging Plugin

```typescript
// apps/api/src/plugins/audit-log.ts
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

interface AuditEntry {
  timestamp: string;
  requestId: string;
  userId?: string;
  userEmail?: string;
  action: string;
  resource: string;
  resourceId?: string;
  ip: string;
  userAgent?: string;
  statusCode: number;
  duration: number;
}

const auditLog: FastifyPluginAsync = async (fastify) => {
  // Sensitive routes that should always be logged
  const sensitiveRoutes = [
    '/api/v1/settings',
    '/api/v1/replication',
    '/api/v1/lift-cleanse/execute',
  ];

  fastify.addHook('onResponse', async (request, reply) => {
    // Always log sensitive routes and non-GET requests
    const shouldLog =
      request.method !== 'GET' ||
      sensitiveRoutes.some((r) => request.url.startsWith(r));

    if (!shouldLog) return;

    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      requestId: request.id,
      userId: request.user?.sub,
      userEmail: request.user?.email || request.user?.preferred_username,
      action: `${request.method} ${request.routerPath || request.url}`,
      resource: extractResource(request.url),
      resourceId: extractResourceId(request.url),
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      statusCode: reply.statusCode,
      duration: reply.getResponseTime(),
    };

    // Log to structured logger (can be sent to SIEM)
    fastify.log.info({ audit: entry }, 'Audit log entry');
    
    // Optionally persist to database
    // await prisma.auditLog.create({ data: entry });
  });
};

function extractResource(url: string): string {
  const match = url.match(/\/api\/v1\/([^/?]+)/);
  return match ? match[1] : 'unknown';
}

function extractResourceId(url: string): string | undefined {
  const match = url.match(/\/api\/v1\/[^/]+\/([^/?]+)/);
  return match ? match[1] : undefined;
}

export default fp(auditLog, {
  name: 'audit-log',
  dependencies: ['auth'],
});
```

---

## 5. HTTPS Implementation

### 5.1 Development HTTPS

**Using mkcert (recommended for local dev):**

```bash
# Install mkcert
# Windows: choco install mkcert
# macOS: brew install mkcert
# Linux: See https://github.com/FiloSottile/mkcert

# Create local CA
mkcert -install

# Generate certificates
cd apps/api
mkcert localhost 127.0.0.1 ::1
# Creates: localhost+2.pem and localhost+2-key.pem
```

**Fastify HTTPS config:**

```typescript
// apps/api/src/index.ts
import fs from 'fs';
import path from 'path';

const httpsOptions = process.env.HTTPS_ENABLED === 'true'
  ? {
      key: fs.readFileSync(process.env.SSL_KEY_PATH || './localhost+2-key.pem'),
      cert: fs.readFileSync(process.env.SSL_CERT_PATH || './localhost+2.pem'),
    }
  : undefined;

const server = Fastify({
  logger: true,
  https: httpsOptions,
});
```

### 5.2 Production HTTPS (Reverse Proxy)

#### Nginx Configuration

```nginx
# /etc/nginx/sites-available/drmigrate

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL certificates (Let's Encrypt or custom)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # API backend
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
        
        # Rate limiting
        limit_req zone=api burst=20 nodelay;
    }

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### Caddy Configuration (simpler, auto HTTPS)

```caddyfile
# Caddyfile
your-domain.com {
    # Automatic HTTPS with Let's Encrypt

    # API
    handle /api/* {
        reverse_proxy localhost:4000
    }

    # Frontend
    handle {
        reverse_proxy localhost:3000
    }

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
```

---

## 6. Deployment Scenarios

### 6.1 Single VM (All-in-One)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         SINGLE VM DEPLOYMENT                                     │
│                                                                                  │
│   ┌───────────────────────────────────────────────────────────────────────┐     │
│   │                        Windows/Linux VM                                │     │
│   │                                                                        │     │
│   │   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                 │     │
│   │   │   Nginx/    │──▶│  Next.js    │   │  Fastify    │                 │     │
│   │   │   Caddy     │──▶│   :3000     │   │   :4000     │                 │     │
│   │   │   :443      │   └─────────────┘   └─────────────┘                 │     │
│   │   └─────────────┘                             │                        │     │
│   │         │                                     │                        │     │
│   │         │ TLS Termination                     │                        │     │
│   │         ▼                                     ▼                        │     │
│   │   Certificates                         ┌─────────────┐                 │     │
│   │   (Let's Encrypt                       │   SQLite/   │                 │     │
│   │    or Custom)                          │  PostgreSQL │                 │     │
│   │                                        └─────────────┘                 │     │
│   │                                                                        │     │
│   │   Process Manager: PM2 or systemd                                      │     │
│   │                                                                        │     │
│   └───────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
│   Environment Variables:                                                         │
│   ├── HTTPS_ENABLED=false (handled by reverse proxy)                            │
│   ├── ALLOWED_ORIGINS=https://your-domain.com                                   │
│   ├── ENCRYPTION_KEY=<random-32-byte-key>                                       │
│   └── DATABASE_URL=file:./data/drmigrate.db                                     │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Setup script:**

```bash
#!/bin/bash
# setup-single-vm.sh

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2 pnpm

# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy

# Clone and build app
cd /opt
git clone <repo> drmigrate
cd drmigrate
pnpm install
pnpm build

# Generate encryption key
echo "ENCRYPTION_KEY=$(openssl rand -base64 32)" >> apps/api/.env

# Configure Caddy
sudo tee /etc/caddy/Caddyfile << 'EOF'
your-domain.com {
    handle /api/* {
        reverse_proxy localhost:4000
    }
    handle {
        reverse_proxy localhost:3000
    }
}
EOF

# Start services
pm2 start ecosystem.config.js
pm2 save
pm2 startup

sudo systemctl restart caddy
```

### 6.2 Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    environment:
      - NEXT_PUBLIC_API_URL=https://your-domain.com/api/v1
      - NEXT_PUBLIC_AZURE_CLIENT_ID=${AZURE_CLIENT_ID}
      - NEXT_PUBLIC_AZURE_TENANT_ID=${AZURE_TENANT_ID}
    depends_on:
      - api
    networks:
      - internal

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      - NODE_ENV=production
      - ALLOWED_ORIGINS=https://your-domain.com
      - DATABASE_URL=postgresql://user:pass@db:5432/drmigrate
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - AZURE_TENANT_ID=${AZURE_TENANT_ID}
      - AZURE_CLIENT_ID=${AZURE_CLIENT_ID}
    depends_on:
      - db
    networks:
      - internal

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=drmigrate
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - internal

  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - web
      - api
    networks:
      - internal
      - external

volumes:
  postgres_data:
  caddy_data:
  caddy_config:

networks:
  internal:
    internal: true
  external:
```

### 6.3 Azure Container Apps

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      AZURE CONTAINER APPS DEPLOYMENT                             │
│                                                                                  │
│   ┌───────────────────────────────────────────────────────────────────────┐     │
│   │                    Container Apps Environment                          │     │
│   │                                                                        │     │
│   │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐               │     │
│   │   │  Ingress    │───▶│   Web       │    │    API      │               │     │
│   │   │  (HTTPS)    │───▶│  Container  │    │  Container  │               │     │
│   │   └─────────────┘    └─────────────┘    └─────────────┘               │     │
│   │         │                                      │                       │     │
│   │         │ Managed Certificate                  │                       │     │
│   │         │                                      │                       │     │
│   └─────────│──────────────────────────────────────│───────────────────────┘     │
│             │                                      │                             │
│             │                                      ▼                             │
│   ┌─────────▼───────────┐             ┌──────────────────────┐                  │
│   │   Azure Front Door  │             │   Azure Database     │                  │
│   │   (WAF, CDN)        │             │   for PostgreSQL     │                  │
│   └─────────────────────┘             └──────────────────────┘                  │
│                                                   │                              │
│   ┌─────────────────────┐                        │                              │
│   │   Azure Key Vault   │◀───────────────────────┘                              │
│   │   (secrets)         │                                                        │
│   └─────────────────────┘                                                        │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Bicep deployment:**

```bicep
// infra/main.bicep
resource containerAppEnvironment 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: 'drmigrate-env'
  location: location
  properties: {
    // ...
  }
}

resource apiContainerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'drmigrate-api'
  location: location
  properties: {
    environmentId: containerAppEnvironment.id
    configuration: {
      secrets: [
        {
          name: 'encryption-key'
          keyVaultUrl: 'https://${keyVault.name}.vault.azure.net/secrets/encryption-key'
          identity: 'system'
        }
      ]
      ingress: {
        external: true
        targetPort: 4000
        transport: 'http'
      }
    }
    template: {
      containers: [
        {
          name: 'api'
          image: '${containerRegistry}/drmigrate-api:latest'
          env: [
            { name: 'ENCRYPTION_KEY', secretRef: 'encryption-key' }
            // ...
          ]
        }
      ]
    }
  }
  identity: {
    type: 'SystemAssigned'
  }
}
```

---

## 7. Implementation Plan

### Phase 1: Foundation (Week 1-2)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Create Azure AD App Registration | P0 | 2h | None |
| Implement MSAL in frontend | P0 | 4h | Azure AD App |
| Implement JWT auth plugin in backend | P0 | 4h | Azure AD App |
| Wire auth to all routes | P0 | 4h | JWT plugin |
| Add RBAC middleware | P0 | 4h | JWT plugin |
| Apply RBAC to sensitive routes | P0 | 8h | RBAC middleware |
| Add rate limiting | P1 | 2h | None |
| Update CORS configuration | P1 | 1h | None |

**Deliverables:**
- [ ] All API endpoints require authentication
- [ ] Three roles implemented (Admin, Operator, Viewer)
- [ ] Rate limiting active (100 req/min)

### Phase 2: Secrets & Encryption (Week 3)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Implement encryption utility | P0 | 4h | None |
| Migrate AzureConfig to encrypted storage | P0 | 4h | Encryption utility |
| Migrate DataSource secrets | P0 | 2h | Encryption utility |
| (Optional) Azure Key Vault integration | P1 | 8h | Azure infrastructure |
| Add audit logging plugin | P1 | 4h | Auth plugin |

**Deliverables:**
- [ ] All secrets encrypted at rest
- [ ] Audit logs for sensitive operations
- [ ] Key rotation procedure documented

### Phase 3: HTTPS & Hardening (Week 4)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Setup mkcert for dev HTTPS | P1 | 1h | None |
| Configure Nginx/Caddy for production | P0 | 4h | Certificate |
| Disable Swagger in production | P0 | 1h | None |
| Implement security headers | P0 | 2h | None |
| Add request validation plugin | P1 | 4h | None |
| Security testing & penetration test | P0 | 8h | All above |

**Deliverables:**
- [ ] HTTPS working in dev and prod
- [ ] All security headers configured
- [ ] Swagger disabled in production
- [ ] Security scan report clean

### Phase 4: Documentation & Training (Week 5)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Document Azure AD setup | P0 | 2h | Phase 1 |
| Document deployment procedures | P0 | 4h | Phase 3 |
| Create security runbook | P1 | 4h | All phases |
| Train team on security practices | P1 | 4h | Runbook |

---

## 8. Security Checklist

### Pre-Production Checklist

```
AUTHENTICATION
[ ] Azure AD App Registration created
[ ] MSAL integrated in frontend
[ ] JWT validation in all API routes
[ ] Token refresh handling
[ ] Logout clears all tokens

AUTHORIZATION
[ ] RBAC middleware implemented
[ ] Role permissions defined and documented
[ ] Sensitive routes protected (admin only)
[ ] Script execution requires operator+
[ ] Settings changes require admin

SECRETS
[ ] Encryption key generated and secured
[ ] Azure credentials encrypted in DB
[ ] Data source credentials encrypted
[ ] No secrets in code or logs
[ ] Key rotation procedure documented

TRANSPORT
[ ] HTTPS enabled in production
[ ] HTTP redirects to HTTPS
[ ] TLS 1.2+ only
[ ] Strong cipher suites
[ ] HSTS header set

API SECURITY
[ ] Rate limiting enabled
[ ] Request size limits set
[ ] Input validation on all routes
[ ] XSS prevention in place
[ ] Swagger disabled in production

MONITORING
[ ] Audit logging enabled
[ ] Failed auth attempts logged
[ ] Sensitive operations logged
[ ] Logs sent to central system
[ ] Alerting configured

DEPLOYMENT
[ ] Environment variables secured
[ ] No default credentials
[ ] Firewall rules configured
[ ] Database access restricted
[ ] Backup encryption enabled
```

### Security Testing Commands

```bash
# Check SSL configuration
nmap --script ssl-enum-ciphers -p 443 your-domain.com

# Check security headers
curl -I https://your-domain.com

# Test rate limiting
for i in {1..150}; do curl -s -o /dev/null -w "%{http_code}\n" https://your-domain.com/api/v1/health; done | sort | uniq -c

# Check for exposed endpoints
curl https://your-domain.com/docs  # Should 404 in production

# Verify auth required
curl https://your-domain.com/api/v1/machines  # Should 401
```

---

## Appendix: Quick Reference

### Environment Variables (Production)

```env
# Backend (apps/api/.env)
NODE_ENV=production
PORT=4000
HOST=0.0.0.0

# Security
ALLOWED_ORIGINS=https://your-domain.com
ENCRYPTION_KEY=<base64-encoded-32-byte-key>

# Azure AD
AZURE_TENANT_ID=<tenant-id>
AZURE_CLIENT_ID=<client-id>

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/drmigrate

# Optional: Key Vault
KEY_VAULT_URL=https://your-vault.vault.azure.net

# Frontend (apps/web/.env.production)
NEXT_PUBLIC_API_URL=https://your-domain.com/api/v1
NEXT_PUBLIC_AZURE_CLIENT_ID=<client-id>
NEXT_PUBLIC_AZURE_TENANT_ID=<tenant-id>
NEXT_PUBLIC_AZURE_REDIRECT_URI=https://your-domain.com
```

### NPM Packages to Install

```bash
# Backend
cd apps/api
pnpm add jsonwebtoken jwks-rsa @fastify/rate-limit
pnpm add -D @types/jsonwebtoken

# For Key Vault (optional)
pnpm add @azure/keyvault-secrets

# Frontend (already installed but unused)
# @azure/msal-browser @azure/msal-react - already in package.json
```

---

*Document Version: 1.0*
*Last Updated: 2026-01-16*
*Author: Security Architecture Review*
