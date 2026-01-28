import { ClientSecretCredential } from '@azure/identity';
import { azureConfigService } from './azure-config.service.js';

const AZURE_MGMT_URL = 'https://management.azure.com';

export interface RecoveryServicesVault {
  id: string;
  name: string;
  location: string;
  type: string;
  properties: {
    provisioningState: string;
  };
}

export interface ReplicationFabric {
  id: string;
  name: string;
  type: string;
  properties: {
    friendlyName: string;
    encryptionDetails?: {
      kekState: string;
    };
    customDetails?: {
      instanceType: string;
      vmwareSiteId?: string;
      physicalSiteId?: string;
      // InMageRcm specific properties
      sourceAgentIdentity?: {
        aadAuthority?: string;
        applicationId?: string;
        audience?: string;
        objectId?: string;
        tenantId?: string;
      };
      processServerName?: string;
      processServerId?: string;
      // Legacy InMage properties
      processServers?: Array<{
        id: string;
        name: string;
        friendlyName: string;
        ipAddress: string;
        health: string;
        runAsAccountId?: string;
      }>;
    };
    internalIdentifier?: string;
  };
}

export interface ProtectionContainer {
  id: string;
  name: string;
  type: string;
  properties: {
    friendlyName: string;
    fabricFriendlyName: string;
    protectedItemCount?: number;
    pairingStatus?: string;
    fabricType?: string;
  };
}

export interface PolicyMapping {
  id: string;
  name: string;
  type: string;
  properties: {
    targetProtectionContainerId?: string;
    targetProtectionContainerFriendlyName?: string;
    policyId?: string;
    policyFriendlyName?: string;
    state?: string;
  };
}

export interface ReplicationProtectedItem {
  id: string;
  name: string;
  type: string;
  properties: {
    friendlyName: string;
    protectionState: string;
    protectionStateDescription: string;
    replicationHealth: string;
    testFailoverState?: string;
    testFailoverStateDescription?: string;
    currentScenario?: {
      scenarioName: string;
      jobId: string;
      startTime: string;
    };
    recoveryServicesProviderId?: string;
    primaryFabricFriendlyName?: string;
    recoveryFabricFriendlyName?: string;
    providerSpecificDetails?: {
      instanceType: string;
      vmId?: string;
      vCenterId?: string;
      osType?: string;
      osName?: string;
      resyncProgressPercentage?: number;
      lastRpoCalculatedTime?: string;
      rpoInSeconds?: number;
      lastHeartbeat?: string;
      ipAddress?: string;
      targetVmId?: string;
      targetAzureVmName?: string;
      targetAzureResourceGroupId?: string;
      targetAzureNetworkId?: string;
      targetAzureSubnetId?: string;
      targetAzureV1ResourceGroupId?: string;
      targetAvailabilityZone?: string;
      targetAzureVmSize?: string;
    };
  };
}

export interface EnableReplicationInput {
  machineName: string;
  machineId: string;  // Azure Migrate discovered machine ID (VMware site machine ARM ID)
  targetResourceGroup: string;
  targetNetworkId: string;
  targetSubnetName: string;
  targetVmSize: string;
  targetStorageAccountId: string;  // Cache/log storage account for replication
  targetAvailabilityZone?: string;
  targetAvailabilitySetId?: string;
  licenseType?: string;
  // VMwareCbt specific - run-as account IDs from VMware site (required)
  dataMoverRunAsAccountId?: string;  // vCenter credentials for data mover
  snapshotRunAsAccountId?: string;   // Guest credentials for snapshots (Linux/Windows)
  disks?: Array<{
    diskId: string;
    isOSDisk: boolean;
    diskType?: string;  // Standard_LRS, Premium_LRS, StandardSSD_LRS
    targetDiskSizeGB?: number;  // Target disk size in GB (must be >= source size)
  }>;
}

export interface DiscoveredMachineDetails {
  id: string;
  name: string;
  properties: {
    displayName: string;
    osType?: string;
    osName?: string;
    // Disks can be returned as a dictionary or array depending on API version
    disks?: Record<string, {
      uuid?: string;
      diskId?: string;
      displayName?: string;
      name?: string;
      label?: string;
      megabytesOfSize?: number;
      maxSizeInBytes?: number;  // This is the actual disk size field from Azure
      diskType?: string;
      path?: string;
    }> | Array<{
      uuid?: string;
      diskId?: string;
      displayName?: string;
      name?: string;
      label?: string;
      megabytesOfSize?: number;
      maxSizeInBytes?: number;
      diskType?: string;
      path?: string;
    }>;
    ipAddresses?: string[];
    // VMware specific properties
    vmFqdn?: string;
    vCenterId?: string;
    hostName?: string;
    instanceUuid?: string;
  };
}

