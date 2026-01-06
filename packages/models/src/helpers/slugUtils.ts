/**
 * Slug generation utilities
 * Provides functions to generate URL-safe slugs from text
 */

/**
 * Generate a slug from a given text string
 * @param text The text to convert to a slug
 * @returns A URL-safe slug string
 */
export function generateSlug(text: string): string {
  // Strict slug generation:
  // - lower-case
  // - strip special chars (keep only a-z0-9)
  // - collapse separators to single hyphen
  // - trim leading/trailing hyphens
  //
  // This intentionally does NOT allow underscores or other word chars.
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-') // Replace any non-alphanumeric runs with hyphens
    .replace(/^-+|-+$/g, '') // Trim hyphens
    .replace(/-+/g, '-'); // Collapse multiple hyphens
}

/**
 * Validate if a string is a valid slug format
 * @param slug The slug to validate
 * @returns True if valid, false otherwise
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/**
 * Generate a unique slug by appending a suffix if needed
 * @param baseSlug The base slug to make unique
 * @param existingSlugs Array of existing slugs to check against
 * @returns A unique slug
 */
export function generateUniqueSlug(baseSlug: string, existingSlugs: string[]): string {
  let slug = baseSlug;
  let counter = 1;

  while (existingSlugs.includes(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}
