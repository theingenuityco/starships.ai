/**
 * Comprehensive logging utility for server services
 * Provides structured logging with different levels and contexts
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4
}

export interface LogContext {
  userId?: string;
  starshipId?: string;
  sessionId?: string;
  operation?: string;
  duration?: number;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: Error;
  stack?: string;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;
  private logBuffer: LogEntry[] = [];
  private maxBufferSize: number = 1000;

  private constructor(logLevel: LogLevel = LogLevel.INFO) {
    this.logLevel = logLevel;
  }

  public static getInstance(logLevel: LogLevel = LogLevel.INFO): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(logLevel);
    }
    return Logger.instance;
  }

  public debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  public info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  public warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  public error(message: string, context?: LogContext, error?: Error): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  public critical(message: string, context?: LogContext, error?: Error): void {
    this.log(LogLevel.CRITICAL, message, context, error);
  }

  public log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    if (level < this.logLevel) {
      return;
    }

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: context ? { ...context } : undefined,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } as any : undefined,
      stack: error?.stack
    };

    this.logBuffer.push(logEntry);
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift();
    }

    this.outputLog(logEntry);
  }

  private outputLog(entry: LogEntry): void {
    const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'];
    const levelColors = ['\x1b[36m', '\x1b[32m', '\x1b[33m', '\x1b[31m', '\x1b[35m'];
    const resetColor = '\x1b[0m';

    const levelName = levelNames[entry.level];
    const color = levelColors[entry.level];
    const timestamp = entry.timestamp;

    let logMessage = `${color}[${timestamp}] ${levelName}${resetColor}: ${entry.message}`;

    if (entry.context) {
      logMessage += `\n  Context: ${JSON.stringify(entry.context, null, 2)}`;
    }

    if (entry.error) {
      logMessage += `\n  Error: ${entry.error.message}`;
      if (entry.stack) {
        logMessage += `\n  Stack: ${entry.stack}`;
      }
    }

    console.log(logMessage);
  }

  public getRecentLogs(count: number = 50): LogEntry[] {
    return this.logBuffer.slice(-count);
  }

  public getErrorLogs(count: number = 50): LogEntry[] {
    return this.logBuffer
      .filter(entry => entry.level >= LogLevel.ERROR)
      .slice(-count);
  }

  public clearBuffer(): void {
    this.logBuffer = [];
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }
}

export const logger = Logger.getInstance();