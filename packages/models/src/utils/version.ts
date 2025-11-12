/**
 * Version comparison utilities for semantic versioning (semver)
 * Supports: major.minor.patch[-prerelease][+build]
 * Examples: 1.0.0, 1.0.0-beta.1, 1.0.0-alpha.2+exp.sha.5114f85
 */

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
  build: string;
}

/**
 * Parse a semantic version string into its components
 * @param version Version string (e.g., '1.0.0-beta.1+build.123')
 * @returns Parsed version object or null if invalid
 */
function parseVersion(version: string): ParsedVersion | null {
  // Match semantic versioning format: major.minor.patch[-prerelease][+build]
  const regex = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;
  const match = version.match(regex);

  if (!match) return null;

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] ? match[4].split('.') : [],
    build: match[5] || '',
  };
}

/**
 * Compare two semantic versions
 * @param v1 First version (e.g., '1.0.2', '1.0.0-beta.1')
 * @param v2 Second version (e.g., '1.0.0', '1.0.0-alpha.1')
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 * @throws Error if either version is invalid
 */
export function compareVersions(v1: string, v2: string): number {
  const parsed1 = parseVersion(v1);
  const parsed2 = parseVersion(v2);

  if (!parsed1) {
    throw new Error(`Invalid version format: ${v1}`);
  }
  if (!parsed2) {
    throw new Error(`Invalid version format: ${v2}`);
  }

  // Compare major, minor, patch
  if (parsed1.major !== parsed2.major) {
    return parsed1.major > parsed2.major ? 1 : -1;
  }
  if (parsed1.minor !== parsed2.minor) {
    return parsed1.minor > parsed2.minor ? 1 : -1;
  }
  if (parsed1.patch !== parsed2.patch) {
    return parsed1.patch > parsed2.patch ? 1 : -1;
  }

  // When major.minor.patch are equal, handle pre-release versions
  // Per semver spec: 1.0.0-alpha < 1.0.0-beta < 1.0.0
  const hasPrerelease1 = parsed1.prerelease.length > 0;
  const hasPrerelease2 = parsed2.prerelease.length > 0;

  // If one has pre-release and other doesn't, the one without pre-release is greater
  if (hasPrerelease1 && !hasPrerelease2) return -1;
  if (!hasPrerelease1 && hasPrerelease2) return 1;

  // Both have pre-release, compare them
  if (hasPrerelease1 && hasPrerelease2) {
    const maxLength = Math.max(parsed1.prerelease.length, parsed2.prerelease.length);
    for (let i = 0; i < maxLength; i++) {
      const part1 = parsed1.prerelease[i];
      const part2 = parsed2.prerelease[i];

      // If one is missing, the shorter one is less
      if (part1 === undefined) return -1;
      if (part2 === undefined) return 1;

      // Compare as numbers if both are numeric
      const num1 = parseInt(part1, 10);
      const num2 = parseInt(part2, 10);
      const isNum1 = !isNaN(num1) && num1.toString() === part1;
      const isNum2 = !isNaN(num2) && num2.toString() === part2;

      if (isNum1 && isNum2) {
        if (num1 !== num2) return num1 > num2 ? 1 : -1;
      } else if (isNum1 && !isNum2) {
        // Numeric identifiers always have lower precedence than non-numeric
        return -1;
      } else if (!isNum1 && isNum2) {
        return 1;
      } else {
        // Compare lexically
        if (part1 !== part2) return part1 > part2 ? 1 : -1;
      }
    }
  }

  // Build metadata is ignored in precedence comparison per semver spec
  return 0;
}

/**
 * Validate version format (e.g., '1.0.0', '1.0.0-beta.1', '1.0.0+build.123')
 * Supports full semantic versioning: major.minor.patch[-prerelease][+build]
 * @param version Version string to validate
 * @returns true if valid, false otherwise
 */
export function isValidVersion(version: string): boolean {
  // Semantic versioning regex: major.minor.patch[-prerelease][+build]
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version);
}
