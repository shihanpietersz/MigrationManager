import { FastifyPluginAsync } from 'fastify';
import { activityService } from '../services/activity.service.js';
import type { ApiResponse } from '@drmigrate/shared-types';

interface Activity {
  id: string;
  type: string;
  action: string;
  title: string;
  description?: string;
  status: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export const activityRoutes: FastifyPluginAsync = async (fastify) => {
  // Get recent activity
  fastify.get<{
    Querystring: {
      limit?: number;
      type?: string;
    };
  }>(
    '/',
    {
      schema: {
        tags: ['Activity'],
        summary: 'Get recent activity log',
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', default: 20, maximum: 100 },
            type: { type: 'string' },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<Activity[]>> => {
      const limit = request.query.limit || 20;
      const type = request.query.type;

      const activities = type
        ? await activityService.getByType(type, limit)
        : await activityService.getRecent(limit);

      return {
        success: true,
        data: activities.map((a) => ({
          id: a.id,
          type: a.type,
          action: a.action,
          title: a.title,
          description: a.description || undefined,
          status: a.status,
          entityType: a.entityType || undefined,
          entityId: a.entityId || undefined,
          metadata: a.metadata ? JSON.parse(a.metadata) : undefined,
          createdAt: a.createdAt.toISOString(),
        })),
      };
    }
  );
};

