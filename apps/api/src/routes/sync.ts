import { FastifyPluginAsync } from 'fastify';
import { syncSchedulerService, VALID_INTERVALS, SyncInterval } from '../services/sync-scheduler.service.js';
import { SourceType } from '../services/connection-health.service.js';
import type { ApiResponse } from '@drmigrate/shared-types';

export const syncRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all sync schedules
  fastify.get(
    '/schedules',
    {
      schema: {
        tags: ['Sync'],
        summary: 'Get sync schedules for all data sources',
      },
    },
    async (): Promise<ApiResponse<Record<string, unknown>>> => {
      const schedules = await syncSchedulerService.getAllSchedules();
      return {
        success: true,
        data: schedules,
      };
    }
  );

  // Get sync schedule for a specific source
  fastify.get<{
    Params: { sourceType: string };
  }>(
    '/schedule/:sourceType',
    {
      schema: {
        tags: ['Sync'],
        summary: 'Get sync schedule for a specific data source',
        params: {
          type: 'object',
          properties: {
            sourceType: { type: 'string', enum: ['azure-migrate', 'drmigrate'] },
          },
          required: ['sourceType'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<unknown>> => {
      const { sourceType } = request.params;
      
      if (sourceType !== 'azure-migrate' && sourceType !== 'drmigrate') {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'INVALID_SOURCE_TYPE',
            message: 'Invalid source type. Must be "azure-migrate" or "drmigrate"',
          },
        };
      }

      const schedule = await syncSchedulerService.getSchedule(sourceType as SourceType);
      return {
        success: true,
        data: schedule,
      };
    }
  );

  // Update sync schedule for a specific source
  fastify.put<{
    Params: { sourceType: string };
    Body: {
      enabled: boolean;
      intervalMinutes?: number;
    };
  }>(
    '/schedule/:sourceType',
    {
      schema: {
        tags: ['Sync'],
        summary: 'Update sync schedule for a data source',
        params: {
          type: 'object',
          properties: {
            sourceType: { type: 'string', enum: ['azure-migrate', 'drmigrate'] },
          },
          required: ['sourceType'],
        },
        body: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            intervalMinutes: { 
              type: 'number', 
              enum: VALID_INTERVALS as unknown as number[],
            },
          },
          required: ['enabled'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<unknown>> => {
      const { sourceType } = request.params;
      const { enabled, intervalMinutes } = request.body;
      
      if (sourceType !== 'azure-migrate' && sourceType !== 'drmigrate') {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'INVALID_SOURCE_TYPE',
            message: 'Invalid source type. Must be "azure-migrate" or "drmigrate"',
          },
        };
      }

      // Validate interval if provided
      if (intervalMinutes && !VALID_INTERVALS.includes(intervalMinutes as SyncInterval)) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'INVALID_INTERVAL',
            message: `Invalid interval. Must be one of: ${VALID_INTERVALS.join(', ')}`,
          },
        };
      }

      const schedule = await syncSchedulerService.updateSchedule(
        sourceType as SourceType,
        enabled,
        intervalMinutes as SyncInterval | undefined
      );
      return {
        success: true,
        data: schedule,
      };
    }
  );

  // Trigger manual sync for a specific source
  fastify.post<{
    Params: { sourceType: string };
  }>(
    '/trigger/:sourceType',
    {
      schema: {
        tags: ['Sync'],
        summary: 'Trigger an immediate sync for a data source',
        params: {
          type: 'object',
          properties: {
            sourceType: { type: 'string', enum: ['azure-migrate', 'drmigrate'] },
          },
          required: ['sourceType'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<unknown>> => {
      const { sourceType } = request.params;
      
      if (sourceType !== 'azure-migrate' && sourceType !== 'drmigrate') {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'INVALID_SOURCE_TYPE',
            message: 'Invalid source type. Must be "azure-migrate" or "drmigrate"',
          },
        };
      }

      const result = await syncSchedulerService.triggerSync(sourceType as SourceType);
      return {
        success: true,
        data: result,
      };
    }
  );

  // Get available sync intervals
  fastify.get(
    '/intervals',
    {
      schema: {
        tags: ['Sync'],
        summary: 'Get available sync interval options',
      },
    },
    async (): Promise<ApiResponse<{ intervals: Array<{ value: number; label: string }> }>> => {
      return {
        success: true,
        data: {
          intervals: [
            { value: 15, label: 'Every 15 minutes' },
            { value: 30, label: 'Every 30 minutes' },
            { value: 60, label: 'Every 1 hour' },
            { value: 360, label: 'Every 6 hours' },
            { value: 1440, label: 'Every 24 hours' },
          ],
        },
      };
    }
  );
};
