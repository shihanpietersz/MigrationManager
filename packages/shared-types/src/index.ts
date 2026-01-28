// ============================================
// DATA SOURCE TYPES
// ============================================

export type DataSourceType = 'azure-migrate' | 'database' | 'csv' | 'api';

export interface DataSourceConfig {
  id: string;
  name: string;
  type: DataSourceType;
  connectionString?: string;
  apiEndpoint?: string;
  lastSyncAt?: string;
  status: 'connected' | 'disconnected' | 'error';
  createdAt: string;
  updatedAt: string;
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

export type MachineSource = 'azure' | 'external' | 'both';
export type PowerState = 'On' | 'Off' | 'Unknown';

export interface Machine {
  id: string;
  displayName: string;
  operatingSystem: string;
  ipAddresses: string[];
  cpuCores?: number;
  memoryMB?: number;
  diskCount?: number;
  diskSizeGB?: number;
  powerState?: PowerState;
  source: MachineSource;
  sourceIds: {
    azure?: string;
    external?: string;
  };
  tags?: Record<string, string>;
  lastUpdated: string;
}

export interface DiscoveredMachine extends Machine {
  azureMigrateId: string;
  siteId: string;
  siteName?: string;
  vCenterName?: string;
  hostName?: string;
  createdAt: string;
}

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

// ============================================
// MACHINE COMPARISON TYPES
// ============================================

export interface MachineComparison {
  id: string;
  createdAt: string;
  status: 'pending' | 'completed' | 'failed';
  matched: MatchedMachine[];
  azureOnly: DiscoveredMachine[];
  externalOnly: ExternalMachine[];
  summary: {
    totalAzure: number;
    totalExternal: number;
    matchedCount: number;
    discrepancyCount: number;
  };
}

export interface MatchedMachine {
  azureMachine: DiscoveredMachine;
  externalMachine: ExternalMachine;
  matchConfidence: number;
  matchedBy: 'hostname' | 'ip' | 'both';
  discrepancies: Discrepancy[];
}

export interface Discrepancy {
  field: string;
  azureValue: unknown;
  externalValue: unknown;
  severity: 'info' | 'warning' | 'error';
}

// ============================================
// ASSESSMENT GROUP TYPES
// ============================================

export interface AssessmentGroup {
  id: string;
  name: string;
  description?: string;
  machineIds: string[];
  machineCount: number;
  status: 'created' | 'assessing' | 'assessed' | 'replicating';
  lastAssessmentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGroupRequest {
  name: string;
  description?: string;
  machineIds: string[];
}

export interface UpdateGroupRequest {
  name?: string;
  description?: string;
  machineIds?: string[];
}

// ============================================
// ASSESSMENT TYPES
// ============================================

export type AssessmentStatus = 'Created' | 'Running' | 'Completed' | 'Failed' | 'Invalid';
export type ReadinessStatus = 'Ready' | 'ReadyWithConditions' | 'NotReady' | 'Unknown';

export interface Assessment {
  id: string;
  groupId: string;
  groupName: string;
  name: string;
  status: AssessmentStatus;
  azureLocation: string;
  vmSize?: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface CreateAssessmentRequest {
  name: string;
  azureLocation: string;
  vmSize?: string;
  currency?: string;
}

export interface AssessmentResult {
  assessmentId: string;
  machineId: string;
  machineName: string;
  readiness: ReadinessStatus;
  monthlyCostEstimate: number;
  recommendedSize: string;
  suitability: string;
  issues: AssessmentIssue[];
}

export interface AssessmentIssue {
  id: string;
  severity: 'Error' | 'Warning' | 'Info';
  category: string;
  message: string;
  recommendation?: string;
}

export interface AssessmentSummary {
  assessmentId: string;
  totalMachines: number;
  readyCount: number;
  readyWithConditionsCount: number;
  notReadyCount: number;
  unknownCount: number;
  totalMonthlyCost: number;
  currency: string;
}

// ============================================
// REPLICATION TYPES
// ============================================

export type ReplicationStatus =
  | 'Enabling'
  | 'InitialReplication'
  | 'Replicating'  // Azure: migrationState = "Replicating"
  | 'Protected'
  | 'PlannedFailoverInProgress'
  | 'FailedOver'
  | 'Failed'
  | 'Cancelled';

export type HealthStatus = 'Normal' | 'Warning' | 'Critical' | 'None';

// Azure migration state from VMwareCbt provider
export type MigrationState = 
  | 'None'
  | 'EnableMigrationInProgress'
  | 'Replicating'
  | 'MigrationInProgress'
  | 'MigrationSucceeded'
  | 'MigrationFailed';

export interface ReplicationConfig {
  targetResourceGroup: string;
  targetVnetId: string;
  targetSubnetName: string;
  targetVmSize: string;
  targetStorageAccountId: string;
  availabilityZone?: string;
  availabilitySetId?: string;
  licenseType?: 'NoLicenseType' | 'WindowsServer';
  tags?: Record<string, string>;
}

// Detailed Azure replication status
export interface AzureReplicationStatus {
  migrationState: string;  // e.g., "Replicating", "EnableMigrationInProgress"
  migrationStateDescription: string;  // e.g., "Ready to migrate"
  replicationStatus: string;  // e.g., "Delta sync", "Initial replication"
  initialSeedingProgress?: number;
  deltaSyncProgress?: number;
  resyncRequired: boolean;
  resyncProgress?: number;
  lastRecoveryPointTime?: string;
  allowedOperations: string[];  // e.g., ["DisableMigration", "TestMigrate", "Migrate"]
  testMigrateState: string;
  testMigrateStateDescription: string;
  osType?: string;
  firmwareType?: string;
}

export interface ReplicationItem {
  id: string;
  machineId: string;
  machineName: string;
  sourceServerId: string;
  status: ReplicationStatus;
  healthStatus: HealthStatus;
  healthErrors: HealthError[];
  replicationProgress?: number;
  lastSyncTime?: string;
  targetConfig: ReplicationConfig;
  testFailoverStatus?: TestFailoverStatus;
  createdAt: string;
  updatedAt: string;
  // Extended Azure status details
  azureStatus?: AzureReplicationStatus;
}

export interface HealthError {
  errorCode: string;
  errorMessage: string;
  possibleCauses?: string;
  recommendedAction?: string;
  severity: 'Error' | 'Warning';
}

export interface TestFailoverStatus {
  status: 'None' | 'InProgress' | 'Completed' | 'Failed';
  lastTestFailoverTime?: string;
  networkName?: string;
}

export interface EnableReplicationRequest {
  groupId: string;
  targetConfig: ReplicationConfig;
}

// ============================================
// TARGET CONFIGURATION TYPES
// ============================================

export interface VmSku {
  name: string;
  tier: string;
  family: string;
  size: string;
  cores: number;
  memoryGB: number;
  maxDataDisks: number;
  maxNetworkInterfaces: number;
  osDiskSizeGB: number;
  pricePerHour?: number;
  pricePerMonth?: number;
}

export interface VirtualNetwork {
  id: string;
  name: string;
  resourceGroup: string;
  location: string;
  addressPrefixes: string[];
  subnets: Subnet[];
}

export interface Subnet {
  id: string;
  name: string;
  addressPrefix: string;
  availableAddresses?: number;
}

export interface StorageAccount {
  id: string;
  name: string;
  resourceGroup: string;
  location: string;
  sku: string;
  kind: string;
  accessTier?: string;
}

export interface AvailabilityZone {
  zone: string;
  location: string;
}

export interface AvailabilitySet {
  id: string;
  name: string;
  resourceGroup: string;
  location: string;
  faultDomainCount: number;
  updateDomainCount: number;
}

// ============================================
// AZURE CONTEXT TYPES
// ============================================

export interface AzureContext {
  subscriptionId: string;
  subscriptionName: string;
  tenantId: string;
  resourceGroup: string;
  migrateProjectName: string;
  location: string;
}

export interface AzureMigrateSite {
  id: string;
  name: string;
  type: 'VMware' | 'HyperV' | 'Physical';
  location: string;
  discoveryStatus: 'Completed' | 'InProgress' | 'NotStarted';
  machineCount: number;
  lastDiscoveryTime?: string;
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: {
    page?: number;
    pageSize?: number;
    totalCount?: number;
    totalPages?: number;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: string;
  target?: string;
}

export interface PaginatedRequest {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

// ============================================
// JOB TYPES
// ============================================

export interface Job {
  id: string;
  type: 'import' | 'assessment' | 'replication' | 'failover' | 'comparison';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  message?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

