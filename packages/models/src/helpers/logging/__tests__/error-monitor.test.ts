/**
 * ErrorMonitor Unit Tests
 */

import { ErrorMonitor, ErrorSeverity, errorMonitor, errorTrackingMiddleware } from '../error-monitor';
import { ValidationError, DatabaseError, ErrorCategory } from '@starships/errors';

import { logger } from '../index';

// Mock logger methods
jest.spyOn(logger, 'info').mockImplementation(() => {});
jest.spyOn(logger, 'warn').mockImplementation(() => {});
jest.spyOn(logger, 'error').mockImplementation(() => {});

// Clear logger mock calls before each test
beforeEach(() => {
  if ((logger.info as jest.Mock).mockClear) {
    (logger.info as jest.Mock).mockClear();
  }
  if ((logger.warn as jest.Mock).mockClear) {
    (logger.warn as jest.Mock).mockClear();
  }
  if ((logger.error as jest.Mock).mockClear) {
    (logger.error as jest.Mock).mockClear();
  }
});

describe('ErrorMonitor', () => {
  let monitor: ErrorMonitor;

  beforeEach(() => {
    monitor = new ErrorMonitor({
      enableAlerting: false, // Disable alerting for tests
      enableMetrics: true,
      retentionDays: 1
    });
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    monitor.cleanup();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const defaultMonitor = new ErrorMonitor();
      const config = (defaultMonitor as any).config;

      expect(config.enableAlerting).toBe(true);
      expect(config.enableMetrics).toBe(true);
      expect(config.alertThresholds[ErrorSeverity.CRITICAL]).toBe(1);
      expect(config.alertThresholds[ErrorSeverity.HIGH]).toBe(3);
      expect(config.correlationWindowMs).toBe(5 * 60 * 1000);
      expect(config.retentionDays).toBe(30);
    });

    it('should initialize with custom configuration', () => {
      const customConfig = {
        enableAlerting: false,
        alertThresholds: {
          [ErrorSeverity.LOW]: 20,
          [ErrorSeverity.MEDIUM]: 10,
          [ErrorSeverity.HIGH]: 5,
          [ErrorSeverity.CRITICAL]: 2
        },
        correlationWindowMs: 10 * 60 * 1000,
        retentionDays: 7
      };

      const customMonitor = new ErrorMonitor(customConfig);
      const config = (customMonitor as any).config;

      expect(config.enableAlerting).toBe(false);
      expect(config.alertThresholds[ErrorSeverity.CRITICAL]).toBe(2);
      expect(config.correlationWindowMs).toBe(10 * 60 * 1000);
      expect(config.retentionDays).toBe(7);
    });

    it('should initialize metrics structure', () => {
      const metrics = monitor.getMetrics();

      expect(metrics.totalErrors).toBe(0);
      expect(metrics.errorsByCategory).toBeDefined();
      expect(metrics.errorsBySeverity).toBeDefined();
      expect(metrics.errorsByHour).toEqual({});
      expect(metrics.topErrors).toEqual([]);
      expect(metrics.errorRate).toBe(0);
    });
  });

  describe('trackError', () => {
    const createTestError = (code: string = 'TEST_ERROR', category: ErrorCategory = ErrorCategory.VALIDATION) => {
      if (category === ErrorCategory.DATABASE) {
        const error = new DatabaseError('Test error message');
        Object.defineProperty(error, 'code', { value: code, configurable: true });
        return error;
      }
      const error = new ValidationError('Test error message');
      Object.defineProperty(error, 'code', { value: code, configurable: true });
      return error;
    };

    it('should track error occurrence successfully', async () => {
      const error = createTestError();
      const context = {
        userId: 'user-123',
        starshipId: 'starship-456',
        requestId: 'req-789'
      };

      const occurrenceId = await monitor.trackError(error, context);

      expect(occurrenceId).toMatch(/^err_\d+_[a-z0-9]+$/);

      const occurrences = monitor.getErrorOccurrences({ limit: 1 });
      expect(occurrences).toHaveLength(1);
      expect(occurrences[0]).toMatchObject({
        id: occurrenceId,
        error,
        context,
        resolved: false,
        tags: expect.arrayContaining([ErrorCategory.VALIDATION, 'TEST_ERROR'])
      });
    });

    it('should calculate severity automatically', async () => {
      const databaseError = new DatabaseError('Database error');
      const validationError = new ValidationError('Validation error');

      await monitor.trackError(databaseError);
      await monitor.trackError(validationError);

      const occurrences = monitor.getErrorOccurrences();
      
      const dbOccurrence = occurrences.find(o => o.error.code === 'DATABASE_ERROR');
      const validationOccurrence = occurrences.find(o => o.error.code === 'VALIDATION_ERROR');

      expect(dbOccurrence?.severity).toBe(ErrorSeverity.HIGH); // Database errors are high severity
      expect(validationOccurrence?.severity).toBe(ErrorSeverity.MEDIUM); // 400 status codes are medium
    });

    it('should use provided severity over calculated', async () => {
      const error = createTestError();

      await monitor.trackError(error, {}, ErrorSeverity.CRITICAL);

      const occurrences = monitor.getErrorOccurrences({ limit: 1 });
      expect(occurrences[0].severity).toBe(ErrorSeverity.CRITICAL);
    });

    it('should generate correlation IDs for related errors', async () => {
      const userId = 'user-123';
      const error1 = createTestError('SAME_ERROR');
      const error2 = createTestError('SAME_ERROR');

      await monitor.trackError(error1, { userId });
      await monitor.trackError(error2, { userId });

      const occurrences = monitor.getErrorOccurrences();
      expect(occurrences[0].correlationId).toBe(occurrences[1].correlationId);
    });

    it('should generate appropriate tags', async () => {
      const error = createTestError();
      const context = {
        userId: 'user-123',
        agentId: 'agent-456'
      };

      await monitor.trackError(error, context);

      const occurrences = monitor.getErrorOccurrences({ limit: 1 });
      const tags = occurrences[0].tags;

      expect(tags).toContain(ErrorCategory.VALIDATION);
      expect(tags).toContain('TEST_ERROR');
      expect(tags).toContain('agent'); // Should include 'agent' tag when agentId is present
    });

    it('should update metrics when enabled', async () => {
      const error = createTestError();

      await monitor.trackError(error);

      const metrics = monitor.getMetrics();
      expect(metrics.totalErrors).toBe(1);
      expect(metrics.errorsByCategory[ErrorCategory.VALIDATION]).toBe(1);
      expect(metrics.topErrors).toHaveLength(1);
      expect(metrics.topErrors[0]).toMatchObject({
        errorCode: 'TEST_ERROR',
        count: 1
      });
    });

    it('should log error with appropriate severity level', async () => {
      const criticalError = createTestError('CRITICAL_ERROR', ErrorCategory.DATABASE);
      const lowError = createTestError('LOW_ERROR', ErrorCategory.VALIDATION);

      await monitor.trackError(criticalError, {}, ErrorSeverity.CRITICAL);
      await monitor.trackError(lowError, {}, ErrorSeverity.LOW);

      expect(logger.error).toHaveBeenCalledWith(
        'Critical error occurred',
        expect.objectContaining({
          errorCode: 'CRITICAL_ERROR',
          severity: ErrorSeverity.CRITICAL
        })
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Low severity error occurred',
        expect.objectContaining({
          errorCode: 'LOW_ERROR',
          severity: ErrorSeverity.LOW
        })
      );
    });
  });

  describe('resolveError', () => {
    it('should mark error as resolved', async () => {
      const error = createTestError();
      const occurrenceId = await monitor.trackError(error);

      const resolved = await monitor.resolveError(occurrenceId, 'admin-user');

      expect(resolved).toBe(true);

      const occurrences = monitor.getErrorOccurrences({ resolved: true });
      expect(occurrences).toHaveLength(1);
      expect(occurrences[0]).toMatchObject({
        id: occurrenceId,
        resolved: true,
        resolvedBy: 'admin-user',
        resolvedAt: expect.any(String)
      });

      expect(logger.info).toHaveBeenCalledWith(
        'Error resolved',
        expect.objectContaining({
          occurrenceId,
          resolvedBy: 'admin-user',
          resolutionTime: expect.any(Number)
        })
      );
    });

    it('should return false for non-existent occurrence', async () => {
      const resolved = await monitor.resolveError('non-existent', 'admin-user');

      expect(resolved).toBe(false);
    });
  });

  describe('getMetrics', () => {
    let testMonitor: ErrorMonitor;
    
    beforeEach(() => {
      // Use a separate monitor instance for these tests to avoid contamination
      testMonitor = new ErrorMonitor({
        enableAlerting: false,
        enableMetrics: true,
        retentionDays: 1
      });
    });

    afterEach(() => {
      if (testMonitor) {
        testMonitor.cleanup();
      }
    });

    it('should return copy of metrics to prevent mutation', () => {
      const metrics1 = testMonitor.getMetrics();
      const metrics2 = testMonitor.getMetrics();

      expect(metrics1).not.toBe(metrics2); // Different objects
      expect(metrics1).toEqual(metrics2); // But same content
    });

    it('should track error metrics correctly', async () => {
      const errors = [
        createTestError('ERROR_A', ErrorCategory.VALIDATION),
        createTestError('ERROR_A', ErrorCategory.VALIDATION), // Duplicate
        createTestError('ERROR_B', ErrorCategory.DATABASE),
        createTestError('ERROR_C', ErrorCategory.INTERNAL)
      ];

      for (const error of errors) {
        await testMonitor.trackError(error);
      }

      const metrics = testMonitor.getMetrics();

      expect(metrics.totalErrors).toBe(4);
      expect(metrics.errorsByCategory[ErrorCategory.VALIDATION]).toBe(3);
      expect(metrics.errorsByCategory[ErrorCategory.DATABASE]).toBe(1);
      expect(metrics.errorsByCategory[ErrorCategory.INTERNAL]).toBe(0);

      expect(metrics.topErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ errorCode: 'ERROR_A', count: 2 }),
          expect.objectContaining({ errorCode: 'ERROR_B', count: 1 }),
          expect.objectContaining({ errorCode: 'ERROR_C', count: 1 })
        ])
      );
    });

    it('should limit top errors to 10', async () => {
      // Create 15 different errors
      for (let i = 0; i < 15; i++) {
        await testMonitor.trackError(createTestError(`ERROR_${i}`));
      }

      const metrics = testMonitor.getMetrics();

      expect(metrics.topErrors).toHaveLength(10);
    });

    it('should track errors by hour', async () => {
      const error = createTestError();

      await testMonitor.trackError(error);

      const metrics = testMonitor.getMetrics();
      const currentHour = new Date().toISOString().substring(0, 13);

      expect(metrics.errorsByHour[currentHour]).toBe(1);
    });
  });

  describe('getErrorOccurrences', () => {
    let testMonitor: ErrorMonitor;
    
    beforeEach(async () => {
      // Use a separate monitor instance for these tests to avoid contamination
      testMonitor = new ErrorMonitor({
        enableAlerting: false,
        enableMetrics: true,
        retentionDays: 1
      });

      // Create test data
      const testErrors = [
        { error: createTestError('ERROR_A', ErrorCategory.VALIDATION), severity: ErrorSeverity.LOW },
        { error: createTestError('ERROR_B', ErrorCategory.DATABASE), severity: ErrorSeverity.HIGH },
        { error: createTestError('ERROR_C', ErrorCategory.VALIDATION), severity: ErrorSeverity.MEDIUM }
      ];

      for (const { error, severity } of testErrors) {
        await testMonitor.trackError(error, {}, severity);
      }

      // Resolve first error
      const occurrences = testMonitor.getErrorOccurrences();
      await testMonitor.resolveError(occurrences[0].id, 'admin');
    });

    afterEach(() => {
      if (testMonitor) {
        testMonitor.cleanup();
      }
    });

    it('should filter by category', () => {
      const validationErrors = testMonitor.getErrorOccurrences({
        category: ErrorCategory.VALIDATION,
        resolved: false
      });

      expect(validationErrors).toHaveLength(1);
      expect(validationErrors[0].error.category).toBe(ErrorCategory.VALIDATION);
    });

    it('should filter by severity', () => {
      const highSeverityErrors = testMonitor.getErrorOccurrences({
        severity: ErrorSeverity.HIGH
      });

      expect(highSeverityErrors).toHaveLength(1);
      expect(highSeverityErrors[0].severity).toBe(ErrorSeverity.HIGH);
    });

    it('should filter by resolved status', () => {
      const unresolvedErrors = testMonitor.getErrorOccurrences({ resolved: false });
      const resolvedErrors = testMonitor.getErrorOccurrences({ resolved: true });

      expect(unresolvedErrors).toHaveLength(2);
      expect(resolvedErrors).toHaveLength(1);
    });

    it('should apply limit', () => {
      const limitedErrors = testMonitor.getErrorOccurrences({ limit: 2 });

      expect(limitedErrors).toHaveLength(2);
    });

    it('should filter by time range', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const recentErrors = testMonitor.getErrorOccurrences({
        startTime: oneHourAgo.toISOString()
      });

      const veryRecentErrors = testMonitor.getErrorOccurrences({
        startTime: oneHourAgo.toISOString(),
        endTime: now.toISOString()
      });

      expect(recentErrors).toHaveLength(3); // All errors are recent in tests
      expect(veryRecentErrors).toHaveLength(3);
    });

    it('should return errors sorted by timestamp (newest first)', () => {
      const errors = testMonitor.getErrorOccurrences();

      for (let i = 1; i < errors.length; i++) {
        const prevTime = new Date(errors[i - 1].timestamp).getTime();
        const currTime = new Date(errors[i].timestamp).getTime();
        expect(prevTime).toBeGreaterThanOrEqual(currTime);
      }
    });

    it('should combine multiple filters', () => {
      const filteredErrors = testMonitor.getErrorOccurrences({
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.HIGH,
        resolved: false,
        limit: 1
      });

      expect(filteredErrors).toHaveLength(1);
      expect(filteredErrors[0].error.category).toBe(ErrorCategory.DATABASE);
      expect(filteredErrors[0].severity).toBe(ErrorSeverity.HIGH);
      expect(filteredErrors[0].resolved).toBe(false);
    });
  });

  describe('getCorrelatedErrors', () => {
    it('should return correlated errors', async () => {
      const context = { userId: 'user-123' };
      const error1 = createTestError('SAME_ERROR');
      const error2 = createTestError('SAME_ERROR');
      const error3 = createTestError('DIFFERENT_ERROR');

      const id1 = await monitor.trackError(error1, context);
      const id2 = await monitor.trackError(error2, context);
      const id3 = await monitor.trackError(error3, context);

      const correlated = monitor.getCorrelatedErrors(id1);

      expect(correlated).toHaveLength(1);
      expect(correlated[0].id).toBe(id2);
    });

    it('should return empty array for non-existent occurrence', () => {
      const correlated = monitor.getCorrelatedErrors('non-existent');

      expect(correlated).toEqual([]);
    });

    it('should return empty array for occurrence without correlation', async () => {
      const error = createTestError();
      const occurrenceId = await monitor.trackError(error);

      // Mock occurrence without correlationId
      const occurrence = (monitor as any).errorOccurrences.get(occurrenceId);
      occurrence.correlationId = undefined;

      const correlated = monitor.getCorrelatedErrors(occurrenceId);

      expect(correlated).toEqual([]);
    });
  });

  describe('alert rules management', () => {
    const testRule = {
      id: 'test-rule',
      name: 'Test Alert Rule',
      condition: {
        errorCode: 'TEST_ERROR',
        threshold: 2,
        windowMs: 60 * 1000
      },
      actions: [
        { type: 'email' as const, target: 'admin@example.com' }
      ],
      enabled: true
    };

    it('should add alert rule', () => {
      monitor.addAlertRule(testRule);

      expect(logger.info).toHaveBeenCalledWith(
        'Alert rule added',
        { ruleId: 'test-rule', ruleName: 'Test Alert Rule' }
      );
    });

    it('should remove alert rule', () => {
      monitor.addAlertRule(testRule);
      const removed = monitor.removeAlertRule('test-rule');

      expect(removed).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        'Alert rule removed',
        { ruleId: 'test-rule' }
      );
    });

    it('should return false when removing non-existent rule', () => {
      const removed = monitor.removeAlertRule('non-existent');

      expect(removed).toBe(false);
    });
  });

  describe('severity calculation', () => {
    it('should calculate HIGH severity for database errors', () => {
      const error = new DatabaseError('Database error');
      
      const severity = (monitor as any).calculateSeverity(error);

      expect(severity).toBe(ErrorSeverity.HIGH);
    });

    it('should calculate HIGH severity for 5xx status codes', () => {
      const error = new ValidationError('Server error');
      Object.assign(error, { statusCode: 500 });
      
      const severity = (monitor as any).calculateSeverity(error);

      expect(severity).toBe(ErrorSeverity.HIGH);
    });

    it('should calculate MEDIUM severity for 4xx status codes', () => {
      const error = new ValidationError('Client error');
      
      const severity = (monitor as any).calculateSeverity(error);

      expect(severity).toBe(ErrorSeverity.MEDIUM);
    });

    it('should calculate LOW severity for other status codes', () => {
      const error = new ValidationError('Info error');
      Object.assign(error, { statusCode: 200 });
      
      const severity = (monitor as any).calculateSeverity(error);

      expect(severity).toBe(ErrorSeverity.LOW);
    });
  });

  describe('correlation', () => {
    it('should generate correlation IDs based on error code and context', () => {
      const error = createTestError('TEST_ERROR');
      const context = { userId: 'user-123' };

      const correlationId1 = (monitor as any).generateCorrelationId(error, context);
      const correlationId2 = (monitor as any).generateCorrelationId(error, context);

      expect(correlationId1).toBe(correlationId2); // Should be same within time window
      expect(correlationId1).toMatch(/^corr_TEST_ERROR_user-123_\d+$/);
    });

    it('should generate different correlation IDs for different contexts', () => {
      const error = createTestError('TEST_ERROR');
      const context1 = { userId: 'user-123' };
      const context2 = { userId: 'user-456' };

      const correlationId1 = (monitor as any).generateCorrelationId(error, context1);
      const correlationId2 = (monitor as any).generateCorrelationId(error, context2);

      expect(correlationId1).not.toBe(correlationId2);
    });

    it('should update correlation groups', () => {
      const correlationId = 'test-correlation';
      const occurrenceId1 = 'occurrence-1';
      const occurrenceId2 = 'occurrence-2';

      (monitor as any).updateCorrelationGroups(correlationId, occurrenceId1);
      (monitor as any).updateCorrelationGroups(correlationId, occurrenceId2);

      const groups = (monitor as any).correlationGroups;
      expect(groups.get(correlationId)).toEqual([occurrenceId1, occurrenceId2]);
    });
  });

  describe('metrics updates', () => {
    it('should update all metric counters', async () => {
      const error = createTestError('METRIC_TEST', ErrorCategory.VALIDATION);
      
      await monitor.trackError(error, {}, ErrorSeverity.MEDIUM);

      const metrics = monitor.getMetrics();

      expect(metrics.totalErrors).toBe(1);
      expect(metrics.errorsByCategory[ErrorCategory.VALIDATION]).toBe(1);
      expect(metrics.errorsBySeverity[ErrorSeverity.MEDIUM]).toBe(1);
      expect(metrics.topErrors[0]).toMatchObject({
        errorCode: 'METRIC_TEST',
        count: 1
      });
    });

    it('should update existing error counts in top errors', async () => {
      const error = createTestError('REPEATED_ERROR');

      await monitor.trackError(error);
      await monitor.trackError(error);
      await monitor.trackError(error);

      const metrics = monitor.getMetrics();

      expect(metrics.topErrors[0]).toMatchObject({
        errorCode: 'REPEATED_ERROR',
        count: 3
      });
    });

    it('should sort top errors by count', async () => {
      await monitor.trackError(createTestError('ERROR_A')); // 1 occurrence
      await monitor.trackError(createTestError('ERROR_B')); // 3 occurrences
      await monitor.trackError(createTestError('ERROR_B'));
      await monitor.trackError(createTestError('ERROR_B'));
      await monitor.trackError(createTestError('ERROR_C')); // 2 occurrences  
      await monitor.trackError(createTestError('ERROR_C'));

      const metrics = monitor.getMetrics();

      expect(metrics.topErrors[0].errorCode).toBe('ERROR_B'); // Most frequent
      expect(metrics.topErrors[1].errorCode).toBe('ERROR_C');
      expect(metrics.topErrors[2].errorCode).toBe('ERROR_A'); // Least frequent
    });

    it('should calculate error rate per minute', async () => {
      // Track some errors
      await monitor.trackError(createTestError('RATE_TEST_1'));
      await monitor.trackError(createTestError('RATE_TEST_2'));

      const metrics = monitor.getMetrics();

      expect(metrics.errorRate).toBe(2); // 2 errors in the last minute
    });
  });

  describe('cleanup', () => {
    it('should clean up old error occurrences', async () => {
      // Create error with old timestamp
      const error = createTestError();
      const occurrenceId = await monitor.trackError(error);

      // Manually set old timestamp
      const occurrence = (monitor as any).errorOccurrences.get(occurrenceId);
      occurrence.timestamp = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago

      // Trigger cleanup
      (monitor as any).cleanupOldErrors();

      expect(logger.info).toHaveBeenCalledWith(
        'Cleaned up old error occurrences',
        { cleanedCount: 1 }
      );

      const remainingOccurrences = monitor.getErrorOccurrences();
      expect(remainingOccurrences).toHaveLength(0);
    });

    it('should not clean up recent errors', async () => {
      const error = createTestError();
      await monitor.trackError(error);

      (monitor as any).cleanupOldErrors();

      const remainingOccurrences = monitor.getErrorOccurrences();
      expect(remainingOccurrences).toHaveLength(1);
    });
  });

  describe('alerting system', () => {
    let alertingMonitor: ErrorMonitor;

    beforeEach(() => {
      alertingMonitor = new ErrorMonitor({ enableAlerting: true });
    });

    afterEach(() => {
      if (alertingMonitor) {
        alertingMonitor.cleanup();
      }
    });

    it('should evaluate alert conditions correctly', async () => {
      const rule = {
        id: 'test-rule',
        name: 'Test Rule',
        condition: {
          errorCode: 'TEST_ERROR',
          threshold: 2,
          windowMs: 60 * 1000
        },
        actions: [{ type: 'email' as const, target: 'admin@example.com' }],
        enabled: true
      };

      alertingMonitor.addAlertRule(rule);

      // Add errors to trigger alert
      await alertingMonitor.trackError(createTestError('TEST_ERROR'));
      await alertingMonitor.trackError(createTestError('TEST_ERROR'));

      expect(logger.warn).toHaveBeenCalledWith(
        'Alert triggered',
        expect.objectContaining({
          ruleId: 'test-rule',
          ruleName: 'Test Rule'
        })
      );
    });

    it('should not trigger disabled rules', async () => {
      const rule = {
        id: 'disabled-rule',
        name: 'Disabled Rule',
        condition: { threshold: 1, windowMs: 60 * 1000 },
        actions: [{ type: 'email' as const, target: 'admin@example.com' }],
        enabled: false
      };

      alertingMonitor.addAlertRule(rule);
      await alertingMonitor.trackError(createTestError());

      expect(logger.warn).not.toHaveBeenCalledWith(
        'Alert triggered',
        expect.objectContaining({ ruleId: 'disabled-rule' })
      );
    });

    it('should execute different alert action types', async () => {
      const rule = {
        id: 'multi-action-rule',
        name: 'Multi Action Rule',
        condition: { threshold: 1, windowMs: 60 * 1000 },
        actions: [
          { type: 'email' as const, target: 'admin@example.com' },
          { type: 'webhook' as const, target: 'https://webhook.example.com' },
          { type: 'slack' as const, target: '#alerts' }
        ],
        enabled: true
      };

      alertingMonitor.addAlertRule(rule);
      await alertingMonitor.trackError(createTestError());

      expect(logger.info).toHaveBeenCalledWith(
        'Email alert triggered',
        expect.objectContaining({ target: 'admin@example.com' })
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Webhook alert triggered',
        expect.objectContaining({ target: 'https://webhook.example.com' })
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Slack alert triggered',
        expect.objectContaining({ target: '#alerts' })
      );
    });

    it('should handle alert action failures', async () => {
      // Mock logger.info to throw error for webhook alerts
      (logger.info as jest.Mock).mockImplementation((message: string, data: any) => {
        if (message === 'Webhook alert triggered') {
          throw new Error('Webhook failed');
        }
        // Don't call original implementation to avoid infinite recursion
        return;
      });

      const rule = {
        id: 'failing-rule',
        name: 'Failing Rule',
        condition: { threshold: 1, windowMs: 60 * 1000 },
        actions: [{ type: 'webhook' as const, target: 'https://webhook.example.com' }],
        enabled: true
      };

      alertingMonitor.addAlertRule(rule);
      await alertingMonitor.trackError(createTestError());

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to execute alert action',
        expect.objectContaining({
          ruleId: 'failing-rule',
          actionType: 'webhook'
        })
      );
    });
  });

  describe('default alert rules', () => {
    it('should setup critical error alert rule', () => {
      const defaultMonitor = new ErrorMonitor();
      const rules = (defaultMonitor as any).alertRules;

      expect(rules.has('critical-errors')).toBe(true);
      const criticalRule = rules.get('critical-errors');
      expect(criticalRule.condition.severity).toBe(ErrorSeverity.CRITICAL);
      expect(criticalRule.condition.threshold).toBe(1);
    });

    it('should setup high error rate alert rule', () => {
      const defaultMonitor = new ErrorMonitor();
      const rules = (defaultMonitor as any).alertRules;

      expect(rules.has('high-error-rate')).toBe(true);
      const rateRule = rules.get('high-error-rate');
      expect(rateRule.condition.threshold).toBe(10);
      expect(rateRule.condition.windowMs).toBe(5 * 60 * 1000);
    });

    it('should setup database error alert rule', () => {
      const defaultMonitor = new ErrorMonitor();
      const rules = (defaultMonitor as any).alertRules;

      expect(rules.has('database-errors')).toBe(true);
      const dbRule = rules.get('database-errors');
      expect(dbRule.condition.category).toBe(ErrorCategory.DATABASE);
      expect(dbRule.condition.threshold).toBe(3);
    });
  });

  describe('error tracking middleware', () => {
    it('should track BaseError instances', async () => {
      const error = createTestError();
      const req = {
        id: 'req-123',
        user: { id: 'user-456' },
        ip: '192.168.1.1',
        get: jest.fn().mockReturnValue('Mozilla/5.0'),
        params: { starshipId: 'starship-789' }
      };
      const res = {};
      const next = jest.fn();

      const middleware = errorTrackingMiddleware();
      await middleware(error, req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      // Verify error was tracked by checking if occurrences exist
      const occurrences = errorMonitor.getErrorOccurrences({ limit: 1 });
      expect(occurrences.length).toBeGreaterThan(0);
    });

    it('should pass through non-BaseError instances', async () => {
      const error = new Error('Regular error');
      const req = {};
      const res = {};
      const next = jest.fn();

      const middleware = errorTrackingMiddleware();
      await middleware(error, req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should extract context from request', async () => {
      const error = createTestError();
      const req = {
        id: 'req-123',
        user: { id: 'user-456' },
        ip: '192.168.1.1',
        get: jest.fn().mockReturnValue('Chrome/91.0'),
        params: { starshipId: 'starship-789' }
      };
      const res = {};
      const next = jest.fn();

      const middleware = errorTrackingMiddleware();
      await middleware(error, req, res, next);

      const occurrences = errorMonitor.getErrorOccurrences({ limit: 1 });
      expect(occurrences[0].context).toMatchObject({
        requestId: 'req-123',
        userId: 'user-456',
        ip: '192.168.1.1',
        userAgent: 'Chrome/91.0',
        starshipId: 'starship-789'
      });
    });
  });

  describe('edge cases', () => {
    it('should handle errors without stack trace', async () => {
      const error = createTestError();
      delete error.stack;

      const occurrenceId = await monitor.trackError(error);

      const occurrences = monitor.getErrorOccurrences({ limit: 1 });
      expect(occurrences[0].stackTrace).toBeUndefined();
    });

    it('should handle very long error messages', async () => {
      const longMessage = 'x'.repeat(10000);
      const error = new ValidationError(longMessage);

      const occurrenceId = await monitor.trackError(error);

      const occurrences = monitor.getErrorOccurrences({ limit: 1 });
      expect(occurrences[0].error.message).toBe(longMessage);
    });

    it('should handle context with missing fields', async () => {
      const error = createTestError();
      const sparseContext = {
        userId: 'user-123'
        // Other fields missing
      };

      const occurrenceId = await monitor.trackError(error, sparseContext);

      const occurrences = monitor.getErrorOccurrences({ limit: 1 });
      expect(occurrences[0].context.userId).toBe('user-123');
      expect(occurrences[0].context.starshipId).toBeUndefined();
    });

    it('should handle concurrent error tracking', async () => {
      const errors = Array.from({ length: 10 }, (_, i) => 
        createTestError(`CONCURRENT_${i}`)
      );

      const promises = errors.map(error => monitor.trackError(error));
      const occurrenceIds = await Promise.all(promises);

      expect(occurrenceIds).toHaveLength(10);
      expect(new Set(occurrenceIds).size).toBe(10); // All unique
    });

    it('should handle metrics overflow gracefully', async () => {
      // Create many different errors to test top errors limit
      for (let i = 0; i < 20; i++) {
        await monitor.trackError(createTestError(`OVERFLOW_ERROR_${i}`));
      }

      const metrics = monitor.getMetrics();

      expect(metrics.topErrors).toHaveLength(10); // Should be limited to 10
      expect(metrics.totalErrors).toBe(20); // But total should be accurate
    });
  });
});

// Helper function for creating test errors
function createTestError(code: string = 'TEST_ERROR', category: ErrorCategory = ErrorCategory.VALIDATION) {
  if (category === ErrorCategory.DATABASE) {
    const error = new DatabaseError(`Test error: ${code}`);
    // Override the code property to use the custom code
    Object.defineProperty(error, 'code', { value: code, configurable: true });
    return error;
  }
  const error = new ValidationError(`Test error: ${code}`);
  // Override the code property to use the custom code
  Object.defineProperty(error, 'code', { value: code, configurable: true });
  return error;
}