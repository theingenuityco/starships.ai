/**
 * MCP Policy Enforcer
 * 
 * Enforces access control policies for MCP tool usage
 */

import { AuditLogger } from './AuditLogger';
import { MCPToolGateway } from '@starships/core';

export interface MCPPolicy {
  id: string;
  name: string;
  description: string;
  starshipId: string;
  enabled: boolean;
  rules: PolicyRule[];
  quotas: PolicyQuota[];
  conditions: PolicyCondition[];
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface PolicyRule {
  id: string;
  type: 'allow' | 'deny';
  resource: {
    type: 'tool' | 'provider' | 'category';
    pattern: string; // Can use wildcards: memory.*, *.store, *
  };
  actors: {
    type: 'agent' | 'user' | 'any';
    ids?: string[]; // Specific actor IDs, or all if not specified
  };
  conditions?: RuleCondition[];
  priority: number; // Higher priority rules are evaluated first
}

export interface RuleCondition {
  type: 'time' | 'context' | 'parameter';
  operator: 'equals' | 'not_equals' | 'contains' | 'in' | 'between';
  field: string;
  value: any;
}

export interface PolicyQuota {
  id: string;
  resource: string; // Tool or provider name
  limits: {
    maxCallsPerHour?: number;
    maxCallsPerDay?: number;
    maxCallsPerMonth?: number;
    maxExecutionTime?: number;
    maxConcurrent?: number;
  };
  scope: 'agent' | 'starship' | 'global';
}

export interface PolicyCondition {
  id: string;
  type: 'environment' | 'feature_flag' | 'custom';
  name: string;
  evaluate: (context: PolicyContext) => boolean;
}

export interface PolicyContext {
  starshipId: string;
  agentId: string;
  userId?: string;
  toolName: string;
  toolProvider: string;
  toolCategory: string;
  parameters: any;
  environment: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
  matchedRule?: PolicyRule;
  quotaStatus?: QuotaStatus;
  suggestions?: string[];
}

export interface QuotaStatus {
  used: number;
  limit: number;
  resetAt: Date;
  exceeded: boolean;
}

export class MCPPolicyEnforcer {
  private policies: Map<string, MCPPolicy> = new Map();
  private quotaTrackers: Map<string, QuotaTracker> = new Map();
  private policyCache: Map<string, CachedDecision> = new Map();
  private readonly cacheTTL = 60000; // 1 minute

  constructor(
    private auditLogger: AuditLogger,
    private toolGateway?: MCPToolGateway
  ) {}

  /**
   * Load policies for a starship
   */
  async loadPolicies(starshipId: string): Promise<void> {
    // In production, load from database
    const defaultPolicy = this.createDefaultPolicy(starshipId);
    this.policies.set(starshipId, defaultPolicy);
  }

  /**
   * Check if a tool invocation is allowed
   */
  async checkAccess(context: PolicyContext): Promise<PolicyDecision> {
    // Check cache first
    const cacheKey = this.getCacheKey(context);
    const cached = this.policyCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.decision;
    }

    const policy = this.policies.get(context.starshipId);
    if (!policy || !policy.enabled) {
      return { allowed: true, reason: 'No policy configured' };
    }

    // Evaluate rules
    const ruleDecision = this.evaluateRules(policy.rules, context);
    if (!ruleDecision.allowed) {
      this.logAccessDenied(context, ruleDecision);
      return ruleDecision;
    }

    // Check quotas
    const quotaDecision = await this.checkQuotas(policy.quotas, context);
    if (!quotaDecision.allowed) {
      this.logAccessDenied(context, quotaDecision);
      return quotaDecision;
    }

    // Evaluate conditions
    const conditionDecision = this.evaluateConditions(policy.conditions, context);
    if (!conditionDecision.allowed) {
      this.logAccessDenied(context, conditionDecision);
      return conditionDecision;
    }

    // Cache the decision
    this.policyCache.set(cacheKey, {
      decision: { allowed: true },
      timestamp: Date.now()
    });

    return { allowed: true };
  }

