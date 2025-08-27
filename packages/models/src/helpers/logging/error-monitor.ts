/**
 * Error Monitoring and Alerting System
 * 
 * Provides comprehensive error tracking, correlation, and alerting
 * for the expedition orchestration system.
 */

import { logger } from './index';
import { BaseError, ErrorCategory } from '../errors';

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Error monitoring configuration
 */
interface ErrorMonitorConfig {
  enableAlerting: boolean;
  alertThresholds: {
    [key in ErrorSeverity]: number; // errors per minute
  };
  correlationWindowMs: number;
  retentionDays: number;
  enableMetrics: boolean;
}

/**
 * Error occurrence tracking
 */
interface ErrorOccurrence {
  id: string;
  timestamp: string;
  error: BaseError;
  severity: ErrorSeverity;
  context: {
    userId?: string;
    starshipId?: string;
    agentId?: string;
    requestId?: string;
    sessionId?: string;
    userAgent?: string;
    ip?: string;
  };
  stackTrace?: string;
  correlationId?: string;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  tags: string[];
}

/**
 * Error metrics
 */
interface ErrorMetrics {
  totalErrors: number;
  errorsByCategory: Record<ErrorCategory, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  errorsByHour: Record<string, number>;
  topErrors: Array<{
    errorCode: string;
    count: number;
    lastOccurrence: string;
  }>;
  meanTimeToResolution: number;
  errorRate: number; // errors per minute
}

/**
 * Alert configuration
 */
interface AlertRule {
  id: string;
  name: string;
  condition: {
    errorCode?: string;
    category?: ErrorCategory;
    severity?: ErrorSeverity;
    threshold: number;
    windowMs: number;
  };
  actions: Array<{
    type: 'email' | 'webhook' | 'slack';
    target: string;
    template?: string;
  }>;
  enabled: boolean;
}

/**
 * Error Monitor Class
 */
export class ErrorMonitor {
  private config: ErrorMonitorConfig;
  private errorOccurrences: Map<string, ErrorOccurrence> = new Map();
  private alertRules: Map<string, AlertRule> = new Map();
  private metrics: ErrorMetrics;
  private correlationGroups: Map<string, string[]> = new Map();

  constructor(config: Partial<ErrorMonitorConfig> = {}) {
    this.config = {
      enableAlerting: true,
      alertThresholds: {
        [ErrorSeverity.LOW]: 10,
        [ErrorSeverity.MEDIUM]: 5,
        [ErrorSeverity.HIGH]: 3,
        [ErrorSeverity.CRITICAL]: 1,
      },
      correlationWindowMs: 5 * 60 * 1000, // 5 minutes
      retentionDays: 30,
      enableMetrics: true,
      ...config,
    };

    this.metrics = this.initializeMetrics();
    this.setupDefaultAlertRules();
    this.startCleanupScheduler();
  }

  /**
   * Track an error occurrence
   */
  async trackError(
    error: BaseError,
    context: ErrorOccurrence['context'] = {},
    severity?: ErrorSeverity
  ): Promise<string> {
    const occurrenceId = this.generateOccurrenceId();
    const correlationId = this.generateCorrelationId(error, context);
    
    const occurrence: ErrorOccurrence = {
      id: occurrenceId,
      timestamp: new Date().toISOString(),
      error,
      severity: severity || this.calculateSeverity(error),
      context,
      stackTrace: error.stack,
      correlationId,
      resolved: false,
      tags: this.generateTags(error, context),
    };

    // Store occurrence
    this.errorOccurrences.set(occurrenceId, occurrence);

    // Update correlation groups
    this.updateCorrelationGroups(correlationId, occurrenceId);

    // Update metrics
    if (this.config.enableMetrics) {
      this.updateMetrics(occurrence);
    }

    // Log the error
    await this.logError(occurrence);

    // Check alert conditions
    if (this.config.enableAlerting) {
      await this.checkAlertConditions(occurrence);
    }

    return occurrenceId;
  }

