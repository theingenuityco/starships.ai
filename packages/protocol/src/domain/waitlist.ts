/**
 * Waitlist Domain Types
 * 
 * Clean waitlist type definitions for protocol contract.
 */

// ============================================================================
// WAITLIST TYPES
// ============================================================================

/**
 * Waitlist entry status options
 */
export type WaitlistStatus = 'approved' | 'pending' | 'rejected';

/**
 * Core waitlist entry entity
 */
export interface WaitlistEntry {
  email: string;
  status: WaitlistStatus;
  createdAt: Date;
  addedBy: string;
  notes?: string;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to add an email to waitlist
 */
export interface AddWaitlistEntryRequest {
  email: string;
  status?: WaitlistStatus;
  addedBy?: string;
  notes?: string;
}

/**
 * Request to update waitlist entry
 */
export interface UpdateWaitlistEntryRequest {
  status?: WaitlistStatus;
  notes?: string;
}

/**
 * Waitlist entry response structure
 */
export interface WaitlistEntryResponse {
  entry: WaitlistEntry;
}

/**
 * Waitlist entries list response
 */
export interface WaitlistEntriesResponse {
  entries: WaitlistEntry[];
  total: number;
}

/**
 * Waitlist approval check response
 */
export interface WaitlistApprovalResponse {
  email: string;
  isApproved: boolean;
}

// ============================================================================
// FILTER AND QUERY TYPES
// ============================================================================

/**
 * Filters for querying waitlist entries
 */
export interface WaitlistFilters {
  status?: WaitlistStatus;
  addedBy?: string;
  email?: string;
}

/**
 * Sorting options for waitlist entries
 */
export interface WaitlistSort {
  field: 'createdAt' | 'email' | 'status';
  direction: 'asc' | 'desc';
}