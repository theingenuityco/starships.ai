/**
 * Simple auth/permission helpers shared across the server.
 */

/**
 * Returns true if the given user object represents an instance-level admin.
 *
 * The user shape is intentionally loose so it can accept:
 * - Full UserModel
 * - AuthUser
 * - The `req.user` object attached by jwt middleware
 */
export function isInstanceAdmin(user: { isInstanceAdmin?: boolean } | null | undefined): boolean {
  return !!user?.isInstanceAdmin;
}



