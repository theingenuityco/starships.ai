/**
 * Email Service - AWS SES email delivery service
 * 
 * Follows the established service patterns for email verification and notification delivery.
 * Uses AWS SES for reliable email delivery with professional templates.
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { getEnvConfig } from '@starships/env';
import { logger } from '@/utils/logger';

export class EmailService {
  private sesClient: SESClient;
  private env: ReturnType<typeof getEnvConfig>;

  constructor() {
    // Follow exact UserService constructor pattern (no parameters)
    this.env = getEnvConfig();
    this.sesClient = new SESClient({
      region: this.env.AWS_SES_REGION,
    });
  }

  /**
   * Send verification email following established service patterns
   * Business logic: Email template generation and delivery
   */
  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const verificationUrl = `${this.env.PUBLIC_URL}/api/v1/auth/verify-email?token=${token}`;

    const command = new SendEmailCommand({
      Source: `${this.env.EMAIL_FROM_NAME} <${this.env.EMAIL_FROM_ADDRESS}>`,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: 'Verify your Starship account' },
        Body: {
          Html: { Data: this.generateEmailTemplate(verificationUrl) },
          Text: { Data: this.generateTextTemplate(verificationUrl) },
        },
      },
    });

    try {
      await this.sesClient.send(command);
      logger.info('[EmailService] Verification email sent', { email });
    } catch (error) {
      logger.error('[EmailService] Failed to send verification email', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        email 
      });
      throw new Error(`Failed to send verification email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private generateEmailTemplate(verificationUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>Verify Your Starship Account</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a202c;">🚀 Welcome to Starships.ai!</h1>
          </div>
          <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="margin-top: 0; color: #2d3748;">Verify Your Email Address</h2>
            <p>Thanks for signing up! Please click the button below to verify your email address and create your starship:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" 
                 style="background: #4299e1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Verify Email
              </a>
            </div>
            <p style="font-size: 14px; color: #718096;">
              If the button doesn't work, copy and paste this link: <br>
              <a href="${verificationUrl}">${verificationUrl}</a>
            </p>
          </div>
          <div style="font-size: 12px; color: #a0aec0; text-align: center;">
            <p>This verification link expires in 24 hours.</p>
            <p>If you didn't create an account with Starships.ai, you can safely ignore this email.</p>
          </div>
        </body>
      </html>
    `;
  }

  private generateTextTemplate(verificationUrl: string): string {
    return `
      Welcome to Starships.ai!
      
      Please verify your email address by clicking this link:
      ${verificationUrl}
      
      This link expires in 24 hours.
      
      If you didn't create an account with Starships.ai, you can safely ignore this email.
    `;
  }
}