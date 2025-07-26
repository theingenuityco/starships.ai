"""
Standard logging utility for MCP servers
Provides consistent logging across all MCP server implementations
"""

import os
import sys
import structlog
from datetime import datetime
from typing import Dict, Any, Optional


def configure_logging():
    """Configure structured logging for MCP servers"""
    
    # Configure structlog
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer()
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )


# Configure logging on import
configure_logging()


class MCPLogger:
    """Enhanced logger for MCP server operations"""
    
    def __init__(self, service_name: Optional[str] = None):
        self.logger = structlog.get_logger()
        self.service_name = service_name or os.getenv("MCP_SERVICE_NAME", "mcp-server")
        self.starship_id = os.getenv("STARSHIP_ID", "unknown")
        self.template_slug = os.getenv("TEMPLATE_SLUG", "unknown")
        
        # Bind common context
        self.logger = self.logger.bind(
            service=self.service_name,
            starship_id=self.starship_id,
            template_slug=self.template_slug,
            protocol="MCP",
            version=os.getenv("MCP_PROTOCOL_VERSION", "1.0")
        )
    
    def info(self, message: str, **kwargs):
        """Log info message"""
        self.logger.info(message, **kwargs)
    
    def error(self, message: str, **kwargs):
        """Log error message"""
        self.logger.error(message, **kwargs)
    
    def warning(self, message: str, **kwargs):
        """Log warning message"""
        self.logger.warning(message, **kwargs)
    
    def debug(self, message: str, **kwargs):
        """Log debug message"""
        self.logger.debug(message, **kwargs)
    
    def mcp_start(self, server_name: str, port: int, **kwargs):
        """Log MCP server startup"""
        self.logger.info(
            "MCP Server starting",
            server_name=server_name,
            port=port,
            **kwargs
        )
    
    def mcp_error(self, error: Exception, context: Dict[str, Any] = None):
        """Log MCP server error"""
        error_context = {
            "error_type": type(error).__name__,
            "error_message": str(error),
        }
        if context:
            error_context.update(context)
        
        self.logger.error("MCP Server error", **error_context)
    
    def mcp_connection(self, event: str, details: Dict[str, Any] = None):
        """Log MCP connection event"""
        connection_context = {"event": event}
        if details:
            connection_context.update(details)
        
        self.logger.info("MCP Connection event", **connection_context)
    
    def mcp_request(self, method: str, params: Dict[str, Any] = None, duration: float = None):
        """Log MCP protocol request"""
        request_context = {"method": method}
        if params:
            request_context["params"] = params
        if duration:
            request_context["duration_ms"] = duration * 1000
        
        self.logger.info("MCP Request", **request_context)


# Create default logger instance
logger = MCPLogger()


def get_logger(service_name: Optional[str] = None) -> MCPLogger:
    """Get configured MCP logger instance"""
    return MCPLogger(service_name)