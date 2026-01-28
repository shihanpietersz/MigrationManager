'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Server,
  Search,
  Filter,
  RefreshCw,
  Download,
  Upload,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { machinesApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Machine, MachineSource } from '@drmigrate/shared-types';

const sourceFilters: { label: string; value: MachineSource | 'all' }[] = [
  { label: 'All Sources', value: 'all' },
  { label: 'Azure Discovered', value: 'azure' },
  { label: 'External Import', value: 'external' },
  { label: 'Both Sources', value: 'both' },
];

function SourceBadge({ source }: { source: MachineSource }) {
  const styles = {
    azure: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    external: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    both: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  };

  const labels = {
    azure: 'Azure',
    external: 'External',
    both: 'Both',
  };

  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', styles[source])}>
      {labels[source]}
    </span>
  );
}

function PowerStateBadge({ state }: { state: string | undefined }) {
  if (!state) return <HelpCircle className="h-4 w-4 text-muted-foreground" />;

  if (state === 'On') {
    return <CheckCircle2 className="h-4 w-4 text-success" />;
  }
  return <XCircle className="h-4 w-4 text-muted-foreground" />;
}

export default function MachinesPage() {
  const [sourceFilter, setSourceFilter] = useState<MachineSource | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['machines', sourceFilter, searchQuery],
    queryFn: () =>
      machinesApi.list({
        source: sourceFilter === 'all' ? undefined : sourceFilter,
        search: searchQuery || undefined,
      }),
  });

  const machines = data?.data || [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Machines</h1>
          <p className="text-muted-foreground mt-1">
            Unified inventory from Azure Migrate and external sources
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search by name or IP address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border bg-background py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Source Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {sourceFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setSourceFilter(filter.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                sourceFilter === filter.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Machine Table */}
      <div className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                  <input type="checkbox" className="rounded" />
                </th>
                <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                  Machine Name
                </th>
                <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                  IP Address
                </th>
                <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                  OS
                </th>
                <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                  CPU / Memory
                </th>
                <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                  Power
                </th>
                <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                  Source
                </th>
                <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    Loading machines...
                  </td>
                </tr>
              ) : machines.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    <Server className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p>No machines found</p>
                    <p className="text-sm mt-1">
                      Import machines or connect to Azure Migrate to get started
                    </p>
                  </td>
                </tr>
              ) : (
                machines.map((machine: Machine) => (
                  <tr key={machine.id} className="border-b hover:bg-muted/30">
                    <td className="py-3 px-4">
                      <input type="checkbox" className="rounded" />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{machine.displayName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">
                      {machine.ipAddresses.join(', ')}
                    </td>
                    <td className="py-3 px-4 text-sm">{machine.operatingSystem}</td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">
                      {machine.cpuCores} vCPU / {(machine.memoryMB || 0) / 1024} GB
                    </td>
                    <td className="py-3 px-4">
                      <PowerStateBadge state={machine.powerState} />
                    </td>
                    <td className="py-3 px-4">
                      <SourceBadge source={machine.source} />
                    </td>
                    <td className="py-3 px-4">
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Showing {machines.length} of {data?.meta?.totalCount || machines.length} machines
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled>
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

