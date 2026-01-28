import { FastifyPluginAsync } from 'fastify';
import { targetsService } from '../services/targets.service.js';
import type {
  VmSku,
  VirtualNetwork,
  StorageAccount,
  AvailabilityZone,
  AvailabilitySet,
  ApiResponse,
} from '@drmigrate/shared-types';

export const targetRoutes: FastifyPluginAsync = async (fastify) => {
  // List Azure regions
  fastify.get(
    '/regions',
    {
      schema: {
        tags: ['Targets'],
        summary: 'List available Azure regions',
      },
    },
    async (): Promise<ApiResponse<Array<{ name: string; displayName: string }>>> => {
      const regions = await targetsService.getRegions();
      return {
        success: true,
        data: regions,
      };
    }
  );

  // List available VM SKUs
  fastify.get<{
    Querystring: {
      location?: string;
      minCores?: number;
      minMemoryGB?: number;
    };
  }>(
    '/skus',
    {
      schema: {
        tags: ['Targets'],
        summary: 'List available VM SKUs',
        querystring: {
          type: 'object',
          properties: {
            location: { type: 'string', default: 'eastus' },
            minCores: { type: 'number' },
            minMemoryGB: { type: 'number' },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<VmSku[]>> => {
      const location = request.query.location || 'eastus';
      let skus = await targetsService.getVmSkus(location);

      if (request.query.minCores) {
        skus = skus.filter((sku) => sku.cores >= request.query.minCores!);
      }

      if (request.query.minMemoryGB) {
        skus = skus.filter((sku) => sku.memoryGB >= request.query.minMemoryGB!);
      }

      return {
        success: true,
        data: skus.map(sku => ({
          name: sku.name,
          tier: sku.tier,
          family: sku.family,
          size: sku.name.replace('Standard_', ''),
          cores: sku.cores,
          memoryGB: sku.memoryGB,
          maxDataDisks: Math.floor(sku.cores * 2),
          maxNetworkInterfaces: Math.min(Math.floor(sku.cores / 2) + 1, 8),
          osDiskSizeGB: 32,
          pricePerHour: sku.cores * 0.05, // Rough estimate
          pricePerMonth: sku.cores * 0.05 * 730, // 730 hours/month
        })),
      };
    }
  );

  // List virtual networks
  fastify.get<{
    Querystring: {
      subscriptionId?: string;
      location?: string;
    };
  }>(
    '/vnets',
    {
      schema: {
        tags: ['Targets'],
        summary: 'List virtual networks',
        querystring: {
          type: 'object',
          properties: {
            subscriptionId: { type: 'string' },
            location: { type: 'string' },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<VirtualNetwork[]>> => {
      // Pass region to service for efficient filtering
      const vnets = await targetsService.getVnets(request.query.location);

      return {
        success: true,
        data: vnets.map(vnet => ({
          id: vnet.id,
          name: vnet.name,
          resourceGroup: vnet.resourceGroup,
          location: vnet.location,
          addressPrefixes: vnet.addressPrefixes,
          subnets: vnet.subnets.map(subnet => ({
            id: subnet.id,
            name: subnet.name,
            addressPrefix: subnet.addressPrefix,
            availableAddresses: 251, // Estimated
          })),
        })),
      };
    }
  );

  // List subnets for a VNet
  fastify.get<{
    Querystring: {
      vnetId: string;
    };
  }>(
    '/subnets',
    {
      schema: {
        tags: ['Targets'],
        summary: 'List subnets for a virtual network',
        querystring: {
          type: 'object',
          required: ['vnetId'],
          properties: {
            vnetId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply): Promise<ApiResponse<VirtualNetwork['subnets']>> => {
      const vnets = await targetsService.getVnets();
      const vnet = vnets.find((v) => v.id === request.query.vnetId);

      if (!vnet) {
        reply.code(404);
        return {
          success: false,
          error: {
            code: 'VNET_NOT_FOUND',
            message: `Virtual network not found`,
          },
        };
      }

      return {
        success: true,
        data: vnet.subnets.map(subnet => ({
          id: subnet.id,
          name: subnet.name,
          addressPrefix: subnet.addressPrefix,
          availableAddresses: 251,
        })),
      };
    }
  );

  // List storage accounts
  fastify.get<{
    Querystring: {
      subscriptionId?: string;
      location?: string;
    };
  }>(
    '/storage-accounts',
    {
      schema: {
        tags: ['Targets'],
        summary: 'List storage accounts',
        querystring: {
          type: 'object',
          properties: {
            subscriptionId: { type: 'string' },
            location: { type: 'string' },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<StorageAccount[]>> => {
      let accounts = await targetsService.getStorageAccounts();

      // Filter by location (case-insensitive)
      if (request.query.location) {
        const targetLocation = request.query.location.toLowerCase();
        accounts = accounts.filter((sa) => sa.location.toLowerCase() === targetLocation);
      }

      return {
        success: true,
        data: accounts.map(sa => ({
          id: sa.id,
          name: sa.name,
          resourceGroup: sa.resourceGroup,
          location: sa.location,
          sku: sa.sku,
          kind: sa.kind,
          accessTier: 'Hot',
        })),
      };
    }
  );

  // List resource groups
  fastify.get<{
    Querystring: {
      location?: string;
    };
  }>(
    '/resource-groups',
    {
      schema: {
        tags: ['Targets'],
        summary: 'List resource groups',
        querystring: {
          type: 'object',
          properties: {
            location: { type: 'string' },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<Array<{ id: string; name: string; location: string }>>> => {
      let groups = await targetsService.getResourceGroups();
      
      // Filter by location (case-insensitive)
      if (request.query.location) {
        const targetLocation = request.query.location.toLowerCase();
        groups = groups.filter((rg) => rg.location.toLowerCase() === targetLocation);
      }
      
      return {
        success: true,
        data: groups,
      };
    }
  );

  // List recovery services vaults
  fastify.get(
    '/recovery-vaults',
    {
      schema: {
        tags: ['Targets'],
        summary: 'List Recovery Services vaults',
      },
    },
    async (): Promise<ApiResponse<Array<{ id: string; name: string; resourceGroup: string; location: string }>>> => {
      const vaults = await targetsService.getRecoveryVaults();
      return {
        success: true,
        data: vaults,
      };
    }
  );

  // List availability zones
  fastify.get<{
    Querystring: {
      location: string;
    };
  }>(
    '/availability-zones',
    {
      schema: {
        tags: ['Targets'],
        summary: 'List availability zones for a location',
        querystring: {
          type: 'object',
          required: ['location'],
          properties: {
            location: { type: 'string' },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<AvailabilityZone[]>> => {
      // Most regions have 3 zones
      const zones: AvailabilityZone[] = [
        { zone: '1', location: request.query.location },
        { zone: '2', location: request.query.location },
        { zone: '3', location: request.query.location },
      ];

      return {
        success: true,
        data: zones,
      };
    }
  );

  // List availability sets
  fastify.get<{
    Querystring: {
      resourceGroup?: string;
    };
  }>(
    '/availability-sets',
    {
      schema: {
        tags: ['Targets'],
        summary: 'List availability sets',
        querystring: {
          type: 'object',
          properties: {
            resourceGroup: { type: 'string' },
          },
        },
      },
    },
    async (): Promise<ApiResponse<AvailabilitySet[]>> => {
      // Mock availability sets
      const sets: AvailabilitySet[] = [
        {
          id: '/subscriptions/xxx/resourceGroups/rg-migrate/providers/Microsoft.Compute/availabilitySets/as-sap',
          name: 'as-sap',
          resourceGroup: 'rg-migrate',
          location: 'eastus',
          faultDomainCount: 2,
          updateDomainCount: 5,
        },
      ];

      return {
        success: true,
        data: sets,
      };
    }
  );
};
