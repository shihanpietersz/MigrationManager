'use client';

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
} from 'lucide-react';
import Link from 'next/link';
import { machinesApi, groupsApi, assessmentsApi, replicationApi, settingsApi } from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';

export default function DashboardPage() {
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
      {/* Key Metrics and Quick Actions Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Key Metrics */}
        <div className="lg:col-span-2">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Key Metrics</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Data Health Errors */}
            <Link
              href="/machines"
              className="drm-card-metric group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-3xl font-bold text-gray-900">{stats.healthErrors}</span>
                <div className="p-2 rounded-full bg-red-50">
                  <XCircle className="h-5 w-5 text-red-400" />
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-2">Data Health Errors</p>
            </Link>

            {/* Servers Discovered */}
            <Link
              href="/machines"
              className="drm-card-metric group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-3xl font-bold text-gray-900">{stats.machines}</span>
                <div className="p-2 rounded-full bg-blue-50">
                  <Server className="h-5 w-5 text-blue-500" />
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-2">Servers Discovered</p>
            </Link>

            {/* Total Storage */}
            <Link
              href="/machines"
              className="drm-card-metric group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-3xl font-bold text-gray-900">{stats.totalStorage}</span>
                <div className="p-2 rounded-full bg-purple-50">
                  <HardDrive className="h-5 w-5 text-purple-500" />
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-2">Total Storage (TB)</p>
            </Link>

            {/* Groups Created */}
            <Link
              href="/groups"
              className="drm-card-metric group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-3xl font-bold text-gray-900">{stats.appMapped}</span>
                <div className="p-2 rounded-full bg-indigo-50">
                  <Database className="h-5 w-5 text-indigo-500" />
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-2">Groups Created</p>
            </Link>

            {/* Assessments */}
            <Link
              href="/assessments"
              className="drm-card-metric group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-3xl font-bold text-gray-900">{stats.assessments}</span>
                <div className="p-2 rounded-full bg-violet-50">
                  <ClipboardCheck className="h-5 w-5 text-violet-500" />
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-2">Assessments</p>
            </Link>

            {/* Replicating */}
            <Link
              href="/replication"
              className="drm-card-metric group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-3xl font-bold text-gray-900">{stats.replicating}</span>
                <div className="p-2 rounded-full bg-cyan-50">
                  <RefreshCw className="h-5 w-5 text-cyan-500" />
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-2">Replicating VMs</p>
            </Link>
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link
              href="/machines"
              className="drm-btn-primary w-full flex items-center justify-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Data Sync
            </Link>
            <Link
              href="/settings"
              className="drm-btn-secondary w-full flex items-center justify-center gap-2"
            >
              <Settings className="h-4 w-4" />
              Azure Settings
            </Link>
            <Link
              href="/replication"
              className="drm-btn-tertiary w-full flex items-center justify-center gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Replication Dashboard
            </Link>
          </div>

          {/* Azure Config Status Card */}
          <div className={cn(
            "mt-4 rounded-xl p-5",
            isAzureConfigured 
              ? "drm-license-card"
              : "bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200"
          )}>
            <h3 className={cn(
              "text-lg font-semibold mb-2",
              isAzureConfigured ? "drm-gradient-text" : "text-amber-700"
            )}>
              {isAzureConfigured ? 'Azure Connected' : 'Setup Required'}
            </h3>
            <p className={cn(
              "text-sm mb-3",
              isAzureConfigured ? "text-gray-600" : "text-amber-600"
            )}>
              {isAzureConfigured 
                ? 'Your Azure Migrate project is connected and ready.' 
                : 'Configure Azure settings to start migrating.'}
            </p>
            <Link
              href="/settings"
              className={cn(
                "inline-flex items-center text-sm font-medium",
                isAzureConfigured ? "text-blue-600 hover:text-purple-600" : "text-amber-700"
              )}
            >
              {isAzureConfigured ? 'View Settings' : 'Configure Now'}
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </div>
        </div>
      </div>

      {/* Migration Workflow */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Migration Workflow</h2>
        <p className="text-sm text-gray-500 mb-6">
          Your migration journey is tracked here, complete each stage to move forward.
        </p>

        {/* Progress Bar */}
        <div className="relative mb-8">
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full drm-progress-gradient rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div 
            className="absolute top-0 -mt-1 text-white text-xs font-medium px-2 py-1 rounded"
            style={{ 
              right: 0,
              background: 'linear-gradient(90deg, #4F9CF9 0%, #8B5CF6 100%)'
            }}
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
                "drm-workflow-card group",
                step.completed 
                  ? "drm-workflow-card-completed" 
                  : index === completedSteps 
                  ? "border-2 border-purple-300 shadow-lg bg-purple-50/30" 
                  : "drm-workflow-card-pending"
              )}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full",
                  step.completed 
                    ? "bg-blue-100 text-blue-600" 
                    : index === completedSteps 
                    ? "bg-purple-100 text-purple-600" 
                    : "bg-gray-100 text-gray-400"
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
                    ? "text-blue-700" 
                    : index === completedSteps 
                    ? "text-purple-700" 
                    : "text-gray-600"
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
                      item.completed ? "text-blue-600" : "text-gray-500"
                    )}
                  >
                    {item.completed ? (
                      <Check className="h-3.5 w-3.5 text-blue-500" strokeWidth={3} />
                    ) : (
                      <Circle className="h-2 w-2 fill-current text-gray-300" />
                    )}
                    <span className={cn(
                      item.completed && "text-blue-600 hover:underline"
                    )}>
                      {item.name}
                    </span>
                  </div>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl border border-gray-100">
        <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          {activities.length > 0 && (
            <Link
              href="#"
              className="text-sm text-blue-600 hover:text-purple-600 hover:underline"
            >
              View all →
            </Link>
          )}
        </div>
        <div className="divide-y divide-gray-50">
          {activities.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Clock className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 font-medium">No recent activity</p>
              <p className="text-sm text-gray-400 mt-1">Activity will appear here as you use the app</p>
            </div>
          ) : (
            activities.slice(0, 5).map((activity) => (
              <div key={activity.id} className="flex items-start gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                <div className={cn(
                  "p-2 rounded-full mt-0.5",
                  activity.action === 'created' || activity.action === 'completed' 
                    ? "bg-blue-50" 
                    : activity.action === 'failed' 
                    ? "bg-red-50" 
                    : "bg-gray-50"
                )}>
                  {activity.action === 'created' || activity.action === 'completed' ? (
                    <CheckCircle2 className="h-4 w-4 text-blue-500" />
                  ) : activity.action === 'failed' ? (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    <Clock className="h-4 w-4 text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{activity.title}</p>
                  {activity.description && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                      {activity.description}
                    </p>
                  )}
                </div>
                <p className="text-xs text-gray-400 whitespace-nowrap">
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
