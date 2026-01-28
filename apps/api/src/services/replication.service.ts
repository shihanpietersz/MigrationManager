import { prisma } from '../lib/db.js';
import { groupService } from './group.service.js';
import { activityService } from './activity.service.js';
import { azureSiteRecoveryService, type ReplicationProtectedItem } from './azure-site-recovery.service.js';
import { azureConfigService } from './azure-config.service.js';

export interface EnableReplicationInput {
  groupId: string;
  targetConfig: {
    targetRegion: string; // Target Azure region (e.g., 'australiasoutheast')
    targetResourceGroup: string;
    targetVnetId: string;
    targetSubnetName: string;
    targetVmSize: string;
    targetStorageAccountId: string;
    availabilityZone?: string;
    availabilitySetId?: string;
    licenseType?: string;
    tags?: Record<string, string>;
  };
  // Per-machine disk configurations
  machineDisks?: Array<{
    machineId: string;
    disks: Array<{
      diskId: string;
      isOSDisk: boolean;
      diskType: string;
      targetDiskSizeGB: number;
    }>;
  }>;
}

// Cache for ASR infrastructure
let asrInfrastructureCache: {
  vaultName: string;
  fabricName: string;
  containerName: string;
  policyId: string;
  // VMwareCbt specific - run-as account IDs from VMware site
  dataMoverRunAsAccountId?: string;  // vCenter credentials
  snapshotRunAsAccountId?: string;   // Guest credentials (OS-specific)
  vmwareSiteId?: string;
  // Cache storage account for replication (auto-discovered from Azure Migrate)
  cacheStorageAccountId?: string;
  cacheStorageAccountSasSecretName?: string;
  // Target region where VMs will be replicated to (determined by vault location)
  targetRegion?: string;
} | null = null;

