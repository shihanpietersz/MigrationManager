import { azureConfigService } from './azure-config.service.js';

interface AzureResource {
  id: string;
  name: string;
  type: string;
  location: string;
  properties?: Record<string, unknown>;
}

// Azure regions with display names
const AZURE_REGIONS = [
  { name: 'australiaeast', displayName: 'Australia East' },
  { name: 'australiasoutheast', displayName: 'Australia Southeast' },
  { name: 'eastus', displayName: 'East US' },
  { name: 'eastus2', displayName: 'East US 2' },
  { name: 'westus', displayName: 'West US' },
  { name: 'westus2', displayName: 'West US 2' },
  { name: 'westus3', displayName: 'West US 3' },
  { name: 'centralus', displayName: 'Central US' },
  { name: 'northeurope', displayName: 'North Europe' },
  { name: 'westeurope', displayName: 'West Europe' },
  { name: 'uksouth', displayName: 'UK South' },
  { name: 'ukwest', displayName: 'UK West' },
  { name: 'southeastasia', displayName: 'Southeast Asia' },
  { name: 'eastasia', displayName: 'East Asia' },
  { name: 'japaneast', displayName: 'Japan East' },
  { name: 'japanwest', displayName: 'Japan West' },
  { name: 'brazilsouth', displayName: 'Brazil South' },
  { name: 'canadacentral', displayName: 'Canada Central' },
  { name: 'canadaeast', displayName: 'Canada East' },
  { name: 'centralindia', displayName: 'Central India' },
  { name: 'southindia', displayName: 'South India' },
  { name: 'koreacentral', displayName: 'Korea Central' },
  { name: 'koreasouth', displayName: 'Korea South' },
  { name: 'francecentral', displayName: 'France Central' },
  { name: 'germanywestcentral', displayName: 'Germany West Central' },
  { name: 'norwayeast', displayName: 'Norway East' },
  { name: 'switzerlandnorth', displayName: 'Switzerland North' },
  { name: 'uaenorth', displayName: 'UAE North' },
  { name: 'southafricanorth', displayName: 'South Africa North' },
];

