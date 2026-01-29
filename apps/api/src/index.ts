import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import dotenv from 'dotenv';

import { healthRoutes } from './routes/health.js';
import { machineRoutes } from './routes/machines.js';
import { groupRoutes } from './routes/groups.js';
import { assessmentRoutes } from './routes/assessments.js';
import { replicationRoutes } from './routes/replication.js';
import { dataSourceRoutes } from './routes/data-sources.js';
import { targetRoutes } from './routes/targets.js';
import { settingsRoutes } from './routes/settings.js';
import { activityRoutes } from './routes/activity.js';
import { liftCleanseRoutes } from './routes/lift-cleanse.js';
import { syncRoutes } from './routes/sync.js';
import { statsRoutes } from './routes/stats.js';
import { syncSchedulerService } from './services/sync-scheduler.service.js';

// Load environment variables
dotenv.config();

const server = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport:
      process.env.NODE_ENV !== 'production'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
            },
          }
        : undefined,
  },
});

async function buildServer() {
  // Security
  await server.register(helmet, {
    contentSecurityPolicy: false, // Disable for API
  });

  // CORS - allow both port 3000 and 3001 for development flexibility
  await server.register(cors, {
    origin: process.env.FRONTEND_URL 
      ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
      : ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  });

  // Sensible defaults (error handling, etc.)
  await server.register(sensible);

  // Swagger Documentation
  await server.register(swagger, {
    openapi: {
      info: {
        title: 'DrMigrate Azure Sync API',
        description: 'API for Azure Migrate assessment and replication management',
        version: '1.0.0',
      },
      servers: [
        {
          url: `http://localhost:${process.env.PORT || 4000}`,
          description: 'Development server',
        },
      ],
      tags: [
        { name: 'Health', description: 'Health check endpoints' },
        { name: 'Sync', description: 'Data source synchronization scheduling' },
        { name: 'Statistics', description: 'Aggregate statistics and metrics' },
        { name: 'Machines', description: 'Machine inventory management' },
        { name: 'Data Sources', description: 'External data source management' },
        { name: 'Groups', description: 'Assessment group management' },
        { name: 'Assessments', description: 'Migration assessment operations' },
        { name: 'Replication', description: 'Replication management' },
        { name: 'Targets', description: 'Target configuration options' },
        { name: 'Settings', description: 'Azure configuration' },
        { name: 'Activity', description: 'Activity log' },
        { name: 'Lift & Cleanse', description: 'Post-migration VM management and script execution' },
      ],
    },
  });

  await server.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Register routes
  await server.register(healthRoutes, { prefix: '/api/v1' });
  await server.register(syncRoutes, { prefix: '/api/v1/sync' });
  await server.register(statsRoutes, { prefix: '/api/v1/stats' });
  await server.register(machineRoutes, { prefix: '/api/v1/machines' });
  await server.register(dataSourceRoutes, { prefix: '/api/v1/data-sources' });
  await server.register(groupRoutes, { prefix: '/api/v1/groups' });
  await server.register(assessmentRoutes, { prefix: '/api/v1/assessments' });
  await server.register(replicationRoutes, { prefix: '/api/v1/replication' });
  await server.register(targetRoutes, { prefix: '/api/v1/targets' });
  await server.register(settingsRoutes, { prefix: '/api/v1/settings' });
  await server.register(activityRoutes, { prefix: '/api/v1/activity' });
  await server.register(liftCleanseRoutes, { prefix: '/api/v1/lift-cleanse' });

  return server;
}

async function start() {
  try {
    const app = await buildServer();
    const port = parseInt(process.env.PORT || '4000', 10);
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });
    
    // Initialize sync schedules after server starts
    await syncSchedulerService.initializeSchedules();
    
    console.log(`
🚀 DrMigrate Azure Sync API is running! [v16 - Machine Matching & Sync]
   
   API:          http://localhost:${port}
   Docs:         http://localhost:${port}/docs
   Health:       http://localhost:${port}/api/v1/health
   Sync:         http://localhost:${port}/api/v1/sync
   Stats:        http://localhost:${port}/api/v1/stats
   Lift&Cleanse: http://localhost:${port}/api/v1/lift-cleanse
    `);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();

