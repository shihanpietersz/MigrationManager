'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Database,
  Server,
  Clock,
  CheckCircle2,
  PlayCircle,
  RefreshCw,
  Trash2,
  Edit,
  Play,
  Cloud,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { groupsApi, machinesApi } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import type { Machine } from '@drmigrate/shared-types';

const statusConfig = {
  created: { label: 'Created', icon: Clock, color: 'text-muted-foreground', bgColor: 'bg-gray-100' },
  assessing: { label: 'Assessing', icon: PlayCircle, color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
  assessed: { label: 'Assessed', icon: CheckCircle2, color: 'text-green-600', bgColor: 'bg-green-100' },
  replicating: { label: 'Replicating', icon: RefreshCw, color: 'text-blue-600', bgColor: 'bg-blue-100' },
};

export default function GroupDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { data: groupData, isLoading: groupLoading } = useQuery({
    queryKey: ['group', id],
    queryFn: () => groupsApi.get(id),
  });

  const { data: machinesData } = useQuery({
    queryKey: ['group-machines', id],
    queryFn: async () => {
      // Get all machines and filter by IDs in the group
      const result = await machinesApi.list();
      return result;
    },
    enabled: !!groupData?.data?.machineIds?.length,
  });

  const group = groupData?.data;
  const allMachines = machinesData?.data || [];
  
  // Filter machines that are in this group
  const groupMachines = group?.machineIds 
    ? allMachines.filter((m: Machine) => group.machineIds?.includes(m.id))
    : [];

  if (groupLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 bg-muted rounded animate-pulse" />
          <div className="space-y-2">
            <div className="h-6 w-48 bg-muted rounded animate-pulse" />
            <div className="h-4 w-32 bg-muted rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/groups">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Group Not Found</h1>
            <p className="text-muted-foreground mt-1">
              The requested group does not exist
            </p>
          </div>
        </div>
        <Link href="/groups">
          <Button>Back to Groups</Button>
        </Link>
      </div>
    );
  }

  const status = statusConfig[group.status] || statusConfig.created;
  const StatusIcon = status.icon;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/groups">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-3">
              <Database className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{group.name}</h1>
              <p className="text-muted-foreground mt-1">
                {group.description || 'No description'}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Group Info Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Server className="h-4 w-4" />
            <span className="text-sm">Machines</span>
          </div>
          <p className="text-2xl font-bold">{group.machineCount}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <StatusIcon className={cn('h-4 w-4', status.color)} />
            <span className="text-sm">Status</span>
          </div>
          <div className={cn('inline-flex items-center gap-2 px-2 py-1 rounded-full text-sm', status.bgColor, status.color)}>
            <StatusIcon className="h-3 w-3" />
            {status.label}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Clock className="h-4 w-4" />
            <span className="text-sm">Created</span>
          </div>
          <p className="text-sm font-medium">{formatDate(group.createdAt)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <RefreshCw className="h-4 w-4" />
            <span className="text-sm">Updated</span>
          </div>
          <p className="text-sm font-medium">{formatDate(group.updatedAt)}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Actions</h2>
        <div className="flex flex-wrap gap-3">
          {group.status === 'created' && (
            <Link href={`/assessments/new?groupId=${group.id}`}>
              <Button>
                <Play className="h-4 w-4 mr-2" />
                Run Assessment
              </Button>
            </Link>
          )}
          {group.status === 'assessed' && (
            <Link href={`/replication/new?groupId=${group.id}`}>
              <Button>
                <Cloud className="h-4 w-4 mr-2" />
                Enable Replication
              </Button>
            </Link>
          )}
          <Button variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync to Azure Migrate
          </Button>
        </div>
      </div>

      {/* Machines Table */}
      <div className="rounded-lg border bg-card">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Machines in Group</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {groupMachines.length} machines assigned to this assessment group
          </p>
        </div>
        
        {groupMachines.length === 0 ? (
          <div className="p-12 text-center">
            <Server className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="font-semibold mb-2">No machines in this group</h3>
            <p className="text-muted-foreground mb-4">
              Add machines to start the assessment process
            </p>
            <Button variant="outline">Add Machines</Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-3 px-4 font-medium text-sm">Machine Name</th>
                  <th className="text-left py-3 px-4 font-medium text-sm">IP Address</th>
                  <th className="text-left py-3 px-4 font-medium text-sm">OS</th>
                  <th className="text-left py-3 px-4 font-medium text-sm">CPU / Memory</th>
                  <th className="text-left py-3 px-4 font-medium text-sm">Source</th>
                </tr>
              </thead>
              <tbody>
                {groupMachines.map((machine: Machine) => (
                  <tr key={machine.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{machine.displayName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">
                      {machine.ipAddresses?.join(', ') || '-'}
                    </td>
                    <td className="py-3 px-4 text-sm">{machine.operatingSystem}</td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">
                      {machine.cpuCores ? `${machine.cpuCores} vCPU` : '-'} / {machine.memoryMB ? `${Math.round(machine.memoryMB / 1024)} GB` : '-'}
                    </td>
                    <td className="py-3 px-4">
                      <span className={cn(
                        'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                        machine.source === 'azure' ? 'bg-blue-100 text-blue-700' :
                        machine.source === 'external' ? 'bg-green-100 text-green-700' :
                        'bg-purple-100 text-purple-700'
                      )}>
                        {machine.source === 'azure' ? 'Azure' : machine.source === 'external' ? 'External' : 'Both'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