  /**
   * Mark an error as resolved
   */
  async resolveError(occurrenceId: string, resolvedBy: string): Promise<boolean> {
    const occurrence = this.errorOccurrences.get(occurrenceId);
    if (!occurrence) {
      return false;
    }

    occurrence.resolved = true;
    occurrence.resolvedAt = new Date().toISOString();
    occurrence.resolvedBy = resolvedBy;

    logger.info('Error resolved', {
      occurrenceId,
      errorCode: occurrence.error.code,
      resolvedBy,
      resolutionTime: Date.now() - new Date(occurrence.timestamp).getTime(),
    });

    return true;
  }

  /**
   * Get error metrics
   */
  getMetrics(): ErrorMetrics {
    return { ...this.metrics };
  }

  /**
   * Get error occurrences with filtering
   */
  getErrorOccurrences(filters: {
    category?: ErrorCategory;
    severity?: ErrorSeverity;
    resolved?: boolean;
    startTime?: string;
    endTime?: string;
    limit?: number;
  } = {}): ErrorOccurrence[] {
    let occurrences = Array.from(this.errorOccurrences.values());

    // Apply filters
    if (filters.category) {
      occurrences = occurrences.filter(o => o.error.category === filters.category);
    }
    if (filters.severity) {
      occurrences = occurrences.filter(o => o.severity === filters.severity);
    }
    if (filters.resolved !== undefined) {
      occurrences = occurrences.filter(o => o.resolved === filters.resolved);
    }
    if (filters.startTime) {
      occurrences = occurrences.filter(o => o.timestamp >= filters.startTime!);
    }
    if (filters.endTime) {
      occurrences = occurrences.filter(o => o.timestamp <= filters.endTime!);
    }

    // Sort by timestamp (newest first)
    occurrences.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit
    if (filters.limit) {
      occurrences = occurrences.slice(0, filters.limit);
    }

    return occurrences;
  }

  /**
   * Get correlated errors
   */
  getCorrelatedErrors(occurrenceId: string): ErrorOccurrence[] {
    const occurrence = this.errorOccurrences.get(occurrenceId);
    if (!occurrence || !occurrence.correlationId) {
      return [];
    }

    const correlatedIds = this.correlationGroups.get(occurrence.correlationId) || [];
    return correlatedIds
      .filter(id => id !== occurrenceId)
      .map(id => this.errorOccurrences.get(id))
      .filter(Boolean) as ErrorOccurrence[];
  }

  /**
   * Add custom alert rule
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
    logger.info('Alert rule added', { ruleId: rule.id, ruleName: rule.name });
  }

  /**
   * Remove alert rule
   */
  removeAlertRule(ruleId: string): boolean {
    const removed = this.alertRules.delete(ruleId);
    if (removed) {
      logger.info('Alert rule removed', { ruleId });
    }
    return removed;
  }

  /**
   * Calculate error severity based on error type and context
   */
  private calculateSeverity(error: BaseError): ErrorSeverity {
    if (error.category === ErrorCategory.DATABASE) {
      return ErrorSeverity.HIGH;
    }

    // Default based on HTTP status code
    if (error.statusCode >= 500) {
      return ErrorSeverity.HIGH;
    } else if (error.statusCode >= 400) {
      return ErrorSeverity.MEDIUM;
    }

    return ErrorSeverity.LOW;
  }

  /**
   * Generate correlation ID for grouping related errors
   */
  private generateCorrelationId(error: BaseError, context: ErrorOccurrence['context']): string {
    const components = [
      error.code,
      context.userId,
    ].filter(Boolean);

    return `corr_${components.join('_')}_${Math.floor(Date.now() / this.config.correlationWindowMs)}`;
  }

  /**
   * Generate tags for error categorization
   */
  private generateTags(error: BaseError, context: ErrorOccurrence['context']): string[] {
    const tags = [
      error.category,
      error.code,
    ];

    if (context.agentId) tags.push('agent');

    return tags;
  }

  /**
   * Update correlation groups
   */
  private updateCorrelationGroups(correlationId: string, occurrenceId: string): void {
    if (!this.correlationGroups.has(correlationId)) {
      this.correlationGroups.set(correlationId, []);
    }
    this.correlationGroups.get(correlationId)!.push(occurrenceId);
  }

