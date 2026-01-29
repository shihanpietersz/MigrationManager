'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Cloud,
  Key,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  RotateCcw,
  AlertTriangle,
  Database,
  Server,
  Settings,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { settingsApi, dataSourcesApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  CollapsibleSection,
  CollapsibleSectionContent,
  CollapsibleSectionFooter,
  CollapsibleSectionGroup,
} from '@/components/ui/collapsible-section';

// Consistent input styling
const inputClassName = 
  'w-full rounded-lg border border-input bg-card px-4 py-2.5 text-foreground ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 ' +
  'transition-colors duration-200';

interface AzureConfig {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  subscriptionId?: string;
  resourceGroup?: string;
  migrateProjectName?: string;
  isConfigured: boolean;
}

interface DrMigrateConfig {
  server: string;
  database: string;
  user: string;
  password: string;
  port: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showAzureSecret, setShowAzureSecret] = useState(false);
  const [showDrMigratePassword, setShowDrMigratePassword] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  const [azureFormData, setAzureFormData] = useState<AzureConfig>({
    tenantId: '',
    clientId: '',
    clientSecret: '',
    subscriptionId: '',
    resourceGroup: '',
    migrateProjectName: '',
    isConfigured: false,
  });

  const [drMigrateFormData, setDrMigrateFormData] = useState<DrMigrateConfig>({
    server: '',
    database: 'DrMigrate',
    user: '',
    password: '',
    port: '1433',
  });

  // Load current Azure config
  const { data: configData, isLoading } = useQuery({
    queryKey: ['azure-config'],
    queryFn: () => settingsApi.getAzureConfig(),
  });

  // Load DrMigrate data sources
  const { data: dataSourcesData } = useQuery({
    queryKey: ['data-sources'],
    queryFn: () => dataSourcesApi.list(),
  });

  // Update Azure form when config loads
  useEffect(() => {
    if (configData?.data) {
      setAzureFormData({
        ...configData.data,
        clientSecret: '', // Don't show masked secret
      });
    }
  }, [configData]);

  // Azure save mutation
  const saveAzureMutation = useMutation({
    mutationFn: (config: Partial<AzureConfig>) => settingsApi.saveAzureConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['azure-config'] });
    },
  });

  // Azure test connection mutation
  const testAzureMutation = useMutation({
    mutationFn: () => settingsApi.testAzureConnection(),
  });

  // DrMigrate test connection mutation
  const testDrMigrateMutation = useMutation({
    mutationFn: () => dataSourcesApi.testDrMigrateConnection({
      server: drMigrateFormData.server,
      database: drMigrateFormData.database,
      user: drMigrateFormData.user,
      password: drMigrateFormData.password,
      port: drMigrateFormData.port ? parseInt(drMigrateFormData.port, 10) : undefined,
    }),
  });

  // DrMigrate save mutation
  const saveDrMigrateMutation = useMutation({
    mutationFn: () => dataSourcesApi.saveDrMigrateSource({
      server: drMigrateFormData.server,
      database: drMigrateFormData.database,
      user: drMigrateFormData.user,
      password: drMigrateFormData.password,
      port: drMigrateFormData.port ? parseInt(drMigrateFormData.port, 10) : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-sources'] });
    },
  });

  // Sync machines mutation
  const syncMutation = useMutation({
    mutationFn: () => settingsApi.syncAzureMachines(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machines'] });
    },
  });

  // Reset setup mutation
  const resetMutation = useMutation({
    mutationFn: () => settingsApi.resetSetup(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['azure-config'] });
      queryClient.invalidateQueries({ queryKey: ['setup-status'] });
      setShowResetConfirm(false);
      router.push('/setup');
    },
  });

  const handleSaveAzure = () => {
    const dataToSave = { ...azureFormData };
    if (!dataToSave.clientSecret) {
      delete dataToSave.clientSecret;
    }
    saveAzureMutation.mutate(dataToSave);
  };

  const handleSaveDrMigrate = () => {
    saveDrMigrateMutation.mutate();
  };

  const handleAzureInputChange = (field: keyof AzureConfig, value: string) => {
    setAzureFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleDrMigrateInputChange = (field: keyof DrMigrateConfig, value: string) => {
    setDrMigrateFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const drMigrateSource = dataSourcesData?.data?.find(
    (s: { type: string }) => s.type === 'drmigrate-db'
  );

  // Status badges for headers
  const AzureStatusBadge = () => {
    if (testAzureMutation.data?.data?.success) {
      return <span className="mm-badge mm-badge-success">Connected</span>;
    }
    if (configData?.data?.isConfigured) {
      return <span className="mm-badge mm-badge-primary">Configured</span>;
    }
    return <span className="mm-badge mm-badge-neutral">Not configured</span>;
  };

  const DrMigrateStatusBadge = () => {
    if (testDrMigrateMutation.data?.data?.success) {
      return <span className="mm-badge mm-badge-success">Connected</span>;
    }
    if (drMigrateSource) {
      return <span className="mm-badge mm-badge-primary">Configured</span>;
    }
    return <span className="mm-badge mm-badge-neutral">Not configured</span>;
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page Header */}
      <div className="flex items-start gap-4">
        <div className="mm-icon-container mm-icon-primary">
          <Settings className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your Azure and DrMigrate connections
          </p>
        </div>
      </div>

      {/* Sync Result */}
      {syncMutation.data?.data && (
        <div className="mm-info-card mm-info-card-success flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-success" />
          <div>
            <p className="font-medium text-foreground">Sync Completed</p>
            <p className="text-sm text-muted-foreground">
              Imported {syncMutation.data.data.count} machines from {syncMutation.data.data.sites.join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Collapsible Sections */}
      <CollapsibleSectionGroup>
        {/* Azure Service Principal */}
        <CollapsibleSection
          title="Azure Service Principal"
          description="Credentials for accessing Azure APIs"
          icon={<Key className="h-5 w-5" />}
          variant="primary"
          defaultExpanded={!configData?.data?.isConfigured}
          badge={<AzureStatusBadge />}
          footer={
            <CollapsibleSectionFooter>
              <div>
                {saveAzureMutation.isSuccess && (
                  <p className="text-sm text-success flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Saved successfully
                  </p>
                )}
                {saveAzureMutation.isError && (
                  <p className="text-sm text-danger flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Failed to save
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => testAzureMutation.mutate()}
                  disabled={testAzureMutation.isPending}
                  className="mm-btn-secondary flex items-center"
                >
                  {testAzureMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Test Connection
                </button>
                <button
                  onClick={handleSaveAzure}
                  disabled={saveAzureMutation.isPending}
                  className="mm-btn-primary flex items-center"
                >
                  {saveAzureMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  Save
                </button>
              </div>
            </CollapsibleSectionFooter>
          }
        >
          <CollapsibleSectionContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Tenant ID *</label>
                <input
                  type="text"
                  value={azureFormData.tenantId || ''}
                  onChange={(e) => handleAzureInputChange('tenantId', e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className={inputClassName}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Client ID *</label>
                <input
                  type="text"
                  value={azureFormData.clientId || ''}
                  onChange={(e) => handleAzureInputChange('clientId', e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className={inputClassName}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Client Secret *</label>
              <div className="relative">
                <input
                  type={showAzureSecret ? 'text' : 'password'}
                  value={azureFormData.clientSecret || ''}
                  onChange={(e) => handleAzureInputChange('clientSecret', e.target.value)}
                  placeholder={configData?.data?.clientSecret ? '••••••••' : 'Enter client secret'}
                  className={cn(inputClassName, 'pr-12')}
                />
                <button
                  type="button"
                  onClick={() => setShowAzureSecret(!showAzureSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showAzureSecret ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Leave empty to keep existing secret
              </p>
            </div>

            {/* Test connection result */}
            {testAzureMutation.data && (
              <div className={cn(
                'flex items-center gap-2 text-sm p-3 rounded-lg',
                testAzureMutation.data.data?.success 
                  ? 'bg-success-light text-success' 
                  : 'bg-danger-light text-danger'
              )}>
                {testAzureMutation.data.data?.success ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <span>{testAzureMutation.data.data?.message || 'Connection test completed'}</span>
              </div>
            )}
          </CollapsibleSectionContent>
        </CollapsibleSection>

        {/* Azure Migrate Project */}
        <CollapsibleSection
          title="Azure Migrate Project"
          description="Settings for your Azure Migrate project"
          icon={<Cloud className="h-5 w-5" />}
          variant="primary"
          defaultExpanded={!configData?.data?.migrateProjectName}
          footer={
            <CollapsibleSectionFooter>
              <div />
              <div className="flex items-center gap-3">
                {configData?.data?.isConfigured && (
                  <button
                    onClick={() => syncMutation.mutate()}
                    disabled={syncMutation.isPending}
                    className="mm-btn-secondary flex items-center"
                  >
                    {syncMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Sync Machines
                  </button>
                )}
                <button
                  onClick={handleSaveAzure}
                  disabled={saveAzureMutation.isPending}
                  className="mm-btn-primary flex items-center"
                >
                  {saveAzureMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  Save
                </button>
              </div>
            </CollapsibleSectionFooter>
          }
        >
          <CollapsibleSectionContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Subscription ID *</label>
                <input
                  type="text"
                  value={azureFormData.subscriptionId || ''}
                  onChange={(e) => handleAzureInputChange('subscriptionId', e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className={inputClassName}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Resource Group *</label>
                <input
                  type="text"
                  value={azureFormData.resourceGroup || ''}
                  onChange={(e) => handleAzureInputChange('resourceGroup', e.target.value)}
                  placeholder="rg-migrate-project"
                  className={inputClassName}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Migrate Project Name *</label>
              <input
                type="text"
                value={azureFormData.migrateProjectName || ''}
                onChange={(e) => handleAzureInputChange('migrateProjectName', e.target.value)}
                placeholder="migrate-project-001"
                className={inputClassName}
              />
            </div>
          </CollapsibleSectionContent>
        </CollapsibleSection>

        {/* DrMigrate Assessment Engine */}
        <CollapsibleSection
          title="DrMigrate Assessment Engine"
          description="Connect to DrMigrate to retrieve assessment data"
          icon={<Database className="h-5 w-5" />}
          variant="primary"
          defaultExpanded={!drMigrateSource}
          badge={<DrMigrateStatusBadge />}
          footer={
            <CollapsibleSectionFooter>
              <div>
                {saveDrMigrateMutation.isSuccess && (
                  <p className="text-sm text-success flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Connection saved
                  </p>
                )}
                {saveDrMigrateMutation.isError && (
                  <p className="text-sm text-danger flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Failed to save
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => testDrMigrateMutation.mutate()}
                  disabled={testDrMigrateMutation.isPending || !drMigrateFormData.server || !drMigrateFormData.user || !drMigrateFormData.password}
                  className="mm-btn-secondary flex items-center"
                >
                  {testDrMigrateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Database className="h-4 w-4 mr-2" />
                  )}
                  Test Connection
                </button>
                <button
                  onClick={handleSaveDrMigrate}
                  disabled={saveDrMigrateMutation.isPending || !drMigrateFormData.server || !drMigrateFormData.user || !drMigrateFormData.password}
                  className="mm-btn-primary flex items-center"
                >
                  {saveDrMigrateMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  Save
                </button>
              </div>
            </CollapsibleSectionFooter>
          }
        >
          <CollapsibleSectionContent>
            <div className="flex items-center gap-2 mb-2">
              <Server className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">SQL Server Connection</span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Server Name *</label>
                <input
                  type="text"
                  value={drMigrateFormData.server}
                  onChange={(e) => handleDrMigrateInputChange('server', e.target.value)}
                  placeholder="localhost\SQLEXPRESS"
                  className={inputClassName}
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  e.g., localhost\SQLEXPRESS or DBSERVER
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Port</label>
                <input
                  type="text"
                  value={drMigrateFormData.port}
                  onChange={(e) => handleDrMigrateInputChange('port', e.target.value)}
                  placeholder="1433"
                  className={inputClassName}
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Default: 1433
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Database Name *</label>
              <input
                type="text"
                value={drMigrateFormData.database}
                onChange={(e) => handleDrMigrateInputChange('database', e.target.value)}
                placeholder="DrMigrate"
                className={inputClassName}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Username *</label>
                <input
                  type="text"
                  value={drMigrateFormData.user}
                  onChange={(e) => handleDrMigrateInputChange('user', e.target.value)}
                  placeholder="sa"
                  className={inputClassName}
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  SQL Server authentication
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Password *</label>
                <div className="relative">
                  <input
                    type={showDrMigratePassword ? 'text' : 'password'}
                    value={drMigrateFormData.password}
                    onChange={(e) => handleDrMigrateInputChange('password', e.target.value)}
                    placeholder="Enter password"
                    className={cn(inputClassName, 'pr-12')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowDrMigratePassword(!showDrMigratePassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showDrMigratePassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Test Result */}
            {testDrMigrateMutation.data && (
              <div className={cn(
                'flex items-center gap-2 text-sm p-3 rounded-lg',
                testDrMigrateMutation.data.data?.success 
                  ? 'bg-success-light text-success' 
                  : 'bg-danger-light text-danger'
              )}>
                {testDrMigrateMutation.data.data?.success ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <span>{testDrMigrateMutation.data.data?.message}</span>
              </div>
            )}
          </CollapsibleSectionContent>
        </CollapsibleSection>

        {/* Danger Zone */}
        <CollapsibleSection
          title="Danger Zone"
          description="Actions here can affect your setup"
          icon={<AlertTriangle className="h-5 w-5" />}
          variant="danger"
          defaultExpanded={false}
        >
          <CollapsibleSectionContent>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-foreground">Reset Initial Setup</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Clear the setup completion status and re-run the setup wizard.
                  Your existing configuration will be preserved.
                </p>
              </div>
              <button
                onClick={() => setShowResetConfirm(true)}
                className="mm-btn-danger flex items-center flex-shrink-0 ml-4"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Setup
              </button>
            </div>
          </CollapsibleSectionContent>
        </CollapsibleSection>
      </CollapsibleSectionGroup>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="mm-icon-container mm-icon-danger">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">Reset Setup?</h3>
              </div>
              <p className="text-muted-foreground">
                This will clear the setup completion status and redirect you to the setup wizard.
                Your existing configuration will be preserved but you can modify it during setup.
              </p>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-card-border bg-muted/20">
              <button
                onClick={() => setShowResetConfirm(false)}
                disabled={resetMutation.isPending}
                className="mm-btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                className="mm-btn-danger flex items-center"
              >
                {resetMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RotateCcw className="h-4 w-4 mr-2" />
                )}
                Reset & Go to Setup
              </button>
            </div>
            {resetMutation.isError && (
              <div className="px-6 pb-4">
                <p className="text-sm text-danger flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Failed to reset setup. Please try again.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
