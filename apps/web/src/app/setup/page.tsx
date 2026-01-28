'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { WizardLayout, WizardAction } from './components';

/**
 * Step 1: Welcome Page
 * Introduces the setup wizard and lists prerequisites
 * Uses theme: mm-info-card, mm-card-interactive, mm-icon-primary
 */
export default function SetupWelcomePage() {
  const router = useRouter();

  const handleGetStarted = () => {
    router.push('/setup/credentials');
  };

  return (
    <WizardLayout
      currentStep={0}
      title="Welcome to Migration Manager"
      description="Let's get your Azure environment configured. This setup wizard will guide you through the initial configuration."
    >
      {/* Introduction - uses mm-info-card pattern */}
      <div className="space-y-8">
        <div className="mm-info-card">
          <p className="text-sm text-foreground">
            Before you begin, make sure you have access to your Azure subscription and have created 
            an App Registration with the required permissions.
          </p>
        </div>

        {/* Prerequisites Checklist */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground">Prerequisites</h3>
          
          <div className="grid gap-4 sm:grid-cols-2">
            <PrerequisiteItem
              iconSrc="/assets/icons/azure-subscription.svg"
              title="Azure Subscription"
              description="Active Azure subscription with Azure Migrate project"
            />
            <PrerequisiteItem
              iconSrc="/assets/icons/azure-app-registration.svg"
              title="App Registration"
              description="Azure AD App Registration with API permissions"
            />
            <PrerequisiteItem
              iconSrc="/assets/icons/azure-migrate.svg"
              title="Azure Migrate Project"
              description="Existing Azure Migrate project with VMware discovery"
            />
            <PrerequisiteItem
              iconSrc="/assets/icons/azure-resource-group.svg"
              title="Resource Group"
              description="Resource group containing your migration resources"
            />
          </div>
        </div>

        {/* Get Started Button */}
        <div className="pt-6">
          <WizardAction
            onClick={handleGetStarted}
            label="Get Started"
            variant="primary"
          />
        </div>

        {/* Help Link */}
        <p className="text-center text-sm text-muted-foreground">
          Need help? Check the{' '}
          <a
            href="https://learn.microsoft.com/en-us/azure/migrate/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Azure Migrate documentation
          </a>
        </p>
      </div>
    </WizardLayout>
  );
}

function PrerequisiteItem({
  iconSrc,
  title,
  description,
}: {
  iconSrc: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mm-card-interactive flex items-start gap-4 p-4">
      {/* Icon container - uses mm-icon-primary pattern */}
      <div className="mm-icon-container mm-icon-primary flex-shrink-0">
        <Image
          src={iconSrc}
          alt={title}
          width={28}
          height={28}
          className="h-7 w-7"
        />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-foreground">{title}</h4>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
    </div>
  );
}
