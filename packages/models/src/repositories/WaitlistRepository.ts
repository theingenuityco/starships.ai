import { Neo4jConnection } from '@/helpers/database';
import { BaseRepository } from '@/repositories/BaseRepository';
import { DatabaseError, ValidationError } from '@starships/errors';
import { WaitlistEntryModel } from '@starships/protocol';

export class WaitlistRepository extends BaseRepository {
  constructor(connection: Neo4jConnection) {
    super('WaitlistRepository', connection);
  }

  /**
   * Check if an email is in the approved waitlist
   */
  async checkApproval(email: string): Promise<boolean> {
    const normalizedEmail = this.normalizeEmail(email);

    if (!this.isValidEmail(normalizedEmail)) {
      throw new ValidationError('Invalid email format', 'email', { field: 'email', value: email });
    }

    try {
      const query = `
        MATCH (w:Waitlist {email: $email, status: 'approved'})
        RETURN w IS NOT NULL as isApproved
      `;

      const result = await this.getConnection().executeQuery<{ isApproved: boolean }>(query, {
        email: normalizedEmail,
      });

      return result.length > 0 ? result[0].isApproved : false;
    } catch (error) {
      this.handleDatabaseError(error, 'checkApproval', 'Waitlist', normalizedEmail);
    }
  }

  /**
   * Get waitlist entry by email
   */
  async getByEmail(email: string): Promise<WaitlistEntryModel | null> {
    const normalizedEmail = this.normalizeEmail(email);

    try {
      const query = `
        MATCH (w:Waitlist {email: $email})
        RETURN w {.email, .status, .createdAt, .notes} as entry
      `;

      const result = await this.getConnection().executeQuery<{ entry: WaitlistEntryModel }>(query, {
        email: normalizedEmail,
      });

      return result.length > 0 ? result[0].entry : null;
    } catch (error) {
      this.handleDatabaseError(error, 'getByEmail', 'Waitlist', normalizedEmail);
    }
  }

  /**
   * Add a new approved email to the waitlist
   */
  async addApprovedEmail(email: string, notes?: string): Promise<WaitlistEntryModel> {
    const normalizedEmail = this.normalizeEmail(email);

    if (!this.isValidEmail(normalizedEmail)) {
      throw new ValidationError('Invalid email format', 'email', { field: 'email', value: email });
    }

    try {
      const query = `
        CREATE (w:Waitlist {
          email: $email,
          status: 'approved',
          createdAt: datetime(),
          notes: $notes
        })
        RETURN w {.email, .status, .createdAt, .notes} as entry
      `;

      const result = await this.getConnection().executeWrite<{ entry: WaitlistEntryModel }>(query, {
        email: normalizedEmail,
        notes: notes || null,
      });

      if (result.length === 0) {
        throw new DatabaseError('addApprovedEmail');
      }

      return result[0].entry;
    } catch (error) {
      this.handleDatabaseError(error, 'addApprovedEmail', 'Waitlist', normalizedEmail);
    }
  }

  /**
   * Add a new pending email to the waitlist
   */
  async addPendingEmail(email: string, notes?: string): Promise<WaitlistEntryModel> {
    const normalizedEmail = this.normalizeEmail(email);

    if (!this.isValidEmail(normalizedEmail)) {
      throw new ValidationError('Invalid email format', 'email', { field: 'email', value: email });
    }

    try {
      const query = `
        CREATE (w:Waitlist {
          email: $email,
          status: 'pending',
          createdAt: datetime(),
          notes: $notes
        })
        RETURN w {.email, .status, .createdAt, .notes} as entry
      `;

      const result = await this.getConnection().executeWrite<{ entry: WaitlistEntryModel }>(query, {
        email: normalizedEmail,
        notes: notes || null,
      });

      if (result.length === 0) {
        throw new DatabaseError('addPendingEmail');
      }

      return result[0].entry;
    } catch (error) {
      // Check if it's a unique constraint violation
      if (error && typeof error === 'object' && 'code' in error && error.code === 'Neo.ClientError.Schema.ConstraintValidationFailed') {
        // Email already exists, return existing entry
        const existing = await this.getByEmail(normalizedEmail);
        if (existing) {
          return existing;
        }
      }
      this.handleDatabaseError(error, 'addPendingEmail', 'Waitlist', normalizedEmail);
    }
  }

