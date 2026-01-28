import { FastifyPluginAsync } from 'fastify';
import { groupService, type CreateGroupInput, type UpdateGroupInput } from '../services/group.service.js';
import type { AssessmentGroup, ApiResponse } from '@drmigrate/shared-types';

export const groupRoutes: FastifyPluginAsync = async (fastify) => {
  // List all groups
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Groups'],
        summary: 'List all assessment groups',
      },
    },
    async (): Promise<ApiResponse<AssessmentGroup[]>> => {
      const groups = await groupService.getAll();

      // Transform to API format
      const apiGroups = groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description || undefined,
        machineIds: [], // Will be populated if needed
        machineCount: g.machineCount,
        status: g.status as 'created' | 'assessing' | 'assessed' | 'replicating',
        lastAssessmentId: undefined,
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.updatedAt.toISOString(),
      }));

      return {
        success: true,
        data: apiGroups,
      };
    }
  );

  // Create a new group
  fastify.post<{ Body: CreateGroupInput }>(
    '/',
    {
      schema: {
        tags: ['Groups'],
        summary: 'Create a new assessment group',
        body: {
          type: 'object',
          required: ['name', 'machineIds'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            description: { type: 'string', maxLength: 500 },
            machineIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<AssessmentGroup>> => {
      const group = await groupService.create(request.body);

      return {
        success: true,
        data: {
          id: group.id,
          name: group.name,
          description: group.description || undefined,
          machineIds: request.body.machineIds,
          machineCount: group.machineCount,
          status: group.status as 'created' | 'assessing' | 'assessed' | 'replicating',
          createdAt: group.createdAt.toISOString(),
          updatedAt: group.updatedAt.toISOString(),
        },
      };
    }
  );

  // Get group by ID
  fastify.get<{ Params: { groupId: string } }>(
    '/:groupId',
    {
      schema: {
        tags: ['Groups'],
        summary: 'Get assessment group details',
        params: {
          type: 'object',
          properties: {
            groupId: { type: 'string' },
          },
          required: ['groupId'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<AssessmentGroup>> => {
      const group = await groupService.getById(request.params.groupId);

      if (!group) {
        reply.code(404);
        return {
          success: false,
          error: {
            code: 'GROUP_NOT_FOUND',
            message: `Group ${request.params.groupId} not found`,
          },
        };
      }

      const machines = await groupService.getGroupMachines(group.id);

      return {
        success: true,
        data: {
          id: group.id,
          name: group.name,
          description: group.description || undefined,
          machineIds: machines.map((m) => m.id),
          machineCount: group.machineCount,
          status: group.status as 'created' | 'assessing' | 'assessed' | 'replicating',
          createdAt: group.createdAt.toISOString(),
          updatedAt: group.updatedAt.toISOString(),
        },
      };
    }
  );

  // Update group
  fastify.put<{ Params: { groupId: string }; Body: UpdateGroupInput }>(
    '/:groupId',
    {
      schema: {
        tags: ['Groups'],
        summary: 'Update assessment group',
        params: {
          type: 'object',
          properties: {
            groupId: { type: 'string' },
          },
          required: ['groupId'],
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            description: { type: 'string', maxLength: 500 },
            machineIds: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply): Promise<ApiResponse<AssessmentGroup>> => {
      const existing = await groupService.getById(request.params.groupId);

      if (!existing) {
        reply.code(404);
        return {
          success: false,
          error: {
            code: 'GROUP_NOT_FOUND',
            message: `Group ${request.params.groupId} not found`,
          },
        };
      }

      const group = await groupService.update(request.params.groupId, request.body);

      return {
        success: true,
        data: {
          id: group.id,
          name: group.name,
          description: group.description || undefined,
          machineIds: request.body.machineIds || [],
          machineCount: group.machineCount,
          status: group.status as 'created' | 'assessing' | 'assessed' | 'replicating',
          createdAt: group.createdAt.toISOString(),
          updatedAt: group.updatedAt.toISOString(),
        },
      };
    }
  );

  // Delete group
  fastify.delete<{ Params: { groupId: string } }>(
    '/:groupId',
    {
      schema: {
        tags: ['Groups'],
        summary: 'Delete assessment group',
        params: {
          type: 'object',
          properties: {
            groupId: { type: 'string' },
          },
          required: ['groupId'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<{ deleted: boolean }>> => {
      const exists = await groupService.getById(request.params.groupId);

      if (!exists) {
        reply.code(404);
        return {
          success: false,
          error: {
            code: 'GROUP_NOT_FOUND',
            message: `Group ${request.params.groupId} not found`,
          },
        };
      }

      await groupService.delete(request.params.groupId);

      return {
        success: true,
        data: { deleted: true },
      };
    }
  );

  // Get group machines
  fastify.get<{ Params: { groupId: string } }>(
    '/:groupId/machines',
    {
      schema: {
        tags: ['Groups'],
        summary: 'Get machines in an assessment group',
        params: {
          type: 'object',
          properties: {
            groupId: { type: 'string' },
          },
          required: ['groupId'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<Array<{
      id: string;
      displayName: string;
      operatingSystem: string | null;
      ipAddresses: string[];
      type: 'discovered' | 'external';
      azureMigrateId: string | null;
    }>>> => {
      const group = await groupService.getById(request.params.groupId);

      if (!group) {
        reply.code(404);
        return {
          success: false,
          error: {
            code: 'GROUP_NOT_FOUND',
            message: `Group ${request.params.groupId} not found`,
          },
        };
      }

      const machines = await groupService.getGroupMachines(group.id);

      return {
        success: true,
        data: machines.map((m) => ({
          id: m.id,
          displayName: m.displayName,
          operatingSystem: m.operatingSystem,
          ipAddresses: m.ipAddresses,
          type: m.type,
          azureMigrateId: m.azureMigrateId || null,
        })),
      };
    }
  );

  // Get group stats
  fastify.get(
    '/stats/counts',
    {
      schema: {
        tags: ['Groups'],
        summary: 'Get group counts by status',
      },
    },
    async (): Promise<ApiResponse<Record<string, number>>> => {
      const counts = await groupService.getCounts();
      return {
        success: true,
        data: counts,
      };
    }
  );
};
