import { ClientSecretCredential } from '@azure/identity';
import { azureConfigService } from './azure-config.service.js';
import { machineService } from './machine.service.js';
import { activityService } from './activity.service.js';

// Azure Migrate REST API endpoints
const AZURE_MGMT_URL = 'https://management.azure.com';

export interface AzureMigrateSite {
  id: string;
  name: string;
  type: 'VMware' | 'HyperV' | 'Physical';
  location: string;
  properties: {
    servicePrincipalIdentityDetails?: {
      tenantId: string;
      objectId: string;
    };
    agentDetails?: {
      id: string;
      version: string;
      lastHeartBeatUtc: string;
    };
  };
}

export interface AzureMigrateDiscoveredMachine {
  id: string;
  name: string;
  type: string;
  properties: {
    displayName: string;
    hostName?: string;
    ipAddresses?: string[];
    operatingSystemDetails?: {
      osName?: string;
      osType?: string;
      osVersion?: string;
    };
    numberOfCores?: number;
    megabytesOfMemory?: number;
    disks?: Record<string, { megabytesOfSize: number }>;
    powerStatus?: string;
    vCenterFQDN?: string;
    createdTimestamp?: string;
    updatedTimestamp?: string;
  };
}

class AzureMigrateService {
  private async getCredential(): Promise<ClientSecretCredential | null> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured || !config.tenantId || !config.clientId || !config.clientSecret) {
      return null;
    }

    return new ClientSecretCredential(
      config.tenantId,
      config.clientId,
      config.clientSecret
    );
  }

  private async getAccessToken(): Promise<string | null> {
    const credential = await this.getCredential();
    if (!credential) return null;

    try {
      const token = await credential.getToken('https://management.azure.com/.default');
      return token.token;
    } catch (error) {
      console.error('Failed to get Azure access token:', error);
      return null;
    }
  }

  private async makeRequest<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T | null> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Azure not configured or authentication failed');
    }

    const response = await fetch(`${AZURE_MGMT_URL}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Azure API error: ${response.status} - ${errorText}`);
      throw new Error(`Azure API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get list of VMware sites in the migrate project
   */
  async getSites(): Promise<AzureMigrateSite[]> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    // First, list all resources to find VMware sites
    const resources = await this.listResources() as Array<{ type: string; name: string; id: string; location: string }>;
    const vmwareSites = resources.filter(r => r.type === 'Microsoft.OffAzure/VMwareSites');

    if (vmwareSites.length > 0) {
      return vmwareSites.map(site => ({
        id: site.id,
        name: site.name,
        type: 'VMware' as const,
        location: site.location,
        properties: {},
      }));
    }

    // Fallback: Try direct API calls with different versions
    const endpoints = [
      `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.OffAzure/VMwareSites?api-version=2020-07-07`,
      `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.OffAzure/vmwareSites?api-version=2023-06-06`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await this.makeRequest<{ value: AzureMigrateSite[] }>('GET', endpoint);
        if (response?.value && response.value.length > 0) {
          return response.value;
        }
      } catch (e) {
        console.log(`Endpoint ${endpoint} failed:`, e);
        // Try next endpoint
      }
    }

    return [];
  }

  /**
   * Get discovered machines directly from Azure Migrate assessment project
   */
  async getAssessmentProjectMachines(): Promise<AzureMigrateDiscoveredMachine[]> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    // Try to get machines from assessment project
    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Migrate/assessmentProjects/${config.migrateProjectName}/machines?api-version=2019-10-01`;
    
    try {
      const response = await this.makeRequest<{ value: AzureMigrateDiscoveredMachine[] }>(
        'GET',
        endpoint
      );
      return response?.value || [];
    } catch (e) {
      console.log('Assessment project machines endpoint failed:', e);
      return [];
    }
  }

  /**
   * Diagnostic: List available resources in resource group
   */
  async listResources(): Promise<unknown[]> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/resources?api-version=2021-04-01`;
    
    const response = await this.makeRequest<{ value: unknown[] }>('GET', endpoint);
    return response?.value || [];
  }

  /**
   * Get discovered machines from a VMware site
   */
  async getDiscoveredMachines(siteName: string): Promise<AzureMigrateDiscoveredMachine[]> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    // Try multiple API versions
    const apiVersions = ['2023-06-06', '2022-10-27', '2020-07-10'];
    
    for (const apiVersion of apiVersions) {
      try {
        const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.OffAzure/VMwareSites/${siteName}/machines?api-version=${apiVersion}`;
        
        const response = await this.makeRequest<{ value: AzureMigrateDiscoveredMachine[] }>(
          'GET',
          endpoint
        );
        if (response?.value) {
          console.log(`Successfully fetched machines using API version ${apiVersion}`);
          return response.value;
        }
      } catch (e) {
        console.log(`API version ${apiVersion} failed:`, e);
        // Try next version
      }
    }
    
    return [];
  }

  /**
   * Sync machines from Azure Migrate to local database
   */
  async syncMachines(): Promise<{ count: number; sites: string[]; source: string }> {
    let totalCount = 0;
    const siteNames: string[] = [];
    let source = 'unknown';

    // First try VMware sites
    const sites = await this.getSites();
    
    if (sites.length > 0) {
      source = 'vmware-sites';
      for (const site of sites) {
        siteNames.push(site.name);
        const machines = await this.getDiscoveredMachines(site.name);

        const machinesData = machines.map((m) => {
          const disks = m.properties.disks || {};
          const diskCount = Object.keys(disks).length;
          const diskSizeGB = Object.values(disks).reduce(
            (sum, d) => sum + (d.megabytesOfSize || 0) / 1024,
            0
          );

          return {
            azureMigrateId: m.id,
            siteId: site.id,
            siteName: site.name,
            displayName: m.properties.displayName,
            hostName: m.properties.hostName,
            ipAddresses: m.properties.ipAddresses || [],
            operatingSystem: m.properties.operatingSystemDetails?.osName,
            cpuCores: m.properties.numberOfCores,
            memoryMB: m.properties.megabytesOfMemory,
            diskCount,
            diskSizeGB: Math.round(diskSizeGB),
            powerState: m.properties.powerStatus,
            vCenterName: m.properties.vCenterFQDN,
          };
        });

        const count = await machineService.saveDiscoveredMachines(machinesData);
        totalCount += count;
      }
    } else {
      // Fallback: Try assessment project machines API
      console.log('No VMware sites found, trying assessment project machines...');
      source = 'assessment-project';
      const machines = await this.getAssessmentProjectMachines();
      
      if (machines.length > 0) {
        const config = await azureConfigService.getConfig();
        siteNames.push(config?.migrateProjectName || 'assessment-project');

        const machinesData = machines.map((m) => {
          const disks = m.properties.disks || {};
          const diskCount = Object.keys(disks).length;
          const diskSizeGB = Object.values(disks).reduce(
            (sum, d) => sum + (d.megabytesOfSize || 0) / 1024,
            0
          );

          return {
            azureMigrateId: m.id,
            siteId: config?.migrateProjectName || 'unknown',
            siteName: config?.migrateProjectName,
            displayName: m.properties.displayName || m.name,
            hostName: m.properties.hostName,
            ipAddresses: m.properties.ipAddresses || [],
            operatingSystem: m.properties.operatingSystemDetails?.osName,
            cpuCores: m.properties.numberOfCores,
            memoryMB: m.properties.megabytesOfMemory,
            diskCount,
            diskSizeGB: Math.round(diskSizeGB),
            powerState: m.properties.powerStatus,
            vCenterName: m.properties.vCenterFQDN,
          };
        });

        const count = await machineService.saveDiscoveredMachines(machinesData);
        totalCount += count;
      }
    }

    // Log activity
    if (totalCount > 0) {
      await activityService.log({
        type: 'discovery',
        action: 'synced',
        title: `Synced ${totalCount} machines from Azure Migrate`,
        description: `Source: ${source}, Sites: ${siteNames.join(', ')}`,
        status: 'success',
        metadata: { count: totalCount, sites: siteNames, source },
      });
    }

    return { count: totalCount, sites: siteNames, source };
  }

  /**
   * Get groups from Azure Migrate assessment project
   */
  async getAzureGroups(): Promise<Array<{
    id: string;
    name: string;
    properties: {
      machines?: string[];
      machineCount?: number;
      createdTimestamp?: string;
      updatedTimestamp?: string;
      areAssessmentsRunning?: boolean;
    };
  }>> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    // First, find the assessment project
    const resources = await this.listResources() as Array<{ type: string; name: string }>;
    const assessmentProject = resources.find(r => r.type === 'Microsoft.Migrate/assessmentProjects');
    
    if (!assessmentProject) {
      console.log('No assessment project found in resources:', resources.map(r => r.type));
      return [];
    }

    const projectName = assessmentProject.name;
    console.log(`Found assessment project: ${projectName}`);

    // Try different API versions
    const apiVersions = ['2023-03-15', '2019-10-01', '2023-04-01-preview'];
    
    for (const apiVersion of apiVersions) {
      const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Migrate/assessmentProjects/${projectName}/groups?api-version=${apiVersion}`;

      try {
        console.log(`Trying groups endpoint with API version ${apiVersion}...`);
        const response = await this.makeRequest<{ value: Array<{
          id: string;
          name: string;
          properties: {
            machines?: string[];
            machineCount?: number;
            createdTimestamp?: string;
            updatedTimestamp?: string;
            areAssessmentsRunning?: boolean;
          };
        }> }>('GET', endpoint);
        
        if (response?.value) {
          console.log(`Found ${response.value.length} groups using API version ${apiVersion}`);
          return response.value;
        }
      } catch (e) {
        console.log(`API version ${apiVersion} failed:`, e);
        // Try next version
      }
    }
    
    return [];
  }

  /**
   * Get assessments directly from Azure Migrate assessment project
   * Uses the newer API that lists all assessments at project level
   */
  async getAzureAssessments(): Promise<Array<{
    id: string;
    name: string;
    type: string;
    groupName?: string;
    properties: {
      status?: string;
      azureLocation?: string;
      createdTimestamp?: string;
      updatedTimestamp?: string;
      pricesTimestamp?: string;
      monthlyComputeCost?: number;
      monthlyStorageCost?: number;
      monthlyBandwidthCost?: number;
      numberOfMachines?: number;
      sizingCriterion?: string;
      assessmentType?: string;
    };
  }>> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    // First, find the assessment project
    const resources = await this.listResources() as Array<{ type: string; name: string }>;
    const assessmentProject = resources.find(r => r.type === 'Microsoft.Migrate/assessmentProjects');
    
    if (!assessmentProject) {
      console.log('No assessment project found');
      return [];
    }

    const projectName = assessmentProject.name;
    console.log(`Fetching assessments from project: ${projectName}`);

    // Try different API endpoints for assessments
    const allAssessments: Array<{
      id: string;
      name: string;
      type: string;
      groupName?: string;
      properties: {
        status?: string;
        azureLocation?: string;
        createdTimestamp?: string;
        updatedTimestamp?: string;
        pricesTimestamp?: string;
        monthlyComputeCost?: number;
        monthlyStorageCost?: number;
        monthlyBandwidthCost?: number;
        numberOfMachines?: number;
        sizingCriterion?: string;
        assessmentType?: string;
      };
    }> = [];

    // Try different assessment endpoints for various assessment types
    // Azure Migrate uses different resource types for different assessment types
    const assessmentEndpoints = [
      // Azure VM assessments (newer API)
      { path: `assessments`, apiVersion: '2023-03-15', type: 'Azure VM' },
      { path: `assessments`, apiVersion: '2019-10-01', type: 'Azure VM' },
      // AVS (Azure VMware Solution) assessments
      { path: `avsAssessments`, apiVersion: '2023-03-15', type: 'Azure VMware Solution' },
      // SQL assessments
      { path: `sqlAssessments`, apiVersion: '2023-03-15', type: 'Azure SQL' },
      { path: `sqlDbAssessments`, apiVersion: '2023-03-15', type: 'Azure SQL DB' },
      { path: `sqlMiAssessments`, apiVersion: '2023-03-15', type: 'Azure SQL MI' },
      // Web App assessments
      { path: `webAppAssessments`, apiVersion: '2023-03-15', type: 'Azure Web App' },
      // AKS assessments
      { path: `aksAssessments`, apiVersion: '2023-03-15', type: 'Azure AKS' },
      // Business cases
      { path: `businessCases`, apiVersion: '2023-03-15', type: 'Business Case' },
      // Discovered machines with recommendations
      { path: `vmwareCollectors`, apiVersion: '2023-03-15', type: 'VMware Collector' },
    ];

    const vmAssessmentsEndpoints = assessmentEndpoints.map(ep => ({
      url: `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Migrate/assessmentProjects/${projectName}/${ep.path}?api-version=${ep.apiVersion}`,
      type: ep.type,
    }));

    for (const ep of vmAssessmentsEndpoints) {
      try {
        const response = await this.makeRequest<{ value: Array<{
          id: string;
          name: string;
          type: string;
          properties: Record<string, unknown>;
        }> }>('GET', ep.url);
        
        if (response?.value && response.value.length > 0) {
          console.log(`Found ${response.value.length} ${ep.type} from API`);
          allAssessments.push(...response.value.map(a => ({
            id: a.id,
            name: a.name,
            type: ep.type,
            properties: {
              status: a.properties?.status as string || a.properties?.provisioningState as string,
              azureLocation: a.properties?.azureLocation as string || a.properties?.settings?.azureLocation as string,
              createdTimestamp: a.properties?.createdTimestamp as string,
              updatedTimestamp: a.properties?.updatedTimestamp as string,
              sizingCriterion: a.properties?.sizingCriterion as string || a.properties?.settings?.sizingCriterion as string,
              assessmentType: a.properties?.assessmentType as string,
              numberOfMachines: a.properties?.machineCount as number || a.properties?.assessedMachineCount as number,
              monthlyComputeCost: a.properties?.monthlyComputeCost as number,
              monthlyStorageCost: a.properties?.monthlyStorageCost as number,
            },
          })));
        }
      } catch (e) {
        // Skip failed endpoints silently
      }
    }

    // Also try to list groups and their assessments (legacy approach)
    try {
      const groups = await this.getAzureGroups();
      for (const group of groups) {
        const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Migrate/assessmentProjects/${projectName}/groups/${group.name}/assessments?api-version=2019-10-01`;
        
        try {
          const response = await this.makeRequest<{ value: Array<{
            id: string;
            name: string;
            properties: Record<string, unknown>;
          }> }>('GET', endpoint);
          
          if (response?.value) {
            allAssessments.push(...response.value.map(a => ({
              id: a.id,
              name: a.name,
              type: 'Azure VM',
              groupName: group.name,
              properties: {
                status: a.properties?.status as string,
                azureLocation: a.properties?.azureLocation as string,
                createdTimestamp: a.properties?.createdTimestamp as string,
                updatedTimestamp: a.properties?.updatedTimestamp as string,
                numberOfMachines: a.properties?.numberOfMachines as number,
                monthlyComputeCost: a.properties?.monthlyComputeCost as number,
                monthlyStorageCost: a.properties?.monthlyStorageCost as number,
              },
            })));
          }
        } catch (e) {
          // Skip failed group
        }
      }
    } catch (e) {
      console.log('Failed to fetch group assessments:', e);
    }

    // Try fetching from MigrateProject solutions
    try {
      const migrateProjectAssessments = await this.getAssessmentsFromMigrateProject();
      allAssessments.push(...migrateProjectAssessments);
    } catch (e) {
      console.log('Failed to fetch from migrate project:', e);
    }

    return allAssessments;
  }

  /**
   * Get assessments from MigrateProject (newer structure used by Azure Portal)
   */
  async getAssessmentsFromMigrateProject(): Promise<Array<{
    id: string;
    name: string;
    type: string;
    groupName?: string;
    properties: {
      status?: string;
      azureLocation?: string;
      createdTimestamp?: string;
      updatedTimestamp?: string;
      sizingCriterion?: string;
    };
  }>> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return [];
    }

    const resources = await this.listResources() as Array<{ type: string; name: string }>;
    const migrateProject = resources.find(r => r.type === 'Microsoft.Migrate/migrateprojects');
    
    if (!migrateProject) {
      console.log('No migrate project found');
      return [];
    }

    console.log(`Fetching assessments from migrate project: ${migrateProject.name}`);
    const assessments: Array<{
      id: string;
      name: string;
      type: string;
      groupName?: string;
      properties: {
        status?: string;
        azureLocation?: string;
        createdTimestamp?: string;
        updatedTimestamp?: string;
        sizingCriterion?: string;
      };
    }> = [];

    // Get solutions from migrate project
    const solutionsEndpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Migrate/migrateProjects/${migrateProject.name}/solutions?api-version=2018-09-01-preview`;
    
    try {
      const solutionsResponse = await this.makeRequest<{ value: Array<{
        id: string;
        name: string;
        type: string;
        properties: Record<string, unknown>;
      }> }>('GET', solutionsEndpoint);

      if (solutionsResponse?.value) {
        // Find the server assessment solution
        const serverAssessment = solutionsResponse.value.find(s => 
          s.name.includes('Servers-Assessment') || s.name.includes('ServerAssessment')
        );

        if (serverAssessment) {
          console.log(`Found server assessment solution: ${serverAssessment.name}`);
          
          // Get assessment details from solution
          const solutionDetails = serverAssessment.properties?.details as Record<string, unknown>;
          const extendedDetails = solutionDetails?.extendedDetails as Record<string, string>;
          
          if (solutionDetails?.assessmentCount) {
            console.log(`Assessment count from solution: ${solutionDetails.assessmentCount}`);
          }

          // Create assessment entries from the solution's extended details
          if (extendedDetails) {
            const assessmentTypes = [
              { key: 'azureVmAssessment', name: 'Azure VM Assessment', type: 'Azure VM' },
              { key: 'avsAssessment', name: 'AVS Assessment', type: 'Azure VMware Solution' },
              { key: 'azureSqlAssessment', name: 'Azure SQL Assessment', type: 'Azure SQL' },
              { key: 'azureWebAppAssessment', name: 'Azure Web App Assessment', type: 'Azure Web App' },
              { key: 'aksAssessment', name: 'AKS Assessment', type: 'Azure Kubernetes' },
            ];

            for (const at of assessmentTypes) {
              const count = parseInt(extendedDetails[at.key] || '0');
              if (count > 0) {
                assessments.push({
                  id: `${serverAssessment.id}/${at.key}`,
                  name: `${at.name} (${count} assessments)`,
                  type: at.type,
                  properties: {
                    status: 'Ready',
                    numberOfMachines: count,
                  } as Record<string, unknown>,
                });
              }
            }

            // Add business cases
            const businessCaseCount = parseInt(extendedDetails.businessCaseCount || '0');
            if (businessCaseCount > 0) {
              assessments.push({
                id: `${serverAssessment.id}/businessCases`,
                name: `Business Cases (${businessCaseCount} cases)`,
                type: 'Business Case',
                properties: {
                  status: 'Ready',
                },
              });
            }
          }
        }

        // Add solution info as assessment-like items
        for (const solution of solutionsResponse.value) {
          if (solution.name.includes('Assessment') || solution.name.includes('Discovery')) {
            const details = solution.properties?.details as Record<string, unknown>;
            assessments.push({
              id: solution.id,
              name: solution.name.replace('Servers-Assessment-', '').replace('Servers-Discovery-', 'Discovery-'),
              type: solution.type,
              properties: {
                status: solution.properties?.status as string || 'Active',
                createdTimestamp: details?.lastUpdatedTime as string,
              },
            });
          }
        }
      }
    } catch (e) {
      console.log('Failed to get migrate project solutions:', e);
    }

    return assessments;
  }

  /**
   * Get detailed assessment information including assessed machines
   */
  async getAssessmentDetails(assessmentId: string): Promise<{
    assessment: Record<string, unknown>;
    assessedMachines: Array<Record<string, unknown>>;
  } | null> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    const result: {
      assessment: Record<string, unknown>;
      assessedMachines: Array<Record<string, unknown>>;
    } = {
      assessment: {},
      assessedMachines: [],
    };

    // If it's a full resource ID, extract parts
    // Format: /subscriptions/.../providers/Microsoft.Migrate/assessmentProjects/{project}/groups/{group}/assessments/{assessment}
    const parts = assessmentId.split('/');
    const projectIndex = parts.findIndex(p => p === 'assessmentProjects' || p === 'assessmentprojects');
    
    if (projectIndex === -1) {
      console.log('Invalid assessment ID format');
      return null;
    }

    const projectName = parts[projectIndex + 1];
    const groupIndex = parts.findIndex(p => p === 'groups');
    const assessmentIndex = parts.findIndex(p => p === 'assessments');

    if (groupIndex !== -1 && assessmentIndex !== -1) {
      const groupName = parts[groupIndex + 1];
      const assessmentName = parts[assessmentIndex + 1];

      // Get assessment details
      const assessmentEndpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Migrate/assessmentProjects/${projectName}/groups/${groupName}/assessments/${assessmentName}?api-version=2019-10-01`;
      
      try {
        const assessmentResponse = await this.makeRequest<Record<string, unknown>>('GET', assessmentEndpoint);
        if (assessmentResponse) {
          result.assessment = assessmentResponse;
        }
      } catch (e) {
        console.log('Failed to get assessment details:', e);
      }

      // Get assessed machines
      const machinesEndpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Migrate/assessmentProjects/${projectName}/groups/${groupName}/assessments/${assessmentName}/assessedMachines?api-version=2019-10-01`;
      
      try {
        const machinesResponse = await this.makeRequest<{ value: Array<Record<string, unknown>> }>('GET', machinesEndpoint);
        if (machinesResponse?.value) {
          result.assessedMachines = machinesResponse.value;
        }
      } catch (e) {
        console.log('Failed to get assessed machines:', e);
      }
    }

    return result;
  }

  /**
   * Get all machines from assessment project with their assessment readiness
   */
  async getAssessmentMachines(): Promise<Array<Record<string, unknown>>> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return [];
    }

    const resources = await this.listResources() as Array<{ type: string; name: string }>;
    const assessmentProject = resources.find(r => r.type === 'Microsoft.Migrate/assessmentProjects');
    
    if (!assessmentProject) {
      return [];
    }

    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Migrate/assessmentProjects/${assessmentProject.name}/machines?api-version=2023-03-15`;
    
    try {
      const response = await this.makeRequest<{ value: Array<Record<string, unknown>> }>('GET', endpoint);
      return response?.value || [];
    } catch (e) {
      console.log('Failed to get assessment machines:', e);
      return [];
    }
  }

  /**
   * List all assessment options/types available in Azure Migrate
   */
  async listAssessmentOptions(): Promise<unknown> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    const resources = await this.listResources() as Array<{ type: string; name: string }>;
    const assessmentProject = resources.find(r => r.type === 'Microsoft.Migrate/assessmentProjects');
    
    if (!assessmentProject) {
      return { error: 'No assessment project found' };
    }

    const projectName = assessmentProject.name;
    const endpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Migrate/assessmentProjects/${projectName}/assessmentOptions/default?api-version=2023-03-15`;

    try {
      return await this.makeRequest('GET', endpoint);
    } catch (e) {
      console.log('Failed to get assessment options:', e);
      return null;
    }
  }

  /**
   * Explore all sub-resources under the assessment project to find assessments
   */
  async exploreAssessmentProject(): Promise<unknown> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    const results: Record<string, unknown> = {};
    
    // Get all resources and find migrate-related ones
    const resources = await this.listResources() as Array<{ type: string; name: string; id: string }>;
    const migrateProject = resources.find(r => r.type === 'Microsoft.Migrate/migrateprojects');
    const assessmentProject = resources.find(r => r.type === 'Microsoft.Migrate/assessmentProjects');

    results.resources = resources.filter(r => r.type.includes('Migrate') || r.type.includes('migrate'));

    if (migrateProject) {
      // Try to get solutions from migrate project
      const solutionsEndpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Migrate/migrateProjects/${migrateProject.name}/solutions?api-version=2018-09-01-preview`;
      try {
        results.migrateProjectSolutions = await this.makeRequest('GET', solutionsEndpoint);
      } catch (e) {
        results.migrateProjectSolutions = { error: String(e) };
      }
    }

    if (assessmentProject) {
      // Try various endpoints to find where assessments are stored
      const endpointsToTry = [
        { name: 'assessments', path: `assessments?api-version=2023-03-15` },
        { name: 'assessments_2019', path: `assessments?api-version=2019-10-01` },
        { name: 'groups', path: `groups?api-version=2023-03-15` },
        { name: 'groups_2019', path: `groups?api-version=2019-10-01` },
        { name: 'machines', path: `machines?api-version=2023-03-15` },
        { name: 'avsAssessments', path: `avsAssessments?api-version=2023-03-15` },
        { name: 'sqlAssessments', path: `sqlAssessments?api-version=2023-03-15` },
        { name: 'businessCases', path: `businessCases?api-version=2023-03-15` },
      ];

      const baseUrl = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Migrate/assessmentProjects/${assessmentProject.name}`;
      
      for (const ep of endpointsToTry) {
        try {
          const response = await this.makeRequest('GET', `${baseUrl}/${ep.path}`);
          results[ep.name] = response;
        } catch (e) {
          results[ep.name] = { error: String(e) };
        }
      }

      // Try to get project details
      try {
        results.projectDetails = await this.makeRequest('GET', `${baseUrl}?api-version=2023-03-15`);
      } catch (e) {
        results.projectDetails = { error: String(e) };
      }

      // List all child resources using ARM resource API
      try {
        const childResourcesEndpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Migrate/assessmentProjects/${assessmentProject.name}/resources?api-version=2023-03-15`;
        results.childResources = await this.makeRequest('GET', childResourcesEndpoint);
      } catch (e) {
        // Try general resource list
        try {
          const resourceListEndpoint = `/subscriptions/${config.subscriptionId}/resources?$filter=resourceGroup eq '${config.resourceGroup}' and resourceType eq 'Microsoft.Migrate/assessmentProjects/assessments'&api-version=2021-04-01`;
          results.assessmentResources = await this.makeRequest('GET', resourceListEndpoint);
        } catch (e2) {
          results.childResources = { error: String(e) };
        }
      }
    }

    return results;
  }

  /**
   * Create an assessment directly using VMware collector machines
   * This method uses the newer Azure Migrate API that doesn't require creating groups first
   */
  async createDirectAssessment(
    assessmentName: string,
    machineIds: string[],
    settings: {
      azureLocation: string;
      currency?: string;
    }
  ): Promise<{ assessmentId: string; status: string }> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    // Find the assessment project
    const resources = await this.listResources() as Array<{ type: string; name: string }>;
    const assessmentProject = resources.find(r => r.type === 'Microsoft.Migrate/assessmentProjects');
    
    if (!assessmentProject) {
      throw new Error('No Azure Migrate assessment project found');
    }

    const projectName = assessmentProject.name;

    // Try using the vmwareCollector assessment endpoint (newer API)
    // This creates an assessment directly on the VMware collector machines
    const timestamp = Date.now();
    const groupName = `api-group-${timestamp}`;
    
    // First, create a group using the newer API with correct group type
    const groupEndpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Migrate/assessmentProjects/${projectName}/groups/${groupName}?api-version=2023-03-15`;

    const groupBody = {
      properties: {
        groupType: 'Default',
        machines: machineIds,
      },
    };

    try {
      await this.makeRequest('PUT', groupEndpoint, groupBody);
    } catch (groupError) {
      console.log('Group creation attempt:', groupError);
      // Continue even if group creation has issues - we'll try assessment anyway
    }

    // Now create the assessment using vmwareCollectors endpoint
    const assessmentEndpoint = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Migrate/assessmentProjects/${projectName}/groups/${groupName}/assessments/${assessmentName}?api-version=2023-03-15`;

    const assessmentBody = {
      properties: {
        azureLocation: settings.azureLocation,
        azureOfferCode: 'MSAZR0003P',
        azurePricingTier: 'Standard',
        azureStorageRedundancy: 'LocallyRedundant',
        currency: settings.currency || 'USD',
        scalingFactor: 1.0,
        percentile: 'Percentile95',
        timeRange: 'Month',
        vmUptime: {
          daysPerMonth: 31,
          hoursPerDay: 24,
        },
        sizingCriterion: 'PerformanceBased',
        reservedInstance: 'None',
      },
    };

    try {
      const response = await this.makeRequest<{ id: string; name: string; properties?: { status?: string } }>('PUT', assessmentEndpoint, assessmentBody);
      return {
        assessmentId: response?.id || '',
        status: response?.properties?.status || 'Created',
      };
    } catch (assessmentError: unknown) {
      // If the standard assessment fails, provide a helpful message
      const errorMessage = assessmentError instanceof Error ? assessmentError.message : 'Unknown error';
      
      // Check if this is the group type incompatibility error
      if (errorMessage.includes('AssessmentTypeNotSupportedInGroup')) {
        throw new Error(
          'Azure Migrate API limitation: The assessment type is not supported for VMware discovered machines via API. ' +
          'Please create the assessment directly in Azure Portal: ' +
          `https://portal.azure.com/#view/Microsoft_Azure_Migrate/AssessmentProject/assessmentProjectId/${encodeURIComponent(`/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Migrate/assessmentProjects/${projectName}`)}`
        );
      }
      
      throw assessmentError;
    }
  }

  /**
   * Get link to create assessment in Azure Portal (fallback for API limitations)
   */
  async getAzurePortalAssessmentLink(): Promise<string> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      throw new Error('Azure not configured');
    }

    const resources = await this.listResources() as Array<{ type: string; name: string }>;
    const assessmentProject = resources.find(r => r.type === 'Microsoft.Migrate/assessmentProjects');
    
    if (!assessmentProject) {
      throw new Error('No Azure Migrate assessment project found');
    }

    const projectId = `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Migrate/assessmentProjects/${assessmentProject.name}`;
    
    return `https://portal.azure.com/#view/Microsoft_Azure_Migrate/AssessmentProject/assessmentProjectId/${encodeURIComponent(projectId)}`;
  }

  /**
   * Test connection to Azure
   */
  async testConnection(): Promise<{ success: boolean; message: string; details?: unknown }> {
    try {
      const config = await azureConfigService.getConfig();
      if (!config?.isConfigured) {
        return { success: false, message: 'Azure is not configured' };
      }

      const token = await this.getAccessToken();
      if (!token) {
        return { success: false, message: 'Failed to authenticate with Azure' };
      }

      // Try to list subscriptions as a basic test
      const response = await fetch(
        `${AZURE_MGMT_URL}/subscriptions?api-version=2020-01-01`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        return { success: false, message: `Azure API returned ${response.status}` };
      }

      const data = await response.json();
      const subscription = data.value?.find(
        (s: { subscriptionId: string }) => s.subscriptionId === config.subscriptionId
      );

      if (!subscription) {
        return {
          success: false,
          message: `Subscription ${config.subscriptionId} not found`,
        };
      }

      return {
        success: true,
        message: 'Successfully connected to Azure',
        details: {
          subscriptionName: subscription.displayName,
          subscriptionState: subscription.state,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export const azureMigrateService = new AzureMigrateService();

