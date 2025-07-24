/**
 * Structured Logging Utility
 * 
 * Provides comprehensive logging capabilities with structured formats,
 * error tracking, and monitoring integration for the expedition system.
 */

import {
  StandardError,
  isStandardError,
  ErrorSeverity,
  ErrorCategory,
  StandardErrorCode
} from '@starships/protocol';

// ============================================================================
// LOGGING CONFIGURATION AND TYPES
// ============================================================================

/**
 * Log levels for different types of messages
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  version: string;
  environment: string;
  message: string;
  context?: LogContext;
  error?: ErrorLogData;
  request?: RequestLogData;
  performance?: PerformanceLogData;
  metadata?: Record<string, any>;
  correlationId?: string;
  requestId?: string;
  userId?: string;
  sessionId?: string;
}

/**
 * Context information for log entries
 */
export interface LogContext {
  service: string;
  method?: string;
  resource?: string;
  operation?: string;
  component?: string;
  function?: string;
  line?: number;
  file?: string;
  stackTrace?: string;
  metadata?: Record<string, any>;
  status?: string;
  requestId?: string;
  responseTime?: number;
  serviceCount?: number;
  stack?: string;
  error?: Record<string, any>;
  services?: any[];
}

/**
 * Error-specific log data
 */
export interface ErrorLogData {
  name: string;
  code: StandardErrorCode;
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  correlationId: string;
  httpStatusCode: number;
  isRetryable: boolean;
  details?: Record<string, any>;
  context?: LogContext;
  stack?: string;
  originalError?: string;
}

/**
 * Request-specific log data
 */
export interface RequestLogData {
  method: string;
  url: string;
  path: string;
  query?: Record<string, any>;
  headers?: Record<string, any>;
  body?: any;
  userAgent?: string;
  ip?: string;
  userId?: string;
  requestId?: string;
  duration?: number;
  statusCode?: number;
  responseSize?: number;
}

/**
 * Performance-specific log data
 */
export interface PerformanceLogData {
  operation: string;
  duration: number;
  startTime: number;
  endTime: number;
  memoryUsage?: NodeJS.MemoryUsage;
  cpuUsage?: NodeJS.CpuUsage;
  metadata?: Record<string, any>;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  service: string;
  version: string;
  environment: 'development' | 'production' | 'test';
  logLevel: LogLevel;
  enableConsoleOutput: boolean;
  enableFileOutput: boolean;
  enableStructuredLogging: boolean;
  enableErrorTracking: boolean;
  enablePerformanceLogging: boolean;
  sanitizeHeaders: boolean;
  sanitizeBody: boolean;
  maxBodySize: number;
  fileOutputPath?: string;
}

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG: LoggerConfig = {
  service: 'starships-api',
  version: process.env.npm_package_version || '1.0.0',
  environment: (process.env.NODE_ENV as any) || 'development',
  logLevel: (process.env.LOG_LEVEL as LogLevel) || 'info',
  enableConsoleOutput: true,
  enableFileOutput: false,
  enableStructuredLogging: true,
  enableErrorTracking: true,
  enablePerformanceLogging: true,
  sanitizeHeaders: true,
  sanitizeBody: true,
  maxBodySize: 1024 * 10, // 10KB
  fileOutputPath: './logs'
};

// ============================================================================
// LOGGER CLASS
// ============================================================================

/**
 * Structured logger with error tracking and monitoring capabilities
 */
