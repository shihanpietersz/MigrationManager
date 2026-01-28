'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, type SetupStatus } from '@/lib/api';

/**
 * Hook to check if initial setup is complete
 * Used by the ConfigurationGuard to redirect unconfigured users to the setup wizard
 */
export function useSetupStatus() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['setup-status'],
    queryFn: () => settingsApi.getSetupStatus(),
    staleTime: 60000, // Cache for 1 minute
    retry: 1, // Only retry once on failure
  });

  return {
    isConfigured: data?.data?.isConfigured ?? false,
    isLoading,
    error,
    missingFields: data?.data?.missingFields ?? [],
    completedAt: data?.data?.completedAt ?? null,
    refetch,
  };
}

/**
 * Hook to mark setup as complete
 */
export function useCompleteSetup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => settingsApi.completeSetup(),
    onSuccess: () => {
      // Invalidate setup status to trigger re-check
      queryClient.invalidateQueries({ queryKey: ['setup-status'] });
      // Also invalidate azure config since it's related
      queryClient.invalidateQueries({ queryKey: ['azure-config'] });
    },
  });
}

/**
 * Type export for components that need it
 */
export type { SetupStatus };
