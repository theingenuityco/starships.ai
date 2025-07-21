/**
 * Comprehensive Health Check Endpoints for Starships.ai
 *
 * This module provides detailed health checks for all system components
 * including database connectivity, repository health, service dependencies,
 * and system resource monitoring.
 */

import { Router, Request, Response } from 'express';
import { logger, HealthMonitor, PerformanceMonitor } from '@starships/models/src/logging';
import {
  DatabaseError,
  ServiceUnavailableError,
  ErrorHandlerUtils,
} from '../middleware/errorHandler';
import { getConnection } from '@starships/models';
import {
  AgentRepository,
  StarshipRepository,
  MCPServerOptionRepository,
  MCPServerConnectorRepository,
  UserRepository,
} from '@starships/models';

const router: Router = Router();

/**
 * Basic health check endpoint
 * GET /health
 */
router.get('/health', (req: Request, res: Response) => {
  try {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      requestId: req.requestId,
    };

    logger.info('Basic health check requested', {
      requestId: req.requestId,
      component: 'health',
      path: req.path,
    });

    res.json(healthStatus);
  } catch (error) {
    logger.error(
      'Basic health check failed',
      {
        requestId: req.requestId,
        component: 'health',
        path: req.path,
      },
      error as Error
    );

    res.status(503).json({
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: 'Health check failed',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      },
    });
  }
});

/**
 * Database health check endpoint
 * GET /health/database
 */