  /**
   * Get status by email
   */
  async getStatusByEmail(email: string): Promise<'approved' | 'pending' | null> {
    const normalizedEmail = this.normalizeEmail(email);

    if (!this.isValidEmail(normalizedEmail)) {
      throw new ValidationError('Invalid email format', 'email', { field: 'email', value: email });
    }

    try {
      const query = `
        MATCH (w:Waitlist {email: $email})
        RETURN w.status as status
      `;

      const result = await this.getConnection().executeQuery<{ status: 'approved' | 'pending' }>(query, {
        email: normalizedEmail,
      });

      return result.length > 0 ? result[0].status : null;
    } catch (error) {
      this.handleDatabaseError(error, 'getStatusByEmail', 'Waitlist', normalizedEmail);
    }
  }

  /**
   * Update waitlist status
   */
  async updateStatus(email: string, status: 'approved' | 'pending'): Promise<boolean> {
    const normalizedEmail = this.normalizeEmail(email);

    if (!this.isValidEmail(normalizedEmail)) {
      throw new ValidationError('Invalid email format', 'email', { field: 'email', value: email });
    }

    try {
      const query = `
        MATCH (w:Waitlist {email: $email})
        SET w.status = $status
        RETURN w IS NOT NULL as updated
      `;

      const result = await this.getConnection().executeWrite<{ updated: boolean }>(query, {
        email: normalizedEmail,
        status,
      });

      return result.length > 0 && result[0].updated;
    } catch (error) {
      this.handleDatabaseError(error, 'updateStatus', 'Waitlist', normalizedEmail);
    }
  }

  /**
   * Get all approved emails
   */
  async getAllApproved(): Promise<WaitlistEntryModel[]> {
    try {
      const query = `
        MATCH (w:Waitlist {status: 'approved'})
        RETURN w {.email, .status, .createdAt, .notes} as entry
        ORDER BY w.createdAt DESC
      `;

      const result = await this.getConnection().executeQuery<{ entry: WaitlistEntryModel }>(query);
      return result.map((r) => r.entry);
    } catch (error) {
      this.handleDatabaseError(error, 'getAllApproved', 'Waitlist');
    }
  }

  /**
   * Get count of approved emails
   */
  async getApprovedCount(): Promise<number> {
    try {
      const query = `
        MATCH (w:Waitlist {status: 'approved'})
        RETURN count(w) as count
      `;

      const result = await this.getConnection().executeQuery<{ count: number }>(query);
      return result.length > 0 ? result[0].count : 0;
    } catch (error) {
      this.handleDatabaseError(error, 'getApprovedCount', 'Waitlist');
    }
  }

  /**
   * Initialize waitlist schema (indexes and constraints)
   */
  async initializeSchema(): Promise<void> {
    try {
      // Create unique constraint on email
      await this.getConnection().executeWrite(
        `CREATE CONSTRAINT waitlist_email_unique IF NOT EXISTS
         FOR (w:Waitlist) REQUIRE w.email IS UNIQUE`
      );

      // Create index on status for faster queries
      await this.getConnection().executeWrite(
        `CREATE INDEX waitlist_status IF NOT EXISTS
         FOR (w:Waitlist) ON (w.status)`
      );

      // Create composite index on email and status for efficient queries
      await this.getConnection().executeWrite(
        `CREATE INDEX waitlist_email_status IF NOT EXISTS
         FOR (w:Waitlist) ON (w.email, w.status)`
      );
    } catch (error) {
      console.warn('Waitlist schema initialization warning:', error);
      // Don't throw - indexes might already exist
    }
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
