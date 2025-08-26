// Repository types are now inferred from the actual repository class implementations
// This eliminates explicit repository interfaces while preserving API contracts

export interface WaitlistEntry {
  email: string;
  status: 'approved' | 'pending' | 'rejected';
  createdAt: Date;
  addedBy: string;
  notes?: string;
}

// WaitlistRepository interface removed - use the class type directly