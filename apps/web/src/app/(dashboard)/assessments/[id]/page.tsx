'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ClipboardCheck,
  Server,
  MapPin,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Cpu,
  HardDrive,
  Loader2,
  Info,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { settingsApi } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';

const readinessConfig: Record<string, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  Ready: { label: 'Ready', color: 'text-green-700', bgColor: 'bg-green-100', icon: CheckCircle2 },
  Suitable: { label: 'Suitable', color: 'text-green-700', bgColor: 'bg-green-100', icon: CheckCircle2 },
  ReadyWithConditions: { label: 'Ready with conditions', color: 'text-yellow-700', bgColor: 'bg-yellow-100', icon: AlertCircle },
  ConditionallySuitable: { label: 'Conditionally Suitable', color: 'text-yellow-700', bgColor: 'bg-yellow-100', icon: AlertCircle },
  NotReady: { label: 'Not Ready', color: 'text-red-700', bgColor: 'bg-red-100', icon: XCircle },
  NotSuitable: { label: 'Not Suitable', color: 'text-red-700', bgColor: 'bg-red-100', icon: XCircle },
  Unknown: { label: 'Unknown', color: 'text-gray-700', bgColor: 'bg-gray-100', icon: Info },
};

// Parse the assessment ID to extract name and type
function parseAssessmentId(id: string): { name: string; type: string; isGroupBased: boolean } {
  const parts = id.split('/');
  
  // Check if it's a Solution-based assessment (contains MigrateProjects/Solutions)
  if (id.includes('/Solutions/')) {
    const solutionIndex = parts.findIndex(p => p === 'Solutions');
    if (solutionIndex !== -1 && solutionIndex < parts.length - 1) {
      const solutionName = parts[solutionIndex + 1];
      const assessmentType = parts[solutionIndex + 2] || '';
      
      return {
        name: assessmentType || solutionName.replace('Servers-Assessment-', '').replace('Servers-Discovery-', 'Discovery-'),
        type: assessmentType ? assessmentType.replace('Assessment', ' Assessment') : 'Solution',
        isGroupBased: false,
      };
    }
  }
  
  // Check if it's a collector
  if (id.includes('/vmwarecollectors/') || id.includes('/hypervcollectors/')) {
    const collectorType = id.includes('/vmwarecollectors/') ? 'VMware Collector' : 'Hyper-V Collector';
    return {
      name: parts[parts.length - 1],
      type: collectorType,
      isGroupBased: false,
    };
  }
  
  // Group-based assessment
  if (id.includes('/groups/') && id.includes('/assessments/')) {
    const assessmentIndex = parts.findIndex(p => p === 'assessments');
    return {
      name: parts[assessmentIndex + 1] || 'Unknown',
      type: 'Azure VM Assessment',
      isGroupBased: true,
    };
  }
  
  return {
    name: parts[parts.length - 1] || 'Unknown',
    type: 'Assessment',
    isGroupBased: false,
  };
}

