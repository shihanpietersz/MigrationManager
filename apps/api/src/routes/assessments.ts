import { FastifyPluginAsync } from 'fastify';
import { assessmentService } from '../services/assessment.service.js';
import type { ApiResponse } from '@drmigrate/shared-types';

export const assessmentRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all local assessments
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Assessments'],
        summary: 'Get all local assessments',
      },
    },
    async (): Promise<ApiResponse<unknown[]>> => {
      const assessments = await assessmentService.getAll();
      return {
        success: true,
        data: assessments.map((a) => ({
          id: a.id,
          name: a.name,
          groupId: a.groupId,
          groupName: (a as unknown as { group?: { name: string } }).group?.name,
          status: a.status,
          azureLocation: a.azureLocation,
          azureAssessmentId: a.azureAssessmentId,
          createdAt: a.createdAt.toISOString(),
          updatedAt: a.updatedAt.toISOString(),
          completedAt: a.completedAt?.toISOString(),
          source: 'local',
        })),
      };
    }
  );

  // Get assessment by ID
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        tags: ['Assessments'],
        summary: 'Get assessment by ID',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<unknown>> => {
      const assessment = await assessmentService.getById(request.params.id);
      
      if (!assessment) {
        reply.code(404);
        return {
          success: false,
          error: {
            code: 'ASSESSMENT_NOT_FOUND',
            message: 'Assessment not found',
          },
        };
      }

      return {
        success: true,
        data: {
          id: assessment.id,
          name: assessment.name,
          groupId: assessment.groupId,
          groupName: (assessment as unknown as { group?: { name: string } }).group?.name,
          status: assessment.status,
          azureLocation: assessment.azureLocation,
          azureAssessmentId: assessment.azureAssessmentId,
          currency: assessment.currency,
          sizingCriterion: assessment.sizingCriterion,
          reservedInstance: assessment.reservedInstance,
          createdAt: assessment.createdAt.toISOString(),
          updatedAt: assessment.updatedAt.toISOString(),
          completedAt: assessment.completedAt?.toISOString(),
          results: (assessment as unknown as { results?: unknown[] }).results || [],
        },
      };
    }
  );

  // Delete assessment
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        tags: ['Assessments'],
        summary: 'Delete assessment',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<{ deleted: boolean }>> => {
      try {
        await assessmentService.delete(request.params.id);
        return {
          success: true,
          data: { deleted: true },
        };
      } catch (error) {
        reply.code(404);
        return {
          success: false,
          error: {
            code: 'ASSESSMENT_NOT_FOUND',
            message: 'Assessment not found',
          },
        };
      }
    }
  );

  // Get assessment counts
  fastify.get(
    '/stats/counts',
    {
      schema: {
        tags: ['Assessments'],
        summary: 'Get assessment counts by status',
      },
    },
    async (): Promise<ApiResponse<Record<string, number>>> => {
      const counts = await assessmentService.getCounts();
      return {
        success: true,
        data: counts,
      };
    }
  );
};
