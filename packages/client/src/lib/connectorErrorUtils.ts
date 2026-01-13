/**
 * Detects if a message contains connector-related authentication errors
 */
export function isConnectorAuthError(message: string): boolean {
  const lower = message.toLowerCase()
  const errorPatterns = [
    'authentication',
    'access token',
    'token',
    'connector',
    'not configured',
    'expired',
    'invalid credentials',
    'api credentials',
    'authentication issue',
    'not properly configured',
  ]
  
  return errorPatterns.some(pattern => lower.includes(pattern))
}

/**
 * Replaces connector authentication errors with friendly messages
 */
export function replaceConnectorError(message: string): { text: string; hasConnectorError: boolean } {
  if (!isConnectorAuthError(message)) {
    return { text: message, hasConnectorError: false }
  }
  
  // Replace with friendly message
  const friendlyMessage = "I need your app to be connected. Please check your Connectors settings."
  
  return { text: friendlyMessage, hasConnectorError: true }
}
