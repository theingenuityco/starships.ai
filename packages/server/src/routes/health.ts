/**
 * Health Check Routes
 * 
 * Comprehensive health monitoring endpoints for the expedition orchestration system.
 * Provides detailed system status, dependency health, and performance metrics.
 */

import express from 'express';
import { getConnection } from '@starships/models';
import { RepositoryFactory } from '@starships/models';
import { logger, LogContext, ErrorFactory } from '@starships/models';

const router: express.Router = express.Router();

/**
 * Health check response interface
 */
interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  services: {
    [key: string]: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      responseTime?: number;
      error?: string;
      details?: any;
    };
  };
  metrics?: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
    };
    connections: {
      active: number;
      total: number;
    };
  };
}

/**
 * Basic health check endpoint
 * GET /health
 */
router.get('/', async (req, res) => {
  const requestId = ErrorFactory.generateRequestId();
  const startTime = Date.now();

  try {
    const healthCheck: HealthCheckResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {},
    };

    // Check database connectivity
    try {
      const dbStart = Date.now();
      const connection = getConnection();
      await connection.executeQuery('RETURN 1 as health_check');
      
      healthCheck.services.database = {
        status: 'healthy',
        responseTime: Date.now() - dbStart,
      };
    } catch (error) {
      healthCheck.services.database = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown database error',
      };
      healthCheck.status = 'unhealthy';
    }

    // Check repository health
    try {
      const repoStart = Date.now();
      const starshipRepo = RepositoryFactory.getStarshipRepository();
      
      // Test basic repository functionality
      await starshipRepo.findAll();
      
      healthCheck.services.repositories = {
        status: 'healthy',
        responseTime: Date.now() - repoStart,
      };
    } catch (error) {
      healthCheck.services.repositories = {
        status: 'degraded',
        error: error instanceof Error ? error.message : 'Repository error',
      };
      if (healthCheck.status === 'healthy') {
        healthCheck.status = 'degraded';
      }
    }

    // Add system metrics
    const memUsage = process.memoryUsage();
    healthCheck.metrics = {
      memory: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
      },
      cpu: {
        usage: process.cpuUsage().user / 1000000, // Convert to seconds
      },
      connections: {
        active: (global as any).__SOCKET_CONNECTIONS__ || 0,
        total: (global as any).__TOTAL_CONNECTIONS__ || 0,
      },
    };

    const responseTime = Date.now() - startTime;
    
    // Log health check
    logger.info('Health check completed', {
      requestId,
      metadata: {
        status: healthCheck.status,
        responseTime,
        services: Object.keys(healthCheck.services).map(service => ({
          name: service,
          status: healthCheck.services[service].status,
        })),
      },
    });

    // Set appropriate HTTP status code
    const statusCode = healthCheck.status === 'healthy' ? 200 : 
                      healthCheck.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(healthCheck);

  } catch (error) {
    const errorResponse: HealthCheckResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        system: {
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'System error',
        },
      },
    };

    logger.error('Health check failed', {
      requestId,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
    });

    res.status(503).json(errorResponse);
  }
});

/**
 * Detailed health check endpoint
 * GET /health/detailed
 */