export const targetsService = {
  /**
   * Get available Azure regions
   */
  async getRegions(): Promise<Array<{ name: string; displayName: string }>> {
    return AZURE_REGIONS;
  },

  /**
   * Make authenticated Azure API request
   */
  async makeRequest<T>(endpoint: string): Promise<T | null> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return null;
    }

    const { ClientSecretCredential } = await import('@azure/identity');
    const credential = new ClientSecretCredential(
      config.tenantId!,
      config.clientId!,
      config.clientSecret!
    );

    const tokenResponse = await credential.getToken('https://management.azure.com/.default');
    const baseUrl = 'https://management.azure.com';

    const response = await fetch(`${baseUrl}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${tokenResponse.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.log(`Azure API error: ${response.status}`);
      return null;
    }

    return response.json();
  },

  /**
   * Get virtual networks from Azure, optionally filtered by region
   */
  async getVnets(region?: string): Promise<Array<{
    id: string;
    name: string;
    resourceGroup: string;
    location: string;
    addressPrefixes: string[];
    subnets: Array<{
      id: string;
      name: string;
      addressPrefix: string;
    }>;
  }>> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      // Return mock data when not configured
      return [
        {
          id: '/subscriptions/xxx/resourceGroups/rg-migrate/providers/Microsoft.Network/virtualNetworks/vnet-prod',
          name: 'vnet-prod (mock)',
          resourceGroup: 'rg-migrate',
          location: region || 'eastus',
          addressPrefixes: ['10.0.0.0/16'],
          subnets: [
            { id: 'subnet-1', name: 'default', addressPrefix: '10.0.0.0/24' },
            { id: 'subnet-2', name: 'app', addressPrefix: '10.0.1.0/24' },
          ],
        },
      ];
    }

    try {
      const response = await this.makeRequest<{ value: AzureResource[] }>(
        `/subscriptions/${config.subscriptionId}/providers/Microsoft.Network/virtualNetworks?api-version=2023-05-01`
      );

      if (!response?.value) {
        return [];
      }

      let vnets = response.value;
      
      // Filter by region if specified
      if (region) {
        vnets = vnets.filter(vnet => vnet.location.toLowerCase() === region.toLowerCase());
      }

      return vnets.map(vnet => {
        const props = vnet.properties || {};
        const addressSpace = props.addressSpace as { addressPrefixes?: string[] } | undefined;
        const subnets = (props.subnets as AzureResource[]) || [];

        // Extract resource group from ID
        const rgMatch = vnet.id.match(/resourceGroups\/([^/]+)/i);
        const resourceGroup = rgMatch ? rgMatch[1] : '';

        return {
          id: vnet.id,
          name: vnet.name,
          resourceGroup,
          location: vnet.location,
          addressPrefixes: addressSpace?.addressPrefixes || [],
          subnets: subnets.map(subnet => ({
            id: subnet.id || `${vnet.id}/subnets/${subnet.name}`,
            name: subnet.name,
            addressPrefix: (subnet.properties?.addressPrefix as string) || '',
          })),
        };
      });
    } catch (e) {
      console.log('Failed to fetch VNets:', e);
      return [];
    }
  },

  /**
   * Get storage accounts from Azure, optionally filtered by region
   */
  async getStorageAccounts(region?: string): Promise<Array<{
    id: string;
    name: string;
    resourceGroup: string;
    location: string;
    sku: string;
    kind: string;
  }>> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return [
        {
          id: '/subscriptions/xxx/resourceGroups/rg-migrate/providers/Microsoft.Storage/storageAccounts/stmigratecache',
          name: 'stmigratecache (mock)',
          resourceGroup: 'rg-migrate',
          location: region || 'eastus',
          sku: 'Standard_LRS',
          kind: 'StorageV2',
        },
      ];
    }

    try {
      const response = await this.makeRequest<{ value: AzureResource[] }>(
        `/subscriptions/${config.subscriptionId}/providers/Microsoft.Storage/storageAccounts?api-version=2023-01-01`
      );

      if (!response?.value) {
        return [];
      }

      let accounts = response.value;
      
      // Filter by region if specified
      if (region) {
        accounts = accounts.filter(sa => sa.location.toLowerCase() === region.toLowerCase());
      }

      return accounts.map(sa => {
        const rgMatch = sa.id.match(/resourceGroups\/([^/]+)/i);
        const resourceGroup = rgMatch ? rgMatch[1] : '';
        const sku = (sa as { sku?: { name?: string } }).sku?.name || 'Standard_LRS';
        const kind = (sa as { kind?: string }).kind || 'StorageV2';

        return {
          id: sa.id,
          name: sa.name,
          resourceGroup,
          location: sa.location,
          sku,
          kind,
        };
      });
    } catch (e) {
      console.log('Failed to fetch storage accounts:', e);
      return [];
    }
  },

  /**
   * Get resource groups from Azure, optionally filtered by region
   */
  async getResourceGroups(region?: string): Promise<Array<{
    id: string;
    name: string;
    location: string;
  }>> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return [
        {
          id: '/subscriptions/xxx/resourceGroups/rg-migrate',
          name: 'rg-migrate (mock)',
          location: region || 'eastus',
        },
      ];
    }

    try {
      const response = await this.makeRequest<{ value: AzureResource[] }>(
        `/subscriptions/${config.subscriptionId}/resourcegroups?api-version=2022-09-01`
      );

      if (!response?.value) {
        return [];
      }

      let groups = response.value;
      
      // Filter by region if specified
      if (region) {
        groups = groups.filter(rg => rg.location.toLowerCase() === region.toLowerCase());
      }

      return groups.map(rg => ({
        id: rg.id,
        name: rg.name,
        location: rg.location,
      }));
    } catch (e) {
      console.log('Failed to fetch resource groups:', e);
      return [];
    }
  },

  /**
   * Get Recovery Services Vaults from Azure
   */
  async getRecoveryVaults(): Promise<Array<{
    id: string;
    name: string;
    resourceGroup: string;
    location: string;
  }>> {
    const config = await azureConfigService.getConfig();
    if (!config?.isConfigured) {
      return [];
    }

    try {
      const response = await this.makeRequest<{ value: AzureResource[] }>(
        `/subscriptions/${config.subscriptionId}/providers/Microsoft.RecoveryServices/vaults?api-version=2023-04-01`
      );

      if (!response?.value) {
        return [];
      }

      return response.value.map(vault => {
        const rgMatch = vault.id.match(/resourceGroups\/([^/]+)/i);
        const resourceGroup = rgMatch ? rgMatch[1] : '';

        return {
          id: vault.id,
          name: vault.name,
          resourceGroup,
          location: vault.location,
        };
      });
    } catch (e) {
      console.log('Failed to fetch recovery vaults:', e);
      return [];
    }
  },

  /**
   * Get VM SKUs available in a location
   */
  async getVmSkus(location: string = 'eastus'): Promise<Array<{
    name: string;
    tier: string;
    family: string;
    cores: number;
    memoryGB: number;
  }>> {
    const config = await azureConfigService.getConfig();
    
    // Return common VM sizes (actual SKU API is complex)
    const commonSkus = [
      { name: 'Standard_B2s', tier: 'Standard', family: 'Bs', cores: 2, memoryGB: 4 },
      { name: 'Standard_B2ms', tier: 'Standard', family: 'Bms', cores: 2, memoryGB: 8 },
      { name: 'Standard_D2s_v3', tier: 'Standard', family: 'Dsv3', cores: 2, memoryGB: 8 },
      { name: 'Standard_D4s_v3', tier: 'Standard', family: 'Dsv3', cores: 4, memoryGB: 16 },
      { name: 'Standard_D8s_v3', tier: 'Standard', family: 'Dsv3', cores: 8, memoryGB: 32 },
      { name: 'Standard_D16s_v3', tier: 'Standard', family: 'Dsv3', cores: 16, memoryGB: 64 },
      { name: 'Standard_D2s_v5', tier: 'Standard', family: 'Dsv5', cores: 2, memoryGB: 8 },
      { name: 'Standard_D4s_v5', tier: 'Standard', family: 'Dsv5', cores: 4, memoryGB: 16 },
      { name: 'Standard_D8s_v5', tier: 'Standard', family: 'Dsv5', cores: 8, memoryGB: 32 },
      { name: 'Standard_E2s_v3', tier: 'Standard', family: 'Esv3', cores: 2, memoryGB: 16 },
      { name: 'Standard_E4s_v3', tier: 'Standard', family: 'Esv3', cores: 4, memoryGB: 32 },
      { name: 'Standard_E8s_v3', tier: 'Standard', family: 'Esv3', cores: 8, memoryGB: 64 },
      { name: 'Standard_F2s_v2', tier: 'Standard', family: 'Fsv2', cores: 2, memoryGB: 4 },
      { name: 'Standard_F4s_v2', tier: 'Standard', family: 'Fsv2', cores: 4, memoryGB: 8 },
      { name: 'Standard_F8s_v2', tier: 'Standard', family: 'Fsv2', cores: 8, memoryGB: 16 },
    ];

    if (!config?.isConfigured) {
      return commonSkus;
    }

    // For now, return common SKUs
    // Full SKU API implementation would require:
    // GET /subscriptions/{subscriptionId}/providers/Microsoft.Compute/skus?api-version=2021-07-01&$filter=location eq '{location}'
    return commonSkus;
  },
};



