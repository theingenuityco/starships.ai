import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

// Import types from the correct location
interface MCPConfiguration {
  id?: string;
  userId: string;
  agentId?: string;
  name: string;
  containerImage: string;
  tools: MCPToolConfig[];
  resources?: MCPResourceConfig[];
  environment: Record<string, string>;
  limits: {
    memory: string;
    cpu: string;
    timeout: number;
  };
  agentPermissions?: Record<string, string[]>;
  agentToolCredentials?: Record<string, Record<string, any>>;
  createdAt?: string;
  updatedAt?: string;
}

interface MCPToolConfig {
  name: string;
  description: string;
  parameters: Record<string, any>;
  permissions: string[];
  category: 'system' | 'data' | 'communication' | 'analysis' | 'custom';
}

interface MCPResourceConfig {
  name: string;
  type: 'file' | 'database' | 'api' | 'service';
  uri: string;
  permissions: string[];
}

interface MCPToolCall {
  id: string;
  toolName: string;
  parameters: Record<string, any>;
  agentId: string;
  userId: string;
  timestamp: string;
  context?: {
    conversationId?: string;
    messageId?: string;
  };
}

/**
 * MCP-specific security middleware for request sanitization and validation
 */

// Rate limiting for MCP endpoints
export const mcpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each user to 100 requests per windowMs
  message: {
    error: 'Too many MCP requests from this user',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Rate limit per user ID instead of IP
    return req.user?.id || req.ip;
  }
});

// Tool execution rate limiting (more restrictive)
export const toolExecutionRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // Limit each user to 20 tool executions per 5 minutes
  message: {
    error: 'Too many tool executions from this user',
    retryAfter: '5 minutes'
  },
  keyGenerator: (req: Request) => {
    return req.user?.id || req.ip;
  }
});

// Security headers for MCP endpoints
export const mcpSecurityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

/**
 * Sanitize and validate MCP configuration requests
 */
export const sanitizeMCPConfiguration = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const config = req.body as MCPConfiguration;

    // Validate required fields
    if (!config.name || typeof config.name !== 'string') {
      res.status(400).json({ error: 'Configuration name is required and must be a string' });
      return;
    }

    if (!config.tools || !Array.isArray(config.tools)) {
      res.status(400).json({ error: 'Tools array is required' });
      return;
    }

    if (!config.limits || typeof config.limits !== 'object') {
      res.status(400).json({ error: 'Resource limits are required' });
      return;
    }

    // Sanitize configuration name
    config.name = sanitizeString(config.name, 100);

    // Validate and sanitize tools
    config.tools = config.tools.map((tool, index) => {
      if (!tool.name || typeof tool.name !== 'string') {
        throw new Error(`Tool at index ${index} must have a valid name`);
      }

      if (!tool.description || typeof tool.description !== 'string') {
        throw new Error(`Tool ${tool.name} must have a valid description`);
      }

      // Check for dangerous tool names
      const dangerousPatterns = [
        /rm\s+/i, /delete/i, /format/i, /sudo/i, /chmod/i, /chown/i,
        /exec/i, /eval/i, /system/i, /shell/i, /bash/i, /sh\s/i,
        /powershell/i, /cmd/i, /command/i, /script/i
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(tool.name) || pattern.test(tool.description)) {
          throw new Error(`Tool ${tool.name} contains potentially dangerous content`);
        }
      }

      return {
        ...tool,
        name: sanitizeString(tool.name, 50),
        description: sanitizeString(tool.description, 500),
        parameters: sanitizeObject(tool.parameters || {}),
        permissions: Array.isArray(tool.permissions) ? tool.permissions.map(p => sanitizeString(p, 50)) : [],
        category: sanitizeCategory(tool.category || 'custom')
      };
    });

    // Validate resource limits
    const limits = config.limits;
    
    // Memory limit validation
    const memoryLimit = parseMemoryLimit(limits.memory);
    if (memoryLimit > 2 * 1024 * 1024 * 1024) { // 2GB max
      res.status(400).json({ error: 'Memory limit cannot exceed 2GB' });
      return;
    }

    // CPU limit validation
    const cpuLimit = parseFloat(limits.cpu);
    if (isNaN(cpuLimit) || cpuLimit > 2.0) { // 2 CPU cores max
      res.status(400).json({ error: 'CPU limit must be a number and cannot exceed 2.0' });
      return;
    }

    // Timeout validation
    if (limits.timeout > 300000) { // 5 minutes max
      res.status(400).json({ error: 'Timeout cannot exceed 5 minutes (300000ms)' });
      return;
    }

    // Sanitize environment variables
    if (config.environment) {
      config.environment = sanitizeEnvironment(config.environment);
    }

    // Sanitize agent permissions
    if (config.agentPermissions) {
      config.agentPermissions = sanitizeAgentPermissions(config.agentPermissions);
    }

    // Update request body with sanitized config
    req.body = config;
    next();
  } catch (error) {
    console.error('MCP configuration sanitization error:', error);
    res.status(400).json({ 
      error: 'Invalid configuration',
      message: error instanceof Error ? error.message : 'Configuration validation failed'
    });
  }
};

/**
 * Sanitize and validate tool execution requests
 */
