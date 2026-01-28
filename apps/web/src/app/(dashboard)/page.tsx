'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Server,
  Database,
  ClipboardCheck,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  Settings,
  XCircle,
  HardDrive,
  Sparkles,
  Check,
  Circle,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { machinesApi, groupsApi, assessmentsApi, replicationApi, settingsApi } from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';
import { PageHeader, SectionHeader } from '@/components/ui/page-header';
import { StatCard, StatCardGrid } from '@/components/ui/stat-card';
import { TabGroup, TabPanel, useTabs } from '@/components/ui/tabs';

// Tab configuration matching the screenshot design
const viewTabs = [
  { id: 'wave', label: 'By Wave' },
  { id: 'application', label: 'By Application' },
  { id: 'server', label: 'By Server' },
];

export default function DashboardPage() {
  const { activeTab, setActiveTab } = useTabs('application');

  // Fetch real stats
  const { data: machineStats } = useQuery({
    queryKey: ['machine-stats'],
    queryFn: () => machinesApi.stats(),
  });

  const { data: groupsData } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
  });

  const { data: assessmentsData } = useQuery({
    queryKey: ['assessments'],
    queryFn: () => assessmentsApi.list(),
  });

  const { data: replicationData } = useQuery({
    queryKey: ['replication'],
    queryFn: () => replicationApi.list(),
  });

  const { data: activityData } = useQuery({
    queryKey: ['activity-log'],
    queryFn: () => settingsApi.getActivityLog(10),
  });

  const { data: configData } = useQuery({
    queryKey: ['azure-config'],
    queryFn: () => settingsApi.getAzureConfig(),
  });

  const stats = {
    machines: machineStats?.data?.total || 0,
    groups: groupsData?.data?.length || 0,
    assessments: assessmentsData?.data?.length || 0,
    replicating: replicationData?.data?.length || 0,
    protected: replicationData?.data?.filter((r) => r.status === 'Protected').length || 0,
    healthErrors: 0,
    totalStorage: machineStats?.data?.totalStorageGB ? (machineStats.data.totalStorageGB / 1024).toFixed(1) : '0',
    appMapped: groupsData?.data?.length || 0,
    totalApplications: 6, // Example data matching screenshot
    completed: 1,
    inProgress: 3,
    environments: 3,
    issues: 6,
  };

  const isAzureConfigured = configData?.data?.subscriptionId && configData?.data?.migrateProject;
  const activities = activityData?.data || [];

  // Calculate workflow progress
  const workflowSteps = [
    { 
      name: 'Setup', 
      href: '/settings', 
      completed: isAzureConfigured,
      items: [{ name: 'Configure Azure Settings', href: '/settings', completed: isAzureConfigured }]
    },
    { 
      name: 'Inventory', 
      href: '/machines', 
      completed: stats.machines > 0,
      items: [{ name: 'Machine Discovery', href: '/machines', completed: stats.machines > 0 }]
    },
    { 
      name: 'Goals and Strategies', 
      href: '/groups', 
      completed: stats.groups > 0,
      items: [
        { name: 'Migration Groups', href: '/groups', completed: stats.groups > 0 },
        { name: 'Assessment Strategy', href: '/assessments', completed: stats.assessments > 0 },
      ]
    },
    { 
      name: 'Migration Planning', 
      href: '/replication', 
      completed: stats.replicating > 0,
      items: [
        { name: 'Replication Setup', href: '/replication/new', completed: stats.replicating > 0 },
        { name: 'Migration Execution', href: '/replication', completed: stats.protected > 0 },
      ]
    },
  ];

  const completedSteps = workflowSteps.filter(s => s.completed).length;
  const progressPercent = Math.round((completedSteps / workflowSteps.length) * 100);

  return (
    <div className="space-y-6">
      {/* Page Header with Tabs */}
      <div>
        <PageHeader
          title="Migration Manager"
          subtitle="Migration execution status and progress tracking"
        />
        <TabGroup
          tabs={viewTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          className="mt-4"
        />
      </div>

      {/* Key Metrics - Matching Screenshot Design */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* Total Applications */}
        <StatCard
          value={stats.totalApplications}
          label="TOTAL APPLICATIONS"
          sublabel="in scope"
          icon={<Layers className="h-5 w-5" />}
          variant="primary"
          progress={100}
          href="/groups"
        />

        {/* Completed */}
        <StatCard
          value={stats.completed}
          label="COMPLETED"
          sublabel={`${Math.round((stats.completed / stats.totalApplications) * 100)}% complete`}
          icon={<CheckCircle2 className="h-5 w-5" />}
          variant="success"
          progress={(stats.completed / stats.totalApplications) * 100}
          href="/replication"
        />

        {/* In Progress */}
        <StatCard
          value={stats.inProgress}
          label="IN PROGRESS"
          sublabel="actively migrating"
          icon={<RefreshCw className="h-5 w-5" />}
          variant="primary"
          progress={(stats.inProgress / stats.totalApplications) * 100}
          href="/replication"
        />

        {/* Total Servers */}
        <StatCard
          value={stats.machines || 24}
          label="TOTAL SERVERS"
          sublabel="across all apps"
          icon={<Server className="h-5 w-5" />}
          variant="primary"
          progress={75}
          href="/machines"
        />

        {/* Environments */}
        <StatCard
          value={stats.environments}
          label="ENVIRONMENTS"
          sublabel="DEV, TEST, PROD"
          icon={<Database className="h-5 w-5" />}
          variant="primary"
          progress={100}
          href="/groups"
        />

        {/* Issues */}
        <StatCard
          value={stats.issues}
          label="ISSUES"
          sublabel="script failures"
          icon={<AlertTriangle className="h-5 w-5" />}
          variant="danger"
          progress={100}
          href="/lift-cleanse"
        />
      </div>

      {/* Quick Actions and Azure Config Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Quick Actions */}
        <div className="mm-card p-6">
          <SectionHeader title="Quick Actions" />
          <div className="space-y-3">
            <Link
              href="/machines"
              className="mm-btn-primary w-full flex items-center justify-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Data Sync
            </Link>
            <Link
              href="/settings"
              className="mm-btn-secondary w-full flex items-center justify-center gap-2"
            >
              <Settings className="h-4 w-4" />
              Azure Settings
            </Link>
            <Link
              href="/replication"
              className="mm-btn-outline w-full flex items-center justify-center gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Replication Dashboard
            </Link>
          </div>
        </div>

        {/* Azure Config Status Card */}
        <div className="lg:col-span-2">
          <div className={cn(
            "mm-card p-6 h-full",
            isAzureConfigured 
              ? "mm-info-card-success"
              : "mm-info-card-warning"
          )}>
            <div className="flex items-start gap-4">
              <div className={cn(
                "p-3 rounded-full",
                isAzureConfigured ? "bg-success-light" : "bg-warning-light"
              )}>
                {isAzureConfigured ? (
                  <CheckCircle2 className="h-6 w-6 text-success" />
                ) : (
                  <AlertCircle className="h-6 w-6 text-warning" />
                )}
              </div>
              <div className="flex-1">
                <h3 className={cn(
                  "text-lg font-semibold mb-2",
                  isAzureConfigured ? "text-success" : "text-warning"
                )}>
                  {isAzureConfigured ? 'Azure Connected' : 'Setup Required'}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {isAzureConfigured 
                    ? 'Your Azure Migrate project is connected and ready. You can now start discovering machines and planning migrations.' 
                    : 'Configure Azure settings to connect to your Azure Migrate project and start the migration process.'}
                </p>
                <Link
                  href="/settings"
                  className={cn(
                    "inline-flex items-center text-sm font-medium transition-colors",
                    isAzureConfigured 
                      ? "text-success hover:text-success/80" 
                      : "text-warning hover:text-warning/80"
                  )}
                >
                  {isAzureConfigured ? 'View Settings' : 'Configure Now'}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Migration Workflow */}
      <div className="mm-card p-6">
        <SectionHeader 
          title="Migration Workflow" 
          subtitle="Your migration journey is tracked here, complete each stage to move forward."
        />

        {/* Progress Bar */}
        <div className="relative mb-8">
          <div className="mm-progress h-3">
            <div 
              className="mm-progress-bar mm-progress-primary"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div 
            className="absolute top-0 -mt-1 right-0 text-primary-foreground text-xs font-medium px-2 py-1 rounded bg-primary"
          >
            {progressPercent}% Complete
          </div>
        </div>

        {/* Workflow Steps Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {workflowSteps.map((step, index) => (
            <Link
              key={step.name}
              href={step.href}
              className={cn(
                "mm-workflow-card group",
                step.completed 
                  ? "mm-workflow-card-completed" 
                  : index === completedSteps 
                  ? "mm-workflow-card-active" 
                  : "mm-workflow-card-pending"
              )}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full",
                  step.completed 
                    ? "bg-success-light text-success" 
                    : index === completedSteps 
                    ? "bg-primary-light text-primary" 
                    : "bg-muted text-muted-foreground"
                )}>
                  {step.completed ? (
                    <Check className="h-4 w-4" strokeWidth={3} />
                  ) : (
                    <Circle className="h-3 w-3 fill-current" />
                  )}
                </div>
                <h3 className={cn(
                  "font-semibold",
                  step.completed 
                    ? "text-success" 
                    : index === completedSteps 
                    ? "text-primary" 
                    : "text-muted-foreground"
                )}>
                  {step.name}
                </h3>
              </div>
              <div className="space-y-2 pl-10">
                {step.items.map((item) => (
                  <div 
                    key={item.name}
                    className={cn(
                      "flex items-center gap-2 text-sm",
                      item.completed ? "text-success" : "text-muted-foreground"
                    )}
                  >
                    {item.completed ? (
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    ) : (
                      <Circle className="h-2 w-2 fill-current" />
                    )}
                    <span>{item.name}</span>
                  </div>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mm-section-card">
        <div className="mm-section-header flex items-center justify-between">
          <span>Recent Activity</span>
          {activities.length > 0 && (
            <Link
              href="#"
              className="text-sm text-primary hover:text-primary/80"
            >
              View all
            </Link>
          )}
        </div>
        <div className="divide-y divide-card-border">
          {activities.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Clock className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-foreground font-medium">No recent activity</p>
              <p className="text-sm text-muted-foreground mt-1">Activity will appear here as you use the app</p>
            </div>
          ) : (
            activities.slice(0, 5).map((activity) => (
              <div key={activity.id} className="flex items-start gap-4 px-6 py-4 hover:bg-muted/50 transition-colors">
                <div className={cn(
                  "p-2 rounded-full mt-0.5",
                  activity.action === 'created' || activity.action === 'completed' 
                    ? "bg-success-light" 
                    : activity.action === 'failed' 
                    ? "bg-danger-light" 
                    : "bg-muted"
                )}>
                  {activity.action === 'created' || activity.action === 'completed' ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : activity.action === 'failed' ? (
                    <AlertCircle className="h-4 w-4 text-danger" />
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{activity.title}</p>
                  {activity.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {activity.description}
                    </p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDate(activity.createdAt)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
