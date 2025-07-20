/**
 * Structured Logging and Monitoring System for Starships.ai
 *
 * This module provides structured logging with proper context, correlation IDs,
 * performance monitoring, and error tracking capabilities.
 */

import { BaseError, ErrorUtils } from '../errors';

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

/**
 * Log context interface for structured logging
 */
export interface LogContext {
  requestId?: string;
  userId?: string;
  starshipId?: string;
  agentId?: string;
  operation?: string;
  component?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  duration?: number;
  metadata?: Record<string, any>;
  error?: Record<string, any>;
}

/**
 * Performance metrics interface
 */
export interface PerformanceMetrics {
  operation: string;
  duration: number;
  timestamp: string;
  success: boolean;
  errorCode?: string;
  metadata?: Record<string, any>;
}

/**
 * Health check status interface
 */
export interface HealthStatus {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  responseTime?: number;
  details?: Record<string, any>;
}

/**
 * Structured logger class
 */
export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;
  private enableConsole: boolean;
  private enableFile: boolean;
  private enableMetrics: boolean;

  private constructor() {
    this.logLevel = this.parseLogLevel(process.env.LOG_LEVEL || 'info');
    this.enableConsole = process.env.LOG_CONSOLE !== 'false';
    this.enableFile = process.env.LOG_FILE === 'true';
    this.enableMetrics = process.env.LOG_METRICS === 'true';
  }

  /**
   * Get singleton logger instance
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Parse log level from string
   */
  private parseLogLevel(level: string): LogLevel {
    const normalizedLevel = level.toLowerCase();
    if (Object.values(LogLevel).includes(normalizedLevel as LogLevel)) {
      return normalizedLevel as LogLevel;
    }
    return LogLevel.INFO;
  }

  /**
   * Check if log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.FATAL];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Format log message with context
   */
  private formatMessage(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error | BaseError
  ): Record<string, any> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    };

    if (error) {
      if (error instanceof BaseError) {
        logEntry.error = ErrorUtils.extractLogDetails(error);
      } else {
        logEntry.error = {
          name: error.name,
          message: error.message,
          stack: error.stack,
        };
      }
    }

    return logEntry;
  }

  /**
   * Output log message
   */
  private output(logEntry: Record<string, any>): void {
    if (this.enableConsole) {
      const { level, timestamp, message, ...rest } = logEntry;

      // Color coding for console output
      const colors = {
        [LogLevel.DEBUG]: '\x1b[36m', // Cyan
        [LogLevel.INFO]: '\x1b[32m', // Green
        [LogLevel.WARN]: '\x1b[33m', // Yellow
        [LogLevel.ERROR]: '\x1b[31m', // Red
        [LogLevel.FATAL]: '\x1b[35m', // Magenta
      };

      const reset = '\x1b[0m';
      const color = colors[level as LogLevel] || '';

      console.log(
        `${color}[${timestamp}] ${level.toUpperCase()}${reset}: ${message}`,
        Object.keys(rest).length > 0 ? rest : ''
      );
    }

    // TODO: Implement file logging if needed
    if (this.enableFile) {
      // File logging implementation would go here
    }

    // TODO: Implement metrics collection if needed
    if (this.enableMetrics) {
      // Metrics collection implementation would go here
    }
  }

  /**
   * Log debug message
   */
  public debug(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const logEntry = this.formatMessage(LogLevel.DEBUG, message, context);
      this.output(logEntry);
    }
  }

  /**
   * Log info message
   */
  public info(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const logEntry = this.formatMessage(LogLevel.INFO, message, context);
      this.output(logEntry);
    }
  }

  /**
   * Log warning message
   */
  public warn(message: string, context?: LogContext, error?: Error | BaseError): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const logEntry = this.formatMessage(LogLevel.WARN, message, context, error);
      this.output(logEntry);
    }
  }

  /**
   * Log error message
   */
  public error(message: string, context?: LogContext, error?: Error | BaseError): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const logEntry = this.formatMessage(LogLevel.ERROR, message, context, error);
      this.output(logEntry);
    }
  }

  /**
   * Log fatal error message
   */
  public fatal(message: string, context?: LogContext, error?: Error | BaseError): void {
    if (this.shouldLog(LogLevel.FATAL)) {
      const logEntry = this.formatMessage(LogLevel.FATAL, message, context, error);
      this.output(logEntry);
    }
  }

  /**
   * Log performance metrics
   */
  public metrics(metrics: PerformanceMetrics): void {
    if (this.enableMetrics) {
      const logEntry = this.formatMessage(LogLevel.INFO, `Performance: ${metrics.operation}`, {
        component: 'metrics',
        duration: metrics.duration,
        metadata: {
          ...metrics.metadata,
          success: metrics.success,
          errorCode: metrics.errorCode,
        },
      });
      this.output(logEntry);
    }
  }

  /**
   * Log health check status
   */
  public health(status: HealthStatus): void {
    const level = status.status === 'healthy' ? LogLevel.INFO : LogLevel.WARN;
    const logEntry = this.formatMessage(
      level,
      `Health Check: ${status.service} is ${status.status}`,
      {
        component: 'health',
        metadata: {
          service: status.service,
          responseTime: status.responseTime,
          ...status.details,
        },
      }
    );
    this.output(logEntry);
  }
}

/**
 * Performance monitoring utility
 */