class AzureSiteRecoveryService {
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
    body?: unknown,
    options?: { suppressNotFoundError?: boolean }
  ): Promise<T | null> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Azure not configured or authentication failed');
    }

    const response = await fetch(`${AZURE_MGMT_URL}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      // 404 errors are expected when checking for resources that might not exist
      // Don't log them as errors to reduce noise
      if (response.status === 404) {
        if (!options?.suppressNotFoundError) {
          console.log(`Resource not found (404): ${endpoint.split('?')[0].split('/').pop()}`);
        }
        return null;
      }
      
      // 400 errors for invalid filters should also be handled gracefully
      if (response.status === 400 && errorText.includes('InvalidFilterQueryStringToParse')) {
        console.warn(`Azure API filter error - returning empty result`);
        return null;
      }
      
      console.error(`Azure API error: ${response.status} - ${errorText}`);
      throw new Error(`Azure API error: ${response.status} - ${errorText}`);
    }

    if (response.status === 204) {
      return null;
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  /**
   * Get Recovery Services vaults in the resource group
   */
  async getVaults(): Promise<RecoveryServicesVault[]> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return [];
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults?api-version=2023-04-01`;
    
    try {
      const response = await this.makeRequest<{ value: RecoveryServicesVault[] }>('GET', endpoint);
      return response?.value || [];
    } catch (e) {
      console.error('Failed to get Recovery Services vaults:', e);
      return [];
    }
  }

  /**
   * Get the Azure Migrate project vault (used by Server Migration)
   */
  async getMigrateVault(): Promise<RecoveryServicesVault | null> {
    const vaults = await this.getVaults();
    // Azure Migrate creates a vault named like "{projectname}vault" or similar
    const migrateVault = vaults.find(v => 
      v.name.includes('migrate') || 
      v.name.includes('Migrate') ||
      v.name.includes('vault')
    );
    return migrateVault || vaults[0] || null;
  }

  /**
   * Get replication fabrics (VMware sites, etc.)
   */
  async getFabrics(vaultName: string): Promise<ReplicationFabric[]> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return [];
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationFabrics?api-version=2023-06-01`;
    
    try {
      const response = await this.makeRequest<{ value: ReplicationFabric[] }>('GET', endpoint);
      // Log full fabric details for debugging
      if (response?.value) {
        response.value.forEach((f, i) => {
          console.log(`Fabric ${i} (${f.name}):`, JSON.stringify(f.properties.customDetails, null, 2));
        });
      }
      return response?.value || [];
    } catch (e) {
      console.error('Failed to get replication fabrics:', e);
      return [];
    }
  }

  /**
   * Get protection containers
   */
  async getProtectionContainers(vaultName: string, fabricName: string): Promise<ProtectionContainer[]> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return [];
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationFabrics/${fabricName}/replicationProtectionContainers?api-version=2023-06-01`;
    
    try {
      const response = await this.makeRequest<{ value: ProtectionContainer[] }>('GET', endpoint);
      return response?.value || [];
    } catch (e) {
      console.error('Failed to get protection containers:', e);
      return [];
    }
  }

  /**
   * Get all protection containers across all fabrics
   */
  async getAllProtectionContainers(vaultName: string): Promise<ProtectionContainer[]> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return [];
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationProtectionContainers?api-version=2023-06-01`;
    
    try {
      const response = await this.makeRequest<{ value: ProtectionContainer[] }>('GET', endpoint);
      return response?.value || [];
    } catch (e) {
      console.error('Failed to get all protection containers:', e);
      return [];
    }
  }

  /**
   * Get all protection container mappings at vault level (as Azure Migrate does)
   */
  async getAllProtectionContainerMappings(vaultName: string): Promise<PolicyMapping[]> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return [];
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationProtectionContainerMappings?api-version=2023-06-01`;
    
    try {
      const response = await this.makeRequest<{ value: PolicyMapping[] }>('GET', endpoint);
      return response?.value || [];
    } catch (e) {
      console.error('Failed to get all protection container mappings:', e);
      return [];
    }
  }

  /**
   * Get replication protected items (replicated VMs)
   */
  async getReplicatedItems(vaultName: string): Promise<ReplicationProtectedItem[]> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return [];
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationProtectedItems?api-version=2023-06-01`;
    
    try {
      const response = await this.makeRequest<{ value: ReplicationProtectedItem[] }>('GET', endpoint);
      return response?.value || [];
    } catch (e) {
      console.error('Failed to get replicated items:', e);
      return [];
    }
  }

  /**
   * Get migration items with detailed status (VMwareCbt specific)
   * Returns rich status information including progress, state descriptions, etc.
   */
  async getMigrationItemsWithStatus(vaultName: string): Promise<Array<{
    id: string;
    name: string;
    machineName: string;
    migrationState: string;
    migrationStateDescription: string;
    health: string;
    healthErrors: Array<{ errorCode: string; errorMessage: string; possibleCauses?: string; recommendedAction?: string }>;
    replicationStatus: string;
    testMigrateState: string;
    testMigrateStateDescription: string;
    lastRecoveryPointReceived?: string;
    initialSeedingProgress?: number;
    deltaSyncProgress?: number;
    resyncRequired: boolean;
    resyncProgress?: number;
    allowedOperations: string[];
    osType?: string;
    firmwareType?: string;
    targetVmName?: string;
    targetVmSize?: string;
    targetResourceGroup?: string;
  }>> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return [];
    }

    // Use api-version 2025-08-01 to get the most detailed status
    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationMigrationItems?api-version=2025-08-01`;
    
    try {
      const response = await this.makeRequest<{ value: Array<{
        id: string;
        name: string;
        properties: {
          machineName: string;
          migrationState: string;
          migrationStateDescription: string;
          health: string;
          healthErrors: Array<{ errorCode: string; errorMessage: string; possibleCauses?: string; recommendedAction?: string }>;
          replicationStatus?: string;
          testMigrateState: string;
          testMigrateStateDescription: string;
          allowedOperations: string[];
          providerSpecificDetails?: {
            instanceType: string;
            lastRecoveryPointReceived?: string;
            initialSeedingProgressPercentage?: number;
            deltaSyncProgressPercentage?: number;
            resyncRequired?: string;
            resyncProgressPercentage?: number;
            osType?: string;
            firmwareType?: string;
            targetVmName?: string;
            targetVmSize?: string;
            targetResourceGroupId?: string;
          };
        };
      }> }>('GET', endpoint);

      if (!response?.value) {
        return [];
      }

      return response.value.map(item => {
        const props = item.properties;
        const provider = props.providerSpecificDetails;
        
        // Determine replication status based on migration state
        let replicationStatus = 'Unknown';
        if (props.migrationState === 'Replicating') {
          if (provider?.initialSeedingProgressPercentage !== undefined && provider.initialSeedingProgressPercentage < 100) {
            replicationStatus = 'Initial replication';
          } else if (provider?.deltaSyncProgressPercentage !== undefined) {
            replicationStatus = 'Delta sync';
          } else if (provider?.resyncProgressPercentage !== undefined && provider.resyncProgressPercentage > 0) {
            replicationStatus = 'Resync in progress';
          } else {
            replicationStatus = 'Delta sync';
          }
        } else if (props.migrationState === 'EnableMigrationInProgress') {
          replicationStatus = 'Enabling migration';
        }

        return {
          id: item.id,
          name: item.name,
          machineName: props.machineName,
          migrationState: props.migrationState,
          migrationStateDescription: props.migrationStateDescription,
          health: props.health,
          healthErrors: props.healthErrors || [],
          replicationStatus,
          testMigrateState: props.testMigrateState || 'None',
          testMigrateStateDescription: props.testMigrateStateDescription || 'None',
          lastRecoveryPointReceived: provider?.lastRecoveryPointReceived,
          initialSeedingProgress: provider?.initialSeedingProgressPercentage,
          deltaSyncProgress: provider?.deltaSyncProgressPercentage,
          resyncRequired: provider?.resyncRequired === 'true',
          resyncProgress: provider?.resyncProgressPercentage,
          allowedOperations: props.allowedOperations || [],
          osType: provider?.osType,
          firmwareType: provider?.firmwareType,
          targetVmName: provider?.targetVmName,
          targetVmSize: provider?.targetVmSize,
          targetResourceGroup: provider?.targetResourceGroupId?.split('/').pop(),
        };
      });
    } catch (e) {
      console.error('[v12] Failed to get migration items with status:', e);
      return [];
    }
  }

  /**
   * Discover the target region from Azure Migrate configuration
   * This checks existing migration items and protection container mappings
   */
  async discoverTargetRegion(vaultName: string): Promise<string | null> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return null;
    }

    try {
      // First, try to get from existing migration items
      const migrationItemsEndpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationMigrationItems?api-version=2023-06-01`;
      
      const migrationResponse = await this.makeRequest<{ value: Array<{
        id: string;
        name: string;
        properties: {
          providerSpecificDetails?: {
            instanceType: string;
            targetLocation?: string;
            targetResourceGroupId?: string;
            targetVmName?: string;
          };
        };
      }> }>('GET', migrationItemsEndpoint);

      if (migrationResponse?.value?.length > 0) {
        for (const item of migrationResponse.value) {
          const targetLocation = item.properties?.providerSpecificDetails?.targetLocation;
          if (targetLocation) {
            console.log(`Found target region from migration item: ${targetLocation}`);
            return targetLocation;
          }
          
          // Try to extract from targetResourceGroupId
          const targetRgId = item.properties?.providerSpecificDetails?.targetResourceGroupId;
          if (targetRgId) {
            // Get the resource group to find its location
            const rgEndpoint = `${targetRgId}?api-version=2021-04-01`;
            try {
              const rgResponse = await this.makeRequest<{ location: string }>('GET', rgEndpoint);
              if (rgResponse?.location) {
                console.log(`Found target region from resource group: ${rgResponse.location}`);
                return rgResponse.location;
              }
            } catch (e) {
              console.log('Could not get RG location:', e);
            }
          }
        }
      }

      // Try protection container mappings for target info
      const mappingsEndpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationProtectionContainerMappings?api-version=2023-06-01`;
      
      const mappingsResponse = await this.makeRequest<{ value: Array<{
        id: string;
        properties: {
          targetProtectionContainerId?: string;
          providerSpecificDetails?: {
            instanceType: string;
            targetLocation?: string;
          };
        };
      }> }>('GET', mappingsEndpoint);

      if (mappingsResponse?.value) {
        for (const mapping of mappingsResponse.value) {
          const targetLocation = mapping.properties?.providerSpecificDetails?.targetLocation;
          if (targetLocation) {
            console.log(`Found target region from container mapping: ${targetLocation}`);
            return targetLocation;
          }
        }
      }

      return null;
    } catch (e) {
      console.error('Failed to discover target region:', e);
      return null;
    }
  }

  /**
   * Get replicated items from a specific protection container
   */
  async getReplicatedItemsInContainer(
    vaultName: string,
    fabricName: string,
    containerName: string
  ): Promise<ReplicationProtectedItem[]> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return [];
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationFabrics/${fabricName}/replicationProtectionContainers/${containerName}/replicationProtectedItems?api-version=2023-06-01`;
    
    try {
      const response = await this.makeRequest<{ value: ReplicationProtectedItem[] }>('GET', endpoint);
      return response?.value || [];
    } catch (e) {
      console.error('Failed to get replicated items in container:', e);
      return [];
    }
  }

  /**
   * Get policy mappings for a container
   */
  async getPolicyMappings(
    vaultName: string,
    fabricName: string,
    containerName: string
  ): Promise<PolicyMapping[]> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return [];
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationFabrics/${fabricName}/replicationProtectionContainers/${containerName}/replicationProtectionContainerMappings?api-version=2023-06-01`;
    
    try {
      const response = await this.makeRequest<{ value: PolicyMapping[] }>('GET', endpoint);
      return response?.value || [];
    } catch (e) {
      console.error('Failed to get policy mappings:', e);
      return [];
    }
  }

  /**
   * Get replication infrastructure details (comprehensive discovery)
   */
  async discoverInfrastructure() {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return {
        configured: false,
        error: 'Azure not configured',
      };
    }

    const vaults = await this.getVaults();
    if (vaults.length === 0) {
      return {
        configured: true,
        vaults: [],
        message: 'No Recovery Services vaults found. Please ensure Azure Migrate appliance is registered.',
      };
    }

    const infrastructure: {
      vaults: Array<{
        vault: RecoveryServicesVault;
        fabrics: Array<{
          fabric: ReplicationFabric;
          containers: Array<{
            container: ProtectionContainer;
            policyMappings: PolicyMapping[];
            replicatedItems: ReplicationProtectedItem[];
          }>;
        }>;
      }>;
    } = { vaults: [] };

    for (const vault of vaults) {
      const vaultData: (typeof infrastructure.vaults)[0] = {
        vault,
        fabrics: [],
      };

      const fabrics = await this.getFabrics(vault.name);
      
      for (const fabric of fabrics) {
        const fabricData: (typeof vaultData.fabrics)[0] = {
          fabric,
          containers: [],
        };

        const containers = await this.getProtectionContainers(vault.name, fabric.name);
        
        for (const container of containers) {
          const policyMappings = await this.getPolicyMappings(vault.name, fabric.name, container.name);
          const replicatedItems = await this.getReplicatedItemsInContainer(vault.name, fabric.name, container.name);
          
          fabricData.containers.push({
            container,
            policyMappings,
            replicatedItems,
          });
        }

        vaultData.fabrics.push(fabricData);
      }

      infrastructure.vaults.push(vaultData);
    }

    return {
      configured: true,
      ...infrastructure,
    };
  }

  /**
   * Enable replication for a machine using Azure Migrate Server Migration
   * This uses the InMageRcm provider for VMware to Azure migration
   */
  /**
   * Get discovered machine details from VMware Site including disk information
   */
  async getDiscoveredMachineDetails(machineId: string): Promise<DiscoveredMachineDetails | null> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return null;
    }

    // machineId format: /subscriptions/.../providers/Microsoft.OffAzure/VMwareSites/{site}/machines/{machineId}
    const endpoint = `${machineId}?api-version=2023-06-06`;

    try {
      return await this.makeRequest<DiscoveredMachineDetails>('GET', endpoint);
    } catch (e) {
      console.error('Failed to get discovered machine details:', e);
      return null;
    }
  }

  /**
   * Enable replication using VMwareCbt (agentless migration)
   * This uses the replicationMigrationItems endpoint for Azure Migrate modernized scenario
   */
  async enableReplication(
    vaultName: string,
    fabricName: string,
    containerName: string,
    policyId: string,
    input: EnableReplicationInput
  ): Promise<ReplicationProtectedItem | null> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    // Get machine details to discover disks
    const machineDetails = await this.getDiscoveredMachineDetails(input.machineId);
    console.log(`Machine details for ${input.machineName}:`, JSON.stringify(machineDetails?.properties?.disks, null, 2));

    // Get the cache storage account name from the ID for SAS secret name
    const storageAccountName = input.targetStorageAccountId.split('/').pop() || '';
    const logStorageAccountSasSecretName = `${storageAccountName}-cacheSas`;

    // Build disks to include array for VMwareCbt
    // ALWAYS use disk UUIDs from Azure Migrate machine details - frontend disk IDs may be placeholders
    let disksToInclude: Array<{
      diskId: string;
      isOSDisk: string;
      diskType: string;
      logStorageAccountId: string;
      logStorageAccountSasSecretName: string;
      diskEncryptionSetId?: string;
      targetDiskName?: string;
      targetDiskSizeInBytes?: number;
    }> = [];

    // Get disks from machine details - this is the source of truth for disk UUIDs
    if (machineDetails?.properties?.disks) {
      const disksArray = Array.isArray(machineDetails.properties.disks) 
        ? machineDetails.properties.disks 
        : Object.values(machineDetails.properties.disks);
      
      // Log what we received from frontend
      console.log(`[v10] Input disks from frontend (${input.disks?.length || 0} disks):`, JSON.stringify(input.disks, null, 2));
      console.log(`[v10] Azure discovered disks (${disksArray.length} disks):`, disksArray.map((d: any) => ({ uuid: d.uuid, name: d.displayName, sizeBytes: d.maxSizeInBytes })));
      
      if (disksArray.length > 0) {
        disksToInclude = disksArray.map((disk: any, index: number) => {
          // Match frontend disk by index - frontend disks are in the same order as Azure disks
          // The frontend fetches from the same Azure source, so indexes should match
          const frontendDisk = input.disks?.[index];
          
          console.log(`[v10] Disk ${index}: Azure UUID='${disk.uuid}', diskName='${disk.displayName || disk.name}'`);
          console.log(`[v10] Disk ${index}: frontendDisk at index ${index}:`, frontendDisk ? JSON.stringify(frontendDisk) : 'NOT FOUND');
          
          // Get source disk size from Azure
          const sourceSizeGB = disk.maxSizeInBytes 
            ? Math.ceil(disk.maxSizeInBytes / (1024 * 1024 * 1024))
            : 128;
          
          // Use frontend target size if provided, otherwise use source size
          // Frontend should have the user's desired target size
          const targetSizeGB = frontendDisk?.targetDiskSizeGB || sourceSizeGB;
          
          console.log(`[v10] Disk ${index}: sourceSizeGB=${sourceSizeGB}, frontendTargetGB=${frontendDisk?.targetDiskSizeGB}, finalTargetGB=${targetSizeGB}`);
          
          // Calculate target disk size in bytes - MUST be a string for VMwareCbt API
          const targetDiskSizeInBytes = (targetSizeGB * 1024 * 1024 * 1024).toString();
          
          const diskConfig: any = {
            diskId: disk.uuid || disk.diskId || '',
            isOSDisk: index === 0 ? 'true' : 'false',
            diskType: frontendDisk?.diskType || 'Standard_LRS',
            logStorageAccountId: input.targetStorageAccountId,
            logStorageAccountSasSecretName,
            targetDiskName: index === 0 ? `${input.machineName}-OSDisk-00` : `${input.machineName}-DataDisk-${index.toString().padStart(2, '0')}`,
            // Target disk size MUST be a string (like isOSDisk) for VMwareCbt
            targetDiskSizeInBytes: targetDiskSizeInBytes,
          };
          
          console.log(`[v10] Disk ${index}: Setting targetDiskSizeInBytes="${targetDiskSizeInBytes}" (${targetSizeGB}GB) - as STRING`);
          
          return diskConfig;
        });
        console.log(`[v10] Final disksToInclude (${disksToInclude.length} disks):`, 
          disksToInclude.map(d => ({ 
            id: d.diskId.substring(0, 8) + '...', 
            isOS: d.isOSDisk, 
            targetSizeBytes: d.targetDiskSizeInBytes, // Now a string!
            targetGB: d.targetDiskSizeInBytes ? Math.round(parseInt(d.targetDiskSizeInBytes) / (1024*1024*1024)) : 'N/A',
            diskType: d.diskType 
          })));
      }
    }
    
    // Fallback: if no disks from Azure, use frontend disk config (but this may fail with Azure Migrate)
    if (disksToInclude.length === 0 && input.disks && input.disks.length > 0) {
      console.warn('Warning: Using frontend disk IDs - these may not match Azure Migrate disk UUIDs');
      disksToInclude = input.disks.map((disk) => ({
        diskId: disk.diskId,
        isOSDisk: disk.isOSDisk ? 'true' : 'false',
        diskType: disk.diskType || 'Standard_LRS',
        logStorageAccountId: input.targetStorageAccountId,
        logStorageAccountSasSecretName,
      }));
    }

    if (disksToInclude.length === 0) {
      throw new Error(`No disks found for machine ${input.machineName}. Please ensure the machine has disks discovered in Azure Migrate.`);
    }

    // Build the target network ARM ID if not already a full path
    let targetNetworkId = input.targetNetworkId;
    if (!targetNetworkId.startsWith('/subscriptions/')) {
      targetNetworkId = `/subscriptions/${config.subscriptionId}/resourceGroups/${input.targetResourceGroup}/providers/Microsoft.Network/virtualNetworks/${targetNetworkId}`;
    }

    // Use a sanitized machine name for the migration item name (must match Azure's format)
    // Azure uses the machine ARM ID path components: {vcenter-id}_{vm-id}
    const machineIdParts = input.machineId.split('/');
    const machineSegment = machineIdParts[machineIdParts.length - 1]; // e.g., "192-0-2-12-xxx_500920bf-xxx"
    const migrationItemName = machineSegment;
    
    // Use API version 2025-08-01 to match Azure portal exactly
    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationFabrics/${fabricName}/replicationProtectionContainers/${containerName}/replicationMigrationItems/${migrationItemName}?api-version=2025-08-01`;

    // VMwareCbt request body structure - matching EXACTLY what Azure Migrate portal sends
    const providerDetails: Record<string, unknown> = {
      instanceType: 'VMwareCbt',
      vmwareMachineId: input.machineId,
      targetResourceGroupId: `/subscriptions/${config.subscriptionId}/resourceGroups/${input.targetResourceGroup}`,
      targetNetworkId: targetNetworkId,
      targetSubnetName: input.targetSubnetName,
      targetVmName: input.machineName,
      targetVmSize: input.targetVmSize,
      licenseType: input.licenseType || 'NoLicenseType',
      linuxLicenseType: 'NoLicenseType',
      disksToInclude: disksToInclude,
      // Additional fields Azure portal sends
      performAutoResync: 'true',
      performSqlBulkRegistration: 'true',
      targetBootDiagnosticsStorageAccountId: input.targetStorageAccountId,
      targetDiskTags: {},
      targetNicTags: {},
      targetVmTags: {},
      targetVmSecurityProfile: {
        targetVmSecurityType: 'None',
        isTargetVmSecureBootEnabled: 'false',
        isTargetVmTpmEnabled: 'false',
      },
      testNetworkId: '',
      testSubnetName: '',
    };

    // Add run-as account IDs (required for VMwareCbt)
    if (input.dataMoverRunAsAccountId) {
      providerDetails.dataMoverRunAsAccountId = input.dataMoverRunAsAccountId;
      console.log('Using dataMoverRunAsAccountId:', input.dataMoverRunAsAccountId);
    }
    if (input.snapshotRunAsAccountId) {
      providerDetails.snapshotRunAsAccountId = input.snapshotRunAsAccountId;
      console.log('Using snapshotRunAsAccountId:', input.snapshotRunAsAccountId);
    }

    const body = {
      properties: {
        policyId,
        providerSpecificDetails: providerDetails,
      },
    };

    console.log(`[v8] Enabling VMwareCbt replication for ${input.machineName} with ${disksToInclude.length} disk(s)`);
    console.log('Using API version: 2025-08-01 (matching Azure portal)');
    console.log('Request body:', JSON.stringify(body, null, 2));

    try {
      const response = await this.makeRequest<ReplicationProtectedItem>('PUT', endpoint, body);
      console.log(`Successfully started replication for ${input.machineName}`);
      return response;
    } catch (e) {
      console.error('Failed to enable replication:', e);
      throw e;
    }
  }

  /**
   * Get a specific replicated item's status
   */
  async getReplicatedItemStatus(
    vaultName: string,
    fabricName: string,
    containerName: string,
    protectedItemName: string
  ): Promise<ReplicationProtectedItem | null> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return null;
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationFabrics/${fabricName}/replicationProtectionContainers/${containerName}/replicationProtectedItems/${protectedItemName}?api-version=2023-06-01`;

    try {
      return await this.makeRequest<ReplicationProtectedItem>('GET', endpoint);
    } catch (e) {
      console.error('Failed to get replicated item status:', e);
      return null;
    }
  }

  /**
   * Start test failover
   */
  async testFailover(
    vaultName: string,
    fabricName: string,
    containerName: string,
    protectedItemName: string,
    networkId: string
  ): Promise<{ jobId: string } | null> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationFabrics/${fabricName}/replicationProtectionContainers/${containerName}/replicationProtectedItems/${protectedItemName}/testFailover?api-version=2023-06-01`;

    const body = {
      properties: {
        failoverDirection: 'PrimaryToRecovery',
        networkType: 'VmNetworkAsInput',
        networkId,
        providerSpecificDetails: {
          instanceType: 'InMageRcm',
        },
      },
    };

    try {
      const response = await this.makeRequest<{ name: string }>('POST', endpoint, body);
      return { jobId: response?.name || '' };
    } catch (e) {
      console.error('Failed to start test failover:', e);
      throw e;
    }
  }

  /**
   * Start planned failover (migrate)
   */
  async plannedFailover(
    vaultName: string,
    fabricName: string,
    containerName: string,
    protectedItemName: string
  ): Promise<{ jobId: string } | null> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationFabrics/${fabricName}/replicationProtectionContainers/${containerName}/replicationProtectedItems/${protectedItemName}/plannedFailover?api-version=2023-06-01`;

    const body = {
      properties: {
        failoverDirection: 'PrimaryToRecovery',
        providerSpecificDetails: {
          instanceType: 'InMageRcm',
        },
      },
    };

    try {
      const response = await this.makeRequest<{ name: string }>('POST', endpoint, body);
      return { jobId: response?.name || '' };
    } catch (e) {
      console.error('Failed to start planned failover:', e);
      throw e;
    }
  }

  /**
   * Remove replication (disable protection and remove)
   */
  async disableReplication(
    vaultName: string,
    fabricName: string,
    containerName: string,
    protectedItemName: string
  ): Promise<boolean> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationFabrics/${fabricName}/replicationProtectionContainers/${containerName}/replicationProtectedItems/${protectedItemName}/remove?api-version=2023-06-01`;

    const body = {
      properties: {
        providerSpecificDetails: {
          instanceType: 'InMageRcm',
        },
      },
    };

    try {
      await this.makeRequest('POST', endpoint, body);
      return true;
    } catch (e) {
      console.error('Failed to disable replication:', e);
      return false;
    }
  }

  /**
   * Get InMageRcm replication appliances from the fabric
   * These contain the process server information needed for enabling replication
   */
  async getReplicationAppliances(vaultName: string, fabricName: string): Promise<Array<{
    id: string;
    name: string;
    properties: {
      applianceName?: string;
      fabricFriendlyName?: string;
      processServerId?: string;
      processServerFqdn?: string;
      replicationAgentName?: string;
      marsAgentName?: string;
      health?: string;
    };
  }>> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return [];
    }

    // Try InMageRcm appliances endpoint
    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationFabrics/${fabricName}/replicationRecoveryServicesProviders?api-version=2023-06-01`;
    
    try {
      const response = await this.makeRequest<{ value: Array<{
        id: string;
        name: string;
        properties: {
          applianceName?: string;
          fabricFriendlyName?: string;
          providerId?: string;
          machineId?: string;
          machineName?: string;
          healthErrorDetails?: Array<unknown>;
          connectionStatus?: string;
          protectedItemCount?: number;
          allowedScenarios?: string[];
          authenticationIdentityDetails?: unknown;
        };
      }> }>('GET', endpoint);
      
      console.log('Replication appliances found:', response?.value?.length || 0);
      if (response?.value) {
        response.value.forEach((a, i) => {
          console.log(`Appliance ${i}:`, {
            id: a.id,
            name: a.name,
            providerId: a.properties.providerId,
            machineId: a.properties.machineId,
            machineName: a.properties.machineName,
          });
        });
      }
      
      return (response?.value || []).map(a => ({
        id: a.id,
        name: a.name,
        properties: {
          applianceName: a.properties.machineName,
          fabricFriendlyName: a.properties.fabricFriendlyName,
          processServerId: a.properties.providerId || a.id, // Use provider ID as process server ID
          health: a.properties.connectionStatus,
        },
      }));
    } catch (e) {
      console.error('Failed to get replication appliances:', e);
      return [];
    }
  }

  /**
   * Get run-as accounts from VMware site
   * These are the credentials used for data mover and snapshots in VMwareCbt
   */
  async getVMwareSiteRunAsAccounts(vmwareSiteId: string): Promise<Array<{
    id: string;
    name: string;
    displayName: string;
    credentialType: string;  // 'VMwareFabric' | 'LinuxGuest' | 'WindowsGuest'
  }>> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return [];
    }

    // VMware site ID is already a full ARM path
    const endpoint = `${vmwareSiteId}/runasaccounts?api-version=2023-06-06`;
    
    try {
      const response = await this.makeRequest<{ value: Array<{
        id: string;
        name: string;
        properties: {
          displayName: string;
          credentialType: string;
        };
      }> }>('GET', endpoint);
      
      const accounts = (response?.value || []).map(a => ({
        id: a.id,
        name: a.name,
        displayName: a.properties.displayName,
        credentialType: a.properties.credentialType,
      }));
      
      console.log(`Found ${accounts.length} run-as accounts in VMware site:`, 
        accounts.map(a => ({ name: a.displayName, type: a.credentialType }))
      );
      
      return accounts;
    } catch (e) {
      console.error('Failed to get VMware site run-as accounts:', e);
      return [];
    }
  }

  /**
   * Get the cache storage account configured for Azure Migrate replication
   * This discovers the storage account from existing migration items or the solution configuration
   */
  async getCacheStorageAccount(vaultName: string, fabricName: string, containerName: string): Promise<{
    id: string;
    name: string;
    sasSecretName: string;
  } | null> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return null;
    }

    // First, try to get it from existing migration items
    const migrationItemsEndpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationFabrics/${fabricName}/replicationProtectionContainers/${containerName}/replicationMigrationItems?api-version=2023-06-01`;
    
    try {
      const response = await this.makeRequest<{ value: Array<{
        id: string;
        name: string;
        properties: {
          providerSpecificDetails?: {
            vmwareMachineId?: string;
            disksToInclude?: Array<{
              logStorageAccountId?: string;
              logStorageAccountSasSecretName?: string;
            }>;
          };
        };
      }> }>('GET', migrationItemsEndpoint);
      
      const items = response?.value || [];
      if (items.length > 0) {
        // Get the cache storage account from the first migration item
        const firstItem = items[0];
        const disks = firstItem.properties?.providerSpecificDetails?.disksToInclude;
        if (disks && disks.length > 0 && disks[0].logStorageAccountId) {
          const storageAccountId = disks[0].logStorageAccountId;
          const storageAccountName = storageAccountId.split('/').pop() || '';
          const sasSecretName = disks[0].logStorageAccountSasSecretName || `${storageAccountName}-cacheSas`;
          
          console.log(`Discovered cache storage account from existing migration item: ${storageAccountName}`);
          return {
            id: storageAccountId,
            name: storageAccountName,
            sasSecretName,
          };
        }
      }
    } catch (e) {
      console.log('No existing migration items found, trying solution configuration...');
    }

    // Try to get from Azure Migrate solution configuration
    const projectsEndpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Migrate/migrateProjects?api-version=2020-05-01`;
    
    try {
      const projectsResponse = await this.makeRequest<{ value: Array<{ id: string; name: string }> }>('GET', projectsEndpoint);
      const project = projectsResponse?.value?.[0];
      
      if (project) {
        // Get the Server Migration solution
        const solutionsEndpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Migrate/migrateProjects/${project.name}/solutions?api-version=2020-05-01`;
        const solutionsResponse = await this.makeRequest<{ value: Array<{
          id: string;
          name: string;
          properties?: {
            tool?: string;
            details?: {
              extendedDetails?: {
                cacheStorageAccountId?: string;
              };
            };
          };
        }> }>('GET', solutionsEndpoint);
        
        const migrationSolution = solutionsResponse?.value?.find(s => 
          s.name.includes('Servers-Migration') || 
          s.properties?.tool === 'ServerMigration'
        );
        
        if (migrationSolution?.properties?.details?.extendedDetails?.cacheStorageAccountId) {
          const storageAccountId = migrationSolution.properties.details.extendedDetails.cacheStorageAccountId;
          const storageAccountName = storageAccountId.split('/').pop() || '';
          console.log(`Discovered cache storage account from solution: ${storageAccountName}`);
          return {
            id: storageAccountId,
            name: storageAccountName,
            sasSecretName: `${storageAccountName}-cacheSas`,
          };
        }
      }
    } catch (e) {
      console.log('Failed to get solution configuration:', e);
    }

    // Fallback: Try to find a storage account with 'cache' or 'migrate' in the name
    const storageEndpoint = `/subscriptions/${config.subscriptionId}/providers/Microsoft.Storage/storageAccounts?api-version=2023-01-01`;
    
    try {
      const storageResponse = await this.makeRequest<{ value: Array<{ id: string; name: string; location: string }> }>('GET', storageEndpoint);
      const accounts = storageResponse?.value || [];
      
      // Look for a storage account that looks like a cache account
      const cacheAccount = accounts.find(a => 
        a.name.toLowerCase().includes('cache') ||
        a.name.toLowerCase().includes('migrate') ||
        a.name.toLowerCase().includes('asr')
      );
      
      if (cacheAccount) {
        console.log(`Found potential cache storage account by name: ${cacheAccount.name}`);
        return {
          id: cacheAccount.id,
          name: cacheAccount.name,
          sasSecretName: `${cacheAccount.name}-cacheSas`,
        };
      }
    } catch (e) {
      console.log('Failed to find cache storage account by name:', e);
    }

    console.log('Could not discover cache storage account. Please ensure Azure Migrate replication is set up.');
    return null;
  }

  /**
   * Get replication policies
   */
  async getReplicationPolicies(vaultName: string): Promise<Array<{
    id: string;
    name: string;
    properties: {
      friendlyName: string;
      providerSpecificDetails?: {
        instanceType: string;
      };
    };
  }>> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return [];
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationPolicies?api-version=2023-06-01`;
    
    try {
      const response = await this.makeRequest<{ value: Array<{
        id: string;
        name: string;
        properties: {
          friendlyName: string;
          providerSpecificDetails?: {
            instanceType: string;
          };
        };
      }> }>('GET', endpoint);
      return response?.value || [];
    } catch (e) {
      console.error('Failed to get replication policies:', e);
      return [];
    }
  }

  /**
   * Create a replication policy for InMageRcm (VMware to Azure)
   */
  async createReplicationPolicy(
    vaultName: string,
    policyName: string = 'DefaultInMageRcmPolicy'
  ): Promise<string | null> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationPolicies/${policyName}?api-version=2023-06-01`;

    const body = {
      properties: {
        providerSpecificInput: {
          instanceType: 'InMageRcm',
          recoveryPointHistoryInMinutes: 1440, // 24 hours
          crashConsistentFrequencyInMinutes: 5,
          appConsistentFrequencyInMinutes: 60,
          enableMultiVmSync: 'True',
        },
      },
    };

    try {
      const response = await this.makeRequest<{ id: string }>('PUT', endpoint, body);
      console.log('Created replication policy:', response?.id);
      return response?.id || null;
    } catch (e) {
      console.error('Failed to create replication policy:', e);
      throw e;
    }
  }

  /**
   * Create policy mapping (associate policy with protection container)
   */
  async createPolicyMapping(
    vaultName: string,
    fabricName: string,
    containerName: string,
    policyId: string,
    mappingName: string = 'DefaultPolicyMapping'
  ): Promise<boolean> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationFabrics/${fabricName}/replicationProtectionContainers/${containerName}/replicationProtectionContainerMappings/${mappingName}?api-version=2023-06-01`;

    // For InMageRcm, we need a target container which is the Azure fabric/container
    // We'll create a mapping that targets Azure
    const body = {
      properties: {
        policyId,
        targetProtectionContainerId: 'Microsoft Azure', // This is the standard target for InMageRcm
        providerSpecificInput: {
          instanceType: 'InMageRcm',
        },
      },
    };

    try {
      await this.makeRequest('PUT', endpoint, body);
      console.log('Created policy mapping');
      return true;
    } catch (e) {
      console.error('Failed to create policy mapping:', e);
      throw e;
    }
  }

  /**
   * Ensure replication policy exists and is mapped
   * Creates policy and mapping if they don't exist
   */
  async ensureReplicationPolicy(
    vaultName: string,
    fabricName: string,
    containerName: string
  ): Promise<string | null> {
    // Check for existing policies
    const policies = await this.getReplicationPolicies(vaultName);
    let inMageRcmPolicy = policies.find(p => 
      p.properties.providerSpecificDetails?.instanceType === 'InMageRcm'
    );

    // If no InMageRcm policy, try to create one
    if (!inMageRcmPolicy) {
      console.log('No InMageRcm policy found, attempting to create one...');
      try {
        const policyId = await this.createReplicationPolicy(vaultName);
        if (policyId) {
          // Refresh policies list
          const updatedPolicies = await this.getReplicationPolicies(vaultName);
          inMageRcmPolicy = updatedPolicies.find(p => p.id === policyId);
        }
      } catch (e) {
        console.error('Failed to create replication policy:', e);
        return null;
      }
    }

    if (!inMageRcmPolicy) {
      return null;
    }

    // Check if policy is mapped
    const mappings = await this.getPolicyMappings(vaultName, fabricName, containerName);
    const existingMapping = mappings.find(m => m.properties.policyId === inMageRcmPolicy!.id);

    if (!existingMapping) {
      console.log('Policy not mapped, attempting to create mapping...');
      try {
        await this.createPolicyMapping(vaultName, fabricName, containerName, inMageRcmPolicy.id);
      } catch (e) {
        console.error('Failed to create policy mapping:', e);
        // Still return the policy ID even if mapping fails
      }
    }

    return inMageRcmPolicy.id;
  }

  /**
   * Get replication jobs
   */
  async getJobs(vaultName: string): Promise<Array<{
    id: string;
    name: string;
    properties: {
      scenarioName: string;
      friendlyName: string;
      state: string;
      stateDescription: string;
      startTime: string;
      endTime?: string;
      targetObjectId?: string;
      targetObjectName?: string;
    };
  }>> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return [];
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationJobs?api-version=2023-06-01`;
    
    try {
      const response = await this.makeRequest<{ value: Array<{
        id: string;
        name: string;
        properties: {
          scenarioName: string;
          friendlyName: string;
          state: string;
          stateDescription: string;
          startTime: string;
          endTime?: string;
          targetObjectId?: string;
          targetObjectName?: string;
        };
      }> }>('GET', endpoint);
      return response?.value || [];
    } catch (e) {
      console.error('Failed to get replication jobs:', e);
      return [];
    }
  }

  /**
   * Get detailed migration item information from Azure
   * Returns comprehensive info like Azure Migrate shows
   */
  async getMigrationItemDetails(
    vaultName: string,
    fabricName: string,
    containerName: string,
    migrationItemName: string
  ): Promise<{
    migrationStatus: {
      replicationStatus: string;
      replicationStatusDescription: string;
      migrationState: string;
      replicationHealth: string;
      testMigrateState: string;
      testMigrateStateDescription: string;
      configurationIssues: Array<{ errorCode: string; errorMessage: string; possibleCauses?: string; recommendedAction?: string }>;
      lastSyncTime?: string;
      resyncRequired: boolean;
      resyncProgressPercentage?: number;
      initialReplicationProgressPercentage?: number;
      allowedOperations?: string[];
    };
    serverDetails: {
      site: string;
      vmId: string;
      operatingSystem: string;
      ipAddresses: string[];
      macAddresses: string[];
      firmwareType: string;
      diskCount: number;
      totalDiskSizeGB: number;
    };
    targetSettings: {
      targetResourceGroup: string;
      targetVmName: string;
      targetVmSize: string;
      targetNetwork: string;
      targetSubnet: string;
      targetAvailabilityZone: string;
      licenseType: string;
      bootDiagnosticsStorageAccount: string;
    };
    currentJob?: {
      jobId: string;
      jobName: string;
      state: string;
      startTime: string;
    };
    events: Array<{
      eventName: string;
      description: string;
      timeStamp: string;
      severity: string;
    }>;
    allowedOperations: string[];
    vmNics: Array<{
      nicId: string;
      isPrimaryNic: boolean;
      targetNicName?: string;
      targetSubnetName?: string;
      isSelectedForMigration: boolean;
    }>;
  } | null> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return null;
    }

    // Use 2025-08-01 API version for full test migration status
    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationFabrics/${fabricName}/replicationProtectionContainers/${containerName}/replicationMigrationItems/${migrationItemName}?api-version=2025-08-01`;

    try {
      const response = await this.makeRequest<{
        id: string;
        name: string;
        properties: {
          machineName: string;
          policyId: string;
          policyFriendlyName: string;
          migrationState: string;
          migrationStateDescription: string;
          testMigrateState: string;
          testMigrateStateDescription: string;
          health: string;
          healthErrors: Array<{
            errorCode: string;
            errorMessage: string;
            possibleCauses?: string;
            recommendedAction?: string;
          }>;
          currentJob?: {
            jobId: string;
            jobName: string;
            state: string;
            startTime: string;
          };
          allowedOperations: string[];
          providerSpecificDetails: {
            instanceType: string;
            vmwareMachineId: string;
            targetResourceGroupId: string;
            targetVmName: string;
            targetVmSize: string;
            targetNetworkId: string;
            targetSubnetName: string;
            targetAvailabilityZone?: string;
            licenseType: string;
            targetBootDiagnosticsStorageAccountId?: string;
            migrationRecoveryPointId?: string;
            lastRecoveryPointReceived?: string;
            lastRecoveryPointId?: string;
            initialSeedingProgressPercentage?: number;
            migrationProgressPercentage?: number;
            resyncProgressPercentage?: number;
            resyncRequired: string;
            resyncState: string;
            osType?: string;
            firmwareType?: string;
            protectedDisks?: Array<{
              diskId: string;
              diskName: string;
              isOsDisk: string;
              capacityInBytes: number;
            }>;
            vmNics?: Array<{
              nicId: string;
              isPrimaryNic: string;
              targetNicName?: string;
              targetSubnetName?: string;
              isSelectedForMigration?: string;
            }>;
          };
        };
      }>('GET', endpoint);

      if (!response) {
        return null;
      }

      const props = response.properties;
      const providerDetails = props.providerSpecificDetails;

      // Calculate total disk size
      let totalDiskSizeGB = 0;
      let diskCount = 0;
      if (providerDetails.protectedDisks) {
        diskCount = providerDetails.protectedDisks.length;
        totalDiskSizeGB = providerDetails.protectedDisks.reduce(
          (sum, disk) => sum + (disk.capacityInBytes || 0) / (1024 * 1024 * 1024), 0
        );
      }

      // Get events for this migration item
      const events = await this.getMigrationItemEvents(vaultName, response.id);

      return {
        migrationStatus: {
          replicationStatus: props.migrationState,
          replicationStatusDescription: props.migrationStateDescription,
          migrationState: props.migrationState,
          replicationHealth: props.health,
          testMigrateState: props.testMigrateState || 'None',
          testMigrateStateDescription: props.testMigrateStateDescription || 'Test migration not performed',
          configurationIssues: props.healthErrors || [],
          lastSyncTime: providerDetails.lastRecoveryPointReceived,
          resyncRequired: providerDetails.resyncRequired === 'true',
          resyncProgressPercentage: providerDetails.resyncProgressPercentage,
          initialReplicationProgressPercentage: providerDetails.initialSeedingProgressPercentage,
          allowedOperations: props.allowedOperations || [],
        },
        serverDetails: {
          site: providerDetails.vmwareMachineId?.split('/').slice(-3, -2)[0] || 'Unknown',
          vmId: providerDetails.vmwareMachineId?.split('/').pop() || 'Unknown',
          operatingSystem: providerDetails.osType || 'Unknown',
          ipAddresses: [],
          macAddresses: [],
          firmwareType: providerDetails.firmwareType || 'BIOS',
          diskCount,
          totalDiskSizeGB: Math.round(totalDiskSizeGB * 100) / 100,
        },
        targetSettings: {
          targetResourceGroup: providerDetails.targetResourceGroupId?.split('/').pop() || '',
          targetVmName: providerDetails.targetVmName,
          targetVmSize: providerDetails.targetVmSize,
          targetNetwork: providerDetails.targetNetworkId?.split('/').pop() || '',
          targetSubnet: providerDetails.targetSubnetName,
          targetAvailabilityZone: providerDetails.targetAvailabilityZone || 'None',
          licenseType: providerDetails.licenseType,
          bootDiagnosticsStorageAccount: providerDetails.targetBootDiagnosticsStorageAccountId?.split('/').pop() || '',
        },
        currentJob: props.currentJob ? {
          jobId: props.currentJob.jobId,
          jobName: props.currentJob.jobName,
          state: props.currentJob.state,
          startTime: props.currentJob.startTime,
        } : undefined,
        events,
        allowedOperations: props.allowedOperations || [],
        vmNics: providerDetails.vmNics?.map(nic => ({
          nicId: nic.nicId,
          isPrimaryNic: nic.isPrimaryNic === 'true',
          targetNicName: nic.targetNicName,
          targetSubnetName: nic.targetSubnetName,
          isSelectedForMigration: nic.isSelectedForMigration === 'true',
        })) || [],
      };
    } catch (e) {
      console.error('Failed to get migration item details:', e);
      return null;
    }
  }

  /**
   * Get events for a migration item
   */
  async getMigrationItemEvents(
    vaultName: string,
    migrationItemId: string
  ): Promise<Array<{
    eventName: string;
    description: string;
    timeStamp: string;
    severity: string;
  }>> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return [];
    }

    // Get events for the last 72 hours
    // Note: Azure OData filter requires datetime without quotes
    const timeFilter = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationEvents?api-version=2023-06-01&$filter=timeOfOccurrence ge ${timeFilter}`;

    try {
      const response = await this.makeRequest<{ value: Array<{
        id: string;
        name: string;
        properties: {
          eventType: string;
          affectedObjectFriendlyName: string;
          severity: string;
          timeOfOccurrence: string;
          description: string;
          eventSpecificDetails?: {
            instanceType: string;
          };
          healthErrors?: Array<{
            errorMessage: string;
          }>;
        };
      }> }>('GET', endpoint);

      const events = response?.value || [];
      
      // Filter events related to this migration item
      return events
        .filter(e => migrationItemId.includes(e.properties.affectedObjectFriendlyName) || 
                     e.properties.affectedObjectFriendlyName === migrationItemId.split('/').pop())
        .slice(0, 10) // Limit to 10 events
        .map(e => ({
          eventName: e.properties.eventType,
          description: e.properties.description || e.properties.healthErrors?.[0]?.errorMessage || 'No description',
          timeStamp: e.properties.timeOfOccurrence,
          severity: e.properties.severity,
        }));
    } catch (e) {
      console.error('Failed to get migration item events:', e);
      return [];
    }
  }

  /**
   * Restart a failed replication job
   */
  async restartJob(
    vaultName: string,
    jobId: string
  ): Promise<{ restarted: boolean; newJobId?: string }> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationJobs/${jobId}/restart?api-version=2023-06-01`;

    try {
      const response = await this.makeRequest<{ id?: string }>('POST', endpoint, {});
      console.log('Restarted job:', jobId);
      return {
        restarted: true,
        newJobId: response?.id || jobId,
      };
    } catch (e) {
      console.error('Failed to restart job:', e);
      throw e;
    }
  }

  /**
   * Resync replication for a migration item
   */
  async resyncMigrationItem(
    vaultName: string,
    fabricName: string,
    containerName: string,
    migrationItemName: string
  ): Promise<{ jobId?: string }> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationFabrics/${fabricName}/replicationProtectionContainers/${containerName}/replicationMigrationItems/${migrationItemName}/resync?api-version=2023-06-01`;

    try {
      const response = await this.makeRequest<{ id?: string }>('POST', endpoint, {
        properties: {
          skipCbtReset: 'false',
        },
      });
      console.log('Resync started for:', migrationItemName);
      return {
        jobId: response?.id,
      };
    } catch (e) {
      console.error('Failed to resync migration item:', e);
      throw e;
    }
  }

  /**
   * Disable migration (remove replication) for a migration item
   * This removes the replication from Azure
   */
  async disableMigration(
    vaultName: string,
    fabricName: string,
    containerName: string,
    migrationItemName: string
  ): Promise<{ success: boolean; jobId?: string }> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    // Use DELETE method to disable/remove migration
    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationFabrics/${fabricName}/replicationProtectionContainers/${containerName}/replicationMigrationItems/${migrationItemName}?api-version=2023-06-01`;

    try {
      console.log('[v13] Disabling migration for:', migrationItemName);
      const response = await this.makeRequest<{ id?: string } | null>('DELETE', endpoint);
      console.log('[v13] Migration disabled successfully for:', migrationItemName);
      return {
        success: true,
        jobId: response?.id,
      };
    } catch (e) {
      console.error('[v13] Failed to disable migration:', e);
      throw e;
    }
  }

  /**
   * Get recovery points for a migration item
   * Returns the list of available recovery points for test migration
   */
  async getRecoveryPoints(
    vaultName: string,
    fabricName: string,
    containerName: string,
    migrationItemName: string
  ): Promise<Array<{ id: string; name: string; recoveryPointTime?: string }>> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationFabrics/${fabricName}/replicationProtectionContainers/${containerName}/replicationMigrationItems/${migrationItemName}/migrationRecoveryPoints?api-version=2025-08-01`;

    try {
      console.log('[RecoveryPoints] Fetching recovery points for:', migrationItemName);
      const response = await this.makeRequest<{ value: Array<{ id: string; name: string; properties?: { recoveryPointTime?: string } }> }>('GET', endpoint);
      const points = response?.value || [];
      console.log('[RecoveryPoints] Found', points.length, 'recovery points');
      return points.map(p => ({
        id: p.id,
        name: p.name,
        recoveryPointTime: p.properties?.recoveryPointTime,
      }));
    } catch (e) {
      console.error('[RecoveryPoints] Failed to fetch recovery points:', e);
      return [];
    }
  }

  /**
   * Start test migration for a VMwareCbt migration item
   * This creates a test VM in Azure without affecting the source VM
   */
  async testMigrate(
    vaultName: string,
    fabricName: string,
    containerName: string,
    migrationItemName: string,
    testNetworkId: string,
    testSubnetName?: string,
    osUpgradeVersion?: string
  ): Promise<{ success: boolean; jobId?: string }> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    // First, get the latest recovery point
    console.log('[TestMigrate] Fetching recovery points...');
    const recoveryPoints = await this.getRecoveryPoints(vaultName, fabricName, containerName, migrationItemName);
    
    if (recoveryPoints.length === 0) {
      throw new Error('No recovery points available for test migration. Wait for initial replication to complete.');
    }

    // Use the most recent recovery point (first in the list, or sort by time)
    const latestRecoveryPoint = recoveryPoints[0];
    console.log('[TestMigrate] Using recovery point:', latestRecoveryPoint.name, 'from:', latestRecoveryPoint.recoveryPointTime);

    // Use the latest API version for VMwareCbt operations
    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationFabrics/${fabricName}/replicationProtectionContainers/${containerName}/replicationMigrationItems/${migrationItemName}/testMigrate?api-version=2025-08-01`;

    // For VMwareCbt test migration - include recoveryPointId
    const providerDetails: Record<string, unknown> = {
      instanceType: 'VMwareCbt',
      networkId: testNetworkId,
      recoveryPointId: latestRecoveryPoint.id,
    };

    // Add subnet configuration via vmNics if subnet is specified
    if (testSubnetName) {
      // Get the migration item to retrieve existing NIC configuration
      const migrationItem = await this.getMigrationItemDetails(vaultName, fabricName, containerName, migrationItemName);
      if (migrationItem?.vmNics && migrationItem.vmNics.length > 0) {
        // Build vmNics array with the test subnet for each NIC
        providerDetails.vmNics = migrationItem.vmNics.map((nic: { nicId: string; isPrimaryNic: boolean; targetNicName?: string }) => ({
          nicId: nic.nicId,
          isPrimaryNic: nic.isPrimaryNic ? 'true' : 'false',
          targetSubnetName: testSubnetName,
          isSelectedForMigration: 'true',
        }));
      }
    }

    // Add OS upgrade if specified (Windows Server upgrade)
    if (osUpgradeVersion) {
      providerDetails.osUpgradeVersion = osUpgradeVersion;
    }

    const body = {
      properties: {
        providerSpecificDetails: providerDetails,
      },
    };

    try {
      console.log('[TestMigrate] Starting test migration for:', migrationItemName);
      console.log('[TestMigrate] Using network:', testNetworkId);
      console.log('[TestMigrate] Using recovery point ID:', latestRecoveryPoint.id);
      console.log('[TestMigrate] Request body:', JSON.stringify(body, null, 2));
      const response = await this.makeRequest<{ id?: string; name?: string }>('POST', endpoint, body);
      console.log('[TestMigrate] Test migration started successfully:', response);
      return {
        success: true,
        jobId: response?.name || response?.id,
      };
    } catch (e) {
      console.error('[TestMigrate] Failed to start test migration:', e);
      throw e;
    }
  }

  /**
   * Clean up test migration resources for a VMwareCbt migration item
   * This deletes the test VM created during test migration
   */
  async testMigrateCleanup(
    vaultName: string,
    fabricName: string,
    containerName: string,
    migrationItemName: string,
    comments?: string
  ): Promise<{ success: boolean; jobId?: string }> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    // Use API version 2023-06-01 as per Azure Migrate
    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationFabrics/${fabricName}/replicationProtectionContainers/${containerName}/replicationMigrationItems/${migrationItemName}/testMigrateCleanup?api-version=2023-06-01`;

    const body = {
      properties: {
        comments: comments || '',
      },
    };

    try {
      console.log('[TestMigrateCleanup] Cleaning up test migration for:', migrationItemName);
      const response = await this.makeRequest<{ id?: string; name?: string }>('POST', endpoint, body);
      console.log('[TestMigrateCleanup] Cleanup started successfully:', response);
      return {
        success: true,
        jobId: response?.name || response?.id,
      };
    } catch (e) {
      console.error('[TestMigrateCleanup] Failed to cleanup test migration:', e);
      throw e;
    }
  }

  /**
   * Start actual migration for a VMwareCbt migration item
   * This migrates the VM to Azure (optionally shutting down the source)
   */
  async migrate(
    vaultName: string,
    fabricName: string,
    containerName: string,
    migrationItemName: string,
    performShutdown: boolean = true,
    osUpgradeVersion?: string
  ): Promise<{ success: boolean; jobId?: string }> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationFabrics/${fabricName}/replicationProtectionContainers/${containerName}/replicationMigrationItems/${migrationItemName}/migrate?api-version=2025-08-01`;

    const body: Record<string, unknown> = {
      properties: {
        providerSpecificDetails: {
          instanceType: 'VMwareCbt',
          performShutdown: performShutdown ? 'true' : 'false',
        },
      },
    };

    // Add OS upgrade if specified (Windows Server upgrade)
    if (osUpgradeVersion) {
      (body.properties as Record<string, unknown>).providerSpecificDetails = {
        ...(body.properties as Record<string, unknown>).providerSpecificDetails as object,
        osUpgradeVersion,
      };
    }

    try {
      console.log('[Migrate] Starting migration for:', migrationItemName);
      console.log('[Migrate] Perform shutdown:', performShutdown);
      const response = await this.makeRequest<{ id?: string; name?: string }>('POST', endpoint, body);
      console.log('[Migrate] Migration started successfully:', response);
      return {
        success: true,
        jobId: response?.name || response?.id,
      };
    } catch (e) {
      console.error('[Migrate] Failed to start migration:', e);
      throw e;
    }
  }

  /**
   * Complete migration after successful migrate operation
   * This removes the replication and completes the migration
   */
  async completeMigration(
    vaultName: string,
    fabricName: string,
    containerName: string,
    migrationItemName: string
  ): Promise<{ success: boolean; jobId?: string }> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    // Complete migration by deleting the migration item (this finalizes the migration)
    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.RecoveryServices/vaults/${vaultName}/replicationFabrics/${fabricName}/replicationProtectionContainers/${containerName}/replicationMigrationItems/${migrationItemName}?api-version=2023-06-01`;

    try {
      console.log('[CompleteMigration] Completing migration for:', migrationItemName);
      const response = await this.makeRequest<{ id?: string } | null>('DELETE', endpoint);
      console.log('[CompleteMigration] Migration completed successfully');
      return {
        success: true,
        jobId: response?.id,
      };
    } catch (e) {
      console.error('[CompleteMigration] Failed to complete migration:', e);
      throw e;
    }
  }
}

export const azureSiteRecoveryService = new AzureSiteRecoveryService();

