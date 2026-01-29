import { FastifyPluginAsync } from 'fastify';
import { azureConfigService, type AzureConfigInput } from '../services/azure-config.service.js';
import { azureMigrateService } from '../services/azure-migrate.service.js';
import { activityService } from '../services/activity.service.js';
import { groupService } from '../services/group.service.js';
import type { ApiResponse } from '@drmigrate/shared-types';

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  // Get setup status - lightweight endpoint for checking if initial setup is complete
  fastify.get(
    '/setup-status',
    {
      schema: {
        tags: ['Settings'],
        summary: 'Check if initial setup is complete',
        description: 'Returns configuration status and missing fields for the setup wizard',
      },
    },
    async (): Promise<ApiResponse<{ isConfigured: boolean; missingFields: string[]; completedAt: string | null }>> => {
      const status = await azureConfigService.getSetupStatus();
      return {
        success: true,
        data: status,
      };
    }
  );

  // Complete setup - marks setup as done
  fastify.post(
    '/setup-complete',
    {
      schema: {
        tags: ['Settings'],
        summary: 'Mark initial setup as complete',
        description: 'Called when user finishes the setup wizard',
      },
    },
    async (_, reply): Promise<ApiResponse<{ completedAt: string }>> => {
      try {
        // First verify configuration is valid
        const status = await azureConfigService.getSetupStatus();
        if (status.missingFields.length > 0) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: 'INCOMPLETE_SETUP',
              message: `Missing required fields: ${status.missingFields.join(', ')}`,
            },
          };
        }

        const config = await azureConfigService.completeSetup();
        
        // Log activity
        await activityService.log({
          type: 'system',
          action: 'completed',
          title: 'Initial setup completed',
          description: 'Azure configuration has been set up successfully',
          status: 'success',
          entityType: 'config',
          entityId: 'default',
        });

        return {
          success: true,
          data: {
            completedAt: config.setupCompletedAt?.toISOString() ?? new Date().toISOString(),
          },
        };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'SETUP_ERROR',
            message: error instanceof Error ? error.message : 'Failed to complete setup',
          },
        };
      }
    }
  );

  // Reset setup - clears setupCompletedAt to allow re-running the wizard
  fastify.post(
    '/reset-setup',
    {
      schema: {
        tags: ['Settings'],
        summary: 'Reset initial setup status',
        description: 'Clears the setup completion status, allowing the setup wizard to run again',
      },
    },
    async (): Promise<ApiResponse<{ reset: boolean }>> => {
      await azureConfigService.resetSetup();
      
      // Log activity
      await activityService.log({
        type: 'system',
        action: 'reset',
        title: 'Setup configuration reset',
        description: 'Initial setup status has been cleared. Setup wizard will run on next visit.',
        status: 'info',
        entityType: 'config',
        entityId: 'default',
      });

      return {
        success: true,
        data: {
          reset: true,
        },
      };
    }
  );

  // Get Azure configuration
  fastify.get(
    '/azure',
    {
      schema: {
        tags: ['Settings'],
        summary: 'Get Azure configuration',
      },
    },
    async (): Promise<ApiResponse<unknown>> => {
      const config = await azureConfigService.getPublicConfig();
      return {
        success: true,
        data: config || {
          isConfigured: false,
          location: 'eastus',
        },
      };
    }
  );

  // Save Azure configuration
  fastify.post<{ Body: AzureConfigInput }>(
    '/azure',
    {
      schema: {
        tags: ['Settings'],
        summary: 'Save Azure configuration',
        body: {
          type: 'object',
          properties: {
            tenantId: { type: 'string' },
            clientId: { type: 'string' },
            clientSecret: { type: 'string' },
            subscriptionId: { type: 'string' },
            resourceGroup: { type: 'string' },
            migrateProjectName: { type: 'string' },
            location: { type: 'string' },
            vaultName: { type: 'string' },
            vaultResourceGroup: { type: 'string' },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<unknown>> => {
      const config = await azureConfigService.saveConfig(request.body);

      // Return without sensitive data
      const { clientSecret, ...publicConfig } = config;
      return {
        success: true,
        data: {
          ...publicConfig,
          clientSecret: clientSecret ? '••••••••' : undefined,
        },
      };
    }
  );

  // Test Azure connection
  fastify.post(
    '/azure/test',
    {
      schema: {
        tags: ['Settings'],
        summary: 'Test Azure connection',
      },
    },
    async (): Promise<ApiResponse<{ success: boolean; message: string; details?: unknown }>> => {
      const result = await azureMigrateService.testConnection();
      return {
        success: result.success,
        data: result,
      };
    }
  );

  // Get Azure Migrate sites
  fastify.get(
    '/azure/sites',
    {
      schema: {
        tags: ['Settings'],
        summary: 'Get Azure Migrate VMware sites',
      },
    },
    async (_, reply): Promise<ApiResponse<unknown[]>> => {
      try {
        const sites = await azureMigrateService.getSites();
        return {
          success: true,
          data: sites,
        };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'AZURE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get sites',
          },
        };
      }
    }
  );

  // Sync machines from Azure Migrate
  fastify.post(
    '/azure/sync',
    {
      schema: {
        tags: ['Settings'],
        summary: 'Sync machines from Azure Migrate',
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

  // Get recent activity (for dashboard)
  fastify.get<{
    Querystring: { limit?: number };
  }>(
    '/activity',
    {
      schema: {
        tags: ['Settings'],
        summary: 'Get recent activity log',
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', default: 10 },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<unknown[]>> => {
      const limit = request.query.limit || 10;
      const activities = await activityService.getRecent(limit);

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

  // Diagnostic: List Azure resources
  fastify.get(
    '/azure/resources',
    {
      schema: {
        tags: ['Settings'],
        summary: 'List Azure resources in resource group (diagnostic)',
      },
    },
    async (_, reply): Promise<ApiResponse<unknown[]>> => {
      try {
        const resources = await azureMigrateService.listResources();
        return {
          success: true,
          data: resources,
        };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'AZURE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to list resources',
          },
        };
      }
    }
  );

  // Get Azure Migrate groups
  fastify.get(
    '/azure/groups',
    {
      schema: {
        tags: ['Settings'],
        summary: 'Get groups from Azure Migrate assessment project',
      },
    },
    async (_, reply): Promise<ApiResponse<unknown[]>> => {
      try {
        const groups = await azureMigrateService.getAzureGroups();
        return {
          success: true,
          data: groups.map(g => ({
            id: g.id,
            name: g.name,
            machineCount: g.properties.machineCount || 0,
            createdAt: g.properties.createdTimestamp,
            updatedAt: g.properties.updatedTimestamp,
            areAssessmentsRunning: g.properties.areAssessmentsRunning,
            source: 'azure-migrate',
          })),
        };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'AZURE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch Azure groups',
          },
        };
      }
    }
  );

  // Get Azure Migrate assessments
  fastify.get(
    '/azure/assessments',
    {
      schema: {
        tags: ['Settings'],
        summary: 'Get assessments from Azure Migrate',
      },
    },
    async (_, reply): Promise<ApiResponse<unknown[]>> => {
      try {
        const assessments = await azureMigrateService.getAzureAssessments();
        return {
          success: true,
          data: assessments.map(a => ({
            id: a.id,
            name: a.name,
            type: a.type,
            groupName: a.groupName,
            status: a.properties.status || 'Ready',
            azureLocation: a.properties.azureLocation,
            sizingCriterion: a.properties.sizingCriterion,
            createdAt: a.properties.createdTimestamp,
            updatedAt: a.properties.updatedTimestamp,
            monthlyComputeCost: a.properties.monthlyComputeCost,
            monthlyStorageCost: a.properties.monthlyStorageCost,
            monthlyBandwidthCost: a.properties.monthlyBandwidthCost,
            numberOfMachines: a.properties.numberOfMachines,
            source: 'azure-migrate',
          })),
        };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'AZURE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch Azure assessments',
          },
        };
      }
    }
  );

  // Get assessment options
  fastify.get(
    '/azure/assessment-options',
    {
      schema: {
        tags: ['Settings'],
        summary: 'Get available assessment options from Azure Migrate',
      },
    },
    async (_, reply): Promise<ApiResponse<unknown>> => {
      try {
        const options = await azureMigrateService.listAssessmentOptions();
        return {
          success: true,
          data: options,
        };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'AZURE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch assessment options',
          },
        };
      }
    }
  );

  // Diagnostic: Explore assessment project structure
  fastify.get(
    '/azure/explore',
    {
      schema: {
        tags: ['Settings'],
        summary: 'Explore Azure Migrate project structure (diagnostic)',
      },
    },
    async (_, reply): Promise<ApiResponse<unknown>> => {
      try {
        const exploration = await azureMigrateService.exploreAssessmentProject();
        return {
          success: true,
          data: exploration,
        };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'AZURE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to explore project',
          },
        };
      }
    }
  );

  // Get assessment details
  fastify.get<{ Params: { assessmentId: string } }>(
    '/azure/assessments/:assessmentId',
    {
      schema: {
        tags: ['Settings'],
        summary: 'Get detailed assessment information',
        params: {
          type: 'object',
          properties: {
            assessmentId: { type: 'string' },
          },
          required: ['assessmentId'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<unknown>> => {
      try {
        // The assessmentId is base64 encoded to handle slashes in the ID
        const assessmentId = Buffer.from(request.params.assessmentId, 'base64').toString('utf-8');
        const details = await azureMigrateService.getAssessmentDetails(assessmentId);
        
        if (!details) {
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
          data: details,
        };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'AZURE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get assessment details',
          },
        };
      }
    }
  );

  // Get all assessment machines with readiness data
  fastify.get(
    '/azure/assessment-machines',
    {
      schema: {
        tags: ['Settings'],
        summary: 'Get all machines from assessment project with readiness data',
      },
    },
    async (_, reply): Promise<ApiResponse<unknown[]>> => {
      try {
        const machines = await azureMigrateService.getAssessmentMachines();
        return {
          success: true,
          data: machines,
        };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'AZURE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get assessment machines',
          },
        };
      }
    }
  );

  // Create assessment on Azure Migrate
  fastify.post<{
    Body: {
      groupId: string;
      assessmentName: string;
      azureLocation: string;
      assessmentType?: string;
    };
  }>(
    '/azure/assessments',
    {
      schema: {
        tags: ['Settings'],
        summary: 'Create an assessment on Azure Migrate',
        body: {
          type: 'object',
          required: ['groupId', 'assessmentName', 'azureLocation'],
          properties: {
            groupId: { type: 'string' },
            assessmentName: { type: 'string' },
            azureLocation: { type: 'string' },
            assessmentType: { type: 'string' },
          },
        },
      },
    },
    async (request, reply): Promise<ApiResponse<unknown>> => {
      try {
        // Get group details from local database
        const { groupId, assessmentName, azureLocation } = request.body;
        const group = await groupService.getById(groupId);
        
        if (!group) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: 'GROUP_NOT_FOUND',
              message: `Group ${groupId} not found`,
            },
          };
        }

        // Get machines in the group
        const machines = await groupService.getGroupMachines(groupId);
        const azureMachineIds = machines
          .filter(m => m.azureMigrateId)
          .map(m => m.azureMigrateId as string);

        // Get Azure Portal link for running the assessment
        let portalLink: string | undefined;
        try {
          portalLink = await azureMigrateService.getAzurePortalAssessmentLink();
        } catch {
          // Continue without portal link
        }

        // Create local assessment record
        const { assessmentService } = await import('../services/assessment.service.js');
        const localAssessment = await assessmentService.create({
          groupId,
          name: assessmentName,
          azureLocation,
          status: 'Created',
        });

        // Update group status
        await groupService.update(groupId, { status: 'assessing' });

        // Log activity
        await activityService.log({
          type: 'assessment',
          action: 'created',
          title: `Created assessment "${assessmentName}"`,
          description: `Group: ${group.name}, Machines: ${machines.length}`,
          status: 'success',
          entityType: 'assessment',
          entityId: localAssessment.id,
          metadata: { groupId, assessmentName, azureLocation },
        });

        return {
          success: true,
          data: {
            assessmentId: localAssessment.id,
            status: localAssessment.status,
            machineCount: machines.length,
            azureMachineCount: azureMachineIds.length,
            portalLink,
            message: azureMachineIds.length > 0 
              ? 'Assessment created. Run the assessment in Azure Portal to get detailed analysis.'
              : 'Assessment created with local machines only.',
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to create assessment';
        
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'ASSESSMENT_FAILED',
            message: errorMessage,
          },
        };
      }
    }
  );

  // Get Azure Portal link for creating assessments
  fastify.get(
    '/azure/portal-link',
    {
      schema: {
        tags: ['Settings'],
        summary: 'Get link to Azure Migrate in Azure Portal',
      },
    },
    async (_, reply): Promise<ApiResponse<{ portalLink: string }>> => {
      try {
        const portalLink = await azureMigrateService.getAzurePortalAssessmentLink();
        return {
          success: true,
          data: { portalLink },
        };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'AZURE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get portal link',
          },
        };
      }
    }
  );
};
