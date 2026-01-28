'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Database, Search, Check } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { groupsApi, machinesApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Machine } from '@drmigrate/shared-types';

export default function CreateGroupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedMachines, setSelectedMachines] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: machinesData, isLoading: loadingMachines } = useQuery({
    queryKey: ['machines', searchQuery],
    queryFn: () => machinesApi.list({ search: searchQuery || undefined }),
  });

  const machines = machinesData?.data || [];

  const createGroup = useMutation({
    mutationFn: () =>
      groupsApi.create({
        name,
        description: description || undefined,
        machineIds: selectedMachines,
      }),
    onSuccess: () => {
      router.push('/groups');
    },
  });

  const toggleMachine = (id: string) => {
    setSelectedMachines((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedMachines.length === machines.length) {
      setSelectedMachines([]);
    } else {
      setSelectedMachines(machines.map((m: Machine) => m.id));
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/groups">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create Assessment Group</h1>
          <p className="text-muted-foreground mt-1">
            Select machines to group together for migration assessment
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-6">
        {/* Group Details */}
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-lg bg-primary/10 p-2">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <h2 className="font-semibold">Group Details</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Group Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., SAP Application Servers"
                className="w-full rounded-lg border bg-background py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description for this group..."
                rows={3}
                className="w-full rounded-lg border bg-background py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Machine Selection */}
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Select Machines</h2>
            <span className="text-sm text-muted-foreground">
              {selectedMachines.length} selected
            </span>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search machines..."
              className="w-full rounded-lg border bg-background py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Machine List */}
          <div className="border rounded-lg overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 border-b">
              <input
                type="checkbox"
                checked={machines.length > 0 && selectedMachines.length === machines.length}
                onChange={toggleAll}
                className="rounded"
              />
              <span className="text-sm font-medium">Select All</span>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {loadingMachines ? (
                <div className="p-8 text-center text-muted-foreground">
                  Loading machines...
                </div>
              ) : machines.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No machines found
                </div>
              ) : (
                machines.map((machine: Machine) => (
                  <div
                    key={machine.id}
                    onClick={() => toggleMachine(machine.id)}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 border-b last:border-b-0 cursor-pointer transition-colors',
                      selectedMachines.includes(machine.id)
                        ? 'bg-primary/5'
                        : 'hover:bg-muted/50'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded border',
                        selectedMachines.includes(machine.id)
                          ? 'bg-primary border-primary'
                          : 'border-input'
                      )}
                    >
                      {selectedMachines.includes(machine.id) && (
                        <Check className="h-3 w-3 text-primary-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{machine.displayName}</p>
                      <p className="text-sm text-muted-foreground">
                        {machine.ipAddresses.join(', ')} • {machine.operatingSystem}
                      </p>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {machine.cpuCores} vCPU / {(machine.memoryMB || 0) / 1024} GB
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-4">
          <Link href="/groups">
            <Button variant="outline">Cancel</Button>
          </Link>
          <Button
            onClick={() => createGroup.mutate()}
            disabled={!name || selectedMachines.length === 0 || createGroup.isPending}
          >
            {createGroup.isPending ? 'Creating...' : 'Create Group'}
          </Button>
        </div>
      </div>
    </div>
  );
}