  /**
   * Update error metrics
   */
  private updateMetrics(occurrence: ErrorOccurrence): void {
    this.metrics.totalErrors++;
    this.metrics.errorsByCategory[occurrence.error.category]++;
    this.metrics.errorsBySeverity[occurrence.severity]++;

    const hour = new Date(occurrence.timestamp).toISOString().substring(0, 13);
    this.metrics.errorsByHour[hour] = (this.metrics.errorsByHour[hour] || 0) + 1;

    // Update top errors
    const existingError = this.metrics.topErrors.find(e => e.errorCode === occurrence.error.code);
    if (existingError) {
      existingError.count++;
      existingError.lastOccurrence = occurrence.timestamp;
    } else {
      this.metrics.topErrors.push({
        errorCode: occurrence.error.code,
        count: 1,
        lastOccurrence: occurrence.timestamp,
      });
    }

    // Sort top errors by count
    this.metrics.topErrors.sort((a, b) => b.count - a.count);
    this.metrics.topErrors = this.metrics.topErrors.slice(0, 10);

    // Calculate error rate (errors per minute)
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const recentErrors = Array.from(this.errorOccurrences.values())
      .filter(o => new Date(o.timestamp).getTime() > oneMinuteAgo);
    this.metrics.errorRate = recentErrors.length;
  }

  /**
   * Log error occurrence
   */
  private async logError(occurrence: ErrorOccurrence): Promise<void> {
    const logData = {
      occurrenceId: occurrence.id,
      errorCode: occurrence.error.code,
      errorMessage: occurrence.error.message,
      category: occurrence.error.category,
      severity: occurrence.severity,
      statusCode: occurrence.error.statusCode,
      context: occurrence.context,
      correlationId: occurrence.correlationId,
      tags: occurrence.tags,
    };

    switch (occurrence.severity) {
      case ErrorSeverity.CRITICAL:
        logger.error('Critical error occurred', logData);
        break;
      case ErrorSeverity.HIGH:
        logger.error('High severity error occurred', logData);
        break;
      case ErrorSeverity.MEDIUM:
        logger.warn('Medium severity error occurred', logData);
        break;
      case ErrorSeverity.LOW:
        logger.info('Low severity error occurred', logData);
        break;
    }
  }

