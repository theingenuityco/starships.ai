import { Neo4jConnection } from '../helpers/database';
import { BaseRepository } from './BaseRepository';
import { ValidationError, DatabaseError } from '../helpers/errors';
import { WaitlistEntryModel } from '@starships/protocol';

export class WaitlistRepository extends BaseRepository {
  private connection: Neo4jConnection;

  constructor(connection: Neo4jConnection) {
    super('WaitlistRepository');
    this.connection = connection;
  }

  /**
   * Check if an email is in the approved waitlist
   */
  async checkApproval(email: string): Promise<boolean> {
    const normalizedEmail = this.normalizeEmail(email);
    
    if (!this.isValidEmail(normalizedEmail)) {
      throw new ValidationError(
        'Invalid email format',
        'email_format',
        { field: 'email', value: email },
        'checkApproval',
        'WaitlistRepository/checkApproval'
      );
    }

    try {
      const query = `
        MATCH (w:Waitlist {email: $email, status: 'approved'})
        RETURN w IS NOT NULL as isApproved
      `;

      const result = await this.connection.executeQuery<{ isApproved: boolean }>(
        query,
        { email: normalizedEmail }
      );

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
        RETURN w {.email, .status, .createdAt, .addedBy, .notes} as entry
      `;

      const result = await this.connection.executeQuery<{ entry: WaitlistEntryModel }>(
        query,
        { email: normalizedEmail }
      );

      return result.length > 0 ? result[0].entry : null;
    } catch (error) {
      this.handleDatabaseError(error, 'getByEmail', 'Waitlist', normalizedEmail);
    }
  }

  /**
   * Add a new approved email to the waitlist
   */
  async addApprovedEmail(
    email: string,
    addedBy: string = 'system',
    notes?: string
  ): Promise<WaitlistEntryModel> {
    const normalizedEmail = this.normalizeEmail(email);
    
    if (!this.isValidEmail(normalizedEmail)) {
      throw new ValidationError(
        'Invalid email format',
        'email_format',
        { field: 'email', value: email },
        'addApprovedEmail',
        'WaitlistRepository/addApprovedEmail'
      );
    }

    try {
      const query = `
        CREATE (w:Waitlist {
          email: $email,
          status: 'approved',
          createdAt: datetime(),
          addedBy: $addedBy,
          notes: $notes
        })
        RETURN w {.email, .status, .createdAt, .addedBy, .notes} as entry
      `;

      const result = await this.connection.executeWrite<{ entry: WaitlistEntryModel }>(
        query,
        { 
          email: normalizedEmail,
          addedBy,
          notes: notes || null
        }
      );

      if (result.length === 0) {
        throw new DatabaseError(
          'Failed to create waitlist entry',
          'creation_failed',
          undefined,
          { email: normalizedEmail },
          'addApprovedEmail',
          'WaitlistRepository/addApprovedEmail'
        );
      }

      return result[0].entry;
    } catch (error) {
      this.handleDatabaseError(error, 'addApprovedEmail', 'Waitlist', normalizedEmail);
    }
  }

  /**
   * Get all approved emails
   */
  async getAllApproved(): Promise<WaitlistEntryModel[]> {
    try {
      const query = `
        MATCH (w:Waitlist {status: 'approved'})
        RETURN w {.email, .status, .createdAt, .addedBy, .notes} as entry
        ORDER BY w.createdAt DESC
      `;

      const result = await this.connection.executeQuery<{ entry: WaitlistEntryModel }>(query);
      return result.map(r => r.entry);
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

      const result = await this.connection.executeQuery<{ count: number }>(query);
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
      await this.connection.executeWrite(
        `CREATE CONSTRAINT waitlist_email_unique IF NOT EXISTS
         FOR (w:Waitlist) REQUIRE w.email IS UNIQUE`
      );

      // Create index on status for faster queries
      await this.connection.executeWrite(
        `CREATE INDEX waitlist_status IF NOT EXISTS
         FOR (w:Waitlist) ON (w.status)`
      );

      console.log('Waitlist schema initialized successfully');
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
        notes: 'Founder - Primary tester'
      },
      {
        email: 'rudra@theingenuity.co',
        notes: 'Team member - Alpha tester'
      },
      {
        email: 'prashant@theingenuity.co',
        notes: 'Team member - Alpha tester'
      }
    ];

    for (const { email, notes } of initialEmails) {
      try {
        const existing = await this.getByEmail(email);
        if (!existing) {
          await this.addApprovedEmail(email, 'system', notes);
          console.log(`Added approved email: ${email}`);
        } else {
          console.log(`Email already exists: ${email}`);
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