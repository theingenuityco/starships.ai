/**
 * Version comparison utilities for semantic versioning
 */

/**
 * Compare two semantic versions
 * @param v1 First version (e.g., '1.0.2')
 * @param v2 Second version (e.g., '1.0.0')
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  const maxLength = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < maxLength; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;

    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  return 0;
}

/**
 * Validate version format (e.g., '1.0.0', '2.1.3')
 * @param version Version string to validate
 * @returns true if valid, false otherwise
 */
export function isValidVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}
