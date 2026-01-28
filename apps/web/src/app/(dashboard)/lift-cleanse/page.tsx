'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { liftCleanseApi, type LiftCleanseScript, type AzureVM, type ScriptExecution } from '@/lib/api';
import {
  Sparkles,
  Play,
  FileCode,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Terminal,
  Settings2,
  ChevronRight,
  Server,
  Tag,
  Calendar,
  Trash2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  PlusCircle,
  History,
} from 'lucide-react';

export default function LiftCleansePage() {
  const queryClient = useQueryClient();
  const [selectedScript, setSelectedScript] = useState<LiftCleanseScript | null>(null);
  const [selectedVMs, setSelectedVMs] = useState<AzureVM[]>([]);
  const [showExecuteDialog, setShowExecuteDialog] = useState(false);
  const [parameters, setParameters] = useState<Record<string, string>>({});

  // Fetch scripts
  const { data: scriptsData, isLoading: scriptsLoading } = useQuery({
    queryKey: ['lift-cleanse-scripts'],
    queryFn: () => liftCleanseApi.listScripts(),
  });

  // Fetch recent executions
  const { data: executionsData, isLoading: executionsLoading } = useQuery({
    queryKey: ['lift-cleanse-executions'],
    queryFn: () => liftCleanseApi.listExecutions({ limit: 5 }),
    refetchInterval: 5000, // Poll for updates
  });

  // Fetch VMs
  const { data: vmsData, isLoading: vmsLoading } = useQuery({
    queryKey: ['lift-cleanse-vms'],
    queryFn: () => liftCleanseApi.listVMs(),
  });

  const scripts = scriptsData?.data || [];
  const executions = executionsData?.data?.executions || [];
  const vms = vmsData?.data || [];

  // Stats
  const totalScripts = scripts.length;
  const builtInScripts = scripts.filter(s => s.isBuiltIn).length;
  const customScripts = scripts.filter(s => !s.isBuiltIn).length;
  const runningExecutions = executions.filter(e => e.status === 'running').length;

  // Execute mutation
  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedScript || selectedVMs.length === 0) {
        throw new Error('Select a script and at least one VM');
      }
      return liftCleanseApi.executeScript({
        scriptId: selectedScript.id,
        targets: selectedVMs.map(vm => ({
          vmId: vm.id,
          vmName: vm.name,
          resourceGroup: vm.resourceGroup,
          subscriptionId: vm.subscriptionId,
          osType: vm.osType.toLowerCase() as 'windows' | 'linux',
        })),
        parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lift-cleanse-executions'] });
      setShowExecuteDialog(false);
      setSelectedScript(null);
      setSelectedVMs([]);
      setParameters({});
    },
  });

  const getRiskIcon = (level: string) => {
    switch (level) {
      case 'low':
        return <ShieldCheck className="h-4 w-4 text-green-500" />;
      case 'medium':
        return <Shield className="h-4 w-4 text-yellow-500" />;
      case 'high':
        return <ShieldAlert className="h-4 w-4 text-orange-500" />;
      case 'critical':
        return <ShieldAlert className="h-4 w-4 text-red-500" />;
      default:
        return <Shield className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'cleanup':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'install':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'configure':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'diagnostic':
        return 'bg-green-100 text-green-700 border-green-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            Lift & Cleanse
          </h1>
          <p className="text-muted-foreground mt-1">
            Post-migration VM management and script execution
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/lift-cleanse/tests">
            <Button variant="outline">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Validation Tests
            </Button>
          </Link>
          <Link href="/lift-cleanse/scripts/new">
            <Button variant="outline">
              <PlusCircle className="h-4 w-4 mr-2" />
              New Script
            </Button>
          </Link>
          <Link href="/lift-cleanse/execute">
            <Button className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700">
              <Play className="h-4 w-4 mr-2" />
              Execute Script
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <FileCode className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalScripts}</p>
              <p className="text-xs text-muted-foreground">Total Scripts</p>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {builtInScripts} built-in, {customScripts} custom
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100">
              <Server className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{vms.length}</p>
              <p className="text-xs text-muted-foreground">Available VMs</p>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {vms.filter(v => v.powerState === 'VM running').length} running
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100">
              <Terminal className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{runningExecutions}</p>
              <p className="text-xs text-muted-foreground">Running Now</p>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {executions.filter(e => e.status === 'completed').length} completed today
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {executions.length > 0
                  ? Math.round(
                      (executions.filter(e => e.status === 'completed' && e.failedCount === 0).length /
                        executions.length) *
                        100
                    )
                  : 0}%
              </p>
              <p className="text-xs text-muted-foreground">Success Rate</p>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Last 5 executions</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-lg border bg-card p-4">
        <h3 className="font-semibold mb-3">Quick Actions</h3>
        <div className="flex gap-2 flex-wrap">
          <Link href="/lift-cleanse/scripts">
            <Button variant="outline" size="sm">
              <FileCode className="h-4 w-4 mr-2" />
              Script Library
            </Button>
          </Link>
          <Link href="/lift-cleanse/execute">
            <Button variant="outline" size="sm">
              <Play className="h-4 w-4 mr-2" />
              Execute Script
            </Button>
          </Link>
          <Link href="/lift-cleanse/history">
            <Button variant="outline" size="sm">
              <History className="h-4 w-4 mr-2" />
              Execution History
            </Button>
          </Link>
          <Link href="/lift-cleanse/scripts/new">
            <Button variant="outline" size="sm">
              <PlusCircle className="h-4 w-4 mr-2" />
              Create Script
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Script Library Preview */}
        <div className="rounded-lg border bg-card">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <FileCode className="h-4 w-4" />
              Script Library
            </h3>
            <Link href="/lift-cleanse/scripts">
              <Button variant="ghost" size="sm">
                View All
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
          <div className="p-4 space-y-3">
            {scriptsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : scripts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No scripts available
              </p>
            ) : (
              scripts.slice(0, 5).map(script => (
                <div
                  key={script.id}
                  className="p-3 rounded-lg border hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors cursor-pointer"
                  onClick={() => {
                    setSelectedScript(script);
                    setShowExecuteDialog(true);
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-sm">{script.name}</h4>
                        {script.isBuiltIn && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                            Built-in
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {script.description || 'No description'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded border', getCategoryColor(script.category))}>
                        {script.category}
                      </span>
                      {getRiskIcon(script.riskLevel)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Terminal className="h-3 w-3" />
                      {script.scriptType === 'powershell' ? 'PowerShell' : 'Bash'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Server className="h-3 w-3" />
                      {script.targetOs === 'both' ? 'Windows/Linux' : script.targetOs}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Executions */}
        <div className="rounded-lg border bg-card">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <History className="h-4 w-4" />
              Recent Executions
            </h3>
            <Link href="/lift-cleanse/history">
              <Button variant="ghost" size="sm">
                View All
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
          <div className="p-4 space-y-3">
            {executionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : executions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No executions yet
              </p>
            ) : (
              executions.map(execution => (
                <Link key={execution.id} href={`/lift-cleanse/history/${execution.id}`}>
                  <div className="p-3 rounded-lg border hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors cursor-pointer">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(execution.status)}
                          <h4 className="font-medium text-sm">{execution.scriptName}</h4>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {execution.totalTargets} VM{execution.totalTargets !== 1 ? 's' : ''} •{' '}
                          {execution.successCount} succeeded, {execution.failedCount} failed
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {execution.createdAt
                          ? new Date(execution.createdAt).toLocaleString()
                          : 'Unknown'}
                      </span>
                    </div>
                    {execution.status === 'running' && (
                      <div className="mt-2">
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{
                              width: `${
                                ((execution.successCount + execution.failedCount) /
                                  execution.totalTargets) *
                                100
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Available VMs Preview */}
      <div className="rounded-lg border bg-card">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Server className="h-4 w-4" />
            Available VMs
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['lift-cleanse-vms'] })}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
        <div className="p-4">
          {vmsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : vms.length === 0 ? (
            <div className="text-center py-8">
              <Server className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No VMs found. Make sure Azure is configured in Settings.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {vms.slice(0, 6).map(vm => (
                <div
                  key={vm.id}
                  className="p-3 rounded-lg border hover:border-emerald-300 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full',
                        vm.powerState === 'VM running' ? 'bg-green-500' : 'bg-gray-400'
                      )}
                    />
                    <h4 className="font-medium text-sm truncate">{vm.name}</h4>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                    <p>{vm.osType} • {vm.vmSize}</p>
                    <p className="truncate">{vm.resourceGroup}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {vms.length > 6 && (
            <p className="text-center text-sm text-muted-foreground mt-3">
              And {vms.length - 6} more VMs...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

