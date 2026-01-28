'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { liftCleanseApi, VmTestResult } from '@/lib/api';
import {
  ChevronLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  History,
  Calendar,
  Timer,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Play,
} from 'lucide-react';

const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string; bg: string }> = {
  passed: { 
    icon: <CheckCircle2 className="h-4 w-4" />, 
    color: 'text-green-600', 
    bg: 'bg-green-50 border-green-200',
    label: 'Passed' 
  },
  failed: { 
    icon: <XCircle className="h-4 w-4" />, 
    color: 'text-red-600', 
    bg: 'bg-red-50 border-red-200',
    label: 'Failed' 
  },
  warning: { 
    icon: <AlertTriangle className="h-4 w-4" />, 
    color: 'text-yellow-600', 
    bg: 'bg-yellow-50 border-yellow-200',
    label: 'Warning' 
  },
  error: { 
    icon: <XCircle className="h-4 w-4" />, 
    color: 'text-red-600', 
    bg: 'bg-red-50 border-red-200',
    label: 'Error' 
  },
  running: { 
    icon: <Loader2 className="h-4 w-4 animate-spin" />, 
    color: 'text-blue-600', 
    bg: 'bg-blue-50 border-blue-200',
    label: 'Running' 
  },
  pending: { 
    icon: <Clock className="h-4 w-4" />, 
    color: 'text-gray-600', 
    bg: 'bg-gray-50 border-gray-200',
    label: 'Pending' 
  },
};

export default function TestResultsHistoryPage({ params }: { params: { id: string } }) {
  const assignmentId = params.id;
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [limit, setLimit] = useState(20);

  // Fetch assignment details
  const { data: assignmentData, isLoading: assignmentLoading } = useQuery({
    queryKey: ['test-assignment', assignmentId],
    queryFn: () => liftCleanseApi.getAssignment(assignmentId),
  });

  // Fetch test results history
  const { data: resultsData, isLoading: resultsLoading, refetch } = useQuery({
    queryKey: ['test-results', assignmentId, limit],
    queryFn: () => liftCleanseApi.getTestResults(assignmentId, limit),
  });

  const assignment = assignmentData?.data;
  const results = resultsData?.data || [];

  const isLoading = assignmentLoading || resultsLoading;

  // Calculate stats
  const stats = {
    total: results.length,
    passed: results.filter(r => r.status === 'passed').length,
    failed: results.filter(r => r.status === 'failed' || r.status === 'error').length,
    avgDuration: results.length > 0 
      ? Math.round(results.reduce((acc, r) => acc + (r.duration || 0), 0) / results.length / 1000) 
      : 0,
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/lift-cleanse/vms">
            <Button variant="ghost" size="sm">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-2xl font-bold">
                {assignment?.test?.name || 'Test'} History
              </h1>
            </div>
            <p className="text-sm text-muted-foreground">
              {assignment?.vmName || 'VM'} • Execution history
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Button 
            onClick={() => {
              liftCleanseApi.runTest(assignmentId).then(() => refetch());
            }}
          >
            <Play className="h-4 w-4 mr-1" />
            Run Now
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border bg-card">
          <p className="text-sm text-muted-foreground">Total Runs</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <p className="text-sm text-muted-foreground">Passed</p>
          <p className="text-2xl font-bold text-green-600">{stats.passed}</p>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <p className="text-sm text-muted-foreground">Failed</p>
          <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <p className="text-sm text-muted-foreground">Avg Duration</p>
          <p className="text-2xl font-bold">{stats.avgDuration}s</p>
        </div>
      </div>

      {/* Test Info */}
      {assignment && (
        <div className="p-4 rounded-lg border bg-card">
          <h3 className="font-medium mb-3">Test Configuration</h3>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Test Name</p>
              <p className="font-medium">{assignment.test?.name}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Category</p>
              <p className="font-medium capitalize">{assignment.test?.category}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Schedule</p>
              <p className="font-medium">
                {assignment.scheduleType === 'manual' ? 'Manual' : 
                 assignment.scheduleType === 'interval' ? `Every ${assignment.intervalMinutes} min` : 
                 assignment.cronExpression || 'Manual'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">VM</p>
              <p className="font-medium">{assignment.vmName}</p>
            </div>
          </div>
          {Object.keys(assignment.parameters || {}).length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-muted-foreground text-sm mb-2">Parameters</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(assignment.parameters || {}).map(([key, value]) => (
                  <span key={key} className="px-2 py-1 rounded bg-muted text-sm">
                    {key}: <span className="font-mono">{String(value)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-16 rounded-lg border bg-card">
          <History className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
          <h3 className="font-semibold text-lg">No test runs yet</h3>
          <p className="text-muted-foreground mt-1">
            Run the test to see results here
          </p>
          <Button 
            className="mt-4"
            onClick={() => {
              liftCleanseApi.runTest(assignmentId).then(() => refetch());
            }}
          >
            <Play className="h-4 w-4 mr-2" />
            Run Test Now
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Execution History</h3>
            <select
              value={limit}
              onChange={e => setLimit(Number(e.target.value))}
              className="px-3 py-1.5 border rounded-lg bg-background text-sm"
            >
              <option value={10}>Last 10 runs</option>
              <option value={20}>Last 20 runs</option>
              <option value={50}>Last 50 runs</option>
              <option value={100}>Last 100 runs</option>
            </select>
          </div>

          {results.map(result => {
            const status = statusConfig[result.status] || statusConfig.pending;
            const isExpanded = expandedResult === result.id;

            return (
              <div
                key={result.id}
                className={cn(
                  'rounded-lg border bg-card transition-all',
                  isExpanded && 'shadow-sm'
                )}
              >
                {/* Main Row */}
                <div
                  className="p-4 flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedResult(isExpanded ? null : result.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn('p-2 rounded-lg border', status.bg)}>
                      <span className={status.color}>{status.icon}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={cn('font-medium', status.color)}>
                          {status.label}
                        </span>
                        {result.exitCode !== undefined && (
                          <span className="text-xs text-muted-foreground">
                            Exit code: {result.exitCode}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(result.executedAt).toLocaleString()}
                        </span>
                        {result.duration && (
                          <span className="flex items-center gap-1">
                            <Timer className="h-3 w-3" />
                            {formatDuration(result.duration)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t">
                    <div className="pt-4 grid grid-cols-2 gap-6">
                      {/* Output */}
                      <div>
                        <h4 className="text-sm font-medium mb-2">Output (stdout)</h4>
                        {result.stdout ? (
                          <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-48">
                            {result.stdout}
                          </pre>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">No output</p>
                        )}
                      </div>

                      {/* Error */}
                      <div>
                        <h4 className="text-sm font-medium mb-2">Error (stderr)</h4>
                        {result.stderr ? (
                          <pre className="text-xs bg-red-950 text-red-200 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-48">
                            {result.stderr}
                          </pre>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">No errors</p>
                        )}
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="mt-4 pt-4 border-t flex items-center gap-6 text-xs text-muted-foreground">
                      <span>Result ID: {result.id}</span>
                      <span>Expected exit code: {assignment?.test?.expectedExitCode ?? 0}</span>
                      <span>Timeout: {assignment?.test?.timeout ?? 300}s</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