export const replicationService = {
  /**
   * Get all replication items from both local DB and Azure Site Recovery
   */
  async getAll() {
    // Get local items
    const localItems = await prisma.replicationItem.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Try to sync with Azure Site Recovery and get detailed status
    try {
      const vault = await azureSiteRecoveryService.getMigrateVault();
      if (!vault) {
        // Return local items with empty Azure status
        return localItems.map(item => ({
          ...item,
          azureStatus: null,
        }));
      }

      // Discover infrastructure to get fabric and container names
      const infrastructure = await this.discoverASRInfrastructure();
      
      // Get migration items with detailed status
      const azureItems = await azureSiteRecoveryService.getMigrationItemsWithStatus(vault.name);
      
      // Track which Azure items have been matched
      const matchedAzureItemIds = new Set<string>();
      
      // Map local items and enrich with Azure status
      const enrichedItems = localItems.map(localItem => {
        // Find matching Azure item by machine name
        const azureItem = azureItems.find(a => 
          a.machineName === localItem.machineName
        );
        
        if (azureItem) {
          matchedAzureItemIds.add(azureItem.id);
          
          // Update local DB with latest status (fire-and-forget)
          prisma.replicationItem.update({
            where: { id: localItem.id },
            data: {
              status: this.mapMigrationState(azureItem.migrationState),
              healthStatus: azureItem.health || 'None',
              replicationProgress: azureItem.initialSeedingProgress || azureItem.deltaSyncProgress || 0,
              lastSyncTime: azureItem.lastRecoveryPointReceived 
                ? new Date(azureItem.lastRecoveryPointReceived) 
                : null,
              azureProtectedItemId: azureItem.id,
              vaultName: vault.name,
              fabricName: infrastructure?.fabricName || localItem.fabricName,
              containerName: infrastructure?.containerName || localItem.containerName,
            },
          }).catch(err => console.log('Could not update local item:', err));
          
          return {
            ...localItem,
            status: this.mapMigrationState(azureItem.migrationState),
            healthStatus: azureItem.health || 'None',
            replicationProgress: azureItem.initialSeedingProgress || azureItem.deltaSyncProgress || 0,
            lastSyncTime: azureItem.lastRecoveryPointReceived 
              ? new Date(azureItem.lastRecoveryPointReceived) 
              : localItem.lastSyncTime,
            vaultName: vault.name,
            fabricName: infrastructure?.fabricName || localItem.fabricName,
            containerName: infrastructure?.containerName || localItem.containerName,
            azureProtectedItemId: azureItem.id,
            azureStatus: {
              migrationState: azureItem.migrationState,
              migrationStateDescription: azureItem.migrationStateDescription,
              replicationStatus: azureItem.replicationStatus,
              initialSeedingProgress: azureItem.initialSeedingProgress,
              deltaSyncProgress: azureItem.deltaSyncProgress,
              resyncRequired: azureItem.resyncRequired,
              resyncProgress: azureItem.resyncProgress,
              lastRecoveryPointTime: azureItem.lastRecoveryPointReceived,
              allowedOperations: azureItem.allowedOperations,
              testMigrateState: azureItem.testMigrateState,
              testMigrateStateDescription: azureItem.testMigrateStateDescription,
              osType: azureItem.osType,
              firmwareType: azureItem.firmwareType,
              health: azureItem.health,
              healthErrors: azureItem.healthErrors,
            },
          };
        }
        
        return {
          ...localItem,
          azureStatus: null,
        };
      });
      
      // Find Azure items that aren't in local DB (created from Azure portal)
      const unmatchedAzureItems = azureItems.filter(a => !matchedAzureItemIds.has(a.id));
      
      // Create local records for Azure items
      for (const azureItem of unmatchedAzureItems) {
        console.log('[v13] Found Azure replication item not in local DB:', azureItem.machineName);
        
        try {
          // Create a local record for this Azure item
          const newItem = await prisma.replicationItem.create({
            data: {
              machineId: azureItem.name, // Use Azure item name as machine ID
              machineName: azureItem.machineName,
              sourceServerId: '', // Unknown - created from Azure
              status: this.mapMigrationState(azureItem.migrationState),
              healthStatus: azureItem.health || 'None',
              healthErrors: JSON.stringify(azureItem.healthErrors || []),
              replicationProgress: azureItem.initialSeedingProgress || azureItem.deltaSyncProgress || 0,
              lastSyncTime: azureItem.lastRecoveryPointReceived 
                ? new Date(azureItem.lastRecoveryPointReceived) 
                : null,
              targetResourceGroup: azureItem.targetResourceGroup || '',
              targetVnetId: '',
              targetSubnetName: '',
              targetVmSize: azureItem.targetVmSize || '',
              targetStorageAccountId: '',
              licenseType: 'NoLicenseType',
              azureProtectedItemId: azureItem.id,
              vaultName: vault.name,
              fabricName: infrastructure?.fabricName || '',
              containerName: infrastructure?.containerName || '',
            },
          });
          
          enrichedItems.push({
            ...newItem,
            azureStatus: {
              migrationState: azureItem.migrationState,
              migrationStateDescription: azureItem.migrationStateDescription,
              replicationStatus: azureItem.replicationStatus,
              initialSeedingProgress: azureItem.initialSeedingProgress,
              deltaSyncProgress: azureItem.deltaSyncProgress,
              resyncRequired: azureItem.resyncRequired,
              resyncProgress: azureItem.resyncProgress,
              lastRecoveryPointTime: azureItem.lastRecoveryPointReceived,
              allowedOperations: azureItem.allowedOperations,
              testMigrateState: azureItem.testMigrateState,
              testMigrateStateDescription: azureItem.testMigrateStateDescription,
              osType: azureItem.osType,
              firmwareType: azureItem.firmwareType,
              health: azureItem.health,
              healthErrors: azureItem.healthErrors,
            },
          });
          console.log('[v13] Created local record for Azure item:', azureItem.machineName);
        } catch (err) {
          console.log('[v13] Could not create local record for Azure item:', azureItem.machineName, err);
        }
      }
      
      return enrichedItems;
    } catch (e) {
      console.log('Could not sync with Azure Site Recovery, returning local items:', e);
      return localItems.map(item => ({
        ...item,
        azureStatus: null,
      }));
    }
  },

  /**
   * Map Azure Site Recovery protection state to our status
   */
  mapAzureStatus(azureState: string | undefined): string {
    if (!azureState) return 'Enabling';
    
    const statusMap: Record<string, string> = {
      'UnprotectedStatesBegin': 'Enabling',
      'EnableProtectionInProgress': 'Enabling',
      'EnableProtectionFailed': 'Failed',
      'InitialReplicationInProgress': 'InitialReplication',
      'InitialReplicationCompletedOnPrimary': 'InitialReplication',
      'InitialReplicationCompletedOnRecovery': 'Protected',
      'Protected': 'Protected',
      'ProtectedStatesEnd': 'Protected',
      'PlannedFailoverInProgress': 'PlannedFailoverInProgress',
      'PlannedFailoverCompleted': 'FailedOver',
      'UnplannedFailoverInProgress': 'PlannedFailoverInProgress',
      'UnplannedFailoverCompleted': 'FailedOver',
      'TestFailoverInProgress': 'Protected',
      'TestFailoverCompleted': 'Protected',
      'DisableProtectionInProgress': 'Cancelled',
      'DisableProtectionCompleted': 'Cancelled',
      'Invalid': 'Failed',
    };
    return statusMap[azureState] || azureState;
  },

  /**
   * Map Azure Migrate migration state to our status
   */
  mapMigrationState(migrationState: string | undefined): string {
    if (!migrationState) return 'Enabling';
    
    const statusMap: Record<string, string> = {
      'None': 'Enabling',
      'EnableMigrationInProgress': 'Enabling',
      'EnableMigrationFailed': 'Failed',
      'Replicating': 'Replicating',
      'InitialSeedingInProgress': 'InitialReplication',
      'InitialSeedingFailed': 'Failed',
      'MigrationInProgress': 'PlannedFailoverInProgress',
      'MigrationSucceeded': 'FailedOver',
      'MigrationFailed': 'Failed',
      'DisableMigrationInProgress': 'Cancelled',
      'DisableMigrationFailed': 'Failed',
    };
    return statusMap[migrationState] || migrationState;
  },

  /**
   * Get replication item by ID
   */
  async getById(id: string) {
    const item = await prisma.replicationItem.findUnique({
      where: { id },
    });

    // If item has Azure ID, try to get fresh status from ASR
    if (item?.azureProtectedItemId && item.vaultName && item.fabricName && item.containerName) {
      try {
        const protectedItemName = item.azureProtectedItemId.split('/').pop()!;
        const azureStatus = await azureSiteRecoveryService.getReplicatedItemStatus(
          item.vaultName,
          item.fabricName,
          item.containerName,
          protectedItemName
        );
        
        if (azureStatus) {
          return prisma.replicationItem.update({
            where: { id },
            data: {
              status: this.mapAzureStatus(azureStatus.properties.protectionState),
              healthStatus: azureStatus.properties.replicationHealth || 'None',
              replicationProgress: azureStatus.properties.providerSpecificDetails?.resyncProgressPercentage || 0,
              lastSyncTime: azureStatus.properties.providerSpecificDetails?.lastRpoCalculatedTime 
                ? new Date(azureStatus.properties.providerSpecificDetails.lastRpoCalculatedTime) 
                : null,
            },
          });
        }
      } catch (e) {
        console.log('Could not sync item with Azure Site Recovery:', e);
      }
    }

    return item;
  },

  /**
   * Clear the infrastructure cache to force re-discovery
   * This should be called when credentials may have changed
   */
  clearInfrastructureCache() {
    asrInfrastructureCache = null;
    console.log('ASR infrastructure cache cleared - will re-discover on next operation');
  },

  /**
   * Discover and cache ASR infrastructure
   */
  async discoverASRInfrastructure(): Promise<typeof asrInfrastructureCache> {
    if (asrInfrastructureCache) {
      return asrInfrastructureCache;
    }

    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return null;
    }

    // Find the Recovery Services vault
    const vault = await azureSiteRecoveryService.getMigrateVault();
    if (!vault) {
      console.log('No Recovery Services vault found');
      return null;
    }

    // Find the replication fabric (VMware site)
    const fabrics = await azureSiteRecoveryService.getFabrics(vault.name);
    const vmwareFabric = fabrics.find(f => 
      f.properties.customDetails?.instanceType === 'InMageRcm' ||
      f.properties.customDetails?.vmwareSiteId ||
      f.name.toLowerCase().includes('vmware')
    ) || fabrics[0];

    if (!vmwareFabric) {
      console.log('No replication fabric found');
      return null;
    }

    // Find the protection container
    const containers = await azureSiteRecoveryService.getProtectionContainers(vault.name, vmwareFabric.name);
    const container = containers[0];

    if (!container) {
      console.log('No protection container found');
      return null;
    }

    // Find the policy mapping to get policy ID - use vault-level endpoint like Azure Migrate
    const allMappings = await azureSiteRecoveryService.getAllProtectionContainerMappings(vault.name);
    console.log('Found vault-level policy mappings:', allMappings.length);
    
    // Find a mapping that has a policy configured
    const validMapping = allMappings.find(m => m.properties.policyId);
    let policyId = validMapping?.properties.policyId || '';

    // Also try container-level if vault-level didn't work
    if (!policyId) {
      const containerMappings = await azureSiteRecoveryService.getPolicyMappings(vault.name, vmwareFabric.name, container.name);
      policyId = containerMappings[0]?.properties.policyId || '';
    }

    // If still no policy, try to ensure one is created
    if (!policyId) {
      console.log('No policy mapping found, attempting to ensure policy exists...');
      try {
        policyId = await azureSiteRecoveryService.ensureReplicationPolicy(
          vault.name,
          vmwareFabric.name,
          container.name
        ) || '';
      } catch (e) {
        console.error('Failed to ensure replication policy:', e);
      }
    }

    // Get VMware site ID from fabric for fetching run-as accounts
    const vmwareSiteId = (vmwareFabric.properties.customDetails as any)?.vmwareSiteId || '';
    
    // Fetch run-as accounts from VMware site for VMwareCbt
    let dataMoverRunAsAccountId = '';
    let snapshotRunAsAccountId = '';
    
    if (vmwareSiteId) {
      const runAsAccounts = await azureSiteRecoveryService.getVMwareSiteRunAsAccounts(vmwareSiteId);
      
      // Find vCenter credentials (VMwareFabric type) for data mover
      // Azure Portal uses the FIRST vCenter account for VMwareCbt agentless replication
      const vCenterAccounts = runAsAccounts.filter(a => a.credentialType === 'VMwareFabric');
      if (vCenterAccounts.length > 0) {
        // Use the FIRST VMwareFabric account (matches Azure portal behavior)
        const vCenterAccount = vCenterAccounts[0];
        dataMoverRunAsAccountId = vCenterAccount.id;
        console.log(`[v12] Found ${vCenterAccounts.length} vCenter run-as account(s). Using FIRST: ${vCenterAccount.displayName} (${vCenterAccount.id})`);
        if (vCenterAccounts.length > 1) {
          console.log('[v12] Available vCenter accounts:', vCenterAccounts.map(a => `${a.displayName} (${a.id})`).join(', '));
        }
      }
      
      // CRITICAL: For VMwareCbt agentless replication, BOTH dataMover and snapshot 
      // must use the same vCenter account. This is how Azure Portal does it.
      // Do NOT use guest credentials here.
      snapshotRunAsAccountId = dataMoverRunAsAccountId;
      console.log(`[v12] Using same vCenter account for both dataMover and snapshot (VMwareCbt requirement)`);
    }

    // Discover cache storage account from Azure Migrate configuration
    const cacheStorageAccount = await azureSiteRecoveryService.getCacheStorageAccount(
      vault.name,
      vmwareFabric.name,
      container.name
    );
    
    let cacheStorageAccountId = '';
    let cacheStorageAccountSasSecretName = '';
    
    if (cacheStorageAccount) {
      cacheStorageAccountId = cacheStorageAccount.id;
      cacheStorageAccountSasSecretName = cacheStorageAccount.sasSecretName;
      console.log('Discovered cache storage account:', cacheStorageAccount.name);
    } else {
      console.log('Warning: No cache storage account found. Please ensure Azure Migrate is set up with replication.');
    }

    // Discover the actual target region from Azure Migrate configuration
    // The target region may be different from the vault location!
    let targetRegion = await azureSiteRecoveryService.discoverTargetRegion(vault.name);
    
    if (!targetRegion) {
      // Fallback to vault location if we can't discover from existing config
      targetRegion = vault.location;
      console.log(`Could not discover target region from Azure Migrate, falling back to vault location: ${targetRegion}`);
    } else {
      console.log(`Target region discovered from Azure Migrate configuration: ${targetRegion}`);
    }
    
    // Log important note about target region
    console.log(`IMPORTANT: All target resources (VNet, storage, resource group) MUST be in region: ${targetRegion}`);

    asrInfrastructureCache = {
      vaultName: vault.name,
      fabricName: vmwareFabric.name,
      containerName: container.name,
      policyId,
      dataMoverRunAsAccountId,
      snapshotRunAsAccountId,
      vmwareSiteId,
      cacheStorageAccountId,
      cacheStorageAccountSasSecretName,
      targetRegion,
    };

    console.log('Discovered ASR infrastructure:', {
      ...asrInfrastructureCache,
      dataMoverRunAsAccountId: dataMoverRunAsAccountId ? '(found)' : '(missing)',
      snapshotRunAsAccountId: snapshotRunAsAccountId ? '(found)' : '(missing)',
    });
    
    if (!dataMoverRunAsAccountId) {
      console.error('ERROR: No vCenter run-as account (VMwareFabric type) found in VMware site.');
      console.error('Please ensure credentials are configured in Azure Migrate appliance at https://appliance-ip:44368');
    }
    if (!snapshotRunAsAccountId) {
      console.error('ERROR: No snapshot run-as account found. Using vCenter account as fallback.');
    }
    
    return asrInfrastructureCache;
  },

  /**
   * Enable replication for a group
   * This actually enables replication through Azure Site Recovery API
   */
  async enableForGroup(input: EnableReplicationInput) {
    const { groupId, targetConfig, machineDisks } = input;

    // Clear the infrastructure cache to ensure we get fresh credentials
    // This prevents issues with stale run-as account IDs (Error 185000)
    this.clearInfrastructureCache();

    // Get the group and its machines
    const group = await groupService.getById(groupId);
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }

    // Get machines in the group
    const machines = await groupService.getGroupMachines(groupId);
    if (machines.length === 0) {
      throw new Error('Group has no machines to replicate');
    }

    // Get Azure config
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure is not configured. Please configure Azure settings first.');
    }
    
    // Discover ASR infrastructure
    const asrInfra = await this.discoverASRInfrastructure();
    if (!asrInfra) {
      throw new Error(
        'Could not discover Azure Site Recovery infrastructure. ' +
        'Please ensure Azure Migrate appliance is registered and the replication policy is configured.'
      );
    }

    // Check if replication policy is configured
    if (!asrInfra.policyId) {
      throw new Error(
        'Replication policy not found. Azure Migrate replication appliance may not be fully configured. ' +
        'Please ensure you have: 1) Deployed the Azure Migrate replication appliance, ' +
        '2) Registered it with the Azure Migrate project, ' +
        '3) Configured the appliance with vCenter credentials. ' +
        'Once configured, a replication policy will be automatically created.'
      );
    }

    // Enable replication for each machine
    const replicationItems = [];
    const errors: string[] = [];
    
    for (const machine of machines) {
      const machineName = machine.displayName || 'Unknown';
      
      // Check if a replication item already exists for this machine
      const existing = await prisma.replicationItem.findFirst({
        where: {
          machineId: machine.id,
          status: { notIn: ['Cancelled', 'Failed'] },
        },
      });

      if (existing) {
        console.log(`Replication item already exists for machine ${machineName}`);
        replicationItems.push(existing);
        continue;
      }

      // The machine ID from Azure Migrate (azureMigrateId)
      const azureMachineId = machine.azureMigrateId;
      if (!azureMachineId) {
        errors.push(`Machine ${machineName} is not discovered in Azure Migrate. Only Azure Migrate discovered machines can be replicated.`);
        continue;
      }
      
      try {
        // Enable replication through ASR API
        console.log(`Enabling replication for ${machineName} (${azureMachineId})`);
        
        // Determine the cache storage account - must be in the same region as target
        let storageAccountId = targetConfig.targetStorageAccountId;
        
        // If user didn't provide a storage account, try to find one in the target region
        if (!storageAccountId) {
          // First check if the cached storage account is in the right region
          if (asrInfra.cacheStorageAccountId) {
            // Verify the region of the cached storage account
            const cachedStorageRegion = await this.getStorageAccountRegion(asrInfra.cacheStorageAccountId);
            const targetRegion = targetConfig.targetRegion?.toLowerCase().replace(/\s/g, '') || '';
            
            if (cachedStorageRegion && cachedStorageRegion.toLowerCase() === targetRegion) {
              storageAccountId = asrInfra.cacheStorageAccountId;
              console.log(`Using cached storage account in ${cachedStorageRegion}`);
            } else {
              console.log(`Cached storage account is in ${cachedStorageRegion}, but target is ${targetRegion}. Looking for another...`);
            }
          }
          
          // If still no storage account, find one in the target region
          if (!storageAccountId && targetConfig.targetRegion) {
            storageAccountId = await this.findStorageAccountInRegion(targetConfig.targetRegion);
          }
        }
        
        if (!storageAccountId) {
          throw new Error(
            `No cache storage account found in the target region (${targetConfig.targetRegion || 'unknown'}). ` +
            'Please select a storage account in the same region as your target, or create one in the Azure Portal.'
          );
        }
        
        // Find disk configurations for this machine
        const machineDiskConfig = machineDisks?.find(md => md.machineId === machine.id);
        
        // Build disk array for ASR API
        const disks = machineDiskConfig?.disks.map(d => ({
          diskId: d.diskId,
          isOSDisk: d.isOSDisk,
          diskType: d.diskType,
          targetDiskSizeGB: d.targetDiskSizeGB,
        }));

        // Enable replication with all required VMwareCbt parameters
        const azureResult = await azureSiteRecoveryService.enableReplication(
          asrInfra.vaultName,
          asrInfra.fabricName,
          asrInfra.containerName,
          asrInfra.policyId,
          {
            machineName: machineName,
            machineId: azureMachineId,
            targetResourceGroup: targetConfig.targetResourceGroup,
            targetNetworkId: targetConfig.targetVnetId,
            targetSubnetName: targetConfig.targetSubnetName,
            targetVmSize: targetConfig.targetVmSize,
            targetStorageAccountId: storageAccountId,
            targetAvailabilityZone: targetConfig.availabilityZone,
            targetAvailabilitySetId: targetConfig.availabilitySetId,
            dataMoverRunAsAccountId: asrInfra.dataMoverRunAsAccountId,
            snapshotRunAsAccountId: asrInfra.snapshotRunAsAccountId,
            licenseType: targetConfig.licenseType,
            disks: disks,
          }
        );

        // Create local tracking record
        const localItem = await prisma.replicationItem.create({
          data: {
            machineId: machine.id,
            machineName: machineName,
            sourceServerId: azureMachineId,
            status: 'Enabling',
            healthStatus: 'None',
            replicationProgress: 0,
            targetResourceGroup: targetConfig.targetResourceGroup,
            targetVnetId: targetConfig.targetVnetId,
            targetSubnetName: targetConfig.targetSubnetName,
            targetVmSize: targetConfig.targetVmSize,
            targetStorageAccountId: storageAccountId, // Use the resolved storage account
            availabilityZone: targetConfig.availabilityZone,
            availabilitySetId: targetConfig.availabilitySetId,
            licenseType: targetConfig.licenseType || 'NoLicenseType',
            tags: targetConfig.tags ? JSON.stringify(targetConfig.tags) : null,
            // ASR references for status tracking
            vaultName: asrInfra.vaultName,
            fabricName: asrInfra.fabricName,
            containerName: asrInfra.containerName,
            azureProtectedItemId: azureResult?.id || null,
          },
        });

        replicationItems.push(localItem);
        console.log(`Replication enabled for ${machineName}`);
        
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        console.error(`Failed to enable replication for ${machineName}:`, errorMessage);
        errors.push(`${machineName}: ${errorMessage}`);
        
        // Create a failed tracking record
        const failedItem = await prisma.replicationItem.create({
          data: {
            machineId: machine.id,
            machineName: machineName,
            sourceServerId: azureMachineId,
            status: 'AzureEnableFailed',
            healthStatus: 'Critical',
            replicationProgress: 0,
            targetResourceGroup: targetConfig.targetResourceGroup,
            targetVnetId: targetConfig.targetVnetId,
            targetSubnetName: targetConfig.targetSubnetName,
            targetVmSize: targetConfig.targetVmSize,
            targetStorageAccountId: targetConfig.targetStorageAccountId,
            healthErrors: JSON.stringify([errorMessage]),
          },
        });
        replicationItems.push(failedItem);
      }
    }

    // Update group status
    const hasSuccess = replicationItems.some(item => item.status === 'Enabling');
    await groupService.update(groupId, { 
      status: hasSuccess ? 'replicating' : 'assessed' 
    });

    // Log activity
    const successCount = replicationItems.filter(i => i.status === 'Enabling').length;
    const failedCount = errors.length;
    
    await activityService.log({
      type: 'replication',
      action: 'enabled',
      title: `Enabled replication for group "${group.name}"`,
      description: `${successCount} machines started replicating${failedCount > 0 ? `, ${failedCount} failed` : ''}.`,
      status: failedCount > 0 ? (successCount > 0 ? 'warning' : 'error') : 'success',
      entityType: 'group',
      entityId: groupId,
      metadata: { 
        machineCount: machines.length,
        successCount,
        failedCount,
        errors: errors.length > 0 ? errors : undefined,
      },
    });

    // Start polling for Azure status updates
    this.startStatusPolling();

    return {
      items: replicationItems,
      message: errors.length > 0
        ? `Replication started for ${successCount} machine(s). ${failedCount} failed: ${errors.join('; ')}`
        : `Replication started for ${successCount} machine(s).`,
      errors: errors.length > 0 ? errors : undefined,
    };
  },

  /**
   * Start polling for Azure Site Recovery replication status updates
   */
  startStatusPolling() {
    // Poll every 30 seconds for status updates
    const pollInterval = setInterval(async () => {
      try {
        const items = await prisma.replicationItem.findMany({
          where: {
            vaultName: { not: null },
            status: { notIn: ['Protected', 'Failed', 'FailedOver', 'Cancelled', 'AzureEnableFailed', 'LocalOnly'] },
          },
        });

        if (items.length === 0) {
          clearInterval(pollInterval);
          return;
        }

        // Group items by vault for efficient querying
        const vaultNames = [...new Set(items.filter(i => i.vaultName).map(i => i.vaultName!))];
        
        for (const vaultName of vaultNames) {
          try {
            const azureItems = await azureSiteRecoveryService.getReplicatedItems(vaultName);
            const vaultItems = items.filter(i => i.vaultName === vaultName);
            
            for (const item of vaultItems) {
              const azureItem = azureItems.find(a => 
                a.id === item.azureProtectedItemId ||
                a.properties.friendlyName === item.machineName
              );
              
              if (azureItem) {
                const newStatus = this.mapAzureStatus(azureItem.properties.protectionState);
                const progress = azureItem.properties.providerSpecificDetails?.resyncProgressPercentage || 0;
                const previousStatus = item.status;
                
                await prisma.replicationItem.update({
                  where: { id: item.id },
                  data: {
                    status: newStatus,
                    healthStatus: azureItem.properties.replicationHealth || 'None',
                    replicationProgress: progress,
                    lastSyncTime: azureItem.properties.providerSpecificDetails?.lastRpoCalculatedTime 
                      ? new Date(azureItem.properties.providerSpecificDetails.lastRpoCalculatedTime) 
                      : null,
                    azureProtectedItemId: azureItem.id,
                  },
                });

                if (newStatus === 'Protected' && previousStatus !== 'Protected') {
                  await activityService.log({
                    type: 'replication',
                    action: 'protected',
                    title: `${item.machineName} is now protected`,
                    description: 'Initial replication completed. Machine is now being continuously replicated.',
                    status: 'success',
                    entityType: 'replication',
                    entityId: item.id,
                  });
                }
              }
            }
          } catch (e) {
            console.error(`Error polling ASR status for vault ${vaultName}:`, e);
          }
        }
      } catch (e) {
        console.error('Error polling Azure Site Recovery replication status:', e);
      }
    }, 30000);

    // Stop polling after 4 hours
    setTimeout(() => clearInterval(pollInterval), 4 * 60 * 60 * 1000);
  },

  /**
   * Update replication item
   */
  async update(id: string, data: Partial<{
    status: string;
    healthStatus: string;
    replicationProgress: number;
    lastSyncTime: Date;
    testFailoverStatus: string;
    lastTestFailoverTime: Date;
    healthErrors: string[];
    targetResourceGroup: string;
    targetVnetId: string;
    targetSubnetName: string;
    targetVmSize: string;
    targetStorageAccountId: string;
  }>) {
    const updateData: Record<string, unknown> = { ...data };
    
    if (data.healthErrors) {
      updateData.healthErrors = JSON.stringify(data.healthErrors);
    }
    
    return prisma.replicationItem.update({
      where: { id },
      data: updateData,
    });
  },

  /**
   * Cancel replication
   */
  async cancel(id: string) {
    const item = await this.getById(id);
    if (!item) {
      throw new Error(`Replication item ${id} not found`);
    }

    // If has ASR replication, disable it
    if (item.vaultName && item.fabricName && item.containerName && item.azureProtectedItemId) {
      try {
        const protectedItemName = item.azureProtectedItemId.split('/').pop()!;
        await azureSiteRecoveryService.disableReplication(
          item.vaultName,
          item.fabricName,
          item.containerName,
          protectedItemName
        );
      } catch (e) {
        console.error('Failed to disable Azure Site Recovery replication:', e);
      }
    }

    await this.update(id, { status: 'Cancelled' });

    await activityService.log({
      type: 'replication',
      action: 'cancelled',
      title: `Cancelled replication for ${item.machineName}`,
      status: 'warning',
      entityType: 'replication',
      entityId: id,
    });

    return { cancelled: true };
  },

  /**
   * Test Migrate - Creates a test VM in Azure to validate migration
   * Uses VMwareCbt testMigrate API for Azure Migrate Server Migration
   */
  async testMigrate(id: string, testNetworkId?: string, testSubnetName?: string) {
    const item = await this.getById(id);
    if (!item) {
      throw new Error(`Replication item ${id} not found`);
    }

    // Check if test migrate is allowed based on current state
    const validStates = ['Replicating', 'Protected', 'InitialSeedingInProgress'];
    if (!validStates.includes(item.status)) {
      throw new Error(`Machine must be in a replicating state to perform test migration. Current status: ${item.status}`);
    }

    // If has VMwareCbt replication, trigger test migrate
    if (item.vaultName && item.fabricName && item.containerName && item.azureProtectedItemId) {
      try {
        const migrationItemName = item.azureProtectedItemId.split('/').pop()!;
        
        // Use provided network or fall back to target vnet
        const networkId = testNetworkId || item.targetVnetId;
        if (!networkId) {
          throw new Error('No test network specified and no target VNet configured');
        }

        // Use provided subnet or fall back to target subnet
        const subnetName = testSubnetName || item.targetSubnetName;

        const result = await azureSiteRecoveryService.testMigrate(
          item.vaultName,
          item.fabricName,
          item.containerName,
          migrationItemName,
          networkId,
          subnetName
        );

        if (result.success) {
          await this.update(id, {
            testFailoverStatus: 'TestMigrationInProgress',
          });

          await activityService.log({
            type: 'replication',
            action: 'test_migrate_started',
            title: `Test migration started for ${item.machineName}`,
            description: 'Creating test VM in Azure...',
            status: 'info',
            entityType: 'replication',
            entityId: id,
          });

          return { jobId: result.jobId || `tm-${id}` };
        }
        throw new Error('Test migration failed to start');
      } catch (e) {
        throw new Error(`Azure test migration failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

    throw new Error('Machine does not have Azure replication configured');
  },

  /**
   * Test Migrate Cleanup - Deletes the test VM created during test migration
   */
  async testMigrateCleanup(id: string, comments?: string) {
    const item = await this.getById(id);
    if (!item) {
      throw new Error(`Replication item ${id} not found`);
    }

    if (item.vaultName && item.fabricName && item.containerName && item.azureProtectedItemId) {
      try {
        const migrationItemName = item.azureProtectedItemId.split('/').pop()!;

        const result = await azureSiteRecoveryService.testMigrateCleanup(
          item.vaultName,
          item.fabricName,
          item.containerName,
          migrationItemName,
          comments
        );

        if (result.success) {
          await this.update(id, {
            testFailoverStatus: 'TestMigrationCleanupInProgress',
          });

          await activityService.log({
            type: 'replication',
            action: 'test_migrate_cleanup_started',
            title: `Test migration cleanup started for ${item.machineName}`,
            description: 'Cleaning up test VM resources...',
            status: 'info',
            entityType: 'replication',
            entityId: id,
          });

          return { jobId: result.jobId || `tmc-${id}` };
        }
        throw new Error('Test migration cleanup failed to start');
      } catch (e) {
        throw new Error(`Azure test migration cleanup failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

    throw new Error('Machine does not have Azure replication configured');
  },

  /**
   * Migrate - Performs the actual migration to Azure
   * Uses VMwareCbt migrate API for Azure Migrate Server Migration
   */
  async migrate(id: string, performShutdown: boolean = true) {
    const item = await this.getById(id);
    if (!item) {
      throw new Error(`Replication item ${id} not found`);
    }

    // Check if migrate is allowed based on current state
    const validStates = ['Replicating', 'Protected', 'InitialSeedingInProgress'];
    if (!validStates.includes(item.status)) {
      throw new Error(`Machine must be in a replicating state to perform migration. Current status: ${item.status}`);
    }

    if (item.vaultName && item.fabricName && item.containerName && item.azureProtectedItemId) {
      try {
        const migrationItemName = item.azureProtectedItemId.split('/').pop()!;

        const result = await azureSiteRecoveryService.migrate(
          item.vaultName,
          item.fabricName,
          item.containerName,
          migrationItemName,
          performShutdown
        );

        if (result.success) {
          await this.update(id, { status: 'MigrationInProgress' });

          await activityService.log({
            type: 'replication',
            action: 'migration_started',
            title: `Migration started for ${item.machineName}`,
            description: performShutdown 
              ? 'Shutting down source VM and migrating to Azure...' 
              : 'Migrating to Azure without shutting down source...',
            status: 'info',
            entityType: 'replication',
            entityId: id,
          });

          return { jobId: result.jobId || `mig-${id}` };
        }
        throw new Error('Migration failed to start');
      } catch (e) {
        throw new Error(`Azure migration failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

    throw new Error('Machine does not have Azure replication configured');
  },

  /**
   * Complete Migration - Finalizes the migration and removes replication
   */
  async completeMigration(id: string) {
    const item = await this.getById(id);
    if (!item) {
      throw new Error(`Replication item ${id} not found`);
    }

    if (item.vaultName && item.fabricName && item.containerName && item.azureProtectedItemId) {
      try {
        const migrationItemName = item.azureProtectedItemId.split('/').pop()!;

        const result = await azureSiteRecoveryService.completeMigration(
          item.vaultName,
          item.fabricName,
          item.containerName,
          migrationItemName
        );

        if (result.success) {
          await this.update(id, { status: 'MigrationCompleted' });

          await activityService.log({
            type: 'replication',
            action: 'migration_completed',
            title: `Migration completed for ${item.machineName}`,
            description: 'VM is now running in Azure',
            status: 'success',
            entityType: 'replication',
            entityId: id,
          });

          return { success: true, jobId: result.jobId };
        }
        throw new Error('Complete migration failed');
      } catch (e) {
        throw new Error(`Azure complete migration failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

    throw new Error('Machine does not have Azure replication configured');
  },

  /**
   * Legacy: Test failover (kept for backward compatibility)
   * @deprecated Use testMigrate instead for VMwareCbt
   */
  async testFailover(id: string) {
    // Delegate to testMigrate for VMwareCbt
    return this.testMigrate(id);
  },

  /**
   * Legacy: Planned failover (kept for backward compatibility)
   * @deprecated Use migrate instead for VMwareCbt
   */
  async failover(id: string) {
    // Delegate to migrate for VMwareCbt
    return this.migrate(id, true);
  },

  /**
   * Delete replication item - removes from both local DB and Azure
   */
  async delete(id: string, disableInAzure: boolean = true) {
    // Get the item first to get Azure details
    const item = await prisma.replicationItem.findUnique({
      where: { id },
    });

    if (!item) {
      throw new Error('Replication item not found');
    }

    // If the item has Azure replication, disable it in Azure first
    if (disableInAzure && item.azureProtectedItemId && item.vaultName && item.fabricName && item.containerName) {
      try {
        // Extract migration item name from the Azure ID
        const migrationItemName = item.azureProtectedItemId.split('/').pop();
        if (migrationItemName) {
          console.log('[v13] Disabling Azure migration for:', item.machineName);
          await azureSiteRecoveryService.disableMigration(
            item.vaultName,
            item.fabricName,
            item.containerName,
            migrationItemName
          );
          console.log('[v13] Azure migration disabled successfully');
        }
      } catch (e) {
        console.error('[v13] Failed to disable Azure migration:', e);
        // Continue to delete local record even if Azure fails
        // The user can manually clean up Azure if needed
      }
    }

    // Delete from local database
    await prisma.replicationItem.delete({
      where: { id },
    });
    console.log('[v13] Deleted local replication record for:', item.machineName);
  },

  /**
   * Get statistics
   */
  async getStats() {
    const items = await this.getAll();
    return {
      total: items.length,
      protected: items.filter(i => i.status === 'Protected').length,
      syncing: items.filter(i => ['Enabling', 'InitialReplication'].includes(i.status)).length,
      failed: items.filter(i => i.status === 'Failed' || i.status === 'AzureEnableFailed').length,
      failedOver: items.filter(i => i.status === 'FailedOver').length,
      localOnly: items.filter(i => i.status === 'LocalOnly').length,
    };
  },

  /**
   * Get Azure Site Recovery infrastructure discovery
   */
  async discoverInfrastructure() {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return {
        configured: false,
        message: 'Azure not configured',
      };
    }

    const asrInfra = await this.discoverASRInfrastructure();
    
    if (asrInfra) {
      return {
        configured: true,
        recoveryVault: {
          name: asrInfra.vaultName,
        },
        replicationFabric: {
          name: asrInfra.fabricName,
        },
        protectionContainer: {
          name: asrInfra.containerName,
        },
        policyId: asrInfra.policyId,
        dataMoverRunAsAccountId: asrInfra.dataMoverRunAsAccountId,
        snapshotRunAsAccountId: asrInfra.snapshotRunAsAccountId,
        vmwareSiteId: asrInfra.vmwareSiteId,
        cacheStorageAccountId: asrInfra.cacheStorageAccountId,
        // IMPORTANT: The target region is determined by the vault location
        // ALL target resources (VNet, storage, resource group) MUST be in this region
        targetRegion: asrInfra.targetRegion,
      };
    }

    // Fallback to full discovery
    return azureSiteRecoveryService.discoverInfrastructure();
  },

  /**
   * Get replication jobs from Azure Site Recovery
   */
  async getJobs() {
    const vault = await azureSiteRecoveryService.getMigrateVault();
    if (!vault) {
      return [];
    }
    return azureSiteRecoveryService.getJobs(vault.name);
  },

  /**
   * Get detailed replication status from Azure (like Azure Migrate shows)
   */
  async getDetailedStatus(itemId: string) {
    // Get the local item first
    const localItem = await prisma.replicationItem.findUnique({
      where: { id: itemId },
    });

    if (!localItem) {
      throw new Error('Replication item not found');
    }

    // Get ASR infrastructure
    const asrInfra = await this.discoverASRInfrastructure();
    if (!asrInfra) {
      return {
        localItem: {
          id: localItem.id,
          machineName: localItem.machineName,
          status: localItem.status,
          healthStatus: localItem.healthStatus,
          replicationProgress: localItem.replicationProgress,
          targetConfig: {
            targetResourceGroup: localItem.targetResourceGroup,
            targetVnetId: localItem.targetVnetId,
            targetSubnetName: localItem.targetSubnetName,
            targetVmSize: localItem.targetVmSize,
          },
        },
        azureDetails: null,
        message: 'Azure Site Recovery infrastructure not available',
      };
    }

    // Try to get detailed info from Azure
    // Use the azureProtectedItemId (full ARM resource ID) or the azureReplicationId to find the item
    let migrationItemName: string;
    
    if (localItem.azureProtectedItemId) {
      // Extract the migration item name from the full ARM resource ID
      // Format: /subscriptions/.../replicationMigrationItems/{migrationItemName}
      const parts = localItem.azureProtectedItemId.split('/');
      migrationItemName = parts[parts.length - 1];
    } else if (localItem.azureReplicationId) {
      // Use the azureReplicationId as the migration item name
      migrationItemName = localItem.azureReplicationId;
    } else {
      // Fall back to machine name (sanitized)
      migrationItemName = localItem.machineName.replace(/[^a-zA-Z0-9-]/g, '-');
    }
    
    console.log(`[getDetailedStatus] Looking for migration item: ${migrationItemName}`);
    
    const azureDetails = await azureSiteRecoveryService.getMigrationItemDetails(
      asrInfra.vaultName,
      asrInfra.fabricName,
      asrInfra.containerName,
      migrationItemName
    );

    return {
      localItem: {
        id: localItem.id,
        machineName: localItem.machineName,
        sourceServerId: localItem.sourceServerId,
        status: localItem.status,
        healthStatus: localItem.healthStatus,
        healthErrors: localItem.healthErrors ? JSON.parse(localItem.healthErrors) : [],
        replicationProgress: localItem.replicationProgress,
        lastSyncTime: localItem.lastSyncTime?.toISOString(),
        targetConfig: {
          targetResourceGroup: localItem.targetResourceGroup,
          targetVnetId: localItem.targetVnetId,
          targetSubnetName: localItem.targetSubnetName,
          targetVmSize: localItem.targetVmSize,
          targetStorageAccountId: localItem.targetStorageAccountId,
          availabilityZone: localItem.availabilityZone,
          licenseType: localItem.licenseType,
        },
        azureSiteRecovery: {
          vaultName: localItem.vaultName,
          fabricName: localItem.fabricName,
          containerName: localItem.containerName,
          protectedItemId: localItem.azureProtectedItemId,
        },
        createdAt: localItem.createdAt.toISOString(),
        updatedAt: localItem.updatedAt.toISOString(),
      },
      azureDetails,
    };
  },

  /**
   * Restart a failed replication job
   */
  async restartJob(jobId: string) {
    const asrInfra = await this.discoverASRInfrastructure();
    if (!asrInfra) {
      throw new Error('Azure Site Recovery infrastructure not configured');
    }

    const result = await azureSiteRecoveryService.restartJob(asrInfra.vaultName, jobId);
    
    // Log activity
    await activityService.log({
      action: 'replication.job.restart',
      entityType: 'job',
      entityId: jobId,
      details: { result },
    });

    return result;
  },

  /**
   * Resync replication for a machine
   */
  async resync(itemId: string) {
    const localItem = await prisma.replicationItem.findUnique({
      where: { id: itemId },
    });

    if (!localItem) {
      throw new Error('Replication item not found');
    }

    const asrInfra = await this.discoverASRInfrastructure();
    if (!asrInfra) {
      throw new Error('Azure Site Recovery infrastructure not configured');
    }

    const migrationItemName = localItem.machineName.replace(/[^a-zA-Z0-9-]/g, '-');
    const result = await azureSiteRecoveryService.resyncMigrationItem(
      asrInfra.vaultName,
      asrInfra.fabricName,
      asrInfra.containerName,
      migrationItemName
    );

    // Update local status
    await prisma.replicationItem.update({
      where: { id: itemId },
      data: {
        status: 'Resyncing',
        healthStatus: 'None',
      },
    });

    // Log activity
    await activityService.log({
      action: 'replication.resync',
      entityType: 'replication',
      entityId: itemId,
      details: { machineName: localItem.machineName, ...result },
    });

    return { jobId: result.jobId || 'resync-started' };
  },

  /**
   * Clear ASR infrastructure cache (useful after configuration changes)
   */
  clearInfrastructureCache() {
    asrInfrastructureCache = null;
  },

  /**
   * Get the region of a storage account by its resource ID
   */
  async getStorageAccountRegion(storageAccountId: string): Promise<string | null> {
    try {
      const config = await azureConfigService.getConfig();
      if (!config?.isConfigured) return null;

      const { ClientSecretCredential } = await import('@azure/identity');
      const credential = new ClientSecretCredential(
        config.tenantId,
        config.clientId,
        config.clientSecret
      );

      const token = await credential.getToken('https://management.azure.com/.default');
      const response = await fetch(
        `https://management.azure.com${storageAccountId}?api-version=2023-01-01`,
        {
          headers: {
            Authorization: `Bearer ${token.token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        return data.location || null;
      }
      return null;
    } catch (e) {
      console.error('Failed to get storage account region:', e);
      return null;
    }
  },

  /**
   * Find a cache storage account in the specified region
   */
  async findStorageAccountInRegion(targetRegion: string): Promise<string | null> {
    try {
      const config = await azureConfigService.getConfig();
      if (!config?.isConfigured) return null;

      const { ClientSecretCredential } = await import('@azure/identity');
      const credential = new ClientSecretCredential(
        config.tenantId,
        config.clientId,
        config.clientSecret
      );

      const token = await credential.getToken('https://management.azure.com/.default');
      
      // Normalize region name for comparison (remove spaces, lowercase)
      const normalizedTarget = targetRegion.toLowerCase().replace(/\s/g, '');
      
      // List all storage accounts in the subscription
      const response = await fetch(
        `https://management.azure.com/subscriptions/${config.subscriptionId}/providers/Microsoft.Storage/storageAccounts?api-version=2023-01-01`,
        {
          headers: {
            Authorization: `Bearer ${token.token}`,
          },
        }
      );

      if (!response.ok) {
        console.error('Failed to list storage accounts:', await response.text());
        return null;
      }

      const data = await response.json();
      const storageAccounts = data.value || [];

      // Look for a cache storage account in the target region
      // Priority: accounts with 'cache' or 'migrate' in the name
      for (const account of storageAccounts) {
        const accountRegion = account.location?.toLowerCase().replace(/\s/g, '') || '';
        const accountName = account.name?.toLowerCase() || '';
        
        if (accountRegion === normalizedTarget) {
          // Check if it's a migrate/cache account (prioritize these)
          if (accountName.includes('cache') || accountName.includes('migrate')) {
            console.log(`Found cache storage account in ${targetRegion}: ${account.id}`);
            return account.id;
          }
        }
      }

      // If no cache-specific account found, return the first one in the region
      for (const account of storageAccounts) {
        const accountRegion = account.location?.toLowerCase().replace(/\s/g, '') || '';
        
        if (accountRegion === normalizedTarget) {
          console.log(`Using storage account in ${targetRegion}: ${account.id}`);
          return account.id;
        }
      }

      console.log(`No storage account found in region ${targetRegion}`);
      return null;
    } catch (e) {
      console.error('Failed to find storage account in region:', e);
      return null;
    }
  },
};
