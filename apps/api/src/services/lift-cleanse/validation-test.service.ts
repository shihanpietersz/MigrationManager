/**
 * Validation Test Service
 * Manages test definitions, assignments, and execution
 */

import prisma from '../../lib/db.js';
import { azureVMService } from '../azure-vm.service.js';
import { activityService } from '../activity.service.js';

// ============================================
// TYPES
// ============================================

interface TestParameter {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  default?: string | number | boolean;
  placeholder?: string;
}

interface CreateTestInput {
  name: string;
  description?: string;
  category: 'network' | 'service' | 'storage' | 'security' | 'application' | 'custom';
  scriptType: 'powershell' | 'bash';
  targetOs: 'windows' | 'linux' | 'both';
  script: string;
  scriptBash?: string;
  parameters?: TestParameter[];
  expectedExitCode?: number;
  outputContains?: string;
  outputNotContains?: string;
  timeout?: number;
  createdBy?: string;
}

interface AssignTestInput {
  vmId: string;
  vmName: string;
  resourceGroup: string;
  subscriptionId: string;
  testId: string;
  parameters?: Record<string, string | number | boolean>;
  scheduleType?: 'manual' | 'interval' | 'cron';
  intervalMinutes?: number;
  cronExpression?: string;
}

interface CreateSuiteInput {
  name: string;
  description?: string;
  testIds: string[];
  runInParallel?: boolean;
  stopOnFailure?: boolean;
  createdBy?: string;
}

// ============================================
// SERVICE
// ============================================

class ValidationTestService {
  // =============================================
  // TEST DEFINITION MANAGEMENT
  // =============================================

  /**
   * Create a new test definition
   */
  async createTest(input: CreateTestInput) {
    const test = await prisma.validationTest.create({
      data: {
        name: input.name,
        description: input.description,
        category: input.category,
        scriptType: input.scriptType,
        targetOs: input.targetOs,
        script: input.script,
        scriptBash: input.scriptBash,
        parameters: input.parameters ? JSON.stringify(input.parameters) : null,
        expectedExitCode: input.expectedExitCode ?? 0,
        outputContains: input.outputContains,
        outputNotContains: input.outputNotContains,
        timeout: input.timeout ?? 300,
        isBuiltIn: false,
        isShared: true,
        createdBy: input.createdBy,
      },
    });

    return this.formatTest(test);
  }

