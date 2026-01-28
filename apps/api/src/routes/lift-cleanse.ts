/**
 * Lift and Cleanse API Routes
 * Post-migration VM management and script execution
 */

import { FastifyInstance } from 'fastify';
import { scriptService, executionService, scriptSecurityService } from '../services/lift-cleanse/index.js';
import { validationTestService } from '../services/lift-cleanse/validation-test.service.js';
import { azureVMService } from '../services/azure-vm.service.js';

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export async function liftCleanseRoutes(fastify: FastifyInstance) {
  // =============================================
  // SCRIPTS
  // =============================================

  // List all scripts
  fastify.get<{
    Querystring: {
      category?: string;
      scriptType?: string;
      targetOs?: string;
      isBuiltIn?: string;
      search?: string;
    };
  }>(
    '/scripts',
    {
      schema: {
        tags: ['Lift & Cleanse'],
        summary: 'List all scripts',
        querystring: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            scriptType: { type: 'string' },
            targetOs: { type: 'string' },
            isBuiltIn: { type: 'string' },
            search: { type: 'string' },
          },
        },
      },
    },
    async (request): Promise<ApiResponse> => {
      const { isBuiltIn, ...filters } = request.query;
      const scripts = await scriptService.list({
        ...filters,
        isBuiltIn: isBuiltIn === 'true' ? true : isBuiltIn === 'false' ? false : undefined,
      });
      return { success: true, data: scripts };
    }
  );

  // Get script by ID
  fastify.get<{ Params: { id: string } }>(
    '/scripts/:id',
    {
      schema: {
        tags: ['Lift & Cleanse'],
        summary: 'Get script details',
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      const script = await scriptService.getById(request.params.id);
      if (!script) {
        reply.code(404);
        return { success: false, error: { code: 'NOT_FOUND', message: 'Script not found' } };
      }
      return { success: true, data: script };
    }
  );

  // Create script
  fastify.post<{
    Body: {
      name: string;
      description?: string;
      content: string;
      scriptType: 'powershell' | 'bash';
      targetOs: 'windows' | 'linux' | 'both';
      category: 'cleanup' | 'install' | 'configure' | 'diagnostic' | 'custom';
      tags?: string[];
      parameters?: Array<{ key: string; description: string; required: boolean }>;
      timeout?: number;
      runAsAdmin?: boolean;
      isShared?: boolean;
    };
  }>(
    '/scripts',
    {
      schema: {
        tags: ['Lift & Cleanse'],
        summary: 'Create a new script',
        body: {
          type: 'object',
          required: ['name', 'content', 'scriptType', 'targetOs', 'category'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            content: { type: 'string' },
            scriptType: { type: 'string', enum: ['powershell', 'bash'] },
            targetOs: { type: 'string', enum: ['windows', 'linux', 'both'] },
            category: { type: 'string', enum: ['cleanup', 'install', 'configure', 'diagnostic', 'custom'] },
            tags: { type: 'array', items: { type: 'string' } },
            parameters: { type: 'array' },
            timeout: { type: 'number' },
            runAsAdmin: { type: 'boolean' },
            isShared: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        const result = await scriptService.create(request.body);
        return { success: true, data: result };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: { code: 'CREATE_FAILED', message: error instanceof Error ? error.message : 'Failed to create script' },
        };
      }
    }
  );

  // Update script
  fastify.put<{
    Params: { id: string };
    Body: {
      name?: string;
      description?: string;
      content?: string;
      tags?: string[];
      parameters?: Array<{ key: string; description: string; required: boolean }>;
      timeout?: number;
      runAsAdmin?: boolean;
      isShared?: boolean;
    };
  }>(
    '/scripts/:id',
    {
      schema: {
        tags: ['Lift & Cleanse'],
        summary: 'Update a script',
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        const result = await scriptService.update(request.params.id, request.body);
        return { success: true, data: result };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: { code: 'UPDATE_FAILED', message: error instanceof Error ? error.message : 'Failed to update script' },
        };
      }
    }
  );

  // Delete script
  fastify.delete<{ Params: { id: string } }>(
    '/scripts/:id',
    {
      schema: {
        tags: ['Lift & Cleanse'],
        summary: 'Delete a script',
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        await scriptService.delete(request.params.id);
        return { success: true, data: { deleted: true } };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: { code: 'DELETE_FAILED', message: error instanceof Error ? error.message : 'Failed to delete script' },
        };
      }
    }
  );

  // Duplicate script
  fastify.post<{ Params: { id: string }; Body: { name?: string } }>(
    '/scripts/:id/duplicate',
    {
      schema: {
        tags: ['Lift & Cleanse'],
        summary: 'Duplicate a script',
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        const result = await scriptService.duplicate(request.params.id, request.body.name);
        return { success: true, data: result };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: { code: 'DUPLICATE_FAILED', message: error instanceof Error ? error.message : 'Failed to duplicate script' },
        };
      }
    }
  );

  // Validate script content
  fastify.post<{
    Body: {
      content: string;
      scriptType: 'powershell' | 'bash';
    };
  }>(
    '/scripts/validate',
    {
      schema: {
        tags: ['Lift & Cleanse'],
        summary: 'Validate script for security issues',
        body: {
          type: 'object',
          required: ['content', 'scriptType'],
          properties: {
            content: { type: 'string' },
            scriptType: { type: 'string', enum: ['powershell', 'bash'] },
          },
        },
      },
    },
    async (request): Promise<ApiResponse> => {
      const result = await scriptSecurityService.scanScript(
        request.body.content,
        request.body.scriptType
      );
      return { success: true, data: result };
    }
  );

  // Share/unshare script
  fastify.post<{ Params: { id: string }; Body: { isShared: boolean } }>(
    '/scripts/:id/share',
    {
      schema: {
        tags: ['Lift & Cleanse'],
        summary: 'Share or unshare a script',
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        const result = await scriptService.setShared(request.params.id, request.body.isShared);
        return { success: true, data: result };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: { code: 'SHARE_FAILED', message: error instanceof Error ? error.message : 'Failed to update sharing' },
        };
      }
    }
  );

  // =============================================
  // EXECUTION
  // =============================================

  // Execute script
  fastify.post<{
    Body: {
      scriptId?: string;
      adHocScript?: string;
      adHocType?: 'powershell' | 'bash';
      targets: Array<{
        vmId: string;
        vmName: string;
        resourceGroup: string;
        subscriptionId: string;
        osType: 'windows' | 'linux';
      }>;
      parameters?: Record<string, string>;
      maxParallel?: number;
    };
  }>(
    '/execute',
    {
      schema: {
        tags: ['Lift & Cleanse'],
        summary: 'Execute a script on target VMs',
        body: {
          type: 'object',
          required: ['targets'],
          properties: {
            scriptId: { type: 'string' },
            adHocScript: { type: 'string' },
            adHocType: { type: 'string', enum: ['powershell', 'bash'] },
            targets: { type: 'array' },
            parameters: { type: 'object' },
            maxParallel: { type: 'number' },
          },
        },
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        const result = await executionService.execute(request.body);
        return { success: true, data: result };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: { code: 'EXECUTION_FAILED', message: error instanceof Error ? error.message : 'Failed to start execution' },
        };
      }
    }
  );

  // List executions
  fastify.get<{
    Querystring: {
      limit?: string;
      offset?: string;
      status?: string;
    };
  }>(
    '/executions',
    {
      schema: {
        tags: ['Lift & Cleanse'],
        summary: 'List script executions',
      },
    },
    async (request): Promise<ApiResponse> => {
      const { limit, offset, status } = request.query;
      const result = await executionService.list({
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined,
        status,
      });
      return { success: true, data: result };
    }
  );

  // Get execution status
  fastify.get<{ Params: { id: string } }>(
    '/executions/:id',
    {
      schema: {
        tags: ['Lift & Cleanse'],
        summary: 'Get execution status and details',
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      const status = await executionService.getStatus(request.params.id);
      if (!status) {
        reply.code(404);
        return { success: false, error: { code: 'NOT_FOUND', message: 'Execution not found' } };
      }
      return { success: true, data: status };
    }
  );

  // Get target output
  fastify.get<{ Params: { id: string; targetId: string } }>(
    '/executions/:id/targets/:targetId',
    {
      schema: {
        tags: ['Lift & Cleanse'],
        summary: 'Get execution output for a specific target',
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      const output = await executionService.getTargetOutput(request.params.targetId);
      if (!output) {
        reply.code(404);
        return { success: false, error: { code: 'NOT_FOUND', message: 'Target not found' } };
      }
      return { success: true, data: output };
    }
  );

  // Cancel execution
  fastify.post<{ Params: { id: string } }>(
    '/executions/:id/cancel',
    {
      schema: {
        tags: ['Lift & Cleanse'],
        summary: 'Cancel a running execution',
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      const cancelled = await executionService.cancel(request.params.id);
      if (!cancelled) {
        reply.code(400);
        return { success: false, error: { code: 'CANCEL_FAILED', message: 'Cannot cancel execution' } };
      }
      return { success: true, data: { cancelled: true } };
    }
  );

  // Retry failed targets
  fastify.post<{ Params: { id: string } }>(
    '/executions/:id/retry',
    {
      schema: {
        tags: ['Lift & Cleanse'],
        summary: 'Retry failed targets in an execution',
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        const result = await executionService.retryFailed(request.params.id);
        return { success: true, data: result };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: { code: 'RETRY_FAILED', message: error instanceof Error ? error.message : 'Failed to retry' },
        };
      }
    }
  );

  // =============================================
  // VMs
  // =============================================

  // List VMs
  fastify.get<{
    Querystring: {
      resourceGroup?: string;
    };
  }>(
    '/vms',
    {
      schema: {
        tags: ['Lift & Cleanse'],
        summary: 'List Azure VMs available for script execution',
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        const vms = await azureVMService.listVMs({
          resourceGroup: request.query.resourceGroup,
        });
        return { success: true, data: vms };
      } catch (error) {
        reply.code(500);
        return {
          success: false,
          error: { code: 'VM_LIST_FAILED', message: error instanceof Error ? error.message : 'Failed to list VMs' },
        };
      }
    }
  );

  // Get VM details
  fastify.get<{ Params: { vmId: string } }>(
    '/vms/:vmId',
    {
      schema: {
        tags: ['Lift & Cleanse'],
        summary: 'Get VM details',
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        // VM ID is base64 encoded in the URL
        const vmId = Buffer.from(request.params.vmId, 'base64').toString('utf-8');
        const vm = await azureVMService.getVM(vmId);
        if (!vm) {
          reply.code(404);
          return { success: false, error: { code: 'NOT_FOUND', message: 'VM not found' } };
        }
        return { success: true, data: vm };
      } catch (error) {
        reply.code(500);
        return {
          success: false,
          error: { code: 'VM_GET_FAILED', message: error instanceof Error ? error.message : 'Failed to get VM' },
        };
      }
    }
  );

  // Get all VM tags
  fastify.get(
    '/vms/tags',
    {
      schema: {
        tags: ['Lift & Cleanse'],
        summary: 'Get all unique VM tags',
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        const tags = await azureVMService.getAllTags();
        return { success: true, data: tags };
      } catch (error) {
        reply.code(500);
        return {
          success: false,
          error: { code: 'TAGS_FAILED', message: error instanceof Error ? error.message : 'Failed to get tags' },
        };
      }
    }
  );

  // Get resource groups with VMs
  fastify.get(
    '/vms/resource-groups',
    {
      schema: {
        tags: ['Lift & Cleanse'],
        summary: 'Get resource groups containing VMs',
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        const resourceGroups = await azureVMService.getResourceGroupsWithVMs();
        return { success: true, data: resourceGroups };
      } catch (error) {
        reply.code(500);
        return {
          success: false,
          error: { code: 'RG_FAILED', message: error instanceof Error ? error.message : 'Failed to get resource groups' },
        };
      }
    }
  );

  // =============================================
  // VALIDATION TESTS
  // =============================================

  // List all validation test definitions
  fastify.get<{
    Querystring: {
      category?: string;
      targetOs?: string;
      isBuiltIn?: string;
      search?: string;
    };
  }>(
    '/tests',
    {
      schema: {
        tags: ['Validation Tests'],
        summary: 'List all validation test definitions',
        querystring: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            targetOs: { type: 'string' },
            isBuiltIn: { type: 'string' },
            search: { type: 'string' },
          },
        },
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        const tests = await validationTestService.listTests({
          ...request.query,
          isBuiltIn: request.query.isBuiltIn === 'true' ? true : request.query.isBuiltIn === 'false' ? false : undefined,
        });
        return { success: true, data: tests };
      } catch (error) {
        reply.code(500);
        return {
          success: false,
          error: { code: 'LIST_TESTS_FAILED', message: error instanceof Error ? error.message : 'Failed to list tests' },
        };
      }
    }
  );

  // Get single test definition
  fastify.get<{ Params: { id: string } }>(
    '/tests/:id',
    {
      schema: {
        tags: ['Validation Tests'],
        summary: 'Get a validation test definition',
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        const test = await validationTestService.getTest(request.params.id);
        if (!test) {
          reply.code(404);
          return { success: false, error: { code: 'NOT_FOUND', message: 'Test not found' } };
        }
        return { success: true, data: test };
      } catch (error) {
        reply.code(500);
        return {
          success: false,
          error: { code: 'GET_TEST_FAILED', message: error instanceof Error ? error.message : 'Failed to get test' },
        };
      }
    }
  );

  // Create a custom test
  fastify.post<{
    Body: {
      name: string;
      description?: string;
      category: string;
      scriptType: string;
      targetOs: string;
      script: string;
      scriptBash?: string;
      parameters?: Array<{ key: string; label: string; type: string; required: boolean; default?: unknown; placeholder?: string }>;
      expectedExitCode?: number;
      outputContains?: string;
      outputNotContains?: string;
      timeout?: number;
    };
  }>(
    '/tests',
    {
      schema: {
        tags: ['Validation Tests'],
        summary: 'Create a custom validation test',
        body: {
          type: 'object',
          required: ['name', 'category', 'scriptType', 'targetOs', 'script'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            category: { type: 'string' },
            scriptType: { type: 'string' },
            targetOs: { type: 'string' },
            script: { type: 'string' },
            scriptBash: { type: 'string' },
            parameters: { type: 'array' },
            expectedExitCode: { type: 'number' },
            outputContains: { type: 'string' },
            outputNotContains: { type: 'string' },
            timeout: { type: 'number' },
          },
        },
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        const test = await validationTestService.createTest(request.body as any);
        return { success: true, data: test };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: { code: 'CREATE_TEST_FAILED', message: error instanceof Error ? error.message : 'Failed to create test' },
        };
      }
    }
  );

  // Update a test
  fastify.put<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/tests/:id',
    {
      schema: {
        tags: ['Validation Tests'],
        summary: 'Update a validation test',
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        const test = await validationTestService.updateTest(request.params.id, request.body as any);
        return { success: true, data: test };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: { code: 'UPDATE_TEST_FAILED', message: error instanceof Error ? error.message : 'Failed to update test' },
        };
      }
    }
  );

  // Delete a test
  fastify.delete<{ Params: { id: string } }>(
    '/tests/:id',
    {
      schema: {
        tags: ['Validation Tests'],
        summary: 'Delete a validation test',
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        await validationTestService.deleteTest(request.params.id);
        return { success: true };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: { code: 'DELETE_TEST_FAILED', message: error instanceof Error ? error.message : 'Failed to delete test' },
        };
      }
    }
  );

  // =============================================
  // TEST SUITES
  // =============================================

  // List test suites
  fastify.get(
    '/test-suites',
    {
      schema: {
        tags: ['Validation Tests'],
        summary: 'List all test suites',
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        const suites = await validationTestService.listSuites();
        return { success: true, data: suites };
      } catch (error) {
        reply.code(500);
        return {
          success: false,
          error: { code: 'LIST_SUITES_FAILED', message: error instanceof Error ? error.message : 'Failed to list suites' },
        };
      }
    }
  );

  // Get suite by ID
  fastify.get<{ Params: { id: string } }>(
    '/test-suites/:id',
    {
      schema: {
        tags: ['Validation Tests'],
        summary: 'Get a test suite',
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        const suite = await validationTestService.getSuite(request.params.id);
        if (!suite) {
          reply.code(404);
          return { success: false, error: { code: 'NOT_FOUND', message: 'Suite not found' } };
        }
        return { success: true, data: suite };
      } catch (error) {
        reply.code(500);
        return {
          success: false,
          error: { code: 'GET_SUITE_FAILED', message: error instanceof Error ? error.message : 'Failed to get suite' },
        };
      }
    }
  );

  // Create test suite
  fastify.post<{
    Body: {
      name: string;
      description?: string;
      testIds: string[];
      runInParallel?: boolean;
      stopOnFailure?: boolean;
    };
  }>(
    '/test-suites',
    {
      schema: {
        tags: ['Validation Tests'],
        summary: 'Create a test suite',
        body: {
          type: 'object',
          required: ['name', 'testIds'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            testIds: { type: 'array', items: { type: 'string' } },
            runInParallel: { type: 'boolean' },
            stopOnFailure: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        const suite = await validationTestService.createSuite(request.body);
        return { success: true, data: suite };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: { code: 'CREATE_SUITE_FAILED', message: error instanceof Error ? error.message : 'Failed to create suite' },
        };
      }
    }
  );

  // Delete test suite
  fastify.delete<{ Params: { id: string } }>(
    '/test-suites/:id',
    {
      schema: {
        tags: ['Validation Tests'],
        summary: 'Delete a test suite',
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        await validationTestService.deleteSuite(request.params.id);
        return { success: true };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: { code: 'DELETE_SUITE_FAILED', message: error instanceof Error ? error.message : 'Failed to delete suite' },
        };
      }
    }
  );

  // =============================================
  // VM TEST ASSIGNMENTS
  // =============================================

  // Get all tests assigned to a VM (using query param to avoid URL encoding issues with slashes in vmId)
  fastify.get<{ Querystring: { vmId: string } }>(
    '/vm-tests',
    {
      schema: {
        tags: ['Validation Tests'],
        summary: 'Get all tests assigned to a VM',
        querystring: {
          type: 'object',
          required: ['vmId'],
          properties: {
            vmId: { type: 'string', description: 'The full Azure resource ID of the VM' },
          },
        },
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        const vmId = request.query.vmId;
        const tests = await validationTestService.getVmTests(vmId);
        return { success: true, data: tests };
      } catch (error) {
        reply.code(500);
        return {
          success: false,
          error: { code: 'GET_VM_TESTS_FAILED', message: error instanceof Error ? error.message : 'Failed to get VM tests' },
        };
      }
    }
  );

  // Assign a test to a VM
  fastify.post<{
    Body: {
      vmId: string;
      vmName: string;
      resourceGroup: string;
      subscriptionId: string;
      testId: string;
      parameters?: Record<string, unknown>;
      scheduleType?: string;
      intervalMinutes?: number;
      cronExpression?: string;
    };
  }>(
    '/test-assignments',
    {
      schema: {
        tags: ['Validation Tests'],
        summary: 'Assign a test to a VM',
        body: {
          type: 'object',
          required: ['vmId', 'vmName', 'resourceGroup', 'subscriptionId', 'testId'],
          properties: {
            vmId: { type: 'string' },
            vmName: { type: 'string' },
            resourceGroup: { type: 'string' },
            subscriptionId: { type: 'string' },
            testId: { type: 'string' },
            parameters: { type: 'object' },
            scheduleType: { type: 'string' },
            intervalMinutes: { type: 'number' },
            cronExpression: { type: 'string' },
          },
        },
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        const assignment = await validationTestService.assignTestToVm(request.body as any);
        return { success: true, data: assignment };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: { code: 'ASSIGN_TEST_FAILED', message: error instanceof Error ? error.message : 'Failed to assign test' },
        };
      }
    }
  );

  // Bulk assign test to multiple VMs
  fastify.post<{
    Body: {
      testId: string;
      vms: Array<{ vmId: string; vmName: string; resourceGroup: string; subscriptionId: string }>;
      parameters?: Record<string, unknown>;
      scheduleType?: string;
      intervalMinutes?: number;
    };
  }>(
    '/test-assignments/bulk',
    {
      schema: {
        tags: ['Validation Tests'],
        summary: 'Assign a test to multiple VMs',
        body: {
          type: 'object',
          required: ['testId', 'vms'],
          properties: {
            testId: { type: 'string' },
            vms: { type: 'array' },
            parameters: { type: 'object' },
            scheduleType: { type: 'string' },
            intervalMinutes: { type: 'number' },
          },
        },
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        const result = await validationTestService.bulkAssignTest(
          request.body.testId,
          request.body.vms,
          request.body.parameters as any,
          request.body.scheduleType as any,
          request.body.intervalMinutes
        );
        return { success: true, data: result };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: { code: 'BULK_ASSIGN_FAILED', message: error instanceof Error ? error.message : 'Failed to bulk assign test' },
        };
      }
    }
  );

  // Get assignment by ID
  fastify.get<{ Params: { id: string } }>(
    '/test-assignments/:id',
    {
      schema: {
        tags: ['Validation Tests'],
        summary: 'Get a test assignment',
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        const assignment = await validationTestService.getAssignment(request.params.id);
        if (!assignment) {
          reply.code(404);
          return { success: false, error: { code: 'NOT_FOUND', message: 'Assignment not found' } };
        }
        return { success: true, data: assignment };
      } catch (error) {
        reply.code(500);
        return {
          success: false,
          error: { code: 'GET_ASSIGNMENT_FAILED', message: error instanceof Error ? error.message : 'Failed to get assignment' },
        };
      }
    }
  );

  // Update assignment
  fastify.put<{
    Params: { id: string };
    Body: {
      parameters?: Record<string, unknown>;
      isEnabled?: boolean;
      scheduleType?: string;
      intervalMinutes?: number;
      cronExpression?: string;
    };
  }>(
    '/test-assignments/:id',
    {
      schema: {
        tags: ['Validation Tests'],
        summary: 'Update a test assignment',
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        const assignment = await validationTestService.updateAssignment(request.params.id, request.body as any);
        return { success: true, data: assignment };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: { code: 'UPDATE_ASSIGNMENT_FAILED', message: error instanceof Error ? error.message : 'Failed to update assignment' },
        };
      }
    }
  );

  // Remove test assignment
  fastify.delete<{ Params: { id: string } }>(
    '/test-assignments/:id',
    {
      schema: {
        tags: ['Validation Tests'],
        summary: 'Remove a test assignment from a VM',
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        await validationTestService.removeAssignment(request.params.id);
        return { success: true };
      } catch (error) {
        reply.code(400);
        return {
          success: false,
          error: { code: 'REMOVE_ASSIGNMENT_FAILED', message: error instanceof Error ? error.message : 'Failed to remove assignment' },
        };
      }
    }
  );

  // =============================================
  // TEST EXECUTION
  // =============================================

  // Run a single test
  fastify.post<{ Params: { id: string } }>(
    '/test-assignments/:id/run',
    {
      schema: {
        tags: ['Validation Tests'],
        summary: 'Run a test on its assigned VM',
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        const result = await validationTestService.runTest(request.params.id);
        return { success: true, data: result };
      } catch (error) {
        reply.code(500);
        return {
          success: false,
          error: { code: 'RUN_TEST_FAILED', message: error instanceof Error ? error.message : 'Failed to run test' },
        };
      }
    }
  );

  // Run all tests for a VM (using query param to avoid URL encoding issues with slashes in vmId)
  fastify.post<{ Querystring: { vmId: string } }>(
    '/vm-tests/run-all',
    {
      schema: {
        tags: ['Validation Tests'],
        summary: 'Run all tests assigned to a VM',
        querystring: {
          type: 'object',
          required: ['vmId'],
          properties: {
            vmId: { type: 'string', description: 'The full Azure resource ID of the VM' },
          },
        },
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        const vmId = request.query.vmId;
        const result = await validationTestService.runAllVmTests(vmId);
        return { success: true, data: result };
      } catch (error) {
        reply.code(500);
        return {
          success: false,
          error: { code: 'RUN_ALL_TESTS_FAILED', message: error instanceof Error ? error.message : 'Failed to run tests' },
        };
      }
    }
  );

  // Get test results history
  fastify.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/test-assignments/:id/results',
    {
      schema: {
        tags: ['Validation Tests'],
        summary: 'Get test execution history',
      },
    },
    async (request, reply): Promise<ApiResponse> => {
      try {
        const limit = request.query.limit ? parseInt(request.query.limit) : 20;
        const results = await validationTestService.getTestResults(request.params.id, limit);
        return { success: true, data: results };
      } catch (error) {
        reply.code(500);
        return {
          success: false,
          error: { code: 'GET_RESULTS_FAILED', message: error instanceof Error ? error.message : 'Failed to get results' },
        };
      }
    }
  );

  // =============================================
  // INITIALIZATION
  // =============================================

  // Seed built-in scripts and tests on startup
  fastify.addHook('onReady', async () => {
    try {
      await scriptService.seedBuiltInScripts();
      console.log('[LiftCleanse] Built-in scripts seeded');
      
      await validationTestService.seedBuiltInTests();
      console.log('[LiftCleanse] Built-in validation tests seeded');
    } catch (error) {
      console.error('[LiftCleanse] Failed to seed built-in data:', error);
    }
  });
}

