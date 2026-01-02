/**
 * HTTP Basic authentication helpers (RFC 7617).
 *
 * Authorization: Basic base64("username:password")
 */

export function encodeBasicAuthCredentials(username: string, password = ''): string {
  // RFC 7617 uses base64 of the UTF-8 encoding of "user:pass".
  // Node's Buffer base64 encoding produces padded base64 without line breaks.
  return Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
}

export function buildBasicAuthHeaderValue(username: string, password = ''): string {
  return `Basic ${encodeBasicAuthCredentials(username, password)}`;
}