  /**
   * Get all test definitions
   */
  async listTests(filters?: {
    category?: string;
    targetOs?: string;
    isBuiltIn?: boolean;
    search?: string;
  }) {
    const where: Parameters<typeof prisma.validationTest.findMany>[0]['where'] = {};

    if (filters?.category) where.category = filters.category;
    if (filters?.targetOs) where.targetOs = filters.targetOs;
    if (filters?.isBuiltIn !== undefined) where.isBuiltIn = filters.isBuiltIn;
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search } },
        { description: { contains: filters.search } },
      ];
    }

    const tests = await prisma.validationTest.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    return tests.map(t => this.formatTest(t));
  }

  /**
   * Get test by ID
   */
  async getTest(id: string) {
    const test = await prisma.validationTest.findUnique({
      where: { id },
    });

    return test ? this.formatTest(test) : null;
  }

  /**
   * Update a test definition
   */
  async updateTest(id: string, input: Partial<CreateTestInput>) {
    const existing = await prisma.validationTest.findUnique({ where: { id } });
    if (!existing) throw new Error('Test not found');
    if (existing.isBuiltIn) throw new Error('Cannot modify built-in tests');

    const test = await prisma.validationTest.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        category: input.category,
        scriptType: input.scriptType,
        targetOs: input.targetOs,
        script: input.script,
        scriptBash: input.scriptBash,
        parameters: input.parameters !== undefined ? JSON.stringify(input.parameters) : undefined,
        expectedExitCode: input.expectedExitCode,
        outputContains: input.outputContains,
        outputNotContains: input.outputNotContains,
        timeout: input.timeout,
      },
    });

    return this.formatTest(test);
  }

  /**
   * Delete a test definition
   */
  async deleteTest(id: string) {
    const existing = await prisma.validationTest.findUnique({ where: { id } });
    if (!existing) throw new Error('Test not found');
    if (existing.isBuiltIn) throw new Error('Cannot delete built-in tests');

    await prisma.validationTest.delete({ where: { id } });
    return { success: true };
  }

  // =============================================
  // TEST SUITE MANAGEMENT
  // =============================================

  /**
   * Create a test suite
   */
  async createSuite(input: CreateSuiteInput) {
    const suite = await prisma.testSuite.create({
      data: {
        name: input.name,
        description: input.description,
        runInParallel: input.runInParallel ?? false,
        stopOnFailure: input.stopOnFailure ?? false,
        isBuiltIn: false,
        isShared: true,
        createdBy: input.createdBy,
        tests: {
          create: input.testIds.map((testId, index) => ({
            testId,
            order: index,
          })),
        },
      },
      include: {
        tests: {
          include: { test: true },
          orderBy: { order: 'asc' },
        },
      },
    });

    return this.formatSuite(suite);
  }

  /**
   * List all test suites
   */
  async listSuites() {
    const suites = await prisma.testSuite.findMany({
      include: {
        tests: {
          include: { test: true },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    return suites.map(s => this.formatSuite(s));
  }

  /**
   * Get suite by ID
   */
  async getSuite(id: string) {
    const suite = await prisma.testSuite.findUnique({
      where: { id },
      include: {
        tests: {
          include: { test: true },
          orderBy: { order: 'asc' },
        },
      },
    });

    return suite ? this.formatSuite(suite) : null;
  }

  /**
   * Delete a test suite
   */
  async deleteSuite(id: string) {
    const existing = await prisma.testSuite.findUnique({ where: { id } });
    if (!existing) throw new Error('Suite not found');
    if (existing.isBuiltIn) throw new Error('Cannot delete built-in suites');

    await prisma.testSuite.delete({ where: { id } });
    return { success: true };
  }

  // =============================================
  // TEST ASSIGNMENT MANAGEMENT
  // =============================================

  /**
   * Assign a test to a VM
   */
  async assignTestToVm(input: AssignTestInput) {
    // Check if test exists
    const test = await prisma.validationTest.findUnique({ where: { id: input.testId } });
    if (!test) throw new Error('Test not found');

    // Calculate next run time for scheduled tests
    let nextRunAt: Date | null = null;
    if (input.scheduleType === 'interval' && input.intervalMinutes) {
      nextRunAt = new Date(Date.now() + input.intervalMinutes * 60 * 1000);
    }
    // TODO: Parse cron expression to get next run time

    const assignment = await prisma.vmTestAssignment.upsert({
      where: {
        vmId_testId: {
          vmId: input.vmId,
          testId: input.testId,
        },
      },
      create: {
        vmId: input.vmId,
        vmName: input.vmName,
        resourceGroup: input.resourceGroup,
        subscriptionId: input.subscriptionId,
        testId: input.testId,
        parameters: input.parameters ? JSON.stringify(input.parameters) : null,
        scheduleType: input.scheduleType || 'manual',
        intervalMinutes: input.intervalMinutes,
        cronExpression: input.cronExpression,
        nextRunAt,
        isEnabled: true,
      },
      update: {
        parameters: input.parameters ? JSON.stringify(input.parameters) : null,
        scheduleType: input.scheduleType || 'manual',
        intervalMinutes: input.intervalMinutes,
        cronExpression: input.cronExpression,
        nextRunAt,
        isEnabled: true,
      },
      include: { test: true },
    });

    return this.formatAssignment(assignment);
  }

  /**
   * Bulk assign a test to multiple VMs
   */
  async bulkAssignTest(
    testId: string,
    vms: Array<{ vmId: string; vmName: string; resourceGroup: string; subscriptionId: string }>,
    parameters?: Record<string, string | number | boolean>,
    scheduleType?: 'manual' | 'interval' | 'cron',
    intervalMinutes?: number
  ) {
    const results = await Promise.all(
      vms.map(vm =>
        this.assignTestToVm({
          ...vm,
          testId,
          parameters,
          scheduleType,
          intervalMinutes,
        }).catch(err => ({ error: err.message, vmId: vm.vmId }))
      )
    );

    return {
      total: vms.length,
      succeeded: results.filter(r => !('error' in r)).length,
      failed: results.filter(r => 'error' in r).length,
      results,
    };
  }

  /**
   * Get all test assignments for a VM
   */
  async getVmTests(vmId: string) {
    const assignments = await prisma.vmTestAssignment.findMany({
      where: { vmId },
      include: { test: true },
      orderBy: [{ lastStatus: 'asc' }, { test: { name: 'asc' } }],
    });

    return assignments.map(a => this.formatAssignment(a));
  }

  /**
   * Get assignment by ID
   */
  async getAssignment(id: string) {
    const assignment = await prisma.vmTestAssignment.findUnique({
      where: { id },
      include: { test: true },
    });

    return assignment ? this.formatAssignment(assignment) : null;
  }

  /**
   * Update assignment parameters or schedule
   */
  async updateAssignment(
    id: string,
    input: {
      parameters?: Record<string, string | number | boolean>;
      isEnabled?: boolean;
      scheduleType?: 'manual' | 'interval' | 'cron';
      intervalMinutes?: number;
      cronExpression?: string;
    }
  ) {
    let nextRunAt: Date | null = null;
    if (input.scheduleType === 'interval' && input.intervalMinutes) {
      nextRunAt = new Date(Date.now() + input.intervalMinutes * 60 * 1000);
    }

    const assignment = await prisma.vmTestAssignment.update({
      where: { id },
      data: {
        parameters: input.parameters !== undefined ? JSON.stringify(input.parameters) : undefined,
        isEnabled: input.isEnabled,
        scheduleType: input.scheduleType,
        intervalMinutes: input.intervalMinutes,
        cronExpression: input.cronExpression,
        nextRunAt: nextRunAt !== null ? nextRunAt : undefined,
      },
      include: { test: true },
    });

    return this.formatAssignment(assignment);
  }

  /**
   * Remove test assignment from VM
   */
  async removeAssignment(id: string) {
    await prisma.vmTestAssignment.delete({ where: { id } });
    return { success: true };
  }

  // =============================================
  // TEST EXECUTION
  // =============================================

  /**
   * Run a single test on a VM
   */
  async runTest(assignmentId: string): Promise<{
    status: 'passed' | 'failed' | 'error';
    exitCode?: number;
    output?: string;
    error?: string;
    duration?: number;
    failureReason?: string;
  }> {
    const assignment = await prisma.vmTestAssignment.findUnique({
      where: { id: assignmentId },
      include: { test: true },
    });

    if (!assignment) throw new Error('Assignment not found');

    // Update status to running
    await prisma.vmTestAssignment.update({
      where: { id: assignmentId },
      data: { lastStatus: 'running' },
    });

    const startTime = Date.now();

    try {
      // Determine script to use based on OS
      const vm = await azureVMService.getVM(assignment.vmId);
      const osType = vm?.osType?.toLowerCase() || 'windows';
      
      let script = assignment.test.script;
      let scriptType = assignment.test.scriptType as 'powershell' | 'bash';
      
      // Use bash script if available and target is Linux
      if (osType === 'linux' && assignment.test.scriptBash) {
        script = assignment.test.scriptBash;
        scriptType = 'bash';
      } else if (osType === 'linux' && assignment.test.scriptType === 'powershell') {
        // Can't run PowerShell on Linux without bash alternative
        throw new Error('Test requires PowerShell but VM is Linux and no bash alternative provided');
      }

      // Substitute parameters
      const params = assignment.parameters ? JSON.parse(assignment.parameters) : {};
      script = this.substituteParameters(script, params, scriptType);

      // Log the script for debugging
      console.log(`[ValidationTestService] Running test "${assignment.test.name}" with params:`, params);
      console.log(`[ValidationTestService] Script preview (first 500 chars):\n${script.substring(0, 500)}`);

      // Run the command using the synchronous action-based API for reliability
      // This API returns output directly without polling
      const result = await azureVMService.runCommandAction(
        assignment.vmId,
        script,
        scriptType
      );

      const duration = Date.now() - startTime;

      // Determine pass/fail status
      let status: 'passed' | 'failed' = 'passed';
      let failureReason: string | undefined;

      // Check exit code
      if (result.exitCode !== assignment.test.expectedExitCode) {
        status = 'failed';
        failureReason = `Exit code ${result.exitCode} (expected ${assignment.test.expectedExitCode})`;
      }

      // Check output contains (if specified)
      if (status === 'passed' && assignment.test.outputContains) {
        if (!result.output?.includes(assignment.test.outputContains)) {
          status = 'failed';
          failureReason = `Output does not contain expected text: "${assignment.test.outputContains}"`;
        }
      }

      // Check output not contains (if specified)
      if (status === 'passed' && assignment.test.outputNotContains) {
        if (result.output?.includes(assignment.test.outputNotContains)) {
          status = 'failed';
          failureReason = `Output contains forbidden text: "${assignment.test.outputNotContains}"`;
        }
      }

      // Store result
      await prisma.vmTestResult.create({
        data: {
          assignmentId,
          status,
          exitCode: result.exitCode,
          stdout: result.output,
          stderr: result.error,
          duration,
          failureReason,
        },
      });

      // Update assignment with last result
      const nextRunAt = this.calculateNextRunTime(assignment);
      await prisma.vmTestAssignment.update({
        where: { id: assignmentId },
        data: {
          lastStatus: status,
          lastRunAt: new Date(),
          lastDuration: duration,
          lastOutput: (result.output || result.error || '').substring(0, 500),
          nextRunAt,
        },
      });

      // Log activity
      await activityService.log({
        type: 'validation-test',
        action: `test_${status}`,
        title: `Test ${status}: ${assignment.test.name}`,
        description: `VM: ${assignment.vmName}${failureReason ? ` - ${failureReason}` : ''}`,
        status: status === 'passed' ? 'success' : 'error',
        entityType: 'vm-test',
        entityId: assignmentId,
      });

      // Check for notifications if failed
      if (status === 'failed') {
        await this.checkNotifications(assignment, status, failureReason);
      }

      return {
        status,
        exitCode: result.exitCode,
        output: result.output,
        error: result.error,
        duration,
        failureReason,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Store error result
      await prisma.vmTestResult.create({
        data: {
          assignmentId,
          status: 'error',
          stderr: errorMessage,
          duration,
          failureReason: errorMessage,
        },
      });

      // Update assignment
      await prisma.vmTestAssignment.update({
        where: { id: assignmentId },
        data: {
          lastStatus: 'error',
          lastRunAt: new Date(),
          lastDuration: duration,
          lastOutput: errorMessage.substring(0, 500),
        },
      });

      // Log activity
      await activityService.log({
        type: 'validation-test',
        action: 'test_error',
        title: `Test error: ${assignment.test.name}`,
        description: `VM: ${assignment.vmName} - ${errorMessage}`,
        status: 'error',
        entityType: 'vm-test',
        entityId: assignmentId,
      });

      return {
        status: 'error',
        error: errorMessage,
        duration,
        failureReason: errorMessage,
      };
    }
  }

  /**
   * Run all tests for a VM
   */
  async runAllVmTests(vmId: string): Promise<{
    total: number;
    passed: number;
    failed: number;
    errors: number;
    results: Array<{
      testName: string;
      status: string;
      duration?: number;
    }>;
  }> {
    const assignments = await prisma.vmTestAssignment.findMany({
      where: { vmId, isEnabled: true },
      include: { test: true },
    });

    const results: Array<{ testName: string; status: string; duration?: number }> = [];
    let passed = 0;
    let failed = 0;
    let errors = 0;

    // Run tests sequentially to avoid overwhelming the VM
    for (const assignment of assignments) {
      const result = await this.runTest(assignment.id);
      results.push({
        testName: assignment.test.name,
        status: result.status,
        duration: result.duration,
      });

      if (result.status === 'passed') passed++;
      else if (result.status === 'failed') failed++;
      else errors++;
    }

    return {
      total: assignments.length,
      passed,
      failed,
      errors,
      results,
    };
  }

  /**
   * Get test results history
   */
  async getTestResults(assignmentId: string, limit: number = 20) {
    const results = await prisma.vmTestResult.findMany({
      where: { assignmentId },
      orderBy: { executedAt: 'desc' },
      take: limit,
    });

    return results;
  }

  // =============================================
  // SCHEDULED TESTS
  // =============================================

  /**
   * Process scheduled tests (call from cron job)
   */
  async processScheduledTests() {
    const now = new Date();
    
    // Find assignments due to run
    const dueAssignments = await prisma.vmTestAssignment.findMany({
      where: {
        isEnabled: true,
        scheduleType: { not: 'manual' },
        nextRunAt: { lte: now },
      },
      include: { test: true },
    });

    console.log(`[ValidationTestService] Processing ${dueAssignments.length} scheduled tests`);

    for (const assignment of dueAssignments) {
      try {
        await this.runTest(assignment.id);
      } catch (error) {
        console.error(`[ValidationTestService] Failed to run scheduled test ${assignment.id}:`, error);
      }
    }

    return { processed: dueAssignments.length };
  }

  // =============================================
  // NOTIFICATIONS
  // =============================================

  /**
   * Check and send notifications for test failures
   */
  private async checkNotifications(
    assignment: { id: string; vmId: string; vmName: string; testId: string; test: { name: string } },
    status: string,
    failureReason?: string
  ) {
    // Find applicable notification configs
    const notifications = await prisma.testNotification.findMany({
      where: {
        isEnabled: true,
        OR: [
          { scopeType: 'all' },
          { scopeType: 'vm', scopeId: assignment.vmId },
          { scopeType: 'test', scopeId: assignment.testId },
        ],
      },
    });

    for (const notification of notifications) {
      // Check cooldown
      if (notification.lastNotifiedAt) {
        const cooldownEnd = new Date(notification.lastNotifiedAt.getTime() + notification.cooldownMinutes * 60 * 1000);
        if (new Date() < cooldownEnd) continue;
      }

      // Check trigger condition
      if (notification.triggerOn === 'consecutive_failures' && notification.consecutiveCount) {
        const recentResults = await prisma.vmTestResult.findMany({
          where: { assignmentId: assignment.id },
          orderBy: { executedAt: 'desc' },
          take: notification.consecutiveCount,
        });
        
        const allFailed = recentResults.length === notification.consecutiveCount &&
          recentResults.every(r => r.status === 'failed' || r.status === 'error');
        
        if (!allFailed) continue;
      }

      // Send notification
      await this.sendNotification(notification, assignment, status, failureReason);

      // Update last notified time
      await prisma.testNotification.update({
        where: { id: notification.id },
        data: { lastNotifiedAt: new Date() },
      });
    }
  }

  /**
   * Send a notification
   */
  private async sendNotification(
    config: { notificationType: string; webhookUrl: string | null; emailTo: string | null; messageTemplate: string | null },
    assignment: { vmName: string; test: { name: string } },
    status: string,
    failureReason?: string
  ) {
    const message = config.messageTemplate
      ?.replace('{vmName}', assignment.vmName)
      .replace('{testName}', assignment.test.name)
      .replace('{status}', status)
      .replace('{reason}', failureReason || 'Unknown') ||
      `Test "${assignment.test.name}" ${status} on VM "${assignment.vmName}"${failureReason ? `: ${failureReason}` : ''}`;

    if (config.notificationType === 'webhook' && config.webhookUrl) {
      try {
        await fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: message,
            vmName: assignment.vmName,
            testName: assignment.test.name,
            status,
            failureReason,
            timestamp: new Date().toISOString(),
          }),
        });
      } catch (error) {
        console.error('[ValidationTestService] Failed to send webhook notification:', error);
      }
    }

    if (config.notificationType === 'activity_log') {
      await activityService.log({
        type: 'notification',
        action: 'test_failure_alert',
        title: `Test Failure Alert: ${assignment.test.name}`,
        description: message,
        status: 'warning',
        entityType: 'vm-test',
        entityId: assignment.vmName,
      });
    }

    // TODO: Implement email notifications
  }

  // =============================================
  // SEED BUILT-IN TESTS
  // =============================================

  /**
   * Seed built-in validation tests
   */
  async seedBuiltInTests() {
    const builtInTests: Array<Omit<CreateTestInput, 'createdBy'> & { isBuiltIn: true }> = [
      // ==================
      // NETWORK TESTS
      // ==================
      {
        name: 'Port Connectivity Check',
        description: 'Tests TCP connectivity to a specific host and port',
        category: 'network',
        scriptType: 'powershell',
        targetOs: 'both',
        script: `param(
    [Parameter(Mandatory=$true)][string]$TargetHost,
    [Parameter(Mandatory=$true)][int]$TargetPort,
    [int]$Timeout = 10
)

Write-Host "Testing connection to $TargetHost on port $TargetPort..."
$result = Test-NetConnection -ComputerName $TargetHost -Port $TargetPort -WarningAction SilentlyContinue

if ($result.TcpTestSucceeded) {
    Write-Host "SUCCESS: Port $TargetPort on $TargetHost is reachable"
    Write-Host "Remote Address: $($result.RemoteAddress)"
    Write-Host "Latency: $($result.PingReplyDetails.RoundtripTime)ms"
    exit 0
} else {
    Write-Host "FAILED: Cannot connect to $TargetHost port $TargetPort"
    exit 1
}`,
        scriptBash: `#!/bin/bash
TARGET_HOST="$1"
TARGET_PORT="$2"
TIMEOUT="\${3:-10}"

echo "Testing connection to $TARGET_HOST:$TARGET_PORT..."

if timeout $TIMEOUT bash -c "echo >/dev/tcp/$TARGET_HOST/$TARGET_PORT" 2>/dev/null; then
    echo "SUCCESS: Port $TARGET_PORT on $TARGET_HOST is reachable"
    exit 0
else
    echo "FAILED: Cannot connect to $TARGET_HOST:$TARGET_PORT"
    exit 1
fi`,
        parameters: [
          { key: 'TargetHost', label: 'Target Host', type: 'string', required: true, placeholder: 'e.g., sql-server.contoso.com' },
          { key: 'TargetPort', label: 'Target Port', type: 'number', required: true, placeholder: 'e.g., 1433' },
          { key: 'Timeout', label: 'Timeout (seconds)', type: 'number', required: false, default: 10 },
        ],
        expectedExitCode: 0,
        timeout: 60,
        isBuiltIn: true,
      },
      {
        name: 'DNS Resolution Check',
        description: 'Verifies that a hostname can be resolved to an IP address',
        category: 'network',
        scriptType: 'powershell',
        targetOs: 'both',
        script: `param(
    [Parameter(Mandatory=$true)][string]$Hostname
)

Write-Host "Resolving hostname: $Hostname..."

try {
    $result = Resolve-DnsName -Name $Hostname -ErrorAction Stop
    Write-Host "SUCCESS: $Hostname resolved successfully"
    $result | ForEach-Object {
        Write-Host "  Type: $($_.Type), IP: $($_.IPAddress)"
    }
    exit 0
} catch {
    Write-Host "FAILED: Cannot resolve hostname $Hostname"
    Write-Host "Error: $($_.Exception.Message)"
    exit 1
}`,
        scriptBash: `#!/bin/bash
HOSTNAME="$1"

echo "Resolving hostname: $HOSTNAME..."

if result=$(nslookup "$HOSTNAME" 2>/dev/null | grep "Address:" | tail -n +2); then
    echo "SUCCESS: $HOSTNAME resolved successfully"
    echo "$result"
    exit 0
else
    echo "FAILED: Cannot resolve hostname $HOSTNAME"
    exit 1
fi`,
        parameters: [
          { key: 'Hostname', label: 'Hostname', type: 'string', required: true, placeholder: 'e.g., api.contoso.com' },
        ],
        expectedExitCode: 0,
        timeout: 30,
        isBuiltIn: true,
      },
      {
        name: 'HTTP Endpoint Check',
        description: 'Tests if an HTTP/HTTPS endpoint responds with expected status code',
        category: 'network',
        scriptType: 'powershell',
        targetOs: 'both',
        script: `param(
    [Parameter(Mandatory=$true)][string]$Url,
    [int]$ExpectedStatus = 200,
    [int]$Timeout = 30
)

Write-Host "Testing HTTP endpoint: $Url..."
Write-Host "Expected status code: $ExpectedStatus"

try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $Timeout -ErrorAction Stop
    $statusCode = $response.StatusCode
    
    if ($statusCode -eq $ExpectedStatus) {
        Write-Host "SUCCESS: Received status code $statusCode"
        exit 0
    } else {
        Write-Host "FAILED: Received status code $statusCode (expected $ExpectedStatus)"
        exit 1
    }
} catch {
    Write-Host "FAILED: Could not reach endpoint"
    Write-Host "Error: $($_.Exception.Message)"
    exit 1
}`,
        scriptBash: `#!/bin/bash
URL="$1"
EXPECTED_STATUS="\${2:-200}"
TIMEOUT="\${3:-30}"

echo "Testing HTTP endpoint: $URL..."
echo "Expected status code: $EXPECTED_STATUS"

STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout $TIMEOUT "$URL" 2>/dev/null)

if [ "$STATUS_CODE" = "$EXPECTED_STATUS" ]; then
    echo "SUCCESS: Received status code $STATUS_CODE"
    exit 0
else
    echo "FAILED: Received status code $STATUS_CODE (expected $EXPECTED_STATUS)"
    exit 1
fi`,
        parameters: [
          { key: 'Url', label: 'URL', type: 'string', required: true, placeholder: 'e.g., https://api.contoso.com/health' },
          { key: 'ExpectedStatus', label: 'Expected Status Code', type: 'number', required: false, default: 200 },
          { key: 'Timeout', label: 'Timeout (seconds)', type: 'number', required: false, default: 30 },
        ],
        expectedExitCode: 0,
        timeout: 60,
        isBuiltIn: true,
      },
      {
        name: 'Ping Test',
        description: 'Tests ICMP connectivity to a target host',
        category: 'network',
        scriptType: 'powershell',
        targetOs: 'both',
        script: `param(
    [Parameter(Mandatory=$true)][string]$TargetHost,
    [int]$Count = 4
)

Write-Host "Pinging $TargetHost ($Count packets)..."

$result = Test-Connection -ComputerName $TargetHost -Count $Count -ErrorAction SilentlyContinue

if ($result) {
    $avg = ($result | Measure-Object ResponseTime -Average).Average
    $loss = (($Count - $result.Count) / $Count) * 100
    Write-Host "SUCCESS: $TargetHost is reachable"
    Write-Host "  Packets: Sent=$Count, Received=$($result.Count), Lost=$($Count - $result.Count) ($loss% loss)"
    Write-Host "  Average latency: $([math]::Round($avg, 2))ms"
    exit 0
} else {
    Write-Host "FAILED: $TargetHost is not reachable"
    exit 1
}`,
        scriptBash: `#!/bin/bash
TARGET_HOST="$1"
COUNT="\${2:-4}"

echo "Pinging $TARGET_HOST ($COUNT packets)..."

if ping -c $COUNT "$TARGET_HOST" 2>/dev/null; then
    echo "SUCCESS: $TARGET_HOST is reachable"
    exit 0
else
    echo "FAILED: $TARGET_HOST is not reachable"
    exit 1
fi`,
        parameters: [
          { key: 'TargetHost', label: 'Target Host', type: 'string', required: true, placeholder: 'e.g., 10.0.0.1' },
          { key: 'Count', label: 'Ping Count', type: 'number', required: false, default: 4 },
        ],
        expectedExitCode: 0,
        timeout: 60,
        isBuiltIn: true,
      },
      // ==================
      // SERVICE TESTS
      // ==================
      {
        name: 'Service Running Check',
        description: 'Verifies that a specific service is running',
        category: 'service',
        scriptType: 'powershell',
        targetOs: 'both',
        script: `param(
    [Parameter(Mandatory=$true)][string]$ServiceName
)

Write-Host "Checking service: $ServiceName..."

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

if ($service) {
    Write-Host "Service found: $($service.DisplayName)"
    Write-Host "Status: $($service.Status)"
    Write-Host "Start Type: $($service.StartType)"
    
    if ($service.Status -eq 'Running') {
        Write-Host "SUCCESS: Service is running"
        exit 0
    } else {
        Write-Host "FAILED: Service is not running"
        exit 1
    }
} else {
    Write-Host "FAILED: Service '$ServiceName' not found"
    exit 1
}`,
        scriptBash: `#!/bin/bash
SERVICE_NAME="$1"

echo "Checking service: $SERVICE_NAME..."

if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo "SUCCESS: Service $SERVICE_NAME is running"
    systemctl status "$SERVICE_NAME" --no-pager 2>/dev/null | head -5
    exit 0
else
    echo "FAILED: Service $SERVICE_NAME is not running"
    systemctl status "$SERVICE_NAME" --no-pager 2>/dev/null | head -5
    exit 1
fi`,
        parameters: [
          { key: 'ServiceName', label: 'Service Name', type: 'string', required: true, placeholder: 'e.g., WinRM or sshd' },
        ],
        expectedExitCode: 0,
        timeout: 30,
        isBuiltIn: true,
      },
      {
        name: 'Process Running Check',
        description: 'Verifies that a specific process is running',
        category: 'service',
        scriptType: 'powershell',
        targetOs: 'both',
        script: `param(
    [Parameter(Mandatory=$true)][string]$ProcessName
)

Write-Host "Checking for process: $ProcessName..."

$processes = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue

if ($processes) {
    Write-Host "SUCCESS: Process '$ProcessName' is running"
    Write-Host "Instance count: $($processes.Count)"
    $processes | Select-Object Id, ProcessName, CPU, WorkingSet | Format-Table
    exit 0
} else {
    Write-Host "FAILED: Process '$ProcessName' is not running"
    exit 1
}`,
        scriptBash: `#!/bin/bash
PROCESS_NAME="$1"

echo "Checking for process: $PROCESS_NAME..."

if pgrep -x "$PROCESS_NAME" > /dev/null 2>&1; then
    echo "SUCCESS: Process $PROCESS_NAME is running"
    pgrep -x "$PROCESS_NAME" | xargs ps -p 2>/dev/null
    exit 0
else
    echo "FAILED: Process $PROCESS_NAME is not running"
    exit 1
fi`,
        parameters: [
          { key: 'ProcessName', label: 'Process Name', type: 'string', required: true, placeholder: 'e.g., sqlservr or nginx' },
        ],
        expectedExitCode: 0,
        timeout: 30,
        isBuiltIn: true,
      },
      // ==================
      // STORAGE TESTS
      // ==================
      {
        name: 'Disk Space Check',
        description: 'Verifies that a drive has minimum free space',
        category: 'storage',
        scriptType: 'powershell',
        targetOs: 'both',
        script: `param(
    [Parameter(Mandatory=$true)][string]$Drive,
    [Parameter(Mandatory=$true)][int]$MinFreeGB
)

Write-Host "Checking disk space on drive $Drive..."

$disk = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DeviceID='$Drive'" -ErrorAction SilentlyContinue

if ($disk) {
    $freeGB = [math]::Round($disk.FreeSpace / 1GB, 2)
    $totalGB = [math]::Round($disk.Size / 1GB, 2)
    $usedGB = $totalGB - $freeGB
    $usedPercent = [math]::Round(($usedGB / $totalGB) * 100, 1)
    
    Write-Host "Drive: $Drive"
    Write-Host "Total: $totalGB GB"
    Write-Host "Used: $usedGB GB ($usedPercent%)"
    Write-Host "Free: $freeGB GB"
    Write-Host "Required: $MinFreeGB GB free"
    
    if ($freeGB -ge $MinFreeGB) {
        Write-Host "SUCCESS: Sufficient disk space available"
        exit 0
    } else {
        Write-Host "FAILED: Insufficient disk space (need $MinFreeGB GB, have $freeGB GB)"
        exit 1
    }
} else {
    Write-Host "FAILED: Drive $Drive not found"
    exit 1
}`,
        scriptBash: `#!/bin/bash
MOUNT_POINT="$1"
MIN_FREE_GB="$2"

echo "Checking disk space on $MOUNT_POINT..."

if df -BG "$MOUNT_POINT" 2>/dev/null; then
    FREE_GB=$(df -BG "$MOUNT_POINT" 2>/dev/null | tail -1 | awk '{print $4}' | tr -d 'G')
    
    echo "Free space: \${FREE_GB}GB"
    echo "Required: \${MIN_FREE_GB}GB"
    
    if [ "$FREE_GB" -ge "$MIN_FREE_GB" ]; then
        echo "SUCCESS: Sufficient disk space available"
        exit 0
    else
        echo "FAILED: Insufficient disk space"
        exit 1
    fi
else
    echo "FAILED: Mount point $MOUNT_POINT not found"
    exit 1
fi`,
        parameters: [
          { key: 'Drive', label: 'Drive/Mount Point', type: 'string', required: true, placeholder: 'e.g., C: or /data' },
          { key: 'MinFreeGB', label: 'Minimum Free Space (GB)', type: 'number', required: true, placeholder: 'e.g., 10' },
        ],
        expectedExitCode: 0,
        timeout: 30,
        isBuiltIn: true,
      },
      {
        name: 'File Exists Check',
        description: 'Verifies that a specific file or folder exists',
        category: 'storage',
        scriptType: 'powershell',
        targetOs: 'both',
        script: `param(
    [Parameter(Mandatory=$true)][string]$Path
)

Write-Host "Checking path: $Path..."

if (Test-Path -Path $Path) {
    $item = Get-Item -Path $Path
    Write-Host "SUCCESS: Path exists"
    Write-Host "Type: $($item.GetType().Name)"
    Write-Host "Last Modified: $($item.LastWriteTime)"
    if ($item.PSIsContainer -eq $false) {
        Write-Host "Size: $([math]::Round($item.Length / 1KB, 2)) KB"
    }
    exit 0
} else {
    Write-Host "FAILED: Path does not exist"
    exit 1
}`,
        scriptBash: `#!/bin/bash
FILE_PATH="$1"

echo "Checking path: $FILE_PATH..."

if [ -e "$FILE_PATH" ]; then
    echo "SUCCESS: Path exists"
    ls -la "$FILE_PATH"
    exit 0
else
    echo "FAILED: Path does not exist"
    exit 1
fi`,
        parameters: [
          { key: 'Path', label: 'File/Folder Path', type: 'string', required: true, placeholder: 'e.g., C:\\App\\config.xml or /etc/nginx/nginx.conf' },
        ],
        expectedExitCode: 0,
        timeout: 30,
        isBuiltIn: true,
      },
      // ==================
      // SECURITY TESTS
      // ==================
      {
        name: 'Firewall Status Check',
        description: 'Verifies that the firewall is enabled',
        category: 'security',
        scriptType: 'powershell',
        targetOs: 'windows',
        script: `Write-Host "Checking Windows Firewall status..."

$profiles = Get-NetFirewallProfile

$allEnabled = $true
foreach ($profile in $profiles) {
    Write-Host "$($profile.Name) Profile: $($profile.Enabled)"
    if (-not $profile.Enabled) {
        $allEnabled = $false
    }
}

if ($allEnabled) {
    Write-Host "SUCCESS: All firewall profiles are enabled"
    exit 0
} else {
    Write-Host "FAILED: One or more firewall profiles are disabled"
    exit 1
}`,
        parameters: [],
        expectedExitCode: 0,
        timeout: 30,
        isBuiltIn: true,
      },
      {
        name: 'User Account Check',
        description: 'Verifies that a specific user account exists',
        category: 'security',
        scriptType: 'powershell',
        targetOs: 'both',
        script: `param(
    [Parameter(Mandatory=$true)][string]$Username
)

Write-Host "Checking for user account: $Username..."

$user = Get-LocalUser -Name $Username -ErrorAction SilentlyContinue

if ($user) {
    Write-Host "SUCCESS: User '$Username' exists"
    Write-Host "Enabled: $($user.Enabled)"
    Write-Host "Last Logon: $($user.LastLogon)"
    Write-Host "Password Expires: $($user.PasswordExpires)"
    exit 0
} else {
    Write-Host "FAILED: User '$Username' does not exist"
    exit 1
}`,
        scriptBash: `#!/bin/bash
USERNAME="$1"

echo "Checking for user account: $USERNAME..."

if id "$USERNAME" &>/dev/null; then
    echo "SUCCESS: User $USERNAME exists"
    id "$USERNAME"
    exit 0
else
    echo "FAILED: User $USERNAME does not exist"
    exit 1
fi`,
        parameters: [
          { key: 'Username', label: 'Username', type: 'string', required: true, placeholder: 'e.g., appuser' },
        ],
        expectedExitCode: 0,
        timeout: 30,
        isBuiltIn: true,
      },
    ];

    // Upsert built-in tests
    for (const testData of builtInTests) {
      const existing = await prisma.validationTest.findFirst({
        where: { name: testData.name, isBuiltIn: true },
      });

      if (!existing) {
        await prisma.validationTest.create({
          data: {
            name: testData.name,
            description: testData.description,
            category: testData.category,
            scriptType: testData.scriptType,
            targetOs: testData.targetOs,
            script: testData.script,
            scriptBash: testData.scriptBash,
            parameters: testData.parameters ? JSON.stringify(testData.parameters) : null,
            expectedExitCode: testData.expectedExitCode,
            outputContains: testData.outputContains,
            outputNotContains: testData.outputNotContains,
            timeout: testData.timeout,
            isBuiltIn: true,
            isShared: true,
          },
        });
        console.log(`[ValidationTestService] Created built-in test: ${testData.name}`);
      }
    }
  }

  // =============================================
  // HELPER METHODS
  // =============================================

  private formatTest(test: any) {
    return {
      ...test,
      parameters: test.parameters ? JSON.parse(test.parameters) : [],
    };
  }

  private formatSuite(suite: any) {
    return {
      ...suite,
      tests: suite.tests?.map((st: any) => ({
        ...st,
        test: this.formatTest(st.test),
      })),
    };
  }

  private formatAssignment(assignment: any) {
    return {
      ...assignment,
      parameters: assignment.parameters ? JSON.parse(assignment.parameters) : {},
      test: assignment.test ? this.formatTest(assignment.test) : null,
    };
  }

  private substituteParameters(
    script: string,
    params: Record<string, string | number | boolean>,
    scriptType: 'powershell' | 'bash'
  ): string {
    if (Object.keys(params).length === 0) {
      return script;
    }

    let result = script;
    let prefix = '';

    if (scriptType === 'powershell') {
      // PowerShell: Strip the param() block and prepend variable assignments
      // This prevents the param declaration from being broken by substitution
      // Find the param block by looking for the last closing parenthesis that matches
      const paramMatch = result.match(/^\s*param\s*\(/i);
      if (paramMatch) {
        // Find the matching closing parenthesis by counting brackets
        // Start with depth=1 since we're already inside param(
        let depth = 1;
        let inString = false;
        let stringChar = '';
        let endIndex = paramMatch.index! + paramMatch[0].length; // Start after 'param('
        
        for (let i = endIndex; i < result.length; i++) {
          const char = result[i];
          
          // Track string state
          if ((char === '"' || char === "'") && (i === 0 || result[i-1] !== '`')) {
            if (!inString) {
              inString = true;
              stringChar = char;
            } else if (char === stringChar) {
              inString = false;
            }
          }
          
          if (!inString) {
            if (char === '(') depth++;
            else if (char === ')') {
              depth--;
              if (depth === 0) {
                // Found the matching closing paren
                endIndex = i + 1;
                break;
              }
            }
          }
        }
        
        // Remove everything from start to after the closing paren and any whitespace
        result = result.substring(endIndex).replace(/^\s*/, '');
      }
      
      // Prepend variable assignments
      const assignments = Object.entries(params).map(([key, value]) => {
        // Properly escape string values
        const escapedValue = typeof value === 'string' 
          ? `"${value.replace(/"/g, '`"').replace(/\$/g, '`$')}"`
          : String(value);
        return `\$${key} = ${escapedValue}`;
      });
      prefix = assignments.join('\n') + '\n\n';
    } else {
      // Bash: Prepend variable assignments and positional parameters
      const assignments: string[] = [];
      const paramEntries = Object.entries(params);
      
      paramEntries.forEach(([key, value], index) => {
        // Set named variable
        const escapedValue = typeof value === 'string'
          ? `"${value.replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`
          : String(value);
        assignments.push(`${key}=${escapedValue}`);
        
        // Also set positional parameter variable (for scripts using $1, $2, etc.)
        // We can't actually set $1 in bash, but we can create set -- command
      });
      
      // For positional parameters, use 'set --' at the start
      const positionalValues = paramEntries.map(([_, value]) => {
        return typeof value === 'string'
          ? `"${value.replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`
          : String(value);
      });
      
      prefix = assignments.join('\n') + '\n';
      if (positionalValues.length > 0) {
        prefix += `set -- ${positionalValues.join(' ')}\n`;
      }
      prefix += '\n';
    }

    return prefix + result;
  }

  private calculateNextRunTime(assignment: {
    scheduleType: string;
    intervalMinutes: number | null;
    cronExpression: string | null;
  }): Date | null {
    if (assignment.scheduleType === 'interval' && assignment.intervalMinutes) {
      return new Date(Date.now() + assignment.intervalMinutes * 60 * 1000);
    }
    // TODO: Parse cron expression for next run time
    return null;
  }
}

export const validationTestService = new ValidationTestService();

