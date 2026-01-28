'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { HelpCircle } from 'lucide-react';
import { 
  WizardLayout, 
  FormField, 
  FormSection, 
  WizardNav,
  inputClassName,
  inputErrorClassName,
} from '../components';
import { cn } from '@/lib/utils';

// Storage key for wizard data
const STORAGE_KEY = 'setup-wizard-data';

interface ProjectData {
  subscriptionId: string;
  resourceGroup: string;
  migrateProjectName: string;
}

// GUID validation regex
const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Step 3: Azure Migrate Project Page
 * Collects Azure subscription and project details
 */
export default function SetupProjectPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<ProjectData>({
    subscriptionId: '',
    resourceGroup: '',
    migrateProjectName: '',
  });
  const [errors, setErrors] = useState<Partial<ProjectData>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Load saved data on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        setFormData({
          subscriptionId: data.subscriptionId || '',
          resourceGroup: data.resourceGroup || '',
          migrateProjectName: data.migrateProjectName || '',
        });
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Validate a single field
  const validateField = (name: keyof ProjectData, value: string): string | undefined => {
    if (!value.trim()) {
      return 'This field is required';
    }
    if (name === 'subscriptionId' && !GUID_REGEX.test(value.trim())) {
      return 'Must be a valid GUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)';
    }
    if (name === 'resourceGroup' && !/^[a-zA-Z0-9._-]+$/.test(value.trim())) {
      return 'Resource group name can only contain letters, numbers, periods, underscores, and hyphens';
    }
    if (name === 'migrateProjectName' && !/^[a-zA-Z0-9-]+$/.test(value.trim())) {
      return 'Project name can only contain letters, numbers, and hyphens';
    }
    return undefined;
  };

  // Validate all fields
  const validateAll = (): boolean => {
    const newErrors: Partial<ProjectData> = {};
    let isValid = true;

    (Object.keys(formData) as Array<keyof ProjectData>).forEach((key) => {
      const error = validateField(key, formData[key]);
      if (error) {
        newErrors[key] = error;
        isValid = false;
      }
    });

    setErrors(newErrors);
    setTouched({ subscriptionId: true, resourceGroup: true, migrateProjectName: true });
    return isValid;
  };

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    
    // Clear error when user types
    if (touched[name]) {
      const error = validateField(name as keyof ProjectData, value);
      setErrors((prev) => ({ ...prev, [name]: error }));
    }
  };

  // Handle blur for validation
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    const error = validateField(name as keyof ProjectData, value);
    setErrors((prev) => ({ ...prev, [name]: error }));
  };

  // Save to session storage and navigate
  const saveAndNavigate = (path: string) => {
    try {
      const existing = sessionStorage.getItem(STORAGE_KEY);
      const data = existing ? JSON.parse(existing) : {};
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, ...formData }));
    } catch {
      // Ignore storage errors
    }
    router.push(path);
  };

  const handleBack = () => {
    saveAndNavigate('/setup/credentials');
  };

  const handleNext = () => {
    if (validateAll()) {
      saveAndNavigate('/setup/verify');
    }
  };

  return (
    <WizardLayout
      currentStep={2}
      title="Azure Migrate Project"
      description="Enter your Azure subscription and Azure Migrate project details."
    >
      <div className="space-y-6">
        {/* Info Banner - uses mm-info-card pattern */}
        <div className="mm-info-card flex items-start gap-3">
          <HelpCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-foreground">Find your Azure Migrate project</p>
            <p className="text-muted-foreground mt-1">
              Go to{' '}
              <a
                href="https://portal.azure.com/#blade/Microsoft_Azure_Migrate/AmhResourceMenuBlade/overview"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Azure Portal &gt; Azure Migrate
              </a>
              {' '}to find your project details.
            </p>
          </div>
        </div>

        <FormSection
          title="Subscription Details"
          description="Your Azure subscription information"
        >
          {/* Subscription ID */}
          <FormField
            label="Subscription ID"
            htmlFor="subscriptionId"
            required
            error={touched.subscriptionId ? errors.subscriptionId : undefined}
            hint="Found in Azure Portal > Subscriptions"
          >
            <input
              type="text"
              id="subscriptionId"
              name="subscriptionId"
              value={formData.subscriptionId}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className={cn(
                inputClassName,
                touched.subscriptionId && errors.subscriptionId && inputErrorClassName
              )}
            />
          </FormField>

          {/* Resource Group */}
          <FormField
            label="Resource Group"
            htmlFor="resourceGroup"
            required
            error={touched.resourceGroup ? errors.resourceGroup : undefined}
            hint="The resource group containing your Azure Migrate project"
          >
            <input
              type="text"
              id="resourceGroup"
              name="resourceGroup"
              value={formData.resourceGroup}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="my-migration-rg"
              className={cn(
                inputClassName,
                touched.resourceGroup && errors.resourceGroup && inputErrorClassName
              )}
            />
          </FormField>
        </FormSection>

        <FormSection
          title="Project Settings"
          description="Azure Migrate project configuration"
        >
          {/* Migrate Project Name */}
          <FormField
            label="Azure Migrate Project Name"
            htmlFor="migrateProjectName"
            required
            error={touched.migrateProjectName ? errors.migrateProjectName : undefined}
            hint="The name of your Azure Migrate project (region is determined by the project)"
          >
            <input
              type="text"
              id="migrateProjectName"
              name="migrateProjectName"
              value={formData.migrateProjectName}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="my-migrate-project"
              className={cn(
                inputClassName,
                touched.migrateProjectName && errors.migrateProjectName && inputErrorClassName
              )}
            />
          </FormField>
        </FormSection>

        {/* Navigation */}
        <WizardNav
          onBack={handleBack}
          onNext={handleNext}
          nextLabel="Review & Verify"
          nextDisabled={Object.keys(errors).some((key) => errors[key as keyof ProjectData])}
        />
      </div>
    </WizardLayout>
  );
}
