/**
 * Standard logging utility for MCP servers
 * Provides consistent logging across all MCP server implementations
 */

const winston = require('winston');

// Create logger configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: process.env.MCP_SERVICE_NAME || 'mcp-server',
    starshipId: process.env.STARSHIP_ID || 'unknown',
    templateSlug: process.env.TEMPLATE_SLUG || 'unknown'
  },
  transports: [
    // Console transport for Docker logs
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Add file transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.File({
    filename: '/app/logs/error.log',
    level: 'error'
  }));
  
  logger.add(new winston.transports.File({
    filename: '/app/logs/combined.log'
  }));
}

// Helper functions for common MCP logging patterns
logger.mcpStart = (serverName, port) => {
  logger.info('MCP Server starting', {
    serverName,
    port,
    protocol: 'MCP',
    version: process.env.MCP_PROTOCOL_VERSION || '1.0'
  });
};

logger.mcpError = (error, context = {}) => {
  logger.error('MCP Server error', {
    error: error.message,
    stack: error.stack,
    ...context
  });
};

logger.mcpConnection = (event, details = {}) => {
  logger.info('MCP Connection event', {
    event,
    ...details
  });
};

module.exports = logger;