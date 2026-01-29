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
  Activity,
  Clock,
  Zap,
  Link2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { settingsApi, dataSourcesApi, healthApi, syncApi, statsApi, SourceType, SyncInterval, SyncIntervalOption } from '@/lib/api';
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

  // Load connection health status
  const { data: healthData, refetch: refetchHealth } = useQuery({
    queryKey: ['connection-health'],
    queryFn: () => healthApi.getAllHealth(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Load sync schedules
  const { data: syncData, refetch: refetchSync } = useQuery({
    queryKey: ['sync-schedules'],
    queryFn: () => syncApi.getAllSchedules(),
  });

  // Load overview stats
  const { data: statsData } = useQuery({
    queryKey: ['overview-stats'],
    queryFn: () => statsApi.getOverview(),
    refetchInterval: 60000, // Refresh every minute
  });

  // Load sync intervals
  const { data: intervalsData } = useQuery({
    queryKey: ['sync-intervals'],
    queryFn: () => syncApi.getIntervals(),
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

  // Health check mutations
  const checkHealthMutation = useMutation({
    mutationFn: (sourceType: SourceType) => healthApi.checkHealth(sourceType),
    onSuccess: () => {
      refetchHealth();
      queryClient.invalidateQueries({ queryKey: ['overview-stats'] });
    },
  });

  // Trigger sync mutation
  const triggerSyncMutation = useMutation({
    mutationFn: (sourceType: SourceType) => syncApi.triggerSync(sourceType),
    onSuccess: () => {
      refetchSync();
      refetchHealth();
      queryClient.invalidateQueries({ queryKey: ['overview-stats'] });
      queryClient.invalidateQueries({ queryKey: ['machines'] });
    },
  });

  // Update sync schedule mutation
  const updateScheduleMutation = useMutation({
    mutationFn: ({ sourceType, enabled, intervalMinutes }: { sourceType: SourceType; enabled: boolean; intervalMinutes?: SyncInterval }) =>
      syncApi.updateSchedule(sourceType, enabled, intervalMinutes),
    onSuccess: () => {
      refetchSync();
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

      {/* Connection Health & Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Azure Migrate Health Card */}
        <div className="mm-stat-card">
          <div className="flex items-center gap-3 mb-2">
            <div className="mm-icon-container mm-icon-primary">
              <Cloud className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">Azure Migrate</span>
              <HealthStatusIndicator 
                status={healthData?.data?.['azure-migrate']?.status || 'unknown'} 
                errorMessage={healthData?.data?.['azure-migrate']?.lastErrorMsg}
              />
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <span className="text-3xl font-bold text-foreground">
                {healthData?.data?.['azure-migrate']?.status === 'connected'
                  ? healthData.data['azure-migrate'].machineCount
                  : (statsData?.data?.azureMachines ?? 0)}
              </span>
              <span className="text-sm text-muted-foreground ml-2">machines</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {healthData?.data?.['azure-migrate']?.lastCheckAt ? (
                <>Last check: {formatTimeAgo(healthData.data['azure-migrate'].lastCheckAt)}</>
              ) : (
                'Never checked'
              )}
            </div>
          </div>
          <button
            onClick={() => checkHealthMutation.mutate('azure-migrate')}
            disabled={checkHealthMutation.isPending}
            className="mt-4 w-full mm-btn-outline text-sm py-2"
          >
            {checkHealthMutation.isPending && checkHealthMutation.variables === 'azure-migrate' ? (
              <Loader2 className="h-4 w-4 animate-spin mx-auto" />
            ) : (
              'Check Now'
            )}
          </button>
        </div>

        {/* DrMigrate Health Card */}
        <div className="mm-stat-card">
          <div className="flex items-center gap-3 mb-2">
            <div className="mm-icon-container mm-icon-primary">
              <Database className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">DrMigrate</span>
              <HealthStatusIndicator 
                status={healthData?.data?.drmigrate?.status || 'unknown'} 
                errorMessage={healthData?.data?.drmigrate?.lastErrorMsg}
              />
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <span className="text-3xl font-bold text-foreground">
                {healthData?.data?.drmigrate?.status === 'connected'
                  ? healthData.data.drmigrate.machineCount
                  : (statsData?.data?.drMigrateServers ?? 0)}
              </span>
              <span className="text-sm text-muted-foreground ml-2">servers</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {healthData?.data?.drmigrate?.lastCheckAt ? (
                <>Last check: {formatTimeAgo(healthData.data.drmigrate.lastCheckAt)}</>
              ) : (
                'Never checked'
              )}
            </div>
          </div>
          <button
            onClick={() => checkHealthMutation.mutate('drmigrate')}
            disabled={checkHealthMutation.isPending}
            className="mt-4 w-full mm-btn-outline text-sm py-2"
          >
            {checkHealthMutation.isPending && checkHealthMutation.variables === 'drmigrate' ? (
              <Loader2 className="h-4 w-4 animate-spin mx-auto" />
            ) : (
              'Check Now'
            )}
          </button>
        </div>

        {/* Matched Machines Card */}
        <div className="mm-stat-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="mm-icon-container mm-icon-success">
                <Link2 className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-foreground">Matched</span>
            </div>
            <span className="mm-badge mm-badge-success">{statsData?.data?.matchPercentage ?? 0}%</span>
          </div>
          <div className="space-y-3">
            <div>
              <span className="text-3xl font-bold text-foreground">
                {statsData?.data?.matchedCount ?? 0}
              </span>
              <span className="text-sm text-muted-foreground ml-2">pairs</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Auto: {statsData?.data?.autoMatchedCount ?? 0} | Manual: {statsData?.data?.manualMatchedCount ?? 0}
            </div>
          </div>
        </div>

        {/* Unmatched Card */}
        <div className="mm-stat-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="mm-icon-container mm-icon-warning">
                <Activity className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-foreground">Unmatched</span>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <span className="text-3xl font-bold text-foreground">
                {(statsData?.data?.unmatchedAzure ?? 0) + (statsData?.data?.unmatchedDrMigrate ?? 0)}
              </span>
              <span className="text-sm text-muted-foreground ml-2">total</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Azure: {statsData?.data?.unmatchedAzure ?? 0} | DrMigrate: {statsData?.data?.unmatchedDrMigrate ?? 0}
            </div>
          </div>
        </div>
      </div>

      {/* Sync Scheduling Section */}
      <div className="mm-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="mm-icon-container mm-icon-primary">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Auto-Sync Schedule</h3>
            <p className="text-sm text-muted-foreground">Configure automatic data synchronization</p>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Azure Migrate Sync */}
          <div className="p-5 rounded-xl bg-muted/30 border border-card-border">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Cloud className="h-5 w-5 text-primary" />
                <span className="font-medium text-foreground">Azure Migrate</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={syncData?.data?.['azure-migrate']?.enabled ?? false}
                  onChange={(e) => updateScheduleMutation.mutate({
                    sourceType: 'azure-migrate',
                    enabled: e.target.checked,
                    intervalMinutes: syncData?.data?.['azure-migrate']?.intervalMinutes,
                  })}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-muted rounded-full peer peer-checked:bg-primary peer-focus:ring-2 peer-focus:ring-ring/50 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
              </label>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <select
                value={syncData?.data?.['azure-migrate']?.intervalMinutes ?? 60}
                onChange={(e) => updateScheduleMutation.mutate({
                  sourceType: 'azure-migrate',
                  enabled: syncData?.data?.['azure-migrate']?.enabled ?? false,
                  intervalMinutes: parseInt(e.target.value) as SyncInterval,
                })}
                disabled={!syncData?.data?.['azure-migrate']?.enabled}
                className={cn(inputClassName, 'py-2 text-sm flex-1')}
              >
                {intervalsData?.data?.intervals?.map((opt: SyncIntervalOption) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                )) || (
                  <>
                    <option value={15}>Every 15 minutes</option>
                    <option value={30}>Every 30 minutes</option>
                    <option value={60}>Every 1 hour</option>
                    <option value={360}>Every 6 hours</option>
                    <option value={1440}>Every 24 hours</option>
                  </>
                )}
              </select>
              <button
                onClick={() => triggerSyncMutation.mutate('azure-migrate')}
                disabled={triggerSyncMutation.isPending}
                className="mm-btn-primary text-sm py-2 px-4 flex items-center gap-2"
              >
                {triggerSyncMutation.isPending && triggerSyncMutation.variables === 'azure-migrate' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                Sync Now
              </button>
            </div>
            <div className="text-sm text-muted-foreground">
              {syncData?.data?.['azure-migrate']?.lastSyncAt ? (
                <>Last sync: {formatTimeAgo(syncData.data['azure-migrate'].lastSyncAt)}</>
              ) : (
                'Never synced'
              )}
              {syncData?.data?.['azure-migrate']?.lastSyncCount != null && (
                <span className="ml-1">({syncData.data['azure-migrate'].lastSyncCount} machines)</span>
              )}
            </div>
          </div>

          {/* DrMigrate Sync */}
          <div className="p-5 rounded-xl bg-muted/30 border border-card-border">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-primary" />
                <span className="font-medium text-foreground">DrMigrate</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={syncData?.data?.drmigrate?.enabled ?? false}
                  onChange={(e) => updateScheduleMutation.mutate({
                    sourceType: 'drmigrate',
                    enabled: e.target.checked,
                    intervalMinutes: syncData?.data?.drmigrate?.intervalMinutes,
                  })}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-muted rounded-full peer peer-checked:bg-primary peer-focus:ring-2 peer-focus:ring-ring/50 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
              </label>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <select
                value={syncData?.data?.drmigrate?.intervalMinutes ?? 60}
                onChange={(e) => updateScheduleMutation.mutate({
                  sourceType: 'drmigrate',
                  enabled: syncData?.data?.drmigrate?.enabled ?? false,
                  intervalMinutes: parseInt(e.target.value) as SyncInterval,
                })}
                disabled={!syncData?.data?.drmigrate?.enabled}
                className={cn(inputClassName, 'py-2 text-sm flex-1')}
              >
                {intervalsData?.data?.intervals?.map((opt: SyncIntervalOption) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                )) || (
                  <>
                    <option value={15}>Every 15 minutes</option>
                    <option value={30}>Every 30 minutes</option>
                    <option value={60}>Every 1 hour</option>
                    <option value={360}>Every 6 hours</option>
                    <option value={1440}>Every 24 hours</option>
                  </>
                )}
              </select>
              <button
                onClick={() => triggerSyncMutation.mutate('drmigrate')}
                disabled={triggerSyncMutation.isPending}
                className="mm-btn-primary text-sm py-2 px-4 flex items-center gap-2"
              >
                {triggerSyncMutation.isPending && triggerSyncMutation.variables === 'drmigrate' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                Sync Now
              </button>
            </div>
            <div className="text-sm text-muted-foreground">
              {syncData?.data?.drmigrate?.lastSyncAt ? (
                <>Last sync: {formatTimeAgo(syncData.data.drmigrate.lastSyncAt)}</>
              ) : (
                'Never synced'
              )}
              {syncData?.data?.drmigrate?.lastSyncCount != null && (
                <span className="ml-1">({syncData.data.drmigrate.lastSyncCount} servers)</span>
              )}
            </div>
          </div>
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

      {/* Trigger Sync Result */}
      {triggerSyncMutation.data?.data && (
        <div className={cn(
          'mm-info-card flex items-center gap-3',
          triggerSyncMutation.data.data.status === 'success' ? 'mm-info-card-success' : 'mm-info-card-danger'
        )}>
          {triggerSyncMutation.data.data.status === 'success' ? (
            <CheckCircle className="h-5 w-5 text-success" />
          ) : (
            <XCircle className="h-5 w-5 text-danger" />
          )}
          <div>
            <p className="font-medium text-foreground">
              {triggerSyncMutation.data.data.status === 'success' ? 'Sync Completed' : 'Sync Failed'}
            </p>
            <p className="text-sm text-muted-foreground">
              {triggerSyncMutation.data.data.status === 'success' 
                ? `Synced ${triggerSyncMutation.data.data.count} items in ${Math.round(triggerSyncMutation.data.data.duration / 1000)}s`
                : triggerSyncMutation.data.data.error
              }
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

// Health Status Indicator Component
function HealthStatusIndicator({ status, errorMessage }: { status: string; errorMessage?: string | null }) {
  const statusConfig = {
    connected: { color: 'bg-success', textColor: 'text-success', label: 'Connected', icon: null },
    warning: { color: 'bg-warning', textColor: 'text-warning', label: 'Warning', icon: AlertTriangle },
    error: { color: 'bg-danger', textColor: 'text-danger', label: 'Error', icon: AlertCircle },
    unknown: { color: 'bg-muted-foreground', textColor: 'text-muted-foreground', label: 'Unknown', icon: null },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.unknown;
  const hasError = status === 'error' && errorMessage;

  return (
    <div className="flex items-center gap-1.5 mt-0.5 group relative">
      <div className={cn('w-2 h-2 rounded-full', config.color)} />
      <span className={cn('text-xs font-medium', config.textColor)}>{config.label}</span>
      {hasError && config.icon && (
        <span title={errorMessage || ''} className="cursor-help">
          <config.icon className={cn('h-3.5 w-3.5', config.textColor)} />
        </span>
      )}
      {hasError && (
        <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover:block">
          <div className="bg-popover text-popover-foreground text-xs rounded-md shadow-lg border border-border p-2 max-w-xs whitespace-normal">
            <p className="font-medium text-danger mb-1">Error Details:</p>
            <p className="text-muted-foreground">{errorMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Format time ago helper
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 1000 / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
