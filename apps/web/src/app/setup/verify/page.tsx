'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Shield,
  Cloud,
  RefreshCw,
} from 'lucide-react';
import { WizardLayout, WizardNav, WizardAction } from '../components';
import { settingsApi } from '@/lib/api';
import { useCompleteSetup } from '@/hooks/useSetupStatus';
import { cn } from '@/lib/utils';

// Storage key for wizard data
const STORAGE_KEY = 'setup-wizard-data';

interface WizardData {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  subscriptionId: string;
  resourceGroup: string;
  migrateProjectName: string;
  location: string;
}

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

/**
 * Step 4: Verify & Complete Page
 * Shows configuration summary, tests connection, and completes setup
 */
export default function SetupVerifyPage() {
  const router = useRouter();
  const [wizardData, setWizardData] = useState<WizardData | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const completeSetupMutation = useCompleteSetup();

  // Load saved data on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        setWizardData(JSON.parse(saved));
      } else {
        // No data, redirect to start
        router.push('/setup');
      }
    } catch {
      router.push('/setup');
    }
  }, [router]);

  // Save configuration mutation
  const saveConfigMutation = useMutation({
    mutationFn: async (data: WizardData) => {
      return settingsApi.saveAzureConfig({
        tenantId: data.tenantId,
        clientId: data.clientId,
        clientSecret: data.clientSecret,
        subscriptionId: data.subscriptionId,
        resourceGroup: data.resourceGroup,
        migrateProject: data.migrateProjectName,
        location: data.location,
      });
    },
  });

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: () => settingsApi.testAzureConnection(),
  });

  // Test connection handler
  const handleTestConnection = async () => {
    if (!wizardData) return;
    
    setConnectionStatus('testing');
    setConnectionError(null);

    try {
      // First save the config
      await saveConfigMutation.mutateAsync(wizardData);
      
      // Then test the connection
      const result = await testConnectionMutation.mutateAsync();
      
      if (result.data?.connected) {
        setConnectionStatus('success');
      } else {
        setConnectionStatus('error');
        setConnectionError(result.data?.message || 'Connection test failed');
      }
    } catch (error) {
      setConnectionStatus('error');
      setConnectionError(error instanceof Error ? error.message : 'Failed to test connection');
    }
  };

  // Complete setup handler
  const handleCompleteSetup = async () => {
    if (!wizardData) return;
    
    setIsSaving(true);
    
    try {
      // Save config if not already saved
      if (!saveConfigMutation.isSuccess) {
        await saveConfigMutation.mutateAsync(wizardData);
      }
      
      // Mark setup as complete
      await completeSetupMutation.mutateAsync();
      
      // Clear wizard data
      sessionStorage.removeItem(STORAGE_KEY);
      
      // Redirect to dashboard
      router.push('/');
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'Failed to complete setup');
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    router.push('/setup/project');
  };

  if (!wizardData) {
    return (
      <WizardLayout currentStep={3} title="Loading..." description="Loading your configuration...">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </WizardLayout>
    );
  }

  return (
    <WizardLayout
      currentStep={3}
      title="Verify & Complete"
      description="Review your configuration and test the connection before completing setup."
    >
      <div className="space-y-6">
        {/* Configuration Summary */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground">Configuration Summary</h3>
          
          {/* Credentials Section - uses mm-section-card pattern */}
          <div className="mm-section-card">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-card-border bg-muted/30">
              <Shield className="h-4 w-4 text-primary" />
              <span className="font-medium text-foreground">Azure Credentials</span>
            </div>
            <div className="p-4 space-y-2">
              <SummaryRow label="Tenant ID" value={maskGuid(wizardData.tenantId)} />
              <SummaryRow label="Client ID" value={maskGuid(wizardData.clientId)} />
              <SummaryRow label="Client Secret" value="••••••••••••" />
            </div>
          </div>

          {/* Project Section - uses mm-section-card pattern */}
          <div className="mm-section-card">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-card-border bg-muted/30">
              <Cloud className="h-4 w-4 text-primary" />
              <span className="font-medium text-foreground">Azure Migrate Project</span>
            </div>
            <div className="p-4 space-y-2">
              <SummaryRow label="Subscription ID" value={maskGuid(wizardData.subscriptionId)} />
              <SummaryRow label="Resource Group" value={wizardData.resourceGroup} />
              <SummaryRow label="Project Name" value={wizardData.migrateProjectName} />
              <SummaryRow label="Location" value={wizardData.location} />
            </div>
          </div>
        </div>

        {/* Connection Test */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground">Test Connection</h3>
          
          {/* Connection status - uses mm-info-card variants */}
          <div className={cn(
            connectionStatus === 'success' && 'mm-info-card-success',
            connectionStatus === 'error' && 'mm-info-card-danger',
            (connectionStatus === 'idle' || connectionStatus === 'testing') && 'rounded-xl border border-border p-6 bg-muted/30'
          )}>
            <div className="flex items-start gap-3">
              {connectionStatus === 'idle' && (
                <>
                  <RefreshCw className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Ready to test</p>
                    <p className="text-sm text-muted-foreground">
                      Click the button below to verify your Azure connection
                    </p>
                  </div>
                </>
              )}
              {connectionStatus === 'testing' && (
                <>
                  <Loader2 className="h-5 w-5 text-primary animate-spin mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Testing connection...</p>
                    <p className="text-sm text-muted-foreground">
                      Saving configuration and verifying Azure connectivity
                    </p>
                  </div>
                </>
              )}
              {connectionStatus === 'success' && (
                <>
                  <CheckCircle className="h-5 w-5 text-success mt-0.5" />
                  <div>
                    <p className="font-medium text-success">Connection successful!</p>
                    <p className="text-sm text-muted-foreground">
                      Your Azure configuration is valid. You can now complete the setup.
                    </p>
                  </div>
                </>
              )}
              {connectionStatus === 'error' && (
                <>
                  <XCircle className="h-5 w-5 text-danger mt-0.5" />
                  <div>
                    <p className="font-medium text-danger">Connection failed</p>
                    <p className="text-sm text-muted-foreground">
                      {connectionError || 'Unable to connect to Azure. Please check your credentials.'}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {connectionStatus !== 'success' && (
            <WizardAction
              onClick={handleTestConnection}
              label="Test Connection"
              icon={<RefreshCw className="h-4 w-4" />}
              isLoading={connectionStatus === 'testing'}
              variant="primary"
            />
          )}
        </div>

        {/* Complete Setup */}
        {connectionStatus === 'success' && (
          <div className="pt-4">
            <WizardAction
              onClick={handleCompleteSetup}
              label="Complete Setup"
              icon={<CheckCircle className="h-4 w-4" />}
              isLoading={isSaving}
              variant="success"
            />
          </div>
        )}

        {/* Skip Test Option */}
        {connectionStatus !== 'success' && (
          <div className="text-center pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground mb-2">
              Want to skip the connection test?
            </p>
            <button
              type="button"
              onClick={handleCompleteSetup}
              disabled={isSaving}
              className="text-sm text-primary hover:underline"
            >
              Save configuration and complete setup without testing
            </button>
          </div>
        )}

        {/* Navigation */}
        <WizardNav
          onBack={handleBack}
          showNext={false}
        />
      </div>
    </WizardLayout>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  );
}

function maskGuid(guid: string): string {
  if (!guid || guid.length < 8) return guid;
  return `${guid.substring(0, 8)}...${guid.substring(guid.length - 4)}`;
}
