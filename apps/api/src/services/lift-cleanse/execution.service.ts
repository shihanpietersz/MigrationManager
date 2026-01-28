/**
 * Script Execution Service
 * Orchestrates script execution across multiple VMs
 */

import prisma from '../../lib/db.js';
import { azureVMService } from '../azure-vm.service.js';
import { scriptService } from './script.service.js';
import { activityService } from '../activity.service.js';

interface ExecuteScriptInput {
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
  initiatedBy?: string;
}

interface ExecutionStatus {
  id: string;
  status: string;
  scriptName: string;
  totalTargets: number;
  successCount: number;
  failedCount: number;
  targets: Array<{
    id: string;
    vmName: string;
    status: string;
    exitCode?: number;
    output?: string;
    error?: string;
  }>;
}

class ExecutionService {
  /**
   * Execute a script on multiple VMs
   */
  async execute(input: ExecuteScriptInput): Promise<{
    executionId: string;
    status: string;
  }> {
    let scriptContent: string;
    let scriptType: 'powershell' | 'bash';
    let scriptName: string;

    // Get script content
    if (input.scriptId) {
      const script = await scriptService.getById(input.scriptId);
      if (!script) {
        throw new Error('Script not found');
      }
      
      // Check if high-risk script is approved
      if (script.riskLevel === 'high' && !script.approvedAt) {
        throw new Error('High-risk script requires admin approval before execution');
      }

      scriptContent = script.content;
      scriptType = script.scriptType as 'powershell' | 'bash';
      scriptName = script.name;
    } else if (input.adHocScript && input.adHocType) {
      scriptContent = input.adHocScript;
      scriptType = input.adHocType;
      scriptName = 'Ad-hoc Script';
    } else {
      throw new Error('Either scriptId or adHocScript must be provided');
    }

    // Replace parameters in script
    if (input.parameters) {
      for (const [key, value] of Object.entries(input.parameters)) {
        // PowerShell parameter replacement
        if (scriptType === 'powershell') {
          scriptContent = scriptContent.replace(new RegExp(`\\$${key}`, 'gi'), value);
        }
        // Bash parameter replacement (positional or named)
        if (scriptType === 'bash') {
          scriptContent = scriptContent.replace(new RegExp(`\\$\\{?${key}\\}?`, 'gi'), value);
        }
      }
    }

    // Create execution record
    const execution = await prisma.scriptExecution.create({
      data: {
        scriptId: input.scriptId,
        scriptName,
        adHocScript: input.adHocScript,
        adHocType: input.adHocType,
        status: 'pending',
        initiatedBy: input.initiatedBy,
        parameters: input.parameters ? JSON.stringify(input.parameters) : null,
        maxParallel: input.maxParallel || 5,
        totalTargets: input.targets.length,
      },
    });

    // Create target records
    const targetRecords = await Promise.all(
      input.targets.map(target =>
        prisma.scriptExecutionTarget.create({
          data: {
            executionId: execution.id,
            vmId: target.vmId,
            vmName: target.vmName,
            resourceGroup: target.resourceGroup,
            subscriptionId: target.subscriptionId,
            osType: target.osType,
            status: 'pending',
            queuedAt: new Date(),
          },
        })
      )
    );

    // Log activity
    await activityService.log({
      type: 'lift-cleanse',
      action: 'execution_started',
      title: `Script execution started: ${scriptName}`,
      description: `Executing on ${input.targets.length} VM(s)`,
      status: 'info',
      entityType: 'execution',
      entityId: execution.id,
    });

    // Start execution in background (don't await)
    this.executeInBackground(execution.id, scriptContent, scriptType, input.maxParallel || 5)
      .catch(err => console.error('[ExecutionService] Background execution error:', err));

    return {
      executionId: execution.id,
      status: 'pending',
    };
  }

