import crypto from 'crypto';
import { mailerService } from './mailer.service.js';
import logger from '../utils/logger.js';

class OtpService {
  constructor() {
    // Map of normalized email -> OTP state
    this.otpStore = new Map();

    // Clean expired entries every 5 minutes
    setInterval(() => this.cleanupExpired(), 5 * 60 * 1000);
  }

  normalizeEmail(email) {
    return email ? email.trim().toLowerCase() : '';
  }

  cleanupExpired() {
    const now = Date.now();
    for (const [key, value] of this.otpStore.entries()) {
      if (now > value.expiresAt) {
        this.otpStore.delete(key);
      }
    }
  }

  /**
   * Generates and dispatches a 6-digit OTP code to the requested email
   */
  async sendOtp({ email, name, purpose = 'Account Registration' }) {
    const cleanEmail = this.normalizeEmail(email);
    if (!cleanEmail || !cleanEmail.includes('@')) {
      const error = new Error('Valid email address is required');
      error.statusCode = 400;
      throw error;
    }

    const now = Date.now();
    const existing = this.otpStore.get(cleanEmail);

    // Throttle: don't allow resending within 30 seconds
    if (existing && now - existing.createdAt < 30 * 1000) {
      const waitSec = Math.ceil((30 * 1000 - (now - existing.createdAt)) / 1000);
      const error = new Error(`Please wait ${waitSec} seconds before requesting a new verification code.`);
      error.statusCode = 429;
      throw error;
    }

    // Generate secure 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = now + 10 * 60 * 1000; // 10 minutes

    this.otpStore.set(cleanEmail, {
      otp,
      email: cleanEmail,
      purpose,
      recipientName: name || 'Enterprise Partner',
      expiresAt,
      attempts: 0,
      createdAt: now,
      verified: false,
    });

    logger.info(`Generated OTP for ${cleanEmail} (Purpose: ${purpose})`);

    // Dispatch via SMTP mailer
    const mailResult = await mailerService.sendOtpEmail({
      toEmail: cleanEmail,
      otp,
      recipientName: name || 'Enterprise Partner',
      purpose,
    });

    return {
      success: true,
      email: cleanEmail,
      expiresInSeconds: 600,
      simulated: mailResult.simulated,
      message: `A 6-digit verification code has been dispatched to ${cleanEmail}. Valid for 10 minutes.`,
    };
  }

  /**
   * Verifies the user-submitted OTP code
   */
  verifyOtp({ email, otp, purpose = 'Account Registration' }) {
    const cleanEmail = this.normalizeEmail(email);
    const cleanOtp = otp ? otp.toString().trim() : '';

    if (!cleanEmail || !cleanOtp) {
      const error = new Error('Email and verification code are required');
      error.statusCode = 400;
      throw error;
    }

    const record = this.otpStore.get(cleanEmail);

    if (!record) {
      const error = new Error('No active verification code found for this email. Please request a new code.');
      error.statusCode = 400;
      throw error;
    }

    if (Date.now() > record.expiresAt) {
      this.otpStore.delete(cleanEmail);
      const error = new Error('Verification code has expired. Please request a new code.');
      error.statusCode = 400;
      throw error;
    }

    if (record.attempts >= 5) {
      this.otpStore.delete(cleanEmail);
      const error = new Error('Too many incorrect verification attempts. Please request a new code.');
      error.statusCode = 429;
      throw error;
    }

    if (record.otp !== cleanOtp) {
      record.attempts += 1;
      const remainingAttempts = 5 - record.attempts;
      const error = new Error(`Incorrect verification code. ${remainingAttempts} attempts remaining.`);
      error.statusCode = 400;
      throw error;
    }

    // Mark as verified so registration can proceed
    record.verified = true;
    logger.info(`OTP successfully verified for ${cleanEmail}`);
    return true;
  }

  /**
   * Consumes and clears the verified OTP status upon successful registration
   */
  consumeOtp(email) {
    const cleanEmail = this.normalizeEmail(email);
    this.otpStore.delete(cleanEmail);
  }

  /**
   * Checks if email has already been verified
   */
  isVerified(email) {
    const cleanEmail = this.normalizeEmail(email);
    const record = this.otpStore.get(cleanEmail);
    return !!(record && record.verified && Date.now() <= record.expiresAt);
  }
}

export const otpService = new OtpService();

