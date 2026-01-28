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
  FileCode,
  HelpCircle,
  LogOut,
  Sparkles,
  CheckCircle,
  ListChecks,
  BarChart2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface NavItem {
  name: string;
  icon: React.ElementType;
  href?: string;
  children?: { name: string; href: string; icon?: React.ElementType }[];
}

// Main navigation matching the screenshot design
const mainNav: NavItem[] = [
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'Exec Dashboard', href: '/exec-dashboard', icon: BarChart2 },
  {
    name: 'Scripts',
    icon: FileCode,
    children: [
      { name: 'Lift & Cleanse', href: '/lift-cleanse', icon: Sparkles },
      { name: 'Script Library', href: '/lift-cleanse/scripts', icon: FileCode },
      { name: 'Validation Tests', href: '/lift-cleanse/tests', icon: CheckCircle },
      { name: 'VM Status', href: '/lift-cleanse/vms', icon: ListChecks },
    ],
  },
  { name: 'Settings', href: '/settings', icon: Settings },
];

// Migrate section - expandable
const migrateNav: NavItem[] = [
  {
    name: 'Migrate',
    icon: RefreshCw,
    children: [
      { name: 'Machines', href: '/machines', icon: Server },
      { name: 'Data Sources', href: '/data-sources', icon: HardDrive },
      { name: 'Groups', href: '/groups', icon: Database },
      { name: 'Assessments', href: '/assessments', icon: ClipboardCheck },
      { name: 'Replication', href: '/replication', icon: RefreshCw },
    ],
  },
];

const bottomNav = [
  { name: 'Help', href: '#', icon: HelpCircle },
  { name: 'Sign Out', href: '#', icon: LogOut },
];

function NavLink({
  item,
  pathname,
}: {
  item: { name: string; href: string; icon?: React.ElementType };
  pathname: string;
}) {
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-200',
        isActive
          ? 'bg-sidebar-active-bg text-sidebar-active font-medium'
          : 'text-sidebar-muted hover:bg-muted hover:text-foreground'
      )}
    >
      {Icon && <Icon className="h-4 w-4 flex-shrink-0" />}
      <span>{item.name}</span>
    </Link>
  );
}

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
    return <NavLink item={{ ...section, href: section.href }} pathname={pathname} />;
  }

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-200',
          isChildActive
            ? 'bg-sidebar-active-bg text-sidebar-active font-medium'
            : 'text-sidebar-muted hover:bg-muted hover:text-foreground'
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
        <div className="ml-4 mt-1 space-y-0.5 border-l border-sidebar-border pl-3">
          {section.children?.map((child) => {
            const isActive =
              pathname === child.href || pathname.startsWith(child.href + '/');
            return (
              <Link
                key={child.name}
                href={child.href}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors duration-200',
                  isActive
                    ? 'text-sidebar-active bg-sidebar-active-bg font-medium'
                    : 'text-sidebar-muted hover:text-foreground hover:bg-muted'
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
    <aside className="flex w-56 flex-col bg-sidebar-bg border-r border-sidebar-border">
      {/* Logo/Brand Area */}
      <div className="px-4 py-4 border-b border-sidebar-border">
        <span className="text-lg font-semibold text-foreground">Migration Manager</span>
      </div>

      {/* Main Navigation */}
      <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-4">
        {/* Primary Navigation */}
        <div className="space-y-1">
          {mainNav.map((item) =>
            item.children ? (
              <CollapsibleSection
                key={item.name}
                section={item}
                pathname={pathname}
                defaultOpen={false}
              />
            ) : (
              <NavLink
                key={item.name}
                item={{ ...item, href: item.href! }}
                pathname={pathname}
              />
            )
          )}
        </div>

        {/* Migrate Section */}
        <div className="mt-6 pt-4 border-t border-sidebar-border">
          <div className="px-3 pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">
              Migration
            </span>
          </div>
          <div className="space-y-1">
            {migrateNav.map((section) => (
              <CollapsibleSection
                key={section.name}
                section={section}
                pathname={pathname}
                defaultOpen={true}
              />
            ))}
          </div>
        </div>
      </nav>

      {/* Bottom Navigation */}
      <div className="border-t border-sidebar-border px-3 py-3">
        {bottomNav.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-200',
              item.name === 'Sign Out'
                ? 'text-sidebar-muted hover:bg-danger-light hover:text-danger'
                : 'text-sidebar-muted hover:bg-muted hover:text-foreground'
            )}
          >
            <item.icon className="h-4 w-4 flex-shrink-0" />
            <span>{item.name}</span>
          </Link>
        ))}
      </div>

      {/* Version */}
      <div className="px-4 py-3 text-xs text-sidebar-muted border-t border-sidebar-border">
        v1.0.0
      </div>
    </aside>
  );
}
