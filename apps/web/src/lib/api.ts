import type {
  Machine,
  AssessmentGroup,
  Assessment,
  ReplicationItem,
  DataSourceConfig,
  VmSku,
  VirtualNetwork,
  StorageAccount,
  ApiResponse,
} from '@drmigrate/shared-types';

// Use relative path by default to leverage Next.js rewrites
// In production, set NEXT_PUBLIC_API_URL to the full API URL (e.g., http://api.example.com/api/v1)
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  // Only set Content-Type if there's a body
  const headers: HeadersInit = {
    ...options?.headers,
  };
  
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `API error: ${response.status}`);
  }

  return response.json();
}

// Disk details type
export interface DiskDetails {
  diskId: string;
  diskName: string;
  sizeGB: number;
  diskType?: string;
  isOsDisk: boolean;
}

// Machines API
export const machinesApi = {
  list: (params?: { source?: string; search?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.source) searchParams.set('source', params.source);
    if (params?.search) searchParams.set('search', params.search);
    const query = searchParams.toString();
    return fetchApi<Machine[]>(`/machines${query ? `?${query}` : ''}`);
  },

  get: (id: string) => fetchApi<Machine>(`/machines/${id}`),

  getDisks: (id: string) => fetchApi<DiskDetails[]>(`/machines/${id}/disks`),

  create: (data: {
    displayName: string;
    hostname?: string;
    operatingSystem?: string;
    ipAddresses?: string[];
    cpuCores?: number;
    memoryMB?: number;
  }) =>
    fetchApi<Machine>('/machines', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    fetchApi<{ deleted: boolean }>(`/machines/${id}`, { method: 'DELETE' }),

  compare: () =>
    fetchApi<{ matched: number; azureOnly: number; externalOnly: number }>(
      '/machines/compare',
      { method: 'POST' }
    ),

  refresh: () =>
    fetchApi<{ jobId: string; message: string }>('/machines/refresh', { method: 'POST' }),

  stats: () =>
    fetchApi<{
      total: number;
      bySource: { azure: number; external: number; both: number };
      byOS: Record<string, number>;
    }>('/machines/stats'),
};

// Groups API
export const groupsApi = {
  list: () => fetchApi<AssessmentGroup[]>('/groups'),

  get: (id: string) => fetchApi<AssessmentGroup>(`/groups/${id}`),

  create: (data: { name: string; description?: string; machineIds: string[] }) =>
    fetchApi<AssessmentGroup>('/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<AssessmentGroup>) =>
    fetchApi<AssessmentGroup>(`/groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    fetchApi<{ deleted: boolean }>(`/groups/${id}`, { method: 'DELETE' }),

  getMachines: (id: string) =>
    fetchApi<Array<{
      id: string;
      displayName: string;
      operatingSystem: string;
      ipAddresses: string[];
    }>>(`/groups/${id}/machines`),
};

// Assessments API
export const assessmentsApi = {
  list: () => fetchApi<Assessment[]>('/assessments'),

  get: (id: string) => fetchApi<Assessment>(`/assessments/${id}`),

  create: (groupId: string, data: { name: string; azureLocation: string }) =>
    fetchApi<Assessment>(`/assessments/groups/${groupId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getResults: (id: string) =>
    fetchApi<Assessment[]>(`/assessments/${id}/results`),

  getSummary: (id: string) =>
    fetchApi<{
      totalMachines: number;
      readyCount: number;
      notReadyCount: number;
      totalMonthlyCost: number;
    }>(`/assessments/${id}/summary`),
};

// Replication API
export const replicationApi = {
  list: () => fetchApi<ReplicationItem[]>('/replication'),

  getStatus: (id: string) =>
    fetchApi<ReplicationItem>(`/replication/${id}/status`),

  getDetails: (id: string) =>
    fetchApi<unknown>(`/replication/${id}/details`),

  getInfrastructure: () =>
    fetchApi<unknown>('/replication/infrastructure'),

  getJobs: () =>
    fetchApi<unknown[]>('/replication/jobs'),

  enable: (data: {
    groupId: string;
    targetConfig: {
      targetResourceGroup: string;
      targetVnetId: string;
      targetSubnetName: string;
      targetVmSize: string;
      targetStorageAccountId?: string;
      targetRegion?: string;
      availabilityZone?: string;
      licenseType?: string;
      tags?: Record<string, string>;
    };
    machineDisks?: Array<{
      machineId: string;
      disks: Array<{
        diskId: string;
        isOSDisk: boolean;
        diskType: string;
        targetDiskSizeGB: number;
      }>;
    }>;
  }) =>
    fetchApi<ReplicationItem[]>('/replication/enable', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Test Migrate - Creates test VM in Azure
  testMigrate: (id: string, testNetworkId?: string) =>
    fetchApi<{ jobId: string }>(`/replication/${id}/test-migrate`, {
      method: 'POST',
      body: JSON.stringify({ testNetworkId }),
    }),

  // Test Migrate Cleanup - Deletes test VM
  testMigrateCleanup: (id: string, comments?: string) =>
    fetchApi<{ jobId: string }>(`/replication/${id}/test-migrate-cleanup`, {
      method: 'POST',
      body: JSON.stringify({ comments: comments || '' }),
    }),

  // Migrate - Actual migration to Azure
  migrate: (id: string, performShutdown: boolean = true) =>
    fetchApi<{ jobId: string }>(`/replication/${id}/migrate`, {
      method: 'POST',
      body: JSON.stringify({ performShutdown }),
    }),

  // Complete Migration - Finalize and remove replication
  completeMigration: (id: string) =>
    fetchApi<{ success: boolean; jobId?: string }>(`/replication/${id}/complete-migration`, {
      method: 'POST',
    }),

  // Resync replication
  resync: (id: string) =>
    fetchApi<{ jobId: string }>(`/replication/${id}/resync`, {
      method: 'POST',
    }),

  // Delete/cancel replication
  delete: (id: string) =>
    fetchApi<{ deleted: boolean }>(`/replication/${id}`, {
      method: 'DELETE',
    }),

  // Legacy endpoints (kept for backward compatibility)
  testFailover: (id: string) =>
    fetchApi<{ jobId: string }>(`/replication/${id}/test-failover`, {
      method: 'POST',
    }),

  failover: (id: string) =>
    fetchApi<{ jobId: string }>(`/replication/${id}/failover`, {
      method: 'POST',
    }),
};

// Data Sources API
export const dataSourcesApi = {
  list: () => fetchApi<DataSourceConfig[]>('/data-sources'),

  get: (id: string) => fetchApi<DataSourceConfig>(`/data-sources/${id}`),

  create: (data: { name: string; type: string; connectionString?: string }) =>
    fetchApi<DataSourceConfig>('/data-sources', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  test: (id: string) =>
    fetchApi<{ connected: boolean; message: string }>(
      `/data-sources/${id}/test`,
      { method: 'POST' }
    ),

  sync: (id: string) =>
    fetchApi<{ jobId: string }>(`/data-sources/${id}/sync`, { method: 'POST' }),

  delete: (id: string) =>
    fetchApi<{ deleted: boolean }>(`/data-sources/${id}`, { method: 'DELETE' }),

  uploadCSV: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/data-sources/import/csv`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || 'Upload failed');
    }

    return response.json() as Promise<ApiResponse<{
      jobId: string;
      sourceId: string;
      totalRecords: number;
      processedRecords: number;
      errorCount: number;
      errors: string[];
      message: string;
    }>>;
  },

  getImportJobs: () => fetchApi<Array<{
    id: string;
    sourceId: string;
    sourceName: string;
    status: string;
    totalRecords: number;
    processedRecords: number;
    errorCount: number;
    startedAt: string;
    completedAt?: string;
  }>>('/data-sources/import/jobs'),

  // DrMigrate SQL Server connection methods
  testDrMigrateConnection: (config: {
    server: string;
    database: string;
    user: string;
    password: string;
    port?: number;
  }) =>
    fetchApi<{ success: boolean; message: string; details?: { serverVersion?: string; databaseName?: string } }>(
      '/data-sources/drmigrate/test',
      {
        method: 'POST',
        body: JSON.stringify(config),
      }
    ),

  saveDrMigrateSource: (config: {
    name?: string;
    server: string;
    database: string;
    user: string;
    password: string;
    port?: number;
  }) =>
    fetchApi<{
      id: string;
      name: string;
      type: string;
      status: string;
      server: string;
      database: string;
      createdAt: string;
    }>('/data-sources/drmigrate', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
};

// Activity API
export const activityApi = {
  getRecent: (limit = 20) =>
    fetchApi<Array<{
      id: string;
      type: string;
      action: string;
      title: string;
      description?: string;
      status: string;
      createdAt: string;
    }>>(`/activity?limit=${limit}`),
};

// ============================================
// CONNECTION HEALTH API
// ============================================

export type HealthStatus = 'connected' | 'warning' | 'error' | 'unknown';
export type SourceType = 'azure-migrate' | 'drmigrate';

export interface ConnectionHealthSummary {
  sourceType: SourceType;
  status: HealthStatus;
  lastCheckAt: string | null;
  lastSuccessAt: string | null;
  lastErrorMsg: string | null;
  machineCount: number;
  responseTimeMs: number | null;
  checkCount: number;
  failCount: number;
  uptime: number;
}

export interface HealthCheckResult {
  sourceType: SourceType;
  status: HealthStatus;
  lastCheckAt: string;
  machineCount: number;
  responseTimeMs: number;
  error?: string;
}

export const healthApi = {
  // Get all connection health statuses
  getAllHealth: () =>
    fetchApi<Record<SourceType, ConnectionHealthSummary>>('/health/connections'),

  // Get health for a specific source
  getHealth: (sourceType: SourceType) =>
    fetchApi<ConnectionHealthSummary>(`/health/connections/${sourceType}`),

  // Trigger health check for a specific source
  checkHealth: (sourceType: SourceType) =>
    fetchApi<HealthCheckResult>(`/health/check/${sourceType}`, {
      method: 'POST',
    }),

  // Trigger health check for all sources
  checkAllHealth: () =>
    fetchApi<HealthCheckResult[]>('/health/check-all', {
      method: 'POST',
    }),
};

// ============================================
// SYNC SCHEDULE API
// ============================================

export type SyncStatus = 'success' | 'failed' | 'running';
export type SyncInterval = 15 | 30 | 60 | 360 | 1440;

export interface SyncScheduleConfig {
  sourceType: SourceType;
  enabled: boolean;
  intervalMinutes: SyncInterval;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  lastSyncStatus: SyncStatus | null;
  lastSyncError: string | null;
  lastSyncCount: number | null;
  lastSyncDuration: number | null;
}

export interface SyncResult {
  sourceType: SourceType;
  status: SyncStatus;
  count: number;
  duration: number;
  error?: string;
}

export interface SyncIntervalOption {
  value: SyncInterval;
  label: string;
}

export const syncApi = {
  // Get all sync schedules
  getAllSchedules: () =>
    fetchApi<Record<SourceType, SyncScheduleConfig>>('/sync/schedules'),

  // Get schedule for a specific source
  getSchedule: (sourceType: SourceType) =>
    fetchApi<SyncScheduleConfig>(`/sync/schedule/${sourceType}`),

  // Update schedule for a source
  updateSchedule: (sourceType: SourceType, enabled: boolean, intervalMinutes?: SyncInterval) =>
    fetchApi<SyncScheduleConfig>(`/sync/schedule/${sourceType}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled, intervalMinutes }),
    }),

  // Trigger manual sync
  triggerSync: (sourceType: SourceType) =>
    fetchApi<SyncResult>(`/sync/trigger/${sourceType}`, {
      method: 'POST',
    }),

  // Get available intervals
  getIntervals: () =>
    fetchApi<{ intervals: SyncIntervalOption[] }>('/sync/intervals'),
};

// ============================================
// STATISTICS API
// ============================================

export interface OverviewStats {
  azureMachines: number;
  drMigrateServers: number;
  matchedCount: number;
  unmatchedAzure: number;
  unmatchedDrMigrate: number;
  matchPercentage: number;
  autoMatchedCount: number;
  manualMatchedCount: number;
  lastAzureSync: string | null;
  lastDrMigrateSync: string | null;
}

export interface SourceCounts {
  azure: number;
  drmigrate: number;
  matched: number;
  unmatched: number;
}

export interface MatchingStats {
  total: number;
  matched: number;
  unmatched: number;
  autoMatched: number;
  manualMatched: number;
  matchPercentage: number;
  confidenceDistribution: {
    high: number;
    medium: number;
    low: number;
  };
}

export interface MachineBreakdown {
  byOS: Record<string, number>;
  byWave: Record<string, number>;
  byEnvironment: Record<string, number>;
}

export const statsApi = {
  // Get overview statistics
  getOverview: () =>
    fetchApi<OverviewStats>('/stats/overview'),

  // Get machine counts by source
  getCounts: () =>
    fetchApi<SourceCounts>('/stats/counts'),

  // Get detailed matching statistics
  getMatchingStats: () =>
    fetchApi<MatchingStats>('/stats/matching'),

  // Get machine breakdown
  getBreakdown: () =>
    fetchApi<MachineBreakdown>('/stats/breakdown'),
};

// Targets API
export const targetsApi = {
  getRegions: () =>
    fetchApi<Array<{ name: string; displayName: string }>>('/targets/regions'),

  getSkus: (location?: string) => {
    const query = location ? `?location=${location}` : '';
    return fetchApi<VmSku[]>(`/targets/skus${query}`);
  },

  getVnets: (location?: string) => {
    const query = location ? `?location=${location}` : '';
    return fetchApi<VirtualNetwork[]>(`/targets/vnets${query}`);
  },

  getSubnets: (vnetId: string) =>
    fetchApi<VirtualNetwork['subnets']>(`/targets/subnets?vnetId=${vnetId}`),

  getStorageAccounts: (location?: string) => {
    const query = location ? `?location=${location}` : '';
    return fetchApi<StorageAccount[]>(`/targets/storage-accounts${query}`);
  },

  getResourceGroups: (location?: string) => {
    const query = location ? `?location=${location}` : '';
    return fetchApi<Array<{ id: string; name: string; location: string }>>(`/targets/resource-groups${query}`);
  },

  getAvailabilityZones: (location: string) =>
    fetchApi<Array<{ zone: string; location: string }>>(`/targets/availability-zones?location=${location}`),

  getRecoveryVaults: () =>
    fetchApi<Array<{ id: string; name: string; location: string; resourceGroup: string }>>('/targets/recovery-vaults'),
};

// Settings API Types
export interface AzureConfig {
  id: string;
  tenantId: string | null;
  clientId: string | null;
  hasClientSecret: boolean;
  subscriptionId: string | null;
  subscriptionName: string | null;
  resourceGroup: string | null;
  migrateProjectName: string | null;
  location: string | null;
  vaultName: string | null;
  vaultResourceGroup: string | null;
  isConfigured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLogEntry {
  id: string;
  type: string;
  action: string;
  title: string;
  description: string | null;
  createdAt: string;
}

// Setup status type
export interface SetupStatus {
  isConfigured: boolean;
  missingFields: string[];
  completedAt: string | null;
}

// Settings API
export const settingsApi = {
  // Setup wizard endpoints
  getSetupStatus: () => fetchApi<SetupStatus>('/settings/setup-status'),
  
  completeSetup: () => 
    fetchApi<{ completedAt: string }>('/settings/setup-complete', {
      method: 'POST',
    }),

  resetSetup: () =>
    fetchApi<{ reset: boolean }>('/settings/reset-setup', {
      method: 'POST',
    }),

  getAzureConfig: () => fetchApi<AzureConfig>('/settings/azure'),

  saveAzureConfig: (config: {
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
    subscriptionId?: string;
    subscriptionName?: string;
    resourceGroup?: string;
    migrateProjectName?: string;
    location?: string;
    vaultName?: string;
    vaultResourceGroup?: string;
  }) =>
    fetchApi<AzureConfig>('/settings/azure', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  updateAzureConfig: (data: {
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
    subscriptionId?: string;
    subscriptionName?: string;
    resourceGroup?: string;
    migrateProjectName?: string;
    location?: string;
    vaultName?: string;
    vaultResourceGroup?: string;
  }) =>
    fetchApi<AzureConfig>('/settings/azure', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  testAzureConnection: () =>
    fetchApi<{ success: boolean; message: string; details?: Record<string, unknown> }>(
      '/settings/azure/test',
      { method: 'POST' }
    ),

  syncAzureMachines: () =>
    fetchApi<{ count: number; sites: string[] }>('/settings/azure/sync', {
      method: 'POST',
    }),

  getAzureSites: () => fetchApi<unknown[]>('/settings/azure/sites'),

  getAzureGroups: () =>
    fetchApi<AzureMigrateGroup[]>('/settings/azure/groups'),

  getAzureAssessments: () =>
    fetchApi<AzureMigrateAssessment[]>('/settings/azure/assessments'),

  createAzureAssessment: (data: { groupId: string; assessmentName: string; azureLocation: string }) =>
    fetchApi<{ assessmentId: string; groupId: string }>('/settings/azure/assessments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getAzureAssessmentDetails: (assessmentId: string) => {
    // Base64 encode the assessment ID to handle slashes
    const encodedId = btoa(assessmentId);
    return fetchApi<{
      assessment: Record<string, unknown>;
      assessedMachines: Array<Record<string, unknown>>;
    }>(`/settings/azure/assessments/${encodedId}`);
  },

  getAssessmentMachines: () =>
    fetchApi<Array<Record<string, unknown>>>('/settings/azure/assessment-machines'),

  getActivityLog: (limit?: number) =>
    fetchApi<ActivityLogEntry[]>(`/settings/activity${limit ? `?limit=${limit}` : ''}`),
};

// Azure Migrate types
export interface AzureMigrateGroup {
  id: string;
  name: string;
  machineCount: number;
  createdAt?: string;
  updatedAt?: string;
  areAssessmentsRunning?: boolean;
  source: 'azure-migrate';
}

export interface AzureMigrateAssessment {
  id: string;
  name: string;
  type?: string;
  groupName?: string;
  status?: string;
  azureLocation?: string;
  sizingCriterion?: string;
  createdAt?: string;
  updatedAt?: string;
  monthlyComputeCost?: number;
  monthlyStorageCost?: number;
  monthlyBandwidthCost?: number;
  numberOfMachines?: number;
  source: 'azure-migrate';
}

// ============================================
// LIFT & CLEANSE TYPES
// ============================================

export interface LiftCleanseScript {
  id: string;
  name: string;
  description?: string;
  content: string;
  scriptType: 'powershell' | 'bash';
  targetOs: 'windows' | 'linux' | 'both';
  category: 'cleanup' | 'install' | 'configure' | 'diagnostic' | 'custom';
  tags: string[];
  parameters: Array<{ key: string; description: string; required: boolean }>;
  timeout: number;
  runAsAdmin: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  isBuiltIn: boolean;
  isShared: boolean;
  createdBy?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SecurityIssue {
  severity: 'info' | 'warning' | 'danger' | 'critical';
  line: number;
  column: number;
  pattern: string;
  description: string;
  matchedText: string;
}

export interface SecurityScanResult {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  issues: SecurityIssue[];
  recommendations: string[];
  canSave: boolean;
  requiresApproval: boolean;
}

export interface AzureVM {
  id: string;
  name: string;
  resourceGroup: string;
  subscriptionId: string;
  location: string;
  osType: 'Windows' | 'Linux';
  osVersion?: string;
  vmSize: string;
  powerState: string;
  provisioningState: string;
  tags: Record<string, string>;
}

export interface ScriptExecution {
  id: string;
  scriptId?: string;
  scriptName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  initiatedBy?: string;
  parameters?: Record<string, string>;
  totalTargets: number;
  successCount: number;
  failedCount: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  targets: Array<{
    id: string;
    vmName: string;
    status: string;
    exitCode?: number;
    output?: string;
    error?: string;
  }>;
}

// ============================================
// LIFT & CLEANSE API
// ============================================

export const liftCleanseApi = {
  // Scripts
  listScripts: (filters?: {
    category?: string;
    scriptType?: string;
    targetOs?: string;
    isBuiltIn?: boolean;
    search?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters?.category) params.set('category', filters.category);
    if (filters?.scriptType) params.set('scriptType', filters.scriptType);
    if (filters?.targetOs) params.set('targetOs', filters.targetOs);
    if (filters?.isBuiltIn !== undefined) params.set('isBuiltIn', String(filters.isBuiltIn));
    if (filters?.search) params.set('search', filters.search);
    const query = params.toString();
    return fetchApi<LiftCleanseScript[]>(`/lift-cleanse/scripts${query ? `?${query}` : ''}`);
  },

  getScript: (id: string) =>
    fetchApi<LiftCleanseScript>(`/lift-cleanse/scripts/${id}`),

  createScript: (data: {
    name: string;
    description?: string;
    content: string;
    scriptType: 'powershell' | 'bash';
    targetOs: 'windows' | 'linux' | 'both';
    category: 'cleanup' | 'install' | 'configure' | 'diagnostic' | 'custom';
    tags?: string[];
    parameters?: Array<{ key: string; description: string; required: boolean }>;
    timeout?: number;
    runAsAdmin?: boolean;
    isShared?: boolean;
  }) =>
    fetchApi<{ script: LiftCleanseScript; securityScan: SecurityScanResult }>('/lift-cleanse/scripts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateScript: (id: string, data: Partial<LiftCleanseScript>) =>
    fetchApi<{ script: LiftCleanseScript }>(`/lift-cleanse/scripts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteScript: (id: string) =>
    fetchApi<{ deleted: boolean }>(`/lift-cleanse/scripts/${id}`, {
      method: 'DELETE',
    }),

  duplicateScript: (id: string, name?: string) =>
    fetchApi<{ script: LiftCleanseScript }>(`/lift-cleanse/scripts/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  validateScript: (content: string, scriptType: 'powershell' | 'bash') =>
    fetchApi<SecurityScanResult>('/lift-cleanse/scripts/validate', {
      method: 'POST',
      body: JSON.stringify({ content, scriptType }),
    }),

  shareScript: (id: string, isShared: boolean) =>
    fetchApi<LiftCleanseScript>(`/lift-cleanse/scripts/${id}/share`, {
      method: 'POST',
      body: JSON.stringify({ isShared }),
    }),

  // Execution
  executeScript: (data: {
    scriptId?: string;
    adHocScript?: string;
    adHocType?: 'powershell' | 'bash';
    targets: Array<{
      vmId: string;
      vmName: string;
      resourceGroup: string;
      subscriptionId: string;
      osType: 'windows' | 'linux';
    }>;
    parameters?: Record<string, string>;
    maxParallel?: number;
  }) =>
    fetchApi<{ executionId: string; status: string }>('/lift-cleanse/execute', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listExecutions: (options?: { limit?: number; offset?: number; status?: string }) => {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    if (options?.status) params.set('status', options.status);
    const query = params.toString();
    return fetchApi<{ executions: ScriptExecution[]; total: number }>(`/lift-cleanse/executions${query ? `?${query}` : ''}`);
  },

  getExecution: (id: string) =>
    fetchApi<ScriptExecution>(`/lift-cleanse/executions/${id}`),

  getTargetOutput: (executionId: string, targetId: string) =>
    fetchApi<{ stdout?: string; stderr?: string; exitCode?: number }>(
      `/lift-cleanse/executions/${executionId}/targets/${targetId}`
    ),

  cancelExecution: (id: string) =>
    fetchApi<{ cancelled: boolean }>(`/lift-cleanse/executions/${id}/cancel`, {
      method: 'POST',
    }),

  retryExecution: (id: string) =>
    fetchApi<{ retryCount: number }>(`/lift-cleanse/executions/${id}/retry`, {
      method: 'POST',
    }),

  // VMs
  listVMs: (resourceGroup?: string) => {
    const query = resourceGroup ? `?resourceGroup=${resourceGroup}` : '';
    return fetchApi<AzureVM[]>(`/lift-cleanse/vms${query}`);
  },

  getVMTags: () =>
    fetchApi<Array<{ key: string; values: string[] }>>('/lift-cleanse/vms/tags'),

  getResourceGroups: () =>
    fetchApi<string[]>('/lift-cleanse/vms/resource-groups'),

  // =============================================
  // VALIDATION TESTS
  // =============================================

  // Test Definitions
  listTests: (filters?: { category?: string; targetOs?: string; isBuiltIn?: boolean; search?: string }) => {
    const params = new URLSearchParams();
    if (filters?.category) params.set('category', filters.category);
    if (filters?.targetOs) params.set('targetOs', filters.targetOs);
    if (filters?.isBuiltIn !== undefined) params.set('isBuiltIn', String(filters.isBuiltIn));
    if (filters?.search) params.set('search', filters.search);
    const query = params.toString();
    return fetchApi<ValidationTest[]>(`/lift-cleanse/tests${query ? `?${query}` : ''}`);
  },

  getTest: (id: string) =>
    fetchApi<ValidationTest>(`/lift-cleanse/tests/${id}`),

  createTest: (test: CreateTestInput) =>
    fetchApi<ValidationTest>('/lift-cleanse/tests', {
      method: 'POST',
      body: JSON.stringify(test),
    }),

  updateTest: (id: string, test: Partial<CreateTestInput>) =>
    fetchApi<ValidationTest>(`/lift-cleanse/tests/${id}`, {
      method: 'PUT',
      body: JSON.stringify(test),
    }),

  deleteTest: (id: string) =>
    fetchApi<void>(`/lift-cleanse/tests/${id}`, { method: 'DELETE' }),

  // Test Suites
  listSuites: () =>
    fetchApi<TestSuite[]>('/lift-cleanse/test-suites'),

  getSuite: (id: string) =>
    fetchApi<TestSuite>(`/lift-cleanse/test-suites/${id}`),

  createSuite: (suite: { name: string; description?: string; testIds: string[]; runInParallel?: boolean; stopOnFailure?: boolean }) =>
    fetchApi<TestSuite>('/lift-cleanse/test-suites', {
      method: 'POST',
      body: JSON.stringify(suite),
    }),

  deleteSuite: (id: string) =>
    fetchApi<void>(`/lift-cleanse/test-suites/${id}`, { method: 'DELETE' }),

  // VM Test Assignments (using query param to avoid URL encoding issues with slashes in vmId)
  getVmTests: (vmId: string) =>
    fetchApi<VmTestAssignment[]>(`/lift-cleanse/vm-tests?vmId=${encodeURIComponent(vmId)}`),

  assignTest: (assignment: AssignTestInput) =>
    fetchApi<VmTestAssignment>('/lift-cleanse/test-assignments', {
      method: 'POST',
      body: JSON.stringify(assignment),
    }),

  bulkAssignTest: (
    testId: string,
    vms: Array<{ vmId: string; vmName: string; resourceGroup: string; subscriptionId: string }>,
    parameters?: Record<string, unknown>,
    scheduleType?: string,
    intervalMinutes?: number
  ) =>
    fetchApi<{ total: number; succeeded: number; failed: number }>('/lift-cleanse/test-assignments/bulk', {
      method: 'POST',
      body: JSON.stringify({ testId, vms, parameters, scheduleType, intervalMinutes }),
    }),

  getAssignment: (id: string) =>
    fetchApi<VmTestAssignment>(`/lift-cleanse/test-assignments/${id}`),

  updateAssignment: (id: string, data: { parameters?: Record<string, unknown>; isEnabled?: boolean; scheduleType?: string; intervalMinutes?: number }) =>
    fetchApi<VmTestAssignment>(`/lift-cleanse/test-assignments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  removeAssignment: (id: string) =>
    fetchApi<void>(`/lift-cleanse/test-assignments/${id}`, { method: 'DELETE' }),

  // Test Execution
  runTest: (assignmentId: string) =>
    fetchApi<TestRunResult>(`/lift-cleanse/test-assignments/${assignmentId}/run`, {
      method: 'POST',
    }),

  runAllVmTests: (vmId: string) =>
    fetchApi<{ total: number; passed: number; failed: number; errors: number; results: Array<{ testName: string; status: string; duration?: number }> }>(
      `/lift-cleanse/vm-tests/run-all?vmId=${encodeURIComponent(vmId)}`,
      { method: 'POST' }
    ),

  getTestResults: (assignmentId: string, limit?: number) =>
    fetchApi<VmTestResult[]>(`/lift-cleanse/test-assignments/${assignmentId}/results${limit ? `?limit=${limit}` : ''}`),
};

// ============================================
// VALIDATION TEST TYPES
// ============================================

export interface ValidationTest {
  id: string;
  name: string;
  description?: string;
  category: 'network' | 'service' | 'storage' | 'security' | 'application' | 'custom';
  scriptType: 'powershell' | 'bash';
  targetOs: 'windows' | 'linux' | 'both';
  script: string;
  scriptBash?: string;
  parameters: Array<{
    key: string;
    label: string;
    type: 'string' | 'number' | 'boolean';
    required: boolean;
    default?: string | number | boolean;
    placeholder?: string;
  }>;
  expectedExitCode: number;
  outputContains?: string;
  outputNotContains?: string;
  timeout: number;
  isBuiltIn: boolean;
  isShared: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTestInput {
  name: string;
  description?: string;
  category: string;
  scriptType: string;
  targetOs: string;
  script: string;
  scriptBash?: string;
  parameters?: Array<{ key: string; label: string; type: string; required: boolean; default?: unknown; placeholder?: string }>;
  expectedExitCode?: number;
  outputContains?: string;
  outputNotContains?: string;
  timeout?: number;
}

export interface TestSuite {
  id: string;
  name: string;
  description?: string;
  runInParallel: boolean;
  stopOnFailure: boolean;
  isBuiltIn: boolean;
  isShared: boolean;
  tests: Array<{
    id: string;
    testId: string;
    order: number;
    test: ValidationTest;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface VmTestAssignment {
  id: string;
  vmId: string;
  vmName: string;
  resourceGroup: string;
  subscriptionId: string;
  testId: string;
  test: ValidationTest;
  parameters: Record<string, string | number | boolean>;
  isEnabled: boolean;
  scheduleType: 'manual' | 'interval' | 'cron';
  intervalMinutes?: number;
  cronExpression?: string;
  nextRunAt?: string;
  lastStatus?: 'passed' | 'failed' | 'warning' | 'error' | 'running' | 'pending';
  lastRunAt?: string;
  lastDuration?: number;
  lastOutput?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssignTestInput {
  vmId: string;
  vmName: string;
  resourceGroup: string;
  subscriptionId: string;
  testId: string;
  parameters?: Record<string, string | number | boolean>;
  scheduleType?: 'manual' | 'interval' | 'cron';
  intervalMinutes?: number;
  cronExpression?: string;
}

export interface VmTestResult {
  id: string;
  assignmentId: string;
  status: 'passed' | 'failed' | 'warning' | 'error' | 'skipped';
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  duration?: number;
  failureReason?: string;
  executedAt: string;
}

export interface TestRunResult {
  status: 'passed' | 'failed' | 'error';
  exitCode?: number;
  output?: string;
  error?: string;
  duration?: number;
  failureReason?: string;
}
