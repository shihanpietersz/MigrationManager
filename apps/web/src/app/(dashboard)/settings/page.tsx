'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Cloud,
  Key,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { settingsApi } from '@/lib/api';
import { cn } from '@/lib/utils';

interface AzureConfig {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  subscriptionId?: string;
  resourceGroup?: string;
  migrateProjectName?: string;
  location?: string;
  vaultName?: string;
  vaultResourceGroup?: string;
  isConfigured: boolean;
}

const azureLocations = [
  { value: 'eastus', label: 'East US' },
  { value: 'eastus2', label: 'East US 2' },
  { value: 'westus', label: 'West US' },
  { value: 'westus2', label: 'West US 2' },
  { value: 'centralus', label: 'Central US' },
  { value: 'northeurope', label: 'North Europe' },
  { value: 'westeurope', label: 'West Europe' },
  { value: 'uksouth', label: 'UK South' },
  { value: 'ukwest', label: 'UK West' },
  { value: 'australiaeast', label: 'Australia East' },
  { value: 'southeastasia', label: 'Southeast Asia' },
];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [showSecret, setShowSecret] = useState(false);
  const [formData, setFormData] = useState<AzureConfig>({
    tenantId: '',
    clientId: '',
    clientSecret: '',
    subscriptionId: '',
    resourceGroup: '',
    migrateProjectName: '',
    location: 'eastus',
    vaultName: '',
    vaultResourceGroup: '',
    isConfigured: false,
  });

  // Load current config
  const { data: configData, isLoading } = useQuery({
    queryKey: ['azure-config'],
    queryFn: () => settingsApi.getAzureConfig(),
  });

  // Update form when config loads
  useEffect(() => {
    if (configData?.data) {
      setFormData({
        ...configData.data,
        clientSecret: '', // Don't show masked secret
      });
    }
  }, [configData]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (config: Partial<AzureConfig>) => settingsApi.saveAzureConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['azure-config'] });
    },
  });

  // Test connection mutation
  const testMutation = useMutation({
    mutationFn: () => settingsApi.testAzureConnection(),
  });

  // Sync machines mutation
  const syncMutation = useMutation({
    mutationFn: () => settingsApi.syncAzureMachines(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machines'] });
    },
  });

  const handleSave = () => {
    // Only send clientSecret if it was changed
    const dataToSave = { ...formData };
    if (!dataToSave.clientSecret) {
      delete dataToSave.clientSecret;
    }
    saveMutation.mutate(dataToSave);
  };

  const handleInputChange = (field: keyof AzureConfig, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure Azure connection to sync with Azure Migrate
        </p>
      </div>

      {/* Connection Status */}
      {configData?.data?.isConfigured && (
        <div
          className={cn(
            'flex items-center gap-3 p-4 rounded-lg border',
            testMutation.data?.data?.success
              ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800'
              : 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800'
          )}
        >
          {testMutation.data?.data?.success ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : (
            <Cloud className="h-5 w-5 text-blue-600" />
          )}
          <div className="flex-1">
            <p className="font-medium">
              {testMutation.data?.data?.success
                ? 'Connected to Azure'
                : 'Azure Configuration Saved'}
            </p>
            <p className="text-sm text-muted-foreground">
              {testMutation.data?.data?.message ||
                'Test connection to verify your credentials'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
          >
            {testMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Test Connection
          </Button>
        </div>
      )}

      {/* Test Error */}
      {testMutation.data && !testMutation.data.data?.success && (
        <div className="flex items-center gap-3 p-4 rounded-lg border bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800">
          <XCircle className="h-5 w-5 text-red-600" />
          <div>
            <p className="font-medium text-red-800 dark:text-red-200">
              Connection Failed
            </p>
            <p className="text-sm text-red-600 dark:text-red-300">
              {testMutation.data.data?.message}
            </p>
          </div>
        </div>
      )}

      {/* Azure Service Principal */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <Key className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-semibold">Azure Service Principal</h2>
              <p className="text-sm text-muted-foreground">
                Credentials for accessing Azure APIs
              </p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-2">Tenant ID *</label>
              <input
                type="text"
                value={formData.tenantId || ''}
                onChange={(e) => handleInputChange('tenantId', e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full rounded-lg border bg-background py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Client ID *</label>
              <input
                type="text"
                value={formData.clientId || ''}
                onChange={(e) => handleInputChange('clientId', e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full rounded-lg border bg-background py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Client Secret *</label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={formData.clientSecret || ''}
                onChange={(e) => handleInputChange('clientSecret', e.target.value)}
                placeholder={configData?.data?.clientSecret ? '••••••••' : 'Enter client secret'}
                className="w-full rounded-lg border bg-background py-2 px-4 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Leave empty to keep existing secret
            </p>
          </div>
        </div>
      </div>

      {/* Azure Migrate Project */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <Cloud className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-semibold">Azure Migrate Project</h2>
              <p className="text-sm text-muted-foreground">
                Settings for your Azure Migrate project
              </p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-2">Subscription ID *</label>
              <input
                type="text"
                value={formData.subscriptionId || ''}
                onChange={(e) => handleInputChange('subscriptionId', e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full rounded-lg border bg-background py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Resource Group *</label>
              <input
                type="text"
                value={formData.resourceGroup || ''}
                onChange={(e) => handleInputChange('resourceGroup', e.target.value)}
                placeholder="rg-migrate-project"
                className="w-full rounded-lg border bg-background py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-2">Migrate Project Name *</label>
              <input
                type="text"
                value={formData.migrateProjectName || ''}
                onChange={(e) => handleInputChange('migrateProjectName', e.target.value)}
                placeholder="migrate-project-001"
                className="w-full rounded-lg border bg-background py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Location</label>
              <select
                value={formData.location || 'eastus'}
                onChange={(e) => handleInputChange('location', e.target.value)}
                className="w-full rounded-lg border bg-background py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {azureLocations.map((loc) => (
                  <option key={loc.value} value={loc.value}>
                    {loc.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Recovery Services Vault (Optional) */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <RefreshCw className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-semibold">Recovery Services Vault</h2>
              <p className="text-sm text-muted-foreground">
                Optional: For replication (Azure Site Recovery)
              </p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-2">Vault Name</label>
              <input
                type="text"
                value={formData.vaultName || ''}
                onChange={(e) => handleInputChange('vaultName', e.target.value)}
                placeholder="vault-asr-001"
                className="w-full rounded-lg border bg-background py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Vault Resource Group</label>
              <input
                type="text"
                value={formData.vaultResourceGroup || ''}
                onChange={(e) => handleInputChange('vaultResourceGroup', e.target.value)}
                placeholder="rg-asr"
                className="w-full rounded-lg border bg-background py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4">
        <div>
          {saveMutation.isSuccess && (
            <p className="text-sm text-green-600 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Configuration saved successfully
            </p>
          )}
          {saveMutation.isError && (
            <p className="text-sm text-red-600 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Failed to save configuration
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {configData?.data?.isConfigured && (
            <Button
              variant="outline"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync Machines
            </Button>
          )}
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Save Configuration
          </Button>
        </div>
      </div>

      {/* Sync Result */}
      {syncMutation.data?.data && (
        <div className="flex items-center gap-3 p-4 rounded-lg border bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <div>
            <p className="font-medium text-green-800 dark:text-green-200">
              Sync Completed
            </p>
            <p className="text-sm text-green-600 dark:text-green-300">
              Imported {syncMutation.data.data.count} machines from {syncMutation.data.data.sites.join(', ')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
