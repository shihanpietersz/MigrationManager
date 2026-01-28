import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  /** Main page title */
  title: string;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Optional actions to display on the right side */
  actions?: React.ReactNode;
  /** Additional class names */
  className?: string;
}

/**
 * Consistent page header component
 * Use at the top of each page for uniform styling
 */
export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between mb-6', className)}>
      <div>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {subtitle && (
          <p className="text-muted-foreground mt-1">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}

/**
 * Section header for use within pages
 * Smaller than PageHeader, used for content sections
 */
export interface SectionHeaderProps {
  /** Section title */
  title: string;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Optional actions to display on the right side */
  actions?: React.ReactNode;
  /** Additional class names */
  className?: string;
}

export function SectionHeader({ title, subtitle, actions, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between mb-4', className)}>
      <div>
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Card section header - for use inside cards
 */
export interface CardHeaderProps {
  /** Card title */
  title: string;
  /** Optional actions to display on the right side */
  actions?: React.ReactNode;
  /** Additional class names */
  className?: string;
}

export function CardHeader({ title, actions, className }: CardHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-6 py-4 border-b border-card-border',
        className
      )}
    >
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {actions}
    </div>
  );
}
