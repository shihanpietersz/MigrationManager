import prisma from '../lib/db.js';
import type { AzureConfig } from '@prisma/client';

export interface AzureConfigInput {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  subscriptionId?: string;
  resourceGroup?: string;
  migrateProjectName?: string;
  location?: string;
  vaultName?: string;
  vaultResourceGroup?: string;
}

export const azureConfigService = {
  /**
   * Get the current Azure configuration
   */
  async getConfig(): Promise<AzureConfig | null> {
    return prisma.azureConfig.findUnique({
      where: { id: 'default' },
    });
  },

  /**
   * Save or update Azure configuration
   */
  async saveConfig(config: AzureConfigInput): Promise<AzureConfig> {
    const isConfigured = Boolean(
      config.tenantId &&
        config.clientId &&
        config.subscriptionId &&
        config.resourceGroup &&
        config.migrateProjectName
    );

    return prisma.azureConfig.upsert({
      where: { id: 'default' },
      update: {
        ...config,
        isConfigured,
        updatedAt: new Date(),
      },
      create: {
        id: 'default',
        ...config,
        isConfigured,
      },
    });
  },

  /**
   * Check if Azure is configured
   */
  async isConfigured(): Promise<boolean> {
    const config = await this.getConfig();
    return config?.isConfigured ?? false;
  },

  /**
   * Get configuration for Azure SDK (without sensitive data for responses)
   */
  async getPublicConfig(): Promise<Partial<AzureConfig> | null> {
    const config = await this.getConfig();
    if (!config) return null;

    // Don't expose client secret in responses
    const { clientSecret, ...publicConfig } = config;
    return {
      ...publicConfig,
      clientSecret: clientSecret ? '••••••••' : undefined,
    };
  },

  /**
   * Test Azure connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    const config = await this.getConfig();

    if (!config?.isConfigured) {
      return { success: false, message: 'Azure is not configured' };
    }

    // TODO: Actually test connection with Azure SDK
    // For now, just check if required fields exist
    if (!config.tenantId || !config.clientId || !config.clientSecret) {
      return { success: false, message: 'Missing Azure credentials' };
    }

    return { success: true, message: 'Configuration is valid' };
  },
};