  /**
   * Update quota usage after tool execution
   */
  async recordUsage(
    context: PolicyContext,
    executionTime: number,
    success: boolean
  ): Promise<void> {
    const policy = this.policies.get(context.starshipId);
    if (!policy) return;

    // Update quota trackers
    for (const quota of policy.quotas) {
      if (this.matchesResource(context.toolName, quota.resource)) {
        const tracker = this.getQuotaTracker(context, quota);
        tracker.recordUsage(executionTime);
      }
    }
  }

  /**
   * Get policy for a starship
   */
  getPolicy(starshipId: string): MCPPolicy | undefined {
    return this.policies.get(starshipId);
  }

  /**
   * Update policy
   */
  async updatePolicy(policy: MCPPolicy): Promise<void> {
    const existing = this.policies.get(policy.starshipId);
    
    // Version check
    if (existing && existing.version >= policy.version) {
      throw new Error('Policy version conflict');
    }

    policy.updatedAt = new Date();
    policy.version = (existing?.version || 0) + 1;
    
    this.policies.set(policy.starshipId, policy);
    
    // Clear cache for this starship
    this.clearCacheForStarship(policy.starshipId);

    // Log configuration change
    this.auditLogger.logConfigurationChange(
      {
        type: 'system',
        id: 'policy-enforcer',
        starshipId: policy.starshipId
      },
      'mcp_policy',
      {
        policyId: policy.id,
        version: policy.version,
        rules: policy.rules.length,
        quotas: policy.quotas.length
      },
      { }
    );
  }

  /**
   * Get quota status for a tool
   */
  async getQuotaStatus(
    starshipId: string,
    agentId: string,
    toolName: string
  ): Promise<QuotaStatus[]> {
    const policy = this.policies.get(starshipId);
    if (!policy) return [];

    const statuses: QuotaStatus[] = [];
    
    for (const quota of policy.quotas) {
      if (this.matchesResource(toolName, quota.resource)) {
        const context: PolicyContext = {
          starshipId,
          agentId,
          toolName,
          toolProvider: '',
          toolCategory: '',
          parameters: {},
          environment: process.env.NODE_ENV || 'development',
          timestamp: new Date()
        };
        
        const tracker = this.getQuotaTracker(context, quota);
        statuses.push(tracker.getStatus());
      }
    }

    return statuses;
  }

  /**
   * Export policy as JSON
   */
  exportPolicy(starshipId: string): any {
    const policy = this.policies.get(starshipId);
    if (!policy) return null;

    return {
      ...policy,
      _metadata: {
        exportedAt: new Date().toISOString(),
        exportedBy: 'MCPPolicyEnforcer'
      }
    };
  }

  /**
   * Import policy from JSON
   */
  async importPolicy(policyData: any): Promise<void> {
    const policy: MCPPolicy = {
      ...policyData,
      createdAt: new Date(policyData.createdAt),
      updatedAt: new Date()
    };

    await this.updatePolicy(policy);
  }

  private evaluateRules(rules: PolicyRule[], context: PolicyContext): PolicyDecision {
    // Sort rules by priority (descending)
    const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (this.matchesRule(rule, context)) {
        // Evaluate conditions if any
        if (rule.conditions && !this.evaluateRuleConditions(rule.conditions, context)) {
          continue;
        }

        if (rule.type === 'deny') {
          return {
            allowed: false,
            reason: `Access denied by rule: ${rule.id}`,
            matchedRule: rule
          };
        } else {
          return {
            allowed: true,
            matchedRule: rule
          };
        }
      }
    }