export class Logger {
  private static instance: Logger;
  private config: LoggerConfig;
  private logLevelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    critical: 4
  };

  private constructor(config: LoggerConfig) {
    this.config = config;
  }

  /**
   * Get singleton logger instance
   */
  static getInstance(config: Partial<LoggerConfig> = {}): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger({ ...DEFAULT_CONFIG, ...config });
    }
    return Logger.instance;
  }

  /**
   * Update logger configuration
   */
  updateConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if a log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return this.logLevelPriority[level] >= this.logLevelPriority[this.config.logLevel];
  }

  /**
   * Create base log entry
   */
  private createBaseLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    metadata?: Record<string, any>
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      service: this.config.service,
      version: this.config.version,
      environment: this.config.environment,
      message,
      context,
      metadata
    };
  }

  /**
   * Sanitize sensitive data from objects
   */
  private sanitize(obj: any, maxSize?: number): any {
    if (!obj) return obj;

    const sensitiveKeys = [
      '[DEFAULT-PASSWORD]', 'token', 'authorization', 'cookie', 'x-api-key', 
      'x-auth-token', 'secret', 'key', 'credentials'
    ];

    const sanitized = JSON.parse(JSON.stringify(obj));

    const sanitizeRecursive = (item: any): any => {
      if (typeof item === 'object' && item !== null) {
        if (Array.isArray(item)) {
          return item.map(sanitizeRecursive);
        }

        const result: any = {};
        for (const [key, value] of Object.entries(item)) {
          if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
            result[key] = '[REDACTED]';
          } else {
            result[key] = sanitizeRecursive(value);
          }
        }
        return result;
      }
      return item;
    };

    let result = sanitizeRecursive(sanitized);

    // Truncate if too large
    if (maxSize) {
      const serialized = JSON.stringify(result);
      if (serialized.length > maxSize) {
        result = {
          ...result,
          _truncated: true,
          _originalSize: serialized.length,
          _maxSize: maxSize
        };
        // Simple truncation - in production, you might want more sophisticated truncation
        const truncatedStr = serialized.substring(0, maxSize - 100) + '...[TRUNCATED]';
        try {
          result = JSON.parse(truncatedStr + '}');
        } catch {
          result = { _error: 'Failed to truncate object', _originalSize: serialized.length };
        }
      }
    }

    return result;
  }

  /**
   * Output log entry
   */
  private output(logEntry: LogEntry): void {
    if (!this.shouldLog(logEntry.level)) return;

    if (this.config.enableConsoleOutput) {
      if (this.config.enableStructuredLogging) {
        // Structured JSON output
        console.log(JSON.stringify(logEntry, null, this.config.environment === 'development' ? 2 : 0));
      } else {
        // Simple text output
        const timestamp = logEntry.timestamp;
        const level = logEntry.level.toUpperCase().padEnd(8);
        const service = logEntry.service;
        const message = logEntry.message;
        const context = logEntry.context ? ` [${logEntry.context.operation || logEntry.context.method}]` : '';
        
        console.log(`${timestamp} ${level} ${service}${context} ${message}`);
        
        if (logEntry.error && logEntry.level === 'error') {
          console.error('Error Details:', logEntry.error);
        }
      }
    }

    // File output would be implemented here in production
    if (this.config.enableFileOutput && this.config.fileOutputPath) {
      // TODO: Implement file logging with rotation
    }
  }

  // ============================================================================
  // PUBLIC LOGGING METHODS
  // ============================================================================

  /**
   * Log debug message
   */
  debug(message: string, context?: LogContext, metadata?: Record<string, any>): void {
    const logEntry = this.createBaseLogEntry('debug', message, context, metadata);
    this.output(logEntry);
  }

  /**
   * Log info message
   */
  info(message: string, context?: LogContext, metadata?: Record<string, any>): void {
    const logEntry = this.createBaseLogEntry('info', message, context, metadata);
    this.output(logEntry);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext, metadata?: Record<string, any>): void {
    const logEntry = this.createBaseLogEntry('warn', message, context, metadata);
    this.output(logEntry);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | StandardError, context?: LogContext, metadata?: Record<string, any>): void {
    const logEntry = this.createBaseLogEntry('error', message, context, metadata);

    if (error) {
      if (isStandardError(error)) {
        logEntry.error = {
          name: error.name,
          code: error.code,
          message: error.message,
          category: error.category,
          severity: error.severity,
          correlationId: error.correlationId,
          httpStatusCode: error.httpStatusCode,
          isRetryable: error.isRetryable,
          details: error.details,
          context: error.context as LogContext,
          stack: error.stack
        };
        logEntry.correlationId = error.correlationId;
        logEntry.userId = error.userId;
        logEntry.requestId = error.requestId;
      } else {
        logEntry.error = {
          name: error.name,
          code: 'UNKNOWN_ERROR',
          message: error.message,
          category: 'unknown',
          severity: 'medium',
          correlationId: '',
          httpStatusCode: 500,
          isRetryable: false,
          stack: error.stack,
          originalError: error.toString()
        };
      }
    }

    this.output(logEntry);
  }

  /**
   * Log critical error message
   */
  critical(message: string, error?: Error | StandardError, context?: LogContext, metadata?: Record<string, any>): void {
    const logEntry = this.createBaseLogEntry('critical', message, context, metadata);
    logEntry.level = 'critical';

    if (error) {
      if (isStandardError(error)) {
        logEntry.error = {
          name: error.name,
          code: error.code,
          message: error.message,
          category: error.category,
          severity: error.severity,
          correlationId: error.correlationId,
          httpStatusCode: error.httpStatusCode,
          isRetryable: error.isRetryable,
          details: error.details,
          context: error.context as LogContext,
          stack: error.stack
        };
        logEntry.correlationId = error.correlationId;
        logEntry.userId = error.userId;
        logEntry.requestId = error.requestId;
      } else {
        logEntry.error = {
          name: error.name,
          code: 'UNKNOWN_ERROR',
          message: error.message,
          category: 'unknown',
          severity: 'critical',
          correlationId: '',
          httpStatusCode: 500,
          isRetryable: false,
          stack: error.stack,
          originalError: error.toString()
        };
      }
    }

    this.output(logEntry);
  }

  /**
   * Log request information
   */
  logRequest(
    message: string,
    requestData: Partial<RequestLogData>,
    level: LogLevel = 'info',
    context?: LogContext,
    metadata?: Record<string, any>
  ): void {
    const logEntry = this.createBaseLogEntry(level, message, context, metadata);
    
    logEntry.request = {
      method: requestData.method || 'UNKNOWN',
      url: requestData.url || '',
      path: requestData.path || '',
      query: this.config.sanitizeBody ? this.sanitize(requestData.query) : requestData.query,
      headers: this.config.sanitizeHeaders ? this.sanitize(requestData.headers) : requestData.headers,
      body: this.config.sanitizeBody ? this.sanitize(requestData.body, this.config.maxBodySize) : requestData.body,
      userAgent: requestData.userAgent,
      ip: requestData.ip,
      userId: requestData.userId,
      requestId: requestData.requestId,
      duration: requestData.duration,
      statusCode: requestData.statusCode,
      responseSize: requestData.responseSize
    };

    logEntry.userId = requestData.userId;
    logEntry.requestId = requestData.requestId;

    this.output(logEntry);
  }

  /**
   * Log performance information
   */
  logPerformance(
    message: string,
    performanceData: PerformanceLogData,
    level: LogLevel = 'info',
    context?: LogContext,
    metadata?: Record<string, any>
  ): void {
    if (!this.config.enablePerformanceLogging) return;

    const logEntry = this.createBaseLogEntry(level, message, context, metadata);
    logEntry.performance = performanceData;

    this.output(logEntry);
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: Partial<LogContext>): Logger {
    const childLogger = new Logger(this.config);
    
    // Override methods to include additional context
    const originalMethods = ['debug', 'info', 'warn', 'error', 'critical'];
    originalMethods.forEach(method => {
      const originalMethod = (childLogger as any)[method];
      (childLogger as any)[method] = (message: string, context?: LogContext, metadata?: Record<string, any>) => {
        const mergedContext = { ...additionalContext, ...context };
        return originalMethod.call(childLogger, message, mergedContext, metadata);
      };
    });

    return childLogger;
  }
}