  /**
   * Check alert conditions and trigger alerts
   */
  private async checkAlertConditions(occurrence: ErrorOccurrence): Promise<void> {
    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;

      const shouldAlert = this.evaluateAlertCondition(rule);
      if (shouldAlert) {
        await this.triggerAlert(rule, occurrence);
      }
    }
  }

  /**
   * Evaluate if alert condition is met
   */
  private evaluateAlertCondition(rule: AlertRule): boolean {
    const { condition } = rule;
    const windowStart = Date.now() - condition.windowMs;

    // Filter occurrences within the time window
    const relevantOccurrences = Array.from(this.errorOccurrences.values())
      .filter(o => new Date(o.timestamp).getTime() > windowStart);

    // Apply condition filters
    let filteredOccurrences = relevantOccurrences;

    if (condition.errorCode) {
      filteredOccurrences = filteredOccurrences.filter(o => o.error.code === condition.errorCode);
    }
    if (condition.category) {
      filteredOccurrences = filteredOccurrences.filter(o => o.error.category === condition.category);
    }
    if (condition.severity) {
      filteredOccurrences = filteredOccurrences.filter(o => o.severity === condition.severity);
    }

    return filteredOccurrences.length >= condition.threshold;
  }

  /**
   * Trigger alert actions
   */
  private async triggerAlert(rule: AlertRule, occurrence: ErrorOccurrence): Promise<void> {
    logger.warn('Alert triggered', {
      ruleId: rule.id,
      ruleName: rule.name,
      occurrenceId: occurrence.id,
      errorCode: occurrence.error.code,
    });

    for (const action of rule.actions) {
      try {
        await this.executeAlertAction(action, rule, occurrence);
      } catch (error) {
        logger.error('Failed to execute alert action', {
          ruleId: rule.id,
          actionType: action.type,
          error: error instanceof Error ? { message: error.message, stack: error.stack } : { message: 'Unknown error' },
        });
      }
    }
  }

  /**
   * Execute alert action
   */
  private async executeAlertAction(
    action: AlertRule['actions'][0],
    rule: AlertRule,
    occurrence: ErrorOccurrence
  ): Promise<void> {
    const alertData = {
      rule,
      occurrence,
      timestamp: new Date().toISOString(),
    };

    switch (action.type) {
      case 'webhook':
        // In a real implementation, this would make an HTTP request
        logger.info('Webhook alert triggered', { target: action.target, alertData });
        break;
      case 'email':
        // In a real implementation, this would send an email
        logger.info('Email alert triggered', { target: action.target, alertData });
        break;
      case 'slack':
        // In a real implementation, this would send a Slack message
        logger.info('Slack alert triggered', { target: action.target, alertData });
        break;
    }
  }

  /**
   * Initialize metrics structure
   */
  private initializeMetrics(): ErrorMetrics {
    return {
      totalErrors: 0,
      errorsByCategory: Object.values(ErrorCategory).reduce((acc, category) => {
        acc[category] = 0;
        return acc;
      }, {} as Record<ErrorCategory, number>),
      errorsBySeverity: Object.values(ErrorSeverity).reduce((acc, severity) => {
        acc[severity] = 0;
        return acc;
      }, {} as Record<ErrorSeverity, number>),
      errorsByHour: {},
      topErrors: [],
      meanTimeToResolution: 0,
      errorRate: 0,
    };
  }

  /**
   * Setup default alert rules
   */
  private setupDefaultAlertRules(): void {
    // Critical error alert
    this.addAlertRule({
      id: 'critical-errors',
      name: 'Critical Errors',
      condition: {
        severity: ErrorSeverity.CRITICAL,
        threshold: 1,
        windowMs: 60 * 1000, // 1 minute
      },
      actions: [
        { type: 'webhook', target: process.env.ALERT_WEBHOOK_URL || '' },
      ],
      enabled: true,
    });

    // High error rate alert
    this.addAlertRule({
      id: 'high-error-rate',
      name: 'High Error Rate',
      condition: {
        threshold: 10,
        windowMs: 5 * 60 * 1000, // 5 minutes
      },
      actions: [
        { type: 'email', target: process.env.ALERT_EMAIL || '' },
      ],
      enabled: true,
    });

    // Database error alert
    this.addAlertRule({
      id: 'database-errors',
      name: 'Database Errors',
      condition: {
        category: ErrorCategory.DATABASE,
        threshold: 3,
        windowMs: 10 * 60 * 1000, // 10 minutes
      },
      actions: [
        { type: 'slack', target: process.env.SLACK_WEBHOOK_URL || '' },
      ],
      enabled: true,
    });
  }

  /**
   * Start cleanup scheduler for old error occurrences
   */
  private startCleanupScheduler(): void {
    const cleanupInterval = 24 * 60 * 60 * 1000; // 24 hours
    
    setInterval(() => {
      this.cleanupOldErrors();
    }, cleanupInterval);
  }

  /**
   * Clean up old error occurrences
   */
  private cleanupOldErrors(): void {
    const cutoffTime = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [id, occurrence] of this.errorOccurrences) {
      if (new Date(occurrence.timestamp).getTime() < cutoffTime) {
        this.errorOccurrences.delete(id);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info('Cleaned up old error occurrences', { cleanedCount });
    }
  }

  /**
   * Generate unique occurrence ID
   */
  private generateOccurrenceId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// Global error monitor instance
export const errorMonitor = new ErrorMonitor();

/**
 * Express middleware for automatic error tracking
 */
export function errorTrackingMiddleware() {
  return async (error: any, req: any, res: any, next: any) => {
    if (error instanceof BaseError) {
      const context = {
        requestId: req.id,
        userId: req.user?.id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        starshipId: req.params?.starshipId || req.body?.starshipId,
      };

      await errorMonitor.trackError(error, context);
    }

    next(error);
  };
}