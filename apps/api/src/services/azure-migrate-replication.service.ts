import { ClientSecretCredential } from '@azure/identity';
import { azureConfigService } from './azure-config.service.js';

const AZURE_MGMT_URL = 'https://management.azure.com';

/**
 * Azure Migrate Server Migration Service
 * Uses the Azure Migrate APIs for replication instead of directly interacting with Recovery Services vault
 */

export interface MigratingMachine {
  id: string;
  name: string;
  type: string;
  properties: {
    machineName: string;
    testMigrateState?: string;
    migrationState?: string;
    migrationProgressPercentage?: number;
    replicationStatus?: string;
    infrastructureVmId?: string;
    targetVmName?: string;
    targetResourceGroup?: string;
    targetVNetId?: string;
    targetSubnetName?: string;
    targetVmSize?: string;
    provisioningState?: string;
    currentJobId?: string;
    currentJobName?: string;
    lastTestMigrationTime?: string;
    lastMigrationTime?: string;
    healthErrors?: Array<{
      errorCode: string;
      errorMessage: string;
      possibleCauses: string;
      recommendedAction: string;
    }>;
  };
}

export interface EnableMigrationInput {
  machineId: string;  // Azure Migrate discovered machine ID
  machineName: string;
  targetResourceGroup: string;
  targetVNetId: string;
  targetSubnetName: string;
  targetVmSize: string;
  targetVmName?: string;
  licenseType?: 'NoLicenseType' | 'WindowsServer';
  dataMoverRunAsAccountId?: string;
  snapshotRunAsAccountId?: string;
  targetBootDiagnosticsStorageAccountId?: string;
  targetAvailabilityZone?: string;
  targetAvailabilitySetId?: string;
  diskType?: 'Standard_LRS' | 'Premium_LRS' | 'StandardSSD_LRS';
  performAutoResync?: boolean;
}

class AzureMigrateReplicationService {
  private credential: ClientSecretCredential | null = null;

  private async getCredential(): Promise<ClientSecretCredential | null> {
    if (this.credential) {
      return this.credential;
    }

    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return null;
    }

