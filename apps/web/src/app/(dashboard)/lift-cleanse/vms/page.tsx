'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { liftCleanseApi, AzureVM } from '@/lib/api';
import {
  Server,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  ChevronRight,
  Search,
  RefreshCw,
  Play,
  ListChecks,
} from 'lucide-react';

interface VMWithTestStatus extends AzureVM {
  testStats?: {
    total: number;
    passed: number;
    failed: number;
    pending: number;
  };
}

const statusConfig = {
  all_passed: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
  has_failures: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
  no_tests: { icon: Clock, color: 'text-gray-400', bg: 'bg-gray-50 border-gray-200' },
  pending: { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' },
};

export default function VMsPage() {
  const [search, setSearch] = useState('');

  // Fetch VMs
  const { data: vmsData, isLoading, refetch } = useQuery({
    queryKey: ['lift-cleanse-vms-with-tests'],
    queryFn: async () => {
      const vms = await liftCleanseApi.listVMs();
      
      // For each VM, get its test assignments to show status
      const vmsWithStatus = await Promise.all(
        (vms.data || []).map(async (vm) => {
          try {
            const testsResult = await liftCleanseApi.getVmTests(vm.id);
            const tests = testsResult.data || [];
            
            return {
              ...vm,
              testStats: {
                total: tests.length,
                passed: tests.filter(t => t.lastStatus === 'passed').length,
                failed: tests.filter(t => t.lastStatus === 'failed' || t.lastStatus === 'error').length,
                pending: tests.filter(t => !t.lastStatus || t.lastStatus === 'pending').length,
              },
            };
          } catch {
            return { ...vm, testStats: { total: 0, passed: 0, failed: 0, pending: 0 } };
          }
        })
      );
      
      return vmsWithStatus;
    },
  });

  const vms: VMWithTestStatus[] = vmsData || [];

  // Filter VMs by search
  const filteredVMs = vms.filter(vm =>
    vm.name.toLowerCase().includes(search.toLowerCase()) ||
    vm.resourceGroup.toLowerCase().includes(search.toLowerCase())
  );

  const getVMStatus = (vm: VMWithTestStatus) => {
    if (!vm.testStats || vm.testStats.total === 0) return 'no_tests';
    if (vm.testStats.failed > 0) return 'has_failures';
    if (vm.testStats.pending > 0) return 'pending';
    return 'all_passed';
  };

  // Summary stats
  const totalVMs = vms.length;
  const vmsWithTests = vms.filter(vm => (vm.testStats?.total || 0) > 0).length;
  const vmsWithFailures = vms.filter(vm => (vm.testStats?.failed || 0) > 0).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ListChecks className="h-6 w-6" />
            VM Validation Status
          </h1>
          <p className="text-muted-foreground mt-1">
            View and run validation tests on your VMs
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Link href="/lift-cleanse/tests">
            <Button>
              <Play className="h-4 w-4 mr-2" />
              Test Library
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border bg-card">
          <p className="text-sm text-muted-foreground">Total VMs</p>
          <p className="text-2xl font-bold">{totalVMs}</p>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <p className="text-sm text-muted-foreground">VMs with Tests</p>
          <p className="text-2xl font-bold text-blue-600">{vmsWithTests}</p>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <p className="text-sm text-muted-foreground">VMs with Failures</p>
          <p className="text-2xl font-bold text-red-600">{vmsWithFailures}</p>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <p className="text-sm text-muted-foreground">VMs Passing All</p>
          <p className="text-2xl font-bold text-green-600">
            {vms.filter(vm => vm.testStats && vm.testStats.total > 0 && vm.testStats.failed === 0 && vm.testStats.pending === 0).length}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search VMs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border rounded-lg bg-background"
        />
      </div>

      {/* VM List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredVMs.length === 0 ? (
        <div className="text-center py-16 rounded-lg border bg-card">
          <Server className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
          <h3 className="font-semibold text-lg">No VMs found</h3>
          <p className="text-muted-foreground mt-1">
            {search ? 'Try a different search term' : 'Make sure Azure is configured correctly'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredVMs.map(vm => {
            const status = getVMStatus(vm);
            const StatusIcon = statusConfig[status].icon;
            
            return (
              <Link
                key={vm.id}
                href={`/lift-cleanse/vms/${encodeURIComponent(vm.id)}`}
              >
                <div
                  className={cn(
                    'p-4 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer',
                    status === 'has_failures' && 'border-l-4 border-l-red-500',
                    status === 'all_passed' && 'border-l-4 border-l-green-500'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={cn('p-2 rounded-lg border', statusConfig[status].bg)}>
                        <StatusIcon className={cn('h-5 w-5', statusConfig[status].color)} />
                      </div>
                      <div>
                        <h3 className="font-medium text-lg">{vm.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {vm.resourceGroup} • {vm.osType} • {vm.powerState}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      {vm.testStats && vm.testStats.total > 0 ? (
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            <span className="font-medium">{vm.testStats.passed}</span>
                            <span className="text-muted-foreground">passed</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <XCircle className="h-4 w-4 text-red-600" />
                            <span className="font-medium">{vm.testStats.failed}</span>
                            <span className="text-muted-foreground">failed</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4 text-gray-400" />
                            <span className="font-medium">{vm.testStats.pending}</span>
                            <span className="text-muted-foreground">pending</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">No tests assigned</span>
                      )}
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