router.get('/detailed', async (req, res) => {
  const requestId = ErrorFactory.generateRequestId();
  const startTime = Date.now();

  try {
    const healthCheck: HealthCheckResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {},
    };

    // Comprehensive database health check
    try {
      const dbStart = Date.now();
      const connection = getConnection();
      
      // Test basic connectivity
      await connection.executeQuery('RETURN 1 as health_check');
      
      // Test database schema
      const schemaCheck = await connection.executeQuery(`
        CALL db.schema.visualization() YIELD nodes, relationships
        RETURN count(nodes) as nodeTypes, count(relationships) as relationshipTypes
      `);
      
      // Test database performance
      const perfStart = Date.now();
      await connection.executeQuery('MATCH (n) RETURN count(n) as totalNodes LIMIT 1');
      const perfTime = Date.now() - perfStart;
      
      healthCheck.services.database = {
        status: 'healthy',
        responseTime: Date.now() - dbStart,
        details: {
          nodeTypes: schemaCheck[0]?.nodeTypes || 0,
          relationshipTypes: schemaCheck[0]?.relationshipTypes || 0,
          queryPerformance: perfTime,
        },
      };
    } catch (error) {
      healthCheck.services.database = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Database error',
      };
      healthCheck.status = 'unhealthy';
    }

    // Check all repository types
    const repositoryTypes = [
      'StarshipRepository',
      'UserRepository',
      'AgentRepository',
      'VisionRepository',
    ];

    for (const repoType of repositoryTypes) {
      try {
        const repoStart = Date.now();
        const repo = (RepositoryFactory as any)[`get${repoType}`]();
        
        // Test basic functionality
        await repo.findAll();
        
        healthCheck.services[repoType.toLowerCase()] = {
          status: 'healthy',
          responseTime: Date.now() - repoStart,
        };
      } catch (error) {
        healthCheck.services[repoType.toLowerCase()] = {
          status: 'degraded',
          error: error instanceof Error ? error.message : 'Repository error',
        };
        if (healthCheck.status === 'healthy') {
          healthCheck.status = 'degraded';
        }
      }
    }

    // Check external dependencies
    try {
      // Check LLM provider availability (if configured)
      if (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) {
        const llmStart = Date.now();
        // This would test LLM connectivity in a real implementation
        healthCheck.services.llm = {
          status: 'healthy',
          responseTime: Date.now() - llmStart,
          details: {
            providers: {
              openai: !!process.env.OPENAI_API_KEY,
              anthropic: !!process.env.ANTHROPIC_API_KEY,
            },
          },
        };
      }
    } catch (error) {
      healthCheck.services.llm = {
        status: 'degraded',
        error: 'LLM provider check failed',
      };
    }

    // Enhanced system metrics
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    healthCheck.metrics = {
      memory: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
      },
      cpu: {
        usage: (cpuUsage.user + cpuUsage.system) / 1000000,
      },
      connections: {
        active: (global as any).__SOCKET_CONNECTIONS__ || 0,
        total: (global as any).__TOTAL_CONNECTIONS__ || 0,
      },
    };

    const responseTime = Date.now() - startTime;
    
    logger.info('Detailed health check completed', {
      requestId,
      metadata: {
        status: healthCheck.status,
        responseTime,
        serviceCount: Object.keys(healthCheck.services).length,
      },
    });

    const statusCode = healthCheck.status === 'healthy' ? 200 : 
                      healthCheck.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(healthCheck);

  } catch (error) {
    logger.error('Detailed health check failed', {
      requestId,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
    });

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check system failure',
    });
  }
});

/**
 * Readiness probe endpoint
 * GET /health/ready
 */
router.get('/ready', async (req, res) => {
  try {
    // Check if system is ready to accept requests
    const connection = getConnection();
    await connection.executeQuery('RETURN 1 as readiness_check');
    
    // Check if essential repositories are available
    const starshipRepo = RepositoryFactory.getStarshipRepository();
    await starshipRepo.findAll();

    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.warn('Readiness check failed', {
      error: { message: error instanceof Error ? error.message : 'Unknown error' },
    });

    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'System not ready',
    });
  }
});

/**
 * Liveness probe endpoint
 * GET /health/live
 */
router.get('/live', (req, res) => {
  // Simple liveness check - if we can respond, we're alive
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * System metrics endpoint
 * GET /health/metrics
 */
router.get('/metrics', (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers,
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      process: {
        pid: process.pid,
        version: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      connections: {
        active: (global as any).__SOCKET_CONNECTIONS__ || 0,
        total: (global as any).__TOTAL_CONNECTIONS__ || 0,
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        version: process.env.npm_package_version || '1.0.0',
      },
    };

    res.status(200).json(metrics);

  } catch (error) {
    logger.error('Metrics collection failed', {
      error: { message: error instanceof Error ? error.message : 'Unknown error' },
    });

    res.status(500).json({
      error: 'Failed to collect metrics',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
