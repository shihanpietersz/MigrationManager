'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { useSetupStatus } from '@/hooks/useSetupStatus';

/**
 * Configuration Guard Component
 * Checks if initial setup is complete and redirects to setup wizard if not
 */
function ConfigurationGuard({ children }: { children: React.ReactNode }) {
  const { isConfigured, isLoading, error } = useSetupStatus();
  const router = useRouter();

  useEffect(() => {
    // Redirect to setup if not configured (and not loading/error)
    if (!isLoading && !isConfigured && !error) {
      router.push('/setup');
    }
  }, [isConfigured, isLoading, error, router]);

  // Show loading state while checking configuration
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Checking configuration...</p>
        </div>
      </div>
    );
  }

  // If there's an error checking config, show the dashboard anyway
  // (better UX than blocking the entire app)
  if (error) {
    console.warn('Error checking setup status:', error);
    return <>{children}</>;
  }

  // If not configured, show loading while redirect happens
  if (!isConfigured) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Redirecting to setup...</p>
        </div>
      </div>
    );
  }

  // Configuration is complete, render children
  return <>{children}</>;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConfigurationGuard>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </ConfigurationGuard>
  );
}