    this.credential = new ClientSecretCredential(
      config.tenantId,
      config.clientId,
      config.clientSecret
    );
    return this.credential;
  }

  private async getAccessToken(): Promise<string | null> {
    const credential = await this.getCredential();
    if (!credential) {
      return null;
    }

    try {
      const tokenResponse = await credential.getToken('https://management.azure.com/.default');
      return tokenResponse.token;
    } catch (error) {
      console.error('Failed to get Azure access token:', error);
      return null;
    }
  }

  private async makeRequest<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T | null> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Azure not configured or authentication failed');
    }

    const url = endpoint.startsWith('http') ? endpoint : `${AZURE_MGMT_URL}${endpoint}`;
    
    console.log(`Azure Migrate API: ${method} ${url}`);
    if (body) {
      console.log('Request body:', JSON.stringify(body, null, 2));
    }

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();

    if (!response.ok) {
      console.error(`Azure Migrate API error: ${response.status} - ${text}`);
      throw new Error(`Azure Migrate API error: ${response.status} - ${text}`);
    }

    if (response.status === 202) {
      // Accepted - async operation started
      const asyncLocation = response.headers.get('Azure-AsyncOperation') || response.headers.get('Location');
      console.log('Async operation started:', asyncLocation);
      return { asyncOperationUrl: asyncLocation, status: 'Accepted' } as T;
    }

    if (response.status === 204 || !text) {
      return null;
    }

    return JSON.parse(text);
  }

  /**
   * Get VMware site information
   */
  async getVMwareSite(): Promise<{
    siteName: string;
    siteId: string;
    applianceId?: string;
  } | null> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return null;
    }

    // List VMware sites using correct API version
    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.OffAzure/VMwareSites?api-version=2023-06-06`;
    
    try {
      const response = await this.makeRequest<{ value: Array<{ id: string; name: string; properties?: { applianceName?: string } }> }>('GET', endpoint);
      const site = response?.value?.[0];
      if (site) {
        return {
          siteName: site.name,
          siteId: site.id,
          applianceId: site.properties?.applianceName,
        };
      }
    } catch (e) {
      console.error('Failed to get VMware site:', e);
    }
    return null;
  }

  /**
   * Get the Azure Migrate project and solution information
   */
  async getMigrateProject(): Promise<{
    projectName: string;
    projectId: string;
    solutionName: string;
    solutionId: string;
  } | null> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return null;
    }

    // List migrate projects
    const projectsEndpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Migrate/migrateProjects?api-version=2020-05-01`;
    
    try {
      const projectsResponse = await this.makeRequest<{ value: Array<{ id: string; name: string }> }>('GET', projectsEndpoint);
      const project = projectsResponse?.value?.[0];
      
      if (!project) {
        return null;
      }

      // Get solutions to find Server Migration
      const solutionsEndpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Migrate/migrateProjects/${project.name}/solutions?api-version=2020-05-01`;
      
      const solutionsResponse = await this.makeRequest<{ value: Array<{ id: string; name: string; properties?: { tool?: string } }> }>('GET', solutionsEndpoint);
      const migrationSolution = solutionsResponse?.value?.find(s => 
        s.name.includes('Servers-Migration') || 
        s.properties?.tool === 'ServerMigration'
      );

      if (migrationSolution) {
        return {
          projectName: project.name,
          projectId: project.id,
          solutionName: migrationSolution.name,
          solutionId: migrationSolution.id,
        };
      }
    } catch (e) {
      console.error('Failed to get migrate project:', e);
    }
    return null;
  }

  /**
   * Get machines that are replicating (from Azure Migrate perspective)
   */
  async getReplicatingMachines(): Promise<MigratingMachine[]> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return [];
    }

    const site = await this.getVMwareSite();
    if (!site) {
      console.log('No VMware site found');
      return [];
    }

    // Get replicating machines from the VMware site
    // Using the replicating machines endpoint
    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.OffAzure/VMwareSites/${site.siteName}/replicatingServers?api-version=2023-06-06`;

    try {
      const response = await this.makeRequest<{ value: MigratingMachine[] }>('GET', endpoint);
      return response?.value || [];
    } catch (e) {
      console.log('No replicating servers endpoint, trying alternative...', e);
    }

    // Alternative: Check the migrate project's machines
    const project = await this.getMigrateProject();
    if (!project) {
      return [];
    }

    const altEndpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Migrate/migrateProjects/${project.projectName}/replicatingServers?api-version=2020-05-01`;

    try {
      const response = await this.makeRequest<{ value: MigratingMachine[] }>('GET', altEndpoint);
      return response?.value || [];
    } catch (e) {
      console.log('Failed to get replicating machines:', e);
      return [];
    }
  }

  /**
   * Get machines available for replication (discovered but not yet replicating)
   */
  async getProtectableMachines(): Promise<Array<{
    id: string;
    name: string;
    displayName: string;
    powerStatus: string;
    ipAddresses: string[];
    operatingSystem: string;
    canReplicate: boolean;
    replicationStatus?: string;
  }>> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return [];
    }

    const site = await this.getVMwareSite();
    if (!site) {
      return [];
    }

    // Get machines from VMware site
    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.OffAzure/VMwareSites/${site.siteName}/machines?api-version=2023-06-06`;

    try {
      const response = await this.makeRequest<{ 
        value: Array<{
          id: string;
          name: string;
          properties: {
            displayName: string;
            powerStatus: string;
            ipAddresses: string;
            operatingSystemDetails?: { osName?: string };
            isDeleted?: boolean;
          };
        }> 
      }>('GET', endpoint);
      
      const machines = response?.value || [];
      
      return machines
        .filter(m => !m.properties.isDeleted)
        .map(m => ({
          id: m.id,
          name: m.name,
          displayName: m.properties.displayName,
          powerStatus: m.properties.powerStatus || 'Unknown',
          ipAddresses: JSON.parse(m.properties.ipAddresses || '[]'),
          operatingSystem: m.properties.operatingSystemDetails?.osName || 'Unknown',
          canReplicate: m.properties.powerStatus === 'poweredOn',
        }));
    } catch (e) {
      console.error('Failed to get protectable machines:', e);
      return [];
    }
  }

  /**
   * Enable replication for a machine using Azure Migrate
   * This is the agentless VMware migration approach
   */
  async enableReplication(input: EnableMigrationInput): Promise<{
    success: boolean;
    machineId?: string;
    jobId?: string;
    error?: string;
  }> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return { success: false, error: 'Azure not configured' };
    }

    const site = await this.getVMwareSite();
    if (!site) {
      return { success: false, error: 'No VMware site found. Please ensure Azure Migrate appliance is set up.' };
    }

    // The machine ID should be the full ARM resource ID
    const machineArmId = input.machineId.startsWith('/subscriptions') 
      ? input.machineId 
      : `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.OffAzure/VMwareSites/${site.siteName}/machines/${input.machineId}`;

    // Enable replication using Azure Migrate's agentless replication
    // This creates a replicating server entry
    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.OffAzure/VMwareSites/${site.siteName}/machines/${input.machineName}/startMigration?api-version=2023-06-06`;

    const body = {
      targetResourceGroupId: `/subscriptions/${config.subscriptionId}/resourceGroups/${input.targetResourceGroup}`,
      targetNetworkId: input.targetVNetId,
      targetSubnetName: input.targetSubnetName,
      targetVmName: input.targetVmName || input.machineName,
      targetVmSize: input.targetVmSize,
      licenseType: input.licenseType || 'NoLicenseType',
      targetAvailabilityZone: input.targetAvailabilityZone,
      targetAvailabilitySetId: input.targetAvailabilitySetId,
      targetBootDiagnosticsStorageAccountId: input.targetBootDiagnosticsStorageAccountId,
      diskType: input.diskType || 'Standard_LRS',
      performAutoResync: input.performAutoResync !== false,
    };

    try {
      const response = await this.makeRequest<{ id?: string; asyncOperationUrl?: string; status?: string }>('POST', endpoint, body);
      
      return {
        success: true,
        machineId: machineArmId,
        jobId: response?.asyncOperationUrl || response?.id,
      };
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      console.error('Failed to enable replication:', errorMessage);
      
      // Check if it's because replication isn't set up yet
      if (errorMessage.includes('400') || errorMessage.includes('not found')) {
        return {
          success: false,
          error: `Cannot enable replication. Please ensure:
