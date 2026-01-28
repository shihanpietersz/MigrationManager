'use client';

import Image from 'next/image';
import Link from 'next/link';

/**
 * Setup Wizard Layout
 * Minimal layout without sidebar - just logo and centered content
 * Uses theme colors: bg-background, bg-card, border-border, text-muted-foreground
 */
export default function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {/* Minimal Header - uses mm-header-border for consistent styling */}
      <header className="mm-header-border bg-card">
        <div className="flex h-14 items-center px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/assets/images/logo-dark.svg"
              alt="Migration Manager"
              width={130}
              height={32}
              className="h-7 w-auto"
              priority
            />
          </Link>
          <div className="ml-4 h-6 w-px bg-border" />
          <span className="ml-4 text-sm font-medium text-muted-foreground">
            Initial Setup
          </span>
        </div>
      </header>

      {/* Main Content - Full Width */}
      <main className="flex min-h-[calc(100vh-3.5rem)] items-start justify-center px-6 py-8">
        <div className="w-full max-w-4xl">
          {children}
        </div>
      </main>
    </div>
  );
}
