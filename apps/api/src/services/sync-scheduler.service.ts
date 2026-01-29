import { prisma } from '../lib/db.js';
import { azureMigrateService } from './azure-migrate.service.js';
import { connectionHealthService, SourceType } from './connection-health.service.js';

/**
 * Valid sync intervals in minutes
 */
export const VALID_INTERVALS = [15, 30, 60, 360, 1440] as const;
export type SyncInterval = typeof VALID_INTERVALS[number];

/**
 * Sync status types
 */
export type SyncStatus = 'success' | 'failed' | 'running';

/**
 * Sync schedule configuration
 */
export interface SyncScheduleConfig {
  sourceType: SourceType;
  enabled: boolean;
  intervalMinutes: SyncInterval;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  lastSyncStatus: SyncStatus | null;
  lastSyncError: string | null;
  lastSyncCount: number | null;
  lastSyncDuration: number | null;
}

/**
 * Sync result
 */
export interface SyncResult {
  sourceType: SourceType;
  status: SyncStatus;
  count: number;
  duration: number;
  error?: string;
}

/**
 * Service for managing auto-sync schedules
 */
class SyncSchedulerService {
  private syncTimers: Map<SourceType, NodeJS.Timeout> = new Map();

  /**
   * Get all sync schedules
   */
  async getAllSchedules(): Promise<Record<SourceType, SyncScheduleConfig>> {
    const [azureSchedule, drMigrateSchedule] = await Promise.all([
      this.getSchedule('azure-migrate'),
      this.getSchedule('drmigrate'),
    ]);

    return {
      'azure-migrate': azureSchedule,
      'drmigrate': drMigrateSchedule,
    };
  }

  /**
   * Get schedule for a specific source
   */
  async getSchedule(sourceType: SourceType): Promise<SyncScheduleConfig> {
    let schedule = await prisma.syncSchedule.findUnique({
      where: { sourceType },
    });

    // Create default record if not exists
    if (!schedule) {
      schedule = await prisma.syncSchedule.create({
        data: {
          sourceType,
          enabled: false,
          intervalMinutes: 60,
        },
      });
    }

    return {
      sourceType: schedule.sourceType as SourceType,
      enabled: schedule.enabled,
      intervalMinutes: schedule.intervalMinutes as SyncInterval,
      lastSyncAt: schedule.lastSyncAt?.toISOString() || null,
      nextSyncAt: schedule.nextSyncAt?.toISOString() || null,
      lastSyncStatus: schedule.lastSyncStatus as SyncStatus | null,
      lastSyncError: schedule.lastSyncError,
      lastSyncCount: schedule.lastSyncCount,
      lastSyncDuration: schedule.lastSyncDuration,
    };
  }

  /**
   * Update schedule for a source
   */
  async updateSchedule(
    sourceType: SourceType,
    enabled: boolean,
    intervalMinutes?: SyncInterval
  ): Promise<SyncScheduleConfig> {
    // Validate interval if provided
    if (intervalMinutes && !VALID_INTERVALS.includes(intervalMinutes)) {
      throw new Error(`Invalid interval. Must be one of: ${VALID_INTERVALS.join(', ')}`);
    }

    const now = new Date();
    const nextSyncAt = enabled && intervalMinutes
      ? new Date(now.getTime() + intervalMinutes * 60 * 1000)
      : null;

    const schedule = await prisma.syncSchedule.upsert({
      where: { sourceType },
      create: {
        sourceType,
        enabled,
        intervalMinutes: intervalMinutes || 60,
        nextSyncAt,
      },
      update: {
        enabled,
        intervalMinutes: intervalMinutes || undefined,
        nextSyncAt,
      },
    });

    // Update the timer
    if (enabled) {
      this.startTimer(sourceType, intervalMinutes || schedule.intervalMinutes);
    } else {
      this.stopTimer(sourceType);
    }

    return this.getSchedule(sourceType);
  }

