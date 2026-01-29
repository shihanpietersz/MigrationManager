import { prisma } from '../lib/db.js';
import { azureMigrateService } from './azure-migrate.service.js';
import { drMigrateDbService } from './drmigrate-db.service.js';

/**
 * Connection health status types
 */
export type HealthStatus = 'connected' | 'warning' | 'error' | 'unknown';
export type SourceType = 'azure-migrate' | 'drmigrate';

/**
 * Health check result
 */
export interface HealthCheckResult {
  sourceType: SourceType;
  status: HealthStatus;
  lastCheckAt: Date;
  machineCount: number;
  responseTimeMs: number;
  error?: string;
}

/**
 * Connection health summary for UI display
 */
export interface ConnectionHealthSummary {
  sourceType: SourceType;
  status: HealthStatus;
  lastCheckAt: string | null;
  lastSuccessAt: string | null;
  lastErrorMsg: string | null;
  machineCount: number;
  responseTimeMs: number | null;
  checkCount: number;
  failCount: number;
  uptime: number; // Percentage
}

/**
 * Service for monitoring connection health of data sources
 */
class ConnectionHealthService {
  /**
   * Get health status for all configured data sources
   */
  async getAllHealth(): Promise<Record<SourceType, ConnectionHealthSummary>> {
    const [azureHealth, drMigrateHealth] = await Promise.all([
      this.getHealth('azure-migrate'),
      this.getHealth('drmigrate'),
    ]);

    return {
      'azure-migrate': azureHealth,
      'drmigrate': drMigrateHealth,
    };
  }

  /**
   * Get health status for a specific source
   */
  async getHealth(sourceType: SourceType): Promise<ConnectionHealthSummary> {
    let health = await prisma.connectionHealth.findUnique({
      where: { sourceType },
    });

    // Create default record if not exists
    if (!health) {
      health = await prisma.connectionHealth.create({
        data: { sourceType },
      });
    }

    // Calculate uptime percentage
    const uptime = health.checkCount > 0
      ? Math.round(((health.checkCount - health.failCount) / health.checkCount) * 100)
      : 0;

    // Determine status based on last check time
    let status = health.status as HealthStatus;
    if (health.lastCheckAt) {
      const minutesSinceLastCheck = (Date.now() - health.lastCheckAt.getTime()) / 1000 / 60;
      if (minutesSinceLastCheck > 15 && status === 'connected') {
        status = 'warning'; // Stale data warning
      }
    }

    return {
      sourceType,
      status,
      lastCheckAt: health.lastCheckAt?.toISOString() || null,
      lastSuccessAt: health.lastSuccessAt?.toISOString() || null,
      lastErrorMsg: health.lastErrorMsg,
      machineCount: health.machineCount,
      responseTimeMs: health.responseTimeMs,
      checkCount: health.checkCount,
      failCount: health.failCount,
      uptime,
    };
  }

  /**
   * Perform a health check for Azure Migrate
   */
  async checkAzureMigrate(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    let status: HealthStatus = 'unknown';
    let machineCount = 0;
    let error: string | undefined;

    try {
      // First try VMware sites (same approach as sync)
      const sites = await azureMigrateService.getSites();
      
      if (sites.length > 0) {
        // Count machines from all sites
        for (const site of sites) {
          const machines = await azureMigrateService.getDiscoveredMachines(site.name);
          machineCount += machines.length;
        }
        status = 'connected';
      } else {
        // Fallback: Try assessment project machines API
        const machines = await azureMigrateService.getAssessmentProjectMachines();
        machineCount = machines.length;
        status = 'connected';
      }
    } catch (err) {
      status = 'error';
      error = err instanceof Error ? err.message : 'Unknown error';
    }

    const responseTimeMs = Date.now() - startTime;
    const now = new Date();

    // Update health record
    await prisma.connectionHealth.upsert({
      where: { sourceType: 'azure-migrate' },
      create: {
        sourceType: 'azure-migrate',
        status,
        lastCheckAt: now,
        lastSuccessAt: status === 'connected' ? now : null,
        lastErrorAt: status === 'error' ? now : null,
        lastErrorMsg: error || null,
        machineCount,
        responseTimeMs,
        checkCount: 1,
        failCount: status === 'error' ? 1 : 0,
      },
      update: {
        status,
        lastCheckAt: now,
        lastSuccessAt: status === 'connected' ? now : undefined,
        lastErrorAt: status === 'error' ? now : undefined,
        lastErrorMsg: error || null,
        machineCount: status === 'connected' ? machineCount : undefined,
        responseTimeMs,
        checkCount: { increment: 1 },
        failCount: status === 'error' ? { increment: 1 } : undefined,
      },
    });

    return {
      sourceType: 'azure-migrate',
      status,
      lastCheckAt: now,
      machineCount,
      responseTimeMs,
      error,
    };
  }