    // Default allow if no rules match
    return { allowed: true };
  }

  private matchesRule(rule: PolicyRule, context: PolicyContext): boolean {
    // Check resource match
    if (!this.matchesResource(context.toolName, rule.resource.pattern)) {
      return false;
    }

    // Check actor match
    if (rule.actors.type !== 'any') {
      if (rule.actors.type === 'agent' && context.agentId) {
        if (rule.actors.ids && !rule.actors.ids.includes(context.agentId)) {
          return false;
        }
      } else if (rule.actors.type === 'user' && context.userId) {
        if (rule.actors.ids && !rule.actors.ids.includes(context.userId)) {
          return false;
        }
      }
    }

    return true;
  }

  private matchesResource(toolName: string, pattern: string): boolean {
    // Convert pattern to regex
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );
    return regex.test(toolName);
  }

  private evaluateRuleConditions(conditions: RuleCondition[], context: PolicyContext): boolean {
    for (const condition of conditions) {
      if (!this.evaluateRuleCondition(condition, context)) {
        return false;
      }
    }
    return true;
  }

  private evaluateRuleCondition(condition: RuleCondition, context: PolicyContext): boolean {
    const value = this.getFieldValue(condition.field, context);

    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      
      case 'not_equals':
        return value !== condition.value;
      
      case 'contains':
        return String(value).includes(String(condition.value));
      
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(value);
      
      case 'between':
        return Array.isArray(condition.value) &&
               value >= condition.value[0] &&
               value <= condition.value[1];
      
      default:
        return false;
    }
  }

  private getFieldValue(field: string, context: PolicyContext): any {
    const parts = field.split('.');
    let value: any = context;

    for (const part of parts) {
      value = value?.[part];
      if (value === undefined) break;
    }

    return value;
  }

  private async checkQuotas(quotas: PolicyQuota[], context: PolicyContext): Promise<PolicyDecision> {
    for (const quota of quotas) {
      if (!this.matchesResource(context.toolName, quota.resource)) {
        continue;
      }

      const tracker = this.getQuotaTracker(context, quota);
      const status = tracker.getStatus();

      if (status.exceeded) {
        return {
          allowed: false,
          reason: `Quota exceeded: ${quota.resource}`,
          quotaStatus: status,
          suggestions: [
            `Wait until ${status.resetAt.toISOString()} for quota reset`,
            'Consider upgrading your plan for higher limits'
          ]
        };
      }
    }

    return { allowed: true };
  }

  private evaluateConditions(conditions: PolicyCondition[], context: PolicyContext): PolicyDecision {
    for (const condition of conditions) {
      if (!condition.evaluate(context)) {
        return {
          allowed: false,
          reason: `Condition not met: ${condition.name}`
        };
      }
    }
    return { allowed: true };
  }

  private getQuotaTracker(context: PolicyContext, quota: PolicyQuota): QuotaTracker {
    const key = this.getQuotaKey(context, quota);
    
    if (!this.quotaTrackers.has(key)) {
      this.quotaTrackers.set(key, new QuotaTracker(quota));
    }

    return this.quotaTrackers.get(key)!;
  }

  private getQuotaKey(context: PolicyContext, quota: PolicyQuota): string {
    const scopeId = quota.scope === 'agent' ? context.agentId :
                   quota.scope === 'starship' ? context.starshipId :
                   'global';
    
    return `${scopeId}:${quota.resource}`;
  }

  private getCacheKey(context: PolicyContext): string {
    return `${context.starshipId}:${context.agentId}:${context.toolName}`;
  }

  private clearCacheForStarship(starshipId: string): void {
    for (const [key] of this.policyCache) {
      if (key.startsWith(starshipId)) {
        this.policyCache.delete(key);
      }
    }
  }

  private logAccessDenied(context: PolicyContext, decision: PolicyDecision): void {
    this.auditLogger.logAccessDenied(
      {
        type: 'agent',
        id: context.agentId,
        starshipId: context.starshipId
      },
      {
        type: 'mcp_tool',
        id: context.toolName,
        name: context.toolName,
        provider: context.toolProvider,
        category: context.toolCategory
      },
      decision.reason || 'Policy check failed',
      {
        environment: context.environment
      }
    );
  }

  private createDefaultPolicy(starshipId: string): MCPPolicy {
    return {
      id: `policy_${starshipId}_default`,
      name: 'Default MCP Policy',
      description: 'Default security policy for MCP tool access',
      starshipId,
      enabled: true,
      rules: [
        {
          id: 'rule_allow_all',
          type: 'allow',
          resource: {
            type: 'tool',
            pattern: '*'
          },
          actors: {
            type: 'any'
          },
          priority: 0
        }
      ],
      quotas: [
        {
          id: 'quota_default',
          resource: '*',
          limits: {
            maxCallsPerHour: 1000,
            maxCallsPerDay: 10000,
            maxExecutionTime: 300000, // 5 minutes
            maxConcurrent: 10
          },
          scope: 'agent'
        }
      ],
      conditions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1
    };
  }
}

