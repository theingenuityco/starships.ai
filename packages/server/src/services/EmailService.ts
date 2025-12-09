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
  private sesClient: SESClient | null;
  private env: ReturnType<typeof getEnvConfig>;
  private isConfigured: boolean;

  constructor() {
    // Follow exact UserService constructor pattern (no parameters)
    this.env = getEnvConfig();

    const hasEmailConfig = Boolean(this.env.EMAIL_FROM_ADDRESS && this.env.EMAIL_FROM_NAME && this.env.AWS_SES_REGION);

    if (!hasEmailConfig) {
      this.isConfigured = false;
      this.sesClient = null;
      logger.warn('[EmailService] Email configuration is incomplete; email sending is disabled.', {
        EMAIL_FROM_ADDRESS: this.env.EMAIL_FROM_ADDRESS,
        EMAIL_FROM_NAME: this.env.EMAIL_FROM_NAME,
        AWS_SES_REGION: this.env.AWS_SES_REGION,
      });
      return;
    }

    this.isConfigured = true;
    this.sesClient = new SESClient({
      region: this.env.AWS_SES_REGION as string,
    });
  }

  /**
   * Escape HTML special characters to prevent XSS attacks
   * Security: Prevents HTML injection in email templates
   */
  private escapeHtml(unsafe: string): string {
    return unsafe.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  /**
   * Send verification email following established service patterns
   * Business logic: Email template generation and delivery
   */
  async sendVerificationEmail(email: string, token: string, displayName?: string): Promise<void> {
    if (!this.isConfigured || !this.sesClient || !this.env.EMAIL_FROM_ADDRESS || !this.env.EMAIL_FROM_NAME || !this.env.AWS_SES_REGION) {
      logger.error('[EmailService] Attempted to send verification email but configuration is missing.', {
        EMAIL_FROM_ADDRESS: this.env.EMAIL_FROM_ADDRESS,
        EMAIL_FROM_NAME: this.env.EMAIL_FROM_NAME,
        AWS_SES_REGION: this.env.AWS_SES_REGION,
      });
      throw new Error('Email service is not configured. Please set EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME, and AWS_SES_REGION.');
    }

    const verificationUrl = `${this.env.PUBLIC_URL}/api/v1/auth/verify-email?token=${token}`;

    const command = new SendEmailCommand({
      Source: `${this.env.EMAIL_FROM_NAME} <${this.env.EMAIL_FROM_ADDRESS}>`,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: 'Verify your Starship account' },
        Body: {
          Html: { Data: this.generateEmailTemplate(verificationUrl, displayName) },
          Text: { Data: this.generateTextTemplate(verificationUrl, displayName) },
        },
      },
    });

    try {
      await this.sesClient.send(command);
      logger.info('[EmailService] Verification email sent', { email });
    } catch (error) {
      logger.error('[EmailService] Failed to send verification email', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email,
      });
      throw new Error(`Failed to send verification email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send password reset email following established service patterns
   * Business logic: Password reset email template generation and delivery
   */
  async sendPasswordResetEmail(email: string, token: string, displayName?: string): Promise<void> {
    if (!this.isConfigured || !this.sesClient || !this.env.EMAIL_FROM_ADDRESS || !this.env.EMAIL_FROM_NAME || !this.env.AWS_SES_REGION) {
      logger.error('[EmailService] Attempted to send password reset email but configuration is missing.', {
        EMAIL_FROM_ADDRESS: this.env.EMAIL_FROM_ADDRESS,
        EMAIL_FROM_NAME: this.env.EMAIL_FROM_NAME,
        AWS_SES_REGION: this.env.AWS_SES_REGION,
      });
      throw new Error('Email service is not configured. Please set EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME, and AWS_SES_REGION.');
    }

    const resetUrl = `${this.env.PUBLIC_URL}/reset-password?token=${token}`;

    const command = new SendEmailCommand({
      Source: `${this.env.EMAIL_FROM_NAME} <${this.env.EMAIL_FROM_ADDRESS}>`,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: 'Reset your Starship password' },
        Body: {
          Html: { Data: this.generatePasswordResetTemplate(resetUrl, displayName) },
          Text: { Data: this.generatePasswordResetTextTemplate(resetUrl, displayName) },
        },
      },
    });

    try {
      await this.sesClient.send(command);
      logger.info('[EmailService] Password reset email sent', { email });
    } catch (error) {
      logger.error('[EmailService] Failed to send password reset email', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email,
      });
      throw new Error(`Failed to send password reset email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send email change verification email following established service patterns
   * Business logic: Email change verification template generation and delivery
   */
  async sendEmailChangeVerificationEmail(newEmail: string, token: string, oldEmail: string, displayName?: string): Promise<void> {
    if (!this.isConfigured || !this.sesClient || !this.env.EMAIL_FROM_ADDRESS || !this.env.EMAIL_FROM_NAME || !this.env.AWS_SES_REGION) {
      logger.error('[EmailService] Attempted to send email change verification email but configuration is missing.', {
        EMAIL_FROM_ADDRESS: this.env.EMAIL_FROM_ADDRESS,
        EMAIL_FROM_NAME: this.env.EMAIL_FROM_NAME,
        AWS_SES_REGION: this.env.AWS_SES_REGION,
      });
      throw new Error('Email service is not configured. Please set EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME, and AWS_SES_REGION.');
    }

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
        oldEmail,
      });
      throw new Error(`Failed to send email change verification email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private generateEmailTemplate(verificationUrl: string, displayName?: string): string {
    // Security: Escape HTML to prevent XSS attacks
    const safeDisplayName = displayName && displayName.trim() ? this.escapeHtml(displayName.trim().split(' ')[0]) : null;
    const greeting = safeDisplayName ? `Hi ${safeDisplayName},` : 'Hi there,';

    return `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>Verify Your Starship Account</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a202c;">🚀 Welcome to Starships.ai!</h1>
          </div>
          <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="margin-top: 0; color: #2d3748;">${greeting}</h2>
            <h3 style="margin-top: 16px; margin-bottom: 16px; color: #2d3748;">Verify Your Email Address</h3>
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
          <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
            <p style="font-size: 12px; color: #a0aec0; text-align: center; margin: 0 0 8px 0;">
              This verification link expires in 24 hours.
            </p>
            <p style="font-size: 12px; color: #a0aec0; text-align: center; margin: 0;">
              If you didn't create an account with Starships.ai, you can safely ignore this email.
            </p>
            <p style="font-size: 12px; color: #a0aec0; text-align: center; margin: 8px 0 0 0;">
              This is an automatically generated email—please do not reply to this email.
            </p>
          </div>
        </body>
      </html>
    `;
  }

  private generateTextTemplate(verificationUrl: string, displayName?: string): string {
    const greeting = displayName ? `Hi ${displayName.split(' ')[0]},` : 'Hi there,';

    return `
      Welcome to Starships.ai!
      
      ${greeting}
      
      Please verify your email address by clicking this link:
      ${verificationUrl}
      
      This link expires in 24 hours.
      
      This is an automatically generated email—please do not reply to this email.
    `;
  }

  private generatePasswordResetTemplate(resetUrl: string, displayName?: string): string {
    // Security: Escape HTML to prevent XSS attacks
    const safeDisplayName = displayName && displayName.trim() ? this.escapeHtml(displayName.trim().split(' ')[0]) : null;
    const greeting = safeDisplayName ? `Hi ${safeDisplayName},` : 'Hi there,';

    return `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>Reset Your Starship Password</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a202c;">🔐 Password Reset Request</h1>
          </div>
          <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="margin-top: 0; color: #2d3748;">${greeting}</h2>
            <h3 style="margin-top: 16px; margin-bottom: 16px; color: #2d3748;">Reset Your Password</h3>
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
          <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
            <p style="font-size: 12px; color: #a0aec0; text-align: center; margin: 0 0 8px 0;">
              This reset link expires in 1 hour.
            </p>
            <p style="font-size: 12px; color: #a0aec0; text-align: center; margin: 0 0 8px 0;">
              If you didn't request a password reset, please ignore this email or contact support if you have concerns.
            </p>
            <p style="font-size: 12px; color: #a0aec0; text-align: center; margin: 0;">
              This is an automatically generated email—please do not reply to this email.
            </p>
          </div>
        </body>
      </html>
    `;
  }

  private generatePasswordResetTextTemplate(resetUrl: string, displayName?: string): string {
    const greeting = displayName ? `Hi ${displayName.split(' ')[0]},` : 'Hi there,';

    return `
      Password Reset Request
      
      ${greeting}
      
      You requested to reset your password. Click this link to create a new password:
      ${resetUrl}
      
      This link expires in 1 hour.
      
      This is an automatically generated email—please do not reply to this email.
    `;
  }

  private generateEmailChangeVerificationTemplate(
    verificationUrl: string,
    oldEmail: string,
    newEmail: string,
    displayName?: string
  ): string {
    // Security: Escape HTML to prevent XSS attacks
    const safeDisplayName = displayName && displayName.trim() ? this.escapeHtml(displayName.trim().split(' ')[0]) : null;
    const greeting = safeDisplayName ? `Hi ${safeDisplayName},` : 'Hi there,';
    const safeOldEmail = this.escapeHtml(oldEmail);
    const safeNewEmail = this.escapeHtml(newEmail);

    return `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>Confirm Your New Email Address</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a202c;">🔐 Email Change Request</h1>
          </div>
          <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="margin-top: 0; color: #2d3748;">${greeting}</h2>
            <h3 style="margin-top: 16px; margin-bottom: 16px; color: #2d3748;">Confirm Your Email Change</h3>
            <p>We would like to confirm that you prefer using <strong>${safeNewEmail}</strong> as your email for Starships.ai.</p>
            <p>If you do not wish to change your email address and continue using your current email address <strong>${safeOldEmail}</strong>, simply disregard this email.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" 
                 style="background: #4299e1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Change Email
              </a>
            </div>
            <p style="font-size: 14px; color: #718096;">
              If the button doesn't work, copy and paste this link: <br>
              <a href="${verificationUrl}">${verificationUrl}</a>
            </p>
          </div>
          <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
            <p style="font-size: 12px; color: #a0aec0; text-align: center; margin: 0 0 8px 0;">
              This link expires in 1 hour.
            </p>
            <p style="font-size: 12px; color: #a0aec0; text-align: center; margin: 0 0 8px 0;">
              If you didn't request this email change, please ignore this email or contact support if you have concerns.
            </p>
            <p style="font-size: 12px; color: #a0aec0; text-align: center; margin: 0;">
              This is an automatically generated email—please do not reply to this email.
            </p>
          </div>
        </body>
      </html>
    `;
  }

  private generateEmailChangeVerificationTextTemplate(
    verificationUrl: string,
    oldEmail: string,
    newEmail: string,
    displayName?: string
  ): string {
    // Security: Escape HTML to prevent XSS attacks (text template, but still safe to escape)
    const safeDisplayName = displayName && displayName.trim() ? displayName.trim().split(' ')[0] : null;
    const greeting = safeDisplayName ? `Hi ${safeDisplayName},` : 'Hi there,';

    return `
      Confirm Your New Email Address

      ${greeting}

      You requested to change your email address from ${oldEmail} to ${newEmail}.
      Click this link to confirm the change:
      ${verificationUrl}

      This link expires in 1 hour.

      This is an automatically generated email—please do not reply to this email.
    `;
  }
}
