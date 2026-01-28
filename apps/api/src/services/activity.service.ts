import prisma from '../lib/db.js';
import type { ActivityLog } from '@prisma/client';

export interface CreateActivityInput {
  type: 'assessment' | 'replication' | 'import' | 'discovery' | 'config';
  action: string;
  title: string;
  description?: string;
  status?: 'success' | 'warning' | 'error' | 'info';
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export const activityService = {
  /**
   * Log an activity
   */
  async log(input: CreateActivityInput): Promise<ActivityLog> {
    return prisma.activityLog.create({
      data: {
        type: input.type,
        action: input.action,
        title: input.title,
        description: input.description,
        status: input.status || 'info',
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      },
    });
  },

  /**
   * Get recent activity
   */
  async getRecent(limit = 20): Promise<ActivityLog[]> {
    return prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },

  /**
   * Get activity by type
   */
  async getByType(type: string, limit = 50): Promise<ActivityLog[]> {
    return prisma.activityLog.findMany({
      where: { type },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },
};

