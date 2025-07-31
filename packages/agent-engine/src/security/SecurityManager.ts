/**
 * Security Manager for MCP Tools
 * 
 * Integrates audit logging, access control, and rate limiting
 */

import { EventEmitter } from 'events';
import { AuditLogger, AuditActor, AuditContext } from './AuditLogger';
import { MCPPolicyEnforcer, PolicyContext, PolicyDecision } from './MCPPolicyEnforcer';
import { MCPToolGateway } from '@starships/core';

export interface SecurityConfig {
  enableAudit: boolean;
  enablePolicyEnforcement: boolean;
  enableRateLimiting: boolean;
  enableEncryption: boolean;
  sensitiveDataPatterns: RegExp[];
  maxRequestSize: number;
  maxResponseSize: number;
}

export interface SecureToolInvocation {
  starshipId: string;
  agentId: string;
  userId?: string;
  toolName: string;
  toolProvider: string;
  parameters: any;
  context?: Partial<AuditContext>;
}

export interface SecurityValidation {
  valid: boolean;
  issues: SecurityIssue[];
  sanitizedParams?: any;
}

export interface SecurityIssue {
  type: 'size_limit' | 'sensitive_data' | 'injection' | 'malformed';
  severity: 'low' | 'medium' | 'high' | 'critical';
  field?: string;
  message: string;
}

export class SecurityManager extends EventEmitter {
  private auditLogger: AuditLogger;
  private policyEnforcer: MCPPolicyEnforcer;
  private rateLimiters: Map<string, RateLimiter> = new Map();

  constructor(
    private config: SecurityConfig = {
      enableAudit: true,
      enablePolicyEnforcement: true,
      enableRateLimiting: true,
      enableEncryption: true,
      sensitiveDataPatterns: [
        /\b(?:password|passwd|pwd)\b/i,
        /\b(?:secret|private_key|api_key)\b/i,
        /\b(?:token|auth|authorization)\b/i,
        /\b(?:ssn|social_security)\b/i,
        /\b(?:credit_card|cc_number)\b/i
      ],
      maxRequestSize: 1048576, // 1MB
      maxResponseSize: 5242880  // 5MB
    },
    private toolGateway?: MCPToolGateway
  ) {
    super();
    this.auditLogger = new AuditLogger();
    this.policyEnforcer = new MCPPolicyEnforcer(this.auditLogger, toolGateway);
    this.setupEventHandlers();
  }

  /**
   * Secure tool invocation with full security checks
   */
  async invokeToolSecurely(invocation: SecureToolInvocation): Promise<any> {
    const startTime = Date.now();
    let decision: PolicyDecision | null = null;
    let validationResult: SecurityValidation | null = null;

    try {
      // Step 1: Validate input
      validationResult = this.validateInput(invocation);
      if (!validationResult.valid) {
        throw new SecurityError('Input validation failed', validationResult.issues);
      }

      // Step 2: Check access policy
      if (this.config.enablePolicyEnforcement) {
        const policyContext: PolicyContext = {
          starshipId: invocation.starshipId,
          agentId: invocation.agentId,
          userId: invocation.userId,
          toolName: invocation.toolName,
          toolProvider: invocation.toolProvider,
          toolCategory: this.inferToolCategory(invocation.toolName),
          parameters: validationResult.sanitizedParams || invocation.parameters,
          environment: process.env.NODE_ENV || 'development',
          timestamp: new Date()
        };

        decision = await this.policyEnforcer.checkAccess(policyContext);
        if (!decision.allowed) {
          throw new AccessDeniedError(decision.reason || 'Access denied');
        }
      }

      // Step 3: Check rate limits
      if (this.config.enableRateLimiting) {
        const rateLimiter = this.getRateLimiter(invocation.agentId);
        if (!rateLimiter.tryAcquire()) {
          throw new RateLimitError('Rate limit exceeded');
        }
      }

      // Step 4: Execute tool
      if (!this.toolGateway) {
        throw new Error('Tool gateway not configured');
      }

      const result = await this.toolGateway.invokeTool(
        invocation.starshipId,
        invocation.toolName,
        validationResult.sanitizedParams || invocation.parameters
      );

      // Step 5: Validate output
      const outputValidation = this.validateOutput(result);
      if (!outputValidation.valid) {
        throw new SecurityError('Output validation failed', outputValidation.issues);
      }

      // Step 6: Record successful invocation
      const executionTime = Date.now() - startTime;
      
      if (this.config.enableAudit) {
        this.auditLogger.logToolInvocation(
          this.createAuditActor(invocation),
          invocation.toolName,
          invocation.toolProvider,
          validationResult.sanitizedParams || invocation.parameters,
          {
            success: true,
            duration: executionTime,
            output: outputValidation.sanitizedParams
          },
          invocation.context || {}
        );
      }

      // Update quota usage
      await this.policyEnforcer.recordUsage(
        {
          starshipId: invocation.starshipId,
          agentId: invocation.agentId,
          toolName: invocation.toolName,
          toolProvider: invocation.toolProvider,
          toolCategory: this.inferToolCategory(invocation.toolName),
          parameters: {},
          environment: process.env.NODE_ENV || 'development',
          timestamp: new Date()
        },
        executionTime,
        true
      );

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;

      // Log failure
      if (this.config.enableAudit) {
        this.auditLogger.logToolInvocation(
          this.createAuditActor(invocation),
          invocation.toolName,
          invocation.toolProvider,
          validationResult?.sanitizedParams || invocation.parameters,
          {
            success: false,
            duration: executionTime,
            error: {
              type: error instanceof Error ? error.constructor.name : 'Unknown',
              message: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined
            }
          },
          invocation.context || {}
        );
      }

      // Handle specific error types
      if (error instanceof SecurityError) {
        this.emit('securityViolation', {
          invocation,
          error,
          issues: error.issues
        });
      } else if (error instanceof AccessDeniedError) {
        this.emit('accessDenied', {
          invocation,
          decision,
          error
        });
      } else if (error instanceof RateLimitError) {
        this.emit('rateLimitExceeded', {
          invocation,
          error
        });
      }

      throw error;
    }
  }