  /**
   * Perform a health check for DrMigrate SQL connection
   */
  async checkDrMigrate(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    let status: HealthStatus = 'unknown';
    let machineCount = 0;
    let error: string | undefined;

    try {
      // Get DrMigrate data source config
      const drMigrateSource = await prisma.dataSource.findFirst({
        where: { type: 'drmigrate-db' },
      });

      if (!drMigrateSource || !drMigrateSource.connectionString) {
        status = 'unknown';
        error = 'DrMigrate not configured';
      } else {
        // Parse connection config and test
        const config = drMigrateDbService.deserializeConfig(drMigrateSource.connectionString);
        const result = await drMigrateDbService.testConnection(config);

        if (result.success) {
          status = 'connected';
          // Get cached server count from local DB
          machineCount = await prisma.drMigrateServer.count();
        } else {
          status = 'error';
          error = result.message;
        }
      }
    } catch (err) {
      status = 'error';
      error = err instanceof Error ? err.message : 'Unknown error';
    }

    const responseTimeMs = Date.now() - startTime;
    const now = new Date();

    // Update health record
    await prisma.connectionHealth.upsert({
      where: { sourceType: 'drmigrate' },
      create: {
        sourceType: 'drmigrate',
        status,
        lastCheckAt: now,
        lastSuccessAt: status === 'connected' ? now : null,
        lastErrorAt: status === 'error' ? now : null,
        lastErrorMsg: error || null,
        machineCount,
        responseTimeMs,
        checkCount: 1,
        failCount: status === 'error' ? 1 : 0,
      },
      update: {
        status,
        lastCheckAt: now,
        lastSuccessAt: status === 'connected' ? now : undefined,
        lastErrorAt: status === 'error' ? now : undefined,
        lastErrorMsg: error || null,
        machineCount: status === 'connected' ? machineCount : undefined,
        responseTimeMs,
        checkCount: { increment: 1 },
        failCount: status === 'error' ? { increment: 1 } : undefined,
      },
    });

    return {
      sourceType: 'drmigrate',
      status,
      lastCheckAt: now,
      machineCount,
      responseTimeMs,
      error,
    };
  }

  /**
   * Check health for a specific source type
   */
  async checkHealth(sourceType: SourceType): Promise<HealthCheckResult> {
    if (sourceType === 'azure-migrate') {
      return this.checkAzureMigrate();
    } else {
      return this.checkDrMigrate();
    }
  }

  /**
   * Check health for all sources
   */
  async checkAllHealth(): Promise<HealthCheckResult[]> {
    const [azure, drMigrate] = await Promise.all([
      this.checkAzureMigrate(),
      this.checkDrMigrate(),
    ]);
    return [azure, drMigrate];
  }

  /**
   * Update machine count for a source (called after sync)
   */
  async updateMachineCount(sourceType: SourceType, count: number): Promise<void> {
    await prisma.connectionHealth.upsert({
      where: { sourceType },
      create: {
        sourceType,
        machineCount: count,
        status: 'connected',
        lastSuccessAt: new Date(),
      },
      update: {
        machineCount: count,
      },
    });
  }
}

// Export singleton instance
export const connectionHealthService = new ConnectionHealthService();
