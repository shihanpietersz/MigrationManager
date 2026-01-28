'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { liftCleanseApi, ValidationTest, VmTestAssignment } from '@/lib/api';
import {
  ChevronLeft,
  Server,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  Play,
  Plus,
  Trash2,
  RefreshCw,
  Settings,
  History,
  Network,
  HardDrive,
  Shield,
  Code,
  Zap,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';

const categoryIcons: Record<string, React.ReactNode> = {
  network: <Network className="h-4 w-4" />,
  service: <Settings className="h-4 w-4" />,
  storage: <HardDrive className="h-4 w-4" />,
  security: <Shield className="h-4 w-4" />,
  application: <Zap className="h-4 w-4" />,
  custom: <Code className="h-4 w-4" />,
};

const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  passed: { icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-green-600 bg-green-50 border-green-200', label: 'Passed' },
  failed: { icon: <XCircle className="h-4 w-4" />, color: 'text-red-600 bg-red-50 border-red-200', label: 'Failed' },
  warning: { icon: <AlertTriangle className="h-4 w-4" />, color: 'text-yellow-600 bg-yellow-50 border-yellow-200', label: 'Warning' },
  error: { icon: <XCircle className="h-4 w-4" />, color: 'text-red-600 bg-red-50 border-red-200', label: 'Error' },
  running: { icon: <Loader2 className="h-4 w-4 animate-spin" />, color: 'text-blue-600 bg-blue-50 border-blue-200', label: 'Running' },
  pending: { icon: <Clock className="h-4 w-4" />, color: 'text-gray-600 bg-gray-50 border-gray-200', label: 'Pending' },
};

export default function VmTestsPage({ params }: { params: { id: string } }) {
  const queryClient = useQueryClient();
  const vmId = decodeURIComponent(params.id);
  
  const [expandedTest, setExpandedTest] = useState<string | null>(null);
  const [showAddTestDialog, setShowAddTestDialog] = useState(false);
  const [selectedTestToAdd, setSelectedTestToAdd] = useState<ValidationTest | null>(null);
  const [testParams, setTestParams] = useState<Record<string, string>>({});

  // Fetch VM assignments
  const { data: assignmentsData, isLoading: assignmentsLoading, refetch } = useQuery({
    queryKey: ['vm-tests', vmId],
    queryFn: () => liftCleanseApi.getVmTests(vmId),
    refetchInterval: data => {
      // Refetch while any test is running
      const hasRunning = data?.data?.some(a => a.lastStatus === 'running');
      return hasRunning ? 3000 : false;
    },
  });

  // Fetch available tests for adding
  const { data: availableTestsData } = useQuery({
    queryKey: ['validation-tests'],
    queryFn: () => liftCleanseApi.listTests(),
    enabled: showAddTestDialog,
  });

  // Run test mutation
  const runTestMutation = useMutation({
    mutationFn: (assignmentId: string) => liftCleanseApi.runTest(assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm-tests', vmId] });
    },
  });

  // Run all tests mutation
  const runAllMutation = useMutation({
    mutationFn: () => liftCleanseApi.runAllVmTests(vmId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm-tests', vmId] });
    },
  });

  // Assign test mutation
  const assignTestMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTestToAdd) return;
      
      // Extract VM details from the vmId
      const rgMatch = vmId.match(/resourceGroups\/([^/]+)/i);
      const subMatch = vmId.match(/subscriptions\/([^/]+)/i);
      const nameMatch = vmId.match(/virtualMachines\/([^/]+)/i);
      
      return liftCleanseApi.assignTest({
        vmId,
        vmName: nameMatch?.[1] || 'unknown',
        resourceGroup: rgMatch?.[1] || 'unknown',
        subscriptionId: subMatch?.[1] || 'unknown',
        testId: selectedTestToAdd.id,
        parameters: testParams,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm-tests', vmId] });
      setShowAddTestDialog(false);
      setSelectedTestToAdd(null);
      setTestParams({});
    },
  });

  // Remove test mutation
  const removeTestMutation = useMutation({
    mutationFn: (assignmentId: string) => liftCleanseApi.removeAssignment(assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm-tests', vmId] });
    },
  });

  const assignments = assignmentsData?.data || [];
  const availableTests = availableTestsData?.data || [];
  const assignedTestIds = new Set(assignments.map(a => a.testId));
  const unassignedTests = availableTests.filter(t => !assignedTestIds.has(t.id));

  // Extract VM name from ID
  const vmNameMatch = vmId.match(/virtualMachines\/([^/]+)/i);
  const vmName = vmNameMatch?.[1] || 'VM';

  // Calculate summary stats
  const stats = {
    total: assignments.length,
    passed: assignments.filter(a => a.lastStatus === 'passed').length,
    failed: assignments.filter(a => a.lastStatus === 'failed' || a.lastStatus === 'error').length,
    pending: assignments.filter(a => !a.lastStatus || a.lastStatus === 'pending').length,
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
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-2xl font-bold">{vmName}</h1>
            </div>
            <p className="text-sm text-muted-foreground">Validation Tests</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => runAllMutation.mutate()}
            disabled={runAllMutation.isPending || assignments.length === 0}
          >
            {runAllMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-1" />
            )}
            Run All Tests
          </Button>
          <Button onClick={() => setShowAddTestDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Test
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border bg-card">
          <p className="text-sm text-muted-foreground">Total Tests</p>
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
          <p className="text-sm text-muted-foreground">Not Run</p>
          <p className="text-2xl font-bold text-gray-600">{stats.pending}</p>
        </div>
      </div>

      {/* Test List */}
      {assignmentsLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : assignments.length === 0 ? (
        <div className="text-center py-16 rounded-lg border bg-card">
          <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
          <h3 className="font-semibold text-lg">No tests assigned</h3>
          <p className="text-muted-foreground mt-1">Add tests to validate this VM's configuration</p>
          <Button className="mt-4" onClick={() => setShowAddTestDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add First Test
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.map(assignment => {
            const status = statusConfig[assignment.lastStatus || 'pending'];
            const isExpanded = expandedTest === assignment.id;
            
            return (
              <div
                key={assignment.id}
                className={cn(
                  'rounded-lg border bg-card transition-all',
                  isExpanded && 'shadow-sm'
                )}
              >
                {/* Main Row */}
                <div
                  className="p-4 flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedTest(isExpanded ? null : assignment.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn('p-2 rounded-lg border', status.color)}>
                      {status.icon}
                    </div>
                    <div>
                      <h3 className="font-medium flex items-center gap-2">
                        {assignment.test.name}
                        <span className={cn('text-xs px-2 py-0.5 rounded border', status.color)}>
                          {status.label}
                        </span>
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {assignment.test.description || 'No description'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {assignment.lastRunAt && (
                      <span className="text-xs text-muted-foreground">
                        Last run: {new Date(assignment.lastRunAt).toLocaleString()}
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={e => {
                        e.stopPropagation();
                        runTestMutation.mutate(assignment.id);
                      }}
                      disabled={runTestMutation.isPending || assignment.lastStatus === 'running'}
                    >
                      {assignment.lastStatus === 'running' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={e => {
                        e.stopPropagation();
                        removeTestMutation.mutate(assignment.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t">
                    <div className="pt-4 grid grid-cols-2 gap-6">
                      {/* Parameters */}
                      <div>
                        <h4 className="text-sm font-medium mb-2">Parameters</h4>
                        {Object.keys(assignment.parameters).length > 0 ? (
                          <div className="space-y-2">
                            {Object.entries(assignment.parameters).map(([key, value]) => (
                              <div key={key} className="flex justify-between text-sm">
                                <span className="text-muted-foreground">{key}:</span>
                                <span className="font-mono">{String(value)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No parameters</p>
                        )}
                      </div>

                      {/* Last Output */}
                      <div>
                        <h4 className="text-sm font-medium mb-2">Last Output</h4>
                        {assignment.lastOutput ? (
                          <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-32">
                            {assignment.lastOutput}
                          </pre>
                        ) : (
                          <p className="text-sm text-muted-foreground">No output recorded</p>
                        )}
                      </div>
                    </div>

                    {/* Schedule Info */}
                    <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm">
                      <div className="flex items-center gap-4">
                        <span className="text-muted-foreground">
                          Schedule: {assignment.scheduleType === 'manual' ? 'Manual' : 
                                    assignment.scheduleType === 'interval' ? `Every ${assignment.intervalMinutes} minutes` : 
                                    assignment.cronExpression}
                        </span>
                        {assignment.lastDuration && (
                          <span className="text-muted-foreground">
                            Duration: {(assignment.lastDuration / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                      <Link href={`/lift-cleanse/test-results/${assignment.id}`}>
                        <Button size="sm" variant="ghost">
                          <History className="h-4 w-4 mr-1" />
                          View History
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Test Dialog */}
      {showAddTestDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setShowAddTestDialog(false)}>
          <div
            className="bg-background rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add Test to {vmName}</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowAddTestDialog(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {selectedTestToAdd ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg border bg-muted/30">
                    <div className="flex items-center gap-3">
                      {categoryIcons[selectedTestToAdd.category]}
                      <div>
                        <h3 className="font-medium">{selectedTestToAdd.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {selectedTestToAdd.description}
                        </p>
                      </div>
                    </div>
                  </div>

                  {selectedTestToAdd.parameters.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-3">Parameters</h4>
                      <div className="space-y-3">
                        {selectedTestToAdd.parameters.map(param => (
                          <div key={param.key}>
                            <label className="block text-sm font-medium mb-1">
                              {param.label}
                              {param.required && <span className="text-red-500 ml-1">*</span>}
                            </label>
                            <input
                              type={param.type === 'number' ? 'number' : 'text'}
                              placeholder={param.placeholder || `Enter ${param.label.toLowerCase()}`}
                              value={testParams[param.key] || ''}
                              onChange={e => setTestParams({ ...testParams, [param.key]: e.target.value })}
                              className="w-full px-3 py-2 border rounded-lg bg-background"
                            />
                            {param.default !== undefined && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Default: {String(param.default)}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setSelectedTestToAdd(null);
                        setTestParams({});
                      }}
                    >
                      Back
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => assignTestMutation.mutate()}
                      disabled={assignTestMutation.isPending}
                    >
                      {assignTestMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4 mr-1" />
                      )}
                      Add Test
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {unassignedTests.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>All available tests are already assigned</p>
                    </div>
                  ) : (
                    unassignedTests.map(test => (
                      <div
                        key={test.id}
                        onClick={() => setSelectedTestToAdd(test)}
                        className="p-4 rounded-lg border cursor-pointer hover:border-emerald-500 hover:bg-emerald-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {categoryIcons[test.category]}
                          <div className="flex-1">
                            <h3 className="font-medium">{test.name}</h3>
                            <p className="text-sm text-muted-foreground line-clamp-1">
                              {test.description || 'No description'}
                            </p>
                          </div>
                          <span className="text-xs px-2 py-1 rounded bg-gray-100 capitalize">
                            {test.category}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

