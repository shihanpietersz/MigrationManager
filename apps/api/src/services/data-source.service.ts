import prisma from '../lib/db.js';
import { activityService } from './activity.service.js';
import Papa from 'papaparse';

export interface DataSourceInput {
  name: string;
  type: 'database' | 'csv' | 'api' | 'drmigrate-db';
  connectionString?: string;
  apiEndpoint?: string;
  apiKey?: string;
  tableName?: string;
}

export interface CSVMachineRow {
  hostname?: string;
  name?: string;
  machine_name?: string;
  ip?: string;
  ip_address?: string;
  ip_addresses?: string;
  os?: string;
  operating_system?: string;
  cpu?: string | number;
  cpu_cores?: string | number;
  memory?: string | number;
  memory_mb?: string | number;
  disk?: string | number;
  disk_size_gb?: string | number;
  [key: string]: unknown;
}

export const dataSourceService = {
  /**
   * Get all data sources
   */
  async getAll() {
    return prisma.dataSource.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { machines: true, importJobs: true },
        },
      },
    });
  },

  /**
   * Get data source by ID
   */
  async getById(id: string) {
    return prisma.dataSource.findUnique({
      where: { id },
      include: {
        _count: {
          select: { machines: true, importJobs: true },
        },
      },
    });
  },

  /**
   * Create a new data source
   */
  async create(input: DataSourceInput) {
    const dataSource = await prisma.dataSource.create({
      data: {
        name: input.name,
        type: input.type,
        connectionString: input.connectionString,
        apiEndpoint: input.apiEndpoint,
        apiKey: input.apiKey,
        tableName: input.tableName,
        status: 'disconnected',
      },
    });

    await activityService.log({
      type: 'import',
      action: 'created',
      title: `Data source "${input.name}" created`,
      description: `Type: ${input.type}`,
      status: 'success',
      entityType: 'data-source',
      entityId: dataSource.id,
    });

    return dataSource;
  },

  /**
   * Delete data source
   */
  async delete(id: string) {
    const dataSource = await prisma.dataSource.findUnique({ where: { id } });
    if (!dataSource) {
      throw new Error('Data source not found');
    }

    await prisma.dataSource.delete({ where: { id } });

    await activityService.log({
      type: 'import',
      action: 'deleted',
      title: `Data source "${dataSource.name}" deleted`,
      status: 'info',
    });

    return true;
  },

  /**
   * Update data source status
   */
  async updateStatus(id: string, status: 'connected' | 'disconnected' | 'error', error?: string) {
    return prisma.dataSource.update({
      where: { id },
      data: {
        status,
        lastError: error,
        lastSyncAt: status === 'connected' ? new Date() : undefined,
      },
    });
  },

  /**
   * Create an import job
   */
  async createImportJob(sourceId: string, totalRecords: number = 0) {
    return prisma.importJob.create({
      data: {
        sourceId,
        status: 'running',
        totalRecords,
      },
    });
  },

  /**
   * Update import job progress
   */
  async updateImportJob(jobId: string, data: {
    processedRecords?: number;
    errorCount?: number;
    errors?: string[];
    status?: 'pending' | 'running' | 'completed' | 'failed';
  }) {
    return prisma.importJob.update({
      where: { id: jobId },
      data: {
        processedRecords: data.processedRecords,
        errorCount: data.errorCount,
        errors: data.errors ? JSON.stringify(data.errors) : undefined,
        status: data.status,
        completedAt: data.status === 'completed' || data.status === 'failed' ? new Date() : undefined,
      },
    });
  },

  /**
   * Get import job by ID
   */
  async getImportJob(jobId: string) {
    return prisma.importJob.findUnique({
      where: { id: jobId },
      include: { source: true },
    });
  },

  /**
   * Get import jobs for a source
   */
  async getImportJobs(sourceId?: string) {
    return prisma.importJob.findMany({
      where: sourceId ? { sourceId } : undefined,
      orderBy: { startedAt: 'desc' },
      take: 50,
      include: { source: true },
    });
  },

  /**
   * Import machines from CSV content
   */
  async importFromCSV(sourceId: string, csvContent: string): Promise<{
    jobId: string;
    totalRecords: number;
    processedRecords: number;
    errors: string[];
  }> {
    // Parse CSV
    const parseResult = Papa.parse<CSVMachineRow>(csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.toLowerCase().trim().replace(/\s+/g, '_'),
    });

    if (parseResult.errors.length > 0) {
      throw new Error(`CSV parsing error: ${parseResult.errors[0].message}`);
    }

    const rows = parseResult.data;
    const job = await this.createImportJob(sourceId, rows.length);
    const errors: string[] = [];
    let processedCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        // Extract hostname (try multiple possible column names)
        const hostname = row.hostname || row.name || row.machine_name || row.server_name || row.computer_name;
        if (!hostname) {
          errors.push(`Row ${i + 1}: Missing hostname`);
          continue;
        }

        // Extract IP addresses
        const ipRaw = row.ip || row.ip_address || row.ip_addresses || row.ipaddress || '';
        const ipAddresses = typeof ipRaw === 'string' 
          ? ipRaw.split(/[,;]/).map((ip: string) => ip.trim()).filter(Boolean)
          : [String(ipRaw)];

        // Extract other fields
        const operatingSystem = row.os || row.operating_system || row.operatingsystem || null;
        const cpuCores = parseInt(String(row.cpu || row.cpu_cores || row.cpucores || row.cores || '0'), 10) || null;
        const memoryMB = parseInt(String(row.memory || row.memory_mb || row.memorymb || row.ram || '0'), 10) || null;
        const diskSizeGB = parseInt(String(row.disk || row.disk_size_gb || row.disksizegb || row.storage || '0'), 10) || null;

        // Upsert machine
        await prisma.externalMachine.upsert({
          where: {
            // Use composite key if available, otherwise generate unique lookup
            id: await this.findExternalMachineId(sourceId, hostname) || 'new',
          },
          update: {
            ipAddresses: JSON.stringify(ipAddresses),
            operatingSystem,
            cpuCores,
            memoryMB,
            diskSizeGB,
            rawData: JSON.stringify(row),
            updatedAt: new Date(),
          },
          create: {
            sourceId,
            hostname: String(hostname).trim(),
            ipAddresses: JSON.stringify(ipAddresses),
            operatingSystem,
            cpuCores,
            memoryMB,
            diskSizeGB,
            rawData: JSON.stringify(row),
          },
        });

        processedCount++;
      } catch (err) {
        errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }

      // Update job progress periodically
      if (i % 100 === 0 || i === rows.length - 1) {
        await this.updateImportJob(job.id, {
          processedRecords: processedCount,
          errorCount: errors.length,
        });
      }
    }

    // Finalize job
    await this.updateImportJob(job.id, {
      processedRecords: processedCount,
      errorCount: errors.length,
      errors: errors.slice(0, 100), // Keep first 100 errors
      status: errors.length > 0 && processedCount === 0 ? 'failed' : 'completed',
    });

    // Update data source status
    await this.updateStatus(sourceId, processedCount > 0 ? 'connected' : 'error');

    // Log activity
    await activityService.log({
      type: 'import',
      action: 'completed',
      title: `Imported ${processedCount} machines from CSV`,
      description: errors.length > 0 ? `${errors.length} errors occurred` : undefined,
      status: errors.length > 0 ? 'warning' : 'success',
      entityType: 'data-source',
      entityId: sourceId,
      metadata: { processedCount, errorCount: errors.length },
    });

    return {
      jobId: job.id,
      totalRecords: rows.length,
      processedRecords: processedCount,
      errors,
    };
  },

  /**
   * Find external machine ID by source and hostname
   */
  async findExternalMachineId(sourceId: string, hostname: string): Promise<string | null> {
    const machine = await prisma.externalMachine.findFirst({
      where: { sourceId, hostname },
      select: { id: true },
    });
    return machine?.id || null;
  },

  /**
   * Create or get CSV data source for uploads
   */
  async getOrCreateCSVSource(name: string = 'CSV Import'): Promise<string> {
    // Look for existing CSV source
    let source = await prisma.dataSource.findFirst({
      where: { type: 'csv', name },
    });

    if (!source) {
      source = await prisma.dataSource.create({
        data: {
          name,
          type: 'csv',
          status: 'disconnected',
        },
      });
    }

    return source.id;
  },
};















