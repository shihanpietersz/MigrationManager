'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ClipboardCheck,
  Database,
  MapPin,
  Server,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Cloud,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { groupsApi, settingsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { AssessmentGroup } from '@drmigrate/shared-types';

const azureLocations = [
  { value: 'australiaeast', label: 'Australia East' },
  { value: 'australiasoutheast', label: 'Australia Southeast' },
  { value: 'eastus', label: 'East US' },
  { value: 'eastus2', label: 'East US 2' },
  { value: 'westus', label: 'West US' },
  { value: 'westus2', label: 'West US 2' },
  { value: 'centralus', label: 'Central US' },
  { value: 'northeurope', label: 'North Europe' },
  { value: 'westeurope', label: 'West Europe' },
  { value: 'uksouth', label: 'UK South' },
  { value: 'ukwest', label: 'UK West' },
  { value: 'southeastasia', label: 'Southeast Asia' },
  { value: 'japaneast', label: 'Japan East' },
];

interface CreateAssessmentResponse {
  success: boolean;
  data?: {
    assessmentId: string;
    status: string;
    machineCount: number;
    azureMachineCount: number;
    portalLink?: string;
    message?: string;
  };
  error?: {
    message: string;
  };
}

export default function NewAssessmentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  
  const preselectedGroupId = searchParams.get('groupId');
  
  const [selectedGroupId, setSelectedGroupId] = useState<string>(preselectedGroupId || '');
  const [assessmentName, setAssessmentName] = useState('');
  const [azureLocation, setAzureLocation] = useState('australiaeast');
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<CreateAssessmentResponse['data'] | null>(null);

  // Fetch groups
  const { data: groupsData, isLoading: groupsLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
  });

  // Fetch selected group details
  const { data: selectedGroupData } = useQuery({
    queryKey: ['group', selectedGroupId],
    queryFn: () => groupsApi.get(selectedGroupId),
    enabled: !!selectedGroupId,
  });

  const groups = groupsData?.data || [];
  const selectedGroup = selectedGroupData?.data;

  // Create assessment mutation
  const createAssessmentMutation = useMutation({
    mutationFn: async () => {
      const response = await settingsApi.createAzureAssessment({
        groupId: selectedGroupId,
        assessmentName,
        azureLocation,
      }) as CreateAssessmentResponse;
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create assessment');
      }
      return response;
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['assessments'] });
      queryClient.invalidateQueries({ queryKey: ['azure-assessments'] });
      setSuccessData(response.data);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessData(null);
    
    if (!selectedGroupId) {
      setError('Please select a group');
      return;
    }
    if (!assessmentName.trim()) {
      setError('Please enter an assessment name');
      return;
    }
    
    createAssessmentMutation.mutate();
  };

  // Count Azure machines in selected group
  const azureMachineCount = selectedGroup?.machineIds?.length || 0;

  // Success state - show after assessment is created
  if (successData) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        {/* Page Header */}
        <div className="flex items-center gap-4">
          <Link href="/assessments">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Assessment Created</h1>
            <p className="text-muted-foreground mt-1">
              Your assessment has been created successfully
            </p>
          </div>
        </div>

        {/* Success Message */}
        <div className="rounded-lg border border-green-200 bg-green-50 p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-green-800">Assessment Created Successfully!</h3>
              <p className="text-sm text-green-700 mt-1">{successData.message}</p>
              
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-green-700">Assessment Name:</span>
                  <span className="font-medium text-green-900">{assessmentName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-700">Total Machines:</span>
                  <span className="font-medium text-green-900">{successData.machineCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-700">Azure Discovered Machines:</span>
                  <span className="font-medium text-green-900">{successData.azureMachineCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-700">Status:</span>
                  <span className="font-medium text-green-900">{successData.status}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Azure Portal Link */}
        {successData.portalLink && successData.azureMachineCount > 0 && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
            <div className="flex items-start gap-3">
              <Cloud className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-800">Run Assessment in Azure Portal</h3>
                <p className="text-sm text-blue-700 mt-1">
                  To run a detailed Azure VM assessment with cost estimates and recommendations, 
                  use Azure Migrate in the Azure Portal.
                </p>
                <a
                  href={successData.portalLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Azure Migrate Portal
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setSuccessData(null);
              setAssessmentName('');
              setSelectedGroupId('');
            }}
          >
            Create Another Assessment
          </Button>
          <Link href="/assessments">
            <Button>
              View All Assessments
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <Link href="/assessments">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create Assessment</h1>
          <p className="text-muted-foreground mt-1">
            Create a local assessment to track your migration planning
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Error Alert */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-800">Error</h4>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Step 1: Select Group */}
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-lg bg-primary/10 p-2">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Select Group</h2>
              <p className="text-sm text-muted-foreground">
                Choose an assessment group to analyze
              </p>
            </div>
          </div>

          {groupsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">No groups available</p>
              <Link href="/groups/new">
                <Button variant="outline">Create a Group First</Button>
              </Link>
            </div>
          ) : (
            <div className="grid gap-3">
              {groups.map((group: AssessmentGroup) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setSelectedGroupId(group.id)}
                  className={cn(
                    'flex items-center justify-between p-4 rounded-lg border text-left transition-colors',
                    selectedGroupId === group.id
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted/50'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Server className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{group.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {group.machineCount} machines
                      </p>
                    </div>
                  </div>
                  {selectedGroupId === group.id && (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Step 2: Assessment Details */}
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-lg bg-primary/10 p-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Assessment Details</h2>
              <p className="text-sm text-muted-foreground">
                Configure your assessment settings
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Assessment Name
              </label>
              <input
                type="text"
                value={assessmentName}
                onChange={(e) => setAssessmentName(e.target.value)}
                placeholder="e.g., SAP-Production-Assessment"
                className="w-full px-3 py-2 rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                <MapPin className="h-4 w-4 inline mr-1" />
                Target Azure Location
              </label>
              <select
                value={azureLocation}
                onChange={(e) => setAzureLocation(e.target.value)}
                className="w-full px-3 py-2 rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {azureLocations.map((loc) => (
                  <option key={loc.value} value={loc.value}>
                    {loc.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Summary */}
        {selectedGroup && (
          <div className="rounded-lg border bg-blue-50 border-blue-200 p-6">
            <h3 className="font-semibold text-blue-800 mb-3">Assessment Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-blue-700">Group:</span>
                <span className="font-medium text-blue-900">{selectedGroup.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700">Machines:</span>
                <span className="font-medium text-blue-900">{selectedGroup.machineCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700">Target Location:</span>
                <span className="font-medium text-blue-900">
                  {azureLocations.find(l => l.value === azureLocation)?.label}
                </span>
              </div>
            </div>
            <p className="text-xs text-blue-600 mt-4">
              This will create a local assessment record. For detailed Azure VM assessments, 
              you can run the analysis in Azure Portal after creation.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Link href="/assessments">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button 
            type="submit" 
            disabled={!selectedGroupId || !assessmentName || createAssessmentMutation.isPending}
          >
            {createAssessmentMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <ClipboardCheck className="h-4 w-4 mr-2" />
                Create Assessment
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

