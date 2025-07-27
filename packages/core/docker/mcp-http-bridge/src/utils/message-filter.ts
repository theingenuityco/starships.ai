/**
 * Filters out non-JSON startup messages from MCP servers
 */
export function isValidJsonRpcMessage(line: string): boolean {
  const trimmed = line.trim();
  
  // Skip empty lines
  if (!trimmed) return false;
  
  // Skip common startup messages
  const skipPatterns = [
    /MCP Server running on stdio/i,
    /Sequential Thinking MCP Server/i,
    /^Starting/i,
    /^Initializing/i,
    /^Ready/i,
    /^Server started/i,
    /npm notice/i,
    /npm WARN/i,
    /added \d+ packages/i
  ];
  
  for (const pattern of skipPatterns) {
    if (pattern.test(trimmed)) {
      console.log(`[MessageFilter] Skipping non-JSON message: ${trimmed}`);
      return false;
    }
  }
  
  // Check if it looks like JSON
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    console.log(`[MessageFilter] Skipping non-JSON message: ${trimmed}`);
    return false;
  }
  
  return true;
}

/**
 * Parse JSON-RPC message safely
 */
export function parseJsonRpcMessage(line: string): any | null {
  try {
    const parsed = JSON.parse(line);
    
    // Validate it's a proper JSON-RPC message
    if (parsed.jsonrpc === '2.0' || parsed.method || parsed.id !== undefined) {
      return parsed;
    }
    
    console.log('[MessageFilter] Invalid JSON-RPC structure:', line);
    return null;
  } catch (error) {
    console.log('[MessageFilter] Failed to parse JSON:', line);
    return null;
  }
}