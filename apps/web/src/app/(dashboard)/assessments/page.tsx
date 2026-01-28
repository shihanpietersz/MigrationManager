'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ClipboardCheck,
  CheckCircle2,
  Clock,
  PlayCircle,
  XCircle,
  MoreHorizontal,
  DollarSign,
  Cloud,
  HardDrive,
  ExternalLink,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { assessmentsApi, settingsApi, type AzureMigrateAssessment } from '@/lib/api';
import { cn, formatDate, formatCurrency } from '@/lib/utils';
import type { Assessment, AssessmentStatus } from '@drmigrate/shared-types';

const statusConfig: Record<
  AssessmentStatus | string,
  { label: string; icon: React.ElementType; color: string }
> = {
  Created: { label: 'Created', icon: Clock, color: 'text-gray-500' },
  Running: { label: 'Running', icon: PlayCircle, color: 'text-blue-500' },
  Completed: { label: 'Completed', icon: CheckCircle2, color: 'text-green-500' },
  Failed: { label: 'Failed', icon: XCircle, color: 'text-red-500' },
  Invalid: { label: 'Invalid', icon: XCircle, color: 'text-orange-500' },
  ready: { label: 'Ready', icon: CheckCircle2, color: 'text-green-500' },
};

export default function AssessmentsPage() {
  const { data: localData, isLoading: localLoading } = useQuery({
    queryKey: ['assessments'],
    queryFn: () => assessmentsApi.list(),
  });

  const { data: azureData, isLoading: azureLoading } = useQuery({
    queryKey: ['azure-assessments'],
    queryFn: () => settingsApi.getAzureAssessments(),
  });

  const localAssessments = localData?.data || [];
  const azureAssessments = azureData?.data || [];
  const isLoading = localLoading || azureLoading;
  const hasAnyAssessments = localAssessments.length > 0 || azureAssessments.length > 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Assessments</h1>
          <p className="text-muted-foreground mt-1">
            View migration readiness assessments for your groups
          </p>
        </div>
        <Link href="/assessments/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Assessment
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          Loading assessments...
        </div>
      ) : !hasAnyAssessments ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-20" />
          <p>No assessments yet</p>
          <p className="text-sm mt-1 text-muted-foreground">
            Create an assessment group and run an assessment to get started
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Azure Migrate Assessments */}
          {azureAssessments.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Cloud className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold">Azure Migrate Assessments</h2>
                <span className="text-sm text-muted-foreground">
                  ({azureAssessments.length} assessments)
                </span>
              </div>
              <div className="rounded-lg border bg-card">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-blue-50">
                        <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                          Assessment
                        </th>
                        <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                          Type
                        </th>
                        <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                          Location
                        </th>
                        <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                          Sizing
                        </th>
                        <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                          Status
                        </th>
                        <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {azureAssessments.map((assessment: AzureMigrateAssessment) => {
                        const totalCost = (assessment.monthlyComputeCost || 0) + 
                          (assessment.monthlyStorageCost || 0) + 
                          (assessment.monthlyBandwidthCost || 0);
                        
                        return (
                          <tr key={assessment.id} className="border-b hover:bg-muted/30">
                            <td className="py-3 px-4">
                              <Link
                                href={`/assessments/${encodeURIComponent(assessment.id)}`}
                                className="flex items-center gap-2 hover:underline"
                              >
                                <Cloud className="h-4 w-4 text-blue-500" />
                                <span className="font-medium">{assessment.name}</span>
                              </Link>
                            </td>
                            <td className="py-3 px-4">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                {assessment.type?.split('/').pop() || 'Azure VM'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-sm text-muted-foreground">
                              {assessment.azureLocation || '-'}
                            </td>
                            <td className="py-3 px-4 text-sm text-muted-foreground">
                              {assessment.sizingCriterion || '-'}
                            </td>
                            <td className="py-3 px-4">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                <CheckCircle2 className="h-3 w-3" />
                                {assessment.status || 'Ready'}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <Link href={`/assessments/${encodeURIComponent(assessment.id)}`}>
                                <Button variant="ghost" size="sm">
                                  View Details
                                </Button>
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Local Assessments */}
          {localAssessments.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <HardDrive className="h-5 w-5 text-green-600" />
                <h2 className="text-lg font-semibold">Local Assessments</h2>
                <span className="text-sm text-muted-foreground">
                  ({localAssessments.length} assessments)
                </span>
              </div>
              <div className="rounded-lg border bg-card">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                          Assessment
                        </th>
                        <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                          Group
                        </th>
                        <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                          Location
                        </th>
                        <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                          Status
                        </th>
                        <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                          Created
                        </th>
                        <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {localAssessments.map((assessment: Assessment) => {
                        const status = statusConfig[assessment.status] || statusConfig.Created;
                        const StatusIcon = status.icon;

                        return (
                          <tr key={assessment.id} className="border-b hover:bg-muted/30">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                                <Link
                                  href={`/assessments/${assessment.id}`}
                                  className="font-medium hover:underline"
                                >
                                  {assessment.name}
                                </Link>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-sm">
                              <Link
                                href={`/groups/${assessment.groupId}`}
                                className="text-primary hover:underline"
                              >
                                {assessment.groupName}
                              </Link>
                            </td>
                            <td className="py-3 px-4 text-sm text-muted-foreground">
                              {assessment.azureLocation}
                            </td>
                            <td className="py-3 px-4">
                              <div className={cn('flex items-center gap-2 text-sm', status.color)}>
                                <StatusIcon className="h-4 w-4" />
                                <span>{status.label}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-sm text-muted-foreground">
                              {formatDate(assessment.createdAt)}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <Link href={`/assessments/${assessment.id}`}>
                                  <Button variant="ghost" size="sm">
                                    View Results
                                  </Button>
                                </Link>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

