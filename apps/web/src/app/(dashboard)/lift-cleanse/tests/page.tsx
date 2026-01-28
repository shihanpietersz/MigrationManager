'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { liftCleanseApi, ValidationTest, AzureVM } from '@/lib/api';
import {
  Search,
  Filter,
  Plus,
  Network,
  Settings,
  HardDrive,
  Shield,
  Code,
  Zap,
  ChevronRight,
  Loader2,
  CheckCircle2,
  Terminal,
  Play,
  X,
  Server,
  Check,
} from 'lucide-react';

const categoryIcons: Record<string, React.ReactNode> = {
  network: <Network className="h-4 w-4" />,
  service: <Settings className="h-4 w-4" />,
  storage: <HardDrive className="h-4 w-4" />,
  security: <Shield className="h-4 w-4" />,
  application: <Zap className="h-4 w-4" />,
  custom: <Code className="h-4 w-4" />,
};

const categoryColors: Record<string, string> = {
  network: 'bg-blue-100 text-blue-700 border-blue-200',
  service: 'bg-purple-100 text-purple-700 border-purple-200',
  storage: 'bg-amber-100 text-amber-700 border-amber-200',
  security: 'bg-red-100 text-red-700 border-red-200',
  application: 'bg-green-100 text-green-700 border-green-200',
  custom: 'bg-gray-100 text-gray-700 border-gray-200',
};

