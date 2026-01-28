'use client';

import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WizardNavProps {
  onBack?: () => void;
  onNext?: () => void;
  backLabel?: string;
  nextLabel?: string;
  showBack?: boolean;
  showNext?: boolean;
  nextDisabled?: boolean;
  isLoading?: boolean;
  className?: string;
}

/**
 * Navigation buttons for the setup wizard
 * Handles Back/Next navigation between steps
 */
export function WizardNav({
  onBack,
  onNext,
  backLabel = 'Back',
  nextLabel = 'Continue',
  showBack = true,
  showNext = true,
  nextDisabled = false,
  isLoading = false,
  className,
}: WizardNavProps) {
  return (
    <div className={cn('flex items-center justify-between pt-6 border-t border-border mt-8', className)}>
      {/* Back Button */}
      <div>
        {showBack && onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={isLoading}
            className="mm-btn-ghost flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </button>
        )}
      </div>

      {/* Next Button */}
      <div>
        {showNext && onNext && (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled || isLoading}
            className={cn(
              'mm-btn-primary flex items-center gap-2',
              (nextDisabled || isLoading) && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                {nextLabel}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Single action button for final step
 */
interface WizardActionProps {
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
  isLoading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'success';
  className?: string;
}

export function WizardAction({
  onClick,
  label,
  icon,
  isLoading = false,
  disabled = false,
  variant = 'primary',
  className,
}: WizardActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      className={cn(
        'flex items-center justify-center gap-2 w-full',
        variant === 'primary' && 'mm-btn-primary',
        variant === 'success' && 'mm-btn-success',
        (disabled || isLoading) && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Processing...
        </>
      ) : (
        <>
          {icon}
          {label}
        </>
      )}
    </button>
  );
}
