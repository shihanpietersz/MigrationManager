'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Server,
  Database,
  ClipboardCheck,
  RefreshCw,
  Settings,
  HardDrive,
  ChevronDown,
  Bot,
  HelpCircle,
  FileText,
  Key,
  LogOut,
  BarChart3,
  Rocket,
  Sparkles,
  CheckCircle,
  ListChecks,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface NavItem {
  name: string;
  icon: React.ElementType;
  href?: string;
  children?: { name: string; href: string; icon?: React.ElementType }[];
}

const insightsNav: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
];

const migrateNav: NavItem[] = [
  {
    name: 'Migrate',
    icon: Rocket,
    children: [
      { name: 'Settings', href: '/settings', icon: Settings },
      { name: 'Machines', href: '/machines', icon: Server },
      { name: 'Data Sources', href: '/data-sources', icon: HardDrive },
      { name: 'Groups', href: '/groups', icon: Database },
      { name: 'Assessments', href: '/assessments', icon: ClipboardCheck },
      { name: 'Replication', href: '/replication', icon: RefreshCw },
      { name: 'Lift & Cleanse', href: '/lift-cleanse', icon: Sparkles },
      { name: 'Validation Tests', href: '/lift-cleanse/tests', icon: CheckCircle },
      { name: 'VM Test Status', href: '/lift-cleanse/vms', icon: ListChecks },
    ],
  },
];

const smartToolsNav: NavItem[] = [
  { name: 'AI Assistant', href: '#', icon: Bot },
];

const bottomNav = [
  { name: 'Help', href: '#', icon: HelpCircle },
  { name: 'Release Notes', href: '#', icon: FileText },
  { name: 'License', href: '#', icon: Key },
  { name: 'Sign Out', href: '#', icon: LogOut },
];

function CollapsibleSection({
  section,
  pathname,
  defaultOpen = false,
}: {
  section: NavItem;
  pathname: string;
  defaultOpen?: boolean;
}) {
  const hasChildren = section.children && section.children.length > 0;
  const isChildActive = section.children?.some(
    (child) => pathname === child.href || pathname.startsWith(child.href + '/')
  );
  const [isOpen, setIsOpen] = useState(isChildActive || defaultOpen);

  if (!hasChildren && section.href) {
    const isActive = pathname === section.href;
    return (
      <Link
        href={section.href}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
          isActive
            ? 'bg-blue-50 text-blue-600'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        )}
      >
        <section.icon className="h-4 w-4 flex-shrink-0" />
        <span>{section.name}</span>
      </Link>
    );
  }

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
          isChildActive
            ? 'bg-blue-50 text-blue-600'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        )}
      >
        <section.icon className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 text-left">{section.name}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>
      {isOpen && hasChildren && (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-gray-200 pl-3">
          {section.children?.map((child) => {
            const isActive =
              pathname === child.href || pathname.startsWith(child.href + '/');
            return (
              <Link
                key={child.name}
                href={child.href}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'text-blue-600 bg-blue-50 font-medium'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                )}
              >
                {child.icon && <child.icon className="h-3.5 w-3.5" />}
                <span>{child.name}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-52 flex-col bg-white border-r border-gray-200">
      {/* Insights Button */}
      <div className="px-3 py-4">
        <Link 
          href="/"
          className="drm-insights-btn flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium"
        >
          <BarChart3 className="h-4 w-4" />
          <span>Insights</span>
        </Link>
      </div>

      {/* Main Navigation */}
      <nav className="sidebar-scroll flex-1 space-y-1 overflow-y-auto px-3">
        {/* Dashboard */}
        {insightsNav.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href!}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              <span>{item.name}</span>
            </Link>
          );
        })}

        {/* Migrate Section - Always Expanded */}
        <div className="space-y-1 pt-2">
          {migrateNav.map((section) => (
            <CollapsibleSection
              key={section.name}
              section={section}
              pathname={pathname}
              defaultOpen={true}
            />
          ))}
        </div>

        {/* Smart Tools Section */}
        <div className="pt-4">
          <div className="px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
              Smart Tools
            </span>
          </div>
          <div className="space-y-1">
            {smartToolsNav.map((item) => (
              <Link
                key={item.name}
                href={item.href!}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                <span>{item.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* Bottom Navigation */}
      <div className="border-t border-gray-200 px-3 py-2">
        {bottomNav.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors',
              item.name === 'Sign Out'
                ? 'text-gray-500 hover:bg-red-50 hover:text-red-600'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
            )}
          >
            <item.icon className="h-4 w-4 flex-shrink-0" />
            <span>{item.name}</span>
          </Link>
        ))}
      </div>

      {/* Version */}
      <div className="px-3 py-3 text-xs text-gray-400">v1.0.0</div>
    </aside>
  );
}
