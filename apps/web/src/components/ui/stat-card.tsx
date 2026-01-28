import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export type StatCardVariant = 'primary' | 'success' | 'danger' | 'warning' | 'neutral';

export interface StatCardProps {
  /** The main value to display (number or string) */
  value: string | number;
  /** Primary label below the value */
  label: string;
  /** Optional secondary label */
  sublabel?: string;
  /** Icon component to display */
  icon: React.ReactNode;
  /** Color variant */
  variant?: StatCardVariant;
  /** Optional progress value (0-100) */
  progress?: number;
  /** Optional link - makes the card clickable */
  href?: string;
  /** Additional class names */
  className?: string;
}

const variantStyles: Record<StatCardVariant, { icon: string; progress: string }> = {
  primary: {
    icon: 'bg-primary-light text-primary',
    progress: 'bg-primary',
  },
  success: {
    icon: 'bg-success-light text-success',
    progress: 'bg-success',
  },
  danger: {
    icon: 'bg-danger-light text-danger',
    progress: 'bg-danger',
  },
  warning: {
    icon: 'bg-warning-light text-warning',
    progress: 'bg-warning',
  },
  neutral: {
    icon: 'bg-muted text-muted-foreground',
    progress: 'bg-muted-foreground',
  },
};

export function StatCard({
  value,
  label,
  sublabel,
  icon,
  variant = 'primary',
  progress,
  href,
  className,
}: StatCardProps) {
  const styles = variantStyles[variant];

  const content = (
    <>
      {/* Header with value and icon */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col">
          <span className="text-3xl font-bold text-foreground">{value}</span>
          {sublabel && (
            <span className="text-sm text-muted-foreground mt-0.5">{sublabel}</span>
          )}
        </div>
        <div className={cn('p-2.5 rounded-full', styles.icon)}>
          {icon}
        </div>
      </div>

      {/* Label */}
      <p className="text-sm text-muted-foreground mt-2">{label}</p>

      {/* Progress bar */}
      {typeof progress === 'number' && (
        <div className="mt-4">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', styles.progress)}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}
    </>
  );

  const cardClasses = cn(
    'block bg-card rounded-xl border border-card-border p-6 transition-all duration-200',
    href && 'hover:shadow-lg hover:border-primary/30 cursor-pointer',
    className
  );

  if (href) {
    return (
      <Link href={href} className={cardClasses}>
        {content}
      </Link>
    );
  }

  return <div className={cardClasses}>{content}</div>;
}

/**
 * Grid container for stat cards
 * Use this to maintain consistent spacing and responsive layout
 */
export function StatCardGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {children}
    </div>
  );
}
