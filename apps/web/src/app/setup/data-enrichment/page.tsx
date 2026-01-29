'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Cloud,
  Database,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  AlertCircle,
  Server,
  SkipForward,
} from 'lucide-react';
import {
  WizardLayout,
  FormField,
  WizardNav,
  inputClassName,
  inputErrorClassName,
} from '../components';
import { dataSourcesApi } from '@/lib/api';
import { cn } from '@/lib/utils';

// Storage key for wizard data
const STORAGE_KEY = 'setup-wizard-data';

interface DrMigrateConnectionData {
  enabled: boolean;
  server: string;
  database: string;
  user: string;
  password: string;
  port: string;
  connectionTested: boolean;
  connectionSuccess: boolean;
  connectionMessage: string;
}

const DEFAULT_DRMIGRATE_DATA: DrMigrateConnectionData = {
  enabled: true, // Default to enabled since Migration Manager is part of DrMigrate
  server: '',
  database: 'DrMigrate',
  user: '',
  password: '',
  port: '1433',
  connectionTested: false,
  connectionSuccess: false,
  connectionMessage: '',
};

/**
 * Step 4: Data Enrichment Page
 * Configure DrMigrate Assessment Engine connection (default) or skip
 */
export default function SetupDataEnrichmentPage() {
  const router = useRouter();
  const [wizardData, setWizardData] = useState<Record<string, unknown> | null>(null);
  const [drMigrateData, setDrMigrateData] = useState<DrMigrateConnectionData>(DEFAULT_DRMIGRATE_DATA);
  const [showPassword, setShowPassword] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof DrMigrateConnectionData, string>>>({});

  // Load saved data on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        setWizardData(data);
        
        // Load DrMigrate config if saved, otherwise use default (enabled)
        if (data.drMigrate !== undefined) {
          setDrMigrateData(data.drMigrate ? {
            ...DEFAULT_DRMIGRATE_DATA,
            ...data.drMigrate,
          } : {
            ...DEFAULT_DRMIGRATE_DATA,
            enabled: false,
          });
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Validate DrMigrate fields
  const validateDrMigrate = (): boolean => {
    if (!drMigrateData.enabled) return true;

    const newErrors: Partial<Record<keyof DrMigrateConnectionData, string>> = {};

    if (!drMigrateData.server.trim()) {
      newErrors.server = 'Server name is required';
    }
    if (!drMigrateData.database.trim()) {
      newErrors.database = 'Database name is required';
    }
    if (!drMigrateData.user.trim()) {
      newErrors.user = 'Username is required';
    }
    if (!drMigrateData.password.trim()) {
      newErrors.password = 'Password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Test DrMigrate connection
  const handleTestConnection = async () => {
    if (!validateDrMigrate()) return;

    setIsTesting(true);
    setDrMigrateData((prev) => ({
      ...prev,
      connectionTested: false,
      connectionSuccess: false,
      connectionMessage: '',
    }));

    try {
      const result = await dataSourcesApi.testDrMigrateConnection({
        server: drMigrateData.server,
        database: drMigrateData.database,
        user: drMigrateData.user,
        password: drMigrateData.password,
        port: drMigrateData.port ? parseInt(drMigrateData.port, 10) : undefined,
      });

      setDrMigrateData((prev) => ({
        ...prev,
        connectionTested: true,
        connectionSuccess: result.data?.success ?? false,
        connectionMessage: result.data?.message ?? 'Connection test completed',
      }));
    } catch (error) {
      setDrMigrateData((prev) => ({
        ...prev,
        connectionTested: true,
        connectionSuccess: false,
        connectionMessage: error instanceof Error ? error.message : 'Connection test failed',
      }));
    } finally {
      setIsTesting(false);
    }
  };

  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setDrMigrateData((prev) => ({
      ...prev,
      [name]: value,
      connectionTested: false, // Reset test status on change
    }));
    
    // Clear error for this field
    if (errors[name as keyof DrMigrateConnectionData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  // Save and navigate
  const saveAndNavigate = (path: string) => {
    try {
      const existing = sessionStorage.getItem(STORAGE_KEY);
      const data = existing ? JSON.parse(existing) : {};
      
      // Save DrMigrate config
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...data,
        drMigrate: drMigrateData.enabled ? drMigrateData : null,
      }));
    } catch {
      // Ignore storage errors
    }
    router.push(path);
  };

  const handleBack = () => {
    saveAndNavigate('/setup/project');
  };

  const handleNext = () => {
    if (drMigrateData.enabled) {
      if (!validateDrMigrate()) return;
      
      // Warn if not tested
      if (!drMigrateData.connectionTested) {
        if (!confirm('You haven\'t tested the connection. Do you want to continue anyway?')) {
          return;
        }
      } else if (!drMigrateData.connectionSuccess) {
        if (!confirm('The connection test failed. Do you want to continue anyway?')) {
          return;
        }
      }
    }
    
    saveAndNavigate('/setup/verify');
  };

  // Handle skip - user doesn't want to connect to DrMigrate
  const handleSkip = () => {
    setDrMigrateData((prev) => ({
      ...prev,
      enabled: false,
    }));
    setErrors({});
  };

  // Handle connect - user wants to connect to DrMigrate
  const handleConnect = () => {
    setDrMigrateData((prev) => ({
      ...prev,
      enabled: true,
    }));
  };

  if (!wizardData) {
    return (
      <WizardLayout currentStep={3} title="Loading..." description="Loading configuration...">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </WizardLayout>
    );
  }

  return (
    <WizardLayout
      currentStep={3}
      title="Assessment Data"
      description="Connect to DrMigrate to retrieve your assessment data including migration waves, sync groups, and replication settings."
    >
      <div className="space-y-6">
        {/* Azure Migrate Card - Always Enabled */}
        <div className="mm-section-card">
          <div className="flex items-start gap-4 p-6">
            <div className="mm-icon-container mm-icon-primary flex-shrink-0">
              <Cloud className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-foreground">Azure Migrate Discovery</h3>
                <span className="mm-badge mm-badge-primary">Required</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Discovers machines in your environment. This is the source of truth for replication.
              </p>
              <div className="mt-4 flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-success" />
                <span className="text-success font-medium">Configured</span>
                <span className="text-muted-foreground">
                  - Project: {(wizardData as Record<string, string>).migrateProjectName || 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* DrMigrate Assessment Engine Card */}
        <div className={cn(
          'mm-section-card transition-all duration-200',
          drMigrateData.enabled && 'ring-2 ring-primary'
        )}>
          <div className="p-6">
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className={cn(
                'mm-icon-container flex-shrink-0 transition-colors',
                drMigrateData.enabled ? 'mm-icon-primary' : 'mm-icon-neutral'
              )}>
                <Database className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-foreground">
                    DrMigrate Assessment Engine
                  </h3>
                  {drMigrateData.enabled && (
                    <span className="mm-badge mm-badge-primary">Recommended</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Connect to DrMigrate to retrieve your assessment data including migration waves, 
                  sync groups, and replication settings. This data will be automatically matched with 
                  discovered machines.
                </p>
              </div>
            </div>

            {/* Connection Form - shown when enabled */}
            {drMigrateData.enabled && (
              <div className="mt-6 space-y-4 border-t border-border pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">SQL Server Connection</span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Server Name */}
                  <FormField
                    label="Server Name"
                    htmlFor="server"
                    required
                    error={errors.server}
                    hint="e.g., localhost\SQLEXPRESS or DBSERVER"
                  >
                    <input
                      type="text"
                      id="server"
                      name="server"
                      value={drMigrateData.server}
                      onChange={handleInputChange}
                      placeholder="localhost\SQLEXPRESS"
                      className={cn(inputClassName, errors.server && inputErrorClassName)}
                    />
                  </FormField>

                  {/* Port */}
                  <FormField
                    label="Port"
                    htmlFor="port"
                    hint="Default: 1433"
                  >
                    <input
                      type="text"
                      id="port"
                      name="port"
                      value={drMigrateData.port}
                      onChange={handleInputChange}
                      placeholder="1433"
                      className={inputClassName}
                    />
                  </FormField>
                </div>

                {/* Database Name */}
                <FormField
                  label="Database Name"
                  htmlFor="database"
                  required
                  error={errors.database}
                >
                  <input
                    type="text"
                    id="database"
                    name="database"
                    value={drMigrateData.database}
                    onChange={handleInputChange}
                    placeholder="DrMigrate"
                    className={cn(inputClassName, errors.database && inputErrorClassName)}
                  />
                </FormField>

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Username */}
                  <FormField
                    label="Username"
                    htmlFor="user"
                    required
                    error={errors.user}
                    hint="SQL Server authentication"
                  >
                    <input
                      type="text"
                      id="user"
                      name="user"
                      value={drMigrateData.user}
                      onChange={handleInputChange}
                      placeholder="sa"
                      className={cn(inputClassName, errors.user && inputErrorClassName)}
                    />
                  </FormField>

                  {/* Password */}
                  <FormField
                    label="Password"
                    htmlFor="password"
                    required
                    error={errors.password}
                  >
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        id="password"
                        name="password"
                        value={drMigrateData.password}
                        onChange={handleInputChange}
                        placeholder="Enter password"
                        className={cn(
                          inputClassName,
                          'pr-12',
                          errors.password && inputErrorClassName
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </FormField>
                </div>

                {/* Test Connection Button & Status */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className="mm-btn-secondary flex items-center gap-2"
                  >
                    {isTesting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <Database className="h-4 w-4" />
                        Test Connection
                      </>
                    )}
                  </button>

                  {drMigrateData.connectionTested && (
                    <div className={cn(
                      'flex items-center gap-2 text-sm',
                      drMigrateData.connectionSuccess ? 'text-success' : 'text-danger'
                    )}>
                      {drMigrateData.connectionSuccess ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      <span>{drMigrateData.connectionMessage}</span>
                    </div>
                  )}
                </div>

                {/* Skip Option */}
                <div className="pt-4 border-t border-border">
                  <button
                    type="button"
                    onClick={handleSkip}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
                  >
                    <SkipForward className="h-4 w-4" />
                    Skip for now - I'll configure this later
                  </button>
                </div>
              </div>
            )}

            {/* Skipped State */}
            {!drMigrateData.enabled && (
              <div className="mt-6 border-t border-border pt-6">
                <div className="mm-info-card mm-info-card-warning flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-warning mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-foreground">Assessment connection skipped</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Without the DrMigrate Assessment Engine, you'll need to manually configure 
                      migration waves, sync groups, and replication settings for each machine.
                    </p>
                    <button
                      type="button"
                      onClick={handleConnect}
                      className="mt-3 mm-btn-outline flex items-center"
                    >
                      <Database className="h-4 w-4 mr-2" />
                      Connect to DrMigrate
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <WizardNav
          onBack={handleBack}
          onNext={handleNext}
          nextLabel={drMigrateData.enabled ? 'Continue' : 'Skip & Continue'}
        />
      </div>
    </WizardLayout>
  );
}
