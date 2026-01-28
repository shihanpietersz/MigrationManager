import { FastifyPluginAsync } from 'fastify';
import { replicationService, type EnableReplicationInput } from '../services/replication.service.js';
import type {
  ReplicationItem,
  ApiResponse,
} from '@drmigrate/shared-types';

export const replicationRoutes: FastifyPluginAsync = async (fastify) => {
  // Get Azure Site Recovery infrastructure
  fastify.get(
    '/infrastructure',
    {
      schema: {
        tags: ['Replication'],
        summary: 'Discover Azure Site Recovery infrastructure',
      },
    },
    async (): Promise<ApiResponse<unknown>> => {
      try {
        const infrastructure = await replicationService.discoverInfrastructure();
        return {
          success: true,
          data: infrastructure,
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'DISCOVERY_ERROR',
            message: error instanceof Error ? error.message : 'Failed to discover infrastructure',
          },
        };
      }
    }
  );

  // Refresh infrastructure discovery (clears cache)
  fastify.post(
    '/infrastructure/refresh',
    {
      schema: {
        tags: ['Replication'],
        summary: 'Refresh Azure Site Recovery infrastructure discovery (clears cache)',
      },
    },
    async (): Promise<ApiResponse<unknown>> => {
      try {
        replicationService.clearInfrastructureCache();
        const infrastructure = await replicationService.discoverInfrastructure();
        return {
          success: true,
          data: infrastructure,
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'DISCOVERY_ERROR',
            message: error instanceof Error ? error.message : 'Failed to refresh infrastructure',
          },
        };
      }
    }
  );

  // Get replication jobs from Azure
  fastify.get(
    '/jobs',
    {
      schema: {
        tags: ['Replication'],
        summary: 'Get replication jobs from Azure Site Recovery',
      },
    },
    async (): Promise<ApiResponse<unknown[]>> => {
      const jobs = await replicationService.getJobs();
      return {
        success: true,
        data: jobs,
      };
    }
  );

  // List all replication items
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Replication'],
        summary: 'List all replication items',
      },
    },
    async (): Promise<ApiResponse<ReplicationItem[]>> => {
      const items = await replicationService.getAll();
      
      // Transform database items to API format
      return {
        success: true,
        data: items.map((item: any) => ({
          id: item.id,
          machineId: item.machineId,
          machineName: item.machineName,
          sourceServerId: item.sourceServerId || '',
          status: item.status as ReplicationItem['status'],
          healthStatus: item.healthStatus as ReplicationItem['healthStatus'],
          healthErrors: item.healthErrors ? (typeof item.healthErrors === 'string' ? JSON.parse(item.healthErrors) : item.healthErrors) : [],
          replicationProgress: item.replicationProgress || 0,
          lastSyncTime: item.lastSyncTime instanceof Date ? item.lastSyncTime.toISOString() : item.lastSyncTime,
          targetConfig: {
            targetResourceGroup: item.targetResourceGroup,
            targetVnetId: item.targetVnetId,
            targetSubnetName: item.targetSubnetName,
            targetVmSize: item.targetVmSize,
            targetStorageAccountId: item.targetStorageAccountId,
            availabilityZone: item.availabilityZone || undefined,
            availabilitySetId: item.availabilitySetId || undefined,
            licenseType: item.licenseType as 'NoLicenseType' | 'WindowsServer',
            tags: item.tags ? (typeof item.tags === 'string' ? JSON.parse(item.tags) : item.tags) : undefined,
          },
          azureSiteRecovery: {
            protectedItemId: item.azureProtectedItemId || undefined,
            vaultName: item.vaultName || undefined,
            fabricName: item.fabricName || undefined,
            containerName: item.containerName || undefined,
          },
          testFailoverStatus: item.testFailoverStatus ? {
            status: item.testFailoverStatus,
            testVmId: undefined,
          } : undefined,
          createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
          updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : item.updatedAt,
          // Extended Azure status details from live API
          azureStatus: item.azureStatus ? {
            migrationState: item.azureStatus.migrationState,
            migrationStateDescription: item.azureStatus.migrationStateDescription,
            replicationStatus: item.azureStatus.replicationStatus,
            initialSeedingProgress: item.azureStatus.initialSeedingProgress,
            deltaSyncProgress: item.azureStatus.deltaSyncProgress,
            resyncRequired: item.azureStatus.resyncRequired,
            resyncProgress: item.azureStatus.resyncProgress,
            lastRecoveryPointTime: item.azureStatus.lastRecoveryPointTime,
            allowedOperations: item.azureStatus.allowedOperations,
            testMigrateState: item.azureStatus.testMigrateState,
            testMigrateStateDescription: item.azureStatus.testMigrateStateDescription,
            osType: item.azureStatus.osType,
            firmwareType: item.azureStatus.firmwareType,
          } : undefined,
        })),
      };
    }
  );

  // Get replication stats
  fastify.get(
    '/stats',
    {
      schema: {
        tags: ['Replication'],
        summary: 'Get replication statistics',
      },
    },
    async (): Promise<ApiResponse<{ total: number; protected: number; syncing: number; failed: number; failedOver: number }>> => {
      const stats = await replicationService.getStats();
      return {
        success: true,
        data: stats,
      };
    }
  );

  // Enable replication for a group
  fastify.post<{ Body: EnableReplicationInput }>(
    '/enable',
    {
      schema: {
        tags: ['Replication'],
        summary: 'Enable replication for an assessment group',
        body: {
          type: 'object',
          required: ['groupId', 'targetConfig'],
          properties: {
            groupId: { type: 'string' },
            targetConfig: {
              type: 'object',
              required: [
                'targetRegion',
                'targetResourceGroup',
                'targetVnetId',
                'targetSubnetName',
                'targetVmSize',
              ],
              properties: {
                targetRegion: { type: 'string', description: 'Target Azure region (e.g., australiasoutheast)' },
                targetResourceGroup: { type: 'string' },
                targetVnetId: { type: 'string' },
                targetSubnetName: { type: 'string' },
                targetVmSize: { type: 'string' },
                targetStorageAccountId: { type: 'string', description: 'Optional - will auto-discover in target region if not provided' },
                availabilityZone: { type: 'string' },
                availabilitySetId: { type: 'string' },
                licenseType: { type: 'string', enum: ['NoLicenseType', 'WindowsServer'] },
                tags: { type: 'object', additionalProperties: { type: 'string' } },
              },
            },
            machineDisks: {
              type: 'array',
              description: 'Per-machine disk configurations with target size',
              items: {
                type: 'object',
                required: ['machineId', 'disks'],
                properties: {
                  machineId: { type: 'string' },
                  disks: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['diskId', 'isOSDisk', 'diskType', 'targetDiskSizeGB'],
                      properties: {
                        diskId: { type: 'string' },
                        isOSDisk: { type: 'boolean' },
                        diskType: { type: 'string', enum: ['Standard_LRS', 'StandardSSD_LRS', 'Premium_LRS'] },
                        targetDiskSizeGB: { type: 'number', minimum: 1, description: 'Target disk size in GB (must be >= source size)' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply): Promise<ApiResponse<{ items: ReplicationItem[]; message: string; errors?: string[] }>> => {
      try {
        const result = await replicationService.enableForGroup(request.body);

        fastify.log.info(
          `Enabled replication for group ${request.body.groupId} with ${result.items.length} machines`
        );

        return {
          success: true,
          data: {
            items: result.items.map(item => ({
              id: item.id,
              machineId: item.machineId,
              machineName: item.machineName,
              sourceServerId: item.sourceServerId || '',
              status: item.status as ReplicationItem['status'],
              healthStatus: item.healthStatus as ReplicationItem['healthStatus'],
              healthErrors: [],
              replicationProgress: item.replicationProgress || 0,
              targetConfig: {
                targetResourceGroup: item.targetResourceGroup,
                targetVnetId: item.targetVnetId,
                targetSubnetName: item.targetSubnetName,
                targetVmSize: item.targetVmSize,
                targetStorageAccountId: item.targetStorageAccountId,
                availabilityZone: item.availabilityZone || undefined,
                availabilitySetId: item.availabilitySetId || undefined,
                licenseType: item.licenseType as 'NoLicenseType' | 'WindowsServer',
              },
              createdAt: item.createdAt.toISOString(),
              updatedAt: item.updatedAt.toISOString(),
            })),
            message: result.message,
            errors: result.errors,
          },
        };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'REPLICATION_ERROR',
            message: error instanceof Error ? error.message : 'Failed to enable replication',
          },
        };
      }
    }
  );

  // Get replication status
  fastify.get<{ Params: { itemId: string } }>(
    '/:itemId/status',
    {
      schema: {
        tags: ['Replication'],
        summary: 'Get replication status',
        params: {
          type: 'object',
          properties: {
            itemId: { type: 'string' },
          },
          required: ['itemId'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<ReplicationItem>> => {
      const item = await replicationService.getById(request.params.itemId);

      if (!item) {
        reply.code(404);
        return {
          success: false,
          error: {
            code: 'REPLICATION_NOT_FOUND',
            message: `Replication item ${request.params.itemId} not found`,
          },
        };
      }

      return {
        success: true,
        data: {
          id: item.id,
          machineId: item.machineId,
          machineName: item.machineName,
          sourceServerId: item.sourceServerId || '',
          status: item.status as ReplicationItem['status'],
          healthStatus: item.healthStatus as ReplicationItem['healthStatus'],
          healthErrors: item.healthErrors ? JSON.parse(item.healthErrors) : [],
          replicationProgress: item.replicationProgress || 0,
          lastSyncTime: item.lastSyncTime?.toISOString(),
          targetConfig: {
            targetResourceGroup: item.targetResourceGroup,
            targetVnetId: item.targetVnetId,
            targetSubnetName: item.targetSubnetName,
            targetVmSize: item.targetVmSize,
            targetStorageAccountId: item.targetStorageAccountId,
            availabilityZone: item.availabilityZone || undefined,
            availabilitySetId: item.availabilitySetId || undefined,
            licenseType: item.licenseType as 'NoLicenseType' | 'WindowsServer',
            tags: item.tags ? JSON.parse(item.tags) : undefined,
          },
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        },
      };
    }
  );

  // Update replication configuration
  fastify.put<{
    Params: { itemId: string };
    Body: Partial<EnableReplicationInput['targetConfig']>;
  }>(
    '/:itemId/config',
    {
      schema: {
        tags: ['Replication'],
        summary: 'Update replication target configuration',
        params: {
          type: 'object',
          properties: {
            itemId: { type: 'string' },
          },
          required: ['itemId'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<{ updated: boolean }>> => {
      const item = await replicationService.getById(request.params.itemId);

      if (!item) {
        reply.code(404);
        return {
          success: false,
          error: {
            code: 'REPLICATION_NOT_FOUND',
            message: `Replication item ${request.params.itemId} not found`,
          },
        };
      }

      await replicationService.update(request.params.itemId, {
        targetResourceGroup: request.body.targetResourceGroup,
        targetVnetId: request.body.targetVnetId,
        targetSubnetName: request.body.targetSubnetName,
        targetVmSize: request.body.targetVmSize,
        targetStorageAccountId: request.body.targetStorageAccountId,
      });

      return {
        success: true,
        data: { updated: true },
      };
    }
  );

  // Test Migrate - Creates a test VM in Azure
  fastify.post<{ 
    Params: { itemId: string };
    Body: { testNetworkId?: string; testSubnetName?: string };
  }>(
    '/:itemId/test-migrate',
    {
      schema: {
        tags: ['Replication'],
        summary: 'Start test migration - creates a test VM in Azure',
        params: {
          type: 'object',
          properties: {
            itemId: { type: 'string' },
          },
          required: ['itemId'],
        },
        body: {
          type: 'object',
          properties: {
            testNetworkId: { type: 'string', description: 'Optional: VNet ID for test VM (uses target VNet if not specified)' },
            testSubnetName: { type: 'string', description: 'Optional: Subnet name for test VM (uses target subnet if not specified)' },
          },
        },
      },
    },
    async (request, reply): Promise<ApiResponse<{ jobId: string }>> => {
      try {
        const result = await replicationService.testMigrate(
          request.params.itemId,
          request.body?.testNetworkId,
          request.body?.testSubnetName
        );
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'TEST_MIGRATE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to start test migration',
          },
        };
      }
    }
  );

  // Test Migrate Cleanup - Deletes test VM
  fastify.post<{ Params: { itemId: string }; Body: { comments?: string } }>(
    '/:itemId/test-migrate-cleanup',
    {
      schema: {
        tags: ['Replication'],
        summary: 'Clean up test migration - deletes test VM resources',
        params: {
          type: 'object',
          properties: {
            itemId: { type: 'string' },
          },
          required: ['itemId'],
        },
        body: {
          type: 'object',
          properties: {
            comments: { type: 'string', description: 'Comments for the cleanup operation' },
          },
        },
      },
    },
    async (request, reply): Promise<ApiResponse<{ jobId: string }>> => {
      try {
        const result = await replicationService.testMigrateCleanup(
          request.params.itemId,
          request.body?.comments
        );
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'TEST_MIGRATE_CLEANUP_ERROR',
            message: error instanceof Error ? error.message : 'Failed to cleanup test migration',
          },
        };
      }
    }
  );

  // Migrate - Actual migration to Azure
  fastify.post<{ 
    Params: { itemId: string };
    Body: { performShutdown?: boolean };
  }>(
    '/:itemId/migrate',
    {
      schema: {
        tags: ['Replication'],
        summary: 'Start migration - migrates the VM to Azure',
        params: {
          type: 'object',
          properties: {
            itemId: { type: 'string' },
          },
          required: ['itemId'],
        },
        body: {
          type: 'object',
          properties: {
            performShutdown: { type: 'boolean', description: 'Shutdown source VM before migration (default: true)' },
          },
        },
      },
    },
    async (request, reply): Promise<ApiResponse<{ jobId: string }>> => {
      try {
        const performShutdown = request.body?.performShutdown !== false; // Default to true
        const result = await replicationService.migrate(request.params.itemId, performShutdown);
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'MIGRATE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to start migration',
          },
        };
      }
    }
  );

  // Complete Migration - Finalize and remove replication
  fastify.post<{ Params: { itemId: string } }>(
    '/:itemId/complete-migration',
    {
      schema: {
        tags: ['Replication'],
        summary: 'Complete migration - finalizes and removes replication',
        params: {
          type: 'object',
          properties: {
            itemId: { type: 'string' },
          },
          required: ['itemId'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<{ success: boolean; jobId?: string }>> => {
      try {
        const result = await replicationService.completeMigration(request.params.itemId);
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'COMPLETE_MIGRATION_ERROR',
            message: error instanceof Error ? error.message : 'Failed to complete migration',
          },
        };
      }
    }
  );

  // Legacy: Test failover (kept for backward compatibility)
  fastify.post<{ Params: { itemId: string } }>(
    '/:itemId/test-failover',
    {
      schema: {
        tags: ['Replication'],
        summary: '[Deprecated] Use test-migrate instead',
        params: {
          type: 'object',
          properties: {
            itemId: { type: 'string' },
          },
          required: ['itemId'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<{ jobId: string }>> => {
      try {
        const result = await replicationService.testFailover(request.params.itemId);
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'TEST_FAILOVER_ERROR',
            message: error instanceof Error ? error.message : 'Failed to start test failover',
          },
        };
      }
    }
  );

  // Legacy: Planned failover (kept for backward compatibility)
  fastify.post<{ Params: { itemId: string } }>(
    '/:itemId/failover',
    {
      schema: {
        tags: ['Replication'],
        summary: '[Deprecated] Use migrate instead',
        params: {
          type: 'object',
          properties: {
            itemId: { type: 'string' },
          },
          required: ['itemId'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<{ jobId: string }>> => {
      try {
        const result = await replicationService.failover(request.params.itemId);
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'FAILOVER_ERROR',
            message: error instanceof Error ? error.message : 'Failed to start failover',
          },
        };
      }
    }
  );

  // Cancel replication
  fastify.post<{ Params: { itemId: string } }>(
    '/:itemId/cancel',
    {
      schema: {
        tags: ['Replication'],
        summary: 'Cancel replication',
        params: {
          type: 'object',
          properties: {
            itemId: { type: 'string' },
          },
          required: ['itemId'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<{ cancelled: boolean }>> => {
      try {
        const result = await replicationService.cancel(request.params.itemId);
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'CANCEL_ERROR',
            message: error instanceof Error ? error.message : 'Failed to cancel replication',
          },
        };
      }
    }
  );

  // Delete replication item
  fastify.delete<{ Params: { itemId: string } }>(
    '/:itemId',
    {
      schema: {
        tags: ['Replication'],
        summary: 'Delete replication item',
        params: {
          type: 'object',
          properties: {
            itemId: { type: 'string' },
          },
          required: ['itemId'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<{ deleted: boolean }>> => {
      try {
        await replicationService.delete(request.params.itemId);
        return {
          success: true,
          data: { deleted: true },
        };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'DELETE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to delete replication item',
          },
        };
      }
    }
  );

  // Get detailed replication info from Azure (like Azure Migrate shows)
  fastify.get<{ Params: { itemId: string } }>(
    '/:itemId/details',
    {
      schema: {
        tags: ['Replication'],
        summary: 'Get detailed replication information from Azure',
        params: {
          type: 'object',
          properties: {
            itemId: { type: 'string' },
          },
          required: ['itemId'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<unknown>> => {
      try {
        const details = await replicationService.getDetailedStatus(request.params.itemId);
        return {
          success: true,
          data: details,
        };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'DETAILS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get replication details',
          },
        };
      }
    }
  );

  // Restart a failed job
  fastify.post<{ Params: { jobId: string } }>(
    '/jobs/:jobId/restart',
    {
      schema: {
        tags: ['Replication'],
        summary: 'Restart a failed replication job',
        params: {
          type: 'object',
          properties: {
            jobId: { type: 'string' },
          },
          required: ['jobId'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<{ restarted: boolean; jobId: string }>> => {
      try {
        const result = await replicationService.restartJob(request.params.jobId);
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'RESTART_JOB_ERROR',
            message: error instanceof Error ? error.message : 'Failed to restart job',
          },
        };
      }
    }
  );

  // Resync replication
  fastify.post<{ Params: { itemId: string } }>(
    '/:itemId/resync',
    {
      schema: {
        tags: ['Replication'],
        summary: 'Resync replication for a machine',
        params: {
          type: 'object',
          properties: {
            itemId: { type: 'string' },
          },
          required: ['itemId'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<{ jobId: string }>> => {
      try {
        const result = await replicationService.resync(request.params.itemId);
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'RESYNC_ERROR',
            message: error instanceof Error ? error.message : 'Failed to resync replication',
          },
        };
      }
    }
  );
};
