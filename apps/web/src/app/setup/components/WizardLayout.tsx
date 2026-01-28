'use client';

import { cn } from '@/lib/utils';
import { StepIndicator, StepIndicatorCompact, type Step } from './StepIndicator';

// Wizard steps configuration
export const SETUP_STEPS: Step[] = [
  { id: 'welcome', title: 'Welcome', description: 'Get started' },
  { id: 'credentials', title: 'Credentials', description: 'Azure Service Principal' },
  { id: 'project', title: 'Project', description: 'Azure Migrate' },
  { id: 'verify', title: 'Verify', description: 'Test & Complete' },
];

interface WizardLayoutProps {
  currentStep: number;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Wrapper layout for wizard step content
 * Includes step indicator and card container
 * Uses mm-card from theme for consistent styling
 */
export function WizardLayout({
  currentStep,
  title,
  description,
  children,
  className,
}: WizardLayoutProps) {
  return (
    <div className={cn('space-y-6', className)}>
      {/* Step Indicator - Full on desktop, compact on mobile */}
      <div className="hidden sm:block">
        <StepIndicator steps={SETUP_STEPS} currentStep={currentStep} />
      </div>
      <div className="sm:hidden">
        <StepIndicatorCompact steps={SETUP_STEPS} currentStep={currentStep} />
      </div>

      {/* Content Card - uses mm-card from theme */}
      <div className="mm-card p-8">
        {/* Step Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {description && (
            <p className="mt-2 text-muted-foreground">{description}</p>
          )}
        </div>

        {/* Step Content */}
        {children}
      </div>
    </div>
  );
}

/**
 * Form field wrapper with consistent styling
 * Uses theme colors for labels, errors, and hints
 */
interface FormFieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  htmlFor,
  required = false,
  error,
  hint,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-1 text-danger">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && (
        <p className="text-xs text-danger">{error}</p>
      )}
    </div>
  );
}

/**
 * Form section wrapper for grouping related fields
 */
interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormSection({
  title,
  description,
  children,
  className,
}: FormSectionProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <div>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
}

/**
 * Standard input class for wizard forms
 * Use this for consistent input styling across wizard pages
 */
export const inputClassName = 
  'w-full rounded-lg border border-input bg-card px-4 py-2.5 text-foreground ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 ' +
  'transition-colors duration-200';

export const inputErrorClassName = 'border-danger focus:ring-danger/50';
