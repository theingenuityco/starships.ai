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
  async sendEmailChangeVerificationEmail(newEmail: string, token: string, oldEmail: string): Promise<void> {
    const verificationUrl = `${this.env.PUBLIC_URL}/api/v1/auth/email/change/verify?token=${token}`;
    
    const command = new SendEmailCommand({
      Source: `${this.env.EMAIL_FROM_NAME} <${this.env.EMAIL_FROM_ADDRESS}>`,
      Destination: { ToAddresses: [newEmail] },
      Message: {
        Subject: { Data: 'Confirm your new email address' },
        Body: {
          Html: { Data: this.generateEmailChangeVerificationTemplate(verificationUrl, oldEmail, newEmail) },
          Text: { Data: this.generateEmailChangeVerificationTextTemplate(verificationUrl, oldEmail, newEmail) },
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

  private generateEmailChangeVerificationTemplate(verificationUrl: string, oldEmail: string, newEmail: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>Confirm Your New Email Address</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a202c;">🔐 Email Change Request</h1>
          </div>
          <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="margin-top: 0; color: #2d3748;">Confirm Your Email Change</h2>
            <p>You requested to change your email address from <strong>${oldEmail}</strong> to <strong>${newEmail}</strong>.</p>
            <p>Click the button below to confirm this change:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" 
                 style="background: #4299e1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Confirm Email Change
              </a>
            </div>
            <p style="font-size: 14px; color: #718096;">
              If the button doesn't work, copy and paste this link: <br>
              <a href="${verificationUrl}">${verificationUrl}</a>
            </p>
          </div>
          <div style="font-size: 12px; color: #a0aec0; text-align: center;">
            <p style="color: #e53e3e; font-weight: bold;">This link expires in 1 hour.</p>
            <p>If you didn't request this email change, please ignore this email or contact support if you have concerns.</p>
          </div>
        </body>
      </html>
    `;
  }

  private generateEmailChangeVerificationTextTemplate(verificationUrl: string, oldEmail: string, newEmail: string): string {
    return `
      Confirm Your New Email Address
      
      You requested to change your email address from ${oldEmail} to ${newEmail}.
      Click this link to confirm the change:
      ${verificationUrl}
      
      This link expires in 1 hour.
      
      If you didn't request this email change, please ignore this email or contact support if you have concerns.
    `;
  }
}