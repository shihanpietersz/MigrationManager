'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Step {
  id: string;
  title: string;
  description?: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number;
  className?: string;
}

/**
 * Visual step indicator for the setup wizard
 * Shows progress through the wizard steps
 * Uses theme colors: success (completed), primary (current), muted (upcoming)
 */
export function StepIndicator({ steps, currentStep, className }: StepIndicatorProps) {
  return (
    <nav aria-label="Progress" className={cn('mb-8', className)}>
      <ol className="flex items-center justify-center">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;

          return (
            <li key={step.id} className="flex items-center">
              {/* Step Circle */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-200',
                    isCompleted && 'border-success bg-success text-success-foreground',
                    isCurrent && 'border-primary bg-primary text-primary-foreground',
                    !isCompleted && !isCurrent && 'border-border bg-card text-muted-foreground'
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" strokeWidth={3} />
                  ) : (
                    <span className="text-sm font-semibold">{index + 1}</span>
                  )}
                </div>
                {/* Step Label */}
                <div className="mt-2 text-center">
                  <span
                    className={cn(
                      'text-sm font-medium',
                      isCompleted && 'text-success',
                      isCurrent && 'text-primary',
                      !isCompleted && !isCurrent && 'text-muted-foreground'
                    )}
                  >
                    {step.title}
                  </span>
                </div>
              </div>

              {/* Connector Line - uses theme stepper line pattern */}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'mx-6 h-0.5 w-24 transition-all duration-200',
                    index < currentStep ? 'bg-success' : 'bg-border'
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Compact step indicator for mobile/narrow layouts
 */
export function StepIndicatorCompact({ steps, currentStep, className }: StepIndicatorProps) {
  return (
    <div className={cn('mb-6 text-center', className)}>
      <span className="text-sm text-muted-foreground">
        Step {currentStep + 1} of {steps.length}
      </span>
      <div className="mt-2 flex justify-center gap-1.5">
        {steps.map((_, index) => (
          <div
            key={index}
            className={cn(
              'h-1.5 w-8 rounded-full transition-all duration-200',
              index < currentStep && 'bg-success',
              index === currentStep && 'bg-primary',
              index > currentStep && 'bg-muted'
            )}
          />
        ))}
      </div>
    </div>
  );
}
