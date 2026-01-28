'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Database,
  Plus,
  MoreHorizontal,
  Clock,
  CheckCircle2,
  PlayCircle,
  RefreshCw,
  Cloud,
  HardDrive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { groupsApi, settingsApi, type AzureMigrateGroup } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import type { AssessmentGroup } from '@drmigrate/shared-types';

const statusConfig = {
  created: { label: 'Created', icon: Clock, color: 'text-muted-foreground' },
  assessing: { label: 'Assessing', icon: PlayCircle, color: 'text-yellow-600' },
  assessed: { label: 'Assessed', icon: CheckCircle2, color: 'text-green-600' },
  replicating: { label: 'Replicating', icon: RefreshCw, color: 'text-blue-600' },
};

function GroupCard({ group }: { group: AssessmentGroup }) {
  const status = statusConfig[group.status];
  const StatusIcon = status.icon;

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <HardDrive className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">{group.name}</h3>
            <p className="text-sm text-muted-foreground">
              {group.machineCount} machines
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
            Local
          </span>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {group.description && (
        <p className="mt-3 text-sm text-muted-foreground line-clamp-2">
          {group.description}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <StatusIcon className={cn('h-4 w-4', status.color)} />
          <span className={status.color}>{status.label}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Updated {formatDate(group.updatedAt)}
        </p>
      </div>

      <div className="mt-4 flex gap-2">
        <Link href={`/groups/${group.id}`} className="flex-1">
          <Button variant="outline" size="sm" className="w-full">
            View Details
          </Button>
        </Link>
        {group.status === 'created' && (
          <Link href={`/assessments/new?groupId=${group.id}`}>
            <Button size="sm">Run Assessment</Button>
          </Link>
        )}
        {group.status === 'assessed' && (
          <Link href={`/replication/new?groupId=${group.id}`}>
            <Button size="sm">Enable Replication</Button>
          </Link>
        )}
      </div>
    </div>
  );
}

function AzureGroupCard({ group }: { group: AzureMigrateGroup }) {
  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm hover:shadow-md transition-shadow border-blue-200">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-100 p-2">
            <Cloud className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold">{group.name}</h3>
            <p className="text-sm text-muted-foreground">
              {group.machineCount} machines
            </p>
          </div>
        </div>
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
          Azure
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {group.areAssessmentsRunning ? (
            <>
              <PlayCircle className="h-4 w-4 text-yellow-600" />
              <span className="text-yellow-600">Running</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-green-600">Ready</span>
            </>
          )}
        </div>
        {group.updatedAt && (
          <p className="text-xs text-muted-foreground">
            Updated {formatDate(group.updatedAt)}
          </p>
        )}
      </div>

      <div className="mt-4">
        <a 
          href={`https://portal.azure.com/#blade/Microsoft_Azure_Migrate/AssessmentGroupBlade/groupId/${encodeURIComponent(group.id)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full"
        >
          <Button variant="outline" size="sm" className="w-full">
            <Cloud className="h-4 w-4 mr-2" />
            View in Azure Portal
          </Button>
        </a>
      </div>
    </div>
  );
}

export default function GroupsPage() {
  const { data: localData, isLoading: localLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
  });

  const { data: azureData, isLoading: azureLoading } = useQuery({
    queryKey: ['azure-groups'],
    queryFn: () => settingsApi.getAzureGroups(),
  });

  const localGroups = localData?.data || [];
  const azureGroups = azureData?.data || [];
  const isLoading = localLoading || azureLoading;
  const hasAnyGroups = localGroups.length > 0 || azureGroups.length > 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Assessment Groups</h1>
          <p className="text-muted-foreground mt-1">
            Organize machines into groups for migration assessment
          </p>
        </div>
        <Link href="/groups/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Group
          </Button>
        </Link>
      </div>

      {/* Groups Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border bg-card p-6 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-muted h-10 w-10" />
                <div className="space-y-2">
                  <div className="h-4 w-32 bg-muted rounded" />
                  <div className="h-3 w-24 bg-muted rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : !hasAnyGroups ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <Database className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="font-semibold mb-2">No assessment groups yet</h3>
          <p className="text-muted-foreground mb-4">
            Create your first group to start assessing machines for migration
          </p>
          <Link href="/groups/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Group
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Azure Migrate Groups */}
          {azureGroups.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Cloud className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold">Azure Migrate Groups</h2>
                <span className="text-sm text-muted-foreground">
                  ({azureGroups.length} groups)
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {azureGroups.map((group: AzureMigrateGroup) => (
                  <AzureGroupCard key={group.id} group={group} />
                ))}
              </div>
            </div>
          )}

          {/* Local Groups */}
          {localGroups.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <HardDrive className="h-5 w-5 text-green-600" />
                <h2 className="text-lg font-semibold">Local Groups</h2>
                <span className="text-sm text-muted-foreground">
                  ({localGroups.length} groups)
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {localGroups.map((group: AssessmentGroup) => (
                  <GroupCard key={group.id} group={group} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

