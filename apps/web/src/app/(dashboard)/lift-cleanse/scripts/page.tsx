'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { liftCleanseApi, type LiftCleanseScript } from '@/lib/api';
import {
  FileCode,
  Search,
  PlusCircle,
  Filter,
  Terminal,
  Server,
  Loader2,
  MoreVertical,
  Play,
  Copy,
  Trash2,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Edit,
  ChevronLeft,
  Clock,
  Tag,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function ScriptsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [osFilter, setOsFilter] = useState<string>('');
  const [showBuiltIn, setShowBuiltIn] = useState<boolean | undefined>(undefined);

  // Fetch scripts
  const { data: scriptsData, isLoading } = useQuery({
    queryKey: ['lift-cleanse-scripts', search, categoryFilter, typeFilter, osFilter, showBuiltIn],
    queryFn: () =>
      liftCleanseApi.listScripts({
        search: search || undefined,
        category: categoryFilter || undefined,
        scriptType: typeFilter || undefined,
        targetOs: osFilter || undefined,
        isBuiltIn: showBuiltIn,
      }),
  });

  const scripts = scriptsData?.data || [];

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => liftCleanseApi.deleteScript(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lift-cleanse-scripts'] });
    },
  });

  // Duplicate mutation
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => liftCleanseApi.duplicateScript(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lift-cleanse-scripts'] });
    },
  });

  // Share mutation
  const shareMutation = useMutation({
    mutationFn: ({ id, isShared }: { id: string; isShared: boolean }) =>
      liftCleanseApi.shareScript(id, isShared),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lift-cleanse-scripts'] });
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

  const categories = ['cleanup', 'install', 'configure', 'diagnostic', 'custom'];
  const scriptTypes = ['powershell', 'bash'];
  const targetOsOptions = ['windows', 'linux'];

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
              <FileCode className="h-6 w-6 text-emerald-600" />
              Script Library
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Browse and manage your scripts
            </p>
          </div>
        </div>
        <Link href="/lift-cleanse/scripts/new">
          <Button className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700">
            <PlusCircle className="h-4 w-4 mr-2" />
            New Script
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search scripts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </option>
          ))}
        </select>

        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Types</option>
          {scriptTypes.map(type => (
            <option key={type} value={type}>
              {type === 'powershell' ? 'PowerShell' : 'Bash'}
            </option>
          ))}
        </select>

        <select
          value={osFilter}
          onChange={e => setOsFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All OS</option>
          {targetOsOptions.map(os => (
            <option key={os} value={os}>
              {os.charAt(0).toUpperCase() + os.slice(1)}
            </option>
          ))}
        </select>

        <select
          value={showBuiltIn === undefined ? '' : showBuiltIn ? 'true' : 'false'}
          onChange={e =>
            setShowBuiltIn(e.target.value === '' ? undefined : e.target.value === 'true')
          }
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Sources</option>
          <option value="true">Built-in</option>
          <option value="false">Custom</option>
        </select>
      </div>

      {/* Script List */}
      <div className="grid gap-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : scripts.length === 0 ? (
          <div className="text-center py-12 rounded-lg border bg-card">
            <FileCode className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold text-lg">No scripts found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {search || categoryFilter || typeFilter || osFilter
                ? 'Try adjusting your filters'
                : 'Create your first script to get started'}
            </p>
            {!search && !categoryFilter && !typeFilter && !osFilter && (
              <Link href="/lift-cleanse/scripts/new">
                <Button className="mt-4">
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Create Script
                </Button>
              </Link>
            )}
          </div>
        ) : (
          scripts.map(script => (
            <div
              key={script.id}
              className="p-4 rounded-lg border bg-card hover:border-emerald-300 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{script.name}</h3>
                    {script.isBuiltIn && (
                      <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                        Built-in
                      </span>
                    )}
                    {script.isShared && !script.isBuiltIn && (
                      <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">
                        Shared
                      </span>
                    )}
                    <span
                      className={cn(
                        'text-xs px-2 py-0.5 rounded border',
                        getCategoryColor(script.category)
                      )}
                    >
                      {script.category}
                    </span>
                    {getRiskIcon(script.riskLevel)}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {script.description || 'No description'}
                  </p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Terminal className="h-3 w-3" />
                      {script.scriptType === 'powershell' ? 'PowerShell' : 'Bash'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Server className="h-3 w-3" />
                      {script.targetOs === 'both' ? 'Windows/Linux' : script.targetOs}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {script.timeout}s timeout
                    </span>
                    {script.tags.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        {script.tags.slice(0, 3).join(', ')}
                        {script.tags.length > 3 && ` +${script.tags.length - 3}`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/lift-cleanse/execute?script=${script.id}`}>
                    <Button size="sm" variant="outline">
                      <Play className="h-4 w-4 mr-1" />
                      Execute
                    </Button>
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <Link href={`/lift-cleanse/scripts/${script.id}`}>
                        <DropdownMenuItem>
                          <Edit className="h-4 w-4 mr-2" />
                          {script.isBuiltIn ? 'View' : 'Edit'}
                        </DropdownMenuItem>
                      </Link>
                      <DropdownMenuItem
                        onClick={() => duplicateMutation.mutate(script.id)}
                        disabled={duplicateMutation.isPending}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                      {!script.isBuiltIn && (
                        <>
                          <DropdownMenuItem
                            onClick={() =>
                              shareMutation.mutate({ id: script.id, isShared: !script.isShared })
                            }
                            disabled={shareMutation.isPending}
                          >
                            <Share2 className="h-4 w-4 mr-2" />
                            {script.isShared ? 'Make Private' : 'Share'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this script?')) {
                                deleteMutation.mutate(script.id);
                              }
                            }}
                            disabled={deleteMutation.isPending}
                            className="text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