  /**
   * Execute scripts on VMs in the background with concurrency control
   */
  private async executeInBackground(
    executionId: string,
    scriptContent: string,
    scriptType: 'powershell' | 'bash',
    maxParallel: number
  ) {
    // Update execution status to running
    await prisma.scriptExecution.update({
      where: { id: executionId },
      data: { status: 'running', startedAt: new Date() },
    });

    // Get all targets
    const targets = await prisma.scriptExecutionTarget.findMany({
      where: { executionId },
      orderBy: { createdAt: 'asc' },
    });

    let successCount = 0;
    let failedCount = 0;

    // Process in batches based on maxParallel
    for (let i = 0; i < targets.length; i += maxParallel) {
      const batch = targets.slice(i, i + maxParallel);
      
      const results = await Promise.allSettled(
        batch.map(target => this.executeOnTarget(target, scriptContent, scriptType))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const target = batch[j];

        if (result.status === 'fulfilled') {
          if (result.value.success) {
            successCount++;
          } else {
            failedCount++;
          }
        } else {
          failedCount++;
          // Update target with error
          await prisma.scriptExecutionTarget.update({
            where: { id: target.id },
            data: {
              status: 'failed',
              errorMessage: result.reason?.message || 'Unknown error',
              completedAt: new Date(),
            },
          });
        }

        // Update execution counts
        await prisma.scriptExecution.update({
          where: { id: executionId },
          data: { successCount, failedCount },
        });
      }
    }

    // Update final execution status
    const finalStatus = failedCount === 0 ? 'completed' : 
                        successCount === 0 ? 'failed' : 
                        'completed'; // partial success still counts as completed

    await prisma.scriptExecution.update({
      where: { id: executionId },
      data: {
        status: finalStatus,
        completedAt: new Date(),
      },
    });

    // Log completion
    await activityService.log({
      type: 'lift-cleanse',
      action: 'execution_completed',
      title: `Script execution ${finalStatus}`,
      description: `${successCount} succeeded, ${failedCount} failed`,
      status: failedCount === 0 ? 'success' : failedCount === targets.length ? 'error' : 'warning',
      entityType: 'execution',
      entityId: executionId,
    });
  }

