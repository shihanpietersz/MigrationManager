import { prisma } from '../lib/db.js';

/**
 * Overview statistics for the dashboard
 */
export interface OverviewStats {
  azureMachines: number;
  drMigrateServers: number;
  matchedCount: number;
  unmatchedAzure: number;
  unmatchedDrMigrate: number;
  matchPercentage: number;
  autoMatchedCount: number;
  manualMatchedCount: number;
  lastAzureSync: string | null;
  lastDrMigrateSync: string | null;
}

/**
 * Machine count by source
 */
export interface SourceCounts {
  azure: number;
  drmigrate: number;
  matched: number;
  unmatched: number;
}

/**
 * Matching statistics
 */
export interface MatchingStats {
  total: number;
  matched: number;
  unmatched: number;
  autoMatched: number;
  manualMatched: number;
  matchPercentage: number;
  confidenceDistribution: {
    high: number;    // >= 0.9
    medium: number;  // 0.7 - 0.9
    low: number;     // < 0.7
  };
}

/**
 * Service for calculating aggregate statistics
 */
class StatisticsService {
  /**
   * Get overview statistics for the dashboard
   */
  async getOverviewStats(): Promise<OverviewStats> {
    // Get counts in parallel
    const [
      azureMachines,
      drMigrateServers,
      matchedMappings,
      autoMatchedMappings,
      manualMatchedMappings,
      azureSchedule,
      drMigrateSchedule,
    ] = await Promise.all([
      prisma.discoveredMachine.count(),
      prisma.drMigrateServer.count(),
      prisma.machineMapping.count({
        where: { matchType: { not: 'unmatched' } },
      }),
      prisma.machineMapping.count({
        where: { matchType: 'auto' },
      }),
      prisma.machineMapping.count({
        where: { matchType: 'manual' },
      }),
      prisma.syncSchedule.findUnique({
        where: { sourceType: 'azure-migrate' },
      }),
      prisma.syncSchedule.findUnique({
        where: { sourceType: 'drmigrate' },
      }),
    ]);

    // Calculate unmatched counts
    // Unmatched Azure = Azure machines that don't have a mapping with a DrMigrate match
    const unmatchedAzure = azureMachines - matchedMappings;
    // Unmatched DrMigrate = DrMigrate servers not linked to any Azure machine
    const linkedDrMigrateIds = await prisma.machineMapping.findMany({
      where: {
        drMigrateServerId: { not: null },
      },
      select: { drMigrateServerId: true },
    });
    const linkedDrMigrateCount = new Set(linkedDrMigrateIds.map(m => m.drMigrateServerId)).size;
    const unmatchedDrMigrate = drMigrateServers - linkedDrMigrateCount;

    // Calculate match percentage
    const matchPercentage = azureMachines > 0
      ? Math.round((matchedMappings / azureMachines) * 100 * 10) / 10
      : 0;

    return {
      azureMachines,
      drMigrateServers,
      matchedCount: matchedMappings,
      unmatchedAzure: Math.max(0, unmatchedAzure),
      unmatchedDrMigrate: Math.max(0, unmatchedDrMigrate),
      matchPercentage,
      autoMatchedCount: autoMatchedMappings,
      manualMatchedCount: manualMatchedMappings,
      lastAzureSync: azureSchedule?.lastSyncAt?.toISOString() || null,
      lastDrMigrateSync: drMigrateSchedule?.lastSyncAt?.toISOString() || null,
    };
  }

  /**
   * Get machine counts by source
   */
  async getSourceCounts(): Promise<SourceCounts> {
    const [azure, drmigrate, matched] = await Promise.all([
      prisma.discoveredMachine.count(),
      prisma.drMigrateServer.count(),
      prisma.machineMapping.count({
        where: { matchType: { not: 'unmatched' } },
      }),
    ]);

    return {
      azure,
      drmigrate,
      matched,
      unmatched: azure - matched,
    };
  }

  /**
   * Get detailed matching statistics
   */
  async getMatchingStats(): Promise<MatchingStats> {
    const [
      total,
      matched,
      autoMatched,
      manualMatched,
      highConfidence,
      mediumConfidence,
      lowConfidence,
    ] = await Promise.all([
      prisma.machineMapping.count(),
      prisma.machineMapping.count({
        where: { matchType: { not: 'unmatched' } },
      }),
      prisma.machineMapping.count({
        where: { matchType: 'auto' },
      }),
      prisma.machineMapping.count({
        where: { matchType: 'manual' },
      }),
      prisma.machineMapping.count({
        where: {
          matchType: 'auto',
          matchConfidence: { gte: 0.9 },
        },
      }),
      prisma.machineMapping.count({
        where: {
          matchType: 'auto',
          matchConfidence: { gte: 0.7, lt: 0.9 },
        },
      }),
      prisma.machineMapping.count({
        where: {
          matchType: 'auto',
          matchConfidence: { lt: 0.7 },
        },
      }),
    ]);

    const unmatched = total - matched;
    const matchPercentage = total > 0
      ? Math.round((matched / total) * 100 * 10) / 10
      : 0;

    return {
      total,
      matched,
      unmatched,
      autoMatched,
      manualMatched,
      matchPercentage,
      confidenceDistribution: {
        high: highConfidence,
        medium: mediumConfidence,
        low: lowConfidence,
      },
    };
  }

  /**
   * Get machine breakdown by various categories
   */
  async getMachineBreakdown(): Promise<{
    byOS: Record<string, number>;
    byWave: Record<string, number>;
    byEnvironment: Record<string, number>;
  }> {
    // Get OS distribution from Azure machines
    const osCounts = await prisma.discoveredMachine.groupBy({
      by: ['operatingSystem'],
      _count: { operatingSystem: true },
    });

    const byOS: Record<string, number> = {};
    for (const item of osCounts) {
      const os = item.operatingSystem || 'Unknown';
      byOS[os] = item._count.operatingSystem;
    }

    // Get wave distribution from DrMigrate servers
    const waveCounts = await prisma.drMigrateServer.groupBy({
      by: ['wave'],
      _count: { wave: true },
    });

    const byWave: Record<string, number> = {};
    for (const item of waveCounts) {
      const wave = item.wave || 'Unassigned';
      byWave[wave] = item._count.wave;
    }

    // Get environment distribution
    const envCounts = await prisma.drMigrateServer.groupBy({
      by: ['environment'],
      _count: { environment: true },
    });

    const byEnvironment: Record<string, number> = {};
    for (const item of envCounts) {
      const env = item.environment || 'Unknown';
      byEnvironment[env] = item._count.environment;
    }

    return {
      byOS,
      byWave,
      byEnvironment,
    };
  }
}

// Export singleton instance
export const statisticsService = new StatisticsService();
