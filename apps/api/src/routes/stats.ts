import { FastifyPluginAsync } from 'fastify';
import { statisticsService } from '../services/statistics.service.js';
import type { ApiResponse } from '@drmigrate/shared-types';

export const statsRoutes: FastifyPluginAsync = async (fastify) => {
  // Get overview statistics
  fastify.get(
    '/overview',
    {
      schema: {
        tags: ['Statistics'],
        summary: 'Get overview statistics for the dashboard',
      },
    },
    async (): Promise<ApiResponse<unknown>> => {
      const stats = await statisticsService.getOverviewStats();
      return {
        success: true,
        data: stats,
      };
    }
  );

  // Get machine counts by source
  fastify.get(
    '/counts',
    {
      schema: {
        tags: ['Statistics'],
        summary: 'Get machine counts by source',
      },
    },
    async (): Promise<ApiResponse<unknown>> => {
      const counts = await statisticsService.getSourceCounts();
      return {
        success: true,
        data: counts,
      };
    }
  );

  // Get detailed matching statistics
  fastify.get(
    '/matching',
    {
      schema: {
        tags: ['Statistics'],
        summary: 'Get detailed machine matching statistics',
      },
    },
    async (): Promise<ApiResponse<unknown>> => {
      const stats = await statisticsService.getMatchingStats();
      return {
        success: true,
        data: stats,
      };
    }
  );

  // Get machine breakdown by categories
  fastify.get(
    '/breakdown',
    {
      schema: {
        tags: ['Statistics'],
        summary: 'Get machine breakdown by OS, wave, and environment',
      },
    },
    async (): Promise<ApiResponse<unknown>> => {
      const breakdown = await statisticsService.getMachineBreakdown();
      return {
        success: true,
        data: breakdown,
      };
    }
  );
};
