'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { liftCleanseApi, type LiftCleanseScript, type AzureVM } from '@/lib/api';
import {
  Play,
  ChevronLeft,
  Loader2,
  Server,
  Terminal,
  FileCode,
  Check,
  X,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Settings2,
  AlertCircle,
  Search,
} from 'lucide-react';
// Toast notifications handled inline

export default function ExecutePage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const preselectedScriptId = searchParams.get('script');

  const [selectedScript, setSelectedScript] = useState<LiftCleanseScript | null>(null);
  const [selectedVMs, setSelectedVMs] = useState<AzureVM[]>([]);
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [maxParallel, setMaxParallel] = useState(5);
  const [vmSearch, setVmSearch] = useState('');
  const [step, setStep] = useState<'script' | 'vms' | 'params' | 'review'>('script');

  // Fetch scripts
  const { data: scriptsData, isLoading: scriptsLoading } = useQuery({
    queryKey: ['lift-cleanse-scripts'],
    queryFn: () => liftCleanseApi.listScripts(),
  });

  // Fetch VMs
  const { data: vmsData, isLoading: vmsLoading } = useQuery({
    queryKey: ['lift-cleanse-vms'],
    queryFn: () => liftCleanseApi.listVMs(),
  });

  const scripts = scriptsData?.data || [];
  const vms = vmsData?.data || [];

  // Preselect script if provided
  useEffect(() => {
    if (preselectedScriptId && scripts.length > 0) {
      const script = scripts.find(s => s.id === preselectedScriptId);
      if (script) {
        setSelectedScript(script);
        setStep('vms');
      }
    }
  }, [preselectedScriptId, scripts]);

  // Execute mutation
  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedScript || selectedVMs.length === 0) {
        throw new Error('Please select a script and at least one VM');
      }
      return liftCleanseApi.executeScript({
        scriptId: selectedScript.id,
        targets: selectedVMs.map(vm => ({
          vmId: vm.id,
          vmName: vm.name,
          resourceGroup: vm.resourceGroup,
          subscriptionId: vm.subscriptionId,
          osType: vm.osType.toLowerCase() as 'windows' | 'linux',
        })),
        parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
        maxParallel,
      });
    },
    onSuccess: data => {
      router.push(`/lift-cleanse/history/${data.data?.executionId}`);
    },
    onError: (error: Error) => {
      alert(`Error: ${error.message}`);
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

  const filteredVMs = vms.filter(vm => {
    // Filter by OS compatibility
    if (selectedScript) {
      if (
        selectedScript.targetOs !== 'both' &&
        vm.osType.toLowerCase() !== selectedScript.targetOs
      ) {
        return false;
      }
    }
    // Filter by search
    if (vmSearch) {
      return (
        vm.name.toLowerCase().includes(vmSearch.toLowerCase()) ||
        vm.resourceGroup.toLowerCase().includes(vmSearch.toLowerCase())
      );
    }
    return true;
  });

  const toggleVM = (vm: AzureVM) => {
    if (selectedVMs.some(v => v.id === vm.id)) {
      setSelectedVMs(selectedVMs.filter(v => v.id !== vm.id));
    } else {
      setSelectedVMs([...selectedVMs, vm]);
    }
  };

  const selectAllVMs = () => {
    if (selectedVMs.length === filteredVMs.length) {
      setSelectedVMs([]);
    } else {
      setSelectedVMs([...filteredVMs]);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 'script':
        return selectedScript !== null;
      case 'vms':
        return selectedVMs.length > 0;
      case 'params':
        // Check required params
        if (selectedScript?.parameters) {
          return selectedScript.parameters
            .filter(p => p.required)
            .every(p => parameters[p.key]?.trim());
        }
        return true;
      case 'review':
        return true;
      default:
        return false;
    }
  };

  const nextStep = () => {
    switch (step) {
      case 'script':
        setStep('vms');
        break;
      case 'vms':
        if (selectedScript?.parameters && selectedScript.parameters.length > 0) {
          setStep('params');
        } else {
          setStep('review');
        }
        break;
      case 'params':
        setStep('review');
        break;
    }
  };

  const prevStep = () => {
    switch (step) {
      case 'vms':
        setStep('script');
        break;
      case 'params':
        setStep('vms');
        break;
      case 'review':
        if (selectedScript?.parameters && selectedScript.parameters.length > 0) {
          setStep('params');
        } else {
          setStep('vms');
        }
        break;
    }
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
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Play className="h-6 w-6 text-emerald-600" />
              Execute Script
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Run a script on one or more VMs
            </p>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-8">
        {[
          { key: 'script', label: 'Select Script', icon: FileCode },
          { key: 'vms', label: 'Select VMs', icon: Server },
          { key: 'params', label: 'Parameters', icon: Settings2 },
          { key: 'review', label: 'Review', icon: Check },
        ].map((s, i) => (
          <div key={s.key} className="flex items-center">
            <div
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-full border transition-colors',
                step === s.key
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : i < ['script', 'vms', 'params', 'review'].indexOf(step)
                  ? 'border-emerald-300 bg-emerald-100 text-emerald-600'
                  : 'border-gray-200 text-gray-400'
              )}
            >
              <s.icon className="h-4 w-4" />
              <span className="text-sm font-medium">{s.label}</span>
            </div>
            {i < 3 && (
              <div
                className={cn(
                  'w-12 h-px mx-2',
                  i < ['script', 'vms', 'params', 'review'].indexOf(step)
                    ? 'bg-emerald-300'
                    : 'bg-gray-200'
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="rounded-lg border bg-card p-6">
        {/* Step 1: Select Script */}
        {step === 'script' && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Select a Script</h2>
            {scriptsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : scripts.length === 0 ? (
              <div className="text-center py-12">
                <FileCode className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No scripts available</p>
              </div>
            ) : (
              <div className="grid gap-3 max-h-[400px] overflow-y-auto">
                {scripts.map(script => (
                  <div
                    key={script.id}
                    onClick={() => setSelectedScript(script)}
                    className={cn(
                      'p-4 rounded-lg border cursor-pointer transition-colors',
                      selectedScript?.id === script.id
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'hover:border-emerald-300'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{script.name}</h3>
                          {script.isBuiltIn && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                              Built-in
                            </span>
                          )}
                          {getRiskIcon(script.riskLevel)}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                          {script.description || 'No description'}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Terminal className="h-3 w-3" />
                            {script.scriptType === 'powershell' ? 'PowerShell' : 'Bash'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Server className="h-3 w-3" />
                            {script.targetOs === 'both' ? 'Windows/Linux' : script.targetOs}
                          </span>
                        </div>
                      </div>
                      {selectedScript?.id === script.id && (
                        <div className="p-1 rounded-full bg-emerald-500 text-white">
                          <Check className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Select VMs */}
        {step === 'vms' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Select Target VMs</h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search VMs..."
                    value={vmSearch}
                    onChange={e => setVmSearch(e.target.value)}
                    className="pl-9 w-64"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={selectAllVMs}>
                  {selectedVMs.length === filteredVMs.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
            </div>
            {selectedScript && (
              <p className="text-sm text-muted-foreground mb-4">
                Showing {selectedScript.targetOs === 'both' ? 'all' : selectedScript.targetOs} VMs
                compatible with this script
              </p>
            )}
            {vmsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredVMs.length === 0 ? (
              <div className="text-center py-12">
                <Server className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No compatible VMs found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
                {filteredVMs.map(vm => (
                  <div
                    key={vm.id}
                    onClick={() => toggleVM(vm)}
                    className={cn(
                      'p-4 rounded-lg border cursor-pointer transition-colors',
                      selectedVMs.some(v => v.id === vm.id)
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'hover:border-emerald-300',
                      vm.powerState !== 'VM running' && 'opacity-60'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              'w-2 h-2 rounded-full',
                              vm.powerState === 'VM running' ? 'bg-green-500' : 'bg-gray-400'
                            )}
                          />
                          <h3 className="font-medium">{vm.name}</h3>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                          <p>
                            {vm.osType} • {vm.vmSize}
                          </p>
                          <p className="truncate">{vm.resourceGroup}</p>
                        </div>
                      </div>
                      {selectedVMs.some(v => v.id === vm.id) && (
                        <div className="p-1 rounded-full bg-emerald-500 text-white">
                          <Check className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                    {vm.powerState !== 'VM running' && (
                      <div className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        VM not running
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 text-sm text-muted-foreground">
              {selectedVMs.length} VM{selectedVMs.length !== 1 ? 's' : ''} selected
            </div>
          </div>
        )}

        {/* Step 3: Parameters */}
        {step === 'params' && selectedScript && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Script Parameters</h2>
            {selectedScript.parameters.length === 0 ? (
              <p className="text-muted-foreground">This script has no parameters.</p>
            ) : (
              <div className="space-y-4">
                {selectedScript.parameters.map(param => (
                  <div key={param.key}>
                    <Label htmlFor={param.key}>
                      {param.key}
                      {param.required && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    <Input
                      id={param.key}
                      placeholder={param.description}
                      value={parameters[param.key] || ''}
                      onChange={e =>
                        setParameters({ ...parameters, [param.key]: e.target.value })
                      }
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">{param.description}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-6 pt-4 border-t">
              <Label htmlFor="maxParallel">Max Parallel Executions</Label>
              <Input
                id="maxParallel"
                type="number"
                min={1}
                max={20}
                value={maxParallel}
                onChange={e => setMaxParallel(parseInt(e.target.value) || 5)}
                className="mt-1 w-32"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Number of VMs to execute on simultaneously
              </p>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 'review' && selectedScript && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Review Execution</h2>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <h3 className="font-medium text-sm text-muted-foreground">Script</h3>
                <p className="font-medium mt-1">{selectedScript.name}</p>
                <p className="text-sm text-muted-foreground">{selectedScript.description}</p>
              </div>

              <div className="p-4 rounded-lg bg-muted/50">
                <h3 className="font-medium text-sm text-muted-foreground">Target VMs</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedVMs.map(vm => (
                    <span
                      key={vm.id}
                      className="text-sm px-2 py-1 rounded bg-background border"
                    >
                      {vm.name}
                    </span>
                  ))}
                </div>
              </div>

              {Object.keys(parameters).length > 0 && (
                <div className="p-4 rounded-lg bg-muted/50">
                  <h3 className="font-medium text-sm text-muted-foreground">Parameters</h3>
                  <div className="mt-2 space-y-1">
                    {Object.entries(parameters).map(([key, value]) => (
                      <div key={key} className="text-sm">
                        <span className="text-muted-foreground">{key}:</span> {value}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-4 rounded-lg bg-muted/50">
                <h3 className="font-medium text-sm text-muted-foreground">Execution Settings</h3>
                <p className="text-sm mt-1">
                  Max parallel executions: <strong>{maxParallel}</strong>
                </p>
              </div>

              {selectedScript.riskLevel !== 'low' && (
                <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="flex items-center gap-2 text-amber-700">
                    <AlertCircle className="h-5 w-5" />
                    <h3 className="font-medium">
                      This script has {selectedScript.riskLevel} risk level
                    </h3>
                  </div>
                  <p className="text-sm text-amber-600 mt-1">
                    Please review the script content carefully before execution.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={prevStep} disabled={step === 'script'}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          {step === 'review' ? (
            <Button
              onClick={() => executeMutation.mutate()}
              disabled={executeMutation.isPending}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
            >
              {executeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Execute Script
                </>
              )}
            </Button>
          ) : (
            <Button onClick={nextStep} disabled={!canProceed()}>
              Next Step
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

