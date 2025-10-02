import { BaseRepository } from '@/repositories/BaseRepository';
import { ValidationError } from '@starships/errors';
import { WaitlistEntryModel } from '@starships/protocol';

export class WaitlistRepository extends BaseRepository {
  constructor() {
    super('WaitlistRepository');
  }

  /**
   * Check if an email is in the approved waitlist
   */
  async checkApproval(email: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const normalizedEmail = this.normalizeEmail(email);

        if (!this.isValidEmail(normalizedEmail)) {
          throw new ValidationError('Invalid email format', 'email', { field: 'email', value: email });
        }

        const connection = this.getConnection();
        const result = await connection.queryOne<{ exists: boolean }>(
          'SELECT EXISTS(SELECT 1 FROM waitlist WHERE email = $1 AND status = $2) as exists',
          [normalizedEmail, 'approved']
        );

        return result?.exists || false;
      },
      'checkApproval',
      'Waitlist',
      email
    );
  }

  /**
   * Get waitlist entry by email
   */
  async getByEmail(email: string): Promise<WaitlistEntryModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const normalizedEmail = this.normalizeEmail(email);

        if (!this.isValidEmail(normalizedEmail)) {
          throw new ValidationError('Invalid email format', 'email', { field: 'email', value: email });
        }

        const connection = this.getConnection();
        const result = await connection.queryOne<{
          email: string;
          status: string;
          created_at: string;
          notes: string | null;
        }>('SELECT email, status, created_at, notes FROM waitlist WHERE email = $1', [normalizedEmail]);

        if (!result) {
          return null;
        }

        return {
          email: result.email,
          status: result.status as 'approved' | 'pending',
          createdAt: new Date(result.created_at),
          notes: result.notes || undefined,
        };
      },
      'getByEmail',
      'Waitlist',
      email
    );
  }

  /**
   * Add a new approved email to the waitlist
   */
  async addApprovedEmail(email: string, notes?: string): Promise<WaitlistEntryModel> {
    return this.executeWithErrorHandling(
      async () => {
        const normalizedEmail = this.normalizeEmail(email);

        if (!this.isValidEmail(normalizedEmail)) {
          throw new ValidationError('Invalid email format', 'email', { field: 'email', value: email });
        }

        const connection = this.getConnection();
        const result = await connection.queryOne<{
          email: string;
          status: string;
          created_at: string;
          notes: string | null;
        }>(
          `INSERT INTO waitlist (email, status, notes, created_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (email) DO UPDATE SET
             status = EXCLUDED.status,
             notes = EXCLUDED.notes
           RETURNING email, status, created_at, notes`,
          [normalizedEmail, 'approved', notes || null, new Date().toISOString()]
        );

        if (!result) {
          throw new Error('Failed to add approved email to waitlist');
        }

        return {
          email: result.email,
          status: result.status as 'approved' | 'pending',
          createdAt: new Date(result.created_at),
          notes: result.notes || undefined,
        };
      },
      'addApprovedEmail',
      'Waitlist',
      email
    );
  }

  /**
   * Add a new pending email to the waitlist
   */
  async addPendingEmail(email: string, notes?: string): Promise<WaitlistEntryModel> {
    return this.executeWithErrorHandling(
      async () => {
        const normalizedEmail = this.normalizeEmail(email);

        if (!this.isValidEmail(normalizedEmail)) {
          throw new ValidationError('Invalid email format', 'email', { field: 'email', value: email });
        }

        const connection = this.getConnection();

        try {
          const result = await connection.queryOne<{
            email: string;
            status: string;
            created_at: string;
            notes: string | null;
          }>(
            `INSERT INTO waitlist (email, status, notes, created_at)
             VALUES ($1, $2, $3, $4)
             RETURNING email, status, created_at, notes`,
            [normalizedEmail, 'pending', notes || null, new Date().toISOString()]
          );

          if (!result) {
            throw new Error('Failed to add pending email to waitlist');
          }

          return {
            email: result.email,
            status: result.status as 'approved' | 'pending',
            createdAt: new Date(result.created_at),
            notes: result.notes || undefined,
          };
        } catch (error: unknown) {
          // Check if it's a unique constraint violation (PostgreSQL error code 23505)
          if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === '23505') {
            // Email already exists, return existing entry
            const existing = await this.getByEmail(normalizedEmail);
            if (existing) {
              return existing;
            }
          }
          throw error;
        }
      },
      'addPendingEmail',
      'Waitlist',
      email
    );
  }

  /**
   * Get status by email
   */
  async getStatusByEmail(email: string): Promise<'approved' | 'pending' | null> {
    return this.executeWithErrorHandling(
      async () => {
        const normalizedEmail = this.normalizeEmail(email);

        if (!this.isValidEmail(normalizedEmail)) {
          throw new ValidationError('Invalid email format', 'email', { field: 'email', value: email });
        }

        const connection = this.getConnection();
        const result = await connection.queryOne<{ status: string }>('SELECT status FROM waitlist WHERE email = $1', [normalizedEmail]);

        return result ? (result.status as 'approved' | 'pending') : null;
      },
      'getStatusByEmail',
      'Waitlist',
      email
    );
  }

  /**
   * Update waitlist status
   */
  async updateStatus(email: string, status: 'approved' | 'pending'): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const normalizedEmail = this.normalizeEmail(email);

        if (!this.isValidEmail(normalizedEmail)) {
          throw new ValidationError('Invalid email format', 'email', { field: 'email', value: email });
        }

        const connection = this.getConnection();
        const result = await connection.query<{ email: string }>('UPDATE waitlist SET status = $2 WHERE email = $1 RETURNING email', [
          normalizedEmail,
          status,
        ]);

        return result.length > 0;
      },
      'updateStatus',
      'Waitlist',
      email
    );
  }

  /**
   * Get all approved emails
   */
  async getAllApproved(): Promise<WaitlistEntryModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<{
          email: string;
          status: string;
          created_at: string;
          notes: string | null;
        }>('SELECT email, status, created_at, notes FROM waitlist WHERE status = $1 ORDER BY created_at DESC', ['approved']);

        return result.map((r) => ({
          email: r.email,
          status: r.status as 'approved' | 'pending',
          createdAt: new Date(r.created_at),
          notes: r.notes || undefined,
        }));
      },
      'getAllApproved',
      'Waitlist'
    );
  }

  /**
   * Get count of approved emails
   */
  async getApprovedCount(): Promise<number> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        return await connection.queryCount('SELECT COUNT(*) FROM waitlist WHERE status = $1', ['approved']);
      },
      'getApprovedCount',
      'Waitlist'
    );
  }

  /**
   * Initialize waitlist schema (indexes and constraints)
   * Note: PostgreSQL schema is already defined in migration files
   */
  async initializeSchema(): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        // PostgreSQL schema is already defined in migration files
        // This method is kept for backward compatibility but doesn't need to do anything
        console.log('PostgreSQL waitlist schema already defined in migration files');
      },
      'initializeSchema',
      'Waitlist'
    );
  }

  /**
   * Seed initial approved emails
   */
  async seedInitialEmails(): Promise<void> {
    const initialEmails = [
      {
        email: 'dewang@theingenuity.co',
        notes: 'Founder - Primary tester',
      },
      {
        email: 'rudra@theingenuity.co',
        notes: 'Team member - Alpha tester',
      },
      {
        email: 'prashant@theingenuity.co',
        notes: 'Team member - Alpha tester',
      },
    ];

    for (const { email, notes } of initialEmails) {
      try {
        const existing = await this.getByEmail(email);
        if (!existing) {
          await this.addApprovedEmail(email, notes);
        }
      } catch (error) {
        console.error(`Failed to add email ${email}:`, error);
      }
    }
  }

  /**
   * Normalize email address
   */
  private normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
