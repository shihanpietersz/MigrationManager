import { FastifyPluginAsync } from 'fastify';
import { connectionHealthService, SourceType } from '../services/connection-health.service.js';
import type { ApiResponse } from '@drmigrate/shared-types';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // Basic API health check
  fastify.get(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: 'Health check endpoint',
      },
    },
    async () => {
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        services: {
          api: 'up',
          azure: 'pending',
          database: 'pending',
        },
      };
    }
  );

  // Readiness check
  fastify.get(
    '/ready',
    {
      schema: {
        tags: ['Health'],
        summary: 'Readiness check endpoint',
      },
    },
    async () => {
      return { ready: true };
    }
  );

  // Get connection health for all data sources
  fastify.get(
    '/health/connections',
    {
      schema: {
        tags: ['Health'],
        summary: 'Get connection health status for all data sources',
      },
    },
    async (): Promise<ApiResponse<Record<string, unknown>>> => {
      const health = await connectionHealthService.getAllHealth();
      return {
        success: true,
        data: health,
      };
    }
  );

  // Get connection health for a specific source
  fastify.get<{
    Params: { sourceType: string };
  }>(
    '/health/connections/:sourceType',
    {
      schema: {
        tags: ['Health'],
        summary: 'Get connection health status for a specific data source',
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

      const health = await connectionHealthService.getHealth(sourceType as SourceType);
      return {
        success: true,
        data: health,
      };
    }
  );

  // Trigger a health check for a specific source
  fastify.post<{
    Params: { sourceType: string };
  }>(
    '/health/check/:sourceType',
    {
      schema: {
        tags: ['Health'],
        summary: 'Trigger an immediate health check for a data source',
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

      const result = await connectionHealthService.checkHealth(sourceType as SourceType);
      
      return {
        success: true,
        data: {
          sourceType: result.sourceType,
          status: result.status,
          lastCheckAt: result.lastCheckAt.toISOString(),
          machineCount: result.machineCount,
          responseTimeMs: result.responseTimeMs,
          error: result.error,
        },
      };
    }
  );

  // Trigger health check for all sources
  fastify.post(
    '/health/check-all',
    {
      schema: {
        tags: ['Health'],
        summary: 'Trigger health checks for all data sources',
      },
    },
    async (): Promise<ApiResponse<unknown[]>> => {
      const results = await connectionHealthService.checkAllHealth();
      
      return {
        success: true,
        data: results.map(result => ({
          sourceType: result.sourceType,
          status: result.status,
          lastCheckAt: result.lastCheckAt.toISOString(),
          machineCount: result.machineCount,
          responseTimeMs: result.responseTimeMs,
          error: result.error,
        })),
      };
    }
  );
};

