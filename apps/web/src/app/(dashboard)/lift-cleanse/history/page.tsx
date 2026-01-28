'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { liftCleanseApi, type ScriptExecution } from '@/lib/api';
import {
  History,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  ChevronRight,
  RefreshCw,
  Terminal,
} from 'lucide-react';

export default function ExecutionHistoryPage() {
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Fetch executions
  const { data: executionsData, isLoading, refetch } = useQuery({
    queryKey: ['lift-cleanse-executions', statusFilter],
    queryFn: () =>
      liftCleanseApi.listExecutions({
        status: statusFilter || undefined,
        limit: 50,
      }),
    refetchInterval: 5000,
  });

  const executions = executionsData?.data?.executions || [];

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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/lift-cleanse">
            <Button variant="ghost" size="sm">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <History className="h-6 w-6 text-emerald-600" />
              Execution History
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              View past script executions
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Execution List */}
      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : executions.length === 0 ? (
          <div className="text-center py-12">
            <History className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold text-lg">No executions found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Execute a script to see it here
            </p>
            <Link href="/lift-cleanse/execute">
              <Button className="mt-4">
                <Terminal className="h-4 w-4 mr-2" />
                Execute Script
              </Button>
            </Link>
          </div>
        ) : (
          <div className="divide-y">
            {executions.map(execution => (
              <Link key={execution.id} href={`/lift-cleanse/history/${execution.id}`}>
                <div className="p-4 hover:bg-muted/50 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(execution.status)}
                      <div>
                        <h3 className="font-medium">{execution.scriptName}</h3>
                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                          <span>
                            {execution.totalTargets} VM
                            {execution.totalTargets !== 1 ? 's' : ''}
                          </span>
                          <span>•</span>
                          <span className="text-green-600">
                            {execution.successCount} succeeded
                          </span>
                          {execution.failedCount > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-red-600">
                                {execution.failedCount} failed
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span
                          className={cn(
                            'text-xs px-2 py-0.5 rounded border',
                            getStatusBadge(execution.status)
                          )}
                        >
                          {execution.status}
                        </span>
                        <p className="text-xs text-muted-foreground mt-1">
                          {execution.createdAt
                            ? new Date(execution.createdAt).toLocaleString()
                            : 'Unknown'}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  {execution.status === 'running' && (
                    <div className="mt-3">
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
                      <p className="text-xs text-muted-foreground mt-1">
                        {execution.successCount + execution.failedCount} of{' '}
                        {execution.totalTargets} completed
                      </p>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