  /**
   * Execute script on a single target VM
   */
  private async executeOnTarget(
    target: {
      id: string;
      vmId: string;
      vmName: string;
    },
    scriptContent: string,
    scriptType: 'powershell' | 'bash'
  ): Promise<{ success: boolean }> {
    // Update target status to running
    await prisma.scriptExecutionTarget.update({
      where: { id: target.id },
      data: { status: 'running', startedAt: new Date() },
    });

    try {
      // Start the run command
      const { runCommandName } = await azureVMService.runCommand(
        target.vmId,
        scriptContent,
        scriptType
      );

      // Update target with run command name
      await prisma.scriptExecutionTarget.update({
        where: { id: target.id },
        data: { azureRunCommandName: runCommandName },
      });

      // Poll for completion (max 90 minutes)
      const maxWait = 90 * 60 * 1000;
      const pollInterval = 5000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        const status = await azureVMService.getRunCommandStatus(target.vmId, runCommandName);

        if (status.status === 'completed') {
          // Sometimes Azure needs a moment to populate the output
          // If output is empty, wait and try once more
          let output = status.output;
          if (!output && status.exitCode === 0) {
            console.log(`[ExecutionService] Output empty for ${target.vmName}, waiting and retrying...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            const retryStatus = await azureVMService.getRunCommandStatus(target.vmId, runCommandName);
            output = retryStatus.output;
          }
          
          console.log(`[ExecutionService] Script completed on ${target.vmName}:`, {
            exitCode: status.exitCode,
            hasOutput: !!output,
            outputLength: output?.length || 0,
            outputPreview: output?.substring(0, 200),
          });
          
          await prisma.scriptExecutionTarget.update({
            where: { id: target.id },
            data: {
              status: 'completed',
              exitCode: status.exitCode,
              stdout: output || '', // Ensure we store empty string if no output
              completedAt: new Date(),
            },
          });

          // Cleanup run command resource from Azure (after capturing output)
          await azureVMService.deleteRunCommand(target.vmId, runCommandName);
          
          return { success: true };
        }

        if (status.status === 'failed') {
          await prisma.scriptExecutionTarget.update({
            where: { id: target.id },
            data: {
              status: 'failed',
              exitCode: status.exitCode,
              stderr: status.error,
              errorMessage: status.error,
              completedAt: new Date(),
            },
          });

          // Cleanup
          await azureVMService.deleteRunCommand(target.vmId, runCommandName);
          
          return { success: false };
        }

        // Still running, wait and poll again
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

      // Timeout
      await prisma.scriptExecutionTarget.update({
        where: { id: target.id },
        data: {
          status: 'failed',
          errorMessage: 'Execution timed out after 90 minutes',
          completedAt: new Date(),
        },
      });

      return { success: false };
    } catch (error) {
      console.error(`[ExecutionService] Error executing on ${target.vmName}:`, error);
      
      await prisma.scriptExecutionTarget.update({
        where: { id: target.id },
        data: {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          completedAt: new Date(),
        },
      });

      return { success: false };
    }
  }

  /**
   * Get execution status
   */
  async getStatus(executionId: string): Promise<ExecutionStatus | null> {
    const execution = await prisma.scriptExecution.findUnique({
      where: { id: executionId },
      include: {
        targets: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!execution) return null;

    return {
      id: execution.id,
      status: execution.status,
      scriptName: execution.scriptName,
      totalTargets: execution.totalTargets,
      successCount: execution.successCount,
      failedCount: execution.failedCount,
      targets: execution.targets.map(t => ({
        id: t.id,
        vmName: t.vmName,
        status: t.status,
        exitCode: t.exitCode ?? undefined,
        output: t.stdout ?? undefined,
        error: t.stderr || t.errorMessage || undefined,
      })),
    };
  }

  /**
   * Get target output
   */
  async getTargetOutput(targetId: string): Promise<{
    stdout?: string;
    stderr?: string;
    exitCode?: number;
  } | null> {
    const target = await prisma.scriptExecutionTarget.findUnique({
      where: { id: targetId },
    });

    if (!target) return null;

    return {
      stdout: target.stdout ?? undefined,
      stderr: target.stderr ?? undefined,
      exitCode: target.exitCode ?? undefined,
    };
  }

  /**
   * List executions with pagination
   */
  async list(options?: {
    limit?: number;
    offset?: number;
    status?: string;
  }) {
    const where: Parameters<typeof prisma.scriptExecution.findMany>[0]['where'] = {};
    
    if (options?.status) {
      where.status = options.status;
    }

    const [executions, total] = await Promise.all([
      prisma.scriptExecution.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 50,
        skip: options?.offset || 0,
        include: {
          targets: {
            select: {
              id: true,
              vmName: true,
              status: true,
            },
          },
        },
      }),
      prisma.scriptExecution.count({ where }),
    ]);

    return {
      executions,
      total,
      limit: options?.limit || 50,
      offset: options?.offset || 0,
    };
  }

  /**
   * Cancel a running execution
   */
  async cancel(executionId: string): Promise<boolean> {
    const execution = await prisma.scriptExecution.findUnique({
      where: { id: executionId },
    });

    if (!execution || execution.status !== 'running') {
      return false;
    }

    // Update execution status
    await prisma.scriptExecution.update({
      where: { id: executionId },
      data: { status: 'cancelled', completedAt: new Date() },
    });

    // Cancel pending targets
    await prisma.scriptExecutionTarget.updateMany({
      where: {
        executionId,
        status: 'pending',
      },
      data: {
        status: 'cancelled',
        completedAt: new Date(),
      },
    });

    return true;
  }

  /**
   * Retry failed targets in an execution
   */
  async retryFailed(executionId: string): Promise<{ retryCount: number }> {
    const execution = await prisma.scriptExecution.findUnique({
      where: { id: executionId },
      include: {
        script: true,
        targets: {
          where: { status: 'failed' },
        },
      },
    });

    if (!execution) {
      throw new Error('Execution not found');
    }

    if (execution.targets.length === 0) {
      return { retryCount: 0 };
    }

    // Get script content
    const scriptContent = execution.script?.content || execution.adHocScript;
    const scriptType = (execution.script?.scriptType || execution.adHocType) as 'powershell' | 'bash';

    if (!scriptContent) {
      throw new Error('Script content not available');
    }

    // Reset failed targets
    await prisma.scriptExecutionTarget.updateMany({
      where: {
        executionId,
        status: 'failed',
      },
      data: {
        status: 'pending',
        exitCode: null,
        stdout: null,
        stderr: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        queuedAt: new Date(),
      },
    });

    // Update execution status
    await prisma.scriptExecution.update({
      where: { id: executionId },
      data: {
        status: 'running',
        failedCount: 0,
      },
    });

    // Re-execute in background
    this.executeInBackground(executionId, scriptContent, scriptType, execution.maxParallel)
      .catch(err => console.error('[ExecutionService] Retry execution error:', err));

    return { retryCount: execution.targets.length };
  }
}

export const executionService = new ExecutionService();