// ============================================================================
// PERFORMANCE MONITORING UTILITIES
// ============================================================================

/**
 * Performance timer for measuring operation duration
 */
export class PerformanceTimer {
  private startTime: number;
  private startCpuUsage?: NodeJS.CpuUsage;
  private operation: string;
  private logger: Logger;

  constructor(operation: string, logger?: Logger) {
    this.operation = operation;
    this.logger = logger || Logger.getInstance();
    this.startTime = Date.now();
    
    if (typeof process !== 'undefined' && process.cpuUsage) {
      this.startCpuUsage = process.cpuUsage();
    }
  }

  /**
   * End timing and log performance data
   */
  end(context?: LogContext, metadata?: Record<string, any>): number {
    const endTime = Date.now();
    const duration = endTime - this.startTime;
    
    const performanceData: PerformanceLogData = {
      operation: this.operation,
      duration,
      startTime: this.startTime,
      endTime,
      metadata
    };

    if (this.startCpuUsage && process.cpuUsage) {
      performanceData.cpuUsage = process.cpuUsage(this.startCpuUsage);
    }

    if (process.memoryUsage) {
      performanceData.memoryUsage = process.memoryUsage();
    }

    this.logger.logPerformance(
      `Operation '${this.operation}' completed in ${duration}ms`,
      performanceData,
      'info',
      context,
      metadata
    );

    return duration;
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Create a performance timer
 */
export function createTimer(operation: string, logger?: Logger): PerformanceTimer {
  return new PerformanceTimer(operation, logger);
}

/**
 * Get default logger instance
 */
export function getLogger(config?: Partial<LoggerConfig>): Logger {
  return Logger.getInstance(config);
}

/**
 * Create a logger with specific context
 */
export function createLogger(context: LogContext, config?: Partial<LoggerConfig>): Logger {
  const logger = Logger.getInstance(config);
  return logger.child(context);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default Logger;