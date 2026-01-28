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

// Logo is stored locally in public/assets/images/
// No external network requests for assets

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
    <header className="mm-header-border bg-card">
      <nav className="flex h-12 items-center justify-between px-4">
        <div className="flex items-center gap-4">
          {/* Logo - local asset, no external requests */}
          <Link href="/" className="flex items-center">
            <Image
              src="/assets/images/logo-dark.svg"
              alt="Dr Migrate"
              width={130}
              height={32}
              className="h-7 w-auto"
              priority
            />
          </Link>
          <div className="h-6 w-px bg-border" />
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
                        ? 'border-success/30 bg-success-light hover:bg-success-light/80'
                        : isCurrent
                        ? 'border-primary/30 bg-primary-light hover:bg-primary-light/80'
                        : step.isMigrate
                        ? 'border-primary/30 bg-primary-light hover:bg-primary-light/80'
                        : step.isCleanse
                        ? 'border-success/30 bg-success-light hover:bg-success-light/80'
                        : 'border-border bg-card hover:bg-muted'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-full text-xs transition-all',
                        isCompleted
                          ? 'bg-success text-success-foreground'
                          : isCurrent
                          ? 'bg-primary text-primary-foreground'
                          : step.isMigrate
                          ? 'bg-primary text-primary-foreground'
                          : step.isCleanse
                          ? 'bg-success text-success-foreground'
                          : 'bg-muted text-muted-foreground'
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
                          ? 'text-success' 
                          : isCurrent 
                          ? 'text-primary'
                          : step.isMigrate
                          ? 'text-primary'
                          : step.isCleanse
                          ? 'text-success'
                          : 'text-muted-foreground'
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
                      index < currentStepIndex ? 'bg-success' : 'bg-border'
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* User Menu */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-foreground">Azure-Tenant-001</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 hover:bg-muted"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-muted">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <span className="text-sm text-foreground">Admin</span>
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
