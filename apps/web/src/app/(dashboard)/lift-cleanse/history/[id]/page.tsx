'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { liftCleanseApi } from '@/lib/api';
import {
  ChevronLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Terminal,
  RefreshCw,
  Play,
  Server,
  X,
  Copy,
  Check,
} from 'lucide-react';
// Toast notifications handled inline

export default function ExecutionDetailPage({ params }: { params: { id: string } }) {
  const queryClient = useQueryClient();
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [copiedOutput, setCopiedOutput] = useState(false);

  // Fetch execution details
  const { data: executionData, isLoading, refetch } = useQuery({
    queryKey: ['lift-cleanse-execution', params.id],
    queryFn: () => liftCleanseApi.getExecution(params.id),
    refetchInterval: data =>
      data?.data?.status === 'running' || data?.data?.status === 'pending' ? 3000 : false,
  });

  // Fetch target output when selected
  const { data: targetOutputData, isLoading: outputLoading } = useQuery({
    queryKey: ['lift-cleanse-target-output', params.id, selectedTarget],
    queryFn: () =>
      selectedTarget
        ? liftCleanseApi.getTargetOutput(params.id, selectedTarget)
        : Promise.resolve(null),
    enabled: !!selectedTarget,
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: () => liftCleanseApi.cancelExecution(params.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lift-cleanse-execution', params.id] });
    },
  });

  // Retry mutation
  const retryMutation = useMutation({
    mutationFn: () => liftCleanseApi.retryExecution(params.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lift-cleanse-execution', params.id] });
    },
  });

  const execution = executionData?.data;
  const targetOutput = targetOutputData?.data;

  // Auto-select the first target when execution loads
  useEffect(() => {
    if (execution?.targets?.length && !selectedTarget) {
      setSelectedTarget(execution.targets[0].id);
    }
  }, [execution?.targets, selectedTarget]);

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
      case 'skipped':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'running':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'failed':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'cancelled':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const copyOutput = () => {
    const output = targetOutput?.stdout || targetOutput?.stderr || '';
    navigator.clipboard.writeText(output);
    setCopiedOutput(true);
    setTimeout(() => setCopiedOutput(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!execution) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <XCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-lg">Execution not found</h3>
          <Link href="/lift-cleanse/history">
            <Button className="mt-4">
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back to History
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const progress =
    execution.totalTargets > 0
      ? ((execution.successCount + execution.failedCount) / execution.totalTargets) * 100
      : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/lift-cleanse/history">
            <Button variant="ghost" size="sm">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              {getStatusIcon(execution.status)}
              <h1 className="text-2xl font-bold">{execution.scriptName}</h1>
              <span
                className={cn(
                  'text-xs px-2 py-0.5 rounded border',
                  getStatusBadge(execution.status)
                )}
              >
                {execution.status}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Execution ID: {execution.id}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {execution.status === 'running' && (
            <Button
              variant="outline"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          )}
          {execution.status === 'completed' && execution.failedCount > 0 && (
            <Button
              variant="outline"
              onClick={() => retryMutation.mutate()}
              disabled={retryMutation.isPending}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Retry Failed
            </Button>
          )}
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Progress */}
      {(execution.status === 'running' || execution.status === 'pending') && (
        <div className="p-4 rounded-lg border bg-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Progress</span>
            <span className="text-sm text-muted-foreground">
              {execution.successCount + execution.failedCount} / {execution.totalTargets}
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border bg-card">
          <p className="text-sm text-muted-foreground">Total Targets</p>
          <p className="text-2xl font-bold">{execution.totalTargets}</p>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <p className="text-sm text-muted-foreground">Succeeded</p>
          <p className="text-2xl font-bold text-green-600">{execution.successCount}</p>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <p className="text-sm text-muted-foreground">Failed</p>
          <p className="text-2xl font-bold text-red-600">{execution.failedCount}</p>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <p className="text-sm text-muted-foreground">Pending</p>
          <p className="text-2xl font-bold text-gray-600">
            {execution.totalTargets - execution.successCount - execution.failedCount}
          </p>
        </div>
      </div>

      {/* Targets and Output */}
      <div className="grid grid-cols-2 gap-6">
        {/* Target List */}
        <div className="rounded-lg border bg-card">
          <div className="px-4 py-3 border-b">
            <h2 className="font-semibold flex items-center gap-2">
              <Server className="h-4 w-4" />
              Target VMs
            </h2>
          </div>
          <div className="divide-y max-h-[500px] overflow-y-auto">
            {execution.targets.map(target => (
              <div
                key={target.id}
                onClick={() => setSelectedTarget(target.id)}
                className={cn(
                  'p-4 cursor-pointer transition-colors',
                  selectedTarget === target.id
                    ? 'bg-emerald-50 border-l-2 border-l-emerald-500'
                    : 'hover:bg-muted/50'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(target.status)}
                    <span className="font-medium">{target.vmName}</span>
                  </div>
                  <span
                    className={cn(
                      'text-xs px-2 py-0.5 rounded border',
                      getStatusBadge(target.status)
                    )}
                  >
                    {target.status}
                  </span>
                </div>
                {target.exitCode !== undefined && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Exit code: {target.exitCode}
                  </p>
                )}
                {target.error && (
                  <p className="text-xs text-red-600 mt-1 line-clamp-1">{target.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Output Panel */}
        <div className="rounded-lg border bg-card">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              Output
            </h2>
            {selectedTarget && targetOutput && (
              <Button variant="ghost" size="sm" onClick={copyOutput}>
                {copiedOutput ? (
                  <Check className="h-4 w-4 mr-1 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4 mr-1" />
                )}
                {copiedOutput ? 'Copied' : 'Copy'}
              </Button>
            )}
          </div>
          <div className="p-4 min-h-[400px] max-h-[500px] overflow-auto">
            {!selectedTarget ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <p>Select a target VM to view output</p>
              </div>
            ) : outputLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                {targetOutput?.stdout && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground mb-2">
                      Standard Output
                    </h3>
                    <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap font-mono">
                      {targetOutput.stdout}
                    </pre>
                  </div>
                )}
                {targetOutput?.stderr && (
                  <div>
                    <h3 className="text-xs font-medium text-red-600 mb-2">Standard Error</h3>
                    <pre className="bg-red-900 text-red-100 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap font-mono">
                      {targetOutput.stderr}
                    </pre>
                  </div>
                )}
                {!targetOutput?.stdout && !targetOutput?.stderr && (
                  <div className="text-center text-muted-foreground py-8">
                    <Terminal className="h-8 w-8 mx-auto mb-2" />
                    <p>No output available yet</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

