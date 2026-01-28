import { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: 'Health check endpoint',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              version: { type: 'string' },
              services: {
                type: 'object',
                properties: {
                  api: { type: 'string' },
                  azure: { type: 'string' },
                  database: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async () => {
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        services: {
          api: 'up',
          azure: 'pending', // Will check Azure connection
          database: 'pending', // Will check DB connection
        },
      };
    }
  );

  fastify.get(
    '/ready',
    {
      schema: {
        tags: ['Health'],
        summary: 'Readiness check endpoint',
      },
    },
    async () => {
      // TODO: Check all dependencies
      return { ready: true };
    }
  );
};

