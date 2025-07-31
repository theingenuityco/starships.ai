#!/usr/bin/env python3

"""
Health check utility for MCP servers
Provides standard health endpoint for Docker health checks
"""

import json
import time
import os
import sys
import psutil
import httpx
from datetime import datetime


def get_health_status():
    """Get comprehensive health status for MCP server"""
    try:
        # Basic system health
        memory_info = psutil.virtual_memory()
        disk_info = psutil.disk_usage('/')
        
        health_status = {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "uptime": time.time() - psutil.boot_time(),
            "memory": {
                "total": memory_info.total,
                "available": memory_info.available,
                "percent": memory_info.percent
            },
            "disk": {
                "total": disk_info.total,
                "free": disk_info.free,
                "percent": (disk_info.used / disk_info.total) * 100
            },
            "pid": os.getpid(),
            "version": os.getenv("MCP_PROTOCOL_VERSION", "1.0"),
            "environment": os.getenv("PYTHON_ENV", "development"),
            "starship_id": os.getenv("STARSHIP_ID", "unknown"),
            "template_slug": os.getenv("TEMPLATE_SLUG", "unknown")
        }
        
        return health_status, 200
        
    except Exception as e:
        error_status = {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }
        return error_status, 500


def check_mcp_server_health():
    """Check if MCP server is responding on its designated port"""
    try:
        port = os.getenv("MCP_SERVER_PORT", "3000")
        health_url = f"http://localhost:{port}/health"
        
        with httpx.Client(timeout=5.0) as client:
            response = client.get(health_url)
            return response.status_code == 200
    except:
        return False


def main():
    """Main health check function for Docker HEALTHCHECK"""
    try:
        health_status, status_code = get_health_status()
        
        # Additional MCP-specific health checks
        if check_mcp_server_health():
            health_status["mcp_server"] = "responding"
        else:
            health_status["mcp_server"] = "not_responding"
            health_status["status"] = "degraded"
        
        print(json.dumps(health_status, indent=2))
        sys.exit(0 if status_code == 200 else 1)
        
    except Exception as e:
        error_response = {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }
        print(json.dumps(error_response, indent=2))
        sys.exit(1)


if __name__ == "__main__":
    main()