'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CollapsibleVariant = 'primary' | 'success' | 'danger' | 'warning' | 'neutral';

export interface CollapsibleSectionProps {
  /** Section title */
  title: string;
  /** Optional description below title */
  description?: string;
  /** Icon component to display */
  icon?: React.ReactNode;
  /** Color variant for the icon */
  variant?: CollapsibleVariant;
  /** Whether the section is expanded by default */
  defaultExpanded?: boolean;
  /** Controlled expanded state */
  expanded?: boolean;
  /** Callback when expanded state changes */
  onExpandedChange?: (expanded: boolean) => void;
  /** Content to render inside the section */
  children: React.ReactNode;
  /** Optional badge/tag to show next to title */
  badge?: React.ReactNode;
  /** Optional actions to show in the header (right side) */
  headerActions?: React.ReactNode;
  /** Optional footer content (always visible when expanded) */
  footer?: React.ReactNode;
  /** Additional class names for the container */
  className?: string;
}

const variantStyles: Record<CollapsibleVariant, string> = {
  primary: 'mm-icon-primary',
  success: 'mm-icon-success',
  danger: 'mm-icon-danger',
  warning: 'mm-icon-warning',
  neutral: 'mm-icon-neutral',
};

/**
 * CollapsibleSection - A reusable collapsible/accordion section component
 * 
 * Features:
 * - Expand/collapse with smooth animation
 * - Optional icon with color variants
 * - Optional badge and header actions
 * - Optional footer that appears when expanded
 * - Works controlled or uncontrolled
 * 
 * @example
 * ```tsx
 * <CollapsibleSection
 *   title="Azure Service Principal"
 *   description="Credentials for accessing Azure APIs"
 *   icon={<Key className="h-5 w-5" />}
 *   variant="primary"
 *   defaultExpanded={true}
 * >
 *   <div className="p-6">Content here</div>
 * </CollapsibleSection>
 * ```
 */
export function CollapsibleSection({
  title,
  description,
  icon,
  variant = 'primary',
  defaultExpanded = false,
  expanded: controlledExpanded,
  onExpandedChange,
  children,
  badge,
  headerActions,
  footer,
  className,
}: CollapsibleSectionProps) {
  const [internalExpanded, setInternalExpanded] = React.useState(defaultExpanded);
  
  // Support both controlled and uncontrolled usage
  const isControlled = controlledExpanded !== undefined;
  const isExpanded = isControlled ? controlledExpanded : internalExpanded;

  const handleToggle = () => {
    const newExpanded = !isExpanded;
    if (!isControlled) {
      setInternalExpanded(newExpanded);
    }
    onExpandedChange?.(newExpanded);
  };

  return (
    <div
      className={cn(
        'mm-section-card',
        variant === 'danger' && 'border-danger/30',
        className
      )}
    >
      {/* Header - Always visible, clickable to toggle */}
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'w-full flex items-center gap-3 px-6 py-4 text-left transition-colors',
          'hover:bg-muted/50',
          isExpanded && 'border-b border-card-border bg-muted/30'
        )}
      >
        {/* Icon */}
        {icon && (
          <div className={cn('mm-icon-container flex-shrink-0', variantStyles[variant])}>
            {icon}
          </div>
        )}

        {/* Title and description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground">{title}</h3>
            {badge}
          </div>
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>

        {/* Header actions (don't trigger collapse) */}
        {headerActions && (
          <div 
            className="flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {headerActions}
          </div>
        )}

        {/* Chevron indicator */}
        <ChevronDown
          className={cn(
            'h-5 w-5 text-muted-foreground transition-transform duration-200 flex-shrink-0',
            isExpanded && 'rotate-180'
          )}
        />
      </button>

      {/* Collapsible content */}
      <div
        className={cn(
          'grid transition-all duration-200 ease-in-out',
          isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          {children}
          
          {/* Footer - inside the collapsible area */}
          {footer && isExpanded && (
            <div className="border-t border-card-border bg-muted/20">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * CollapsibleSectionContent - Wrapper for content inside CollapsibleSection
 * Provides consistent padding
 */
export function CollapsibleSectionContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('p-6 space-y-4', className)}>
      {children}
    </div>
  );
}

/**
 * CollapsibleSectionFooter - Footer content for CollapsibleSection
 * Typically used for action buttons
 */
export function CollapsibleSectionFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between px-6 py-4', className)}>
      {children}
    </div>
  );
}

/**
 * Container for multiple collapsible sections
 * Provides consistent spacing between sections
 */
export function CollapsibleSectionGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-4', className)}>
      {children}
    </div>
  );
}
