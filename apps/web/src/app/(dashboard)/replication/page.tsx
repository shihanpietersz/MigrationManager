'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertCircle,
  Clock,
  PlayCircle,
  MoreHorizontal,
  Cloud,
  Server,
  Database,
  Shield,
  ExternalLink,
  Info,
  X,
  Activity,
  HardDrive,
  Network,
  Settings,
  RotateCcw,
  Play,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { replicationApi, targetsApi } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import type { ReplicationItem, ReplicationStatus } from '@drmigrate/shared-types';

const statusConfig: Record<
  ReplicationStatus | 'LocalOnly' | 'AzureEnableFailed' | 'PendingAzureSetup',
  { label: string; icon: React.ElementType; color: string; bgColor: string }
> = {
  Enabling: {
    label: 'Enabling',
    icon: Clock,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
  },
  InitialReplication: {
    label: 'Initial Sync',
    icon: RefreshCw,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  Replicating: {
    label: 'Replicating',
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  Protected: {
    label: 'Protected',
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  PlannedFailoverInProgress: {
    label: 'Failing Over',
    icon: PlayCircle,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
  FailedOver: {
    label: 'Failed Over',
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  Failed: {
    label: 'Failed',
    icon: AlertCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  Cancelled: {
    label: 'Cancelled',
    icon: AlertCircle,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
  LocalOnly: {
    label: 'Local Only',
    icon: Info,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
  AzureEnableFailed: {
    label: 'Azure Failed',
    icon: AlertCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  PendingAzureSetup: {
    label: 'Pending Azure Setup',
    icon: Clock,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
};

interface ASRInfrastructure {
  configured: boolean;
  recoveryVault?: {
    name: string;
  };
  replicationFabric?: {
    name: string;
  };
  protectionContainer?: {
    name: string;
  };
  policyId?: string;
  message?: string;
  vaults?: Array<{
    vault: { name: string; location: string };
    fabrics: Array<{
      fabric: { name: string };
      containers: Array<{
        container: { name: string };
        replicatedItems: Array<{ id: string; properties: { friendlyName: string } }>;
      }>;
    }>;
  }>;
}

function ReplicationCard({ 
  item, 
  onViewDetails,
  onDelete,
  onTestMigrate,
  onMigrate,
}: { 
  item: ReplicationItem & { azureSiteRecovery?: { protectedItemId?: string } };
  onViewDetails: (item: ReplicationItem) => void;
  onDelete: (item: ReplicationItem) => void;
  onTestMigrate: (item: ReplicationItem) => void;
  onMigrate: (item: ReplicationItem) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const statusKey = item.status as keyof typeof statusConfig;
  const status = statusConfig[statusKey] || statusConfig.Enabling;
  const StatusIcon = status.icon;
  const hasAzureReplication = !!(item as { azureSiteRecovery?: { protectedItemId?: string } }).azureSiteRecovery?.protectedItemId;

  // Get Azure status details
  const azureStatus = (item as any).azureStatus;
  const displayState = azureStatus?.migrationStateDescription || status.label;
  const replicationStatus = azureStatus?.replicationStatus || '';
  const progress = azureStatus?.initialSeedingProgress ?? azureStatus?.deltaSyncProgress ?? item.replicationProgress;
  const allowedOps = azureStatus?.allowedOperations || [];
  const testMigrateState = azureStatus?.testMigrateState || 'None';
  
  return (
    <div 
      className="rounded-lg border bg-card p-6 shadow-sm cursor-pointer hover:border-primary/50 hover:shadow-md transition-all"
      onClick={() => onViewDetails(item)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate">{item.machineName}</h3>
          <p className="text-sm text-muted-foreground">
            Target: {item.targetConfig.targetVmSize}
          </p>
          {/* Azure status description */}
          {azureStatus && (
            <div className="mt-1 flex items-center gap-2">
              <span className={cn(
                "text-xs font-medium px-2 py-0.5 rounded",
                azureStatus.migrationState === 'Replicating' ? "bg-green-100 text-green-700" :
                azureStatus.migrationState === 'EnableMigrationInProgress' ? "bg-yellow-100 text-yellow-700" :
                "bg-blue-100 text-blue-700"
              )}>
                {displayState}
              </span>
              {replicationStatus && (
                <span className="text-xs text-muted-foreground">• {replicationStatus}</span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasAzureReplication ? (
            <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 flex items-center gap-1">
              <Cloud className="h-3 w-3" />
              Azure
            </span>
          ) : (
            <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">Local</span>
          )}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => setShowMenu(!showMenu)}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-8 z-20 w-48 rounded-md border bg-popover shadow-lg">
                  <div className="py-1">
                    <button
                      className="w-full px-4 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
                      onClick={() => { setShowMenu(false); onViewDetails(item); }}
                    >
                      <Info className="h-4 w-4" />
                      View details
                    </button>
                    <button
                      className="w-full px-4 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 text-red-600"
                      onClick={() => { setShowMenu(false); onDelete(item); }}
                    >
                      <X className="h-4 w-4" />
                      Remove replication
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar - show for initial replication or when progress is available */}
      {(progress !== undefined && progress > 0 && progress < 100) && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">
              {azureStatus?.initialSeedingProgress !== undefined ? 'Initial Sync' : 'Delta Sync'}
            </span>
            <span className="font-medium">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Health errors */}
      {item.healthErrors && item.healthErrors.length > 0 && (
        <div className="mt-3 p-2 rounded bg-red-50 border border-red-200">
          <p className="text-xs text-red-700 line-clamp-2">
            {typeof item.healthErrors[0] === 'string' 
              ? item.healthErrors[0] 
              : (item.healthErrors[0] as any)?.errorMessage || (item.healthErrors[0] as any)?.summaryMessage || 'Health issue detected'}
          </p>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <div className={cn('flex items-center gap-2 text-sm', status.color)}>
          <div className={cn('rounded-full p-1', status.bgColor)}>
            <StatusIcon className="h-3 w-3" />
          </div>
          <span>{status.label}</span>
          {azureStatus?.health && azureStatus.health !== 'Normal' && (
            <span className={cn(
              "text-xs px-1.5 py-0.5 rounded",
              azureStatus.health === 'Warning' ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
            )}>
              {azureStatus.health}
            </span>
          )}
        </div>
        {(azureStatus?.lastRecoveryPointTime || item.lastSyncTime) && (
          <p className="text-xs text-muted-foreground">
            Last sync: {formatDate(azureStatus?.lastRecoveryPointTime || item.lastSyncTime || '')}
          </p>
        )}
      </div>

      {/* Test Migration Status on Card */}
      {testMigrateState === 'TestMigrationInProgress' && (
        <div className="mt-3 p-2 rounded bg-blue-50 border border-blue-200">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3 w-3 text-blue-600 animate-spin" />
            <p className="text-xs text-blue-700 font-medium">Test migration in progress...</p>
          </div>
        </div>
      )}
      
      {testMigrateState === 'TestMigrationSucceeded' && (
        <div className="mt-3 p-2 rounded bg-green-50 border border-green-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3 w-3 text-green-600" />
            <p className="text-xs text-green-700 font-medium">Test migration completed - cleanup required</p>
          </div>
        </div>
      )}

      {testMigrateState === 'TestMigrationCleanupInProgress' && (
        <div className="mt-3 p-2 rounded bg-orange-50 border border-orange-200">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3 w-3 text-orange-600 animate-spin" />
            <p className="text-xs text-orange-700 font-medium">Cleaning up test VM...</p>
          </div>
        </div>
      )}

      {/* Action buttons based on allowed operations */}
      {(allowedOps.includes('TestMigrate') || allowedOps.includes('Migrate') || testMigrateState === 'TestMigrationSucceeded') && (
        <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
          {allowedOps.includes('TestMigrate') && (testMigrateState === 'None' || testMigrateState === 'TestMigrationCleanedUp') && (
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700"
              onClick={() => onTestMigrate(item)}
            >
              <Play className="h-3 w-3 mr-1" />
              Test Migrate
            </Button>
          )}
          {allowedOps.includes('Migrate') && (
            <Button 
              size="sm" 
              className="flex-1 bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600"
              onClick={() => onMigrate(item)}
            >
              <Play className="h-3 w-3 mr-1" />
              Migrate
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// Detailed replication info panel (slide-out)
interface ReplicationDetailsProps {
  item: ReplicationItem;
  onClose: () => void;
}

function ReplicationDetailsPanel({ item, onClose }: ReplicationDetailsProps) {
  const queryClient = useQueryClient();
  
  // Fetch detailed status from Azure
  const { data: detailsData, isLoading: detailsLoading, refetch: refetchDetails } = useQuery({
    queryKey: ['replication-details', item.id],
    queryFn: async () => {
      const response = await fetch(`http://localhost:4000/api/v1/replication/${item.id}/details`);
      const data = await response.json();
      return data.data;
    },
    refetchInterval: 10000,
  });

  // Fetch infrastructure data for target region
  const { data: infrastructureData } = useQuery({
    queryKey: ['replication-infrastructure'],
    queryFn: () => replicationApi.getInfrastructure(),
  });

  // Fetch jobs to find ones related to this machine
  const { data: jobsData } = useQuery({
    queryKey: ['replication-jobs'],
    queryFn: () => replicationApi.getJobs(),
    refetchInterval: 10000,
  });

  // Resync mutation
  const resyncMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`http://localhost:4000/api/v1/replication/${item.id}/resync`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to resync');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['replication'] });
      refetchDetails();
    },
  });

  // Restart job mutation
  const restartJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await fetch(`http://localhost:4000/api/v1/replication/jobs/${jobId}/restart`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to restart job');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['replication-jobs'] });
      refetchDetails();
    },
  });

  // Delete replication mutation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`http://localhost:4000/api/v1/replication/${item.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete replication');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['replication'] });
      onClose();
    },
  });

  // Test Migrate mutation
  const [showTestMigrateConfirm, setShowTestMigrateConfirm] = useState(false);
  const [testMigrateVnetId, setTestMigrateVnetId] = useState<string>('');
  const [testMigrateSubnetName, setTestMigrateSubnetName] = useState<string>('');
  
  // Fetch VNets for test migration when dialog opens
  const targetRegion = infrastructureData?.data?.targetRegion;
  const { data: vnetsData, isLoading: vnetsLoading } = useQuery({
    queryKey: ['vnets', targetRegion],
    queryFn: () => targetsApi.getVnets(targetRegion),
    enabled: showTestMigrateConfirm && !!targetRegion,
  });
  
  // Get subnets for the selected VNet
  const selectedVnet = vnetsData?.data?.find(v => v.id === testMigrateVnetId);
  
  const testMigrateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`http://localhost:4000/api/v1/replication/${item.id}/test-migrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testNetworkId: testMigrateVnetId || undefined,
          testSubnetName: testMigrateSubnetName || undefined,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to start test migration');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['replication'] });
      refetchDetails();
      setShowTestMigrateConfirm(false);
      setTestMigrateVnetId('');
      setTestMigrateSubnetName('');
    },
  });

  // Test Migrate Cleanup mutation
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  const [cleanupComments, setCleanupComments] = useState('');
  
  const testMigrateCleanupMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`http://localhost:4000/api/v1/replication/${item.id}/test-migrate-cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comments: cleanupComments }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to cleanup test migration');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['replication'] });
      refetchDetails();
      setShowCleanupConfirm(false);
      setCleanupComments('');
    },
  });

  // Migrate mutation
  const [showMigrateConfirm, setShowMigrateConfirm] = useState(false);
  const [performShutdown, setPerformShutdown] = useState(true);
  const migrateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`http://localhost:4000/api/v1/replication/${item.id}/migrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performShutdown }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to start migration');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['replication'] });
      refetchDetails();
      setShowMigrateConfirm(false);
    },
  });

  // Complete Migration mutation
  const completeMigrationMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`http://localhost:4000/api/v1/replication/${item.id}/complete-migration`, {
        method: 'POST',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to complete migration');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['replication'] });
      onClose();
    },
  });

  const statusKey = item.status as keyof typeof statusConfig;
  const status = statusConfig[statusKey] || statusConfig.Enabling;
  const StatusIcon = status.icon;

  const azureDetails = detailsData?.azureDetails;
  const relatedJobs = (jobsData?.data || []).filter(
    (j: { targetObjectName?: string; state: string }) => 
      j.targetObjectName?.toLowerCase().includes(item.machineName.toLowerCase())
  ).slice(0, 5);

  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose}>
      <div 
        className="fixed right-0 top-0 h-full w-full max-w-3xl bg-background shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-background border-b px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-xl font-bold">{item.machineName}</h2>
            <p className="text-sm text-muted-foreground">Replication Details</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetchDetails()}>
              <RefreshCw className={cn("h-4 w-4 mr-1", detailsLoading && "animate-spin")} />
              Refresh
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Action buttons toolbar */}
        <div className="border-b px-6 py-3 flex items-center gap-2 flex-wrap bg-muted/30">
          {/* Test Migrate button - available when replicating and no test was done yet */}
          {(azureDetails?.migrationStatus?.allowedOperations?.includes('TestMigrate') || 
            ['Replicating', 'Protected', 'InitialSeedingInProgress'].includes(item.status)) && 
            (!azureDetails?.migrationStatus?.testMigrateState || 
             azureDetails?.migrationStatus?.testMigrateState === 'None' ||
             azureDetails?.migrationStatus?.testMigrateState === 'TestMigrationCleanedUp') && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowTestMigrateConfirm(true)}
              disabled={testMigrateMutation.isPending}
              className="bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700"
            >
              {testMigrateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-1" />
              )}
              Test Migrate
            </Button>
          )}
          
          {/* Test Migrate Cleanup - when test migration was done */}
          {azureDetails?.migrationStatus?.testMigrateState === 'TestMigrationSucceeded' && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowCleanupConfirm(true)}
              disabled={testMigrateCleanupMutation.isPending}
              className="border-orange-200 text-orange-700 hover:bg-orange-50"
            >
              {testMigrateCleanupMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-1" />
              )}
              Cleanup Test VM
            </Button>
          )}

          {/* Migrate button - available when replicating */}
          {(azureDetails?.migrationStatus?.allowedOperations?.includes('Migrate') || 
            ['Replicating', 'Protected'].includes(item.status)) && (
            <Button 
              size="sm"
              onClick={() => setShowMigrateConfirm(true)}
              disabled={migrateMutation.isPending}
              className="bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600"
            >
              {migrateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-1" />
              )}
              Migrate
            </Button>
          )}

          {/* Complete Migration - after successful migrate */}
          {item.status === 'MigrationCompleted' && (
            <Button 
              size="sm"
              onClick={() => completeMigrationMutation.mutate()}
              disabled={completeMigrationMutation.isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {completeMigrationMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1" />
              )}
              Complete Migration
            </Button>
          )}

          {/* Resync button */}
          {(azureDetails?.migrationStatus?.resyncRequired || ['Failed', 'AzureEnableFailed'].includes(item.status)) && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => resyncMutation.mutate()}
              disabled={resyncMutation.isPending}
            >
              {resyncMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-1" />
              )}
              Resync replication
            </Button>
          )}

          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-1" />
            Health error details
          </Button>
          
          <Button 
            variant="outline" 
            size="sm" 
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <X className="h-4 w-4 mr-1" />
            Remove replication
          </Button>
        </div>

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center" onClick={() => setShowDeleteConfirm(false)}>
            <div 
              className="bg-background rounded-lg shadow-xl p-6 max-w-md mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-full bg-red-100">
                  <AlertCircle className="h-6 w-6 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">Remove replication?</h3>
                  <p className="text-muted-foreground mt-1">
                    Are you sure you want to remove replication for <strong>{item.machineName}</strong>? 
                    This will stop replicating this machine to Azure. This action cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button 
                  variant="outline" 
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleteMutation.isPending}
                >
                  Cancel
                </Button>
                <Button 
                  variant="destructive"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Removing...
                    </>
                  ) : (
                    <>
                      <X className="h-4 w-4 mr-1" />
                      Remove replication
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Test Migrate Confirmation Dialog */}
        {showTestMigrateConfirm && (
          <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center" onClick={() => setShowTestMigrateConfirm(false)}>
            <div 
              className="bg-background rounded-lg shadow-xl p-6 max-w-xl mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-full bg-blue-100">
                  <Play className="h-6 w-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">Test Migration</h3>
                  <p className="text-sm text-muted-foreground">{item.machineName}</p>
                </div>
              </div>
              
              {/* VNet and Subnet Selection */}
              <div className="mt-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Virtual Network <span className="text-red-500">*</span>
                  </label>
                  {vnetsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground p-2 border rounded-md">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading VNets...
                    </div>
                  ) : (
                    <select
                      value={testMigrateVnetId}
                      onChange={(e) => {
                        setTestMigrateVnetId(e.target.value);
                        setTestMigrateSubnetName('');
                      }}
                      className="w-full p-2 border rounded-md bg-background text-sm"
                    >
                      <option value="">Select a Virtual Network</option>
                      {vnetsData?.data?.map((vnet) => (
                        <option key={vnet.id} value={vnet.id}>
                          {vnet.name} ({vnet.location})
                        </option>
                      ))}
                    </select>
                  )}
                  {targetRegion && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Region: {targetRegion}
                    </p>
                  )}
                </div>
                
                {testMigrateVnetId && selectedVnet && (
                  <div>
                    <label className="block text-sm font-medium mb-1.5">
                      Subnet <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={testMigrateSubnetName}
                      onChange={(e) => setTestMigrateSubnetName(e.target.value)}
                      className="w-full p-2 border rounded-md bg-background text-sm"
                    >
                      <option value="">Select a Subnet</option>
                      {selectedVnet.subnets?.map((subnet) => (
                        <option key={subnet.id} value={subnet.name}>
                          {subnet.name} ({subnet.addressPrefix})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Network Interfaces info */}
                {azureDetails?.vmNics && azureDetails.vmNics.length > 0 && (
                  <div className="p-3 bg-muted/50 rounded-lg border">
                    <h4 className="text-sm font-medium mb-2">Network Interfaces</h4>
                    <div className="space-y-1.5">
                      {azureDetails.vmNics.map((nic: { nicId: string; isPrimaryNic: boolean; targetNicName?: string }, idx: number) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {nic.targetNicName || `nic-${item.machineName}-${idx}`}
                          </span>
                          {nic.isPrimaryNic && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                              Primary
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="font-medium text-blue-800 text-sm">What happens during test migration:</h4>
                <ul className="mt-2 text-sm text-blue-700 space-y-1">
                  <li>• A test VM is created in the selected network</li>
                  <li>• The source VM continues running normally</li>
                  <li>• Validate the test VM configuration</li>
                  <li>• Clean up the test VM when done</li>
                </ul>
              </div>

              {testMigrateMutation.error && (
                <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-sm text-red-700">{testMigrateMutation.error.message}</p>
                </div>
              )}
              <div className="flex justify-end gap-2 mt-6">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowTestMigrateConfirm(false);
                    setTestMigrateVnetId('');
                    setTestMigrateSubnetName('');
                  }}
                  disabled={testMigrateMutation.isPending}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => testMigrateMutation.mutate()}
                  disabled={testMigrateMutation.isPending || !testMigrateVnetId || !testMigrateSubnetName}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {testMigrateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-1" />
                      Test Migration
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Migrate Confirmation Dialog */}
        {showMigrateConfirm && (
          <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center" onClick={() => setShowMigrateConfirm(false)}>
            <div 
              className="bg-background rounded-lg shadow-xl p-6 max-w-lg mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-full bg-purple-100">
                  <Play className="h-6 w-6 text-purple-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">Start Migration?</h3>
                  <p className="text-muted-foreground mt-1">
                    This will migrate <strong>{item.machineName}</strong> to Azure. 
                    This is the final migration step.
                  </p>
                  <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <h4 className="font-medium text-amber-800 text-sm flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      Important
                    </h4>
                    <p className="mt-1 text-sm text-amber-700">
                      Migration will sync the final data and create the Azure VM. 
                      After migration, the VM will run in Azure.
                    </p>
                  </div>
                  <div className="mt-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={performShutdown}
                        onChange={(e) => setPerformShutdown(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">
                        Shutdown source VM before migration <span className="text-muted-foreground">(recommended)</span>
                      </span>
                    </label>
                    <p className="mt-1 ml-6 text-xs text-muted-foreground">
                      Shutting down the source ensures all data is synced and prevents data inconsistency.
                    </p>
                  </div>
                </div>
              </div>
              {migrateMutation.error && (
                <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-sm text-red-700">{migrateMutation.error.message}</p>
                </div>
              )}
              <div className="flex justify-end gap-2 mt-6">
                <Button 
                  variant="outline" 
                  onClick={() => setShowMigrateConfirm(false)}
                  disabled={migrateMutation.isPending}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => migrateMutation.mutate()}
                  disabled={migrateMutation.isPending}
                  className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
                >
                  {migrateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Starting Migration...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-1" />
                      Start Migration
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Test Migration Cleanup Confirmation Dialog */}
        {showCleanupConfirm && (
          <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center" onClick={() => setShowCleanupConfirm(false)}>
            <div 
              className="bg-background rounded-lg shadow-xl p-6 max-w-lg mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-full bg-orange-100">
                  <RotateCcw className="h-6 w-6 text-orange-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">Clean Up Test Migration?</h3>
                  <p className="text-muted-foreground mt-1">
                    This will delete the test VM created for <strong>{item.machineName}</strong> and all associated resources.
                  </p>
                  <div className="mt-4">
                    <label htmlFor="cleanup-comments" className="block text-sm font-medium text-foreground mb-1">
                      Comments (optional)
                    </label>
                    <textarea
                      id="cleanup-comments"
                      value={cleanupComments}
                      onChange={(e) => setCleanupComments(e.target.value)}
                      placeholder="Add any notes about this cleanup operation..."
                      className="w-full px-3 py-2 border rounded-md bg-background text-sm resize-none"
                      rows={3}
                      disabled={testMigrateCleanupMutation.isPending}
                    />
                  </div>
                  <div className="mt-4 p-3 bg-orange-50 rounded-lg border border-orange-200">
                    <h4 className="font-medium text-orange-800 text-sm">What will be cleaned up:</h4>
                    <ul className="mt-2 text-sm text-orange-700 space-y-1">
                      <li>• Test VM: {item.machineName}-test</li>
                      <li>• Associated disks and network interfaces</li>
                      <li>• Test migration resources</li>
                    </ul>
                  </div>
                </div>
              </div>
              {testMigrateCleanupMutation.error && (
                <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-sm text-red-700">{testMigrateCleanupMutation.error.message}</p>
                </div>
              )}
              <div className="flex justify-end gap-2 mt-6">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowCleanupConfirm(false);
                    setCleanupComments('');
                  }}
                  disabled={testMigrateCleanupMutation.isPending}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => testMigrateCleanupMutation.mutate()}
                  disabled={testMigrateCleanupMutation.isPending}
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {testMigrateCleanupMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Cleaning Up...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Clean Up Test VM
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="p-6 space-y-6">
          {/* Migration Status Section */}
          <div className="rounded-lg border bg-card">
            <div className="px-4 py-3 border-b bg-muted/30">
              <h3 className="font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Migration status
              </h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Replication status</span>
                  <p className={cn("font-medium", status.color)}>
                    {azureDetails?.migrationStatus?.replicationStatusDescription || status.label}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Migration status</span>
                  <p className="font-medium">{azureDetails?.migrationStatus?.migrationState || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Replication health</span>
                  <p className={cn("font-medium", 
                    azureDetails?.migrationStatus?.replicationHealth === 'Normal' ? 'text-green-600' : 
                    azureDetails?.migrationStatus?.replicationHealth === 'Warning' ? 'text-yellow-600' : 'text-red-600'
                  )}>
                    {azureDetails?.migrationStatus?.replicationHealth || item.healthStatus || '-'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Test migration status</span>
                  <p className="font-medium flex items-center gap-1">
                    {(() => {
                      const state = azureDetails?.migrationStatus?.testMigrateState;
                      const description = azureDetails?.migrationStatus?.testMigrateStateDescription;
                      
                      if (!state || state === 'None') {
                        return <><AlertCircle className="h-3 w-3 text-yellow-500" /> Not performed</>;
                      }
                      if (state === 'TestMigrationInProgress') {
                        return <><Loader2 className="h-3 w-3 text-blue-500 animate-spin" /> <span className="text-blue-600">In progress</span></>;
                      }
                      if (state === 'TestMigrationSucceeded') {
                        return <><CheckCircle2 className="h-3 w-3 text-green-500" /> <span className="text-green-600">Completed</span></>;
                      }
                      if (state === 'TestMigrationFailed') {
                        return <><AlertCircle className="h-3 w-3 text-red-500" /> <span className="text-red-600">Failed</span></>;
                      }
                      if (state === 'TestMigrationCleanedUp') {
                        return <><CheckCircle2 className="h-3 w-3 text-gray-500" /> Cleaned up</>;
                      }
                      if (state === 'TestMigrationCleanupInProgress') {
                        return <><Loader2 className="h-3 w-3 text-orange-500 animate-spin" /> <span className="text-orange-600">Cleanup in progress</span></>;
                      }
                      return description || state;
                    })()}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Configuration issues</span>
                  <p className={cn("font-medium flex items-center gap-1",
                    (azureDetails?.migrationStatus?.configurationIssues?.length || 0) > 0 ? 'text-red-600' : 'text-green-600'
                  )}>
                    {(azureDetails?.migrationStatus?.configurationIssues?.length || 0) > 0 ? (
                      <><AlertCircle className="h-3 w-3" /> {azureDetails?.migrationStatus?.configurationIssues?.length} issues</>
                    ) : (
                      <><CheckCircle2 className="h-3 w-3" /> No issues</>
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Last synchronized</span>
                  <p className="font-medium">
                    {azureDetails?.migrationStatus?.lastSyncTime 
                      ? formatDate(azureDetails.migrationStatus.lastSyncTime)
                      : item.lastSyncTime 
                        ? formatDate(item.lastSyncTime)
                        : '-'
                    }
                  </p>
                </div>
              </div>

              {/* Progress bars */}
              {azureDetails?.migrationStatus?.initialReplicationProgressPercentage !== undefined && (
                <div className="pt-2">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Initial replication</span>
                    <span className="font-medium">{azureDetails.migrationStatus.initialReplicationProgressPercentage}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all"
                      style={{ width: `${azureDetails.migrationStatus.initialReplicationProgressPercentage}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Test Migration Status Banner */}
              {azureDetails?.migrationStatus?.testMigrateState === 'TestMigrationInProgress' && (
                <div className="pt-3">
                  <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-blue-100">
                        <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-blue-800">Test Migration In Progress</h4>
                        <p className="text-sm text-blue-600">
                          Creating test VM in Azure. This may take several minutes...
                        </p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-blue-700">Progress</span>
                        <span className="font-medium text-blue-800">
                          {azureDetails?.currentJob?.state === 'InProgress' ? 'In progress...' : 'Initializing...'}
                        </span>
                      </div>
                      <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 transition-all animate-pulse" style={{ width: '60%' }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {azureDetails?.migrationStatus?.testMigrateState === 'TestMigrationSucceeded' && (
                <div className="pt-3">
                  <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-green-100">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-green-800">Test Migration Completed</h4>
                        <p className="text-sm text-green-600">
                          Test VM has been created successfully. Validate the VM and clean up when done.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {azureDetails?.migrationStatus?.testMigrateState === 'TestMigrationFailed' && (
                <div className="pt-3">
                  <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-red-100">
                        <AlertCircle className="h-5 w-5 text-red-600" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-red-800">Test Migration Failed</h4>
                        <p className="text-sm text-red-600">
                          {azureDetails?.migrationStatus?.testMigrateStateDescription || 'Test migration failed. Check the events for more details.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {azureDetails?.migrationStatus?.testMigrateState === 'TestMigrationCleanupInProgress' && (
                <div className="pt-3">
                  <div className="p-4 rounded-lg bg-orange-50 border border-orange-200">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-orange-100">
                        <Loader2 className="h-5 w-5 text-orange-600 animate-spin" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-orange-800">Cleaning Up Test VM</h4>
                        <p className="text-sm text-orange-600">
                          Removing test VM and associated resources...
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Health errors */}
              {((azureDetails?.migrationStatus?.configurationIssues?.length || 0) > 0 || (item.healthErrors?.length || 0) > 0) && (
                <div className="pt-2 space-y-2">
                  <p className="text-sm font-medium text-red-600">Configuration Issues:</p>
                  {(azureDetails?.migrationStatus?.configurationIssues || []).map((issue: { errorMessage: string; recommendedAction?: string }, i: number) => (
                    <div key={i} className="p-3 rounded bg-red-50 border border-red-200">
                      <p className="text-sm text-red-700">{issue.errorMessage}</p>
                      {issue.recommendedAction && (
                        <p className="text-xs text-red-600 mt-1">Recommended: {issue.recommendedAction}</p>
                      )}
                    </div>
                  ))}
                  {(item.healthErrors || []).map((error: any, i) => (
                    <div key={`local-${i}`} className="p-3 rounded bg-red-50 border border-red-200">
                      <p className="text-sm text-red-700">
                        {typeof error === 'string' ? error : error?.errorMessage || error?.summaryMessage || 'Health issue'}
                      </p>
                      {error?.recommendedAction && (
                        <p className="text-xs text-red-600 mt-1">Recommended: {error.recommendedAction}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Server Details Section */}
          <div className="rounded-lg border bg-card">
            <div className="px-4 py-3 border-b bg-muted/30">
              <h3 className="font-semibold flex items-center gap-2">
                <Server className="h-4 w-4" />
                Server details
              </h3>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Site</span>
                  <p className="font-medium">{azureDetails?.serverDetails?.site || 'ucs-virtual3775site (VMware)'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">VM ID</span>
                  <p className="font-medium font-mono text-xs">{azureDetails?.serverDetails?.vmId || item.sourceServerId?.split('/').pop() || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Operating System</span>
                  <p className="font-medium">{azureDetails?.serverDetails?.operatingSystem || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Firmware</span>
                  <p className="font-medium">{azureDetails?.serverDetails?.firmwareType || 'BIOS'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Disk count</span>
                  <p className="font-medium">{azureDetails?.serverDetails?.diskCount || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total disk size</span>
                  <p className="font-medium">{azureDetails?.serverDetails?.totalDiskSizeGB ? `${azureDetails.serverDetails.totalDiskSizeGB} GB` : '-'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Target Settings Section */}
          <div className="rounded-lg border bg-card">
            <div className="px-4 py-3 border-b bg-muted/30">
              <h3 className="font-semibold flex items-center gap-2">
                <Network className="h-4 w-4" />
                Replication settings and target configuration
              </h3>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Target VM name</span>
                  <p className="font-medium">{azureDetails?.targetSettings?.targetVmName || item.machineName}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Target resource group</span>
                  <p className="font-medium">{azureDetails?.targetSettings?.targetResourceGroup || item.targetConfig?.targetResourceGroup}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Target VM size</span>
                  <p className="font-medium">{azureDetails?.targetSettings?.targetVmSize || item.targetConfig?.targetVmSize}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Target network</span>
                  <p className="font-medium">{azureDetails?.targetSettings?.targetNetwork || item.targetConfig?.targetVnetId?.split('/').pop()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Target subnet</span>
                  <p className="font-medium">{azureDetails?.targetSettings?.targetSubnet || item.targetConfig?.targetSubnetName}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Availability zone</span>
                  <p className="font-medium">{azureDetails?.targetSettings?.targetAvailabilityZone || item.targetConfig?.availabilityZone || 'None'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">License type</span>
                  <p className="font-medium">{azureDetails?.targetSettings?.licenseType || item.targetConfig?.licenseType}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Boot diagnostics storage</span>
                  <p className="font-medium">{azureDetails?.targetSettings?.bootDiagnosticsStorageAccount || '-'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Related Jobs / Events Section */}
          <div className="rounded-lg border bg-card">
            <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Events (last 72 hours)
              </h3>
              <a 
                href={`https://portal.azure.com/#view/Microsoft_Azure_RecoveryServices/ReplicatedItemOverviewBlade/jobId/${item.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline flex items-center gap-1"
              >
                Open in Azure portal
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="p-4">
              {relatedJobs.length === 0 && (!azureDetails?.events || azureDetails.events.length === 0) ? (
                <p className="text-sm text-muted-foreground text-center py-4">No recent events</p>
              ) : (
                <div className="space-y-2">
                  {/* Show jobs */}
                  {relatedJobs.map((job: { name: string; scenarioName: string; state: string; startTime: string; stateDescription: string }) => (
                    <div key={job.name} className="flex items-center justify-between p-3 rounded bg-muted/50">
                      <div>
                        <p className="text-sm font-medium">{job.scenarioName}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(job.startTime)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-xs px-2 py-1 rounded",
                          job.state === 'Succeeded' ? 'bg-green-100 text-green-700' :
                          job.state === 'Failed' ? 'bg-red-100 text-red-700' :
                          job.state === 'InProgress' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        )}>
                          {job.stateDescription || job.state}
                        </span>
                        {job.state === 'Failed' && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => restartJobMutation.mutate(job.name)}
                            disabled={restartJobMutation.isPending}
                          >
                            {restartJobMutation.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3 w-3" />
                            )}
                            <span className="ml-1">Restart</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {/* Show Azure events */}
                  {(azureDetails?.events || []).map((event: { eventName: string; description: string; timeStamp: string; severity: string }, i: number) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded bg-muted/50">
                      <div>
                        <p className="text-sm font-medium">{event.eventName}</p>
                        <p className="text-xs text-muted-foreground">{event.description}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(event.timeStamp)}</p>
                      </div>
                      <span className={cn(
                        "text-xs px-2 py-1 rounded",
                        event.severity === 'Error' ? 'bg-red-100 text-red-700' :
                        event.severity === 'Warning' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      )}>
                        {event.severity}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfrastructurePanel({ infrastructure }: { infrastructure: ASRInfrastructure | null }) {
  if (!infrastructure) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="h-5 w-5 text-blue-500" />
          <h3 className="font-semibold">Azure Site Recovery</h3>
        </div>
        <div className="flex items-center justify-center py-4">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!infrastructure.configured) {
    return (
      <div className="rounded-lg border border-orange-200 bg-orange-50 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
          <div>
            <h3 className="font-semibold text-orange-800">Azure Not Configured</h3>
            <p className="text-sm text-orange-700 mt-1">
              Configure Azure credentials in Settings to enable replication.
            </p>
            <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-orange-800 font-medium mt-2 hover:underline">
              Go to Settings
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { recoveryVault, replicationFabric, protectionContainer, policyId } = infrastructure;

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <Shield className="h-5 w-5 text-blue-500" />
        <h3 className="font-semibold">Azure Site Recovery Infrastructure</h3>
      </div>

      {!recoveryVault ? (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-800">Recovery Services Vault Not Found</p>
              <p className="text-sm text-yellow-700 mt-1">
                {infrastructure.message || 'Please set up Azure Migrate to automatically create the Recovery Services vault.'}
              </p>
              <a
                href="https://portal.azure.com/#view/Microsoft_Azure_Migrate/AmhResourceMenuBlade/~/overview"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-yellow-800 font-medium mt-2 hover:underline"
              >
                Set up Azure Migrate
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Recovery Vault */}
          {recoveryVault && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Database className="h-5 w-5 text-blue-500" />
              <div className="flex-1">
                <p className="font-medium text-sm">{recoveryVault.name}</p>
                <p className="text-xs text-muted-foreground">Recovery Services Vault</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
          )}

          {/* Replication Fabric */}
          {replicationFabric && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Server className="h-5 w-5 text-purple-500" />
              <div className="flex-1">
                <p className="font-medium text-sm">{replicationFabric.name}</p>
                <p className="text-xs text-muted-foreground">Replication Fabric (VMware Site)</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
          )}

          {/* Protection Container */}
          {protectionContainer && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Shield className="h-5 w-5 text-cyan-500" />
              <div className="flex-1">
                <p className="font-medium text-sm">{protectionContainer.name}</p>
                <p className="text-xs text-muted-foreground">Protection Container</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
          )}

          {/* Policy Status */}
          {policyId ? (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div className="flex-1">
                <p className="font-medium text-sm text-green-800">Replication Policy Configured</p>
                <p className="text-xs text-green-600">Ready to enable replication for machines</p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-orange-50 border border-orange-200 p-4 mt-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-orange-800">Replication Policy Not Configured</p>
                  <p className="text-sm text-orange-700 mt-1">
                    The Azure Migrate replication appliance needs to be set up to enable replication. Please ensure:
                  </p>
                  <ul className="list-disc list-inside text-sm text-orange-700 mt-2 space-y-1">
                    <li>Replication appliance is deployed</li>
                    <li>Appliance is registered with Azure Migrate</li>
                    <li>vCenter credentials are configured</li>
                  </ul>
                  <a
                    href="https://learn.microsoft.com/en-us/azure/migrate/tutorial-migrate-vmware-agent"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-orange-800 font-medium mt-3 hover:underline"
                  >
                    Learn how to set up replication
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReplicationPage() {
  const [selectedItem, setSelectedItem] = useState<ReplicationItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<ReplicationItem | null>(null);
  const [itemToTestMigrate, setItemToTestMigrate] = useState<ReplicationItem | null>(null);
  const [pageLevelTestVnetId, setPageLevelTestVnetId] = useState<string>('');
  const [pageLevelTestSubnetName, setPageLevelTestSubnetName] = useState<string>('');
  const [itemToMigrate, setItemToMigrate] = useState<ReplicationItem | null>(null);
  const [performShutdown, setPerformShutdown] = useState(true);
  const queryClient = useQueryClient();
  
  // Delete mutation at page level for card actions
  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await fetch(`http://localhost:4000/api/v1/replication/${itemId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete replication');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['replication'] });
      setItemToDelete(null);
    },
  });

  // Test Migrate mutation at page level
  const testMigrateMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await fetch(`http://localhost:4000/api/v1/replication/${itemId}/test-migrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testNetworkId: pageLevelTestVnetId || undefined,
          testSubnetName: pageLevelTestSubnetName || undefined,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to start test migration');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['replication'] });
      setItemToTestMigrate(null);
      setPageLevelTestVnetId('');
      setPageLevelTestSubnetName('');
    },
  });

  // Migrate mutation at page level
  const migrateMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await fetch(`http://localhost:4000/api/v1/replication/${itemId}/migrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performShutdown }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to start migration');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['replication'] });
      setItemToMigrate(null);
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['replication'],
    queryFn: () => replicationApi.list(),
    refetchInterval: 5000, // Poll every 5 seconds
  });

  const { data: infraData, isLoading: infraLoading } = useQuery({
    queryKey: ['replication-infrastructure'],
    queryFn: () => replicationApi.getInfrastructure(),
    refetchInterval: 30000, // Poll every 30 seconds
  });

  // Fetch VNets for test migration when dialog opens
  const pageTargetRegion = (infraData?.data as ASRInfrastructure | null)?.targetRegion;
  const { data: pageVnetsData, isLoading: pageVnetsLoading } = useQuery({
    queryKey: ['page-vnets', pageTargetRegion],
    queryFn: () => targetsApi.getVnets(pageTargetRegion),
    enabled: !!itemToTestMigrate && !!pageTargetRegion,
  });
  const pageSelectedVnet = pageVnetsData?.data?.find(v => v.id === pageLevelTestVnetId);

  const items = data?.data || [];
  const infrastructure = infraData?.data as ASRInfrastructure | null;

  const stats = {
    total: items.length,
    protected: items.filter((i: ReplicationItem) => i.status === 'Protected').length,
    syncing: items.filter((i: ReplicationItem) =>
      ['Enabling', 'InitialReplication'].includes(i.status)
    ).length,
    failed: items.filter((i: ReplicationItem) => ['Failed', 'AzureEnableFailed'].includes(i.status)).length,
    localOnly: items.filter((i: ReplicationItem) => i.status === 'LocalOnly').length,
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Replication</h1>
          <p className="text-muted-foreground mt-1">
            Monitor and manage machine replications to Azure using Site Recovery
          </p>
        </div>
        <Link href="/replication/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Enable Replication
          </Button>
        </Link>
      </div>

      {/* Azure Site Recovery Infrastructure */}
      <InfrastructurePanel infrastructure={infraLoading ? null : infrastructure} />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Machines</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Protected</p>
          <p className="text-2xl font-bold text-green-600">{stats.protected}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Syncing</p>
          <p className="text-2xl font-bold text-blue-600">{stats.syncing}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Failed</p>
          <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Local Only</p>
          <p className="text-2xl font-bold text-gray-500">{stats.localOnly}</p>
        </div>
      </div>

      {/* Replication Items Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border bg-card p-6 animate-pulse">
              <div className="h-4 w-32 bg-muted rounded mb-2" />
              <div className="h-3 w-24 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <RefreshCw className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="font-semibold mb-2">No replications configured</h3>
          <p className="text-muted-foreground mb-4">
            Enable replication for your assessed machines to start migrating to Azure
          </p>
          <Link href="/replication/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Enable Replication
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item: ReplicationItem) => (
            <ReplicationCard 
              key={item.id} 
              item={item} 
              onViewDetails={(item) => setSelectedItem(item)}
              onDelete={(item) => setItemToDelete(item)}
              onTestMigrate={(item) => setItemToTestMigrate(item)}
              onMigrate={(item) => setItemToMigrate(item)}
            />
          ))}
        </div>
      )}

      {/* Detail Panel */}
      {selectedItem && (
        <ReplicationDetailsPanel 
          item={selectedItem} 
          onClose={() => setSelectedItem(null)} 
        />
      )}

      {/* Delete Confirmation Dialog (page level) */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setItemToDelete(null)}>
          <div 
            className="bg-background rounded-lg shadow-xl p-6 max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-full bg-red-100">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Remove replication?</h3>
                <p className="text-muted-foreground mt-1">
                  Are you sure you want to remove replication for <strong>{itemToDelete.machineName}</strong>? 
                  This will stop replicating this machine to Azure. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button 
                variant="outline" 
                onClick={() => setItemToDelete(null)}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive"
                onClick={() => deleteMutation.mutate(itemToDelete.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Removing...
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4 mr-1" />
                    Remove replication
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Test Migrate Confirmation Dialog (page level) */}
      {itemToTestMigrate && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => {
          setItemToTestMigrate(null);
          setPageLevelTestVnetId('');
          setPageLevelTestSubnetName('');
        }}>
          <div 
            className="bg-background rounded-lg shadow-xl p-6 max-w-xl mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-full bg-blue-100">
                <Play className="h-6 w-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Test Migration</h3>
                <p className="text-sm text-muted-foreground">{itemToTestMigrate.machineName}</p>
              </div>
            </div>

            {/* VNet and Subnet Selection */}
            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Virtual Network <span className="text-red-500">*</span>
                </label>
                {pageVnetsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground p-2 border rounded-md">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading VNets...
                  </div>
                ) : (
                  <select
                    value={pageLevelTestVnetId}
                    onChange={(e) => {
                      setPageLevelTestVnetId(e.target.value);
                      setPageLevelTestSubnetName('');
                    }}
                    className="w-full p-2 border rounded-md bg-background text-sm"
                  >
                    <option value="">Select a Virtual Network</option>
                    {pageVnetsData?.data?.map((vnet) => (
                      <option key={vnet.id} value={vnet.id}>
                        {vnet.name} ({vnet.location})
                      </option>
                    ))}
                  </select>
                )}
                {pageTargetRegion && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Region: {pageTargetRegion}
                  </p>
                )}
              </div>

              {pageLevelTestVnetId && pageSelectedVnet && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Subnet <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={pageLevelTestSubnetName}
                    onChange={(e) => setPageLevelTestSubnetName(e.target.value)}
                    className="w-full p-2 border rounded-md bg-background text-sm"
                  >
                    <option value="">Select a Subnet</option>
                    {pageSelectedVnet.subnets?.map((subnet) => (
                      <option key={subnet.id} value={subnet.name}>
                        {subnet.name} ({subnet.addressPrefix})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-medium text-blue-800 text-sm">What happens during test migration:</h4>
              <ul className="mt-2 text-sm text-blue-700 space-y-1">
                <li>• A test VM is created in the selected network</li>
                <li>• Source VM continues running normally</li>
                <li>• Validate the test VM configuration</li>
                <li>• Clean up the test VM when done</li>
              </ul>
            </div>

            {testMigrateMutation.error && (
              <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm text-red-700">{testMigrateMutation.error.message}</p>
              </div>
            )}
            <div className="flex justify-end gap-2 mt-6">
              <Button 
                variant="outline" 
                onClick={() => {
                  setItemToTestMigrate(null);
                  setPageLevelTestVnetId('');
                  setPageLevelTestSubnetName('');
                }}
                disabled={testMigrateMutation.isPending}
              >
                Cancel
              </Button>
              <Button 
                onClick={() => testMigrateMutation.mutate(itemToTestMigrate.id)}
                disabled={testMigrateMutation.isPending || !pageLevelTestVnetId || !pageLevelTestSubnetName}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {testMigrateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-1" />
                    Test Migration
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Migrate Confirmation Dialog (page level) */}
      {itemToMigrate && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setItemToMigrate(null)}>
          <div 
            className="bg-background rounded-lg shadow-xl p-6 max-w-lg mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-full bg-purple-100">
                <Play className="h-6 w-6 text-purple-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Start Migration?</h3>
                <p className="text-muted-foreground mt-1">
                  This will migrate <strong>{itemToMigrate.machineName}</strong> to Azure. 
                  This is the final migration step.
                </p>
                <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <h4 className="font-medium text-amber-800 text-sm flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    Important
                  </h4>
                  <p className="mt-1 text-sm text-amber-700">
                    Migration will sync the final data and create the Azure VM.
                    After migration, the VM will run in Azure.
                  </p>
                </div>
                <div className="mt-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={performShutdown}
                      onChange={(e) => setPerformShutdown(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">
                      Shutdown source VM before migration <span className="text-muted-foreground">(recommended)</span>
                    </span>
                  </label>
                </div>
              </div>
            </div>
            {migrateMutation.error && (
              <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm text-red-700">{migrateMutation.error.message}</p>
              </div>
            )}
            <div className="flex justify-end gap-2 mt-6">
              <Button 
                variant="outline" 
                onClick={() => setItemToMigrate(null)}
                disabled={migrateMutation.isPending}
              >
                Cancel
              </Button>
              <Button 
                onClick={() => migrateMutation.mutate(itemToMigrate.id)}
                disabled={migrateMutation.isPending}
                className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
              >
                {migrateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Starting Migration...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-1" />
                    Start Migration
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