  /**
   * Validate input parameters
   */
  validateInput(invocation: SecureToolInvocation): SecurityValidation {
    const issues: SecurityIssue[] = [];
    let sanitizedParams = invocation.parameters;

    // Check size limits
    const paramSize = JSON.stringify(invocation.parameters).length;
    if (paramSize > this.config.maxRequestSize) {
      issues.push({
        type: 'size_limit',
        severity: 'high',
        message: `Request size (${paramSize}) exceeds limit (${this.config.maxRequestSize})`
      });
    }

    // Check for sensitive data
    const sensitiveFields = this.detectSensitiveData(invocation.parameters);
    if (sensitiveFields.length > 0) {
      issues.push({
        type: 'sensitive_data',
        severity: 'medium',
        field: sensitiveFields.join(', '),
        message: 'Sensitive data detected in parameters'
      });

      // Sanitize if needed
      sanitizedParams = this.sanitizeSensitiveData(invocation.parameters);
    }

    // Check for injection patterns
    const injectionRisk = this.detectInjectionPatterns(invocation.parameters);
    if (injectionRisk) {
      issues.push({
        type: 'injection',
        severity: 'critical',
        field: injectionRisk.field,
        message: injectionRisk.message
      });
    }

    // Check for malformed data
    try {
      JSON.stringify(invocation.parameters);
    } catch (error) {
      issues.push({
        type: 'malformed',
        severity: 'high',
        message: 'Parameters contain circular references or invalid data'
      });
    }

    return {
      valid: issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0,
      issues,
      sanitizedParams
    };
  }

  /**
   * Validate output data
   */
  validateOutput(output: any): SecurityValidation {
    const issues: SecurityIssue[] = [];
    let sanitizedParams = output;

    // Check size limits
    const outputSize = JSON.stringify(output).length;
    if (outputSize > this.config.maxResponseSize) {
      issues.push({
        type: 'size_limit',
        severity: 'medium',
        message: `Response size (${outputSize}) exceeds limit (${this.config.maxResponseSize})`
      });
    }

    // Check for sensitive data in output
    const sensitiveFields = this.detectSensitiveData(output);
    if (sensitiveFields.length > 0) {
      issues.push({
        type: 'sensitive_data',
        severity: 'high',
        field: sensitiveFields.join(', '),
        message: 'Sensitive data detected in output'
      });

      // Sanitize output
      sanitizedParams = this.sanitizeSensitiveData(output);
    }

    return {
      valid: issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0,
      issues,
      sanitizedParams
    };
  }

  /**
   * Detect sensitive data in object
   */
  private detectSensitiveData(obj: any, path: string = ''): string[] {
    const sensitiveFields: string[] = [];

    if (!obj || typeof obj !== 'object') return sensitiveFields;

    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      // Check if key matches sensitive patterns
      for (const pattern of this.config.sensitiveDataPatterns) {
        if (pattern.test(key)) {
          sensitiveFields.push(currentPath);
          break;
        }
      }

      // Recursively check nested objects
      if (typeof value === 'object' && value !== null) {
        sensitiveFields.push(...this.detectSensitiveData(value, currentPath));
      }
    }

