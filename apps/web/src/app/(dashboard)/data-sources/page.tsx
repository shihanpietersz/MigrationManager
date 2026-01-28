'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  HardDrive,
  Plus,
  Database,
  Upload,
  Link2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { dataSourcesApi } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import type { DataSourceConfig, DataSourceType } from '@drmigrate/shared-types';

const sourceTypeConfig: Record<
  DataSourceType,
  { label: string; icon: React.ElementType; color: string }
> = {
  'azure-migrate': { label: 'Azure Migrate', icon: Database, color: 'text-blue-600' },
  database: { label: 'Database', icon: Database, color: 'text-purple-600' },
  csv: { label: 'CSV Import', icon: Upload, color: 'text-green-600' },
  api: { label: 'API', icon: Link2, color: 'text-orange-600' },
};

function DataSourceCard({ source }: { source: DataSourceConfig }) {
  const queryClient = useQueryClient();
  const typeConfig = sourceTypeConfig[source.type];
  const TypeIcon = typeConfig.icon;

  const syncMutation = useMutation({
    mutationFn: () => dataSourcesApi.sync(source.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-sources'] });
    },
  });

  const testMutation = useMutation({
    mutationFn: () => dataSourcesApi.test(source.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-sources'] });
    },
  });

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn('rounded-lg p-2', 'bg-muted')}>
            <TypeIcon className={cn('h-5 w-5', typeConfig.color)} />
          </div>
          <div>
            <h3 className="font-semibold">{source.name}</h3>
            <p className="text-sm text-muted-foreground">{typeConfig.label}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {source.status === 'connected' ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-green-600">Connected</span>
            </>
          ) : source.status === 'error' ? (
            <>
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-red-600">Error</span>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 text-gray-400" />
              <span className="text-muted-foreground">Disconnected</span>
            </>
          )}
        </div>
        {source.lastSyncAt && (
          <p className="text-xs text-muted-foreground">
            Last sync: {formatDate(source.lastSyncAt)}
          </p>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending}
        >
          Test Connection
        </Button>
        <Button
          size="sm"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', syncMutation.isPending && 'animate-spin')} />
          Sync Now
        </Button>
      </div>
    </div>
  );
}

export default function DataSourcesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['data-sources'],
    queryFn: () => dataSourcesApi.list(),
  });

  const sources = data?.data || [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Data Sources</h1>
          <p className="text-muted-foreground mt-1">
            Connect external databases or import machine data
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/data-sources/import">
            <Button variant="outline">
              <Upload className="h-4 w-4 mr-2" />
              Import CSV
            </Button>
          </Link>
          <Link href="/data-sources/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Source
            </Button>
          </Link>
        </div>
      </div>

      {/* Data Sources Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2].map((i) => (
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
      ) : sources.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <HardDrive className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="font-semibold mb-2">No data sources configured</h3>
          <p className="text-muted-foreground mb-4">
            Connect a database, import a CSV file, or use Azure Migrate discovery
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/data-sources/import">
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Import CSV
              </Button>
            </Link>
            <Link href="/data-sources/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Database
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sources.map((source: DataSourceConfig) => (
            <DataSourceCard key={source.id} source={source} />
          ))}
        </div>
      )}
    </div>
  );
}