class PerformanceMonitorClass {
  private static timers: Map<string, number> = new Map();
  private static logger = Logger.getInstance();

  /**
   * Start timing an operation
   */
  public static start(operationId: string): void {
    this.timers.set(operationId, Date.now());
  }

  /**
   * End timing and log performance metrics
   */
  public static end(
    operationId: string,
    operation: string,
    success: boolean = true,
    errorCode?: string,
    metadata?: Record<string, any>
  ): number {
    const startTime = this.timers.get(operationId);
    if (!startTime) {
      this.logger.warn(`Performance timer not found for operation: ${operationId}`);
      return 0;
    }

    const duration = Date.now() - startTime;
    this.timers.delete(operationId);

    const metrics: PerformanceMetrics = {
      operation,
      duration,
      timestamp: new Date().toISOString(),
      success,
      errorCode,
      metadata,
    };

    this.logger.metrics(metrics);
    return duration;
  }

  /**
   * Measure async operation
   */
  public static async measure<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const operationId = ErrorUtils.generateRequestId();
    this.start(operationId);

    try {
      const result = await fn();
      this.end(operationId, operation, true, undefined, metadata);
      return result;
    } catch (error) {
      const errorCode = error instanceof BaseError ? error.code : 'UNKNOWN_ERROR';
      this.end(operationId, operation, false, errorCode, metadata);
      throw error;
    }
  }

  /**
   * Measure sync operation
   */
  public static measureSync<T>(operation: string, fn: () => T, metadata?: Record<string, any>): T {
    const operationId = ErrorUtils.generateRequestId();
    this.start(operationId);

    try {
      const result = fn();
      this.end(operationId, operation, true, undefined, metadata);
      return result;
    } catch (error) {
      const errorCode = error instanceof BaseError ? error.code : 'UNKNOWN_ERROR';
      this.end(operationId, operation, false, errorCode, metadata);
      throw error;
    }
  }
}

/**
 * Health monitoring utility
 */
class HealthMonitorClass {
  private static logger = Logger.getInstance();
  private static healthChecks: Map<string, HealthStatus> = new Map();

  /**
   * Register a health check
   */
  public static async checkService(
    serviceName: string,
    healthCheckFn: () => Promise<boolean>,
    timeout: number = 5000
  ): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      const timeoutPromise = new Promise<boolean>((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), timeout);
      });

      const isHealthy = await Promise.race([healthCheckFn(), timeoutPromise]);
      const responseTime = Date.now() - startTime;

      const status: HealthStatus = {
        service: serviceName,
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        responseTime,
        details: { timeout },
      };

      this.healthChecks.set(serviceName, status);
      this.logger.health(status);
      return status;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const status: HealthStatus = {
        service: serviceName,
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        responseTime,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          timeout,
        },
      };

      this.healthChecks.set(serviceName, status);
      this.logger.health(status);
      return status;
    }
  }

  /**
   * Get all health check statuses
   */
  public static getAllHealthStatuses(): Record<string, HealthStatus> {
    const statuses: Record<string, HealthStatus> = {};
    this.healthChecks.forEach((status, service) => {
      statuses[service] = status;
    });
    return statuses;
  }

  /**
   * Get overall system health
   */
  public static getOverallHealth(): {
    status: 'healthy' | 'unhealthy' | 'degraded';
    services: Record<string, HealthStatus>;
    timestamp: string;
  } {
    const services = this.getAllHealthStatuses();
    const serviceStatuses = Object.values(services);

    let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';

    if (serviceStatuses.some((s) => s.status === 'unhealthy')) {
      overallStatus = serviceStatuses.every((s) => s.status === 'unhealthy')
        ? 'unhealthy'
        : 'degraded';
    } else if (serviceStatuses.some((s) => s.status === 'degraded')) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      services,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Request context utility for tracking requests across the application
 */
class RequestContextClass {
  private static contexts: Map<string, LogContext> = new Map();

  /**
   * Create new request context
   */
  public static create(requestId: string, initialContext: Partial<LogContext> = {}): LogContext {
    const context: LogContext = {
      requestId,
      ...initialContext,
    };
    this.contexts.set(requestId, context);
    return context;
  }

  /**
   * Get request context
   */
  public static get(requestId: string): LogContext | undefined {
    return this.contexts.get(requestId);
  }

  /**
   * Update request context
   */
  public static update(requestId: string, updates: Partial<LogContext>): LogContext | undefined {
    const existing = this.contexts.get(requestId);
    if (existing) {
      const updated = { ...existing, ...updates };
      this.contexts.set(requestId, updated);
      return updated;
    }
    return undefined;
  }

  /**
   * Remove request context (cleanup)
   */
  public static remove(requestId: string): void {
    this.contexts.delete(requestId);
  }

  /**
   * Clean up old contexts (call periodically)
   */
  public static cleanup(maxAge: number = 3600000): void {
    // 1 hour default
    const now = Date.now();
    const cutoff = now - maxAge;

    this.contexts.forEach((context, requestId) => {
      // Remove contexts older than maxAge
      if (context.metadata?.createdAt && context.metadata.createdAt < cutoff) {
        this.contexts.delete(requestId);
      }
    });
  }
}

// Export singleton logger instance
export const logger = Logger.getInstance();

// Create and export utility instances
export const PerformanceMonitor = PerformanceMonitorClass;
export const HealthMonitor = HealthMonitorClass;
export const RequestContext = RequestContextClass;