    return sensitiveFields;
  }

  /**
   * Sanitize sensitive data
   */
  private sanitizeSensitiveData(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;

    const sanitized = Array.isArray(obj) ? [...obj] : { ...obj };

    for (const [key, value] of Object.entries(sanitized)) {
      // Check if key contains sensitive pattern
      let isSensitive = false;
      for (const pattern of this.config.sensitiveDataPatterns) {
        if (pattern.test(key)) {
          isSensitive = true;
          break;
        }
      }

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeSensitiveData(value);
      }
    }

    return sanitized;
  }

  /**
   * Detect potential injection patterns
   */
  private detectInjectionPatterns(obj: any): { field: string; message: string } | null {
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER)\b)/i,
      /(--|\/\*|\*\/|;|'|")/
    ];

    const scriptPatterns = [
      /<script[^>]*>[\s\S]*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi
    ];

    function checkValue(value: any, path: string): { field: string; message: string } | null {
      if (typeof value !== 'string') return null;

      // Check SQL injection
      for (const pattern of sqlPatterns) {
        if (pattern.test(value)) {
          return {
            field: path,
            message: 'Potential SQL injection detected'
          };
        }
      }

      // Check XSS
      for (const pattern of scriptPatterns) {
        if (pattern.test(value)) {
          return {
            field: path,
            message: 'Potential XSS attack detected'
          };
        }
      }

      return null;
    }

    function traverse(obj: any, path: string = ''): { field: string; message: string } | null {
      if (!obj || typeof obj !== 'object') {
        return checkValue(obj, path);
      }

      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        const result = traverse(value, currentPath);
        if (result) return result;
      }

      return null;
    }

    return traverse(obj);
  }

  /**
   * Get rate limiter for an agent
   */
  private getRateLimiter(agentId: string): RateLimiter {
    if (!this.rateLimiters.has(agentId)) {
      this.rateLimiters.set(agentId, new RateLimiter(
        100,  // 100 requests
        60000 // per minute
      ));
    }
    return this.rateLimiters.get(agentId)!;
  }

  /**
   * Create audit actor from invocation
   */
  private createAuditActor(invocation: SecureToolInvocation): AuditActor {
    return {
      type: invocation.userId ? 'user' : 'agent',
      id: invocation.agentId,
      starshipId: invocation.starshipId,
      name: invocation.agentId
    };
  }

  /**
   * Infer tool category from name
   */
  private inferToolCategory(toolName: string): string {
    if (toolName.includes('memory')) return 'memory';
    if (toolName.includes('thinking')) return 'reasoning';
    if (toolName.includes('web') || toolName.includes('puppeteer')) return 'web';
    if (toolName.includes('file') || toolName.includes('data')) return 'data';
    return 'other';
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Forward audit events
    this.auditLogger.on('audit', (event) => {
      this.emit('audit', event);
    });

    // Handle policy violations
    this.auditLogger.on('policyViolation', (event) => {
      this.emit('policyViolation', event);
    });
  }

  /**
   * Get security metrics
   */
  getSecurityMetrics(): SecurityMetrics {
    return {
      totalInvocations: 0, // Would track this
      accessDenials: 0,
      policyViolations: 0,
      rateLimitHits: 0,
      securityIssues: 0,
      averageValidationTime: 0
    };
  }

  /**
   * Export security configuration
   */
  exportConfig(): any {
    return {
      config: this.config,
      policies: Array.from(this.policyEnforcer['policies'].values()),
      metadata: {
        exportedAt: new Date().toISOString(),
        version: '1.0.0'
      }
    };
  }
}

// Custom error classes
class SecurityError extends Error {
  constructor(message: string, public issues: SecurityIssue[]) {
    super(message);
    this.name = 'SecurityError';
  }
}

class AccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessDeniedError';
  }
}

class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// Simple rate limiter
class RateLimiter {
  private requests: number[] = [];

  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}

  tryAcquire(): boolean {
    const now = Date.now();
    
    // Remove old requests
    this.requests = this.requests.filter(time => now - time < this.windowMs);

    if (this.requests.length < this.maxRequests) {
      this.requests.push(now);
      return true;
    }

    return false;
  }

  getStatus(): { used: number; remaining: number; resetAt: Date } {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);

    const oldestRequest = this.requests[0] || now;
    
    return {
      used: this.requests.length,
      remaining: Math.max(0, this.maxRequests - this.requests.length),
      resetAt: new Date(oldestRequest + this.windowMs)
    };
  }
}

// Type definitions
interface SecurityMetrics {
  totalInvocations: number;
  accessDenials: number;
  policyViolations: number;
  rateLimitHits: number;
  securityIssues: number;
  averageValidationTime: number;
}