  /**
   * Trigger a manual sync for a source
   */
  async triggerSync(sourceType: SourceType): Promise<SyncResult> {
    const startTime = Date.now();
    let status: SyncStatus = 'running';
    let count = 0;
    let error: string | undefined;

    // Mark as running
    await prisma.syncSchedule.upsert({
      where: { sourceType },
      create: {
        sourceType,
        lastSyncStatus: 'running',
      },
      update: {
        lastSyncStatus: 'running',
      },
    });

    try {
      if (sourceType === 'azure-migrate') {
        count = await this.syncAzureMigrate();
      } else {
        count = await this.syncDrMigrate();
      }
      status = 'success';
    } catch (err) {
      status = 'failed';
      error = err instanceof Error ? err.message : 'Unknown error';
    }

    const duration = Date.now() - startTime;
    const now = new Date();

    // Get current schedule to calculate next sync
    const schedule = await prisma.syncSchedule.findUnique({
      where: { sourceType },
    });

    const nextSyncAt = schedule?.enabled
      ? new Date(now.getTime() + (schedule.intervalMinutes * 60 * 1000))
      : null;

    // Update schedule with results
    await prisma.syncSchedule.upsert({
      where: { sourceType },
      create: {
        sourceType,
        lastSyncAt: now,
        lastSyncStatus: status,
        lastSyncError: error || null,
        lastSyncCount: count,
        lastSyncDuration: duration,
        nextSyncAt,
      },
      update: {
        lastSyncAt: now,
        lastSyncStatus: status,
        lastSyncError: error || null,
        lastSyncCount: count,
        lastSyncDuration: duration,
        nextSyncAt,
      },
    });

    // Update health service with new count
    if (status === 'success') {
      await connectionHealthService.updateMachineCount(sourceType, count);
    }

    return {
      sourceType,
      status,
      count,
      duration,
      error,
    };
  }

  /**
   * Sync Azure Migrate machines
   */
  private async syncAzureMigrate(): Promise<number> {
    // Use the existing syncMachines method which handles all the data transformation
    const result = await azureMigrateService.syncMachines();
    return result.count;
  }

  /**
   * Sync DrMigrate servers (placeholder - needs SQL query implementation)
   */
  private async syncDrMigrate(): Promise<number> {
    // Get DrMigrate data source config
    const drMigrateSource = await prisma.dataSource.findFirst({
      where: { type: 'drmigrate-db' },
    });

    if (!drMigrateSource || !drMigrateSource.connectionString) {
      throw new Error('DrMigrate not configured');
    }

    // TODO: Implement actual DrMigrate sync once SQL tables are provided
    // For now, return the cached count
    const count = await prisma.drMigrateServer.count();
    return count;
  }

  /**
   * Start the sync timer for a source
   */
  private startTimer(sourceType: SourceType, intervalMinutes: number): void {
    // Clear existing timer
    this.stopTimer(sourceType);

    // Set up new timer
    const intervalMs = intervalMinutes * 60 * 1000;
    const timer = setInterval(async () => {
      try {
        await this.triggerSync(sourceType);
      } catch (err) {
        console.error(`Auto-sync failed for ${sourceType}:`, err);
      }
    }, intervalMs);

    this.syncTimers.set(sourceType, timer);
    console.log(`Auto-sync timer started for ${sourceType} (every ${intervalMinutes} minutes)`);
  }

  /**
   * Stop the sync timer for a source
   */
  private stopTimer(sourceType: SourceType): void {
    const timer = this.syncTimers.get(sourceType);
    if (timer) {
      clearInterval(timer);
      this.syncTimers.delete(sourceType);
      console.log(`Auto-sync timer stopped for ${sourceType}`);
    }
  }

  /**
   * Initialize all enabled schedules on startup
   */
  async initializeSchedules(): Promise<void> {
    const schedules = await prisma.syncSchedule.findMany({
      where: { enabled: true },
    });

    for (const schedule of schedules) {
      this.startTimer(
        schedule.sourceType as SourceType,
        schedule.intervalMinutes
      );
    }

    console.log(`Initialized ${schedules.length} sync schedule(s)`);
  }

  /**
   * Stop all sync timers (for shutdown)
   */
  stopAllTimers(): void {
    for (const sourceType of this.syncTimers.keys()) {
      this.stopTimer(sourceType);
    }
  }
}

// Export singleton instance
export const syncSchedulerService = new SyncSchedulerService();