router.get('/health/database', async (req: Request, res: Response) => {
  try {
    const dbHealthStatus = await HealthMonitor.checkService(
      'neo4j-database',
      async () => {
        const connection = getConnection();

        // Test basic connectivity
        const result = await connection.executeQuery('RETURN 1 as test');
        if (!result || result.length === 0) {
          throw new Error('Database query returned no results');
        }

        // Test node count (basic functionality)
        const nodeCountResult = await connection.executeQuery<{ count: number }>(
          'MATCH (n) RETURN count(n) as count LIMIT 1'
        );

        return nodeCountResult.length > 0;
      },
      5000 // 5 second timeout
    );

    if (dbHealthStatus.status === 'healthy') {
      res.json({
        status: 'healthy',
        service: 'database',
        details: dbHealthStatus,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    } else {
      res.status(503).json({
        error: {
          code: 'DATABASE_UNHEALTHY',
          message: 'Database health check failed',
          service: 'database',
          details: dbHealthStatus,
          timestamp: new Date().toISOString(),
          requestId: req.requestId,
        },
      });
    }
  } catch (error) {
    logger.error(
      'Database health check failed',
      {
        requestId: req.requestId,
        component: 'health',
        path: req.path,
      },
      error as Error
    );

    const dbError = ErrorHandlerUtils.database('Database health check failed', 'health-check', req);

    res.status(503).json({
      error: dbError.toResponse(),
    });
  }
});

/**
 * Repository health check endpoint
 * GET /health/repositories
 */
router.get('/health/repositories', async (req: Request, res: Response) => {
  try {
    const repositoryHealthChecks = await Promise.allSettled([
      // Agent Repository Health
      HealthMonitor.checkService('agent-repository', async () => {
        const agentRepo = new AgentRepository();
        const agents = await agentRepo.findAll();
        return Array.isArray(agents);
      }),

      // Starship Repository Health
      HealthMonitor.checkService('starship-repository', async () => {
        const starshipRepo = new StarshipRepository();
        const starships = await starshipRepo.findAll();
        return Array.isArray(starships);
      }),

      // MCP Server Option Repository Health
      HealthMonitor.checkService('mcp-server-option-repository', async () => {
        const mcpServerRepo = new MCPServerOptionRepository();
        const mcpServers = await mcpServerRepo.findAll();
        return Array.isArray(mcpServers);
      }),

      // MCP Server Connector Repository Health
      HealthMonitor.checkService('mcp-server-connector-repository', async () => {
        const mcpConnectorRepo = new MCPServerConnectorRepository();
        const connectors = await mcpConnectorRepo.findAll();
        return Array.isArray(connectors);
      }),

      // User Repository Health
      HealthMonitor.checkService('user-repository', async () => {
        const userRepo = new UserRepository();
        const users = await userRepo.findAll();
        return Array.isArray(users);
      }),
    ]);

    const repositoryStatuses = repositoryHealthChecks.map((result, index) => {
      const repoNames = [
        'agent-repository',
        'starship-repository',
        'mcp-server-option-repository',
        'mcp-server-connector-repository',
        'user-repository',
      ];

      if (result.status === 'fulfilled') {
        return {
          repository: repoNames[index],
          status: result.value.status,
          responseTime: result.value.responseTime,
          timestamp: result.value.timestamp,
        };
      } else {
        return {
          repository: repoNames[index],
          status: 'unhealthy',
          error: result.reason?.message || 'Unknown error',
          timestamp: new Date().toISOString(),
        };
      }
    });

    const allHealthy = repositoryStatuses.every((repo) => repo.status === 'healthy');
    const overallStatus = allHealthy ? 'healthy' : 'degraded';

    const response = {
      status: overallStatus,
      service: 'repositories',
      repositories: repositoryStatuses,
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    };

    if (allHealthy) {
      res.json(response);
    } else {
      res.status(503).json({
        error: {
          code: 'REPOSITORIES_UNHEALTHY',
          message: 'One or more repositories are unhealthy',
          ...response,
        },
      });
    }
  } catch (error) {
    logger.error(
      'Repository health check failed',
      {
        requestId: req.requestId,
        component: 'health',
        path: req.path,
      },
      error as Error
    );

    const serviceError = new ServiceUnavailableError(
      'Repository health check failed',
      'repositories',
      30,
      undefined,
      req.requestId,
      req.path
    );

    res.status(503).json({
      error: serviceError.toResponse(),
    });
  }
});

/**
 * System resources health check endpoint
 * GET /health/system
 */
router.get('/health/system', async (req: Request, res: Response) => {
  try {
    const systemHealth = await PerformanceMonitor.measure('system-health-check', async () => {
      // Memory usage
      const memoryUsage = process.memoryUsage();
      const memoryUsageMB = {
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
      };

      // CPU usage (approximation)
      const cpuUsage = process.cpuUsage();

      // System uptime
      const uptime = process.uptime();

      // Node.js version
      const nodeVersion = process.version;

      // Environment info
      const environment = {
        nodeEnv: process.env.NODE_ENV || 'development',
        platform: process.platform,
        arch: process.arch,
        nodeVersion,
      };

      // Health thresholds
      const memoryThreshold = 1024; // 1GB
      const uptimeThreshold = 60; // 1 minute minimum uptime

      const isHealthy = memoryUsageMB.heapUsed < memoryThreshold && uptime > uptimeThreshold;

      return {
        status: isHealthy ? 'healthy' : 'degraded',
        memory: memoryUsageMB,
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
        },
        uptime: Math.round(uptime),
        environment,
        thresholds: {
          memoryThreshold,
          uptimeThreshold,
        },
      };
    });

    const response = {
      ...systemHealth,
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    };

    if (systemHealth.status === 'healthy') {
      res.json(response);
    } else {
      res.status(503).json({
        error: {
          code: 'SYSTEM_DEGRADED',
          message: 'System resources are degraded',
          ...response,
        },
      });
    }
  } catch (error) {
    logger.error(
      'System health check failed',
      {
        requestId: req.requestId,
        component: 'health',
        path: req.path,
      },
      error as Error
    );

    const serviceError = new ServiceUnavailableError(
      'System health check failed',
      'system',
      30,
      undefined,
      req.requestId,
      req.path
    );

    res.status(503).json({
      error: serviceError.toResponse(),
    });
  }
});

/**
 * Comprehensive health check endpoint
 * GET /health/comprehensive
 */
router.get('/health/comprehensive', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();

    // Run all health checks in parallel
    const [basicHealth, dbHealth, repoHealth, systemHealth] = await Promise.allSettled([
      // Basic health
      Promise.resolve({
        status: 'healthy',
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
      }),

      // Database health
      HealthMonitor.checkService('neo4j-database', async () => {
        const connection = getConnection();
        const result = await connection.executeQuery('RETURN 1 as test');
        return result && result.length > 0;
      }),

      // Repository health (simplified)
      HealthMonitor.checkService('repositories', async () => {
        const agentRepo = new AgentRepository();
        await agentRepo.findAll();
        return true;
      }),

      // System health
      PerformanceMonitor.measure('system-check', async () => {
        const memoryUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
        return { status: heapUsedMB < 1024 ? 'healthy' : 'degraded', heapUsedMB };
      }),
    ]);

    const totalDuration = Date.now() - startTime;

    // Process results
    const healthResults = {
      basic:
        basicHealth.status === 'fulfilled'
          ? basicHealth.value
          : { status: 'unhealthy', error: basicHealth.reason },
      database:
        dbHealth.status === 'fulfilled'
          ? dbHealth.value
          : { status: 'unhealthy', error: dbHealth.reason },
      repositories:
        repoHealth.status === 'fulfilled'
          ? repoHealth.value
          : { status: 'unhealthy', error: repoHealth.reason },
      system:
        systemHealth.status === 'fulfilled'
          ? systemHealth.value
          : { status: 'unhealthy', error: systemHealth.reason },
    };

    // Determine overall status
    const allHealthy = Object.values(healthResults).every((result) => result.status === 'healthy');
    const anyUnhealthy = Object.values(healthResults).some(
      (result) => result.status === 'unhealthy'
    );

    const overallStatus = allHealthy ? 'healthy' : anyUnhealthy ? 'unhealthy' : 'degraded';

    const response = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      duration: totalDuration,
      checks: healthResults,
      requestId: req.requestId,
    };

    // Log comprehensive health check
    logger.info(`Comprehensive health check completed: ${overallStatus}`, {
      requestId: req.requestId,
      component: 'health',
      path: req.path,
      duration: totalDuration,
      metadata: { overallStatus, checkCount: Object.keys(healthResults).length },
    });

    if (overallStatus === 'healthy') {
      res.json(response);
    } else {
      res.status(503).json({
        error: {
          code: 'SYSTEM_UNHEALTHY',
          message: `System health check failed: ${overallStatus}`,
          ...response,
        },
      });
    }
  } catch (error) {
    logger.error(
      'Comprehensive health check failed',
      {
        requestId: req.requestId,
        component: 'health',
        path: req.path,
      },
      error as Error
    );

    const serviceError = new ServiceUnavailableError(
      'Comprehensive health check failed',
      'system',
      60,
      undefined,
      req.requestId,
      req.path
    );

    res.status(503).json({
      error: serviceError.toResponse(),
    });
  }
});

/**
 * Health check readiness probe (for Kubernetes/Docker)
 * GET /health/ready
 */
router.get('/health/ready', async (req: Request, res: Response) => {
  try {
    // Quick readiness check - database connectivity
    const connection = getConnection();
    await connection.executeQuery('RETURN 1');

    res.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });
  } catch (error) {
    logger.warn(
      'Readiness check failed',
      {
        requestId: req.requestId,
        component: 'health',
        path: req.path,
      },
      error as Error
    );

    res.status(503).json({
      error: {
        code: 'NOT_READY',
        message: 'Service is not ready',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      },
    });
  }
});

/**
 * Health check liveness probe (for Kubernetes/Docker)
 * GET /health/live
 */
router.get('/health/live', (req: Request, res: Response) => {
  // Simple liveness check - if we can respond, we're alive
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    requestId: req.requestId,
  });
});

export default router;
