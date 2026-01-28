/**
 * Azure VM Service - Handles VM discovery and Run Command operations
 * Uses the existing Azure config from Settings page
 */

import { azureConfigService } from './azure-config.service.js';

interface AzureVM {
  id: string;           // Full resource ID
  name: string;
  resourceGroup: string;
  subscriptionId: string;
  location: string;
  osType: 'Windows' | 'Linux';
  osVersion?: string;
  vmSize: string;
  powerState: string;
  provisioningState: string;
  tags: Record<string, string>;
}

interface RunCommandResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
  operationId?: string;
}

interface RunCommandStatus {
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: string;
  error?: string;
  exitCode?: number;
  startTime?: string;
  endTime?: string;
}

class AzureVMService {
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  /**
   * Get Azure access token using existing config credentials
   */
  private async getAccessToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured. Please configure Azure credentials in Settings.');
    }

    const { tenantId, clientId, clientSecret } = config;
    if (!tenantId || !clientId || !clientSecret) {
      throw new Error('Missing Azure credentials. Please check Settings.');
    }

    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://management.azure.com/.default',
        grant_type: 'client_credentials',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get Azure token: ${error}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    // Set expiry 5 minutes before actual expiry for safety
    this.tokenExpiry = new Date(Date.now() + (data.expires_in - 300) * 1000);
    
    return this.accessToken;
  }

  /**
   * Make authenticated request to Azure Management API
   */
  private async makeRequest<T>(
    method: string,
    url: string,
    body?: object
  ): Promise<T> {
    const token = await this.getAccessToken();
    
    const options: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure API error: ${response.status} - ${errorText}`);
    }

    // Handle 202 Accepted (async operation)
    if (response.status === 202) {
      const location = response.headers.get('Azure-AsyncOperation') || response.headers.get('Location');
      return { asyncOperation: true, operationUrl: location } as T;
    }

    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }

  /**
   * List all VMs in the subscription
   */
  async listVMs(filters?: {
    resourceGroup?: string;
    tags?: Record<string, string>;
  }): Promise<AzureVM[]> {
    const config = await azureConfigService.getConfig();
    if (!config?.subscriptionId) {
      throw new Error('Subscription not configured');
    }

    let url = `https://management.azure.com/subscriptions/${config.subscriptionId}/providers/Microsoft.Compute/virtualMachines?api-version=2024-07-01`;
    
    if (filters?.resourceGroup) {
      url = `https://management.azure.com/subscriptions/${config.subscriptionId}/resourceGroups/${filters.resourceGroup}/providers/Microsoft.Compute/virtualMachines?api-version=2024-07-01`;
    }

    interface VMListResponse {
      value: Array<{
        id: string;
        name: string;
        location: string;
        tags?: Record<string, string>;
        properties: {
          vmId: string;
          hardwareProfile: { vmSize: string };
          storageProfile: {
            osDisk: {
              osType: string;
            };
            imageReference?: {
              offer?: string;
              sku?: string;
            };
          };
          provisioningState: string;
          instanceView?: {
            statuses?: Array<{ code: string; displayStatus: string }>;
          };
        };
      }>;
      nextLink?: string;
    }

    const response = await this.makeRequest<VMListResponse>('GET', url);
    
    const vms: AzureVM[] = response.value.map(vm => {
      // Extract resource group from ID
      const rgMatch = vm.id.match(/resourceGroups\/([^/]+)/i);
      const resourceGroup = rgMatch ? rgMatch[1] : '';
      
      // Extract subscription from ID
      const subMatch = vm.id.match(/subscriptions\/([^/]+)/i);
      const subscriptionId = subMatch ? subMatch[1] : config.subscriptionId!;

      // Get power state
      const powerStatus = vm.properties.instanceView?.statuses?.find(s => s.code.startsWith('PowerState/'));
      const powerState = powerStatus?.displayStatus || 'Unknown';

      return {
        id: vm.id,
        name: vm.name,
        resourceGroup,
        subscriptionId,
        location: vm.location,
        osType: (vm.properties.storageProfile.osDisk.osType as 'Windows' | 'Linux') || 'Windows',
        osVersion: vm.properties.storageProfile.imageReference?.sku,
        vmSize: vm.properties.hardwareProfile.vmSize,
        powerState,
        provisioningState: vm.properties.provisioningState,
        tags: vm.tags || {},
      };
    });

    // Apply tag filters if specified
    if (filters?.tags) {
      return vms.filter(vm => {
        for (const [key, value] of Object.entries(filters.tags!)) {
          if (vm.tags[key] !== value) {
            return false;
          }
        }
        return true;
      });
    }

    return vms;
  }

  /**
   * Get VM details with instance view (power state)
   */
  async getVM(vmId: string): Promise<AzureVM | null> {
    try {
      const url = `https://management.azure.com${vmId}?$expand=instanceView&api-version=2024-07-01`;
      
      interface VMResponse {
        id: string;
        name: string;
        location: string;
        tags?: Record<string, string>;
        properties: {
          vmId: string;
          hardwareProfile: { vmSize: string };
          storageProfile: {
            osDisk: { osType: string };
            imageReference?: { offer?: string; sku?: string };
          };
          provisioningState: string;
          instanceView?: {
            statuses?: Array<{ code: string; displayStatus: string }>;
          };
        };
      }

      const vm = await this.makeRequest<VMResponse>('GET', url);
      
      const rgMatch = vm.id.match(/resourceGroups\/([^/]+)/i);
      const resourceGroup = rgMatch ? rgMatch[1] : '';
      
      const subMatch = vm.id.match(/subscriptions\/([^/]+)/i);
      const subscriptionId = subMatch ? subMatch[1] : '';

      const powerStatus = vm.properties.instanceView?.statuses?.find(s => s.code.startsWith('PowerState/'));
      const powerState = powerStatus?.displayStatus || 'Unknown';

      return {
        id: vm.id,
        name: vm.name,
        resourceGroup,
        subscriptionId,
        location: vm.location,
        osType: (vm.properties.storageProfile.osDisk.osType as 'Windows' | 'Linux') || 'Windows',
        osVersion: vm.properties.storageProfile.imageReference?.sku,
        vmSize: vm.properties.hardwareProfile.vmSize,
        powerState,
        provisioningState: vm.properties.provisioningState,
        tags: vm.tags || {},
      };
    } catch (error) {
      console.error('[AzureVMService] Failed to get VM:', error);
      return null;
    }
  }

  /**
   * Get all unique tags across VMs
   */
  async getAllTags(): Promise<{ key: string; values: string[] }[]> {
    const vms = await this.listVMs();
    const tagMap = new Map<string, Set<string>>();

    for (const vm of vms) {
      for (const [key, value] of Object.entries(vm.tags)) {
        if (!tagMap.has(key)) {
          tagMap.set(key, new Set());
        }
        tagMap.get(key)!.add(value);
      }
    }

    return Array.from(tagMap.entries()).map(([key, values]) => ({
      key,
      values: Array.from(values).sort(),
    }));
  }

  /**
   * Get resource groups that contain VMs
   */
  async getResourceGroupsWithVMs(): Promise<string[]> {
    const vms = await this.listVMs();
    const resourceGroups = new Set(vms.map(vm => vm.resourceGroup));
    return Array.from(resourceGroups).sort();
  }

  /**
   * Run a command on a VM using the synchronous action-based Run Command API.
   * This API returns output directly for short scripts.
   * For longer scripts, it may return 202 Accepted and we poll for completion.
   */
  async runCommandAction(
    vmId: string,
    script: string,
    scriptType: 'powershell' | 'bash'
  ): Promise<RunCommandResult> {
    // The action-based endpoint uses commandId and script format
    const commandId = scriptType === 'powershell' ? 'RunPowerShellScript' : 'RunShellScript';
    
    // Build the script array (Azure expects array of lines for action-based API)
    const scriptLines = script.split('\n');

    const url = `https://management.azure.com${vmId}/runCommand?api-version=2024-07-01`;
    
    const body = {
      commandId: commandId,
      script: scriptLines,
    };

    console.log(`[AzureVMService] Running command action on ${vmId}:`, {
      commandId,
      scriptLineCount: scriptLines.length,
    });

    const token = await this.getAccessToken();
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      console.log(`[AzureVMService] Run command action response status: ${response.status}`);

      // Check for 202 Accepted (async operation)
      if (response.status === 202) {
        const operationUrl = response.headers.get('Azure-AsyncOperation') || 
                            response.headers.get('Location');
        console.log(`[AzureVMService] Async operation started, polling URL:`, operationUrl);
        
        if (operationUrl) {
          // Poll for completion
          return await this.pollAsyncOperation(operationUrl);
        } else {
          // No operation URL, fall back to the resource-based API
          console.log(`[AzureVMService] No operation URL, falling back to resource-based API`);
          return await this.runCommandSync(vmId, script, scriptType, {}, 300);
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[AzureVMService] Run command action failed:`, {
          status: response.status,
          error: errorText,
        });
        return {
          success: false,
          error: `Azure API error (${response.status}): ${errorText}`,
        };
      }

      // Get response text first to handle empty bodies
      const responseText = await response.text();
      if (!responseText || responseText.trim() === '') {
        console.log(`[AzureVMService] Empty response body, falling back to resource-based API`);
        return await this.runCommandSync(vmId, script, scriptType, {}, 300);
      }

      interface ActionResponse {
        value?: Array<{
          code?: string;
          level?: string;
          displayStatus?: string;
          message?: string;
        }>;
      }

      const result: ActionResponse = JSON.parse(responseText);
      console.log(`[AzureVMService] Run command action result:`, JSON.stringify(result, null, 2));

      // Parse the response - action-based API returns value array with output
      const values = result.value || [];
      let output = '';
      let error = '';
      let exitCode = 0;

      for (const item of values) {
        if (item.code === 'ComponentStatus/StdOut/succeeded' || 
            item.displayStatus === 'Provisioning succeeded') {
          output = item.message || '';
        } else if (item.code === 'ComponentStatus/StdErr/succeeded') {
          error = item.message || '';
        } else if (item.code?.includes('StdErr') || item.level === 'Error') {
          error = item.message || '';
        }
      }

      // Check if there's an error in stderr
      const hasError = error && error.trim().length > 0 && 
                       !error.toLowerCase().includes('warning');
      
      // Try to extract exit code from output if available
      // (Azure doesn't always provide exit code in action-based API)
      const exitCodeMatch = output.match(/exit\s*code[:\s]+(\d+)/i);
      if (exitCodeMatch) {
        exitCode = parseInt(exitCodeMatch[1], 10);
      }

      return {
        success: !hasError && exitCode === 0,
        output: output || undefined,
        error: error || undefined,
        exitCode,
      };
    } catch (fetchError) {
      console.error(`[AzureVMService] Run command action fetch error:`, fetchError);
      // Fall back to resource-based API on any error
      console.log(`[AzureVMService] Falling back to resource-based API due to error`);
      return await this.runCommandSync(vmId, script, scriptType, {}, 300);
    }
  }

  /**
   * Poll an async operation URL until completion
   */
  private async pollAsyncOperation(operationUrl: string): Promise<RunCommandResult> {
    const token = await this.getAccessToken();
    const maxWait = 300000; // 5 minutes
    const startTime = Date.now();
    const pollInterval = 3000; // 3 seconds

    while (Date.now() - startTime < maxWait) {
      try {
        const response = await fetch(operationUrl, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        interface AsyncPollResult {
          status: string;
          properties?: {
            output?: {
              value?: Array<{
                code?: string;
                level?: string;
                displayStatus?: string;
                message?: string;
              }>;
            };
            error?: string;
          };
          error?: {
            message?: string;
          };
        }

        const result: AsyncPollResult = await response.json();
        console.log(`[AzureVMService] Async poll result:`, JSON.stringify(result, null, 2));

        // Check if operation is complete
        if (result.status === 'Succeeded' || result.status === 'Completed') {
          // Extract output from result - handle both string and Azure response object format
          let output = '';
          let error = '';
          
          // Handle nested value array format from Azure Run Command
          const outputValue = result.properties?.output;
          if (typeof outputValue === 'string') {
            output = outputValue;
          } else if (outputValue?.value) {
            // Parse the value array (same format as action-based API)
            for (const item of outputValue.value) {
              if (item.code === 'ComponentStatus/StdOut/succeeded') {
                output = item.message || '';
              } else if (item.code === 'ComponentStatus/StdErr/succeeded') {
                error = item.message || '';
              }
            }
          }
          
          const hasError = error && error.trim().length > 0 && 
                          !error.toLowerCase().includes('warning');
          
          return {
            success: !hasError,
            output: output || undefined,
            error: error || undefined,
            exitCode: hasError ? 1 : 0,
          };
        } else if (result.status === 'Failed' || result.status === 'Canceled') {
          return {
            success: false,
            error: result.error?.message || 'Operation failed',
            exitCode: 1,
          };
        }

        // Still in progress, wait and poll again
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        console.error(`[AzureVMService] Async poll error:`, error);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    return {
      success: false,
      error: 'Async operation timed out',
    };
  }

  /**
   * Run a command on a VM using Azure Run Command (async resource-based API)
   * Returns immediately with operation ID - use getRunCommandStatus to poll
   */
  async runCommand(
    vmId: string,
    script: string,
    scriptType: 'powershell' | 'bash',
    parameters?: Record<string, string>,
    timeout?: number
  ): Promise<{ operationUrl: string; runCommandName: string }> {
    // Generate unique run command name
    const runCommandName = `drmigrate-${Date.now()}`;
    
    // Build the script array (Azure expects array of lines)
    const scriptLines = script.split('\n');

    // Determine command ID based on script type
    const commandId = scriptType === 'powershell' ? 'RunPowerShellScript' : 'RunShellScript';

    // Build parameters array for Azure
    const azureParams = parameters 
      ? Object.entries(parameters).map(([name, value]) => ({ name, value }))
      : undefined;

    const url = `https://management.azure.com${vmId}/runCommands/${runCommandName}?api-version=2024-07-01`;
    
    const body = {
      location: 'eastus', // Will be overwritten by actual VM location
      properties: {
        source: {
          script: script,
        },
        parameters: azureParams,
        timeoutInSeconds: timeout || 3600,
        asyncExecution: true,
      },
    };

    // Get VM location first
    const vm = await this.getVM(vmId);
    if (vm) {
      body.location = vm.location;
    }

    console.log(`[AzureVMService] Running command on ${vmId}:`, {
      runCommandName,
      scriptType,
      paramCount: azureParams?.length || 0,
    });

    interface AsyncResponse {
      asyncOperation?: boolean;
      operationUrl?: string;
    }

    const response = await this.makeRequest<AsyncResponse>('PUT', url, body);
    
    return {
      operationUrl: response.operationUrl || url,
      runCommandName,
    };
  }

  /**
   * Get the status of a running command
   */
  async getRunCommandStatus(vmId: string, runCommandName: string): Promise<RunCommandStatus> {
    const url = `https://management.azure.com${vmId}/runCommands/${runCommandName}?$expand=instanceView&api-version=2024-07-01`;
    
    interface RunCommandResponse {
      properties: {
        provisioningState: string;
        instanceView?: {
          executionState: string;
          exitCode?: number;
          output?: string;
          error?: string;
          startTime?: string;
          endTime?: string;
        };
      };
    }

    try {
      const response = await this.makeRequest<RunCommandResponse>('GET', url);
      
      const instanceView = response.properties.instanceView;
      const provisioningState = response.properties.provisioningState;
      
      console.log(`[AzureVMService] Run command status for ${runCommandName}:`, {
        provisioningState,
        executionState: instanceView?.executionState,
        exitCode: instanceView?.exitCode,
        hasOutput: !!instanceView?.output,
        outputLength: instanceView?.output?.length || 0,
        hasError: !!instanceView?.error,
      });

      // Map Azure states to our states
      // IMPORTANT: Check executionState FIRST since it indicates actual script status
      // provisioningState === 'Succeeded' just means the Run Command resource was created,
      // not that the script finished executing
      let status: RunCommandStatus['status'] = 'pending';
      
      // Check executionState first - it has priority over provisioningState
      if (instanceView?.executionState === 'Succeeded') {
        // Script finished successfully
        status = 'completed';
      } else if (instanceView?.executionState === 'Failed') {
        // Script failed (even if provisioningState is still 'Creating')
        status = 'failed';
      } else if (instanceView?.executionState === 'Running') {
        status = 'running';
      } else if (provisioningState === 'Failed') {
        status = 'failed';
      } else if (provisioningState === 'Creating' || provisioningState === 'Updating') {
        status = 'running';
      } else if (provisioningState === 'Succeeded' && !instanceView?.executionState) {
        // Provisioning done but execution not started yet
        status = 'running';
      }

      return {
        status,
        output: instanceView?.output,
        error: instanceView?.error,
        exitCode: instanceView?.exitCode,
        startTime: instanceView?.startTime,
        endTime: instanceView?.endTime,
      };
    } catch (error) {
      console.error('[AzureVMService] Failed to get run command status:', error);
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Delete a run command resource (cleanup after execution)
   */
  async deleteRunCommand(vmId: string, runCommandName: string): Promise<void> {
    const url = `https://management.azure.com${vmId}/runCommands/${runCommandName}?api-version=2024-07-01`;
    
    try {
      await this.makeRequest('DELETE', url);
    } catch (error) {
      // Ignore errors during cleanup
      console.warn('[AzureVMService] Failed to delete run command:', error);
    }
  }

  /**
   * Run command synchronously (waits for completion)
   * Use this for short-running scripts
   */
  async runCommandSync(
    vmId: string,
    script: string,
    scriptType: 'powershell' | 'bash',
    parameters?: Record<string, string>,
    timeout?: number,
    pollInterval: number = 5000
  ): Promise<RunCommandResult> {
    const { runCommandName } = await this.runCommand(vmId, script, scriptType, parameters, timeout);
    
    const maxWait = (timeout || 3600) * 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const status = await this.getRunCommandStatus(vmId, runCommandName);
      
      if (status.status === 'completed') {
        // Cleanup
        await this.deleteRunCommand(vmId, runCommandName);
        return {
          success: true,
          output: status.output,
          exitCode: status.exitCode,
        };
      }
      
      if (status.status === 'failed') {
        // Cleanup
        await this.deleteRunCommand(vmId, runCommandName);
        return {
          success: false,
          error: status.error || 'Command failed',
          exitCode: status.exitCode,
        };
      }

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Timeout
    await this.deleteRunCommand(vmId, runCommandName);
    return {
      success: false,
      error: 'Command timed out',
    };
  }
}

export const azureVMService = new AzureVMService();