/**
 * Quota Tracker for rate limiting
 */
class QuotaTracker {
  private usage: Map<string, number> = new Map();
  private windowStart: Map<string, number> = new Map();
  private concurrentCalls = 0;

  constructor(private quota: PolicyQuota) {}

  recordUsage(executionTime: number): void {
    const now = Date.now();

    // Update hourly quota
    if (this.quota.limits.maxCallsPerHour) {
      this.updateUsage('hour', now, 3600000);
    }

    // Update daily quota
    if (this.quota.limits.maxCallsPerDay) {
      this.updateUsage('day', now, 86400000);
    }

    // Update monthly quota
    if (this.quota.limits.maxCallsPerMonth) {
      this.updateUsage('month', now, 2592000000);
    }
  }

  getStatus(): QuotaStatus {
    const now = Date.now();
    
    // Check hourly limit first (most restrictive)
    if (this.quota.limits.maxCallsPerHour) {
      const hourlyUsage = this.getUsage('hour', now, 3600000);
      if (hourlyUsage >= this.quota.limits.maxCallsPerHour) {
        return {
          used: hourlyUsage,
          limit: this.quota.limits.maxCallsPerHour,
          resetAt: new Date(this.getWindowStart('hour') + 3600000),
          exceeded: true
        };
      }
    }

    // Check daily limit
    if (this.quota.limits.maxCallsPerDay) {
      const dailyUsage = this.getUsage('day', now, 86400000);
      if (dailyUsage >= this.quota.limits.maxCallsPerDay) {
        return {
          used: dailyUsage,
          limit: this.quota.limits.maxCallsPerDay,
          resetAt: new Date(this.getWindowStart('day') + 86400000),
          exceeded: true
        };
      }
    }

    // Return current status
    const period = this.quota.limits.maxCallsPerHour ? 'hour' : 'day';
    const windowMs = period === 'hour' ? 3600000 : 86400000;
    const limit = period === 'hour' ? 
      this.quota.limits.maxCallsPerHour! : 
      this.quota.limits.maxCallsPerDay!;

    return {
      used: this.getUsage(period, now, windowMs),
      limit,
      resetAt: new Date(this.getWindowStart(period) + windowMs),
      exceeded: false
    };
  }

  private updateUsage(period: string, now: number, windowMs: number): void {
    const windowStart = this.getWindowStart(period);
    
    // Reset if window has passed
    if (now - windowStart > windowMs) {
      this.usage.set(period, 1);
      this.windowStart.set(period, now);
    } else {
      this.usage.set(period, (this.usage.get(period) || 0) + 1);
    }
  }

  private getUsage(period: string, now: number, windowMs: number): number {
    const windowStart = this.getWindowStart(period);
    
    // Reset if window has passed
    if (now - windowStart > windowMs) {
      this.usage.set(period, 0);
      this.windowStart.set(period, now);
      return 0;
    }

    return this.usage.get(period) || 0;
  }

  private getWindowStart(period: string): number {
    if (!this.windowStart.has(period)) {
      this.windowStart.set(period, Date.now());
    }
    return this.windowStart.get(period)!;
  }

  incrementConcurrent(): boolean {
    if (this.quota.limits.maxConcurrent && 
        this.concurrentCalls >= this.quota.limits.maxConcurrent) {
      return false;
    }
    this.concurrentCalls++;
    return true;
  }

  decrementConcurrent(): void {
    if (this.concurrentCalls > 0) {
      this.concurrentCalls--;
    }
  }
}

interface CachedDecision {
  decision: PolicyDecision;
  timestamp: number;
}