export default function ValidationTestsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTest, setSelectedTest] = useState<ValidationTest | null>(null);
  
  // Dialog states
  const [showNewTestDialog, setShowNewTestDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  
  // New test form state
  const [newTestForm, setNewTestForm] = useState({
    name: '',
    description: '',
    category: 'custom',
    scriptType: 'powershell',
    targetOs: 'windows',
    script: '',
    timeout: 300,
    expectedExitCode: 0,
  });
  
  // Assign test state
  const [selectedVMs, setSelectedVMs] = useState<AzureVM[]>([]);
  const [testParams, setTestParams] = useState<Record<string, string>>({});

  // Fetch all tests
  const { data: testsData, isLoading } = useQuery({
    queryKey: ['validation-tests', search, selectedCategory],
    queryFn: () =>
      liftCleanseApi.listTests({
        search: search || undefined,
        category: selectedCategory || undefined,
      }),
  });

  // Fetch VMs for assignment
  const { data: vmsData, isLoading: vmsLoading } = useQuery({
    queryKey: ['lift-cleanse-vms'],
    queryFn: () => liftCleanseApi.listVMs(),
    enabled: showAssignDialog,
  });

  // Create test mutation
  const createTestMutation = useMutation({
    mutationFn: () => liftCleanseApi.createTest(newTestForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['validation-tests'] });
      setShowNewTestDialog(false);
      setNewTestForm({
        name: '',
        description: '',
        category: 'custom',
        scriptType: 'powershell',
        targetOs: 'windows',
        script: '',
        timeout: 300,
        expectedExitCode: 0,
      });
    },
  });

  // Assign test mutation
  const assignTestMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTest || selectedVMs.length === 0) {
        throw new Error('Select at least one VM');
      }
      
      return liftCleanseApi.bulkAssignTest(
        selectedTest.id,
        selectedVMs.map(vm => ({
          vmId: vm.id,
          vmName: vm.name,
          resourceGroup: vm.resourceGroup,
          subscriptionId: vm.subscriptionId,
        })),
        testParams
      );
    },
    onSuccess: (data) => {
      setShowAssignDialog(false);
      setSelectedVMs([]);
      setTestParams({});
      // Show success message
      alert(`Test assigned to ${data?.data?.succeeded || 0} VM(s) successfully!`);
    },
    onError: (error) => {
      alert(`Failed to assign test: ${error instanceof Error ? error.message : 'Unknown error'}`);
    },
  });

  const tests = testsData?.data || [];
  const vms = vmsData?.data || [];

  // Group tests by category
  const groupedTests = tests.reduce(
    (acc, test) => {
      const cat = test.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(test);
      return acc;
    },
    {} as Record<string, ValidationTest[]>
  );

  const categories = ['network', 'service', 'storage', 'security', 'application', 'custom'];

  const toggleVMSelection = (vm: AzureVM) => {
    setSelectedVMs(prev => {
      const isSelected = prev.some(v => v.id === vm.id);
      if (isSelected) {
        return prev.filter(v => v.id !== vm.id);
      }
      return [...prev, vm];
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Validation Tests</h1>
          <p className="text-muted-foreground mt-1">
            Define and manage tests to validate VM configurations
          </p>
        </div>
        <Button onClick={() => setShowNewTestDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Test
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search tests..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg bg-background"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              className={cn(
                'px-3 py-1.5 rounded-lg border text-sm capitalize transition-colors',
                selectedCategory === cat ? categoryColors[cat] : 'bg-background hover:bg-muted'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {/* Test List */}
          <div className="col-span-2 space-y-6">
            {Object.entries(groupedTests).map(([category, categoryTests]) => (
              <div key={category}>
                <h2 className="text-sm font-semibold uppercase text-muted-foreground mb-3 flex items-center gap-2">
                  {categoryIcons[category]}
                  {category} ({categoryTests.length})
                </h2>
                <div className="space-y-2">
                  {categoryTests.map(test => (
                    <div
                      key={test.id}
                      onClick={() => setSelectedTest(test)}
                      className={cn(
                        'p-4 rounded-lg border cursor-pointer transition-all',
                        selectedTest?.id === test.id
                          ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                          : 'bg-card hover:border-gray-300'
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              'p-2 rounded-lg border',
                              categoryColors[test.category]
                            )}
                          >
                            {categoryIcons[test.category]}
                          </div>
                          <div>
                            <h3 className="font-medium flex items-center gap-2">
                              {test.name}
                              {test.isBuiltIn && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                                  Built-in
                                </span>
                              )}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                              {test.description || 'No description'}
                            </p>
                          </div>
                        </div>
                        <ChevronRight
                          className={cn(
                            'h-5 w-5 text-muted-foreground transition-transform',
                            selectedTest?.id === test.id && 'rotate-90'
                          )}
                        />
                      </div>
                      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Terminal className="h-3 w-3" />
                          {test.scriptType}
                        </span>
                        <span>
                          OS: {test.targetOs === 'both' ? 'Windows & Linux' : test.targetOs}
                        </span>
                        {test.parameters.length > 0 && (
                          <span>{test.parameters.length} parameter(s)</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {Object.keys(groupedTests).length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Terminal className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No tests found</p>
                {search && (
                  <p className="text-sm mt-1">
                    Try a different search term or clear filters
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Test Details Panel */}
          <div className="col-span-1">
            {selectedTest ? (
              <div className="sticky top-6 rounded-lg border bg-card">
                <div className="p-4 border-b">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'p-2 rounded-lg border',
                        categoryColors[selectedTest.category]
                      )}
                    >
                      {categoryIcons[selectedTest.category]}
                    </div>
                    <div>
                      <h3 className="font-semibold">{selectedTest.name}</h3>
                      <span
                        className={cn(
                          'text-xs px-1.5 py-0.5 rounded capitalize',
                          categoryColors[selectedTest.category]
                        )}
                      >
                        {selectedTest.category}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  {selectedTest.description && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-1">
                        Description
                      </h4>
                      <p className="text-sm">{selectedTest.description}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-1">
                        Script Type
                      </h4>
                      <p className="text-sm capitalize">{selectedTest.scriptType}</p>
                    </div>
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-1">
                        Target OS
                      </h4>
                      <p className="text-sm capitalize">{selectedTest.targetOs}</p>
                    </div>
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-1">
                        Expected Exit Code
                      </h4>
                      <p className="text-sm">{selectedTest.expectedExitCode}</p>
                    </div>
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-1">
                        Timeout
                      </h4>
                      <p className="text-sm">{selectedTest.timeout}s</p>
                    </div>
                  </div>

                  {selectedTest.parameters.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-2">
                        Parameters
                      </h4>
                      <div className="space-y-2">
                        {selectedTest.parameters.map(param => (
                          <div
                            key={param.key}
                            className="text-sm p-2 rounded bg-muted/50"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{param.label}</span>
                              {param.required && (
                                <span className="text-xs text-red-500">*</span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              Type: {param.type}
                              {param.default !== undefined && ` • Default: ${param.default}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-4 border-t flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() => setShowAssignDialog(true)}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Assign to VM
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="sticky top-6 rounded-lg border bg-card p-8 text-center text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Select a test to view details</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Test Dialog */}
      {showNewTestDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setShowNewTestDialog(false)}>
          <div
            className="bg-background rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">Create New Test</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowNewTestDialog(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium mb-1">Test Name *</label>
                <input
                  type="text"
                  value={newTestForm.name}
                  onChange={e => setNewTestForm({ ...newTestForm, name: e.target.value })}
                  placeholder="e.g., Check SQL Server Connection"
                  className="w-full px-3 py-2 border rounded-lg bg-background"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={newTestForm.description}
                  onChange={e => setNewTestForm({ ...newTestForm, description: e.target.value })}
                  placeholder="Describe what this test validates..."
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg bg-background resize-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <select
                    value={newTestForm.category}
                    onChange={e => setNewTestForm({ ...newTestForm, category: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg bg-background"
                  >
                    <option value="network">Network</option>
                    <option value="service">Service</option>
                    <option value="storage">Storage</option>
                    <option value="security">Security</option>
                    <option value="application">Application</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Script Type</label>
                  <select
                    value={newTestForm.scriptType}
                    onChange={e => setNewTestForm({ ...newTestForm, scriptType: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg bg-background"
                  >
                    <option value="powershell">PowerShell</option>
                    <option value="bash">Bash</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Target OS</label>
                  <select
                    value={newTestForm.targetOs}
                    onChange={e => setNewTestForm({ ...newTestForm, targetOs: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg bg-background"
                  >
                    <option value="windows">Windows</option>
                    <option value="linux">Linux</option>
                    <option value="both">Both</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Script *</label>
                <textarea
                  value={newTestForm.script}
                  onChange={e => setNewTestForm({ ...newTestForm, script: e.target.value })}
                  placeholder={newTestForm.scriptType === 'powershell' 
                    ? '# PowerShell script\nWrite-Host "Testing..."\nexit 0'
                    : '#!/bin/bash\necho "Testing..."\nexit 0'}
                  rows={10}
                  className="w-full px-3 py-2 border rounded-lg bg-background font-mono text-sm resize-none"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Exit code 0 = Pass, Non-zero = Fail
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Timeout (seconds)</label>
                  <input
                    type="number"
                    value={newTestForm.timeout}
                    onChange={e => setNewTestForm({ ...newTestForm, timeout: parseInt(e.target.value) || 300 })}
                    className="w-full px-3 py-2 border rounded-lg bg-background"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Expected Exit Code</label>
                  <input
                    type="number"
                    value={newTestForm.expectedExitCode}
                    onChange={e => setNewTestForm({ ...newTestForm, expectedExitCode: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-lg bg-background"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNewTestDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createTestMutation.mutate()}
                disabled={!newTestForm.name || !newTestForm.script || createTestMutation.isPending}
              >
                {createTestMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Create Test
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Assign to VM Dialog */}
      {showAssignDialog && selectedTest && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setShowAssignDialog(false)}>
          <div
            className="bg-background rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Assign Test to VMs</h2>
                <p className="text-sm text-muted-foreground">{selectedTest.name}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowAssignDialog(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Parameters */}
              {selectedTest.parameters.length > 0 && (
                <div className="p-4 rounded-lg border bg-muted/30">
                  <h3 className="font-medium mb-3">Test Parameters</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedTest.parameters.map(param => (
                      <div key={param.key}>
                        <label className="block text-sm font-medium mb-1">
                          {param.label}
                          {param.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        <input
                          type={param.type === 'number' ? 'number' : 'text'}
                          value={testParams[param.key] || ''}
                          onChange={e => setTestParams({ ...testParams, [param.key]: e.target.value })}
                          placeholder={param.placeholder || (param.default !== undefined ? `Default: ${param.default}` : '')}
                          className="w-full px-3 py-2 border rounded-lg bg-background"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* VM Selection */}
              <div>
                <h3 className="font-medium mb-3">Select VMs ({selectedVMs.length} selected)</h3>
                {vmsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : vms.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No VMs found. Make sure Azure is configured.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {vms.map(vm => {
                      const isSelected = selectedVMs.some(v => v.id === vm.id);
                      return (
                        <div
                          key={vm.id}
                          onClick={() => toggleVMSelection(vm)}
                          className={cn(
                            'p-3 rounded-lg border cursor-pointer transition-colors flex items-center justify-between',
                            isSelected ? 'border-emerald-500 bg-emerald-50' : 'hover:border-gray-300'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <Server className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="font-medium">{vm.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {vm.resourceGroup} • {vm.osType} • {vm.powerState}
                              </p>
                            </div>
                          </div>
                          {isSelected && (
                            <div className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center">
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                {selectedVMs.length} VM(s) selected
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => assignTestMutation.mutate()}
                  disabled={selectedVMs.length === 0 || assignTestMutation.isPending}
                >
                  {assignTestMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Assign Test
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
