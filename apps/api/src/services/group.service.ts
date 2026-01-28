import prisma from '../lib/db.js';
import type { AssessmentGroup } from '@prisma/client';
import { activityService } from './activity.service.js';

export interface CreateGroupInput {
  name: string;
  description?: string;
  machineIds: string[];
}

export interface UpdateGroupInput {
  name?: string;
  description?: string;
  machineIds?: string[];
  status?: string;
}

export interface GroupMachineInfo {
  id: string;
  displayName: string;
  operatingSystem: string | null;
  ipAddresses: string[];
  type: 'discovered' | 'external';
  azureMigrateId?: string | null;
}

export const groupService = {
  /**
   * Get all groups
   */
  async getAll(): Promise<AssessmentGroup[]> {
    return prisma.assessmentGroup.findMany({
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Get group by ID with machines
   */
  async getById(id: string): Promise<AssessmentGroup | null> {
    return prisma.assessmentGroup.findUnique({
      where: { id },
    });
  },

  /**
   * Get machines in a group
   */
  async getGroupMachines(groupId: string): Promise<GroupMachineInfo[]> {
    const groupMachines = await prisma.groupMachine.findMany({
      where: { groupId },
      include: {
        discoveredMachine: true,
        externalMachine: true,
      },
    });

    // Helper to safely parse IP addresses which could be a JSON array string or plain string
    const parseIpAddresses = (ipStr: string | null): string[] => {
      if (!ipStr) return [];
      try {
        const parsed = JSON.parse(ipStr);
        if (Array.isArray(parsed)) return parsed;
        // If parsed is a string, wrap it in an array
        if (typeof parsed === 'string') return [parsed];
        return [];
      } catch {
        // If JSON.parse fails, it's a plain string - wrap in array
        return ipStr ? [ipStr] : [];
      }
    };

    return groupMachines.map((gm) => {
      if (gm.machineType === 'discovered' && gm.discoveredMachine) {
        return {
          id: gm.discoveredMachine.id,
          displayName: gm.discoveredMachine.displayName,
          operatingSystem: gm.discoveredMachine.operatingSystem,
          ipAddresses: parseIpAddresses(gm.discoveredMachine.ipAddresses),
          type: 'discovered' as const,
          azureMigrateId: gm.discoveredMachine.azureMigrateId,
        };
      } else if (gm.externalMachine) {
        return {
          id: gm.externalMachine.id,
          displayName: gm.externalMachine.hostname,
          operatingSystem: gm.externalMachine.operatingSystem,
          ipAddresses: parseIpAddresses(gm.externalMachine.ipAddresses),
          type: 'external' as const,
          azureMigrateId: null,
        };
      }
      return null;
    }).filter((m): m is GroupMachineInfo => m !== null);
  },

  /**
   * Determine if a machine ID belongs to discovered or external machine
   */
  async getMachineType(machineId: string): Promise<'discovered' | 'external' | null> {
    // Check discovered machines first
    const discovered = await prisma.discoveredMachine.findUnique({
      where: { id: machineId },
      select: { id: true },
    });
    if (discovered) return 'discovered';

    // Check external machines
    const external = await prisma.externalMachine.findUnique({
      where: { id: machineId },
      select: { id: true },
    });
    if (external) return 'external';

    return null;
  },

  /**
   * Create a new group
   */
  async create(input: CreateGroupInput): Promise<AssessmentGroup> {
    const group = await prisma.assessmentGroup.create({
      data: {
        name: input.name,
        description: input.description,
        machineCount: input.machineIds.length,
        status: 'created',
      },
    });

    // Add machines to group
    if (input.machineIds.length > 0) {
      const machineData = await Promise.all(
        input.machineIds.map(async (machineId) => {
          const type = await this.getMachineType(machineId);
          if (!type) return null;

          return {
            groupId: group.id,
            machineType: type,
            discoveredMachineId: type === 'discovered' ? machineId : null,
            externalMachineId: type === 'external' ? machineId : null,
          };
        })
      );

      const validMachineData = machineData.filter((d): d is NonNullable<typeof d> => d !== null);

      if (validMachineData.length > 0) {
        // Use individual creates wrapped in a transaction to handle potential duplicates
        await prisma.$transaction(
          validMachineData.map((data) =>
            prisma.groupMachine.create({
              data,
            })
          )
        );
      }

      // Update machine count if some were invalid
      if (validMachineData.length !== input.machineIds.length) {
        await prisma.assessmentGroup.update({
          where: { id: group.id },
          data: { machineCount: validMachineData.length },
        });
      }
    }

    await activityService.log({
      type: 'assessment',
      action: 'created',
      title: `Created group "${group.name}"`,
      description: `${input.machineIds.length} machines added`,
      status: 'success',
      entityType: 'group',
      entityId: group.id,
    });

    return group;
  },

  /**
   * Update a group
   */
  async update(id: string, input: UpdateGroupInput): Promise<AssessmentGroup> {
    const group = await prisma.assessmentGroup.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        status: input.status,
        updatedAt: new Date(),
      },
    });

    // Update machines if provided
    if (input.machineIds !== undefined) {
      // Remove existing machines
      await prisma.groupMachine.deleteMany({
        where: { groupId: id },
      });

      // Add new machines
      if (input.machineIds.length > 0) {
        const machineData = await Promise.all(
          input.machineIds.map(async (machineId) => {
            const type = await this.getMachineType(machineId);
            if (!type) return null;

            return {
              groupId: id,
              machineType: type,
              discoveredMachineId: type === 'discovered' ? machineId : null,
              externalMachineId: type === 'external' ? machineId : null,
            };
          })
        );

        const validMachineData = machineData.filter((d): d is NonNullable<typeof d> => d !== null);

        if (validMachineData.length > 0) {
          // Use individual creates wrapped in a transaction
          await prisma.$transaction(
            validMachineData.map((data) =>
              prisma.groupMachine.create({
                data,
              })
            )
          );
        }
      }

      // Update machine count
      await prisma.assessmentGroup.update({
        where: { id },
        data: { machineCount: input.machineIds.length },
      });
    }

    return group;
  },

  /**
   * Delete a group
   */
  async delete(id: string): Promise<void> {
    const group = await prisma.assessmentGroup.findUnique({ where: { id } });
    
    await prisma.assessmentGroup.delete({
      where: { id },
    });

    if (group) {
      await activityService.log({
        type: 'assessment',
        action: 'deleted',
        title: `Deleted group "${group.name}"`,
        status: 'info',
        entityType: 'group',
        entityId: id,
      });
    }
  },

  /**
   * Get group counts by status
   */
  async getCounts() {
    const groups = await prisma.assessmentGroup.groupBy({
      by: ['status'],
      _count: true,
    });

    const counts: Record<string, number> = {
      total: 0,
      created: 0,
      assessing: 0,
      assessed: 0,
      replicating: 0,
    };

    for (const g of groups) {
      counts[g.status] = g._count;
      counts.total += g._count;
    }

    return counts;
  },
};