export default function AssessmentDetailPage() {
  const params = useParams();
  const assessmentId = decodeURIComponent(params.id as string);
  const parsedId = parseAssessmentId(assessmentId);

  const { data, isLoading, error } = useQuery({
    queryKey: ['assessment-details', assessmentId],
    queryFn: () => settingsApi.getAzureAssessmentDetails(assessmentId),
    enabled: !!assessmentId && parsedId.isGroupBased,
  });

  // Also fetch assessment machines for non-group-based assessments
  const { data: machinesData } = useQuery({
    queryKey: ['assessment-machines'],
    queryFn: () => settingsApi.getAssessmentMachines(),
    enabled: !parsedId.isGroupBased,
  });

  const assessment = data?.data?.assessment;
  const assessedMachines = data?.data?.assessedMachines || [];
  const allMachines = machinesData?.data || [];
  const properties = assessment?.properties as Record<string, unknown> | undefined;

  if (isLoading && parsedId.isGroupBased) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // For non-group-based assessments, show the summary view
  if (!parsedId.isGroupBased) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/assessments">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-3">
              <ClipboardCheck className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{parsedId.name}</h1>
              <p className="text-muted-foreground mt-1">{parsedId.type}</p>
            </div>
          </div>
        </div>

        {/* Summary Info */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Assessment Overview</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Assessment Type</p>
              <p className="font-medium">{parsedId.type}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                <CheckCircle2 className="h-3 w-3" />
                Ready
              </span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-6">
            This is a summary view of the {parsedId.type}. Detailed assessment data for individual machines
            is available when you create group-based assessments.
          </p>
        </div>

        {/* Assessment Machines */}
        {allMachines.length > 0 && (
          <div className="rounded-lg border bg-card">
            <div className="p-6 border-b">
              <h2 className="text-lg font-semibold">Discovered Machines</h2>
              <p className="text-muted-foreground text-sm mt-1">
                {allMachines.length} machines available for assessment
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left py-3 px-4 font-medium text-sm">Machine Name</th>
                    <th className="text-left py-3 px-4 font-medium text-sm">OS</th>
                    <th className="text-left py-3 px-4 font-medium text-sm">Cores</th>
                    <th className="text-left py-3 px-4 font-medium text-sm">Memory</th>
                    <th className="text-left py-3 px-4 font-medium text-sm">Groups</th>
                  </tr>
                </thead>
                <tbody>
                  {allMachines.slice(0, 20).map((machine) => {
                    const machineProps = machine.properties as Record<string, unknown>;
                    return (
                      <tr key={machine.id as string} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Server className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{machineProps?.displayName as string || machine.name as string}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {machineProps?.operatingSystemName as string || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {machineProps?.numberOfCores as number || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {machineProps?.megabytesOfMemory 
                            ? `${Math.round((machineProps.megabytesOfMemory as number) / 1024)} GB`
                            : '-'}
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {(machineProps?.groups as string[])?.length || 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {allMachines.length > 20 && (
              <div className="p-4 border-t text-center text-sm text-muted-foreground">
                Showing 20 of {allMachines.length} machines
              </div>
            )}
          </div>
        )}

        {/* Azure Portal Link */}
        <div className="rounded-lg border bg-blue-50 border-blue-200 p-6">
          <h3 className="font-semibold text-blue-800 mb-2">View in Azure Portal</h3>
          <p className="text-sm text-blue-700 mb-4">
            For detailed assessment reports with cost estimates and recommendations,
            view this assessment in the Azure Migrate portal.
          </p>
          <a
            href={`https://portal.azure.com/#view/Microsoft_Azure_Migrate/OverviewBlade`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-100">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Azure Migrate
            </Button>
          </a>
        </div>
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/assessments">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Assessment Not Found</h1>
            <p className="text-muted-foreground mt-1">
              The requested assessment could not be loaded
            </p>
          </div>
        </div>
        <Link href="/assessments">
          <Button>Back to Assessments</Button>
        </Link>
      </div>
    );
  }

  // Calculate summary stats
  const totalMachines = assessedMachines.length;
  const readyMachines = assessedMachines.filter(m => 
    (m.properties as Record<string, unknown>)?.suitability === 'Suitable'
  ).length;
  const monthlyCost = (properties?.monthlyComputeCost as number || 0) + 
    (properties?.monthlyStorageCost as number || 0) + 
    (properties?.monthlyBandwidthCost as number || 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/assessments">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-3">
              <ClipboardCheck className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {assessment.name as string}
              </h1>
              <p className="text-muted-foreground mt-1">
                Assessment Details
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Server className="h-4 w-4" />
            <span className="text-sm">Machines</span>
          </div>
          <p className="text-2xl font-bold">{totalMachines}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {readyMachines} ready for migration
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <MapPin className="h-4 w-4" />
            <span className="text-sm">Target Location</span>
          </div>
          <p className="text-lg font-semibold">{properties?.azureLocation as string || 'Not set'}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <DollarSign className="h-4 w-4" />
            <span className="text-sm">Est. Monthly Cost</span>
          </div>
          <p className="text-2xl font-bold text-green-600">
            {monthlyCost > 0 ? formatCurrency(monthlyCost) : 'N/A'}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Clock className="h-4 w-4" />
            <span className="text-sm">Status</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="font-semibold text-green-600">
              {properties?.status as string || 'Completed'}
            </span>
          </div>
        </div>
      </div>

      {/* Assessment Configuration */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Assessment Configuration</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Sizing Criterion</p>
            <p className="font-medium">{properties?.sizingCriterion as string || 'Performance-based'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Pricing Tier</p>
            <p className="font-medium">{properties?.azurePricingTier as string || 'Standard'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Currency</p>
            <p className="font-medium">{properties?.currency as string || 'USD'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Comfort Factor</p>
            <p className="font-medium">{properties?.scalingFactor as number || 1.0}x</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Percentile Utilization</p>
            <p className="font-medium">{properties?.percentile as string || '95th'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Time Range</p>
            <p className="font-medium">{properties?.timeRange as string || 'Month'}</p>
          </div>
        </div>
      </div>

      {/* Cost Breakdown */}
      {monthlyCost > 0 && (
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Cost Breakdown</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 rounded-lg bg-blue-50">
              <div className="flex items-center gap-2 text-blue-700 mb-2">
                <Cpu className="h-4 w-4" />
                <span className="text-sm">Compute</span>
              </div>
              <p className="text-xl font-bold text-blue-800">
                {formatCurrency(properties?.monthlyComputeCost as number || 0)}
              </p>
              <p className="text-xs text-blue-600">/month</p>
            </div>
            <div className="p-4 rounded-lg bg-green-50">
              <div className="flex items-center gap-2 text-green-700 mb-2">
                <HardDrive className="h-4 w-4" />
                <span className="text-sm">Storage</span>
              </div>
              <p className="text-xl font-bold text-green-800">
                {formatCurrency(properties?.monthlyStorageCost as number || 0)}
              </p>
              <p className="text-xs text-green-600">/month</p>
            </div>
            <div className="p-4 rounded-lg bg-purple-50">
              <div className="flex items-center gap-2 text-purple-700 mb-2">
                <Server className="h-4 w-4" />
                <span className="text-sm">Bandwidth</span>
              </div>
              <p className="text-xl font-bold text-purple-800">
                {formatCurrency(properties?.monthlyBandwidthCost as number || 0)}
              </p>
              <p className="text-xs text-purple-600">/month</p>
            </div>
          </div>
        </div>
      )}

      {/* Assessed Machines */}
      <div className="rounded-lg border bg-card">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Assessed Machines</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {assessedMachines.length} machines analyzed in this assessment
          </p>
        </div>
        
        {assessedMachines.length === 0 ? (
          <div className="p-12 text-center">
            <Server className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="font-semibold mb-2">No assessed machines</h3>
            <p className="text-muted-foreground">
              Machine assessment data is not available for this assessment
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-3 px-4 font-medium text-sm">Machine Name</th>
                  <th className="text-left py-3 px-4 font-medium text-sm">Readiness</th>
                  <th className="text-left py-3 px-4 font-medium text-sm">Recommended Size</th>
                  <th className="text-left py-3 px-4 font-medium text-sm">Monthly Cost</th>
                  <th className="text-left py-3 px-4 font-medium text-sm">OS</th>
                </tr>
              </thead>
              <tbody>
                {assessedMachines.map((machine) => {
                  const machineProps = machine.properties as Record<string, unknown>;
                  const suitability = machineProps?.suitability as string || 'Unknown';
                  const readiness = readinessConfig[suitability] || readinessConfig.Unknown;
                  const ReadinessIcon = readiness.icon;
                  
                  return (
                    <tr key={machine.id as string} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Server className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{machineProps?.displayName as string || machine.name as string}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={cn(
                          'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
                          readiness.bgColor,
                          readiness.color
                        )}>
                          <ReadinessIcon className="h-3 w-3" />
                          {readiness.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {machineProps?.recommendedSize as string || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {machineProps?.monthlyComputeCostForRecommendedSize 
                          ? formatCurrency(machineProps.monthlyComputeCostForRecommendedSize as number)
                          : '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {machineProps?.operatingSystemName as string || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

