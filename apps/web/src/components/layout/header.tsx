'use client';

import { usePathname } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { User, Check, Circle, Rocket, LogOut, Settings, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import DrMigrateLogo from '@/components/images/logo-dark.svg';

const workflowSteps = [
  { name: 'Setup', paths: ['/settings'], href: '/settings' },
  { name: 'Inventory', paths: ['/machines', '/data-sources'], href: '/machines' },
  { name: 'Goals', paths: ['/groups'], href: '/groups' },
  { name: 'Planning', paths: ['/assessments'], href: '/assessments' },
  { name: 'Migrate', paths: ['/replication'], href: '/replication', isMigrate: true },
  { name: 'Cleanse', paths: ['/lift-cleanse'], href: '/lift-cleanse', isCleanse: true },
];

export function Header() {
  const pathname = usePathname();

  // Determine current and completed steps based on pathname
  const getCurrentStepIndex = () => {
    for (let i = workflowSteps.length - 1; i >= 0; i--) {
      if (workflowSteps[i].paths.some((p) => pathname.startsWith(p))) {
        return i;
      }
    }
    return -1;
  };

  const currentStepIndex = getCurrentStepIndex();

  return (
    <header className="drm-gradient-border bg-white">
      <nav className="flex h-12 items-center justify-between px-4">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <Image
              src={DrMigrateLogo}
              alt="Dr Migrate"
              width={130}
              height={32}
              className="h-7 w-auto"
              priority
            />
          </Link>
          <div className="h-6 w-px bg-gray-200" />
        </div>

        {/* Workflow Progress Steps - Centered */}
        <div className="flex items-center gap-0">
          {workflowSteps.map((step, index) => {
            const isCompleted = index < currentStepIndex;
            const isCurrent = index === currentStepIndex;

            return (
              <div key={step.name} className="flex items-center">
                <Link 
                  href={step.href}
                  className="group flex items-center"
                >
                  <div
                    className={cn(
                      'flex items-center gap-2 rounded-full border px-4 py-1.5 transition-all',
                      isCompleted
                        ? 'border-blue-200 bg-blue-50 hover:bg-blue-100'
                        : isCurrent
                        ? 'border-purple-200 bg-purple-50 hover:bg-purple-100'
                        : step.isMigrate
                        ? 'border-purple-200 bg-purple-50 hover:bg-purple-100'
                        : step.isCleanse
                        ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-full text-xs transition-all',
                        isCompleted
                          ? 'bg-blue-500 text-white'
                          : isCurrent
                          ? 'bg-purple-500 text-white'
                          : step.isMigrate
                          ? 'bg-purple-500 text-white'
                          : step.isCleanse
                          ? 'bg-emerald-500 text-white'
                          : 'bg-gray-100 text-gray-400'
                      )}
                    >
                      {isCompleted ? (
                        <Check className="h-3 w-3" strokeWidth={3} />
                      ) : step.isMigrate ? (
                        <Rocket className="h-3 w-3" />
                      ) : step.isCleanse ? (
                        <Sparkles className="h-3 w-3" />
                      ) : (
                        <Circle className="h-2 w-2 fill-current" />
                      )}
                    </div>
                    <span
                      className={cn(
                        'text-sm font-medium transition-colors',
                        isCompleted 
                          ? 'text-blue-700' 
                          : isCurrent 
                          ? 'text-purple-700'
                          : step.isMigrate
                          ? 'text-purple-700'
                          : step.isCleanse
                          ? 'text-emerald-700'
                          : 'text-gray-600'
                      )}
                    >
                      {step.name}
                    </span>
                  </div>
                </Link>
                {index < workflowSteps.length - 1 && (
                  <div
                    className={cn(
                      'mx-1 h-px w-4',
                      index < currentStepIndex ? 'bg-blue-400' : 'bg-gray-200'
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* User Menu */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">Azure-Tenant-001</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1.5 hover:bg-gray-50"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-gray-50">
                  <User className="h-3.5 w-3.5 text-gray-500" />
                </div>
                <span className="text-sm text-gray-700">Admin</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="font-medium">Azure Administrator</span>
                  <span className="text-xs text-muted-foreground">
                    admin@azure.com
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive">
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
    </header>
  );
}
