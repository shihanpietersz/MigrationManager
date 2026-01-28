import prisma from '../lib/db.js';
import type { DiscoveredMachine, ExternalMachine } from '@prisma/client';
import type { Machine, MachineSource } from '@drmigrate/shared-types';

export const machineService = {
  /**
   * Get all machines (unified view)
   */
  async getAll(options?: {
    source?: MachineSource;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ machines: Machine[]; total: number }> {
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 50;
    const skip = (page - 1) * pageSize;

    // Get discovered machines from Azure
    const discoveredMachines = await prisma.discoveredMachine.findMany({
      where: options?.search
        ? {
            OR: [
              { displayName: { contains: options.search } },
              { ipAddresses: { contains: options.search } },
            ],
          }
        : undefined,
    });

    // Get external machines
    const externalMachines = await prisma.externalMachine.findMany({
      where: options?.search
        ? {
            OR: [
              { hostname: { contains: options.search } },
              { ipAddresses: { contains: options.search } },
            ],
          }
        : undefined,
    });

    // Create unified machine list
    const machineMap = new Map<string, Machine>();

    // Helper function to safely parse IP addresses
    const parseIpAddresses = (ipStr: string | null): string[] => {
      if (!ipStr) return [];
      try {
        const parsed = JSON.parse(ipStr);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        // If it's not valid JSON, treat as comma-separated string
        return ipStr.split(',').map(ip => ip.trim()).filter(Boolean);
      }
    };

    // Process discovered machines
    for (const dm of discoveredMachines) {
      const key = dm.displayName.toLowerCase();
      const existing = machineMap.get(key);

      if (existing) {
        // Already have external, mark as both
        existing.source = 'both';
        existing.sourceIds.azure = dm.id;
      } else {
        machineMap.set(key, {
          id: dm.id,
          displayName: dm.displayName,
          operatingSystem: dm.operatingSystem || 'Unknown',
          ipAddresses: parseIpAddresses(dm.ipAddresses),
          cpuCores: dm.cpuCores || undefined,
          memoryMB: dm.memoryMB || undefined,
          diskCount: dm.diskCount || undefined,
          diskSizeGB: dm.diskSizeGB || undefined,
          powerState: (dm.powerState as 'On' | 'Off' | 'Unknown') || undefined,
          source: 'azure',
          sourceIds: { azure: dm.id },
          lastUpdated: dm.updatedAt.toISOString(),
        });
      }
    }

    // Process external machines
    for (const em of externalMachines) {
      const key = em.hostname.toLowerCase();
      const existing = machineMap.get(key);

      if (existing) {
        // Already have Azure, mark as both
        existing.source = 'both';
        existing.sourceIds.external = em.id;
      } else {
        machineMap.set(key, {
          id: em.id,
          displayName: em.hostname,
          operatingSystem: em.operatingSystem || 'Unknown',
          ipAddresses: parseIpAddresses(em.ipAddresses),
          cpuCores: em.cpuCores || undefined,
          memoryMB: em.memoryMB || undefined,
          diskSizeGB: em.diskSizeGB || undefined,
          source: 'external',
          sourceIds: { external: em.id },
          tags: em.tags ? JSON.parse(em.tags) : undefined,
          lastUpdated: em.updatedAt.toISOString(),
        });
      }
    }

    // Filter by source if specified
    let machines = Array.from(machineMap.values());
    if (options?.source && options.source !== 'both') {
      machines = machines.filter(
        (m) => m.source === options.source || m.source === 'both'
      );
    }

    // Sort by name
    machines.sort((a, b) => a.displayName.localeCompare(b.displayName));

    // Paginate
    const total = machines.length;
    const paginatedMachines = machines.slice(skip, skip + pageSize);

    return { machines: paginatedMachines, total };
  },

  /**
   * Get a single machine by ID
   */
  async getById(id: string): Promise<Machine | null> {
    // Helper function to safely parse IP addresses
    const parseIpAddresses = (ipStr: string | null): string[] => {
      if (!ipStr) return [];
      try {
        const parsed = JSON.parse(ipStr);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return ipStr.split(',').map(ip => ip.trim()).filter(Boolean);
      }
    };

    // Try discovered machines first
    const discovered = await prisma.discoveredMachine.findUnique({
      where: { id },
    });

    if (discovered) {
      return {
        id: discovered.id,
        displayName: discovered.displayName,
        operatingSystem: discovered.operatingSystem || 'Unknown',
        ipAddresses: parseIpAddresses(discovered.ipAddresses),
        cpuCores: discovered.cpuCores || undefined,
        memoryMB: discovered.memoryMB || undefined,
        diskCount: discovered.diskCount || undefined,
        diskSizeGB: discovered.diskSizeGB || undefined,
        powerState: (discovered.powerState as 'On' | 'Off' | 'Unknown') || undefined,
        source: 'azure',
        // Use the full Azure resource ID for API calls, not the local database ID
        sourceIds: { azure: discovered.azureMigrateId },
        lastUpdated: discovered.updatedAt.toISOString(),
      };
    }

    // Try external machines
    const external = await prisma.externalMachine.findUnique({
      where: { id },
    });

    if (external) {
      return {
        id: external.id,
        displayName: external.hostname,
        operatingSystem: external.operatingSystem || 'Unknown',
        ipAddresses: parseIpAddresses(external.ipAddresses),
        cpuCores: external.cpuCores || undefined,
        memoryMB: external.memoryMB || undefined,
        diskSizeGB: external.diskSizeGB || undefined,
        source: 'external',
        sourceIds: { external: external.id },
        tags: external.tags ? JSON.parse(external.tags) : undefined,
        lastUpdated: external.updatedAt.toISOString(),
      };
    }

    return null;
  },

  /**
   * Save discovered machines from Azure
   */
  async saveDiscoveredMachines(
    machines: Array<{
      azureMigrateId: string;
      siteId: string;
      siteName?: string;
      displayName: string;
      hostName?: string;
      ipAddresses: string[];
      operatingSystem?: string;
      cpuCores?: number;
      memoryMB?: number;
      diskCount?: number;
      diskSizeGB?: number;
      powerState?: string;
      vCenterName?: string;
    }>
  ): Promise<number> {
    let count = 0;

    for (const machine of machines) {
      await prisma.discoveredMachine.upsert({
        where: { azureMigrateId: machine.azureMigrateId },
        update: {
          siteId: machine.siteId,
          siteName: machine.siteName,
          displayName: machine.displayName,
          hostName: machine.hostName,
          ipAddresses: JSON.stringify(machine.ipAddresses),
          operatingSystem: machine.operatingSystem,
          cpuCores: machine.cpuCores,
          memoryMB: machine.memoryMB,
          diskCount: machine.diskCount,
          diskSizeGB: machine.diskSizeGB,
          powerState: machine.powerState,
          vCenterName: machine.vCenterName,
          updatedAt: new Date(),
        },
        create: {
          azureMigrateId: machine.azureMigrateId,
          siteId: machine.siteId,
          siteName: machine.siteName,
          displayName: machine.displayName,
          hostName: machine.hostName,
          ipAddresses: JSON.stringify(machine.ipAddresses),
          operatingSystem: machine.operatingSystem,
          cpuCores: machine.cpuCores,
          memoryMB: machine.memoryMB,
          diskCount: machine.diskCount,
          diskSizeGB: machine.diskSizeGB,
          powerState: machine.powerState,
          vCenterName: machine.vCenterName,
        },
      });
      count++;
    }

    return count;
  },

  /**
   * Get machine counts by source
   */
  async getCounts(): Promise<{
    total: number;
    azure: number;
    external: number;
  }> {
    const [azureCount, externalCount] = await Promise.all([
      prisma.discoveredMachine.count(),
      prisma.externalMachine.count(),
    ]);

    return {
      total: azureCount + externalCount,
      azure: azureCount,
      external: externalCount,
    };
  },

  /**
   * Get machine counts by operating system
   */
  async getOSCounts(): Promise<Record<string, number>> {
    const [discoveredMachines, externalMachines] = await Promise.all([
      prisma.discoveredMachine.findMany({
        select: { operatingSystem: true },
      }),
      prisma.externalMachine.findMany({
        select: { operatingSystem: true },
      }),
    ]);

    const osCounts: Record<string, number> = {};

    for (const m of discoveredMachines) {
      const os = m.operatingSystem || 'Unknown';
      osCounts[os] = (osCounts[os] || 0) + 1;
    }

    for (const m of externalMachines) {
      const os = m.operatingSystem || 'Unknown';
      osCounts[os] = (osCounts[os] || 0) + 1;
    }

    return osCounts;
  },
};