1. Azure Migrate appliance is registered and online
2. VMware site discovery is complete
3. The machine "${input.machineName}" is discovered and powered on

To set up replication:
1. Go to Azure Portal > Azure Migrate > Servers, databases and web apps
2. Click on "Replicate" under Azure Migrate: Server Migration
3. Follow the wizard to set up replication

Error: ${errorMessage}`,
        };
      }
      
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get migration status for a specific machine
   */
  async getMigrationStatus(machineId: string): Promise<MigratingMachine | null> {
    const machines = await this.getReplicatingMachines();
    return machines.find(m => m.id === machineId || m.name === machineId) || null;
  }

  /**
   * Start test migration for a machine
   */
  async startTestMigration(
    machineName: string,
    testNetworkId: string
  ): Promise<{ success: boolean; jobId?: string; error?: string }> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return { success: false, error: 'Azure not configured' };
    }

    const site = await this.getVMwareSite();
    if (!site) {
      return { success: false, error: 'No VMware site found' };
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.OffAzure/VMwareSites/${site.siteName}/machines/${machineName}/testMigrate?api-version=2023-06-06`;

    try {
      const response = await this.makeRequest<{ id?: string }>('POST', endpoint, {
        testNetworkId,
      });
      return { success: true, jobId: response?.id };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  }

  /**
   * Start actual migration for a machine
   */
  async startMigration(machineName: string): Promise<{ success: boolean; jobId?: string; error?: string }> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return { success: false, error: 'Azure not configured' };
    }

    const site = await this.getVMwareSite();
    if (!site) {
      return { success: false, error: 'No VMware site found' };
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.OffAzure/VMwareSites/${site.siteName}/machines/${machineName}/migrate?api-version=2023-06-06`;

    try {
      const response = await this.makeRequest<{ id?: string }>('POST', endpoint, {
        performShutdown: true,
      });
      return { success: true, jobId: response?.id };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  }

  /**
   * Stop replication for a machine
   */
  async stopReplication(machineName: string): Promise<{ success: boolean; error?: string }> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return { success: false, error: 'Azure not configured' };
    }

    const site = await this.getVMwareSite();
    if (!site) {
      return { success: false, error: 'No VMware site found' };
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.OffAzure/VMwareSites/${site.siteName}/machines/${machineName}/disableMigration?api-version=2023-06-06`;

    try {
      await this.makeRequest('POST', endpoint, {});
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  }

  /**
   * Get Azure Migrate jobs
   */
  async getJobs(): Promise<Array<{
    id: string;
    name: string;
    status: string;
    startTime: string;
    endTime?: string;
    targetMachine?: string;
    scenarioName: string;
  }>> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return [];
    }

    const project = await this.getMigrateProject();
    if (!project) {
      return [];
    }

    // Get jobs from migrate project
    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Migrate/migrateProjects/${project.projectName}/migrateJobs?api-version=2020-05-01`;

    try {
      const response = await this.makeRequest<{ 
        value: Array<{
          id: string;
          name: string;
          properties: {
            state: string;
            startTime: string;
            endTime?: string;
            targetObjectName?: string;
            scenarioName: string;
          };
        }> 
      }>('GET', endpoint);
      
      return (response?.value || []).map(j => ({
        id: j.id,
        name: j.name,
        status: j.properties.state,
        startTime: j.properties.startTime,
        endTime: j.properties.endTime,
        targetMachine: j.properties.targetObjectName,
        scenarioName: j.properties.scenarioName,
      }));
    } catch (e) {
      console.error('Failed to get jobs:', e);
      return [];
    }
  }

  /**
   * Get comprehensive Azure Migrate infrastructure info
   */
  async getInfrastructure(): Promise<{
    configured: boolean;
    vmwareSite?: {
      name: string;
      id: string;
      applianceId?: string;
    };
    migrateProject?: {
      name: string;
      id: string;
      solutionName: string;
    };
    replicatingMachines: MigratingMachine[];
    protectableMachines: Array<{
      id: string;
      name: string;
      displayName: string;
      canReplicate: boolean;
    }>;
    message?: string;
  }> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return {
        configured: false,
        replicatingMachines: [],
        protectableMachines: [],
        message: 'Azure not configured',
      };
    }

    const site = await this.getVMwareSite();
    const project = await this.getMigrateProject();
    const replicatingMachines = await this.getReplicatingMachines();
    const protectableMachines = await this.getProtectableMachines();

    return {
      configured: true,
      vmwareSite: site ? {
        name: site.siteName,
        id: site.siteId,
        applianceId: site.applianceId,
      } : undefined,
      migrateProject: project ? {
        name: project.projectName,
        id: project.projectId,
        solutionName: project.solutionName,
      } : undefined,
      replicatingMachines,
      protectableMachines,
      message: !site ? 'No VMware site found. Please set up Azure Migrate appliance.' :
               !project ? 'No migrate project found.' :
               undefined,
    };
  }
}

export const azureMigrateReplicationService = new AzureMigrateReplicationService();

