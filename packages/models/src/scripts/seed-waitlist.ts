/**
 * Seed Waitlist Entries
 * Automatically adds approved emails to the waitlist on server startup
 */

import { getConnection } from '../helpers/database';
import { WaitlistRepository } from '../repositories/WaitlistRepository';
import { logger } from '../helpers/logging';

// List of approved emails - add new testers here
const APPROVED_EMAILS = [
  { email: 'dewang@theingenuity.co', notes: 'Founder - Primary tester' },
  { email: 'rudra@theingenuity.co', notes: 'Team member - Alpha tester' },
  { email: 'prashant@theingenuity.co', notes: 'Team member - Alpha tester' },
  { email: 'dewangsolanki3@gmail.com', notes: 'Personal - Testing account' },
  // Add new approved emails here as needed
];

/**
 * Seeds the waitlist with approved emails
 * This runs on every server startup to ensure approved emails persist
 */
export async function seedWaitlist(): Promise<void> {
  try {
    logger.info('Starting waitlist seeding...');
    
    // Get the existing connection that was initialized by the server
    const connection = getConnection();
    
    // Create the waitlist repository
    const waitlistRepo = new WaitlistRepository(connection);
    
    // Initialize schema using the repository's method
    await waitlistRepo.initializeSchema();
    
    logger.info('Seeding waitlist with approved emails...');
    
    let addedCount = 0;
    let existingCount = 0;
    let errorCount = 0;
    
    for (const { email, notes } of APPROVED_EMAILS) {
      try {
        // Check if email already exists
        const existing = await waitlistRepo.getByEmail(email);
        
        if (existing) {
          existingCount++;
          logger.debug(`Waitlist: Email already exists: ${email} (status: ${existing.status})`);
        } else {
          // Add the email
          await waitlistRepo.addApprovedEmail(email, 'system', notes);
          addedCount++;
          logger.info(`Waitlist: Added approved email: ${email}`);
        }
      } catch (error) {
        errorCount++;
        logger.warn(`Waitlist: Error processing ${email}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    logger.info(`✅ Waitlist seeding completed: ${addedCount} new, ${existingCount} existing, ${errorCount} errors`);
    
    // Log current approved count
    try {
      const approvedCount = await waitlistRepo.getApprovedCount();
      logger.info(`Total approved waitlist emails: ${approvedCount}`);
    } catch (error) {
      logger.warn('Could not get approved count', { 
        error: { message: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
    
  } catch (error) {
    logger.error(`Failed to seed waitlist: ${error instanceof Error ? error.message : 'Unknown error'}`);
    if (error instanceof Error) {
      logger.error('Waitlist seeding error details', { 
        stack: error.stack || 'No stack trace available' 
      });
    }
    // Don't throw - we don't want to prevent server startup if waitlist seeding fails
  }
}

// Allow running as standalone script
if (require.main === module) {
  seedWaitlist()
    .then(() => {
      console.log('✅ Waitlist seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed to seed waitlist:', error);
      process.exit(1);
    });
}