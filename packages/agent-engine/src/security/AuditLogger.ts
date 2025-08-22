/**
 * Audit Logger for MCP Tool Usage
 * 
 * Provides comprehensive audit logging for security and compliance
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';

export interface AuditEvent {
  id: string;
  timestamp: Date;
  eventType: 'tool_invocation' | 'access_denied' | 'policy_violation' | 'error' | 'configuration_change';
  severity: 'info' | 'warning' | 'error' | 'critical';
  actor: AuditActor;
  resource: AuditResource;
  action: AuditAction;
  result: AuditResult;
  context: AuditContext;
  metadata?: Record<string, any>;
}

export interface AuditActor {
  type: 'agent' | 'user' | 'system';
  id: string;
  name?: string;
  starshipId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditResource {
  type: 'mcp_tool' | 'mcp_server' | 'configuration' | 'policy';
  id: string;
  name: string;
  provider?: string;
  category?: string;
}

export interface AuditAction {
  type: 'invoke' | 'read' | 'write' | 'delete' | 'configure' | 'authorize';
  method?: string;
  parameters?: any;
  parameterHash?: string; // For sensitive data
}

export interface AuditResult {
  success: boolean;
  statusCode?: number;
  duration?: number;
  error?: {
    type: string;
    message: string;
    stack?: string;
  };
  output?: any;
  outputHash?: string; // For sensitive data
}

export interface AuditContext {
  taskId?: string;
  contextId?: string; // Migration note: was expeditionId
  expeditionId?: string; // TODO: deprecated - use contextId instead
  sessionId?: string;
  correlationId: string;
  environment: string;
  version: string;
  tags?: string[];
}

export interface AuditLoggerConfig {
  enableConsole: boolean;
  enableFile: boolean;
  enableRemote: boolean;
  sensitiveFields: string[];
  retentionDays: number;
  compressionEnabled: boolean;
}

export class AuditLogger extends EventEmitter {
  private buffer: AuditEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly bufferSize = 100;
  private readonly flushInterval = 5000; // 5 seconds

  constructor(
    private config: AuditLoggerConfig = {
      enableConsole: true,
      enableFile: true,
      enableRemote: false,
      sensitiveFields: ['[DEFAULT-PASSWORD]', 'token', 'secret', 'key', 'authorization'],
      retentionDays: 90,
      compressionEnabled: true
    }
  ) {
    super();
    this.startFlushTimer();
  }

  /**
   * Log a tool invocation
   */
  logToolInvocation(
    actor: AuditActor,
    toolName: string,
    toolProvider: string,
    parameters: any,
    result: AuditResult,
    context: Partial<AuditContext>
  ): void {
    const event: AuditEvent = {
      id: this.generateEventId(),
      timestamp: new Date(),
      eventType: 'tool_invocation',
      severity: result.success ? 'info' : 'error',
      actor,
      resource: {
        type: 'mcp_tool',
        id: `${toolProvider}.${toolName}`,
        name: toolName,
        provider: toolProvider
      },
      action: {
        type: 'invoke',
        method: toolName,
        parameters: this.sanitizeData(parameters),
        parameterHash: this.hashSensitiveData(parameters)
      },
      result: {
        ...result,
        output: this.sanitizeData(result.output),
        outputHash: this.hashSensitiveData(result.output)
      },
      context: this.enrichContext(context)
    };

    this.addEvent(event);
  }

  /**
   * Log access denied event
   */
  logAccessDenied(
    actor: AuditActor,
    resource: AuditResource,
    reason: string,
    context: Partial<AuditContext>
  ): void {
    const event: AuditEvent = {
      id: this.generateEventId(),
      timestamp: new Date(),
      eventType: 'access_denied',
      severity: 'warning',
      actor,
      resource,
      action: {
        type: 'authorize'
      },
      result: {
        success: false,
        error: {
          type: 'AccessDenied',
          message: reason
        }
      },
      context: this.enrichContext(context),
      metadata: {
        reason,
        deniedAt: new Date().toISOString()
      }
    };

    this.addEvent(event);
  }

  /**
   * Log policy violation
   */
  logPolicyViolation(
    actor: AuditActor,
    policyName: string,
    violation: string,
    context: Partial<AuditContext>
  ): void {
    const event: AuditEvent = {
      id: this.generateEventId(),
      timestamp: new Date(),
      eventType: 'policy_violation',
      severity: 'critical',
      actor,
      resource: {
        type: 'policy',
        id: policyName,
        name: policyName
      },
      action: {
        type: 'invoke'
      },
      result: {
        success: false,
        error: {
          type: 'PolicyViolation',
          message: violation
        }
      },
      context: this.enrichContext(context),
      metadata: {
        policyName,
        violation,
        violatedAt: new Date().toISOString()
      }
    };

    this.addEvent(event);
  }

  /**
   * Log configuration change
   */
  logConfigurationChange(
    actor: AuditActor,
    configType: string,
    changes: any,
    context: Partial<AuditContext>
  ): void {
    const event: AuditEvent = {
      id: this.generateEventId(),
      timestamp: new Date(),
      eventType: 'configuration_change',
      severity: 'info',
      actor,
      resource: {
        type: 'configuration',
        id: configType,
        name: configType
      },
      action: {
        type: 'configure',
        parameters: this.sanitizeData(changes)
      },
      result: {
        success: true
      },
      context: this.enrichContext(context),
      metadata: {
        configType,
        changeCount: Object.keys(changes).length
      }
    };

    this.addEvent(event);
  }

  /**
   * Query audit logs
   */
  async query(criteria: AuditQueryCriteria): Promise<AuditEvent[]> {
    // In a real implementation, this would query from persistent storage
    return this.buffer.filter(event => {
      if (criteria.startTime && event.timestamp < criteria.startTime) return false;
      if (criteria.endTime && event.timestamp > criteria.endTime) return false;
      if (criteria.eventTypes && !criteria.eventTypes.includes(event.eventType)) return false;
      if (criteria.actorId && event.actor.id !== criteria.actorId) return false;
      if (criteria.starshipId && event.actor.starshipId !== criteria.starshipId) return false;
      if (criteria.severity && event.severity !== criteria.severity) return false;
      if (criteria.toolName && event.resource.name !== criteria.toolName) return false;
      return true;
    });
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    starshipId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ComplianceReport> {
    const events = await this.query({
      starshipId,
      startTime: startDate,
      endTime: endDate
    });

    const report: ComplianceReport = {
      starshipId,
      period: {
        start: startDate,
        end: endDate
      },
      summary: {
        totalEvents: events.length,
        toolInvocations: events.filter(e => e.eventType === 'tool_invocation').length,
        accessDenials: events.filter(e => e.eventType === 'access_denied').length,
        policyViolations: events.filter(e => e.eventType === 'policy_violation').length,
        errors: events.filter(e => e.result.success === false).length
      },
      toolUsage: this.aggregateToolUsage(events),
      violations: events.filter(e => e.eventType === 'policy_violation'),
      anomalies: this.detectAnomalies(events),
      recommendations: this.generateRecommendations(events)
    };

    return report;
  }

  /**
   * Export audit logs
   */
  async export(format: 'json' | 'csv' | 'parquet', criteria?: AuditQueryCriteria): Promise<Buffer> {
    const events = criteria ? await this.query(criteria) : this.buffer;

    switch (format) {
      case 'json':
        return Buffer.from(JSON.stringify(events, null, 2));
      
      case 'csv':
        return this.exportToCSV(events);
      
      case 'parquet':
        // Would use a parquet library in production
        throw new Error('Parquet export not implemented');
      
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Cleanup old audit logs
   */
  async cleanup(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    const initialCount = this.buffer.length;
    this.buffer = this.buffer.filter(event => event.timestamp > cutoffDate);
    
    const deletedCount = initialCount - this.buffer.length;
    
    this.emit('cleanup', {
      deletedCount,
      retainedCount: this.buffer.length,
      cutoffDate
    });

    return deletedCount;
  }

  private addEvent(event: AuditEvent): void {
    this.buffer.push(event);
    
    // Emit event for real-time monitoring
    this.emit('audit', event);

    // Trigger flush if buffer is full
    if (this.buffer.length >= this.bufferSize) {
      this.flush();
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => this.flush(), this.flushInterval);
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const events = [...this.buffer];
    this.buffer = [];

    try {
      // Write to different destinations based on config
      if (this.config.enableConsole) {
        this.writeToConsole(events);
      }

      if (this.config.enableFile) {
        await this.writeToFile(events);
      }

      if (this.config.enableRemote) {
        await this.writeToRemote(events);
      }

      this.emit('flush', { count: events.length });
    } catch (error) {
      // Re-add events to buffer on failure
      this.buffer.unshift(...events);
      this.emit('flushError', error);
    }
  }

  private writeToConsole(events: AuditEvent[]): void {
    events.forEach(event => {
      const level = this.getSeverityLevel(event.severity);
      if (level === 'log') {
        console.log(`[AUDIT] ${JSON.stringify(event)}`);
      } else if (level === 'warn') {
        console.warn(`[AUDIT] ${JSON.stringify(event)}`);
      } else if (level === 'error') {
        console.error(`[AUDIT] ${JSON.stringify(event)}`);
      }
    });
  }

  private async writeToFile(events: AuditEvent[]): Promise<void> {
    // In production, write to file system or S3
    // This is a placeholder
  }

  private async writeToRemote(events: AuditEvent[]): Promise<void> {
    // In production, send to remote audit service
    // This is a placeholder
  }

  private generateEventId(): string {
    return `audit_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  private enrichContext(context: Partial<AuditContext>): AuditContext {
    return {
      correlationId: context.correlationId || this.generateCorrelationId(),
      environment: context.environment || process.env.NODE_ENV || 'development',
      version: context.version || process.env.APP_VERSION || '1.0.0',
      ...context
    };
  }

  private generateCorrelationId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private sanitizeData(data: any): any {
    if (!data) return data;

    const sanitized = JSON.parse(JSON.stringify(data));
    
    this.config.sensitiveFields.forEach(field => {
      this.redactField(sanitized, field);
    });

    return sanitized;
  }

  private redactField(obj: any, field: string): void {
    if (!obj || typeof obj !== 'object') return;

    for (const key in obj) {
      if (key.toLowerCase().includes(field.toLowerCase())) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object') {
        this.redactField(obj[key], field);
      }
    }
  }

  private hashSensitiveData(data: any): string {
    if (!data) return '';
    
    const str = JSON.stringify(data);
    return crypto.createHash('sha256').update(str).digest('hex');
  }

  private getSeverityLevel(severity: string): keyof Console {
    const levelMap: Record<string, keyof Console> = {
      'info': 'log',
      'warning': 'warn',
      'error': 'error',
      'critical': 'error'
    };
    return levelMap[severity] || 'log';
  }

  private aggregateToolUsage(events: AuditEvent[]): ToolUsageStats[] {
    const usage = new Map<string, ToolUsageStats>();

    events
      .filter(e => e.eventType === 'tool_invocation')
      .forEach(event => {
        const key = event.resource.id;
        const stats = usage.get(key) || {
          toolId: key,
          toolName: event.resource.name,
          provider: event.resource.provider || '',
          invocations: 0,
          successes: 0,
          failures: 0,
          totalDuration: 0
        };

        stats.invocations++;
        if (event.result.success) {
          stats.successes++;
        } else {
          stats.failures++;
        }
        if (event.result.duration) {
          stats.totalDuration += event.result.duration;
        }

        usage.set(key, stats);
      });

    return Array.from(usage.values());
  }

  private detectAnomalies(events: AuditEvent[]): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // Detect unusual error rates
    const errorRate = events.filter(e => !e.result.success).length / events.length;
    if (errorRate > 0.2) {
      anomalies.push({
        type: 'high_error_rate',
        severity: 'warning',
        description: `High error rate detected: ${(errorRate * 100).toFixed(1)}%`,
        value: errorRate
      });
    }

    // Detect repeated access denials
    const denialsByActor = new Map<string, number>();
    events
      .filter(e => e.eventType === 'access_denied')
      .forEach(event => {
        const count = denialsByActor.get(event.actor.id) || 0;
        denialsByActor.set(event.actor.id, count + 1);
      });

    denialsByActor.forEach((count, actorId) => {
      if (count > 5) {
        anomalies.push({
          type: 'repeated_access_denial',
          severity: 'critical',
          description: `Actor ${actorId} had ${count} access denials`,
          value: count,
          metadata: { actorId }
        });
      }
    });

    return anomalies;
  }

  private generateRecommendations(events: AuditEvent[]): string[] {
    const recommendations: string[] = [];

    // Analyze patterns and generate recommendations
    const errorRate = events.filter(e => !e.result.success).length / events.length;
    if (errorRate > 0.1) {
      recommendations.push('Consider reviewing tool configurations due to high error rate');
    }

    const violations = events.filter(e => e.eventType === 'policy_violation');
    if (violations.length > 0) {
      recommendations.push('Review and update security policies to prevent violations');
    }

    return recommendations;
  }

  private exportToCSV(events: AuditEvent[]): Buffer {
    const headers = [
      'id', 'timestamp', 'eventType', 'severity',
      'actorType', 'actorId', 'resourceType', 'resourceName',
      'actionType', 'success', 'errorMessage', 'duration'
    ];

    const rows = events.map(event => [
      event.id,
      event.timestamp.toISOString(),
      event.eventType,
      event.severity,
      event.actor.type,
      event.actor.id,
      event.resource.type,
      event.resource.name,
      event.action.type,
      event.result.success,
      event.result.error?.message || '',
      event.result.duration || ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return Buffer.from(csv);
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }
}

// Type definitions
export interface AuditQueryCriteria {
  startTime?: Date;
  endTime?: Date;
  eventTypes?: AuditEvent['eventType'][];
  severity?: AuditEvent['severity'];
  actorId?: string;
  starshipId?: string;
  toolName?: string;
  limit?: number;
}

export interface ComplianceReport {
  starshipId: string;
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalEvents: number;
    toolInvocations: number;
    accessDenials: number;
    policyViolations: number;
    errors: number;
  };
  toolUsage: ToolUsageStats[];
  violations: AuditEvent[];
  anomalies: Anomaly[];
  recommendations: string[];
}

export interface ToolUsageStats {
  toolId: string;
  toolName: string;
  provider: string;
  invocations: number;
  successes: number;
  failures: number;
  totalDuration: number;
}

export interface Anomaly {
  type: string;
  severity: 'warning' | 'critical';
  description: string;
  value: number;
  metadata?: Record<string, any>;
}