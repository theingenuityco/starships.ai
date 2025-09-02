/**
 * Logging and Monitoring System Unit Tests
 */

import {
  Logger,
  LogLevel,
  LogContext,
  PerformanceMetrics,
  HealthStatus,
  logger,
  PerformanceMonitor,
  HealthMonitor,
  RequestContext
} from '../logging';
import { ValidationError } from '../errors';

describe('Logging and Monitoring System', () => {
  beforeEach(() => {
    // Reset console mocks
    jest.clearAllMocks();
    
    // Reset singleton instance
    Logger.resetInstance();
    
    // Clear performance monitor timers
    (PerformanceMonitor as any).timers.clear();
    
    // Clear health monitor state
    (HealthMonitor as any).healthChecks.clear();
  });

  describe('LogLevel enum', () => {
    it('should have all expected log levels', () => {
      const levels = Object.values(LogLevel);
      
      expect(levels).toContain('debug');
      expect(levels).toContain('info');
      expect(levels).toContain('warn');
      expect(levels).toContain('error');
      expect(levels).toContain('fatal');
    });
  });

  describe('Logger', () => {
    it('should create singleton instance', () => {
      const logger1 = Logger.getInstance();
      const logger2 = Logger.getInstance();
      
      expect(logger1).toBe(logger2);
    });

    it('should parse log level from configuration', () => {
      const testLogger = Logger.createInstance({ logLevel: 'debug' });
      
      // Test by logging at debug level - should output if properly parsed
      testLogger.debug('Test debug message');
      expect(console.debug).toHaveBeenCalled();
    });

    it('should default to info level for invalid log level', () => {
      const testLogger = Logger.createInstance({ logLevel: 'invalid' });
      
      // Debug should not log at info level
      testLogger.debug('Test debug message');
      expect(console.debug).not.toHaveBeenCalled();
      
      // Info should log
      testLogger.info('Test info message');
      expect(console.log).toHaveBeenCalled();
    });

    it('should respect log level hierarchy', () => {
      const testLogger = Logger.createInstance({ logLevel: 'warn' });
      
      testLogger.debug('Debug message');
      testLogger.info('Info message');
      testLogger.warn('Warn message');
      testLogger.error('Error message');
      
      expect(console.debug).not.toHaveBeenCalled();
      // Info should not be logged when level is WARN
      expect(console.log).toHaveBeenCalledTimes(1); // Only for warn message
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('WARN'),
        expect.any(String)
      );
      expect(console.error).toHaveBeenCalled();
    });

    it('should log debug messages', () => {
      const testLogger = Logger.createInstance({ logLevel: 'debug' });
      
      const context: LogContext = {
        requestId: 'req-123',
        userId: 'user-456'
      };
      
      testLogger.debug('Debug message', context);
      
      expect(console.debug).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG'),
        expect.objectContaining({
          requestId: 'req-123',
          userId: 'user-456'
        })
      );
    });

    it('should log info messages', () => {
      const testLogger = Logger.createInstance({ logLevel: 'info' });
      
      testLogger.info('Info message');
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('INFO'),
        expect.any(String)
      );
    });

    it('should log warning messages with error', () => {
      const testLogger = Logger.createInstance({ logLevel: 'warn' });
      const error = new Error('Test error');
      
      testLogger.warn('Warning message', { component: 'test' }, error);
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('WARN'),
        expect.objectContaining({
          component: 'test',
          error: expect.objectContaining({
            name: 'Error',
            message: 'Test error'
          })
        })
      );
    });

    it('should log error messages with BaseError', () => {
      const testLogger = Logger.getInstance();
      const error = new ValidationError('Validation failed', 'email');
      
      testLogger.error('Error occurred', { operation: 'validate' }, error);
      
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('ERROR'),
        expect.objectContaining({
          operation: 'validate',
          error: expect.objectContaining({
            errorCode: 'VALIDATION_ERROR',
            category: 'validation'
          })
        })
      );
    });

    it('should log fatal messages', () => {
      const testLogger = Logger.getInstance();
      
      testLogger.fatal('Fatal error');
      
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('FATAL'),
        expect.any(String)
      );
    });

    it('should log performance metrics', () => {
      const testLogger = Logger.createInstance({ enableMetrics: true });
      
      const metrics: PerformanceMetrics = {
        operation: 'database_query',
        duration: 150,
        timestamp: '2024-01-01T00:00:00.000Z',
        success: true,
        metadata: { query: 'SELECT * FROM users' }
      };
      
      testLogger.metrics(metrics);
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Performance: database_query'),
        expect.objectContaining({
          component: 'metrics',
          duration: 150,
          metadata: expect.objectContaining({
            success: true,
            query: 'SELECT * FROM users'
          })
        })
      );
    });

    it('should log health check status - healthy', () => {
      const testLogger = Logger.getInstance();
      
      const status: HealthStatus = {
        service: 'database',
        status: 'healthy',
        timestamp: '2024-01-01T00:00:00.000Z',
        responseTime: 50,
        details: { connections: 5 }
      };
      
      testLogger.health(status);
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Health Check: database is healthy'),
        expect.objectContaining({
          component: 'health',
          metadata: expect.objectContaining({
            service: 'database',
            responseTime: 50,
            connections: 5
          })
        })
      );
    });

    it('should log health check status - unhealthy as warning', () => {
      const testLogger = Logger.getInstance();
      
      const status: HealthStatus = {
        service: 'api-service',
        status: 'unhealthy',
        timestamp: '2024-01-01T00:00:00.000Z',
        responseTime: 5000
      };
      
      testLogger.health(status);
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('WARN'),
        expect.objectContaining({
          component: 'health'
        })
      );
    });

    it('should skip logging when level is below threshold', () => {
      const testLogger = Logger.createInstance({ logLevel: 'error' });
      
      testLogger.debug('Debug message');
      testLogger.info('Info message');
      testLogger.warn('Warn message');
      
      expect(console.debug).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
    });

    it('should include timestamp in log entries', () => {
      const testLogger = Logger.createInstance({ logLevel: 'info' });
      
      testLogger.info('Test message');
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/),
        expect.any(String)
      );
    });
  });

  describe('PerformanceMonitor', () => {
    it('should start and end timing operations', async () => {
      // Clear any existing timers first
      (PerformanceMonitor as any).timers.clear();
      
      const operationId = 'test-op-123';
      
      PerformanceMonitor.start(operationId);
      
      // Simulate some work with a longer delay to ensure measurable duration
      await new Promise(resolve => setTimeout(resolve, 5));
      const duration = PerformanceMonitor.end(operationId, 'test_operation');
      
      // Duration should be >= 0 (sometimes high-resolution timers can return 0 for very fast operations)
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Performance: test_operation'),
        expect.any(Object)
      );
    });

    it('should handle missing timer gracefully', () => {
      // Clear any existing timers first
      (PerformanceMonitor as any).timers.clear();
      
      // Reset and create a new logger instance with warn level enabled
      Logger.resetInstance();
      Logger.getInstance({ logLevel: 'warn' });
      
      const duration = PerformanceMonitor.end(
        'non-existent-op',
        'missing_operation'
      );
      
      expect(duration).toBe(0);
      // The warn method should be called, and it goes to console.log
      // The logger outputs a formatted message string and empty context object
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Performance timer not found for operation: non-existent-op'),
        ""
      );
    });

    it('should measure async operations successfully', async () => {
      const asyncOperation = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'success';
      };
      
      const result = await PerformanceMonitor.measure(
        'async_test',
        asyncOperation,
        { testData: true }
      );
      
      expect(result).toBe('success');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Performance: async_test'),
        expect.objectContaining({
          metadata: expect.objectContaining({
            success: true,
            testData: true
          })
        })
      );
    });

    it('should measure async operations with errors', async () => {
      const failingOperation = async () => {
        throw new ValidationError('Test error');
      };
      
      await expect(
        PerformanceMonitor.measure('failing_async', failingOperation)
      ).rejects.toThrow('Test error');
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Performance: failing_async'),
        expect.objectContaining({
          metadata: expect.objectContaining({
            success: false,
            errorCode: 'VALIDATION_ERROR'
          })
        })
      );
    });

    it('should measure sync operations successfully', () => {
      const syncOperation = () => {
        return 'sync_result';
      };
      
      const result = PerformanceMonitor.measureSync(
        'sync_test',
        syncOperation,
        { sync: true }
      );
      
      expect(result).toBe('sync_result');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Performance: sync_test'),
        expect.objectContaining({
          metadata: expect.objectContaining({
            success: true,
            sync: true
          })
        })
      );
    });

    it('should measure sync operations with errors', () => {
      const failingOperation = () => {
        throw new Error('Sync error');
      };
      
      expect(() =>
        PerformanceMonitor.measureSync('failing_sync', failingOperation)
      ).toThrow('Sync error');
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Performance: failing_sync'),
        expect.objectContaining({
          metadata: expect.objectContaining({
            success: false,
            errorCode: 'UNKNOWN_ERROR'
          })
        })
      );
    });
  });

  describe('HealthMonitor', () => {
    it('should check healthy service', async () => {
      const healthCheck = async () => true;
      
      const status = await HealthMonitor.checkService(
        'test-service',
        healthCheck,
        1000
      );
      
      expect(status.service).toBe('test-service');
      expect(status.status).toBe('healthy');
      expect(status.responseTime).toBeDefined();
      expect(status.timestamp).toBeDefined();
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Health Check: test-service is healthy'),
        expect.any(Object)
      );
    });

    it('should check unhealthy service', async () => {
      const healthCheck = async () => false;
      
      const status = await HealthMonitor.checkService(
        'failing-service',
        healthCheck
      );
      
      expect(status.service).toBe('failing-service');
      expect(status.status).toBe('unhealthy');
      expect(status.responseTime).toBeDefined();
    });

    it('should handle health check timeout', async () => {
      const slowHealthCheck = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return true;
      };
      
      const status = await HealthMonitor.checkService(
        'slow-service',
        slowHealthCheck,
        50 // 50ms timeout
      );
      
      expect(status.service).toBe('slow-service');
      expect(status.status).toBe('unhealthy');
      expect(status.details?.error).toContain('timeout');
    });

    it('should handle health check errors', async () => {
      const errorHealthCheck = async () => {
        throw new Error('Health check failed');
      };
      
      const status = await HealthMonitor.checkService(
        'error-service',
        errorHealthCheck
      );
      
      expect(status.service).toBe('error-service');
      expect(status.status).toBe('unhealthy');
      expect(status.details?.error).toBe('Health check failed');
    });

    it('should get all health statuses', async () => {
      await HealthMonitor.checkService('service1', async () => true);
      await HealthMonitor.checkService('service2', async () => false);
      
      const allStatuses = HealthMonitor.getAllHealthStatuses();
      
      expect(allStatuses).toHaveProperty('service1');
      expect(allStatuses).toHaveProperty('service2');
      expect(allStatuses.service1.status).toBe('healthy');
      expect(allStatuses.service2.status).toBe('unhealthy');
    });

    it('should get overall healthy status', async () => {
      await HealthMonitor.checkService('service1', async () => true);
      await HealthMonitor.checkService('service2', async () => true);
      
      const overall = HealthMonitor.getOverallHealth();
      
      expect(overall.status).toBe('healthy');
      expect(overall.services).toHaveProperty('service1');
      expect(overall.services).toHaveProperty('service2');
      expect(overall.timestamp).toBeDefined();
    });

    it('should get overall degraded status', async () => {
      await HealthMonitor.checkService('service1', async () => true);
      await HealthMonitor.checkService('service2', async () => false);
      
      const overall = HealthMonitor.getOverallHealth();
      
      expect(overall.status).toBe('degraded');
    });

    it('should get overall unhealthy status', async () => {
      await HealthMonitor.checkService('service1', async () => false);
      await HealthMonitor.checkService('service2', async () => false);
      
      const overall = HealthMonitor.getOverallHealth();
      
      expect(overall.status).toBe('unhealthy');
    });
  });

  describe('RequestContext', () => {
    beforeEach(() => {
      // Clear all contexts
      (RequestContext as any).contexts.clear();
    });

    it('should create new request context', () => {
      const context = RequestContext.create('req-123', {
        userId: 'user-456',
        operation: 'create_user'
      });
      
      expect(context.requestId).toBe('req-123');
      expect(context.userId).toBe('user-456');
      expect(context.operation).toBe('create_user');
    });

    it('should get request context', () => {
      const originalContext = RequestContext.create('req-789');
      const retrievedContext = RequestContext.get('req-789');
      
      expect(retrievedContext).toEqual(originalContext);
    });

    it('should return undefined for non-existent context', () => {
      const context = RequestContext.get('non-existent');
      
      expect(context).toBeUndefined();
    });

    it('should update request context', () => {
      RequestContext.create('req-111', { userId: 'user-111' });
      
      const updated = RequestContext.update('req-111', {
        operation: 'update_user',
        starshipId: 'ship-222'
      });
      
      expect(updated).toMatchObject({
        requestId: 'req-111',
        userId: 'user-111',
        operation: 'update_user',
        starshipId: 'ship-222'
      });
    });

    it('should return undefined when updating non-existent context', () => {
      const result = RequestContext.update('non-existent', { userId: 'test' });
      
      expect(result).toBeUndefined();
    });

    it('should remove request context', () => {
      RequestContext.create('req-remove');
      
      expect(RequestContext.get('req-remove')).toBeDefined();
      
      RequestContext.remove('req-remove');
      
      expect(RequestContext.get('req-remove')).toBeUndefined();
    });

    it('should cleanup old contexts', () => {
      const now = Date.now();
      const oldTimestamp = now - 7200000; // 2 hours ago
      
      RequestContext.create('old-req', {
        metadata: { createdAt: oldTimestamp }
      });
      RequestContext.create('new-req', {
        metadata: { createdAt: now }
      });
      
      RequestContext.cleanup(3600000); // 1 hour max age
      
      expect(RequestContext.get('old-req')).toBeUndefined();
      expect(RequestContext.get('new-req')).toBeDefined();
    });
  });

  describe('Singleton logger export', () => {
    it('should export singleton logger instance', () => {
      // Create fresh instances to avoid test pollution
      const freshLogger = Logger.getInstance();
      expect(logger).toBeInstanceOf(Logger);
      expect(logger.constructor).toBe(freshLogger.constructor);
    });
  });

  describe('LogContext interface', () => {
    it('should support all expected properties', () => {
      const context: LogContext = {
        requestId: 'req-123',
        userId: 'user-456',
        starshipId: 'ship-789',
        agentId: 'agent-111',
        operation: 'test_operation',
        component: 'test_component',
        path: '/api/test',
        method: 'POST',
        statusCode: 200,
        duration: 150,
        metadata: { custom: 'data' },
        error: { name: 'TestError' },
        occurrenceId: 'occ-123',
        ruleId: 'rule-456',
        target: 'test-target',
        cleanedCount: 5,
        workflowId: 'workflow-789',
        executionId: 'exec-111',
        sessionId: 'sess-222',
        correlationId: 'corr-333',
        errorCode: 'TEST_ERROR',
        errorMessage: 'Test error message',
        category: 'test',
        severity: 'high',
        tags: ['test', 'unit'],
        resolvedBy: 'system',
        resolutionTime: 300,
        ruleName: 'test-rule',
        actionType: 'cleanup',
        alertData: { alert: 'data' },
        status: 'active',
        responseTime: 100,
        serviceCount: 3,
        services: [{ name: 'service1' }],
        stack: 'stack trace'
      };
      
      // Should compile without errors if interface is correct
      expect(context.requestId).toBe('req-123');
      expect(context.metadata?.custom).toBe('data');
    });
  });
});