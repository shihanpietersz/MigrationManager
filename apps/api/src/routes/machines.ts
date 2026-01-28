import { FastifyPluginAsync } from 'fastify';
import { machineService } from '../services/machine.service.js';
import { azureMigrateService } from '../services/azure-migrate.service.js';
import { azureSiteRecoveryService } from '../services/azure-site-recovery.service.js';
import type { Machine, MachineSource, ApiResponse, MachineComparison } from '@drmigrate/shared-types';

// Disk details interface
interface DiskDetails {
  diskId: string;
  diskName: string;
  sizeGB: number;
  diskType?: string;
  isOsDisk: boolean;
}

export const machineRoutes: FastifyPluginAsync = async (fastify) => {
  // List all machines (unified view)
  fastify.get<{
    Querystring: {
      source?: MachineSource;
      search?: string;
      page?: number;
      pageSize?: number;
    };
  }>(
    '/',
    {
      schema: {
        tags: ['Machines'],
        summary: 'List all machines from unified inventory',
        querystring: {
          type: 'object',
          properties: {
            source: { type: 'string', enum: ['azure', 'external', 'both'] },
            search: { type: 'string' },
            page: { type: 'number', default: 1 },
            pageSize: { type: 'number', default: 50 },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<Machine[]>> => {
      const { machines, total } = await machineService.getAll({
        source: request.query.source,
        search: request.query.search,
        page: request.query.page,
        pageSize: request.query.pageSize,
      });

      const page = request.query.page || 1;
      const pageSize = request.query.pageSize || 50;

      return {
        success: true,
        data: machines,
        meta: {
          page,
          pageSize,
          totalCount: total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    }
  );

  // Get machine by ID
  fastify.get<{ Params: { machineId: string } }>(
    '/:machineId',
    {
      schema: {
        tags: ['Machines'],
        summary: 'Get machine details',
        params: {
          type: 'object',
          properties: {
            machineId: { type: 'string' },
          },
          required: ['machineId'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<Machine>> => {
      const machine = await machineService.getById(request.params.machineId);

      if (!machine) {
        reply.code(404);
        return {
          success: false,
          error: {
            code: 'MACHINE_NOT_FOUND',
            message: `Machine ${request.params.machineId} not found`,
          },
        };
      }

      return {
        success: true,
        data: machine,
      };
    }
  );

  // Compare machines from different sources
  fastify.post(
    '/compare',
    {
      schema: {
        tags: ['Machines'],
        summary: 'Compare machines from Azure and external sources',
      },
    },
    async (): Promise<ApiResponse<MachineComparison>> => {
      // TODO: Implement actual comparison logic
      const counts = await machineService.getCounts();

      return {
        success: true,
        data: {
          id: 'comparison-' + Date.now(),
          createdAt: new Date().toISOString(),
          status: 'completed',
          matched: [],
          azureOnly: [],
          externalOnly: [],
          summary: {
            totalAzure: counts.azure,
            totalExternal: counts.external,
            matchedCount: 0,
            discrepancyCount: 0,
          },
        },
      };
    }
  );

  // Refresh machines from Azure Migrate
  fastify.post(
    '/refresh',
    {
      schema: {
        tags: ['Machines'],
        summary: 'Refresh machine list from Azure Migrate discovery',
      },
    },
    async (_, reply): Promise<ApiResponse<{ count: number; sites: string[] }>> => {
      try {
        const result = await azureMigrateService.syncMachines();
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'SYNC_FAILED',
            message: error instanceof Error ? error.message : 'Failed to sync machines',
          },
        };
      }
    }
  );

  // Get machine counts (legacy)
  fastify.get(
    '/stats/counts',
    {
      schema: {
        tags: ['Machines'],
        summary: 'Get machine counts by source',
      },
    },
    async (): Promise<ApiResponse<{ total: number; azure: number; external: number }>> => {
      const counts = await machineService.getCounts();
      return {
        success: true,
        data: counts,
      };
    }
  );

  // Get machine stats (for dashboard)
  fastify.get(
    '/stats',
    {
      schema: {
        tags: ['Machines'],
        summary: 'Get machine statistics for dashboard',
      },
    },
    async (): Promise<ApiResponse<{
      total: number;
      bySource: { azure: number; external: number; both: number };
      byOS: Record<string, number>;
    }>> => {
      const counts = await machineService.getCounts();
      const osCounts = await machineService.getOSCounts();
      
      return {
        success: true,
        data: {
          total: counts.total,
          bySource: {
            azure: counts.azure,
            external: counts.external,
            both: counts.total,
          },
          byOS: osCounts,
        },
      };
    }
  );

  // Get disk details for a machine (from Azure Migrate discovered data)
  fastify.get<{ Params: { machineId: string } }>(
    '/:machineId/disks',
    {
      schema: {
        tags: ['Machines'],
        summary: 'Get disk details for a machine from Azure Migrate',
        params: {
          type: 'object',
          properties: {
            machineId: { type: 'string' },
          },
          required: ['machineId'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<DiskDetails[]>> => {
      const machine = await machineService.getById(request.params.machineId);

      if (!machine) {
        reply.code(404);
        return {
          success: false,
          error: {
            code: 'MACHINE_NOT_FOUND',
            message: `Machine ${request.params.machineId} not found`,
          },
        };
      }

      // Get the Azure Migrate ID for this machine
      const azureMigrateId = machine.sourceIds?.azure;
      if (!azureMigrateId) {
        // Return estimated disk info from local data
        return {
          success: true,
          data: [{
            diskId: 'disk-0',
            diskName: 'OS Disk',
            sizeGB: machine.diskSizeGB || 128,
            diskType: 'Standard_LRS',
            isOsDisk: true,
          }],
        };
      }

      try {
        // Fetch disk details from Azure
        console.log(`[v10] Fetching disks for machine: ${machine.displayName}`);
        console.log(`[v10] Azure Migrate ID: ${azureMigrateId}`);
        const machineDetails = await azureSiteRecoveryService.getDiscoveredMachineDetails(azureMigrateId);
        
        console.log(`[v10] Machine details raw disks:`, JSON.stringify(machineDetails?.properties?.disks, null, 2));
        
        if (!machineDetails?.properties?.disks) {
          console.log(`[v10] No disks found in Azure, returning default`);
          // Return local disk info if Azure details not available
          return {
            success: true,
            data: [{
              diskId: 'disk-0',
              diskName: 'OS Disk',
              sizeGB: machine.diskSizeGB || 128,
              diskType: 'Standard_LRS',
              isOsDisk: true,
            }],
          };
        }

        // Transform disk data - handle both array and object formats
        const disksArray = Array.isArray(machineDetails.properties.disks)
          ? machineDetails.properties.disks
          : Object.values(machineDetails.properties.disks);

        console.log(`[v10] Found ${disksArray.length} disk(s) for ${machine.displayName}`);

        // Valid Azure disk types
        const validDiskTypes = ['Standard_LRS', 'StandardSSD_LRS', 'Premium_LRS'];
        
        const disks: DiskDetails[] = disksArray.map((disk: any, index: number) => {
          const sizeGB = disk.maxSizeInBytes 
            ? Math.ceil(disk.maxSizeInBytes / (1024 * 1024 * 1024))
            : disk.megabytesOfSize 
              ? Math.ceil(disk.megabytesOfSize / 1024)
              : 128;
          
          // Ensure diskType is a valid Azure storage type (VMware returns things like "SCSI")
          const diskType = validDiskTypes.includes(disk.diskType) ? disk.diskType : 'StandardSSD_LRS';
          
          console.log(`[v11] Disk ${index}: uuid=${disk.uuid}, name=${disk.displayName || disk.name}, sizeGB=${sizeGB}, maxSizeInBytes=${disk.maxSizeInBytes}, rawDiskType=${disk.diskType}, mappedDiskType=${diskType}`);
          
          return {
            diskId: disk.uuid || disk.diskId || `disk-${index}`,
            diskName: disk.displayName || disk.name || disk.label || `Disk ${index}`,
            sizeGB,
            diskType,
            isOsDisk: index === 0,
          };
        });

        console.log(`[v10] Returning ${disks.length} disk(s) to frontend:`, disks.map(d => ({ id: d.diskId, name: d.diskName, sizeGB: d.sizeGB })));

        return {
          success: true,
          data: disks,
        };
      } catch (error) {
        console.error('[v10] Failed to get disk details from Azure:', error);
        // Return local disk info on error
        return {
          success: true,
          data: [{
            diskId: 'disk-0',
            diskName: 'OS Disk',
            sizeGB: machine.diskSizeGB || 128,
            diskType: 'Standard_LRS',
            isOsDisk: true,
          }],
        };
      }
    }
  );
};
