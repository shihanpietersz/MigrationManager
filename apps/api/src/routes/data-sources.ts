import { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import { dataSourceService, type DataSourceInput } from '../services/data-source.service.js';
import type { ApiResponse } from '@drmigrate/shared-types';

export const dataSourceRoutes: FastifyPluginAsync = async (fastify) => {
  // Register multipart support for file uploads
  await fastify.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB max
    },
  });

  // List all data sources
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Data Sources'],
        summary: 'List all configured data sources',
      },
    },
    async (): Promise<ApiResponse<unknown[]>> => {
      const sources = await dataSourceService.getAll();
      return {
        success: true,
        data: sources.map((s) => ({
          id: s.id,
          name: s.name,
          type: s.type,
          status: s.status,
          lastSyncAt: s.lastSyncAt?.toISOString(),
          lastError: s.lastError,
          machineCount: s._count.machines,
          importJobCount: s._count.importJobs,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
        })),
      };
    }
  );

  // Add a new data source
  fastify.post<{
    Body: DataSourceInput;
  }>(
    '/',
    {
      schema: {
        tags: ['Data Sources'],
        summary: 'Add a new data source',
        body: {
          type: 'object',
          required: ['name', 'type'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            type: { type: 'string', enum: ['database', 'csv', 'api'] },
            connectionString: { type: 'string' },
            apiEndpoint: { type: 'string' },
            apiKey: { type: 'string' },
            tableName: { type: 'string' },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<unknown>> => {
      const source = await dataSourceService.create(request.body);
      return {
        success: true,
        data: source,
      };
    }
  );

  // Get data source by ID
  fastify.get<{ Params: { sourceId: string } }>(
    '/:sourceId',
    {
      schema: {
        tags: ['Data Sources'],
        summary: 'Get data source details',
        params: {
          type: 'object',
          properties: {
            sourceId: { type: 'string' },
          },
          required: ['sourceId'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<unknown>> => {
      const source = await dataSourceService.getById(request.params.sourceId);

      if (!source) {
        reply.code(404);
        return {
          success: false,
          error: {
            code: 'SOURCE_NOT_FOUND',
            message: `Data source ${request.params.sourceId} not found`,
          },
        };
      }

      return {
        success: true,
        data: {
          ...source,
          machineCount: source._count.machines,
          importJobCount: source._count.importJobs,
        },
      };
    }
  );

  // Test data source connection
  fastify.post<{ Params: { sourceId: string } }>(
    '/:sourceId/test',
    {
      schema: {
        tags: ['Data Sources'],
        summary: 'Test data source connection',
        params: {
          type: 'object',
          properties: {
            sourceId: { type: 'string' },
          },
          required: ['sourceId'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<{ connected: boolean; message: string }>> => {
      const source = await dataSourceService.getById(request.params.sourceId);

      if (!source) {
        reply.code(404);
        return {
          success: false,
          error: {
            code: 'SOURCE_NOT_FOUND',
            message: `Data source ${request.params.sourceId} not found`,
          },
        };
      }

      // CSV sources are always "connected" (they're static imports)
      if (source.type === 'csv') {
        return {
          success: true,
          data: {
            connected: true,
            message: 'CSV import source is valid',
          },
        };
      }

      // TODO: Actually test database/API connections
      return {
        success: true,
        data: {
          connected: true,
          message: 'Connection test not implemented for this source type',
        },
      };
    }
  );

  // Sync data source
  fastify.post<{ Params: { sourceId: string } }>(
    '/:sourceId/sync',
    {
      schema: {
        tags: ['Data Sources'],
        summary: 'Sync machines from data source',
        params: {
          type: 'object',
          properties: {
            sourceId: { type: 'string' },
          },
          required: ['sourceId'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<{ message: string; count?: number }>> => {
      const source = await dataSourceService.getById(request.params.sourceId);

      if (!source) {
        reply.code(404);
        return {
          success: false,
          error: {
            code: 'SOURCE_NOT_FOUND',
            message: `Data source ${request.params.sourceId} not found`,
          },
        };
      }

      // CSV sources can't be re-synced - they need a new upload
      if (source.type === 'csv') {
        return {
          success: true,
          data: {
            message: 'CSV sources cannot be synced. Upload a new CSV file to update machines.',
            count: source._count.machines,
          },
        };
      }

      // TODO: Implement actual sync for database/API sources
      return {
        success: true,
        data: {
          message: 'Sync not implemented for this source type',
        },
      };
    }
  );

  // Delete data source
  fastify.delete<{ Params: { sourceId: string } }>(
    '/:sourceId',
    {
      schema: {
        tags: ['Data Sources'],
        summary: 'Delete data source',
        params: {
          type: 'object',
          properties: {
            sourceId: { type: 'string' },
          },
          required: ['sourceId'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<{ deleted: boolean }>> => {
      try {
        await dataSourceService.delete(request.params.sourceId);
        return {
          success: true,
          data: { deleted: true },
        };
      } catch (error) {
        reply.code(404);
        return {
          success: false,
          error: {
            code: 'SOURCE_NOT_FOUND',
            message: error instanceof Error ? error.message : 'Data source not found',
          },
        };
      }
    }
  );

  // Upload CSV file
  fastify.post(
    '/import/csv',
    {
      schema: {
        tags: ['Data Sources'],
        summary: 'Import machines from CSV file',
        consumes: ['multipart/form-data'],
      },
    },
    async (request, reply): Promise<ApiResponse<unknown>> => {
      try {
        const data = await request.file();

        if (!data) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: 'NO_FILE',
              message: 'No file uploaded',
            },
          };
        }

        // Validate file type
        const filename = data.filename.toLowerCase();
        if (!filename.endsWith('.csv')) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: 'INVALID_FILE_TYPE',
              message: 'Only CSV files are supported',
            },
          };
        }

        // Read file content
        const buffer = await data.toBuffer();
        const csvContent = buffer.toString('utf-8');

        // Get or create CSV data source
        const sourceName = `CSV Import - ${new Date().toLocaleDateString()}`;
        const sourceId = await dataSourceService.getOrCreateCSVSource(sourceName);

        // Import the CSV
        const result = await dataSourceService.importFromCSV(sourceId, csvContent);

        return {
          success: true,
          data: {
            jobId: result.jobId,
            sourceId,
            totalRecords: result.totalRecords,
            processedRecords: result.processedRecords,
            errorCount: result.errors.length,
            errors: result.errors.slice(0, 10), // Return first 10 errors
            message: `Imported ${result.processedRecords} of ${result.totalRecords} machines`,
          },
        };
      } catch (error) {
        reply.code(500);
        return {
          success: false,
          error: {
            code: 'IMPORT_FAILED',
            message: error instanceof Error ? error.message : 'Failed to import CSV',
          },
        };
      }
    }
  );

  // List import jobs
  fastify.get(
    '/import/jobs',
    {
      schema: {
        tags: ['Data Sources'],
        summary: 'List all import jobs',
      },
    },
    async (): Promise<ApiResponse<unknown[]>> => {
      const jobs = await dataSourceService.getImportJobs();
      return {
        success: true,
        data: jobs.map((j) => ({
          id: j.id,
          sourceId: j.sourceId,
          sourceName: j.source.name,
          status: j.status,
          totalRecords: j.totalRecords,
          processedRecords: j.processedRecords,
          errorCount: j.errorCount,
          startedAt: j.startedAt.toISOString(),
          completedAt: j.completedAt?.toISOString(),
        })),
      };
    }
  );

  // Get import job status
  fastify.get<{ Params: { jobId: string } }>(
    '/import/jobs/:jobId',
    {
      schema: {
        tags: ['Data Sources'],
        summary: 'Get import job status',
        params: {
          type: 'object',
          properties: {
            jobId: { type: 'string' },
          },
          required: ['jobId'],
        },
      },
    },
    async (request, reply): Promise<ApiResponse<unknown>> => {
      const job = await dataSourceService.getImportJob(request.params.jobId);

      if (!job) {
        reply.code(404);
        return {
          success: false,
          error: {
            code: 'JOB_NOT_FOUND',
            message: `Import job ${request.params.jobId} not found`,
          },
        };
      }

      return {
        success: true,
        data: {
          id: job.id,
          sourceId: job.sourceId,
          sourceName: job.source.name,
          status: job.status,
          totalRecords: job.totalRecords,
          processedRecords: job.processedRecords,
          errorCount: job.errorCount,
          errors: job.errors ? JSON.parse(job.errors) : [],
          startedAt: job.startedAt.toISOString(),
          completedAt: job.completedAt?.toISOString(),
        },
      };
    }
  );

  // Download CSV template
  fastify.get(
    '/import/template',
    {
      schema: {
        tags: ['Data Sources'],
        summary: 'Download CSV import template',
      },
    },
    async (_, reply) => {
      const csvTemplate = `hostname,ip_address,operating_system,cpu_cores,memory_mb,disk_size_gb
server-web-01,10.0.1.10,Windows Server 2022,4,8192,100
server-db-01,10.0.1.20,Ubuntu 22.04 LTS,8,32768,500
server-app-01,10.0.1.30,Red Hat Enterprise Linux 8,4,16384,200`;

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename="machine-import-template.csv"');
      return csvTemplate;
    }
  );

  // ============================================
  // DrMigrate SQL Server Connection Endpoints
  // ============================================

  // Test DrMigrate SQL Server connection
  fastify.post<{
    Body: {
      server: string;
      database: string;
      user: string;
      password: string;
      port?: number;
    };
  }>(
    '/drmigrate/test',
    {
      schema: {
        tags: ['Data Sources'],
        summary: 'Test DrMigrate SQL Server connection',
        description: 'Test connectivity to a DrMigrate SQL Server database before saving',
        body: {
          type: 'object',
          required: ['server', 'database', 'user', 'password'],
          properties: {
            server: { type: 'string', minLength: 1, description: 'SQL Server hostname (e.g., MYSERVER\\SQLEXPRESS)' },
            database: { type: 'string', minLength: 1, description: 'Database name (e.g., DrMigrate)' },
            user: { type: 'string', minLength: 1, description: 'SQL authentication username' },
            password: { type: 'string', minLength: 1, description: 'SQL authentication password' },
            port: { type: 'number', minimum: 1, maximum: 65535, description: 'SQL Server port (default: 1433)' },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<{ success: boolean; message: string; details?: unknown }>> => {
      const { drMigrateDbService } = await import('../services/drmigrate-db.service.js');
      
      const result = await drMigrateDbService.testConnection({
        server: request.body.server,
        database: request.body.database,
        user: request.body.user,
        password: request.body.password,
        port: request.body.port,
      });

      return {
        success: result.success,
        data: {
          success: result.success,
          message: result.message,
          details: result.details,
        },
      };
    }
  );

  // Save DrMigrate connection as a data source
  fastify.post<{
    Body: {
      name?: string;
      server: string;
      database: string;
      user: string;
      password: string;
      port?: number;
    };
  }>(
    '/drmigrate',
    {
      schema: {
        tags: ['Data Sources'],
        summary: 'Save DrMigrate SQL Server connection',
        description: 'Save a DrMigrate SQL Server connection as a data source for importing migration plans',
        body: {
          type: 'object',
          required: ['server', 'database', 'user', 'password'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100, description: 'Display name for the data source' },
            server: { type: 'string', minLength: 1 },
            database: { type: 'string', minLength: 1 },
            user: { type: 'string', minLength: 1 },
            password: { type: 'string', minLength: 1 },
            port: { type: 'number', minimum: 1, maximum: 65535 },
          },
        },
      },
    },
    async (request, reply): Promise<ApiResponse<unknown>> => {
      const { drMigrateDbService } = await import('../services/drmigrate-db.service.js');
      
      // First test the connection
      const testResult = await drMigrateDbService.testConnection({
        server: request.body.server,
        database: request.body.database,
        user: request.body.user,
        password: request.body.password,
        port: request.body.port,
      });

      if (!testResult.success) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'CONNECTION_FAILED',
            message: testResult.message,
          },
        };
      }

      // Serialize the connection config for storage
      const connectionString = drMigrateDbService.serializeConfig({
        server: request.body.server,
        database: request.body.database,
        user: request.body.user,
        password: request.body.password,
        port: request.body.port,
      });

      // Create the data source
      const displayName = request.body.name || `DrMigrate - ${request.body.server}/${request.body.database}`;
      
      const source = await dataSourceService.create({
        name: displayName,
        type: 'drmigrate-db',
        connectionString,
      });

      // Update status to connected since we just tested it
      await dataSourceService.updateStatus(source.id, 'connected');

      return {
        success: true,
        data: {
          id: source.id,
          name: source.name,
          type: source.type,
          status: 'connected',
          server: request.body.server,
          database: request.body.database,
          createdAt: source.createdAt.toISOString(),
        },
      };
    }
  );
};















