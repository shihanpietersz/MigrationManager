'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, HelpCircle } from 'lucide-react';
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

interface CredentialsData {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

// GUID validation regex
const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Step 2: Azure Credentials Page
 * Collects Azure Service Principal credentials
 */
export default function SetupCredentialsPage() {
  const router = useRouter();
  const [showSecret, setShowSecret] = useState(false);
  const [formData, setFormData] = useState<CredentialsData>({
    tenantId: '',
    clientId: '',
    clientSecret: '',
  });
  const [errors, setErrors] = useState<Partial<CredentialsData>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Load saved data on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        setFormData({
          tenantId: data.tenantId || '',
          clientId: data.clientId || '',
          clientSecret: data.clientSecret || '',
        });
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Validate a single field
  const validateField = (name: keyof CredentialsData, value: string): string | undefined => {
    if (!value.trim()) {
      return 'This field is required';
    }
    if ((name === 'tenantId' || name === 'clientId') && !GUID_REGEX.test(value.trim())) {
      return 'Must be a valid GUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)';
    }
    return undefined;
  };

  // Validate all fields
  const validateAll = (): boolean => {
    const newErrors: Partial<CredentialsData> = {};
    let isValid = true;

    (Object.keys(formData) as Array<keyof CredentialsData>).forEach((key) => {
      const error = validateField(key, formData[key]);
      if (error) {
        newErrors[key] = error;
        isValid = false;
      }
    });

    setErrors(newErrors);
    setTouched({ tenantId: true, clientId: true, clientSecret: true });
    return isValid;
  };

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    
    // Clear error when user types
    if (touched[name]) {
      const error = validateField(name as keyof CredentialsData, value);
      setErrors((prev) => ({ ...prev, [name]: error }));
    }
  };

  // Handle blur for validation
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    const error = validateField(name as keyof CredentialsData, value);
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
    saveAndNavigate('/setup');
  };

  const handleNext = () => {
    if (validateAll()) {
      saveAndNavigate('/setup/project');
    }
  };

  return (
    <WizardLayout
      currentStep={1}
      title="Azure Credentials"
      description="Enter your Azure Service Principal credentials. These are used to connect to your Azure subscription."
    >
      <div className="space-y-6">
        {/* Info Banner - uses mm-info-card pattern */}
        <div className="mm-info-card flex items-start gap-3">
          <HelpCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-foreground">Where to find these values</p>
            <p className="text-muted-foreground mt-1">
              Go to{' '}
              <a
                href="https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/RegisteredApps"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Azure Portal &gt; App Registrations
              </a>
              {' '}and select your application.
            </p>
          </div>
        </div>

        <FormSection
          title="Service Principal Details"
          description="Your Azure AD App Registration credentials"
        >
          {/* Tenant ID */}
          <FormField
            label="Tenant ID"
            htmlFor="tenantId"
            required
            error={touched.tenantId ? errors.tenantId : undefined}
            hint="Also called Directory ID - found in Azure AD Overview"
          >
            <input
              type="text"
              id="tenantId"
              name="tenantId"
              value={formData.tenantId}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className={cn(
                inputClassName,
                touched.tenantId && errors.tenantId && inputErrorClassName
              )}
            />
          </FormField>

          {/* Client ID */}
          <FormField
            label="Client ID"
            htmlFor="clientId"
            required
            error={touched.clientId ? errors.clientId : undefined}
            hint="Also called Application ID - found in App Registration Overview"
          >
            <input
              type="text"
              id="clientId"
              name="clientId"
              value={formData.clientId}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className={cn(
                inputClassName,
                touched.clientId && errors.clientId && inputErrorClassName
              )}
            />
          </FormField>

          {/* Client Secret */}
          <FormField
            label="Client Secret"
            htmlFor="clientSecret"
            required
            error={touched.clientSecret ? errors.clientSecret : undefined}
            hint="Found in App Registration > Certificates & secrets"
          >
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                id="clientSecret"
                name="clientSecret"
                value={formData.clientSecret}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Enter your client secret"
                className={cn(
                  inputClassName,
                  'pr-12',
                  touched.clientSecret && errors.clientSecret && inputErrorClassName
                )}
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showSecret ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </FormField>
        </FormSection>

        {/* Required Permissions Info - uses mm-section-card pattern */}
        <div className="mm-section-card">
          <div className="mm-section-header text-base">Required API Permissions</div>
          <ul className="p-4 text-sm text-muted-foreground space-y-2">
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Azure Service Management - user_impersonation
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Microsoft Graph - User.Read
            </li>
          </ul>
        </div>

        {/* Navigation */}
        <WizardNav
          onBack={handleBack}
          onNext={handleNext}
          nextDisabled={Object.keys(errors).some((key) => errors[key as keyof CredentialsData])}
        />
      </div>
    </WizardLayout>
  );
}
