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

  /**
   * Send password reset email following established service patterns
   * Business logic: Password reset email template generation and delivery
   */
  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${this.env.PUBLIC_URL}/reset-password?token=${token}`;
    
    const command = new SendEmailCommand({
      Source: `${this.env.EMAIL_FROM_NAME} <${this.env.EMAIL_FROM_ADDRESS}>`,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: 'Reset your Starship password' },
        Body: {
          Html: { Data: this.generatePasswordResetTemplate(resetUrl) },
          Text: { Data: this.generatePasswordResetTextTemplate(resetUrl) },
        },
      },
    });

    try {
      await this.sesClient.send(command);
      logger.info('[EmailService] Password reset email sent', { email });
    } catch (error) {
      logger.error('[EmailService] Failed to send password reset email', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        email 
      });
      throw new Error(`Failed to send password reset email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send email change verification email following established service patterns
   * Business logic: Email change verification template generation and delivery
   */
  async sendEmailChangeVerificationEmail(newEmail: string, token: string, oldEmail: string, displayName?: string): Promise<void> {
    const verificationUrl = `${this.env.PUBLIC_URL}/api/v1/auth/email/change/verify?token=${token}`;
    
    const command = new SendEmailCommand({
      Source: `${this.env.EMAIL_FROM_NAME} <${this.env.EMAIL_FROM_ADDRESS}>`,
      Destination: { ToAddresses: [newEmail] },
      Message: {
        Subject: { Data: 'Confirm your new email address' },
        Body: {
          Html: { Data: this.generateEmailChangeVerificationTemplate(verificationUrl, oldEmail, newEmail, displayName) },
          Text: { Data: this.generateEmailChangeVerificationTextTemplate(verificationUrl, oldEmail, newEmail, displayName) },
        },
      },
    });

    try {
      await this.sesClient.send(command);
      logger.info('[EmailService] Email change verification email sent', { newEmail, oldEmail });
    } catch (error) {
      logger.error('[EmailService] Failed to send email change verification email', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        newEmail,
        oldEmail
      });
      throw new Error(`Failed to send email change verification email: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  private generatePasswordResetTemplate(resetUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>Reset Your Starship Password</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a202c;">🔐 Password Reset Request</h1>
          </div>
          <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="margin-top: 0; color: #2d3748;">Reset Your Password</h2>
            <p>You requested to reset your password. Click the button below to create a new password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Reset Password
              </a>
            </div>
            <p style="font-size: 14px; color: #718096;">
              If the button doesn't work, copy and paste this link: <br>
              <a href="${resetUrl}">${resetUrl}</a>
            </p>
          </div>
          <div style="font-size: 12px; color: #a0aec0; text-align: center;">
            <p style="color: #e53e3e; font-weight: bold;">This reset link expires in 1 hour.</p>
            <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
          </div>
        </body>
      </html>
    `;
  }

  private generatePasswordResetTextTemplate(resetUrl: string): string {
    return `
      Password Reset Request
      
      You requested to reset your password. Click this link to create a new password:
      ${resetUrl}
      
      This link expires in 1 hour.
      
      If you didn't request a password reset, please ignore this email or contact support if you have concerns.
    `;
  }

  private generateEmailChangeVerificationTemplate(verificationUrl: string, oldEmail: string, newEmail: string, displayName?: string): string {
    const greeting = displayName ? `Hi ${displayName.split(' ')[0]},` : 'Hi there,';
    
    return `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>Confirm Your New Email Address</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
          <div style="background-color: #ffffff; padding: 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h1 style="color: #1a202c; font-size: 24px; margin: 0 0 24px 0; font-weight: 600;">${greeting}</h1>
            
            <p style="color: #2d3748; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
              We would like to confirm that you prefer using <strong style="color: #1a202c;">${newEmail}</strong> as your email for Starships.ai.
            </p>
            
            <p style="color: #2d3748; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
              If you do not wish to change your email address and continue using your current email address <strong style="color: #1a202c;">${oldEmail}</strong>, simply disregard this email.
            </p>
            
            <p style="color: #2d3748; font-size: 16px; line-height: 1.6; margin: 0 0 32px 0;">
              Until you confirm this change, you will need to use your current email address to login to Starships.ai.
            </p>
            
            <div style="text-align: center; margin: 32px 0;">
              <a href="${verificationUrl}" 
                 style="background-color: #4299e1; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px;">
                Change email
              </a>
            </div>
            
            <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
              <p style="color: #718096; font-size: 14px; line-height: 1.5; margin: 0 0 8px 0;">
                This link will be valid for the next 1 hour.
              </p>
              <p style="color: #718096; font-size: 14px; line-height: 1.5; margin: 0;">
                This is an automatically generated email—please do not reply to this email.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private generateEmailChangeVerificationTextTemplate(verificationUrl: string, oldEmail: string, newEmail: string, displayName?: string): string {
    const greeting = displayName ? `Hi ${displayName.split(' ')[0]},` : 'Hi there,';
    
    return `
      ${greeting}

      We would like to confirm that you prefer using ${newEmail} as your email for Starships.ai.

      If you do not wish to change your email address and continue using your current email address ${oldEmail}, simply disregard this email.

      Until you confirm this change, you will need to use your current email address to login to Starships.ai.

      Change email: ${verificationUrl}

      This link will be valid for the next 1 hour.
      This is an automatically generated email—please do not reply to this email.
    `;
  }
}