/**
 * Health Check Routes (OpenAPI pattern)
 *
 * Comprehensive health monitoring endpoints for the expedition orchestration system.
 * Provides detailed system status, dependency health, and performance metrics.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { getConnection, StarshipRepository, UserRepository, AgentRepository } from '@starships/models';
import { logger } from '@starships/models';
import { ErrorUtils } from '@starships/errors';
import {
  sendSuccess,
  sendError,
  handleCommonError,
} from '../utils/responseHelpers';

const router: Router = Router();

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

// GET /health - Basic health check endpoint (OpenAPI pattern)
router.get('/health', async (req: Request, res: Response): Promise<void> => {
  const requestId = ErrorUtils.generateRequestId();
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
      const starshipRepo = new StarshipRepository();
      
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

    // Set appropriate HTTP status code and send response
    const statusCode = healthCheck.status === 'healthy' ? 200 :
                      healthCheck.status === 'degraded' ? 200 : 503;

    sendSuccess(res, healthCheck, statusCode);

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

    if (!handleCommonError(error, res, 'health check')) {
      sendError(res, "INTERNAL_SERVER_ERROR", 'Health check system failure', 503);
    }
  }
});

// GET /health/detailed - Detailed health check endpoint (OpenAPI pattern)
router.get('/health/detailed', async (req: Request, res: Response): Promise<void> => {
  const requestId = ErrorUtils.generateRequestId();
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
    const repositories = [
      { name: 'starshiprepository', instance: () => new StarshipRepository() },
      { name: 'userrepository', instance: () => new UserRepository() },
      { name: 'agentrepository', instance: () => new AgentRepository() },
    ];

    for (const repo of repositories) {
      try {
        const repoStart = Date.now();
        const repoInstance = repo.instance();
        
        // Test basic functionality
        await repoInstance.findAll();
        
        healthCheck.services[repo.name] = {
          status: 'healthy',
          responseTime: Date.now() - repoStart,
        };
      } catch (error) {
        healthCheck.services[repo.name] = {
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
    } catch {
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

    sendSuccess(res, healthCheck, statusCode);

  } catch (error) {
    logger.error('Detailed health check failed', {
      requestId,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
    });

    if (!handleCommonError(error, res, 'detailed health check')) {
      sendError(res, "INTERNAL_SERVER_ERROR", 'Health check system failure', 503);
    }
  }
});

// GET /health/ready - Readiness probe endpoint (OpenAPI pattern)
router.get('/health/ready', async (req: Request, res: Response): Promise<void> => {
  try {
    // Check if system is ready to accept requests
    const connection = getConnection();
    await connection.executeQuery('RETURN 1 as readiness_check');
    
    // Check if essential repositories are available
    const starshipRepo = new StarshipRepository();
    await starshipRepo.findAll();

    sendSuccess(res, {
      status: 'ready',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.warn('Readiness check failed', {
      error: { message: error instanceof Error ? error.message : 'Unknown error' },
    });

    if (!handleCommonError(error, res, 'readiness check')) {
      sendError(res, "SERVICE_UNAVAILABLE", error instanceof Error ? error.message : 'System not ready', 503);
    }
  }
});

// GET /health/live - Liveness probe endpoint (OpenAPI pattern)
router.get('/health/live', (req: Request, res: Response): void => {
  // Simple liveness check - if we can respond, we're alive
  sendSuccess(res, {
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// GET /health/metrics - System metrics endpoint (OpenAPI pattern)
router.get('/health/metrics', (req: Request, res: Response): void => {
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

    sendSuccess(res, metrics);

  } catch (error) {
    logger.error('Metrics collection failed', {
      error: { message: error instanceof Error ? error.message : 'Unknown error' },
    });

    if (!handleCommonError(error, res, 'metrics collection')) {
      sendError(res, "INTERNAL_SERVER_ERROR", 'Failed to collect metrics');
    }
  }
});

export default router;
