import prisma from '../lib/db.js';
import type { Assessment } from '@prisma/client';

export interface CreateAssessmentInput {
  groupId: string;
  name: string;
  azureLocation: string;
  status?: string;
  azureAssessmentId?: string;
}

export interface UpdateAssessmentInput {
  name?: string;
  status?: string;
  azureAssessmentId?: string;
  completedAt?: Date;
}

export const assessmentService = {
  /**
   * Get all assessments
   */
  async getAll(): Promise<Assessment[]> {
    return prisma.assessment.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        group: true,
      },
    });
  },

  /**
   * Get assessment by ID
   */
  async getById(id: string): Promise<Assessment | null> {
    return prisma.assessment.findUnique({
      where: { id },
      include: {
        group: true,
        results: true,
      },
    });
  },

  /**
   * Get assessments by group ID
   */
  async getByGroupId(groupId: string): Promise<Assessment[]> {
    return prisma.assessment.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Create a new assessment
   */
  async create(input: CreateAssessmentInput): Promise<Assessment> {
    return prisma.assessment.create({
      data: {
        groupId: input.groupId,
        name: input.name,
        azureLocation: input.azureLocation,
        status: input.status || 'Created',
        azureAssessmentId: input.azureAssessmentId,
      },
    });
  },

  /**
   * Update an assessment
   */
  async update(id: string, input: UpdateAssessmentInput): Promise<Assessment> {
    return prisma.assessment.update({
      where: { id },
      data: {
        name: input.name,
        status: input.status,
        azureAssessmentId: input.azureAssessmentId,
        completedAt: input.completedAt,
        updatedAt: new Date(),
      },
    });
  },

  /**
   * Delete an assessment
   */
  async delete(id: string): Promise<void> {
    await prisma.assessment.delete({
      where: { id },
    });
  },

  /**
   * Add assessment results
   */
  async addResults(
    assessmentId: string,
    results: Array<{
      machineId: string;
      machineName: string;
      readiness: string;
      suitability?: string;
      monthlyCostEstimate?: number;
      recommendedSize?: string;
      issues?: string[];
    }>
  ): Promise<void> {
    await prisma.assessmentResult.createMany({
      data: results.map((r) => ({
        assessmentId,
        machineId: r.machineId,
        machineName: r.machineName,
        readiness: r.readiness,
        suitability: r.suitability,
        monthlyCostEstimate: r.monthlyCostEstimate || 0,
        recommendedSize: r.recommendedSize,
        issues: r.issues ? JSON.stringify(r.issues) : null,
      })),
    });

    // Update assessment status
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        status: 'Completed',
        completedAt: new Date(),
      },
    });
  },

  /**
   * Get assessment results
   */
  async getResults(assessmentId: string) {
    return prisma.assessmentResult.findMany({
      where: { assessmentId },
    });
  },

  /**
   * Get assessment counts by status
   */
  async getCounts() {
    const assessments = await prisma.assessment.groupBy({
      by: ['status'],
      _count: true,
    });

    const counts: Record<string, number> = {
      total: 0,
      Created: 0,
      Running: 0,
      Completed: 0,
      Failed: 0,
    };

    for (const a of assessments) {
      counts[a.status] = a._count;
      counts.total += a._count;
    }

    return counts;
  },
};