export const sanitizeToolExecution = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const toolCall = req.body as MCPToolCall;

    // Validate required fields
    if (!toolCall.id || typeof toolCall.id !== 'string') {
      res.status(400).json({ error: 'Tool call ID is required' });
      return;
    }

    if (!toolCall.toolName || typeof toolCall.toolName !== 'string') {
      res.status(400).json({ error: 'Tool name is required' });
      return;
    }

    if (!toolCall.agentId || typeof toolCall.agentId !== 'string') {
      res.status(400).json({ error: 'Agent ID is required' });
      return;
    }

    // Sanitize tool call
    const sanitizedToolCall = {
      ...toolCall,
      id: sanitizeString(toolCall.id, 100),
      toolName: sanitizeString(toolCall.toolName, 50),
      agentId: sanitizeString(toolCall.agentId, 100),
      parameters: sanitizeObject(toolCall.parameters || {}),
      timestamp: new Date().toISOString()
    };

    // Check for dangerous parameters
    const paramString = JSON.stringify(sanitizedToolCall.parameters).toLowerCase();
    const dangerousPatterns = [
      'rm ', 'delete', 'sudo', 'chmod', 'chown', 'format', 'exec', 'eval',
      'system', 'shell', 'bash', 'powershell', 'cmd', 'script', '../', '..',
      'passwd', 'shadow', '/etc/', '/root/', '/home/', 'kill', 'killall'
    ];

    for (const dangerous of dangerousPatterns) {
      if (paramString.includes(dangerous)) {
        res.status(400).json({ 
          error: 'Tool parameters contain potentially dangerous content',
          dangerous: dangerous
        });
        return;
      }
    }

    // Update request body with sanitized tool call
    req.body = sanitizedToolCall;
    next();
  } catch (error) {
    console.error('Tool execution sanitization error:', error);
    res.status(400).json({ 
      error: 'Invalid tool execution request',
      message: error instanceof Error ? error.message : 'Tool call validation failed'
    });
  }
};

/**
 * Audit logging middleware for MCP operations
 */
export const auditMCPOperation = (operation: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    const originalSend = res.send;

    // Capture response
    res.send = function(body: any) {
      const executionTime = Date.now() - startTime;
      const success = res.statusCode < 400;

      // Log audit entry
      const auditEntry = {
        timestamp: new Date().toISOString(),
        operation,
        userId: req.user?.id || 'unknown',
        userEmail: req.user?.email || 'unknown',
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        success,
        statusCode: res.statusCode,
        executionTime,
        requestSize: JSON.stringify(req.body).length,
        responseSize: typeof body === 'string' ? body.length : JSON.stringify(body).length
      };

      // In production, this should be sent to a proper logging service
      console.log('🔍 MCP Audit Log:', JSON.stringify(auditEntry, null, 2));

      // Call original send
      return originalSend.call(this, body);
    };

    next();
  };
};

// Helper functions
function sanitizeString(str: string, maxLength: number): string {
  if (typeof str !== 'string') return '';
  
  // Remove potentially dangerous characters
  const sanitized = str
    .replace(/[<>\"'&]/g, '') // Remove HTML/XML characters
    .replace(/[`${}]/g, '') // Remove template literal characters
    .replace(/[\r\n\t]/g, ' ') // Replace newlines/tabs with spaces
    .trim();

  return sanitized.length > maxLength ? sanitized.substring(0, maxLength) : sanitized;
}

function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) return {};
  if (typeof obj !== 'object') return {};

  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const sanitizedKey = sanitizeString(key, 50);
    
    if (typeof value === 'string') {
      sanitized[sanitizedKey] = sanitizeString(value, 1000);
    } else if (typeof value === 'number') {
      sanitized[sanitizedKey] = isFinite(value) ? value : 0;
    } else if (typeof value === 'boolean') {
      sanitized[sanitizedKey] = value;
    } else if (Array.isArray(value)) {
      sanitized[sanitizedKey] = value.slice(0, 100).map(item => 
        typeof item === 'string' ? sanitizeString(item, 200) : item
      );
    } else if (typeof value === 'object') {
      sanitized[sanitizedKey] = sanitizeObject(value);
    }
  }

  return sanitized;
}

function sanitizeEnvironment(env: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  const allowedKeys = /^[A-Z_][A-Z0-9_]*$/; // Standard environment variable naming

  for (const [key, value] of Object.entries(env)) {
    if (allowedKeys.test(key) && typeof value === 'string') {
      // Don't allow sensitive environment variables
      const sensitiveKeys = ['PASSWORD', 'SECRET', 'KEY', 'TOKEN', 'PRIVATE'];
      const isSensitive = sensitiveKeys.some(sensitive => key.includes(sensitive));
      
      if (!isSensitive) {
        sanitized[key] = sanitizeString(value, 500);
      }
    }
  }

  return sanitized;
}

function sanitizeAgentPermissions(permissions: Record<string, string[]>): Record<string, string[]> {
  const sanitized: Record<string, string[]> = {};

  for (const [agentId, toolNames] of Object.entries(permissions)) {
    const sanitizedAgentId = sanitizeString(agentId, 100);
    
    if (Array.isArray(toolNames)) {
      sanitized[sanitizedAgentId] = toolNames
        .slice(0, 50) // Max 50 tools per agent
        .map(toolName => sanitizeString(toolName, 50))
        .filter(toolName => toolName.length > 0);
    }
  }

  return sanitized;
}

function parseMemoryLimit(memoryStr: string): number {
  const match = memoryStr.match(/^(\d+)([kmg]?)$/i);
  if (!match) return 512 * 1024 * 1024; // Default 512MB

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'k': return value * 1024;
    case 'm': return value * 1024 * 1024;
    case 'g': return value * 1024 * 1024 * 1024;
    default: return value;
  }
}
function sanitizeCategory(category: string): 'system' | 'data' | 'communication' | 'analysis' | 'custom' {
  const validCategories: ('system' | 'data' | 'communication' | 'analysis' | 'custom')[] = [
    'system', 'data', 'communication', 'analysis', 'custom'
  ];
  
  const sanitized = sanitizeString(category, 20).toLowerCase();
  return validCategories.includes(sanitized as any) ? sanitized as any : 'custom';
}
